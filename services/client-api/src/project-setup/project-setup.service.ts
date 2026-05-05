import {
  Injectable,
  Logger,
  HttpException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AdminDatabaseService } from '../prisma/admin-database.service';

// ---- Row interfaces --------------------------------------------------------

interface ProjectRow {
  id: number;
  client_id: number;
  name: string;
  slug: string;
  description: string | null;
  is_default: number;
  status: string;
  settings: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ProjectChainRow {
  id: number;
  project_id: number;
  chain_id: number;
  deploy_status: string;
  deploy_started_at: Date | null;
  deploy_completed_at: Date | null;
  deploy_error: string | null;
  wallet_factory_address: string | null;
  forwarder_factory_address: string | null;
  wallet_impl_address: string | null;
  forwarder_impl_address: string | null;
  hot_wallet_address: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ChainRow {
  chain_id: number;
  name: string;
  short_name: string;
  native_currency_symbol: string;
  native_currency_decimals: number;
  rpc_endpoints: string | object;
  is_active: number;
}

interface InsertResult {
  insertId: number;
}

// ---- Service ---------------------------------------------------------------

@Injectable()
export class ProjectSetupService {
  private readonly logger = new Logger(ProjectSetupService.name);
  private readonly keyVaultUrl: string;
  private readonly coreWalletUrl: string;
  private readonly notificationUrl: string;
  private readonly authServiceUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly adminDb: AdminDatabaseService,
  ) {
    this.keyVaultUrl = this.configService.get<string>(
      'KEY_VAULT_SERVICE_URL',
      'http://localhost:3005',
    );
    this.coreWalletUrl = this.configService.get<string>(
      'CORE_WALLET_SERVICE_URL',
      'http://localhost:3004',
    );
    this.notificationUrl = this.configService.get<string>(
      'NOTIFICATION_SERVICE_URL',
      'http://localhost:3007',
    );
    this.authServiceUrl = this.configService.get<string>(
      'AUTH_SERVICE_URL',
      'http://localhost:3003',
    );
  }

  private get headers() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
  }

  // ---------------------------------------------------------------------------
  // Ownership verification (reused by every method)
  // ---------------------------------------------------------------------------

  private async verifyOwnership(clientId: number, projectId: number): Promise<ProjectRow> {
    const rows = await this.adminDb.query<ProjectRow>(
      `SELECT id, client_id, name, slug, description, is_default, status, settings, created_at, updated_at
       FROM projects
       WHERE id = ? AND client_id = ?
       LIMIT 1`,
      [projectId, clientId],
    );

    if (rows.length === 0) {
      throw new ForbiddenException(
        `Project ${projectId} not found or does not belong to client ${clientId}`,
      );
    }

    return rows[0];
  }

  // ---------------------------------------------------------------------------
  // 1. createProject
  // ---------------------------------------------------------------------------

  async createProject(
    clientId: number,
    data: {
      name: string;
      description?: string;
      chains: number[];
      custodyMode: 'full_custody' | 'co_sign' | 'client_only';
    },
  ) {
    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const settings = JSON.stringify({ custodyMode: data.custodyMode });

    // Check if project with this slug already exists for this client
    const existing = await this.adminDb.query<ProjectRow>(
      `SELECT id, status FROM projects WHERE client_id = ? AND slug = ? LIMIT 1`,
      [clientId, slug],
    );

    let projectId: number;

    if (existing.length > 0) {
      // Reuse existing project (from a previous failed wizard attempt)
      projectId = existing[0].id;
      this.logger.log(`Reusing existing project ${projectId} (slug=${slug}) for client ${clientId}`);
    } else {
      // Insert new project
      const insertRows = await this.adminDb.query<InsertResult>(
        `INSERT INTO projects (client_id, name, slug, description, status, settings)
         VALUES (?, ?, ?, ?, 'active', ?)`,
        [clientId, data.name, slug, data.description ?? null, settings],
      );

      projectId = (insertRows as any).insertId ?? (insertRows as any)[0]?.insertId;

      if (!projectId) {
        const fallback = await this.adminDb.query<ProjectRow>(
          `SELECT id FROM projects WHERE client_id = ? AND slug = ? ORDER BY id DESC LIMIT 1`,
          [clientId, slug],
        );
        if (fallback.length === 0) {
          throw new InternalServerErrorException('Failed to retrieve newly created project');
        }
        projectId = fallback[0].id;
      }
    }

    return this.buildCreatedProjectResponse(projectId, clientId, data, slug);
  }

  private async buildCreatedProjectResponse(
    projectId: number,
    clientId: number,
    data: { name: string; description?: string; chains: number[]; custodyMode: string },
    slug: string,
  ) {
    // Insert project_chains rows via core-wallet service.
    // This ensures the cvh_wallets.project_chains table is populated at project creation time,
    // so downstream services (deploy, gas-check, etc.) can find the chains.
    const chainResults: Array<{ chainId: number; status: string }> = [];

    for (const chainId of data.chains) {
      try {
        await axios.post(
          `${this.coreWalletUrl}/deploy/project/${projectId}/register-chain`,
          { chainId },
          { headers: this.headers, timeout: 10000 },
        );
        chainResults.push({ chainId, status: 'pending' });
      } catch (error: any) {
        // If core-wallet rejects (e.g. duplicate), still record as pending.
        // The deploy step will upsert the row if needed.
        const errMsg = error.response?.data?.message ?? (error instanceof Error ? error.message : String(error));
        this.logger.warn(
          `Failed to create project_chain for project ${projectId}, chain ${chainId}: ${errMsg}`,
        );
        chainResults.push({ chainId, status: 'pending' });
      }
    }

    this.logger.log(
      `Project created: id=${projectId} name=${data.name} slug=${slug} chains=${data.chains.join(',')}`,
    );

    return {
      id: projectId,
      name: data.name,
      slug,
      description: data.description ?? null,
      custodyMode: data.custodyMode,
      status: 'active',
      chains: chainResults,
    };
  }

  // ---------------------------------------------------------------------------
  // 2. initializeKeys
  // ---------------------------------------------------------------------------

  async initializeKeys(clientId: number, projectId: number, custodyMode?: string, chains?: number[]) {
    const project = await this.verifyOwnership(clientId, projectId);

    // Resolve custodyMode from project settings if not explicitly passed
    let resolvedCustodyMode = custodyMode;
    if (!resolvedCustodyMode && project.settings) {
      try {
        const settings =
          typeof project.settings === 'string'
            ? JSON.parse(project.settings)
            : project.settings;
        resolvedCustodyMode = settings.custodyMode;
      } catch {
        // ignore parse error
      }
    }
    resolvedCustodyMode = resolvedCustodyMode || 'full_custody';

    try {
      let mnemonic: string | null = null;

      // Step 1: Generate seed (24-word mnemonic)
      // If seed already exists (409), skip to fetching existing keys
      this.logger.log(`Generating seed for project ${projectId}`);
      try {
        const { data: seedData } = await axios.post(
          `${this.keyVaultUrl}/projects/${projectId}/generate-seed`,
          { requestedBy: 'project-setup' },
          { headers: this.headers, timeout: 30000 },
        );
        mnemonic = seedData.mnemonic;
      } catch (seedErr: any) {
        if (seedErr.response?.status === 409) {
          this.logger.log(`Seed already exists for project ${projectId}, fetching existing keys`);
        } else {
          throw seedErr;
        }
      }

      // Step 2: Generate keys (platform, client, backup)
      // Skip if seed already existed (keys were already generated)
      if (mnemonic) {
        this.logger.log(`Generating keys for project ${projectId} (custodyMode=${resolvedCustodyMode})`);
        try {
          await axios.post(
            `${this.keyVaultUrl}/projects/${projectId}/generate-keys`,
            { clientId, custodyMode: resolvedCustodyMode, requestedBy: 'project-setup' },
            { headers: this.headers, timeout: 30000 },
          );
        } catch (keysErr: any) {
          const errMsg = keysErr.response?.data?.message ?? '';
          const isDuplicate = keysErr.response?.status === 409 ||
            errMsg.includes('Unique constraint') || errMsg.includes('already exist');
          if (isDuplicate) {
            this.logger.log(`Keys already exist for project ${projectId}`);
          } else {
            throw keysErr;
          }
        }
      }

      // Step 3: Derive gas tank keys and register wallets for each chain
      const gasTanks: Array<{ chainId: number; address: string }> = [];

      if (chains && chains.length > 0) {
        this.logger.log(
          `Deriving gas tank keys for project ${projectId}, chains: ${chains.join(',')}`,
        );

        for (const chainId of chains) {
          try {
            // 3a: Derive gas tank key in key-vault
            const { data: gasTankData } = await axios.post(
              `${this.keyVaultUrl}/projects/${projectId}/derive-gas-tank-key`,
              { clientId, chainId, requestedBy: 'project-setup' },
              { headers: this.headers, timeout: 30000 },
            );

            const gasTankAddress = gasTankData.key?.address;
            if (!gasTankAddress) {
              this.logger.warn(
                `No address returned for gas tank key on chain ${chainId}`,
              );
              continue;
            }

            // 3b: Register gas tank wallet in core-wallet
            try {
              await axios.post(
                `${this.coreWalletUrl}/wallets/register`,
                {
                  clientId,
                  projectId,
                  chainId,
                  address: gasTankAddress,
                  walletType: 'gas_tank',
                },
                { headers: this.headers, timeout: 10000 },
              );
            } catch (regErr: any) {
              // Wallet may already exist (idempotent)
              this.logger.warn(
                `Failed to register gas tank wallet for chain ${chainId}: ${regErr.response?.data?.message ?? regErr.message}`,
              );
            }

            gasTanks.push({ chainId, address: gasTankAddress });

            this.logger.log(
              `Gas tank created for project ${projectId}, chain ${chainId}: ${gasTankAddress}`,
            );
          } catch (err: any) {
            this.logger.warn(
              `Failed to derive gas tank key for chain ${chainId}: ${err.response?.data?.message ?? err.message}`,
            );
          }
        }
      }

      // Step 4: Get public keys
      this.logger.log(`Fetching public keys for project ${projectId}`);
      const { data: pubKeysData } = await axios.get(
        `${this.keyVaultUrl}/projects/${projectId}/public-keys`,
        { headers: this.headers, timeout: 10000 },
      );

      this.logger.log(
        `Key ceremony complete for project ${projectId}: ${pubKeysData.keys?.length ?? 0} keys generated, ${gasTanks.length} gas tanks created`,
      );

      return {
        mnemonic: mnemonic ?? '(seed already generated — mnemonic was shown previously)',
        publicKeys: pubKeysData.keys ?? [],
        gasTanks,
      };
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(
          error.response.data?.message || 'Key Vault error',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Key Vault service unavailable');
    }
  }

  // ---------------------------------------------------------------------------
  // 2b. confirmSeedShown
  // ---------------------------------------------------------------------------

  async confirmSeedShown(clientId: number, projectId: number) {
    await this.verifyOwnership(clientId, projectId);

    try {
      await axios.post(
        `${this.keyVaultUrl}/projects/${projectId}/mark-seed-shown`,
        {},
        { headers: this.headers, timeout: 10000 },
      );

      this.logger.log(`Seed confirmed as shown for project ${projectId}`);

      return { confirmed: true };
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(
          error.response.data?.message || 'Key Vault error',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Key Vault service unavailable');
    }
  }

  // ---------------------------------------------------------------------------
  // 3. checkGasBalance
  // ---------------------------------------------------------------------------

  async checkGasBalance(clientId: number, projectId: number) {
    await this.verifyOwnership(clientId, projectId);

    // Get chains for this project from the project settings or from a list
    // Since project_chains is in cvh_wallets (not accessible directly),
    // we call core-wallet to get deploy status per chain, which also tells us which chains exist.
    // Alternatively, we retrieve the wallets (gas_tanks) for the client via core-wallet.
    try {
      // Get all wallets for the client (includes gas_tank wallets)
      const { data: walletsData } = await axios.get(
        `${this.coreWalletUrl}/wallets/${clientId}`,
        { headers: this.headers, timeout: 10000 },
      );

      const wallets = walletsData.wallets ?? walletsData ?? [];
      const gasTanks = Array.isArray(wallets)
        ? wallets.filter(
            (w: any) =>
              (w.walletType === 'gas_tank' || w.wallet_type === 'gas_tank') &&
              Number(w.projectId ?? w.project_id) === projectId,
          )
        : [];

      if (gasTanks.length === 0) {
        return { chains: [], allSufficient: false };
      }

      // Get chain info from admin DB
      const chainIds = gasTanks.map((g: any) => g.chainId ?? g.chain_id);
      const placeholders = chainIds.map(() => '?').join(',');
      const chains = await this.adminDb.query<ChainRow>(
        `SELECT chain_id, name, short_name, native_currency_symbol, native_currency_decimals, rpc_endpoints, is_active
         FROM chains
         WHERE chain_id IN (${placeholders})`,
        chainIds,
      );

      const chainMap = new Map<number, ChainRow>();
      for (const c of chains) {
        chainMap.set(c.chain_id, c);
      }

      // Estimated gas required: ~5.65M gas per chain (5 contract deployments)
      const ESTIMATED_GAS_PER_CHAIN = 5_650_000n;

      const results: Array<{
        chainId: number;
        chainName: string;
        gasTankAddress: string;
        balanceWei: string;
        balanceFormatted: string;
        requiredWei: string;
        requiredFormatted: string;
        sufficient: boolean;
      }> = [];

      for (const gasTank of gasTanks) {
        const chainId = gasTank.chainId ?? gasTank.chain_id;
        const chain = chainMap.get(chainId);
        if (!chain) continue;

        const address = gasTank.address;
        const decimals = chain.native_currency_decimals;

        // Get native balance for the gas tank address directly
        let balanceWei = 0n;
        try {
          const { data: balanceData } = await axios.get(
            `${this.coreWalletUrl}/wallets/balance/${chainId}/${address}`,
            { headers: this.headers, timeout: 15000 },
          );

          if (balanceData.balanceWei) {
            balanceWei = BigInt(balanceData.balanceWei);
          }
        } catch (err) {
          this.logger.warn(
            `Failed to get balance for gas tank ${address} on chain ${chainId}: ${err}`,
          );
        }

        // Estimate required wei: gas units * live gas price from RPC
        // Fallback: 1 gwei (conservative for most EVM chains; BSC is typically ~0.05 gwei)
        let gasPriceWei = 1_000_000_000n; // 1 gwei fallback
        try {
          // Try to get live gas price from core-wallet's balance endpoint
          // which uses the EvmProviderService (with API key + rate limiting)
          const { data: gasPriceData } = await axios.get(
            `${this.coreWalletUrl}/chains/${chainId}/gas-price`,
            { headers: this.headers, timeout: 10000 },
          );
          if (gasPriceData.gasPrice) {
            gasPriceWei = BigInt(gasPriceData.gasPrice);
          }
        } catch {
          // gas-price endpoint may not exist; try getting fee data via wallets/fee-data
          try {
            const { data: feeData } = await axios.get(
              `${this.coreWalletUrl}/wallets/fee-data/${chainId}`,
              { headers: this.headers, timeout: 10000 },
            );
            if (feeData.gasPrice) {
              gasPriceWei = BigInt(feeData.gasPrice);
            }
          } catch {
            // Use fallback — 1 gwei is reasonable for most chains
          }
        }
        // Apply a 2x safety margin for gas price volatility
        gasPriceWei = gasPriceWei * 2n;

        const requiredWei = ESTIMATED_GAS_PER_CHAIN * gasPriceWei;

        results.push({
          chainId,
          chainName: chain.name,
          gasTankAddress: address,
          balanceWei: balanceWei.toString(),
          balanceFormatted: this.formatUnits(balanceWei, decimals),
          requiredWei: requiredWei.toString(),
          requiredFormatted: this.formatUnits(requiredWei, decimals),
          sufficient: balanceWei >= requiredWei,
        });
      }

      return {
        chains: results,
        allSufficient: results.every((r) => r.sufficient),
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      if (error.response) {
        throw new HttpException(
          error.response.data?.message || 'Service error',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  // ---------------------------------------------------------------------------
  // 4. startDeploy
  // ---------------------------------------------------------------------------

  async startDeploy(clientId: number, projectId: number) {
    await this.verifyOwnership(clientId, projectId);

    // Check gas balances first
    const gasCheck = await this.checkGasBalance(clientId, projectId);

    if (gasCheck.chains.length === 0) {
      throw new BadRequestException(
        'No gas tanks configured. Please deposit gas before deploying.',
      );
    }

    const insufficientChains = gasCheck.chains.filter((c) => !c.sufficient);
    if (insufficientChains.length > 0) {
      throw new BadRequestException({
        message: 'Insufficient gas balance on one or more chains',
        insufficientChains: insufficientChains.map((c) => ({
          chainId: c.chainId,
          chainName: c.chainName,
          balanceFormatted: c.balanceFormatted,
          requiredFormatted: c.requiredFormatted,
        })),
      });
    }

    // Get public keys to extract signer addresses
    let signers: string[] = [];
    try {
      const { data: pubKeysData } = await axios.get(
        `${this.keyVaultUrl}/projects/${projectId}/public-keys`,
        { headers: this.headers, timeout: 10000 },
      );

      const keys = pubKeysData.keys ?? [];
      // Extract addresses for platform, client, backup signers
      const platformKey = keys.find((k: any) => k.keyType === 'platform' || k.key_type === 'platform');
      const clientKey = keys.find((k: any) => k.keyType === 'client' || k.key_type === 'client');
      const backupKey = keys.find((k: any) => k.keyType === 'backup' || k.key_type === 'backup');

      signers = [
        platformKey?.address ?? platformKey?.ethAddress,
        clientKey?.address ?? clientKey?.ethAddress,
        backupKey?.address ?? backupKey?.ethAddress,
      ].filter(Boolean) as string[];

      if (signers.length < 3) {
        throw new BadRequestException(
          `Expected 3 signers (platform, client, backup) but found ${signers.length}. Run key initialization first.`,
        );
      }
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      if (error.response) {
        throw new HttpException(
          error.response.data?.message || 'Key Vault error',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Key Vault service unavailable');
    }

    // Deploy on each chain
    const deployResults: Array<{
      chainId: number;
      chainName: string;
      status: string;
      result?: any;
      error?: string;
    }> = [];

    for (const chainInfo of gasCheck.chains) {
      try {
        this.logger.log(
          `Starting deploy for project ${projectId} on chain ${chainInfo.chainId} (${chainInfo.chainName})`,
        );

        const { data: deployData } = await axios.post(
          `${this.coreWalletUrl}/deploy/project/${projectId}/chain/${chainInfo.chainId}`,
          { clientId, signers },
          { headers: this.headers, timeout: 300000 }, // 5 min — deployment is slow
        );

        deployResults.push({
          chainId: chainInfo.chainId,
          chainName: chainInfo.chainName,
          status: 'deployed',
          result: deployData,
        });

        this.logger.log(
          `Deploy complete for project ${projectId} on chain ${chainInfo.chainId}`,
        );
      } catch (error: any) {
        const errMsg =
          error.response?.data?.message ??
          (error instanceof Error ? error.message : String(error));

        this.logger.error(
          `Deploy FAILED for project ${projectId} on chain ${chainInfo.chainId}: ${errMsg}`,
        );

        deployResults.push({
          chainId: chainInfo.chainId,
          chainName: chainInfo.chainName,
          status: 'failed',
          error: errMsg,
        });
      }
    }

    return {
      projectId,
      deploys: deployResults,
      allDeployed: deployResults.every((d) => d.status === 'deployed'),
    };
  }

  // ---------------------------------------------------------------------------
  // 5. getDeployStatus
  // ---------------------------------------------------------------------------

  async getDeployStatus(clientId: number, projectId: number) {
    await this.verifyOwnership(clientId, projectId);

    try {
      // Get all wallets for the client to know which chains exist
      const { data: walletsData } = await axios.get(
        `${this.coreWalletUrl}/wallets/${clientId}`,
        { headers: this.headers, timeout: 10000 },
      );

      const wallets = walletsData.wallets ?? walletsData ?? [];
      const gasTanks = Array.isArray(wallets)
        ? wallets.filter(
            (w: any) =>
              (w.walletType === 'gas_tank' || w.wallet_type === 'gas_tank') &&
              Number(w.projectId ?? w.project_id) === projectId,
          )
        : [];

      const chainIds = [...new Set(gasTanks.map((g: any) => g.chainId ?? g.chain_id))];

      const statuses: Array<{
        chainId: number;
        status: string;
        deployStartedAt?: Date | null;
        deployCompletedAt?: Date | null;
        deployError?: string | null;
        contracts?: Record<string, string | null>;
      }> = [];

      for (const chainId of chainIds) {
        try {
          const { data } = await axios.get(
            `${this.coreWalletUrl}/deploy/project/${projectId}/chain/${chainId}/status`,
            { headers: this.headers, timeout: 10000 },
          );

          statuses.push({
            chainId: chainId as number,
            status: data.deployStatus ?? data.deploy_status ?? 'unknown',
            deployStartedAt: data.deployStartedAt ?? data.deploy_started_at ?? null,
            deployCompletedAt: data.deployCompletedAt ?? data.deploy_completed_at ?? null,
            deployError: data.deployError ?? data.deploy_error ?? null,
            contracts: {
              walletFactory: data.walletFactoryAddress ?? data.wallet_factory_address ?? null,
              forwarderFactory: data.forwarderFactoryAddress ?? data.forwarder_factory_address ?? null,
              walletImpl: data.walletImplAddress ?? data.wallet_impl_address ?? null,
              forwarderImpl: data.forwarderImplAddress ?? data.forwarder_impl_address ?? null,
              hotWallet: data.hotWalletAddress ?? data.hot_wallet_address ?? null,
            },
          });
        } catch (error: any) {
          if (error.response?.status === 404) {
            statuses.push({
              chainId: chainId as number,
              status: 'not_started',
            });
          } else {
            statuses.push({
              chainId: chainId as number,
              status: 'error',
              deployError: error.response?.data?.message ?? 'Failed to fetch status',
            });
          }
        }
      }

      return {
        projectId,
        chains: statuses,
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      if (error.response) {
        throw new HttpException(
          error.response.data?.message || 'Service error',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  // ---------------------------------------------------------------------------
  // 6. getDeployTraces
  // ---------------------------------------------------------------------------

  async getDeployTraces(clientId: number, projectId: number, chainId?: number) {
    await this.verifyOwnership(clientId, projectId);

    try {
      const url = chainId
        ? `${this.coreWalletUrl}/deploy/project/${projectId}/chain/${chainId}/traces`
        : `${this.coreWalletUrl}/deploy/project/${projectId}/traces`;

      const { data } = await axios.get(url, {
        headers: this.headers,
        timeout: 15000,
      });

      return {
        projectId,
        chainId: chainId ?? null,
        traces: data.traces ?? [],
      };
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(
          error.response.data?.message || 'Service error',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  // ---------------------------------------------------------------------------
  // 7. exportProject
  // ---------------------------------------------------------------------------

  async exportProject(clientId: number, projectId: number) {
    const project = await this.verifyOwnership(clientId, projectId);

    // Resolve custodyMode from project settings
    let custodyMode = 'full_custody';
    if (project.settings) {
      try {
        const settings =
          typeof project.settings === 'string'
            ? JSON.parse(project.settings)
            : project.settings;
        custodyMode = settings.custodyMode ?? 'full_custody';
      } catch {
        // ignore parse error
      }
    }

    // 1. Public keys from Key Vault
    let publicKeys: Record<string, any> = {};
    try {
      const { data: pubKeysData } = await axios.get(
        `${this.keyVaultUrl}/projects/${projectId}/public-keys`,
        { headers: this.headers, timeout: 10000 },
      );

      const keys = pubKeysData.keys ?? [];
      for (const key of keys) {
        const keyType = key.keyType ?? key.key_type ?? 'unknown';
        publicKeys[keyType] = {
          address: key.address ?? key.ethAddress ?? null,
          publicKey: key.publicKey ?? key.public_key ?? null,
          derivationPath: key.derivationPath ?? key.derivation_path ?? null,
        };
      }
    } catch (error: any) {
      this.logger.warn(
        `Failed to fetch public keys for project ${projectId}: ${error.message ?? error}`,
      );
    }

    // 2. Project chains + contract addresses from core-wallet deploy status
    const chainsExport: Record<string, any> = {};
    const chainIds: number[] = [];

    // Get gas tanks to determine which chains the client has
    let gasTanks: any[] = [];
    try {
      const { data: walletsData } = await axios.get(
        `${this.coreWalletUrl}/wallets/${clientId}`,
        { headers: this.headers, timeout: 10000 },
      );
      const wallets = walletsData.wallets ?? walletsData ?? [];
      gasTanks = Array.isArray(wallets)
        ? wallets.filter(
            (w: any) =>
              (w.walletType === 'gas_tank' || w.wallet_type === 'gas_tank') &&
              Number(w.projectId ?? w.project_id) === projectId,
          )
        : [];
    } catch (error: any) {
      this.logger.warn(
        `Failed to fetch wallets for export: ${error.message ?? error}`,
      );
    }

    for (const gasTank of gasTanks) {
      const chainId = gasTank.chainId ?? gasTank.chain_id;
      chainIds.push(chainId);
    }

    // Get chain info from admin DB
    let chainMap = new Map<number, ChainRow>();
    if (chainIds.length > 0) {
      const placeholders = chainIds.map(() => '?').join(',');
      const chains = await this.adminDb.query<ChainRow>(
        `SELECT chain_id, name, short_name, native_currency_symbol, native_currency_decimals, rpc_endpoints, is_active
         FROM chains
         WHERE chain_id IN (${placeholders})`,
        chainIds,
      );
      for (const c of chains) {
        chainMap.set(c.chain_id, c);
      }
    }

    // For each chain, get deploy status (contract addresses)
    for (const chainId of chainIds) {
      const chain = chainMap.get(chainId);
      try {
        const { data } = await axios.get(
          `${this.coreWalletUrl}/deploy/project/${projectId}/chain/${chainId}/status`,
          { headers: this.headers, timeout: 10000 },
        );

        chainsExport[chainId.toString()] = {
          chainName: chain?.name ?? `Chain ${chainId}`,
          contracts: {
            walletFactory: data.walletFactoryAddress ?? data.wallet_factory_address ?? null,
            forwarderFactory: data.forwarderFactoryAddress ?? data.forwarder_factory_address ?? null,
            walletImpl: data.walletImplAddress ?? data.wallet_impl_address ?? null,
            forwarderImpl: data.forwarderImplAddress ?? data.forwarder_impl_address ?? null,
            hotWallet: data.hotWalletAddress ?? data.hot_wallet_address ?? null,
          },
          forwarders: data.forwarders ?? [],
        };
      } catch {
        chainsExport[chainId.toString()] = {
          chainName: chain?.name ?? `Chain ${chainId}`,
          contracts: {},
          forwarders: [],
        };
      }
    }

    // 3. Deploy traces from core-wallet
    let deployTraces: any[] = [];
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/deploy/project/${projectId}/traces`,
        { headers: this.headers, timeout: 15000 },
      );
      deployTraces = data.traces ?? [];
    } catch (error: any) {
      this.logger.warn(
        `Failed to fetch deploy traces for export: ${error.message ?? error}`,
      );
    }

    // 4. Extract ABIs from deploy traces (unique by contract type)
    const abis: Record<string, any[]> = {};
    for (const trace of deployTraces) {
      const contractType = trace.contractType ?? trace.contract_type;
      const abi = trace.abiJson ?? trace.abi_json ?? trace.abi;
      if (contractType && abi && !abis[contractType]) {
        abis[contractType] = abi;
      }
    }

    // 5. Get forwarder addresses from core-wallet
    for (const chainId of chainIds) {
      try {
        const { data } = await axios.get(
          `${this.coreWalletUrl}/deposit-addresses/${clientId}/${chainId}?projectId=${projectId}`,
          { headers: this.headers, timeout: 15000 },
        );
        const addresses = data.addresses ?? data.depositAddresses ?? data ?? [];
        if (Array.isArray(addresses) && addresses.length > 0) {
          const forwarderAddrs = addresses.map((a: any) => a.address).filter(Boolean);
          if (chainsExport[chainId.toString()]) {
            chainsExport[chainId.toString()].forwarders = forwarderAddrs;
          }
        }
      } catch {
        // Forwarder list is best-effort
      }
    }

    // Build export JSON
    const exportData = {
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      project: {
        name: project.name,
        slug: project.slug,
        custodyMode,
        chains: chainIds,
      },
      publicKeys,
      chains: chainsExport,
      abis,
      deployTraces: deployTraces.map((trace: any) => ({
        id: trace.id,
        chainId: trace.chainId ?? trace.chain_id,
        contractType: trace.contractType ?? trace.contract_type,
        contractAddress: trace.contractAddress ?? trace.contract_address ?? null,
        txHash: trace.txHash ?? trace.tx_hash ?? null,
        blockNumber: trace.blockNumber ?? trace.block_number ?? null,
        gasUsed: trace.gasUsed ?? trace.gas_used ?? null,
        gasCostWei: trace.gasCostWei ?? trace.gas_cost_wei ?? null,
        deployerAddress: trace.deployerAddress ?? trace.deployer_address ?? null,
        status: trace.status,
        explorerUrl: trace.explorerUrl ?? trace.explorer_url ?? null,
        createdAt: trace.createdAt ?? trace.created_at ?? null,
      })),
    };

    this.logger.log(
      `Project export generated: projectId=${projectId} chains=${chainIds.join(',')} traces=${deployTraces.length}`,
    );

    return exportData;
  }

  // ---------------------------------------------------------------------------
  // 8. getDeletionImpact
  // ---------------------------------------------------------------------------

  async getDeletionImpact(clientId: number, projectId: number) {
    const project = await this.verifyOwnership(clientId, projectId);

    // 1. Query wallets from core-wallet-service, filtered by projectId
    let wallets: any[] = [];
    try {
      const { data: walletsData } = await axios.get(
        `${this.coreWalletUrl}/wallets/${clientId}`,
        { headers: this.headers, timeout: 10000 },
      );
      const allWallets = walletsData.wallets ?? walletsData ?? [];
      wallets = Array.isArray(allWallets)
        ? allWallets.filter(
            (w: any) =>
              (w.projectId ?? w.project_id) === projectId,
          )
        : [];
    } catch (error: any) {
      this.logger.warn(
        `Failed to fetch wallets for deletion impact (project ${projectId}): ${error.message ?? error}`,
      );
    }

    // 2. Count deposits from transaction-service (via admin DB cross-schema query)
    let depositCount = 0;
    try {
      const depositRows = await this.adminDb.query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM cvh_transactions.deposits WHERE client_id = ? AND project_id = ?`,
        [clientId, projectId],
      );
      depositCount = Number(depositRows[0]?.cnt ?? 0);
    } catch {
      this.logger.warn(`Failed to count deposits for project ${projectId}, defaulting to 0`);
    }

    // 3. Count withdrawals from transaction-service (via admin DB cross-schema query)
    let withdrawalCount = 0;
    try {
      const withdrawalRows = await this.adminDb.query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM cvh_transactions.withdrawals WHERE client_id = ? AND project_id = ?`,
        [clientId, projectId],
      );
      withdrawalCount = Number(withdrawalRows[0]?.cnt ?? 0);
    } catch {
      this.logger.warn(`Failed to count withdrawals for project ${projectId}, defaulting to 0`);
    }

    // 4. Count webhooks from notification-service
    let webhookCount = 0;
    try {
      const { data: webhooksData } = await axios.get(
        `${this.notificationUrl}/webhooks?clientId=${clientId}`,
        { headers: this.headers, timeout: 10000 },
      );
      const allWebhooks = webhooksData.webhooks ?? webhooksData ?? [];
      webhookCount = Array.isArray(allWebhooks) ? allWebhooks.length : 0;
    } catch {
      this.logger.warn(`Failed to count webhooks for project ${projectId}, defaulting to 0`);
    }

    // 5. Count API keys from auth-service
    let apiKeyCount = 0;
    try {
      const { data: keysData } = await axios.get(
        `${this.authServiceUrl}/auth/api-keys?clientId=${clientId}`,
        { headers: this.headers, timeout: 10000 },
      );
      const allKeys = keysData.apiKeys ?? keysData ?? [];
      apiKeyCount = Array.isArray(allKeys) ? allKeys.length : 0;
    } catch {
      this.logger.warn(`Failed to count API keys for project ${projectId}, defaulting to 0`);
    }

    // 6. Get balances for each wallet chain
    const balances: Array<{ chainId: number; address: string; balanceFormatted: string }> = [];
    let hasNonZeroBalance = false;

    for (const wallet of wallets) {
      const chainId = wallet.chainId ?? wallet.chain_id;
      const address = wallet.address;
      if (!chainId || !address) continue;

      try {
        const { data: balanceData } = await axios.get(
          `${this.coreWalletUrl}/wallets/${clientId}/${chainId}/balances`,
          { headers: this.headers, timeout: 15000 },
        );

        const nativeBalance = Array.isArray(balanceData.balances)
          ? balanceData.balances.find(
              (b: any) =>
                b.tokenAddress === '0x0000000000000000000000000000000000000000' ||
                b.isNative === true,
            )
          : null;

        const balStr = nativeBalance?.balance ?? '0';
        if (parseFloat(balStr) > 0) {
          hasNonZeroBalance = true;
        }

        balances.push({
          chainId,
          address,
          balanceFormatted: balStr,
        });
      } catch {
        this.logger.warn(`Failed to get balance for wallet ${address} on chain ${chainId}`);
        balances.push({ chainId, address, balanceFormatted: 'unknown' });
      }
    }

    const transactionCount = depositCount + withdrawalCount;

    return {
      projectId,
      projectName: project.name,
      status: project.status,
      walletCount: wallets.length,
      depositCount,
      withdrawalCount,
      transactionCount,
      webhookCount,
      apiKeyCount,
      hasNonZeroBalance,
      balances,
    };
  }

  // ---------------------------------------------------------------------------
  // 9. requestDeletion
  // ---------------------------------------------------------------------------

  async requestDeletion(clientId: number, projectId: number) {
    const project = await this.verifyOwnership(clientId, projectId);

    if (project.status === 'pending_deletion') {
      throw new BadRequestException(
        `Project ${projectId} already has a pending deletion request`,
      );
    }
    if (project.status === 'deleted') {
      throw new BadRequestException(`Project ${projectId} is already deleted`);
    }
    if (project.status !== 'active') {
      throw new BadRequestException(
        `Project ${projectId} must be active to request deletion (current status: ${project.status})`,
      );
    }

    const impactSummary = await this.getDeletionImpact(clientId, projectId);

    // Decision logic:
    // - Zero transactions AND zero balance → immediate hard-delete (clean up wallets/keys too)
    // - Has transactions or has non-zero balance → 30-day grace period

    if (impactSummary.transactionCount === 0 && !impactSummary.hasNonZeroBalance) {
      // Immediate hard-delete: clean up all related data then remove project
      try {
        await this.adminDb.query(`DELETE FROM cvh_wallets.deposit_addresses WHERE wallet_id IN (SELECT id FROM cvh_wallets.wallets WHERE project_id = ?)`, [projectId]);
        await this.adminDb.query(`DELETE FROM cvh_wallets.wallets WHERE project_id = ?`, [projectId]);
        await this.adminDb.query(`DELETE FROM cvh_wallets.project_chains WHERE project_id = ?`, [projectId]);
        await this.adminDb.query(`DELETE FROM cvh_keyvault.shamir_shares WHERE project_id = ?`, [projectId]);
        await this.adminDb.query(`DELETE FROM cvh_keyvault.derived_keys WHERE project_id = ?`, [projectId]);
        await this.adminDb.query(`DELETE FROM cvh_keyvault.project_seeds WHERE project_id = ?`, [projectId]);
      } catch (cleanupErr: any) {
        this.logger.warn(`Cleanup failed for project ${projectId}: ${cleanupErr.message}`);
      }

      await this.adminDb.query(
        `DELETE FROM projects WHERE id = ? AND client_id = ?`,
        [projectId, clientId],
      );

      this.logger.log(
        `Project ${projectId} hard-deleted immediately (no transactions, no balance)`,
      );

      return {
        immediate: true,
        deleted: true,
        impactSummary,
      };
    }

    const now = new Date();
    const graceDays = 30;

    const scheduledFor = new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000);

    await this.adminDb.query(
      `UPDATE projects
         SET status = 'pending_deletion',
             deletion_requested_at = ?,
             deletion_scheduled_for = ?
       WHERE id = ? AND client_id = ?`,
      [now, scheduledFor, projectId, clientId],
    );

    this.logger.log(
      `Project ${projectId} scheduled for deletion on ${scheduledFor.toISOString()} (${graceDays}-day grace period)`,
    );

    return {
      immediate: false,
      scheduledFor: scheduledFor.toISOString(),
      graceDays,
      impactSummary,
    };
  }

  // ---------------------------------------------------------------------------
  // 10. cancelDeletion
  // ---------------------------------------------------------------------------

  async cancelDeletion(clientId: number, projectId: number) {
    const project = await this.verifyOwnership(clientId, projectId);

    if (project.status !== 'pending_deletion') {
      throw new BadRequestException(
        `Project ${projectId} is not pending deletion (current status: ${project.status})`,
      );
    }

    await this.adminDb.query(
      `UPDATE projects
         SET status = 'active',
             deletion_requested_at = NULL,
             deletion_scheduled_for = NULL
       WHERE id = ? AND client_id = ?`,
      [projectId, clientId],
    );

    this.logger.log(`Project ${projectId} deletion cancelled, status restored to active`);

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // BigInt helpers (avoid ethers dependency in client-api)
  // ---------------------------------------------------------------------------

  private parseUnits(value: string, decimals: number): bigint {
    const parts = value.split('.');
    const whole = parts[0] || '0';
    let fraction = parts[1] || '';
    if (fraction.length > decimals) {
      fraction = fraction.slice(0, decimals);
    } else {
      fraction = fraction.padEnd(decimals, '0');
    }
    return BigInt(whole + fraction);
  }

  private formatUnits(value: bigint, decimals: number): string {
    const str = value.toString().padStart(decimals + 1, '0');
    const whole = str.slice(0, str.length - decimals) || '0';
    const fraction = str.slice(str.length - decimals);
    // Trim trailing zeros but keep at least 4 decimal places
    const trimmed = fraction.replace(/0+$/, '').padEnd(4, '0');
    return `${whole}.${trimmed}`;
  }
}
