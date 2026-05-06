import * as fs from 'fs';
import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { ContractService } from '../blockchain/contract.service';
import { RedisService } from '../redis/redis.service';

export interface KeyVaultPublicKey {
  keyType: string;
  publicKey: string;
  address: string;
  derivationPath: string;
  chainScope: string;
  isActive: boolean;
}

interface KeyVaultResponse {
  success: boolean;
  clientId: number;
  keys?: KeyVaultPublicKey[];
  key?: KeyVaultPublicKey;
}

/**
 * Manages wallet lifecycle:
 * - Calls Key Vault to generate/retrieve keys
 * - Creates hot wallet + gas tank per client per chain
 * - Deploys CvhWalletSimple via factory (or computes CREATE2 address)
 */
@Injectable()
export class WalletService implements OnModuleInit {
  private readonly logger = new Logger(WalletService.name);
  private readonly keyVaultUrl: string;
  private readonly tlsEnabled: boolean;
  private httpsAgent: import('https').Agent | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly contractService: ContractService,
    private readonly redis: RedisService,
  ) {
    this.tlsEnabled =
      this.config.get<string>('VAULT_TLS_ENABLED', 'false') === 'true';

    // Resolve Key Vault URL — auto-upgrade to https:// when mTLS is enabled
    let vaultUrl = this.config.get<string>(
      'KEY_VAULT_URL',
      'http://localhost:3005',
    );
    if (this.tlsEnabled && vaultUrl.startsWith('http://')) {
      vaultUrl = vaultUrl.replace('http://', 'https://');
    }
    this.keyVaultUrl = vaultUrl;
  }

  async onModuleInit(): Promise<void> {
    if (!this.tlsEnabled) {
      this.logger.warn(
        'VAULT_TLS_ENABLED is not set — Key Vault calls use plain HTTP',
      );
      return;
    }

    const certPath = this.config.get<string>('VAULT_CLIENT_CERT_PATH');
    const keyPath = this.config.get<string>('VAULT_CLIENT_KEY_PATH');
    const caPath = this.config.get<string>('VAULT_TLS_CA_PATH');

    if (!certPath || !keyPath || !caPath) {
      throw new Error(
        'VAULT_TLS_ENABLED=true but missing required env vars: ' +
          'VAULT_CLIENT_CERT_PATH, VAULT_CLIENT_KEY_PATH, VAULT_TLS_CA_PATH',
      );
    }

    this.logger.log('mTLS enabled — loading client certificates for Key Vault...');
    this.logger.log(`  Client cert: ${certPath}`);
    this.logger.log(`  Client key:  ${keyPath}`);
    this.logger.log(`  CA cert:     ${caPath}`);

    // Create an https.Agent with mTLS client certificates.
    // Used by axios for all Key Vault HTTP calls when TLS is enabled.
    const https = await import('https');
    this.httpsAgent = new https.Agent({
      cert: fs.readFileSync(certPath, 'utf-8'),
      key: fs.readFileSync(keyPath, 'utf-8'),
      ca: fs.readFileSync(caPath, 'utf-8'),
      rejectUnauthorized: true,
    });

    this.logger.log('mTLS client certificates loaded for Key Vault communication');
  }

  /**
   * Create hot wallet + gas tank for a client on a specific chain.
   * 1. Ensure client keys exist in Key Vault (or request generation)
   * 2. Derive gas tank key for this chain
   * 3. Compute wallet address via factory CREATE2
   * 4. Save wallet records
   */
  async createWallets(
    clientId: number,
    chainId: number,
  ): Promise<{
    hotWallet: { address: string; walletType: string };
    gasTank: { address: string; walletType: string };
  }> {
    // Check if wallets already exist
    const existing = await this.prisma.wallet.findMany({
      where: {
        clientId: BigInt(clientId),
        chainId,
      },
    });
    if (existing.length > 0) {
      throw new ConflictException(
        `Wallets already exist for client ${clientId} on chain ${chainId}`,
      );
    }

    // Verify chain is configured
    const chain = await this.prisma.chain.findUnique({
      where: { id: chainId },
    });
    if (!chain || !chain.isActive) {
      throw new NotFoundException(`Chain ${chainId} not found or not active`);
    }
    if (!chain.walletFactoryAddress) {
      throw new BadRequestException(
        `WalletFactory not configured for chain ${chainId}`,
      );
    }

    // Step 1: Get or generate client keys from Key Vault
    let keys: KeyVaultPublicKey[];
    try {
      keys = await this.getKeysFromVault(clientId);
    } catch {
      // Keys don't exist yet — generate them
      keys = await this.generateKeysInVault(clientId);
    }

    const platformKey = keys.find((k) => k.keyType === 'platform');
    const clientKey = keys.find((k) => k.keyType === 'client');
    const backupKey = keys.find((k) => k.keyType === 'backup');

    if (!platformKey || !clientKey || !backupKey) {
      throw new Error(
        `Missing required key types for client ${clientId}`,
      );
    }

    // Step 2: Derive gas tank key for this chain
    const gasTankKey = await this.deriveGasTankKey(clientId, chainId);

    // Step 3: Compute the CvhWalletSimple address via factory
    // The 3 signers are: platform, client, backup
    const signers = [
      platformKey.address,
      clientKey.address,
      backupKey.address,
    ];

    const walletSalt = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'string'],
        [clientId, chainId, 'hot_wallet'],
      ),
    );

    const hotWalletAddress = await this.contractService.computeWalletAddress(
      chainId,
      signers,
      walletSalt,
    );

    // Step 4: Resolve default project for this client
    const defaultProjectRows = await this.prisma.$queryRaw<
      Array<{ id: bigint }>
    >`SELECT id FROM cvh_admin.projects WHERE client_id = ${BigInt(clientId)} AND is_default = 1 LIMIT 1`;
    const defaultProjectId = defaultProjectRows[0]?.id ?? BigInt(0);

    // Step 5: Save wallet records
    await this.prisma.wallet.create({
      data: {
        clientId: BigInt(clientId),
        projectId: defaultProjectId,
        chainId,
        address: hotWalletAddress,
        walletType: 'hot',
      },
    });

    await this.prisma.wallet.create({
      data: {
        clientId: BigInt(clientId),
        projectId: defaultProjectId,
        chainId,
        address: gasTankKey.address,
        walletType: 'gas_tank',
      },
    });

    // Seed default alert config for the new gas tank (idempotent via INSERT IGNORE)
    const DEFAULT_THRESHOLD_WEI = '1000000000000000'; // 0.001 ETH in wei
    await this.prisma.$executeRaw`
      INSERT IGNORE INTO cvh_wallets.gas_tank_alert_config
        (project_id, chain_id, threshold_wei, email_enabled, webhook_enabled)
      VALUES (${defaultProjectId}, ${chainId}, ${DEFAULT_THRESHOLD_WEI}, 0, 1)
    `;
    this.logger.log(
      `Gas tank alert config seeded for project ${defaultProjectId}, chain ${chainId}`,
    );

    // Publish to address:registered stream for chain-indexer monitoring
    try {
      await this.publishAddressRegistered(chainId, hotWalletAddress, clientId, defaultProjectId, 'hot');
      await this.publishAddressRegistered(chainId, gasTankKey.address, clientId, defaultProjectId, 'gas_tank');
    } catch (err) {
      this.logger.warn(`Failed to publish address:registered events: ${err}`);
    }

    this.logger.log(
      `Wallets created for client ${clientId} on chain ${chainId}: hot=${hotWalletAddress}, gas_tank=${gasTankKey.address}`,
    );

    return {
      hotWallet: {
        address: hotWalletAddress,
        walletType: 'hot',
      },
      gasTank: {
        address: gasTankKey.address,
        walletType: 'gas_tank',
      },
    };
  }

  /**
   * List all wallets for a client.
   */
  async listWallets(clientId: number) {
    return this.prisma.wallet.findMany({
      where: { clientId: BigInt(clientId) },
      orderBy: [{ chainId: 'asc' }, { walletType: 'asc' }],
    });
  }

  /**
   * Get a specific wallet.
   */
  async getWallet(clientId: number, chainId: number, walletType: string) {
    return this.prisma.wallet.findUnique({
      where: {
        uq_client_chain_type: {
          clientId: BigInt(clientId),
          chainId,
          walletType,
        },
      },
    });
  }

  /**
   * Register a wallet record directly (used by client-api after project key ceremony).
   * Skips the full createWallets flow — just saves the wallet record.
   */
  async registerWallet(
    clientId: number,
    projectId: number,
    chainId: number,
    address: string,
    walletType: string,
  ) {
    // Check if wallet already exists (idempotent)
    const existing = await this.prisma.wallet.findFirst({
      where: {
        clientId: BigInt(clientId),
        chainId,
        walletType,
        projectId: BigInt(projectId),
      },
    });
    if (existing) {
      this.logger.log(
        `Wallet already registered: client=${clientId} chain=${chainId} type=${walletType}`,
      );
      return {
        id: Number(existing.id),
        address: existing.address,
        walletType: existing.walletType,
        chainId: existing.chainId,
        isActive: existing.isActive,
      };
    }

    const wallet = await this.prisma.wallet.create({
      data: {
        clientId: BigInt(clientId),
        projectId: BigInt(projectId),
        chainId,
        address,
        walletType,
      },
    });

    // Seed default alert config when registering a gas tank wallet (idempotent via INSERT IGNORE)
    if (walletType === 'gas_tank') {
      const DEFAULT_THRESHOLD_WEI = '1000000000000000'; // 0.001 ETH in wei
      const projectIdBig = BigInt(projectId);
      await this.prisma.$executeRaw`
        INSERT IGNORE INTO cvh_wallets.gas_tank_alert_config
          (project_id, chain_id, threshold_wei, email_enabled, webhook_enabled)
        VALUES (${projectIdBig}, ${chainId}, ${DEFAULT_THRESHOLD_WEI}, 0, 1)
      `;
      this.logger.log(
        `Gas tank alert config seeded for project ${projectId}, chain ${chainId}`,
      );
    }

    // Publish to address:registered stream for chain-indexer monitoring
    try {
      await this.publishAddressRegistered(chainId, address, clientId, BigInt(projectId), walletType);
    } catch (err) {
      this.logger.warn(`Failed to publish address:registered event: ${err}`);
    }

    this.logger.log(
      `Wallet registered: client=${clientId} project=${projectId} chain=${chainId} type=${walletType} address=${address}`,
    );

    return {
      id: Number(wallet.id),
      address: wallet.address,
      walletType: wallet.walletType,
      chainId: wallet.chainId,
      isActive: wallet.isActive,
    };
  }

  // ----------- Redis Stream Helpers -----------

  private async publishAddressRegistered(
    chainId: number,
    address: string,
    clientId: number,
    projectId: bigint | number,
    walletType: string,
  ): Promise<void> {
    await this.redis.publishToStream('address:registered', {
      chainId: String(chainId),
      address,
      clientId: String(clientId),
      projectId: String(projectId),
      walletId: '0',
      addressType: walletType,
    });
  }

  // ----------- Key Vault HTTP Calls -----------

  /**
   * Build axios config, injecting the mTLS httpsAgent when TLS is enabled.
   */
  private get vaultAxiosConfig(): Record<string, any> {
    const config: Record<string, any> = {
      headers: { 'X-Internal-Service-Key': this.config.get<string>('INTERNAL_SERVICE_KEY', '') },
      timeout: 30000,
    };
    if (this.httpsAgent) {
      config.httpsAgent = this.httpsAgent;
    }
    return config;
  }

  private async getKeysFromVault(
    clientId: number,
  ): Promise<KeyVaultPublicKey[]> {
    const { data } = await axios.get<KeyVaultResponse>(
      `${this.keyVaultUrl}/keys/${clientId}/public`,
      this.vaultAxiosConfig,
    );
    return data.keys ?? [];
  }

  async generateKeysInVault(
    clientId: number,
  ): Promise<KeyVaultPublicKey[]> {
    const { data } = await axios.post<KeyVaultResponse>(
      `${this.keyVaultUrl}/keys/generate`,
      { clientId, requestedBy: 'core-wallet-service' },
      this.vaultAxiosConfig,
    );
    return data.keys ?? [];
  }

  private async deriveGasTankKey(
    clientId: number,
    chainId: number,
  ): Promise<KeyVaultPublicKey> {
    const { data } = await axios.post<KeyVaultResponse>(
      `${this.keyVaultUrl}/keys/derive-gas-tank`,
      { clientId, chainId, requestedBy: 'core-wallet-service' },
      this.vaultAxiosConfig,
    );
    return data.key!;
  }
}
