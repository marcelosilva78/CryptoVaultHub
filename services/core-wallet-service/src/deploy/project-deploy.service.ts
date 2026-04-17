import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { NonceService } from '../blockchain/nonce.service';
import { ProjectDeployTraceService } from './deploy-trace.service';

interface ContractArtifact {
  contractName: string;
  abi: ethers.InterfaceAbi;
  bytecode: string;
}

interface KeyVaultSignResponse {
  success: boolean;
  signedTransaction: string;
  txHash: string;
  from: string;
}

interface DeployStepResult {
  contractAddress: string;
  txHash: string;
  traceId: bigint;
}

/**
 * Orchestrates the sequential deployment of 5 contracts per project per chain:
 *
 * 1. CvhWalletSimple (implementation)
 * 2. CvhForwarder (implementation)
 * 3. CvhWalletFactory (constructor arg: walletImpl address)
 * 4. CvhForwarderFactory (constructor arg: forwarderImpl address)
 * 5. Hot Wallet (via walletFactory.createWallet)
 *
 * Each step creates a full trace record with calldata, signed tx,
 * RPC request/response, ABI, constructor args, gas costs, and
 * bytecode verification proof.
 */
@Injectable()
export class ProjectDeployService {
  private readonly logger = new Logger(ProjectDeployService.name);
  private readonly keyVaultUrl: string;
  private readonly internalServiceKey: string;
  private readonly artifactsBasePath: string;

  /** Lazy-loaded contract artifacts cache */
  private readonly artifactCache = new Map<string, ContractArtifact>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly evmProvider: EvmProviderService,
    private readonly nonceService: NonceService,
    private readonly traceService: ProjectDeployTraceService,
  ) {
    this.keyVaultUrl = this.config.getOrThrow<string>('KEY_VAULT_URL');
    this.internalServiceKey = this.config.get<string>('INTERNAL_SERVICE_KEY', '');

    // Resolve the artifacts path relative to the project root
    // core-wallet-service is at services/core-wallet-service
    // artifacts are at contracts/artifacts/contracts/
    this.artifactsBasePath = path.resolve(
      __dirname,
      '../../../../contracts/artifacts/contracts',
    );
  }

  /**
   * Deploy all 5 contracts for a project on a specific chain.
   *
   * @param projectId - The project ID
   * @param clientId  - The client ID (owner of the gas tank)
   * @param chainId   - The target chain ID
   * @param signers   - Array of 3 signer addresses [platform, client, backup]
   */
  async deployProjectChain(
    projectId: number,
    clientId: number,
    chainId: number,
    signers: string[],
  ): Promise<{
    projectChainId: number;
    walletImplAddress: string;
    forwarderImplAddress: string;
    walletFactoryAddress: string;
    forwarderFactoryAddress: string;
    hotWalletAddress: string;
  }> {
    // Upsert or find the project_chain record
    let projectChain = await this.prisma.projectChain.findUnique({
      where: {
        uq_project_chain: {
          projectId: BigInt(projectId),
          chainId,
        },
      },
    });

    if (!projectChain) {
      projectChain = await this.prisma.projectChain.create({
        data: {
          projectId: BigInt(projectId),
          chainId,
          deployStatus: 'pending',
        },
      });
    }

    if (projectChain.deployStatus === 'ready') {
      this.logger.warn(
        `ProjectChain ${projectChain.id} already deployed for project=${projectId} chain=${chainId}`,
      );
      return {
        projectChainId: Number(projectChain.id),
        walletImplAddress: projectChain.walletImplAddress!,
        forwarderImplAddress: projectChain.forwarderImplAddress!,
        walletFactoryAddress: projectChain.walletFactoryAddress!,
        forwarderFactoryAddress: projectChain.forwarderFactoryAddress!,
        hotWalletAddress: projectChain.hotWalletAddress!,
      };
    }

    const projectChainId = projectChain.id;

    // Step 1: Mark as deploying
    await this.prisma.projectChain.update({
      where: { id: projectChainId },
      data: {
        deployStatus: 'deploying',
        deployStartedAt: new Date(),
        deployError: null,
      },
    });

    try {
      // Get gas tank address for client+chain
      const gasTank = await this.prisma.wallet.findUnique({
        where: {
          uq_client_chain_type: {
            clientId: BigInt(clientId),
            chainId,
            walletType: 'gas_tank',
          },
        },
      });

      if (!gasTank) {
        throw new Error(
          `Gas tank not found for client=${clientId} chain=${chainId}. Create wallets first.`,
        );
      }

      const gasTankAddress = gasTank.address;

      // Get chain config for explorer URL
      const chain = await this.prisma.chain.findUnique({
        where: { id: chainId },
      });
      if (!chain || !chain.isActive) {
        throw new Error(`Chain ${chainId} not found or not active`);
      }

      // Get RPC provider
      const provider = await this.evmProvider.getProvider(chainId);

      this.logger.log(
        `Starting deploy for project=${projectId} chain=${chainId} gasTank=${gasTankAddress}`,
      );

      // Step 2: Deploy CvhWalletSimple (implementation)
      const walletImpl = await this.deployContract({
        projectId,
        clientId,
        chainId,
        projectChainId: Number(projectChainId),
        contractName: 'CvhWalletSimple',
        contractType: 'wallet_impl',
        constructorArgs: [],
        gasTankAddress,
        provider,
        chainExplorerUrl: chain.explorerUrl,
      });

      // Step 3: Deploy CvhForwarder (implementation)
      const forwarderImpl = await this.deployContract({
        projectId,
        clientId,
        chainId,
        projectChainId: Number(projectChainId),
        contractName: 'CvhForwarder',
        contractType: 'forwarder_impl',
        constructorArgs: [],
        gasTankAddress,
        provider,
        chainExplorerUrl: chain.explorerUrl,
      });

      // Step 4: Deploy CvhWalletFactory (constructor arg: walletImpl address)
      const walletFactory = await this.deployContract({
        projectId,
        clientId,
        chainId,
        projectChainId: Number(projectChainId),
        contractName: 'CvhWalletFactory',
        contractType: 'wallet_factory',
        constructorArgs: [walletImpl.contractAddress],
        gasTankAddress,
        provider,
        chainExplorerUrl: chain.explorerUrl,
      });

      // Step 5: Deploy CvhForwarderFactory (constructor arg: forwarderImpl address)
      const forwarderFactory = await this.deployContract({
        projectId,
        clientId,
        chainId,
        projectChainId: Number(projectChainId),
        contractName: 'CvhForwarderFactory',
        contractType: 'forwarder_factory',
        constructorArgs: [forwarderImpl.contractAddress],
        gasTankAddress,
        provider,
        chainExplorerUrl: chain.explorerUrl,
      });

      // Step 6: Deploy Hot Wallet via walletFactory.createWallet
      const hotWallet = await this.deployHotWallet({
        projectId,
        clientId,
        chainId,
        projectChainId: Number(projectChainId),
        walletFactoryAddress: walletFactory.contractAddress,
        signers,
        gasTankAddress,
        provider,
        chainExplorerUrl: chain.explorerUrl,
      });

      // Step 7: Update project_chain with all addresses -> status = 'ready'
      await this.prisma.projectChain.update({
        where: { id: projectChainId },
        data: {
          walletImplAddress: walletImpl.contractAddress,
          forwarderImplAddress: forwarderImpl.contractAddress,
          walletFactoryAddress: walletFactory.contractAddress,
          forwarderFactoryAddress: forwarderFactory.contractAddress,
          hotWalletAddress: hotWallet.contractAddress,
          deployStatus: 'ready',
          deployCompletedAt: new Date(),
        },
      });

      this.logger.log(
        `Deploy complete for project=${projectId} chain=${chainId}: ` +
          `walletImpl=${walletImpl.contractAddress} forwarderImpl=${forwarderImpl.contractAddress} ` +
          `walletFactory=${walletFactory.contractAddress} forwarderFactory=${forwarderFactory.contractAddress} ` +
          `hotWallet=${hotWallet.contractAddress}`,
      );

      return {
        projectChainId: Number(projectChainId),
        walletImplAddress: walletImpl.contractAddress,
        forwarderImplAddress: forwarderImpl.contractAddress,
        walletFactoryAddress: walletFactory.contractAddress,
        forwarderFactoryAddress: forwarderFactory.contractAddress,
        hotWalletAddress: hotWallet.contractAddress,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.prisma.projectChain.update({
        where: { id: projectChainId },
        data: {
          deployStatus: 'failed',
          deployError: errorMessage,
        },
      });

      this.logger.error(
        `Deploy FAILED for project=${projectId} chain=${chainId}: ${errorMessage}`,
      );

      throw error;
    }
  }

  /**
   * Get the current status of a ProjectChain.
   */
  async getProjectChainStatus(projectId: number, chainId: number) {
    const pc = await this.prisma.projectChain.findUnique({
      where: {
        uq_project_chain: {
          projectId: BigInt(projectId),
          chainId,
        },
      },
    });

    if (!pc) {
      return null;
    }

    return {
      id: Number(pc.id),
      projectId: Number(pc.projectId),
      chainId: pc.chainId,
      walletFactoryAddress: pc.walletFactoryAddress,
      forwarderFactoryAddress: pc.forwarderFactoryAddress,
      walletImplAddress: pc.walletImplAddress,
      forwarderImplAddress: pc.forwarderImplAddress,
      hotWalletAddress: pc.hotWalletAddress,
      hotWalletSequenceId: pc.hotWalletSequenceId,
      deployStatus: pc.deployStatus,
      deployStartedAt: pc.deployStartedAt,
      deployCompletedAt: pc.deployCompletedAt,
      deployError: pc.deployError,
      createdAt: pc.createdAt,
      updatedAt: pc.updatedAt,
    };
  }

  /**
   * Register a project_chain row with deploy_status='pending'.
   * Idempotent: if the row already exists, returns its current state.
   */
  async registerProjectChain(
    projectId: number,
    chainId: number,
  ): Promise<{ projectId: number; chainId: number; deployStatus: string }> {
    let pc = await this.prisma.projectChain.findUnique({
      where: {
        uq_project_chain: {
          projectId: BigInt(projectId),
          chainId,
        },
      },
    });

    if (!pc) {
      pc = await this.prisma.projectChain.create({
        data: {
          projectId: BigInt(projectId),
          chainId,
          deployStatus: 'pending',
        },
      });
      this.logger.log(
        `Registered project_chain: project=${projectId} chain=${chainId} status=pending`,
      );
    }

    return {
      projectId: Number(pc.projectId),
      chainId: pc.chainId,
      deployStatus: pc.deployStatus,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Deploy a contract by name: build deploy tx, sign via Key Vault, broadcast,
   * wait for receipt, verify bytecode, and record full trace.
   */
  private async deployContract(params: {
    projectId: number;
    clientId: number;
    chainId: number;
    projectChainId: number;
    contractName: string;
    contractType: string;
    constructorArgs: unknown[];
    gasTankAddress: string;
    provider: ethers.JsonRpcProvider;
    chainExplorerUrl?: string | null;
  }): Promise<DeployStepResult> {
    const {
      projectId,
      clientId,
      chainId,
      projectChainId,
      contractName,
      contractType,
      constructorArgs,
      gasTankAddress,
      provider,
      chainExplorerUrl,
    } = params;

    // Load artifact
    const artifact = this.loadContractArtifact(contractName);

    // Build deploy transaction using ethers ContractFactory
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode);
    const deployTx = await factory.getDeployTransaction(...constructorArgs);
    const calldataHex = deployTx.data as string;

    // Compute expected bytecode hash (of the runtime bytecode in the artifact)
    // Note: this is the init code hash; we'll verify on-chain runtime bytecode later
    const initCodeHash = ethers.keccak256(calldataHex);

    // Create pending trace
    const traceId = await this.traceService.createTrace({
      projectId,
      chainId,
      projectChainId,
      contractType,
      deployerAddress: gasTankAddress,
      calldataHex,
      constructorArgsJson: {
        args: constructorArgs.map(String),
        contractName,
      },
      abiJson: artifact.abi as unknown[],
      bytecodeHash: initCodeHash,
    });

    try {
      // Acquire nonce via mutex
      const { nonce, release } = await this.nonceService.acquireNonce(
        chainId,
        gasTankAddress,
      );

      let txHash: string;
      let signedTxHex: string;
      let rpcRequest: Record<string, unknown>;
      let rpcResponse: Record<string, unknown>;

      try {
        // Get fee data
        const feeData = await provider.getFeeData();

        // Estimate gas
        let gasLimit: bigint;
        try {
          const estimated = await provider.estimateGas({
            from: gasTankAddress,
            data: calldataHex,
          });
          // 20% safety margin
          gasLimit = (estimated * 120n) / 100n;
        } catch {
          // Fallback: contract deploys can use significant gas
          gasLimit = 5_000_000n;
          this.logger.warn(
            `Gas estimation failed for ${contractName} deploy, using default ${gasLimit}`,
          );
        }

        // Build tx data for Key Vault signing
        const txData: Record<string, unknown> = {
          data: calldataHex,
          value: '0',
          gasLimit: gasLimit.toString(),
          nonce,
          chainId,
        };

        if (feeData.maxFeePerGas !== null && feeData.maxFeePerGas !== undefined) {
          txData.maxFeePerGas = feeData.maxFeePerGas.toString();
          txData.maxPriorityFeePerGas = (
            feeData.maxPriorityFeePerGas ?? 0n
          ).toString();
        } else if (feeData.gasPrice !== null && feeData.gasPrice !== undefined) {
          txData.gasPrice = feeData.gasPrice.toString();
        } else {
          throw new Error(`Unable to determine gas price for chain ${chainId}`);
        }

        // Store the RPC request we are about to make to Key Vault
        rpcRequest = {
          url: `${this.keyVaultUrl}/keys/${clientId}/sign-transaction`,
          method: 'POST',
          body: {
            clientId,
            chainId,
            keyType: 'gas_tank',
            txData,
            requestedBy: 'project-deploy-service',
          },
          timestamp: new Date().toISOString(),
        };

        // Sign via Key Vault
        this.logger.debug(
          `Signing deploy tx for ${contractName}: project=${projectId} chain=${chainId} nonce=${nonce}`,
        );

        const signRes = await fetch(
          `${this.keyVaultUrl}/keys/${clientId}/sign-transaction`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Service-Key': this.internalServiceKey,
            },
            body: JSON.stringify({
              clientId,
              chainId,
              keyType: 'gas_tank',
              txData,
              requestedBy: 'project-deploy-service',
            }),
          },
        );

        if (!signRes.ok) {
          const body = await signRes.text();
          throw new Error(
            `Key Vault sign-transaction failed (${signRes.status}): ${body}`,
          );
        }

        const signData = (await signRes.json()) as KeyVaultSignResponse;
        if (!signData.success || !signData.signedTransaction) {
          throw new Error(
            `Key Vault sign-transaction returned unsuccessful for ${contractName}`,
          );
        }

        signedTxHex = signData.signedTransaction;

        rpcResponse = {
          status: signRes.status,
          body: signData,
          timestamp: new Date().toISOString(),
        };

        // Broadcast
        this.logger.debug(
          `Broadcasting ${contractName} deploy on chain ${chainId}`,
        );
        const broadcastResult = await provider.broadcastTransaction(signedTxHex);
        txHash = broadcastResult.hash;

        this.logger.log(
          `${contractName} deploy tx submitted: ${txHash} (nonce=${nonce}, chain=${chainId})`,
        );
      } finally {
        await release();
      }

      // Wait for confirmation
      const receipt = await provider.waitForTransaction(txHash, 1, 120_000);
      if (!receipt) {
        throw new Error(
          `Transaction ${txHash} not confirmed within timeout for ${contractName}`,
        );
      }

      if (receipt.status === 0) {
        throw new Error(
          `Transaction ${txHash} reverted on chain ${chainId} for ${contractName}`,
        );
      }

      const contractAddress = receipt.contractAddress;
      if (!contractAddress) {
        throw new Error(
          `No contract address in receipt for ${contractName} tx=${txHash}`,
        );
      }

      // Compute gas cost
      const gasUsed = receipt.gasUsed.toString();
      const gasPrice = receipt.gasPrice.toString();
      const gasCostWei = (receipt.gasUsed * receipt.gasPrice).toString();

      // Build bytecode verification proof
      const runtimeBytecodeHash = ethers.keccak256(
        await provider.getCode(contractAddress),
      );
      const verificationProof = await this.traceService.buildVerificationProof(
        contractAddress,
        runtimeBytecodeHash,
        provider,
      );

      // Build explorer URL
      const explorerUrl = this.traceService.buildExplorerUrl(
        chainId,
        txHash,
        chainExplorerUrl,
      );

      // Update trace as confirmed
      await this.traceService.updateTraceConfirmed(traceId, {
        contractAddress,
        txHash,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        gasUsed,
        gasPrice,
        gasCostWei,
        signedTxHex,
        rpcRequestJson: rpcRequest,
        rpcResponseJson: rpcResponse,
        bytecodeHash: runtimeBytecodeHash,
        verificationProofJson: verificationProof as unknown as Record<string, unknown>,
        explorerUrl,
      });

      this.logger.log(
        `${contractName} deployed at ${contractAddress} on chain ${chainId} (gas=${gasUsed}, cost=${gasCostWei}wei)`,
      );

      return {
        contractAddress,
        txHash,
        traceId,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      await this.traceService.updateTraceFailed(traceId, errMsg);
      throw error;
    }
  }

  /**
   * Deploy the hot wallet via walletFactory.createWallet(signers, salt).
   * The salt is keccak256(abi.encode(projectId, chainId)).
   */
  private async deployHotWallet(params: {
    projectId: number;
    clientId: number;
    chainId: number;
    projectChainId: number;
    walletFactoryAddress: string;
    signers: string[];
    gasTankAddress: string;
    provider: ethers.JsonRpcProvider;
    chainExplorerUrl?: string | null;
  }): Promise<DeployStepResult> {
    const {
      projectId,
      clientId,
      chainId,
      projectChainId,
      walletFactoryAddress,
      signers,
      gasTankAddress,
      provider,
      chainExplorerUrl,
    } = params;

    // Compute salt = keccak256(abi.encode(projectId, chainId))
    const salt = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256'],
        [projectId, chainId],
      ),
    );

    // Build calldata for walletFactory.createWallet(signers, salt)
    const factoryIface = new ethers.Interface([
      'function createWallet(address[] calldata allowedSigners, bytes32 salt) external returns (address payable wallet)',
    ]);
    const calldataHex = factoryIface.encodeFunctionData('createWallet', [
      signers,
      salt,
    ]);

    // Create pending trace
    const traceId = await this.traceService.createTrace({
      projectId,
      chainId,
      projectChainId,
      contractType: 'hot_wallet',
      deployerAddress: gasTankAddress,
      calldataHex,
      constructorArgsJson: {
        signers,
        salt,
        factoryAddress: walletFactoryAddress,
      },
      abiJson: factoryIface.fragments.map((f) => JSON.parse(f.format('json'))),
    });

    try {
      const { nonce, release } = await this.nonceService.acquireNonce(
        chainId,
        gasTankAddress,
      );

      let txHash: string;
      let signedTxHex: string;
      let rpcRequest: Record<string, unknown>;
      let rpcResponse: Record<string, unknown>;

      try {
        const feeData = await provider.getFeeData();

        let gasLimit: bigint;
        try {
          const estimated = await provider.estimateGas({
            from: gasTankAddress,
            to: walletFactoryAddress,
            data: calldataHex,
          });
          gasLimit = (estimated * 120n) / 100n;
        } catch {
          gasLimit = 1_000_000n;
          this.logger.warn(
            `Gas estimation failed for hot wallet deploy, using default ${gasLimit}`,
          );
        }

        const txData: Record<string, unknown> = {
          to: walletFactoryAddress,
          data: calldataHex,
          value: '0',
          gasLimit: gasLimit.toString(),
          nonce,
          chainId,
        };

        if (feeData.maxFeePerGas !== null && feeData.maxFeePerGas !== undefined) {
          txData.maxFeePerGas = feeData.maxFeePerGas.toString();
          txData.maxPriorityFeePerGas = (
            feeData.maxPriorityFeePerGas ?? 0n
          ).toString();
        } else if (feeData.gasPrice !== null && feeData.gasPrice !== undefined) {
          txData.gasPrice = feeData.gasPrice.toString();
        } else {
          throw new Error(`Unable to determine gas price for chain ${chainId}`);
        }

        rpcRequest = {
          url: `${this.keyVaultUrl}/keys/${clientId}/sign-transaction`,
          method: 'POST',
          body: {
            clientId,
            chainId,
            keyType: 'gas_tank',
            txData,
            requestedBy: 'project-deploy-service',
          },
          timestamp: new Date().toISOString(),
        };

        this.logger.debug(
          `Signing hot wallet deploy tx: project=${projectId} chain=${chainId} nonce=${nonce}`,
        );

        const signRes = await fetch(
          `${this.keyVaultUrl}/keys/${clientId}/sign-transaction`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Service-Key': this.internalServiceKey,
            },
            body: JSON.stringify({
              clientId,
              chainId,
              keyType: 'gas_tank',
              txData,
              requestedBy: 'project-deploy-service',
            }),
          },
        );

        if (!signRes.ok) {
          const body = await signRes.text();
          throw new Error(
            `Key Vault sign-transaction failed (${signRes.status}): ${body}`,
          );
        }

        const signData = (await signRes.json()) as KeyVaultSignResponse;
        if (!signData.success || !signData.signedTransaction) {
          throw new Error(
            'Key Vault sign-transaction returned unsuccessful for hot wallet',
          );
        }

        signedTxHex = signData.signedTransaction;

        rpcResponse = {
          status: signRes.status,
          body: signData,
          timestamp: new Date().toISOString(),
        };

        this.logger.debug(
          `Broadcasting hot wallet deploy on chain ${chainId}`,
        );
        const broadcastResult = await provider.broadcastTransaction(signedTxHex);
        txHash = broadcastResult.hash;

        this.logger.log(
          `Hot wallet deploy tx submitted: ${txHash} (nonce=${nonce}, chain=${chainId})`,
        );
      } finally {
        await release();
      }

      // Wait for confirmation
      const receipt = await provider.waitForTransaction(txHash, 1, 120_000);
      if (!receipt) {
        throw new Error(
          `Transaction ${txHash} not confirmed within timeout for hot wallet`,
        );
      }

      if (receipt.status === 0) {
        throw new Error(
          `Transaction ${txHash} reverted on chain ${chainId} for hot wallet`,
        );
      }

      // Parse the WalletCreated event from the factory to get the wallet address
      const factoryForEvent = new ethers.Interface([
        'event WalletCreated(address walletAddress, address[] allowedSigners, bytes32 salt)',
      ]);

      let hotWalletAddress: string | null = null;
      for (const log of receipt.logs) {
        try {
          const parsed = factoryForEvent.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsed && parsed.name === 'WalletCreated') {
            hotWalletAddress = parsed.args[0] as string;
            break;
          }
        } catch {
          // Not our event, skip
        }
      }

      if (!hotWalletAddress) {
        // Fallback: try receipt.contractAddress (unlikely for factory call)
        // or compute from the factory view function
        const factoryContract = new ethers.Contract(
          walletFactoryAddress,
          ['function computeWalletAddress(address[] calldata allowedSigners, bytes32 salt) external view returns (address)'],
          provider,
        );
        hotWalletAddress = await factoryContract.computeWalletAddress(signers, salt);
      }

      const gasUsed = receipt.gasUsed.toString();
      const gasPrice = receipt.gasPrice.toString();
      const gasCostWei = (receipt.gasUsed * receipt.gasPrice).toString();

      // Build explorer URL
      const explorerUrl = this.traceService.buildExplorerUrl(
        chainId,
        txHash,
        chainExplorerUrl,
      );

      if (!hotWalletAddress) {
        throw new Error(
          `Could not determine hot wallet address from factory on chain ${chainId}`,
        );
      }

      // Update trace as confirmed
      await this.traceService.updateTraceConfirmed(traceId, {
        contractAddress: hotWalletAddress,
        txHash,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        gasUsed,
        gasPrice,
        gasCostWei,
        signedTxHex,
        rpcRequestJson: rpcRequest,
        rpcResponseJson: rpcResponse,
        explorerUrl,
      });

      this.logger.log(
        `Hot wallet deployed at ${hotWalletAddress} on chain ${chainId} (gas=${gasUsed}, cost=${gasCostWei}wei)`,
      );

      return {
        contractAddress: hotWalletAddress,
        txHash,
        traceId,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      await this.traceService.updateTraceFailed(traceId, errMsg);
      throw error;
    }
  }

  /**
   * Load a compiled contract artifact from the contracts/artifacts directory.
   * Caches the result for subsequent calls.
   */
  private loadContractArtifact(contractName: string): ContractArtifact {
    const cached = this.artifactCache.get(contractName);
    if (cached) return cached;

    const artifactPath = path.join(
      this.artifactsBasePath,
      `${contractName}.sol`,
      `${contractName}.json`,
    );

    if (!fs.existsSync(artifactPath)) {
      throw new Error(
        `Contract artifact not found at ${artifactPath}`,
      );
    }

    const raw = fs.readFileSync(artifactPath, 'utf-8');
    const parsed = JSON.parse(raw);

    const artifact: ContractArtifact = {
      contractName: parsed.contractName,
      abi: parsed.abi,
      bytecode: parsed.bytecode,
    };

    this.artifactCache.set(contractName, artifact);

    this.logger.log(
      `Loaded contract artifact: ${contractName} (ABI entries: ${artifact.abi.length})`,
    );

    return artifact;
  }
}
