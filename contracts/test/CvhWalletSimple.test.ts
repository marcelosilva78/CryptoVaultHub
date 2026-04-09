import { expect } from 'chai';
import { ethers } from 'hardhat';
import { CvhWalletSimple } from '../typechain-types';
import {
  getSigners,
  futureTimestamp,
  createOperationHash,
  signOperationHash,
  NamedSigners,
} from './helpers/setup';

describe('CvhWalletSimple', () => {
  let wallet: CvhWalletSimple;
  let s: NamedSigners;
  const NETWORK_ID = '31337';

  beforeEach(async () => {
    s = await getSigners();

    const Factory = await ethers.getContractFactory('CvhWalletSimple');
    wallet = await Factory.deploy();
    await wallet.waitForDeployment();
  });

  // ---------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------
  describe('Initialization', () => {
    it('Sets 3 signers correctly', async () => {
      await wallet.init([s.signer1.address, s.signer2.address, s.signer3.address]);

      expect(await wallet.initialized()).to.equal(true);
      expect(await wallet.isSigner(s.signer1.address)).to.equal(true);
      expect(await wallet.isSigner(s.signer2.address)).to.equal(true);
      expect(await wallet.isSigner(s.signer3.address)).to.equal(true);
      expect(await wallet.signers(0)).to.equal(s.signer1.address);
      expect(await wallet.signers(1)).to.equal(s.signer2.address);
      expect(await wallet.signers(2)).to.equal(s.signer3.address);
    });

    it('Does not allow re-initialization', async () => {
      await wallet.init([s.signer1.address, s.signer2.address, s.signer3.address]);
      await expect(
        wallet.init([s.signer1.address, s.signer2.address, s.signer3.address])
      ).to.be.revertedWith('CvhWalletSimple: already initialized');
    });

    it('Rejects less than 3 signers', async () => {
      await expect(
        wallet.init([s.signer1.address, s.signer2.address])
      ).to.be.revertedWith('CvhWalletSimple: requires exactly 3 signers');
    });
  });

  // ---------------------------------------------------------------
  // Deposits
  // ---------------------------------------------------------------
  describe('Deposits', () => {
    beforeEach(async () => {
      await wallet.init([s.signer1.address, s.signer2.address, s.signer3.address]);
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
      await wallet.init([s.signer1.address, s.signer2.address, s.signer3.address]);

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
      ).to.be.revertedWith('CvhWalletSimple: signers must be different');
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
      ).to.be.revertedWith('CvhWalletSimple: expired');
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
      ).to.be.revertedWith('CvhWalletSimple: not a signer');
    });
  });

  // ---------------------------------------------------------------
  // Safe Mode
  // ---------------------------------------------------------------
  describe('Safe Mode', () => {
    beforeEach(async () => {
      await wallet.init([s.signer1.address, s.signer2.address, s.signer3.address]);
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
      ).to.be.revertedWith('CvhWalletSimple: not a signer');
    });
  });

  // ---------------------------------------------------------------
  // Sequence IDs
  // ---------------------------------------------------------------
  describe('Sequence IDs', () => {
    beforeEach(async () => {
      await wallet.init([s.signer1.address, s.signer2.address, s.signer3.address]);
    });

    it('Returns 1 as first available sequence ID', async () => {
      const nextId = await wallet.getNextSequenceId();
      expect(nextId).to.equal(1n);
    });
  });
});
