import { ethers } from 'ethers';

export interface NativeHashInput {
  chainId: number;
  walletAddress: string;
  toAddress: string;
  value: bigint;
  data: string;
  expireTime: number;
  sequenceId: number;
}

export interface Erc20HashInput {
  chainId: number;
  walletAddress: string;
  toAddress: string;
  value: bigint;
  tokenContractAddress: string;
  expireTime: number;
  sequenceId: number;
}

/**
 * Compute the operationHash for a CvhWalletSimple.sendMultiSig call.
 *
 * Mirrors the on-chain formula:
 *   keccak256(abi.encode(getNetworkId(), address(this), toAddress, value, data, expireTime, sequenceId))
 *
 * where getNetworkId() = Strings.toString(block.chainid).
 */
export function buildNativeOperationHash(input: NativeHashInput): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'address', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
      [
        String(input.chainId),
        input.walletAddress,
        input.toAddress,
        input.value,
        input.data,
        input.expireTime,
        input.sequenceId,
      ],
    ),
  );
}

/**
 * Compute the operationHash for a CvhWalletSimple.sendMultiSigToken call.
 *
 *   keccak256(abi.encode(getTokenNetworkId(), address(this), toAddress, value, tokenAddr, expireTime, sequenceId))
 *
 * where getTokenNetworkId() = getNetworkId() + "-ERC20".
 */
export function buildErc20OperationHash(input: Erc20HashInput): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'address', 'address', 'uint256', 'address', 'uint256', 'uint256'],
      [
        `${input.chainId}-ERC20`,
        input.walletAddress,
        input.toAddress,
        input.value,
        input.tokenContractAddress,
        input.expireTime,
        input.sequenceId,
      ],
    ),
  );
}

/**
 * Apply the EIP-191 "\x19Ethereum Signed Message:\n32" prefix to a 32-byte hash.
 * The contract expects the signature to be over this prefixed hash because
 * Solidity's `ecrecover` is paired with the prefix when verifying typical signed messages.
 */
export function applyEthSignedMessagePrefix(operationHash: string): string {
  return ethers.solidityPackedKeccak256(
    ['string', 'bytes32'],
    ['\x19Ethereum Signed Message:\n32', operationHash],
  );
}
