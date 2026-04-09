import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { ContractService } from '../blockchain/contract.service';

interface KeyVaultPublicKey {
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
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private readonly keyVaultUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly contractService: ContractService,
  ) {
    this.keyVaultUrl = this.config.get<string>(
      'KEY_VAULT_URL',
      'http://localhost:3005',
    );
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

    // Step 4: Save wallet records
    await this.prisma.wallet.create({
      data: {
        clientId: BigInt(clientId),
        chainId,
        address: hotWalletAddress,
        walletType: 'hot',
      },
    });

    await this.prisma.wallet.create({
      data: {
        clientId: BigInt(clientId),
        chainId,
        address: gasTankKey.address,
        walletType: 'gas_tank',
      },
    });

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

  // ----------- Key Vault HTTP Calls -----------

  private async getKeysFromVault(
    clientId: number,
  ): Promise<KeyVaultPublicKey[]> {
    const res = await fetch(
      `${this.keyVaultUrl}/keys/${clientId}/public`,
      {
        headers: {
          'X-Internal-Service-Key':
            this.config.get<string>('INTERNAL_SERVICE_KEY', ''),
        },
      },
    );
    if (!res.ok) {
      throw new Error(`Key Vault returned ${res.status}`);
    }
    const body: KeyVaultResponse = await res.json();
    return body.keys ?? [];
  }

  private async generateKeysInVault(
    clientId: number,
  ): Promise<KeyVaultPublicKey[]> {
    const res = await fetch(`${this.keyVaultUrl}/keys/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service-Key':
          this.config.get<string>('INTERNAL_SERVICE_KEY', ''),
      },
      body: JSON.stringify({
        clientId,
        requestedBy: 'core-wallet-service',
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Key Vault key generation failed: ${res.status}`,
      );
    }
    const body: KeyVaultResponse = await res.json();
    return body.keys ?? [];
  }

  private async deriveGasTankKey(
    clientId: number,
    chainId: number,
  ): Promise<KeyVaultPublicKey> {
    const res = await fetch(
      `${this.keyVaultUrl}/keys/derive-gas-tank`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service-Key':
            this.config.get<string>('INTERNAL_SERVICE_KEY', ''),
        },
        body: JSON.stringify({
          clientId,
          chainId,
          requestedBy: 'core-wallet-service',
        }),
      },
    );
    if (!res.ok) {
      throw new Error(
        `Key Vault gas tank derivation failed: ${res.status}`,
      );
    }
    const body: KeyVaultResponse = await res.json();
    return body.key!;
  }
}
