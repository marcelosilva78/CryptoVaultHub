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
 *   keccak256(abi.encode(getNetworkId(), toAddress, value, data, expireTime, sequenceId))
 *
 * where getNetworkId() returns the chain ID as a string ("31337" on hardhat).
 */
export function createOperationHash(
  networkId: string,
  toAddress: string,
  value: bigint,
  data: string,
  expireTime: number,
  sequenceId: number
): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
      [networkId, toAddress, value, data, expireTime, sequenceId]
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
