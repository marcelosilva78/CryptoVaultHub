import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from './evm-provider.service';

// Minimal ABIs for the factory contracts
const WALLET_FACTORY_ABI = [
  'function createWallet(address[] calldata allowedSigners, bytes32 salt) external returns (address payable wallet)',
  'function computeWalletAddress(address[] calldata allowedSigners, bytes32 salt) external view returns (address)',
  'function implementationAddress() external view returns (address)',
];

const FORWARDER_FACTORY_ABI = [
  'function createForwarder(address parent, address feeAddress, bytes32 salt, bool _autoFlush721, bool _autoFlush1155) external returns (address payable forwarder)',
  'function computeForwarderAddress(address parent, address feeAddress, bytes32 salt) external view returns (address)',
  'function implementationAddress() external view returns (address)',
];

const MULTICALL3_ABI = [
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) external payable returns (tuple(bool success, bytes returnData)[])',
  'function getEthBalance(address addr) external view returns (uint256 balance)',
];

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
];

export interface ChainContracts {
  walletFactory: ethers.Contract | null;
  forwarderFactory: ethers.Contract | null;
  multicall3: ethers.Contract;
}

@Injectable()
export class ContractService {
  private readonly logger = new Logger(ContractService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evmProvider: EvmProviderService,
  ) {}

  /**
   * Get contract instances for a chain.
   */
  async getContracts(chainId: number): Promise<ChainContracts> {
    const chain = await this.prisma.chain.findUnique({
      where: { id: chainId },
    });
    if (!chain) {
      throw new NotFoundException(`Chain ${chainId} not found`);
    }

    const provider = await this.evmProvider.getProvider(chainId);

    const walletFactory = chain.walletFactoryAddress
      ? new ethers.Contract(
          chain.walletFactoryAddress,
          WALLET_FACTORY_ABI,
          provider,
        )
      : null;

    const forwarderFactory = chain.forwarderFactoryAddress
      ? new ethers.Contract(
          chain.forwarderFactoryAddress,
          FORWARDER_FACTORY_ABI,
          provider,
        )
      : null;

    const multicall3 = new ethers.Contract(
      chain.multicall3Address,
      MULTICALL3_ABI,
      provider,
    );

    return { walletFactory, forwarderFactory, multicall3 };
  }

  /**
   * Compute a forwarder (deposit) address via the factory's view function.
   */
  async computeForwarderAddress(
    chainId: number,
    parentAddress: string,
    feeAddress: string,
    salt: string,
  ): Promise<string> {
    const { forwarderFactory } = await this.getContracts(chainId);
    if (!forwarderFactory) {
      throw new Error(
        `ForwarderFactory not deployed on chain ${chainId}`,
      );
    }
    const address: string = await forwarderFactory.computeForwarderAddress(
      parentAddress,
      feeAddress,
      salt,
    );
    return address;
  }

  /**
   * Compute a wallet address via the factory's view function.
   */
  async computeWalletAddress(
    chainId: number,
    signers: string[],
    salt: string,
  ): Promise<string> {
    const { walletFactory } = await this.getContracts(chainId);
    if (!walletFactory) {
      throw new Error(
        `WalletFactory not deployed on chain ${chainId}`,
      );
    }
    const address: string = await walletFactory.computeWalletAddress(
      signers,
      salt,
    );
    return address;
  }

  /**
   * Get ERC20 balance via direct call.
   */
  async getERC20Balance(
    chainId: number,
    tokenAddress: string,
    accountAddress: string,
  ): Promise<bigint> {
    const provider = await this.evmProvider.getProvider(chainId);
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    return token.balanceOf(accountAddress);
  }

  /**
   * Get native (ETH) balance.
   */
  async getNativeBalance(
    chainId: number,
    address: string,
  ): Promise<bigint> {
    const provider = await this.evmProvider.getProvider(chainId);
    return provider.getBalance(address);
  }

  /**
   * Batch query balances using Multicall3.
   * Returns an array of { token, balance } results.
   */
  async getBalancesViaMulticall(
    chainId: number,
    walletAddress: string,
    tokenAddresses: string[],
  ): Promise<Array<{ tokenAddress: string; balance: bigint }>> {
    const { multicall3 } = await this.getContracts(chainId);
    const erc20Iface = new ethers.Interface(ERC20_ABI);

    const calls = tokenAddresses.map((tokenAddress) => ({
      target: tokenAddress,
      allowFailure: true,
      callData: erc20Iface.encodeFunctionData('balanceOf', [
        walletAddress,
      ]),
    }));

    const results = await multicall3.aggregate3.staticCall(calls);

    return results.map(
      (result: { success: boolean; returnData: string }, i: number) => {
        if (result.success && result.returnData !== '0x') {
          const [balance] = erc20Iface.decodeFunctionResult(
            'balanceOf',
            result.returnData,
          );
          return {
            tokenAddress: tokenAddresses[i],
            balance: balance as bigint,
          };
        }
        return { tokenAddress: tokenAddresses[i], balance: 0n };
      },
    );
  }
}
