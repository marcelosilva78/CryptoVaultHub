import { expect } from 'chai';
import { ethers } from 'hardhat';
import { CvhForwarder, CvhForwarderFactory, CvhWalletSimple, MockERC20 } from '../typechain-types';
import { getSigners, NamedSigners } from './helpers/setup';

describe('CvhForwarder', () => {
  let forwarderFactory: CvhForwarderFactory;
  let token: MockERC20;
  let s: NamedSigners;
  let saltCounter = 0;

  beforeEach(async () => {
    s = await getSigners();
    saltCounter = 0;

    // Deploy forwarder implementation (constructor sets initialized = true)
    const ForwarderImplFactory = await ethers.getContractFactory('CvhForwarder');
    const forwarderImpl = await ForwarderImplFactory.deploy();
    await forwarderImpl.waitForDeployment();

    // Deploy forwarder factory
    const ForwarderFactoryFactory = await ethers.getContractFactory('CvhForwarderFactory');
    forwarderFactory = await ForwarderFactoryFactory.deploy(await forwarderImpl.getAddress());
    await forwarderFactory.waitForDeployment();

    const TokenFactory = await ethers.getContractFactory('MockERC20');
    token = await TokenFactory.deploy('TestToken', 'TT', 18);
    await token.waitForDeployment();
  });

  /**
   * Helper: deploy a forwarder clone via the factory.
   */
  async function deployForwarderClone(
    parent: string,
    feeAddr: string,
    autoFlush721 = true,
    autoFlush1155 = true
  ): Promise<CvhForwarder> {
    const salt = ethers.id(`test-salt-forwarder-${saltCounter++}`);
    const tx = await forwarderFactory.createForwarder(parent, feeAddr, salt, autoFlush721, autoFlush1155);
    const receipt = await tx.wait();

    const event = receipt!.logs.find((log) => {
      try {
        return forwarderFactory.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === 'ForwarderCreated';
      } catch {
        return false;
      }
    });
    const parsedEvent = forwarderFactory.interface.parseLog({
      topics: event!.topics as string[],
      data: event!.data,
    });
    const forwarderAddress = parsedEvent!.args.forwarderAddress;
    return (await ethers.getContractAt('CvhForwarder', forwarderAddress)) as CvhForwarder;
  }

  // ---------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------
  describe('Initialization', () => {
    it('Sets parent and feeAddress correctly', async () => {
      const forwarder = await deployForwarderClone(s.signer1.address, s.feeAddress.address);

      expect(await forwarder.parentAddress()).to.equal(s.signer1.address);
      expect(await forwarder.feeAddress()).to.equal(s.feeAddress.address);
      expect(await forwarder.initialized()).to.equal(true);
    });

    it('Does not allow re-initialization', async () => {
      const forwarder = await deployForwarderClone(s.signer1.address, s.feeAddress.address);

      await expect(
        forwarder.init(s.signer2.address, s.feeAddress.address, true, true)
      ).to.be.revertedWithCustomError(forwarder, 'AlreadyInitialized');
    });

    it('Implementation contract is initialized at deployment', async () => {
      const ForwarderImplFactory = await ethers.getContractFactory('CvhForwarder');
      const impl = await ForwarderImplFactory.deploy();
      await impl.waitForDeployment();

      expect(await impl.initialized()).to.equal(true);
      await expect(
        impl.init(s.signer1.address, s.feeAddress.address, true, true)
      ).to.be.revertedWithCustomError(impl, 'AlreadyInitialized');
    });

    it('Rejects zero fee address', async () => {
      const ForwarderImplFactory = await ethers.getContractFactory('CvhForwarder');
      const forwarderForError = await ForwarderImplFactory.deploy();
      await forwarderForError.waitForDeployment();

      const salt = ethers.id('test-salt-zero-fee');
      await expect(
        forwarderFactory.createForwarder(s.signer1.address, ethers.ZeroAddress, salt, true, true)
      ).to.be.revertedWithCustomError(forwarderForError, 'ZeroFeeAddress');
    });
  });

  // ---------------------------------------------------------------
  // ETH Auto-Forward
  // ---------------------------------------------------------------
  describe('ETH Auto-Forward', () => {
    it('Auto-forwards ETH to parent on receive', async () => {
      // Use a CvhWalletSimple as parent so it can receive ETH
      const WalletImplFactory = await ethers.getContractFactory('CvhWalletSimple');
      const parentWallet = await WalletImplFactory.deploy();
      await parentWallet.waitForDeployment();
      const parentAddr = await parentWallet.getAddress();

      const forwarder = await deployForwarderClone(parentAddr, s.feeAddress.address);

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
      const WalletImplFactory = await ethers.getContractFactory('CvhWalletSimple');
      const parentWallet = await WalletImplFactory.deploy();
      await parentWallet.waitForDeployment();
      const parentAddr = await parentWallet.getAddress();

      const forwarder = await deployForwarderClone(parentAddr, s.feeAddress.address);

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
    let forwarder: CvhForwarder;
    let parentAddr: string;
    let forwarderAddr: string;

    beforeEach(async () => {
      // parent = signer1, feeAddress = feeAddress signer
      forwarder = await deployForwarderClone(s.signer1.address, s.feeAddress.address);
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
      ).to.be.revertedWithCustomError(forwarder, 'NotAllowed');
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
      const forwarder = await deployForwarderClone(s.signer1.address, s.feeAddress.address);
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
      const forwarder = await deployForwarderClone(s.signer1.address, s.feeAddress.address);

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
      ).to.be.revertedWithCustomError(forwarder, 'NotParent');
    });
  });
});
