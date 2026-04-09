import { expect } from 'chai';
import { ethers } from 'hardhat';
import { CvhWalletSimple, CvhWalletFactory } from '../typechain-types';
import {
  getSigners,
  futureTimestamp,
  createOperationHash,
  createTokenOperationHash,
  createBatchOperationHash,
  signOperationHash,
  NamedSigners,
} from './helpers/setup';
import { MockERC20 } from '../typechain-types';

describe('CvhWalletSimple', () => {
  let wallet: CvhWalletSimple;
  let walletFactory: CvhWalletFactory;
  let s: NamedSigners;
  const NETWORK_ID = '31337';

  beforeEach(async () => {
    s = await getSigners();

    // Deploy implementation (constructor sets initialized = true)
    const ImplFactory = await ethers.getContractFactory('CvhWalletSimple');
    const impl = await ImplFactory.deploy();
    await impl.waitForDeployment();

    // Deploy factory
    const WalletFactoryFactory = await ethers.getContractFactory('CvhWalletFactory');
    walletFactory = await WalletFactoryFactory.deploy(await impl.getAddress());
    await walletFactory.waitForDeployment();
  });

  /**
   * Helper: deploy a wallet clone via the factory and return the CvhWalletSimple instance.
   */
  async function deployWalletClone(signerAddresses: string[]): Promise<CvhWalletSimple> {
    const salt = ethers.id('test-salt-wallet');
    const tx = await walletFactory.createWallet(signerAddresses, salt);
    const receipt = await tx.wait();

    const event = receipt!.logs.find((log) => {
      try {
        return walletFactory.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === 'WalletCreated';
      } catch {
        return false;
      }
    });
    const parsedEvent = walletFactory.interface.parseLog({
      topics: event!.topics as string[],
      data: event!.data,
    });
    const walletAddress = parsedEvent!.args.walletAddress;
    return (await ethers.getContractAt('CvhWalletSimple', walletAddress)) as CvhWalletSimple;
  }

  // ---------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------
  describe('Initialization', () => {
    it('Sets 3 signers correctly', async () => {
      wallet = await deployWalletClone([s.signer1.address, s.signer2.address, s.signer3.address]);

      expect(await wallet.initialized()).to.equal(true);
      expect(await wallet.isSigner(s.signer1.address)).to.equal(true);
      expect(await wallet.isSigner(s.signer2.address)).to.equal(true);
      expect(await wallet.isSigner(s.signer3.address)).to.equal(true);
      expect(await wallet.signers(0)).to.equal(s.signer1.address);
      expect(await wallet.signers(1)).to.equal(s.signer2.address);
      expect(await wallet.signers(2)).to.equal(s.signer3.address);
    });

    it('Does not allow re-initialization', async () => {
      wallet = await deployWalletClone([s.signer1.address, s.signer2.address, s.signer3.address]);

      await expect(
        wallet.init([s.signer1.address, s.signer2.address, s.signer3.address])
      ).to.be.revertedWithCustomError(wallet, 'AlreadyInitialized');
    });

    it('Implementation contract is initialized at deployment', async () => {
      const ImplFactory = await ethers.getContractFactory('CvhWalletSimple');
      const impl = await ImplFactory.deploy();
      await impl.waitForDeployment();

      expect(await impl.initialized()).to.equal(true);
      await expect(
        impl.init([s.signer1.address, s.signer2.address, s.signer3.address])
      ).to.be.revertedWithCustomError(impl, 'AlreadyInitialized');
    });

    it('Rejects less than 3 signers', async () => {
      // Deploy a bare clone to test init validation
      const salt = ethers.id('test-salt-reject');
      const ImplFactory = await ethers.getContractFactory('CvhWalletSimple');
      const walletForError = await ImplFactory.deploy();
      await walletForError.waitForDeployment();

      await expect(
        walletFactory.createWallet([s.signer1.address, s.signer2.address], salt)
      ).to.be.revertedWithCustomError(walletForError, 'RequiresThreeSigners');
    });
  });

  // ---------------------------------------------------------------
  // Deposits
  // ---------------------------------------------------------------
  describe('Deposits', () => {
    beforeEach(async () => {
      wallet = await deployWalletClone([s.signer1.address, s.signer2.address, s.signer3.address]);
    });

    it('Receives ETH and emits Deposited event', async () => {
      const amount = ethers.parseEther('1');
      const walletAddr = await wallet.getAddress();

      await expect(
        s.deployer.sendTransaction({ to: walletAddr, value: amount })
      )
        .to.emit(wallet, 'Deposited')
        .withArgs(s.deployer.address, amount, '0x');
    });

    it('Has correct balance after deposit', async () => {
      const amount = ethers.parseEther('2');
      const walletAddr = await wallet.getAddress();

      await s.deployer.sendTransaction({ to: walletAddr, value: amount });

      const balance = await ethers.provider.getBalance(walletAddr);
      expect(balance).to.equal(amount);
    });
  });

  // ---------------------------------------------------------------
  // sendMultiSig (2-of-3 signing)
  // ---------------------------------------------------------------
  describe('sendMultiSig', () => {
    const SEND_VALUE = ethers.parseEther('0.5');

    beforeEach(async () => {
      wallet = await deployWalletClone([s.signer1.address, s.signer2.address, s.signer3.address]);

      // Fund the wallet
      const walletAddr = await wallet.getAddress();
      await s.deployer.sendTransaction({
        to: walletAddr,
        value: ethers.parseEther('10'),
      });
    });

    it('Executes ETH transfer with valid 2-of-3 signature', async () => {
      const expireTime = futureTimestamp(3600);
      const sequenceId = 1;
      const data = '0x';

      const operationHash = createOperationHash(
        NETWORK_ID,
        s.recipient.address,
        SEND_VALUE,
        data,
        expireTime,
        sequenceId
      );

      // signer2 provides offline signature
      const signature = await signOperationHash(s.signer2, operationHash);

      const balanceBefore = await ethers.provider.getBalance(s.recipient.address);

      // signer1 is msg.sender
      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSig(
            s.recipient.address,
            SEND_VALUE,
            data,
            expireTime,
            sequenceId,
            signature
          )
      ).to.emit(wallet, 'Transacted');

      const balanceAfter = await ethers.provider.getBalance(s.recipient.address);
      expect(balanceAfter - balanceBefore).to.equal(SEND_VALUE);
    });

    it('Rejects self-signing (same signer for both)', async () => {
      const expireTime = futureTimestamp(3600);
      const sequenceId = 1;
      const data = '0x';

      const operationHash = createOperationHash(
        NETWORK_ID,
        s.recipient.address,
        SEND_VALUE,
        data,
        expireTime,
        sequenceId
      );

      // signer1 signs AND sends — should be rejected
      const signature = await signOperationHash(s.signer1, operationHash);

      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSig(
            s.recipient.address,
            SEND_VALUE,
            data,
            expireTime,
            sequenceId,
            signature
          )
      ).to.be.revertedWithCustomError(wallet, 'SignersMustBeDifferent');
    });

    it('Rejects expired transaction', async () => {
      // Use a timestamp in the past
      const expireTime = Math.floor(Date.now() / 1000) - 3600;
      const sequenceId = 1;
      const data = '0x';

      const operationHash = createOperationHash(
        NETWORK_ID,
        s.recipient.address,
        SEND_VALUE,
        data,
        expireTime,
        sequenceId
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSig(
            s.recipient.address,
            SEND_VALUE,
            data,
            expireTime,
            sequenceId,
            signature
          )
      ).to.be.revertedWithCustomError(wallet, 'Expired');
    });

    it('Rejects non-signer as msg.sender', async () => {
      const expireTime = futureTimestamp(3600);
      const sequenceId = 1;
      const data = '0x';

      const operationHash = createOperationHash(
        NETWORK_ID,
        s.recipient.address,
        SEND_VALUE,
        data,
        expireTime,
        sequenceId
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      // other is not a signer
      await expect(
        wallet
          .connect(s.other)
          .sendMultiSig(
            s.recipient.address,
            SEND_VALUE,
            data,
            expireTime,
            sequenceId,
            signature
          )
      ).to.be.revertedWithCustomError(wallet, 'NotASigner');
    });
  });

  // ---------------------------------------------------------------
  // Safe Mode
  // ---------------------------------------------------------------
  describe('Safe Mode', () => {
    beforeEach(async () => {
      wallet = await deployWalletClone([s.signer1.address, s.signer2.address, s.signer3.address]);
    });

    it('Activates safe mode and emits event', async () => {
      await expect(wallet.connect(s.signer1).activateSafeMode())
        .to.emit(wallet, 'SafeModeActivated')
        .withArgs(s.signer1.address);

      expect(await wallet.safeMode()).to.equal(true);
    });

    it('Rejects non-signer activating safe mode', async () => {
      await expect(
        wallet.connect(s.other).activateSafeMode()
      ).to.be.revertedWithCustomError(wallet, 'NotASigner');
    });
  });

  // ---------------------------------------------------------------
  // Sequence IDs
  // ---------------------------------------------------------------
  describe('Sequence IDs', () => {
    beforeEach(async () => {
      wallet = await deployWalletClone([s.signer1.address, s.signer2.address, s.signer3.address]);
    });

    it('Returns 1 as first available sequence ID', async () => {
      const nextId = await wallet.getNextSequenceId();
      expect(nextId).to.equal(1n);
    });
  });

  // ---------------------------------------------------------------
  // sendMultiSigBatch (2-of-3 batch ETH transfers)
  // ---------------------------------------------------------------
  describe('sendMultiSigBatch', () => {
    beforeEach(async () => {
      wallet = await deployWalletClone([s.signer1.address, s.signer2.address, s.signer3.address]);

      // Fund the wallet
      const walletAddr = await wallet.getAddress();
      await s.deployer.sendTransaction({
        to: walletAddr,
        value: ethers.parseEther('20'),
      });
    });

    it('Executes batch ETH transfer with valid 2-of-3 signature', async () => {
      const recipients = [s.recipient.address, s.other.address];
      const values = [ethers.parseEther('1'), ethers.parseEther('2')];
      const expireTime = futureTimestamp(3600);
      const sequenceId = 1;

      const operationHash = createBatchOperationHash(
        NETWORK_ID,
        recipients,
        values,
        expireTime,
        sequenceId
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      const recipientBefore = await ethers.provider.getBalance(s.recipient.address);
      const otherBefore = await ethers.provider.getBalance(s.other.address);

      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSigBatch(recipients, values, expireTime, sequenceId, signature)
      ).to.emit(wallet, 'BatchTransacted');

      const recipientAfter = await ethers.provider.getBalance(s.recipient.address);
      const otherAfter = await ethers.provider.getBalance(s.other.address);

      expect(recipientAfter - recipientBefore).to.equal(ethers.parseEther('1'));
      expect(otherAfter - otherBefore).to.equal(ethers.parseEther('2'));
    });

    it('Emits BatchTransfer event for each recipient', async () => {
      const recipients = [s.recipient.address, s.other.address];
      const values = [ethers.parseEther('1'), ethers.parseEther('2')];
      const expireTime = futureTimestamp(3600);
      const sequenceId = 1;

      const operationHash = createBatchOperationHash(
        NETWORK_ID,
        recipients,
        values,
        expireTime,
        sequenceId
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      const tx = wallet
        .connect(s.signer1)
        .sendMultiSigBatch(recipients, values, expireTime, sequenceId, signature);

      await expect(tx)
        .to.emit(wallet, 'BatchTransfer')
        .withArgs(s.signer1.address, s.recipient.address, ethers.parseEther('1'));
      await expect(tx)
        .to.emit(wallet, 'BatchTransfer')
        .withArgs(s.signer1.address, s.other.address, ethers.parseEther('2'));
    });

    it('Rejects batch with mismatched array lengths', async () => {
      const recipients = [s.recipient.address, s.other.address];
      const values = [ethers.parseEther('1')]; // mismatched
      const expireTime = futureTimestamp(3600);
      const sequenceId = 1;

      // Hash with correct data shape (the contract checks before verifying sig)
      const operationHash = createBatchOperationHash(
        NETWORK_ID,
        recipients,
        values,
        expireTime,
        sequenceId
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSigBatch(recipients, values, expireTime, sequenceId, signature)
      ).to.be.revertedWithCustomError(wallet, 'UnequalLengths');
    });

    it('Rejects empty batch', async () => {
      const expireTime = futureTimestamp(3600);
      const sequenceId = 1;

      const operationHash = createBatchOperationHash(
        NETWORK_ID,
        [],
        [],
        expireTime,
        sequenceId
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSigBatch([], [], expireTime, sequenceId, signature)
      ).to.be.revertedWithCustomError(wallet, 'EmptyBatch');
    });

    it('Rejects batch exceeding 255 recipients', async () => {
      const recipients = Array(256).fill(s.recipient.address);
      const values = Array(256).fill(ethers.parseEther('0.001'));
      const expireTime = futureTimestamp(3600);
      const sequenceId = 1;

      const operationHash = createBatchOperationHash(
        NETWORK_ID,
        recipients,
        values,
        expireTime,
        sequenceId
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSigBatch(recipients, values, expireTime, sequenceId, signature)
      ).to.be.revertedWithCustomError(wallet, 'MaxRecipientsExceeded');
    });

    it('Rejects batch in safe mode', async () => {
      await wallet.connect(s.signer1).activateSafeMode();

      const recipients = [s.recipient.address];
      const values = [ethers.parseEther('1')];
      const expireTime = futureTimestamp(3600);
      const sequenceId = 1;

      const operationHash = createBatchOperationHash(
        NETWORK_ID,
        recipients,
        values,
        expireTime,
        sequenceId
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSigBatch(recipients, values, expireTime, sequenceId, signature)
      ).to.be.revertedWithCustomError(wallet, 'BatchNotAllowedInSafeMode');
    });

    it('Rejects non-signer as msg.sender', async () => {
      const recipients = [s.recipient.address];
      const values = [ethers.parseEther('1')];
      const expireTime = futureTimestamp(3600);
      const sequenceId = 1;

      const operationHash = createBatchOperationHash(
        NETWORK_ID,
        recipients,
        values,
        expireTime,
        sequenceId
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      await expect(
        wallet
          .connect(s.other)
          .sendMultiSigBatch(recipients, values, expireTime, sequenceId, signature)
      ).to.be.revertedWithCustomError(wallet, 'NotASigner');
    });

    it('Rejects self-signing in batch', async () => {
      const recipients = [s.recipient.address];
      const values = [ethers.parseEther('1')];
      const expireTime = futureTimestamp(3600);
      const sequenceId = 1;

      const operationHash = createBatchOperationHash(
        NETWORK_ID,
        recipients,
        values,
        expireTime,
        sequenceId
      );

      // signer1 signs AND sends
      const signature = await signOperationHash(s.signer1, operationHash);

      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSigBatch(recipients, values, expireTime, sequenceId, signature)
      ).to.be.revertedWithCustomError(wallet, 'SignersMustBeDifferent');
    });

    it('Rejects expired batch transaction', async () => {
      const recipients = [s.recipient.address];
      const values = [ethers.parseEther('1')];
      const expireTime = Math.floor(Date.now() / 1000) - 3600; // in the past
      const sequenceId = 1;

      const operationHash = createBatchOperationHash(
        NETWORK_ID,
        recipients,
        values,
        expireTime,
        sequenceId
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSigBatch(recipients, values, expireTime, sequenceId, signature)
      ).to.be.revertedWithCustomError(wallet, 'Expired');
    });

    it('Works with signer3 providing offline signature and signer2 sending', async () => {
      const recipients = [s.recipient.address];
      const values = [ethers.parseEther('3')];
      const expireTime = futureTimestamp(3600);
      const sequenceId = 1;

      const operationHash = createBatchOperationHash(
        NETWORK_ID,
        recipients,
        values,
        expireTime,
        sequenceId
      );

      const signature = await signOperationHash(s.signer3, operationHash);

      const balanceBefore = await ethers.provider.getBalance(s.recipient.address);

      await wallet
        .connect(s.signer2)
        .sendMultiSigBatch(recipients, values, expireTime, sequenceId, signature);

      const balanceAfter = await ethers.provider.getBalance(s.recipient.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther('3'));
    });
  });

  // ---------------------------------------------------------------
  // sendMultiSigToken (2-of-3 ERC20 token transfer)
  // ---------------------------------------------------------------
  describe('sendMultiSigToken', () => {
    let token: MockERC20;
    let tokenAddr: string;

    beforeEach(async () => {
      wallet = await deployWalletClone([s.signer1.address, s.signer2.address, s.signer3.address]);

      // Deploy token and mint to the wallet
      const TokenFactory = await ethers.getContractFactory('MockERC20');
      token = await TokenFactory.deploy('TestToken', 'TT', 18);
      await token.waitForDeployment();
      tokenAddr = await token.getAddress();

      const walletAddr = await wallet.getAddress();
      await token.mint(walletAddr, ethers.parseEther('1000'));
    });

    it('Executes ERC20 token transfer with valid 2-of-3 signature', async () => {
      const sendValue = ethers.parseEther('50');
      const expireTime = futureTimestamp(3600);
      const sequenceId = 1;

      const operationHash = createTokenOperationHash(
        NETWORK_ID,
        s.recipient.address,
        sendValue,
        tokenAddr,
        expireTime,
        sequenceId
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSigToken(
            s.recipient.address,
            sendValue,
            tokenAddr,
            expireTime,
            sequenceId,
            signature
          )
      ).to.emit(wallet, 'Transacted');

      expect(await token.balanceOf(s.recipient.address)).to.equal(sendValue);
    });

    it('Correct token amount deducted from wallet', async () => {
      const sendValue = ethers.parseEther('100');
      const expireTime = futureTimestamp(3600);
      const sequenceId = 1;
      const walletAddr = await wallet.getAddress();

      const operationHash = createTokenOperationHash(
        NETWORK_ID,
        s.recipient.address,
        sendValue,
        tokenAddr,
        expireTime,
        sequenceId
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      const balanceBefore = await token.balanceOf(walletAddr);

      await wallet
        .connect(s.signer1)
        .sendMultiSigToken(
          s.recipient.address,
          sendValue,
          tokenAddr,
          expireTime,
          sequenceId,
          signature
        );

      const balanceAfter = await token.balanceOf(walletAddr);
      expect(balanceBefore - balanceAfter).to.equal(sendValue);
    });

    it('Rejects non-signer as msg.sender', async () => {
      const sendValue = ethers.parseEther('50');
      const expireTime = futureTimestamp(3600);
      const sequenceId = 1;

      const operationHash = createTokenOperationHash(
        NETWORK_ID,
        s.recipient.address,
        sendValue,
        tokenAddr,
        expireTime,
        sequenceId
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      await expect(
        wallet
          .connect(s.other)
          .sendMultiSigToken(
            s.recipient.address,
            sendValue,
            tokenAddr,
            expireTime,
            sequenceId,
            signature
          )
      ).to.be.revertedWithCustomError(wallet, 'NotASigner');
    });

    it('Rejects self-signing for token transfer', async () => {
      const sendValue = ethers.parseEther('50');
      const expireTime = futureTimestamp(3600);
      const sequenceId = 1;

      const operationHash = createTokenOperationHash(
        NETWORK_ID,
        s.recipient.address,
        sendValue,
        tokenAddr,
        expireTime,
        sequenceId
      );

      const signature = await signOperationHash(s.signer1, operationHash);

      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSigToken(
            s.recipient.address,
            sendValue,
            tokenAddr,
            expireTime,
            sequenceId,
            signature
          )
      ).to.be.revertedWithCustomError(wallet, 'SignersMustBeDifferent');
    });

    it('Rejects expired token transaction', async () => {
      const sendValue = ethers.parseEther('50');
      const expireTime = Math.floor(Date.now() / 1000) - 3600;
      const sequenceId = 1;

      const operationHash = createTokenOperationHash(
        NETWORK_ID,
        s.recipient.address,
        sendValue,
        tokenAddr,
        expireTime,
        sequenceId
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSigToken(
            s.recipient.address,
            sendValue,
            tokenAddr,
            expireTime,
            sequenceId,
            signature
          )
      ).to.be.revertedWithCustomError(wallet, 'Expired');
    });

    it('Rejects token transfer in safe mode to non-signer', async () => {
      await wallet.connect(s.signer1).activateSafeMode();

      const sendValue = ethers.parseEther('50');
      const expireTime = futureTimestamp(3600);
      const sequenceId = 1;

      const operationHash = createTokenOperationHash(
        NETWORK_ID,
        s.recipient.address,
        sendValue,
        tokenAddr,
        expireTime,
        sequenceId
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSigToken(
            s.recipient.address,
            sendValue,
            tokenAddr,
            expireTime,
            sequenceId,
            signature
          )
      ).to.be.revertedWithCustomError(wallet, 'SafeModeRestriction');
    });

    it('Allows token transfer in safe mode to a signer address', async () => {
      await wallet.connect(s.signer1).activateSafeMode();

      // Transfer to signer2 (who is a valid signer)
      const sendValue = ethers.parseEther('50');
      const expireTime = futureTimestamp(3600);
      const sequenceId = 1;

      const operationHash = createTokenOperationHash(
        NETWORK_ID,
        s.signer2.address,
        sendValue,
        tokenAddr,
        expireTime,
        sequenceId
      );

      const signature = await signOperationHash(s.signer3, operationHash);

      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSigToken(
            s.signer2.address,
            sendValue,
            tokenAddr,
            expireTime,
            sequenceId,
            signature
          )
      ).to.emit(wallet, 'Transacted');

      expect(await token.balanceOf(s.signer2.address)).to.equal(sendValue);
    });

    it('Works with different signer combinations (signer3 sends, signer1 signs)', async () => {
      const sendValue = ethers.parseEther('25');
      const expireTime = futureTimestamp(3600);
      const sequenceId = 1;

      const operationHash = createTokenOperationHash(
        NETWORK_ID,
        s.recipient.address,
        sendValue,
        tokenAddr,
        expireTime,
        sequenceId
      );

      const signature = await signOperationHash(s.signer1, operationHash);

      await wallet
        .connect(s.signer3)
        .sendMultiSigToken(
          s.recipient.address,
          sendValue,
          tokenAddr,
          expireTime,
          sequenceId,
          signature
        );

      expect(await token.balanceOf(s.recipient.address)).to.equal(sendValue);
    });
  });

  // ---------------------------------------------------------------
  // Sequence ID Replay Protection
  // ---------------------------------------------------------------
  describe('Sequence ID Replay Protection', () => {
    const SEND_VALUE = ethers.parseEther('0.1');

    beforeEach(async () => {
      wallet = await deployWalletClone([s.signer1.address, s.signer2.address, s.signer3.address]);

      const walletAddr = await wallet.getAddress();
      await s.deployer.sendTransaction({
        to: walletAddr,
        value: ethers.parseEther('20'),
      });
    });

    /**
     * Helper: execute a sendMultiSig with the given sequence ID
     */
    async function executeSendMultiSig(sequenceId: number): Promise<void> {
      const expireTime = futureTimestamp(3600);
      const data = '0x';

      const operationHash = createOperationHash(
        NETWORK_ID,
        s.recipient.address,
        SEND_VALUE,
        data,
        expireTime,
        sequenceId
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      await wallet
        .connect(s.signer1)
        .sendMultiSig(
          s.recipient.address,
          SEND_VALUE,
          data,
          expireTime,
          sequenceId,
          signature
        );
    }

    it('Rejects replay of the same sequence ID', async () => {
      // First use succeeds
      await executeSendMultiSig(1);

      // Second use with same sequence ID should fail
      const expireTime = futureTimestamp(3600);
      const data = '0x';

      const operationHash = createOperationHash(
        NETWORK_ID,
        s.recipient.address,
        SEND_VALUE,
        data,
        expireTime,
        1
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSig(
            s.recipient.address,
            SEND_VALUE,
            data,
            expireTime,
            1,
            signature
          )
      ).to.be.revertedWithCustomError(wallet, 'SequenceIdAlreadyUsed');
    });

    it('Allows sequential sequence IDs', async () => {
      await executeSendMultiSig(1);
      await executeSendMultiSig(2);
      await executeSendMultiSig(3);

      const nextId = await wallet.getNextSequenceId();
      expect(nextId).to.equal(4n);
    });

    it('Allows non-sequential but valid sequence IDs within window', async () => {
      await executeSendMultiSig(1);
      await executeSendMultiSig(5);
      await executeSendMultiSig(3);

      const nextId = await wallet.getNextSequenceId();
      expect(nextId).to.equal(6n);
    });

    it('Rejects sequence ID that is too low', async () => {
      // Fill up window with IDs 1-10
      for (let i = 1; i <= 10; i++) {
        await executeSendMultiSig(i);
      }

      // Trying to use a sequence ID lower than the lowest in the window
      // The lowest is 1, so trying 0 or any already-used low ID will fail.
      // Actually, after 10 insertions, the window is full with IDs 1-10.
      // ID 0 is too low (must be > lowest in window which is 1... actually
      // the window replaces the lowest slot). After 10 insertions of 1..10,
      // the window contains exactly [1,2,3,4,5,6,7,8,9,10].
      // Next valid IDs must be > the lowest (1) but not already used.
      // ID 11 should work. ID 0 is too low.
      const expireTime = futureTimestamp(3600);
      const data = '0x';

      // Use an already-consumed ID to trigger SequenceIdAlreadyUsed
      const operationHash = createOperationHash(
        NETWORK_ID,
        s.recipient.address,
        SEND_VALUE,
        data,
        expireTime,
        5
      );
      const signature = await signOperationHash(s.signer2, operationHash);

      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSig(
            s.recipient.address,
            SEND_VALUE,
            data,
            expireTime,
            5,
            signature
          )
      ).to.be.revertedWithCustomError(wallet, 'SequenceIdAlreadyUsed');
    });

    it('Rejects sequence ID that is too high (exceeds MAX_SEQUENCE_ID_INCREASE)', async () => {
      // MAX_SEQUENCE_ID_INCREASE is 10000
      // After no usage, lowest in window is 0. Max allowed = 0 + 10000 = 10000.
      // Using 10001 should fail.
      const expireTime = futureTimestamp(3600);
      const data = '0x';

      const operationHash = createOperationHash(
        NETWORK_ID,
        s.recipient.address,
        SEND_VALUE,
        data,
        expireTime,
        10001
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSig(
            s.recipient.address,
            SEND_VALUE,
            data,
            expireTime,
            10001,
            signature
          )
      ).to.be.revertedWithCustomError(wallet, 'SequenceIdTooHigh');
    });

    it('Allows max valid sequence ID jump', async () => {
      // MAX_SEQUENCE_ID_INCREASE is 10000
      // Lowest in window is 0, so up to 10000 is valid
      const expireTime = futureTimestamp(3600);
      const data = '0x';

      const operationHash = createOperationHash(
        NETWORK_ID,
        s.recipient.address,
        SEND_VALUE,
        data,
        expireTime,
        10000
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSig(
            s.recipient.address,
            SEND_VALUE,
            data,
            expireTime,
            10000,
            signature
          )
      ).to.emit(wallet, 'Transacted');
    });

    it('Sequence ID window slides correctly', async () => {
      // Use IDs 1 through 10 (fills the 10-slot window)
      for (let i = 1; i <= 10; i++) {
        await executeSendMultiSig(i);
      }

      // Now use ID 11 -- this should replace the lowest slot (1)
      await executeSendMultiSig(11);

      // ID 1 has been evicted from the window, so using it again
      // should fail with SequenceIdTooLow (not AlreadyUsed, since it was evicted)
      const expireTime = futureTimestamp(3600);
      const data = '0x';

      const operationHash = createOperationHash(
        NETWORK_ID,
        s.recipient.address,
        SEND_VALUE,
        data,
        expireTime,
        1
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSig(
            s.recipient.address,
            SEND_VALUE,
            data,
            expireTime,
            1,
            signature
          )
      ).to.be.revertedWithCustomError(wallet, 'SequenceIdTooLow');
    });

    it('getNextSequenceId returns highest + 1', async () => {
      await executeSendMultiSig(5);
      await executeSendMultiSig(3);
      await executeSendMultiSig(10);

      const nextId = await wallet.getNextSequenceId();
      expect(nextId).to.equal(11n);
    });

    it('Sequence ID replay protection applies across operation types', async () => {
      // Use sequence ID 1 for sendMultiSig
      await executeSendMultiSig(1);

      // Trying to use sequence ID 1 for sendMultiSigBatch should also fail
      const recipients = [s.recipient.address];
      const values = [ethers.parseEther('0.1')];
      const expireTime = futureTimestamp(3600);

      const operationHash = createBatchOperationHash(
        NETWORK_ID,
        recipients,
        values,
        expireTime,
        1
      );

      const signature = await signOperationHash(s.signer2, operationHash);

      await expect(
        wallet
          .connect(s.signer1)
          .sendMultiSigBatch(recipients, values, expireTime, 1, signature)
      ).to.be.revertedWithCustomError(wallet, 'SequenceIdAlreadyUsed');
    });
  });
});
