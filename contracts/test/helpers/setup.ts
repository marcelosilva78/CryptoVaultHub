import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

export interface NamedSigners {
  deployer: SignerWithAddress;
  signer1: SignerWithAddress;
  signer2: SignerWithAddress;
  signer3: SignerWithAddress;
  feeAddress: SignerWithAddress;
  recipient: SignerWithAddress;
  other: SignerWithAddress;
}

/**
 * Returns named signers for test convenience.
 */
export async function getSigners(): Promise<NamedSigners> {
  const signers = await ethers.getSigners();
  return {
    deployer: signers[0],
    signer1: signers[1],
    signer2: signers[2],
    signer3: signers[3],
    feeAddress: signers[4],
    recipient: signers[5],
    other: signers[6],
  };
}

/**
 * Returns a UNIX timestamp N seconds in the future.
 */
export function futureTimestamp(seconds: number): number {
  return Math.floor(Date.now() / 1000) + seconds;
}

/**
 * Creates the operationHash that CvhWalletSimple expects for sendMultiSig.
 *
 * The contract computes:
 *   keccak256(abi.encode(getNetworkId(), address(this), toAddress, value, data, expireTime, sequenceId))
 *
 * where getNetworkId() returns the chain ID as a string ("31337" on hardhat).
 */
export function createOperationHash(
  networkId: string,
  walletAddress: string,
  toAddress: string,
  value: bigint,
  data: string,
  expireTime: number,
  sequenceId: number
): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'address', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
      [networkId, walletAddress, toAddress, value, data, expireTime, sequenceId]
    )
  );
}

/**
 * Creates the operationHash for sendMultiSigToken.
 *
 * The contract computes:
 *   keccak256(abi.encode(getTokenNetworkId(), address(this), toAddress, value, tokenContractAddress, expireTime, sequenceId))
 */
export function createTokenOperationHash(
  networkId: string,
  walletAddress: string,
  toAddress: string,
  value: bigint,
  tokenContractAddress: string,
  expireTime: number,
  sequenceId: number
): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'address', 'address', 'uint256', 'address', 'uint256', 'uint256'],
      [`${networkId}-ERC20`, walletAddress, toAddress, value, tokenContractAddress, expireTime, sequenceId]
    )
  );
}

/**
 * Creates the operationHash for sendMultiSigBatch.
 *
 * The contract computes:
 *   keccak256(abi.encode(getBatchNetworkId(), address(this), recipients, values, expireTime, sequenceId))
 */
export function createBatchOperationHash(
  networkId: string,
  walletAddress: string,
  recipients: string[],
  values: bigint[],
  expireTime: number,
  sequenceId: number
): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'address', 'address[]', 'uint256[]', 'uint256', 'uint256'],
      [`${networkId}-Batch`, walletAddress, recipients, values, expireTime, sequenceId]
    )
  );
}

/**
 * Signs an operation hash using the given signer.
 *
 * The contract's _recoverSigner prepends "\x19Ethereum Signed Message:\n32"
 * before calling ecrecover. Using signer.signMessage(bytes) applies the same
 * prefix, producing a compatible 65-byte signature.
 */
export async function signOperationHash(
  signer: SignerWithAddress,
  operationHash: string
): Promise<string> {
  // signMessage adds the EIP-191 prefix ("\x19Ethereum Signed Message:\n32")
  // which matches the contract's _recoverSigner logic.
  return signer.signMessage(ethers.getBytes(operationHash));
}
