import { expect } from 'chai';
import { ethers } from 'hardhat';
import { CvhForwarder, MockERC20 } from '../typechain-types';
import { getSigners, NamedSigners } from './helpers/setup';

describe('CvhForwarder', () => {
  let forwarder: CvhForwarder;
  let token: MockERC20;
  let s: NamedSigners;

  beforeEach(async () => {
    s = await getSigners();

    const ForwarderFactory = await ethers.getContractFactory('CvhForwarder');
    forwarder = await ForwarderFactory.deploy();
    await forwarder.waitForDeployment();

    const TokenFactory = await ethers.getContractFactory('MockERC20');
    token = await TokenFactory.deploy('TestToken', 'TT', 18);
    await token.waitForDeployment();
  });

  // ---------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------
  describe('Initialization', () => {
    it('Sets parent and feeAddress correctly', async () => {
      await forwarder.init(s.signer1.address, s.feeAddress.address, true, true);

      expect(await forwarder.parentAddress()).to.equal(s.signer1.address);
      expect(await forwarder.feeAddress()).to.equal(s.feeAddress.address);
      expect(await forwarder.initialized()).to.equal(true);
    });

    it('Does not allow re-initialization', async () => {
      await forwarder.init(s.signer1.address, s.feeAddress.address, true, true);
      await expect(
        forwarder.init(s.signer2.address, s.feeAddress.address, true, true)
      ).to.be.revertedWith('CvhForwarder: already initialized');
    });
  });

  // ---------------------------------------------------------------
  // ETH Auto-Forward
  // ---------------------------------------------------------------
  describe('ETH Auto-Forward', () => {
    it('Auto-forwards ETH to parent on receive', async () => {
      // Use deployer as parent so we can easily track balance
      // (deployer is not sending ETH to forwarder — signer1 is)
      const parentWallet = await (
        await ethers.getContractFactory('CvhWalletSimple')
      ).deploy();
      await parentWallet.waitForDeployment();
      const parentAddr = await parentWallet.getAddress();

      await forwarder.init(parentAddr, s.feeAddress.address, true, true);

      const forwarderAddr = await forwarder.getAddress();
      const amount = ethers.parseEther('1');

      const parentBalanceBefore = await ethers.provider.getBalance(parentAddr);

      // Send ETH to forwarder — should auto-forward to parent
      await s.deployer.sendTransaction({ to: forwarderAddr, value: amount });

      const forwarderBalance = await ethers.provider.getBalance(forwarderAddr);
      const parentBalanceAfter = await ethers.provider.getBalance(parentAddr);

      expect(forwarderBalance).to.equal(0n);
      expect(parentBalanceAfter - parentBalanceBefore).to.equal(amount);
    });

    it('Emits ForwarderDeposited event', async () => {
      const parentWallet = await (
        await ethers.getContractFactory('CvhWalletSimple')
      ).deploy();
      await parentWallet.waitForDeployment();
      const parentAddr = await parentWallet.getAddress();

      await forwarder.init(parentAddr, s.feeAddress.address, true, true);

      const forwarderAddr = await forwarder.getAddress();
      const amount = ethers.parseEther('1');

      await expect(
        s.deployer.sendTransaction({ to: forwarderAddr, value: amount })
      )
        .to.emit(forwarder, 'ForwarderDeposited')
        .withArgs(forwarderAddr, amount);
    });
  });

  // ---------------------------------------------------------------
  // ERC20 Flush
  // ---------------------------------------------------------------
  describe('ERC20 Flush', () => {
    let parentAddr: string;
    let forwarderAddr: string;

    beforeEach(async () => {
      // parent = signer1, feeAddress = feeAddress signer
      await forwarder.init(s.signer1.address, s.feeAddress.address, true, true);
      parentAddr = s.signer1.address;
      forwarderAddr = await forwarder.getAddress();

      // Mint tokens to forwarder
      await token.mint(forwarderAddr, ethers.parseEther('100'));
    });

    it('Flushes tokens when called by parent', async () => {
      const tokenAddr = await token.getAddress();

      await forwarder.connect(s.signer1).flushTokens(tokenAddr);

      expect(await token.balanceOf(forwarderAddr)).to.equal(0n);
      expect(await token.balanceOf(parentAddr)).to.equal(ethers.parseEther('100'));
    });

    it('Flushes tokens when called by feeAddress', async () => {
      const tokenAddr = await token.getAddress();

      await forwarder.connect(s.feeAddress).flushTokens(tokenAddr);

      expect(await token.balanceOf(forwarderAddr)).to.equal(0n);
      expect(await token.balanceOf(parentAddr)).to.equal(ethers.parseEther('100'));
    });

    it('Rejects flush from unauthorized address', async () => {
      const tokenAddr = await token.getAddress();

      await expect(
        forwarder.connect(s.other).flushTokens(tokenAddr)
      ).to.be.revertedWith('CvhForwarder: not allowed');
    });

    it('Handles zero balance gracefully (no revert)', async () => {
      // Deploy a second token with zero balance on forwarder
      const Token2Factory = await ethers.getContractFactory('MockERC20');
      const token2 = await Token2Factory.deploy('Token2', 'T2', 18);
      await token2.waitForDeployment();

      // Should not revert even though balance is 0
      await expect(
        forwarder.connect(s.signer1).flushTokens(await token2.getAddress())
      ).to.not.be.reverted;
    });
  });

  // ---------------------------------------------------------------
  // Batch Flush
  // ---------------------------------------------------------------
  describe('Batch Flush', () => {
    it('Flushes multiple tokens in one transaction', async () => {
      await forwarder.init(s.signer1.address, s.feeAddress.address, true, true);
      const forwarderAddr = await forwarder.getAddress();

      const Token2Factory = await ethers.getContractFactory('MockERC20');
      const tokenA = await Token2Factory.deploy('TokenA', 'TA', 18);
      const tokenB = await Token2Factory.deploy('TokenB', 'TB', 18);
      await tokenA.waitForDeployment();
      await tokenB.waitForDeployment();

      // Mint tokens to forwarder
      await tokenA.mint(forwarderAddr, ethers.parseEther('50'));
      await tokenB.mint(forwarderAddr, ethers.parseEther('75'));

      const tokenAAddr = await tokenA.getAddress();
      const tokenBAddr = await tokenB.getAddress();

      // Batch flush
      await forwarder
        .connect(s.signer1)
        .batchFlushERC20Tokens([tokenAAddr, tokenBAddr]);

      expect(await tokenA.balanceOf(forwarderAddr)).to.equal(0n);
      expect(await tokenB.balanceOf(forwarderAddr)).to.equal(0n);
      expect(await tokenA.balanceOf(s.signer1.address)).to.equal(ethers.parseEther('50'));
      expect(await tokenB.balanceOf(s.signer1.address)).to.equal(ethers.parseEther('75'));
    });
  });

  // ---------------------------------------------------------------
  // callFromParent
  // ---------------------------------------------------------------
  describe('callFromParent', () => {
    it('Only allows parent (not feeAddress) to execute arbitrary calls', async () => {
      await forwarder.init(s.signer1.address, s.feeAddress.address, true, true);

      // Parent can call
      await expect(
        forwarder
          .connect(s.signer1)
          .callFromParent(s.recipient.address, 0, '0x')
      ).to.not.be.reverted;

      // feeAddress cannot call
      await expect(
        forwarder
          .connect(s.feeAddress)
          .callFromParent(s.recipient.address, 0, '0x')
      ).to.be.revertedWith('CvhForwarder: not parent');
    });
  });
});
