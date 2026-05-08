import { ethers } from 'ethers';
import {
  buildNativeOperationHash,
  buildErc20OperationHash,
  applyEthSignedMessagePrefix,
} from './operation-hash';

describe('operation-hash', () => {
  // Golden vector — values chosen to be easy to reproduce manually.
  const chainId = 56;
  const walletAddress = '0x17193A58d73825485393E00ecE33051Fa2536415';
  const toAddress = '0x95DEda8f5FCB60bf02656b226950329e67c605a4';
  const value = 5_000_000_000_000_000n; // 0.005 BNB
  const data = '0x';
  const expireTime = 1778211720;
  const sequenceId = 1;

  it('buildNativeOperationHash matches abi.encode(networkId, walletAddr, toAddr, value, data, expireTime, sequenceId)', () => {
    const expected = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'address', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
        [String(chainId), walletAddress, toAddress, value, data, expireTime, sequenceId],
      ),
    );

    const actual = buildNativeOperationHash({
      chainId,
      walletAddress,
      toAddress,
      value,
      data,
      expireTime,
      sequenceId,
    });

    expect(actual).toBe(expected);
  });

  it('buildErc20OperationHash matches abi.encode(networkId+"-ERC20", walletAddr, toAddr, value, tokenAddr, expireTime, sequenceId)', () => {
    const tokenContractAddress = '0x55d398326f99059fF775485246999027B3197955';
    const expected = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'address', 'address', 'uint256', 'address', 'uint256', 'uint256'],
        [`${chainId}-ERC20`, walletAddress, toAddress, value, tokenContractAddress, expireTime, sequenceId],
      ),
    );

    const actual = buildErc20OperationHash({
      chainId,
      walletAddress,
      toAddress,
      value,
      tokenContractAddress,
      expireTime,
      sequenceId,
    });

    expect(actual).toBe(expected);
  });

  it('applyEthSignedMessagePrefix matches EIP-191 prefixing', () => {
    const op = '0x' + 'aa'.repeat(32);
    const expected = ethers.solidityPackedKeccak256(
      ['string', 'bytes32'],
      ['\x19Ethereum Signed Message:\n32', op],
    );
    expect(applyEthSignedMessagePrefix(op)).toBe(expected);
  });
});
