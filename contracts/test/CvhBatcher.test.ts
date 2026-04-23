import { expect } from 'chai';
import { ethers } from 'hardhat';
import { CvhBatcher, MockERC20 } from '../typechain-types';
import { getSigners, NamedSigners } from './helpers/setup';

describe('CvhBatcher', () => {
  let batcher: CvhBatcher;
  let token: MockERC20;
  let s: NamedSigners;

  beforeEach(async () => {
    s = await getSigners();

    const BatcherFactory = await ethers.getContractFactory('CvhBatcher');
    batcher = await BatcherFactory.connect(s.deployer).deploy();
    await batcher.waitForDeployment();

    const TokenFactory = await ethers.getContractFactory('MockERC20');
    token = await TokenFactory.deploy('TestToken', 'TT', 18);
    await token.waitForDeployment();
  });

  // ---------------------------------------------------------------
  // Deployment & Ownership
  // ---------------------------------------------------------------
  describe('Deployment & Ownership', () => {
    it('Deploys correctly with owner set to deployer', async () => {
      expect(await batcher.owner()).to.equal(s.deployer.address);
    });

    it('Sets default transferGasLimit to 30000', async () => {
      expect(await batcher.transferGasLimit()).to.equal(30000n);
    });

    it('Sets default batchTransferLimit to 255', async () => {
      expect(await batcher.batchTransferLimit()).to.equal(255n);
    });

    it('Owner can transfer ownership (two-step via Ownable2Step)', async () => {
      // Step 1: current owner initiates transfer
      await batcher.connect(s.deployer).transferOwnership(s.signer1.address);
      // Owner has not changed yet; it is pending
      expect(await batcher.owner()).to.equal(s.deployer.address);
      expect(await batcher.pendingOwner()).to.equal(s.signer1.address);

      // Step 2: new owner accepts
      await batcher.connect(s.signer1).acceptOwnership();
      expect(await batcher.owner()).to.equal(s.signer1.address);
      expect(await batcher.pendingOwner()).to.equal(ethers.ZeroAddress);
    });

    it('Rejects acceptOwnership from non-pending owner', async () => {
      await batcher.connect(s.deployer).transferOwnership(s.signer1.address);
      await expect(
        batcher.connect(s.other).acceptOwnership()
      ).to.be.revertedWithCustomError(batcher, 'OwnableUnauthorizedAccount');
    });

    it('TransferOwnership to zero address cancels pending transfer', async () => {
      await batcher.connect(s.deployer).transferOwnership(s.signer1.address);
      expect(await batcher.pendingOwner()).to.equal(s.signer1.address);

      await batcher.connect(s.deployer).transferOwnership(ethers.ZeroAddress);
      expect(await batcher.pendingOwner()).to.equal(ethers.ZeroAddress);
    });

    it('Non-owner cannot transfer ownership', async () => {
      await expect(
        batcher.connect(s.other).transferOwnership(s.signer1.address)
      ).to.be.revertedWithCustomError(batcher, 'OwnableUnauthorizedAccount');
    });

    it('Non-owner cannot call batchTransfer', async () => {
      await expect(
        batcher
          .connect(s.other)
          .batchTransfer([s.recipient.address], [ethers.parseEther('1')], {
            value: ethers.parseEther('1'),
          })
      ).to.be.revertedWithCustomError(batcher, 'OwnableUnauthorizedAccount');
    });

    it('Non-owner cannot call batchTransferToken', async () => {
      const tokenAddr = await token.getAddress();
      await expect(
        batcher
          .connect(s.other)
          .batchTransferToken(tokenAddr, [s.recipient.address], [100n])
      ).to.be.revertedWithCustomError(batcher, 'OwnableUnauthorizedAccount');
    });

    it('Non-owner cannot call setTransferGasLimit', async () => {
      await expect(
        batcher.connect(s.other).setTransferGasLimit(50000)
      ).to.be.revertedWithCustomError(batcher, 'OwnableUnauthorizedAccount');
    });

    it('Non-owner cannot call setBatchTransferLimit', async () => {
      await expect(
        batcher.connect(s.other).setBatchTransferLimit(100)
      ).to.be.revertedWithCustomError(batcher, 'OwnableUnauthorizedAccount');
    });

    it('Non-owner cannot call recover', async () => {
      await expect(
        batcher.connect(s.other).recover(s.other.address)
      ).to.be.revertedWithCustomError(batcher, 'OwnableUnauthorizedAccount');
    });

    it('New owner can call owner-only functions after ownership transfer', async () => {
      await batcher.connect(s.deployer).transferOwnership(s.signer1.address);
      await batcher.connect(s.signer1).acceptOwnership();

      // New owner can set gas limit
      await expect(
        batcher.connect(s.signer1).setTransferGasLimit(50000)
      ).to.not.be.reverted;

      // Old owner can no longer call
      await expect(
        batcher.connect(s.deployer).setTransferGasLimit(60000)
      ).to.be.revertedWithCustomError(batcher, 'OwnableUnauthorizedAccount');
    });

    it('Owner can renounce ownership', async () => {
      await batcher.connect(s.deployer).renounceOwnership();
      expect(await batcher.owner()).to.equal(ethers.ZeroAddress);
    });
  });

  // ---------------------------------------------------------------
  // batchTransfer (ETH)
  // ---------------------------------------------------------------
  describe('batchTransfer (ETH)', () => {
    it('Successfully sends ETH to multiple recipients', async () => {
      const recipients = [s.signer1.address, s.signer2.address, s.signer3.address];
      const values = [
        ethers.parseEther('1'),
        ethers.parseEther('2'),
        ethers.parseEther('3'),
      ];
      const totalValue = ethers.parseEther('6');

      await expect(
        batcher.connect(s.deployer).batchTransfer(recipients, values, {
          value: totalValue,
        })
      ).to.not.be.reverted;
    });

    it('Correct amounts received by each recipient', async () => {
      const recipients = [s.signer1.address, s.signer2.address];
      const values = [ethers.parseEther('1.5'), ethers.parseEther('2.5')];
      const totalValue = ethers.parseEther('4');

      const balanceBefore1 = await ethers.provider.getBalance(s.signer1.address);
      const balanceBefore2 = await ethers.provider.getBalance(s.signer2.address);

      await batcher.connect(s.deployer).batchTransfer(recipients, values, {
        value: totalValue,
      });

      const balanceAfter1 = await ethers.provider.getBalance(s.signer1.address);
      const balanceAfter2 = await ethers.provider.getBalance(s.signer2.address);

      expect(balanceAfter1 - balanceBefore1).to.equal(ethers.parseEther('1.5'));
      expect(balanceAfter2 - balanceBefore2).to.equal(ethers.parseEther('2.5'));
    });

    it('Emits BatchTransfer event for each recipient', async () => {
      const recipients = [s.signer1.address, s.signer2.address];
      const values = [ethers.parseEther('1'), ethers.parseEther('2')];
      const totalValue = ethers.parseEther('3');

      const tx = batcher.connect(s.deployer).batchTransfer(recipients, values, {
        value: totalValue,
      });

      await expect(tx)
        .to.emit(batcher, 'BatchTransfer')
        .withArgs(s.deployer.address, s.signer1.address, ethers.parseEther('1'));
      await expect(tx)
        .to.emit(batcher, 'BatchTransfer')
        .withArgs(s.deployer.address, s.signer2.address, ethers.parseEther('2'));
    });

    it('Refunds excess ETH to sender', async () => {
      const recipients = [s.signer1.address];
      const values = [ethers.parseEther('1')];
      const sentValue = ethers.parseEther('3'); // 2 ETH excess

      const balanceBefore = await ethers.provider.getBalance(s.deployer.address);

      const tx = await batcher
        .connect(s.deployer)
        .batchTransfer(recipients, values, { value: sentValue });
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(s.deployer.address);

      // Deployer should have lost only 1 ETH + gas, not 3 ETH + gas
      const netSpent = balanceBefore - balanceAfter - gasCost;
      expect(netSpent).to.equal(ethers.parseEther('1'));
    });

    it('No excess left in the batcher contract after refund', async () => {
      const recipients = [s.signer1.address];
      const values = [ethers.parseEther('1')];
      const sentValue = ethers.parseEther('5');

      await batcher.connect(s.deployer).batchTransfer(recipients, values, {
        value: sentValue,
      });

      const batcherBalance = await ethers.provider.getBalance(
        await batcher.getAddress()
      );
      expect(batcherBalance).to.equal(0n);
    });

    it('Works with exact ETH amount (no refund needed)', async () => {
      const recipients = [s.signer1.address, s.signer2.address];
      const values = [ethers.parseEther('1'), ethers.parseEther('2')];
      const totalValue = ethers.parseEther('3');

      await expect(
        batcher.connect(s.deployer).batchTransfer(recipients, values, {
          value: totalValue,
        })
      ).to.not.be.reverted;

      const batcherBalance = await ethers.provider.getBalance(
        await batcher.getAddress()
      );
      expect(batcherBalance).to.equal(0n);
    });

    it('Reverts with insufficient ETH', async () => {
      // The contract pre-checks totalRequired > msg.value before any
      // transfers, so it reverts with InsufficientETH.
      const recipients = [s.signer1.address, s.signer2.address];
      const values = [ethers.parseEther('5'), ethers.parseEther('5')];
      const insufficientValue = ethers.parseEther('3');

      await expect(
        batcher.connect(s.deployer).batchTransfer(recipients, values, {
          value: insufficientValue,
        })
      ).to.be.revertedWithCustomError(batcher, 'InsufficientETH');
    });

    it('Reverts with empty arrays', async () => {
      await expect(
        batcher.connect(s.deployer).batchTransfer([], [], { value: 0 })
      ).to.be.revertedWithCustomError(batcher, 'EmptyBatch');
    });

    it('Reverts with mismatched array lengths', async () => {
      const recipients = [s.signer1.address, s.signer2.address];
      const values = [ethers.parseEther('1')];

      await expect(
        batcher
          .connect(s.deployer)
          .batchTransfer(recipients, values, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(batcher, 'UnequalLengths');
    });

    it('Reverts when exceeding batchTransferLimit', async () => {
      await batcher.connect(s.deployer).setBatchTransferLimit(2);

      const recipients = [
        s.signer1.address,
        s.signer2.address,
        s.signer3.address,
      ];
      const values = [
        ethers.parseEther('1'),
        ethers.parseEther('1'),
        ethers.parseEther('1'),
      ];

      await expect(
        batcher
          .connect(s.deployer)
          .batchTransfer(recipients, values, { value: ethers.parseEther('3') })
      ).to.be.revertedWithCustomError(batcher, 'ExceedsBatchLimit');
    });

    it('Handles zero-value transfers', async () => {
      const recipients = [s.signer1.address, s.signer2.address];
      const values = [0n, 0n];

      await expect(
        batcher.connect(s.deployer).batchTransfer(recipients, values, {
          value: 0,
        })
      ).to.not.be.reverted;
    });

    it('Sending to zero address reverts', async () => {
      const recipients = [ethers.ZeroAddress];
      const values = [ethers.parseEther('1')];

      await expect(
        batcher
          .connect(s.deployer)
          .batchTransfer(recipients, values, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(batcher, 'ZeroAddressRecipient');
    });

    it('Sending to a contract that rejects ETH reverts with TransferFailed', async () => {
      const RejecterFactory = await ethers.getContractFactory('ETHRejecter');
      const rejecter = await RejecterFactory.deploy();
      await rejecter.waitForDeployment();

      const rejecterAddr = await rejecter.getAddress();

      await expect(
        batcher.connect(s.deployer).batchTransfer(
          [rejecterAddr],
          [ethers.parseEther('1')],
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(batcher, 'TransferFailed');
    });

    it('Gas griefing protection: reverts when recipient has expensive fallback', async () => {
      const GrieferFactory = await ethers.getContractFactory('GasGriefer');
      const griefer = await GrieferFactory.deploy();
      await griefer.waitForDeployment();

      const grieferAddr = await griefer.getAddress();

      // With default transferGasLimit of 30000, the GasGriefer receive() loop
      // runs out of gas, causing the transfer to fail
      await expect(
        batcher.connect(s.deployer).batchTransfer(
          [grieferAddr],
          [ethers.parseEther('1')],
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(batcher, 'TransferFailed');
    });

    it('Respects transferGasLimit: higher limit allows expensive fallback', async () => {
      const GrieferFactory = await ethers.getContractFactory('GasGriefer');
      const griefer = await GrieferFactory.deploy();
      await griefer.waitForDeployment();

      const grieferAddr = await griefer.getAddress();

      // Increase gas limit to max allowed (500000) to let the griefer execute
      await batcher.connect(s.deployer).setTransferGasLimit(500000);

      await expect(
        batcher.connect(s.deployer).batchTransfer(
          [grieferAddr],
          [ethers.parseEther('1')],
          { value: ethers.parseEther('1') }
        )
      ).to.not.be.reverted;
    });

    it('Single recipient batch works correctly', async () => {
      const balanceBefore = await ethers.provider.getBalance(s.recipient.address);

      await batcher
        .connect(s.deployer)
        .batchTransfer(
          [s.recipient.address],
          [ethers.parseEther('2')],
          { value: ethers.parseEther('2') }
        );

      const balanceAfter = await ethers.provider.getBalance(s.recipient.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther('2'));
    });

    it('Large batch (near limit) works correctly', async () => {
      await batcher.connect(s.deployer).setBatchTransferLimit(10);

      const signers = await ethers.getSigners();
      const recipients: string[] = [];
      const values: bigint[] = [];
      const amountEach = ethers.parseEther('0.01');

      for (let i = 0; i < 10; i++) {
        recipients.push(signers[i % signers.length].address);
        values.push(amountEach);
      }

      const totalValue = amountEach * 10n;

      await expect(
        batcher
          .connect(s.deployer)
          .batchTransfer(recipients, values, { value: totalValue })
      ).to.not.be.reverted;
    });
  });

  // ---------------------------------------------------------------
  // batchTransferToken (ERC20)
  // ---------------------------------------------------------------
  describe('batchTransferToken (ERC20)', () => {
    let tokenAddr: string;
    let batcherAddr: string;

    beforeEach(async () => {
      tokenAddr = await token.getAddress();
      batcherAddr = await batcher.getAddress();

      // TransferHelper.safeTransfer calls token.transfer(to, value)
      // from the batcher contract, so the batcher needs to hold the tokens.
      await token.mint(batcherAddr, ethers.parseEther('1000'));
    });

    it('Successfully transfers tokens to multiple recipients', async () => {
      const recipients = [s.signer1.address, s.signer2.address];
      const values = [ethers.parseEther('100'), ethers.parseEther('200')];

      await expect(
        batcher
          .connect(s.deployer)
          .batchTransferToken(tokenAddr, recipients, values)
      ).to.not.be.reverted;
    });

    it('Correct amounts received by each recipient', async () => {
      const recipients = [s.signer1.address, s.signer2.address, s.signer3.address];
      const values = [
        ethers.parseEther('10'),
        ethers.parseEther('20'),
        ethers.parseEther('30'),
      ];

      await batcher
        .connect(s.deployer)
        .batchTransferToken(tokenAddr, recipients, values);

      expect(await token.balanceOf(s.signer1.address)).to.equal(
        ethers.parseEther('10')
      );
      expect(await token.balanceOf(s.signer2.address)).to.equal(
        ethers.parseEther('20')
      );
      expect(await token.balanceOf(s.signer3.address)).to.equal(
        ethers.parseEther('30')
      );
    });

    it('Emits BatchTransfer event for each token recipient', async () => {
      const recipients = [s.signer1.address, s.signer2.address];
      const values = [ethers.parseEther('50'), ethers.parseEther('75')];

      const tx = batcher
        .connect(s.deployer)
        .batchTransferToken(tokenAddr, recipients, values);

      await expect(tx)
        .to.emit(batcher, 'BatchTransfer')
        .withArgs(s.deployer.address, s.signer1.address, ethers.parseEther('50'));
      await expect(tx)
        .to.emit(batcher, 'BatchTransfer')
        .withArgs(s.deployer.address, s.signer2.address, ethers.parseEther('75'));
    });

    it('Reverts with empty arrays', async () => {
      await expect(
        batcher
          .connect(s.deployer)
          .batchTransferToken(tokenAddr, [], [])
      ).to.be.revertedWithCustomError(batcher, 'EmptyBatch');
    });

    it('Reverts with mismatched array lengths', async () => {
      await expect(
        batcher
          .connect(s.deployer)
          .batchTransferToken(
            tokenAddr,
            [s.signer1.address, s.signer2.address],
            [ethers.parseEther('10')]
          )
      ).to.be.revertedWithCustomError(batcher, 'UnequalLengths');
    });

    it('Reverts when exceeding batchTransferLimit', async () => {
      await batcher.connect(s.deployer).setBatchTransferLimit(1);

      await expect(
        batcher
          .connect(s.deployer)
          .batchTransferToken(
            tokenAddr,
            [s.signer1.address, s.signer2.address],
            [ethers.parseEther('10'), ethers.parseEther('20')]
          )
      ).to.be.revertedWithCustomError(batcher, 'ExceedsBatchLimit');
    });

    it('Reverts when sending to zero address', async () => {
      await expect(
        batcher
          .connect(s.deployer)
          .batchTransferToken(
            tokenAddr,
            [ethers.ZeroAddress],
            [ethers.parseEther('10')]
          )
      ).to.be.revertedWithCustomError(batcher, 'ZeroAddressRecipient');
    });

    it('Only owner can call batchTransferToken', async () => {
      await expect(
        batcher
          .connect(s.other)
          .batchTransferToken(
            tokenAddr,
            [s.signer1.address],
            [ethers.parseEther('10')]
          )
      ).to.be.revertedWithCustomError(batcher, 'OwnableUnauthorizedAccount');
    });

    it('Reverts when batcher has insufficient token balance', async () => {
      // The ERC20 transfer reverts internally, which TransferHelper propagates
      await expect(
        batcher
          .connect(s.deployer)
          .batchTransferToken(
            tokenAddr,
            [s.signer1.address],
            [ethers.parseEther('2000')]
          )
      ).to.be.reverted;
    });

    it('Deducts correct total from batcher token balance', async () => {
      const recipients = [s.signer1.address, s.signer2.address];
      const values = [ethers.parseEther('100'), ethers.parseEther('200')];

      const balanceBefore = await token.balanceOf(batcherAddr);

      await batcher
        .connect(s.deployer)
        .batchTransferToken(tokenAddr, recipients, values);

      const balanceAfter = await token.balanceOf(batcherAddr);
      expect(balanceBefore - balanceAfter).to.equal(ethers.parseEther('300'));
    });
  });

  // ---------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------
  describe('Configuration', () => {
    describe('setTransferGasLimit', () => {
      it('Owner can set transfer gas limit', async () => {
        await batcher.connect(s.deployer).setTransferGasLimit(50000);
        expect(await batcher.transferGasLimit()).to.equal(50000n);
      });

      it('Emits TransferGasLimitChange event', async () => {
        await expect(batcher.connect(s.deployer).setTransferGasLimit(50000))
          .to.emit(batcher, 'TransferGasLimitChange')
          .withArgs(50000);
      });

      it('Non-owner cannot set transfer gas limit', async () => {
        await expect(
          batcher.connect(s.other).setTransferGasLimit(50000)
        ).to.be.revertedWithCustomError(batcher, 'OwnableUnauthorizedAccount');
      });

      it('Can set to minimum bound (2300)', async () => {
        await batcher.connect(s.deployer).setTransferGasLimit(2300);
        expect(await batcher.transferGasLimit()).to.equal(2300n);
      });

      it('Can set to maximum bound (500000)', async () => {
        await batcher.connect(s.deployer).setTransferGasLimit(500000);
        expect(await batcher.transferGasLimit()).to.equal(500000n);
      });

      it('Reverts when below minimum (2300)', async () => {
        await expect(
          batcher.connect(s.deployer).setTransferGasLimit(2299)
        ).to.be.revertedWithCustomError(batcher, 'GasLimitOutOfRange');
      });

      it('Reverts when above maximum (500000)', async () => {
        await expect(
          batcher.connect(s.deployer).setTransferGasLimit(500001)
        ).to.be.revertedWithCustomError(batcher, 'GasLimitOutOfRange');
      });

      it('Gas limit affects batch transfer behavior', async () => {
        const GrieferFactory = await ethers.getContractFactory('GasGriefer');
        const griefer = await GrieferFactory.deploy();
        await griefer.waitForDeployment();
        const grieferAddr = await griefer.getAddress();

        // Default 30000 gas limit: griefer fails
        await expect(
          batcher.connect(s.deployer).batchTransfer(
            [grieferAddr],
            [ethers.parseEther('1')],
            { value: ethers.parseEther('1') }
          )
        ).to.be.revertedWithCustomError(batcher, 'TransferFailed');

        // Increase gas limit to max (500000): griefer succeeds
        await batcher.connect(s.deployer).setTransferGasLimit(500000);

        await expect(
          batcher.connect(s.deployer).batchTransfer(
            [grieferAddr],
            [ethers.parseEther('1')],
            { value: ethers.parseEther('1') }
          )
        ).to.not.be.reverted;
      });
    });

    describe('setBatchTransferLimit', () => {
      it('Owner can set batch transfer limit', async () => {
        await batcher.connect(s.deployer).setBatchTransferLimit(100);
        expect(await batcher.batchTransferLimit()).to.equal(100n);
      });

      it('Emits BatchTransferLimitChange event', async () => {
        await expect(batcher.connect(s.deployer).setBatchTransferLimit(100))
          .to.emit(batcher, 'BatchTransferLimitChange')
          .withArgs(100);
      });

      it('Non-owner cannot set batch transfer limit', async () => {
        await expect(
          batcher.connect(s.other).setBatchTransferLimit(100)
        ).to.be.revertedWithCustomError(batcher, 'OwnableUnauthorizedAccount');
      });

      it('Can set limit to 1 (minimum)', async () => {
        await batcher.connect(s.deployer).setBatchTransferLimit(1);
        expect(await batcher.batchTransferLimit()).to.equal(1n);

        // Batch with exactly 1 recipient should work
        await expect(
          batcher.connect(s.deployer).batchTransfer(
            [s.signer1.address],
            [ethers.parseEther('1')],
            { value: ethers.parseEther('1') }
          )
        ).to.not.be.reverted;
      });

      it('Can set limit to 255 (maximum)', async () => {
        await batcher.connect(s.deployer).setBatchTransferLimit(255);
        expect(await batcher.batchTransferLimit()).to.equal(255n);
      });

      it('Reverts when set to 0', async () => {
        await expect(
          batcher.connect(s.deployer).setBatchTransferLimit(0)
        ).to.be.revertedWithCustomError(batcher, 'BatchLimitOutOfRange');
      });

      it('Reverts when set above 255', async () => {
        await expect(
          batcher.connect(s.deployer).setBatchTransferLimit(256)
        ).to.be.revertedWithCustomError(batcher, 'BatchLimitOutOfRange');
      });

      it('Enforces the new limit on batchTransfer', async () => {
        await batcher.connect(s.deployer).setBatchTransferLimit(2);

        // 2 recipients: OK
        await expect(
          batcher.connect(s.deployer).batchTransfer(
            [s.signer1.address, s.signer2.address],
            [ethers.parseEther('1'), ethers.parseEther('1')],
            { value: ethers.parseEther('2') }
          )
        ).to.not.be.reverted;

        // 3 recipients: exceeds limit
        await expect(
          batcher.connect(s.deployer).batchTransfer(
            [s.signer1.address, s.signer2.address, s.signer3.address],
            [ethers.parseEther('1'), ethers.parseEther('1'), ethers.parseEther('1')],
            { value: ethers.parseEther('3') }
          )
        ).to.be.revertedWithCustomError(batcher, 'ExceedsBatchLimit');
      });

      it('Enforces the new limit on batchTransferToken', async () => {
        const tokenAddr = await token.getAddress();
        const batcherAddr = await batcher.getAddress();
        await token.mint(batcherAddr, ethers.parseEther('1000'));

        await batcher.connect(s.deployer).setBatchTransferLimit(1);

        await expect(
          batcher
            .connect(s.deployer)
            .batchTransferToken(
              tokenAddr,
              [s.signer1.address, s.signer2.address],
              [ethers.parseEther('10'), ethers.parseEther('20')]
            )
        ).to.be.revertedWithCustomError(batcher, 'ExceedsBatchLimit');
      });
    });
  });

  // ---------------------------------------------------------------
  // Recovery
  // ---------------------------------------------------------------
  describe('Recovery', () => {
    it('Owner can recover ETH stuck in contract', async () => {
      const balanceBefore = await ethers.provider.getBalance(s.recipient.address);
      await batcher.connect(s.deployer).recover(s.recipient.address);
      const balanceAfter = await ethers.provider.getBalance(s.recipient.address);
      // No ETH was in the contract, so no change
      expect(balanceAfter).to.equal(balanceBefore);
    });

    it('Non-owner cannot recover ETH', async () => {
      await expect(
        batcher.connect(s.other).recover(s.other.address)
      ).to.be.revertedWithCustomError(batcher, 'OwnableUnauthorizedAccount');
    });

    it('Owner can recover ERC20 tokens stuck in contract via batchTransferToken', async () => {
      const tokenAddr = await token.getAddress();
      const batcherAddr = await batcher.getAddress();

      await token.mint(batcherAddr, ethers.parseEther('500'));

      await batcher
        .connect(s.deployer)
        .batchTransferToken(
          tokenAddr,
          [s.deployer.address],
          [ethers.parseEther('500')]
        );

      expect(await token.balanceOf(batcherAddr)).to.equal(0n);
      expect(await token.balanceOf(s.deployer.address)).to.equal(
        ethers.parseEther('500')
      );
    });

    it('Non-owner cannot recover ERC20 tokens via batchTransferToken', async () => {
      const tokenAddr = await token.getAddress();
      const batcherAddr = await batcher.getAddress();

      await token.mint(batcherAddr, ethers.parseEther('100'));

      await expect(
        batcher
          .connect(s.other)
          .batchTransferToken(
            tokenAddr,
            [s.other.address],
            [ethers.parseEther('100')]
          )
      ).to.be.revertedWithCustomError(batcher, 'OwnableUnauthorizedAccount');
    });

    it('Recover handles zero balance gracefully', async () => {
      await expect(
        batcher.connect(s.deployer).recover(s.recipient.address)
      ).to.not.be.reverted;
    });
  });

  // ---------------------------------------------------------------
  // Edge Cases
  // ---------------------------------------------------------------
  describe('Edge Cases', () => {
    it('Zero address in the middle of recipient array reverts', async () => {
      const recipients = [
        s.signer1.address,
        ethers.ZeroAddress,
        s.signer2.address,
      ];
      const values = [
        ethers.parseEther('1'),
        ethers.parseEther('1'),
        ethers.parseEther('1'),
      ];

      await expect(
        batcher.connect(s.deployer).batchTransfer(recipients, values, {
          value: ethers.parseEther('3'),
        })
      ).to.be.revertedWithCustomError(batcher, 'ZeroAddressRecipient');
    });

    it('Mixed zero and non-zero values in a batch', async () => {
      const recipients = [s.signer1.address, s.signer2.address, s.signer3.address];
      const values = [ethers.parseEther('1'), 0n, ethers.parseEther('2')];

      const balanceBefore2 = await ethers.provider.getBalance(s.signer2.address);

      await batcher.connect(s.deployer).batchTransfer(recipients, values, {
        value: ethers.parseEther('3'),
      });

      const balanceAfter2 = await ethers.provider.getBalance(s.signer2.address);
      expect(balanceAfter2).to.equal(balanceBefore2);
    });

    it('Duplicate recipients in a batch are allowed', async () => {
      const recipients = [s.signer1.address, s.signer1.address];
      const values = [ethers.parseEther('1'), ethers.parseEther('2')];

      const balanceBefore = await ethers.provider.getBalance(s.signer1.address);

      await batcher.connect(s.deployer).batchTransfer(recipients, values, {
        value: ethers.parseEther('3'),
      });

      const balanceAfter = await ethers.provider.getBalance(s.signer1.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther('3'));
    });

    it('Reentrancy: recipient calling batchTransfer cannot succeed (onlyOwner)', async () => {
      const AttackerFactory = await ethers.getContractFactory('ReentrancyAttacker');
      const attacker = await AttackerFactory.deploy(await batcher.getAddress());
      await attacker.waitForDeployment();

      const attackerAddr = await attacker.getAddress();

      // Increase gas limit to max to let the attacker receive() execute
      await batcher.connect(s.deployer).setTransferGasLimit(500000);

      // The attacker's receive() calls batchTransfer which requires onlyOwner,
      // so the try/catch in the attacker swallows the revert. Transfer succeeds.
      await expect(
        batcher.connect(s.deployer).batchTransfer(
          [attackerAddr],
          [ethers.parseEther('1')],
          { value: ethers.parseEther('1') }
        )
      ).to.not.be.reverted;

      // Verify the attacker attempted reentrancy (attackCount incremented)
      expect(await attacker.attackCount()).to.equal(1n);
    });

    it('Very small ETH amounts (1 wei) transfer correctly', async () => {
      const recipients = [s.signer1.address];
      const values = [1n];

      const balanceBefore = await ethers.provider.getBalance(s.signer1.address);

      await batcher.connect(s.deployer).batchTransfer(recipients, values, {
        value: 1n,
      });

      const balanceAfter = await ethers.provider.getBalance(s.signer1.address);
      expect(balanceAfter - balanceBefore).to.equal(1n);
    });

    it('Batch with all zero values and zero msg.value succeeds', async () => {
      const recipients = [
        s.signer1.address,
        s.signer2.address,
        s.signer3.address,
      ];
      const values = [0n, 0n, 0n];

      await expect(
        batcher.connect(s.deployer).batchTransfer(recipients, values, {
          value: 0n,
        })
      ).to.not.be.reverted;
    });
  });
});
