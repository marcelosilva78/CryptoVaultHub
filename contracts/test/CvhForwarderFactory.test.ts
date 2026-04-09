import { expect } from 'chai';
import { ethers } from 'hardhat';
import {
  CvhForwarder,
  CvhForwarderFactory,
  CvhWalletSimple,
} from '../typechain-types';
import { getSigners, NamedSigners } from './helpers/setup';

describe('CvhForwarderFactory', () => {
  let forwarderImpl: CvhForwarder;
  let factory: CvhForwarderFactory;
  let parentWallet: CvhWalletSimple;
  let s: NamedSigners;
  const SALT = ethers.id('test-salt-forwarder');

  beforeEach(async () => {
    s = await getSigners();

    // Deploy a CvhWalletSimple to act as the parent (can receive ETH)
    const WalletFactory = await ethers.getContractFactory('CvhWalletSimple');
    parentWallet = await WalletFactory.deploy();
    await parentWallet.waitForDeployment();

    // Deploy forwarder implementation
    const ForwarderImplFactory = await ethers.getContractFactory('CvhForwarder');
    forwarderImpl = await ForwarderImplFactory.deploy();
    await forwarderImpl.waitForDeployment();

    // Deploy factory
    const ForwarderFactoryFactory = await ethers.getContractFactory('CvhForwarderFactory');
    factory = await ForwarderFactoryFactory.deploy(await forwarderImpl.getAddress());
    await factory.waitForDeployment();
  });

  it('Deploys forwarder proxy with correct parent and feeAddress', async () => {
    const parentAddr = await parentWallet.getAddress();

    const tx = await factory.createForwarder(
      parentAddr,
      s.feeAddress.address,
      SALT,
      true,
      true
    );
    const receipt = await tx.wait();

    // Get forwarder address from event
    const event = receipt!.logs.find((log) => {
      try {
        return factory.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === 'ForwarderCreated';
      } catch {
        return false;
      }
    });
    const parsedEvent = factory.interface.parseLog({
      topics: event!.topics as string[],
      data: event!.data,
    });
    const forwarderAddress = parsedEvent!.args.forwarderAddress;

    // Attach to the deployed proxy
    const forwarderProxy = await ethers.getContractAt('CvhForwarder', forwarderAddress);

    expect(await forwarderProxy.initialized()).to.equal(true);
    expect(await forwarderProxy.parentAddress()).to.equal(parentAddr);
    expect(await forwarderProxy.feeAddress()).to.equal(s.feeAddress.address);
  });

  it('Computes deterministic forwarder address correctly', async () => {
    const parentAddr = await parentWallet.getAddress();

    // Predict address (deployer is s.deployer / signers[0])
    const predictedAddress = await factory.computeForwarderAddress(
      s.deployer.address,
      parentAddr,
      s.feeAddress.address,
      SALT
    );

    // Actually deploy
    const tx = await factory.createForwarder(
      parentAddr,
      s.feeAddress.address,
      SALT,
      true,
      true
    );
    const receipt = await tx.wait();

    const event = receipt!.logs.find((log) => {
      try {
        return factory.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === 'ForwarderCreated';
      } catch {
        return false;
      }
    });
    const parsedEvent = factory.interface.parseLog({
      topics: event!.topics as string[],
      data: event!.data,
    });
    const actualAddress = parsedEvent!.args.forwarderAddress;

    expect(predictedAddress).to.equal(actualAddress);
  });

  it('Auto-forwards ETH from factory-deployed forwarder proxy to parent', async () => {
    const parentAddr = await parentWallet.getAddress();

    const tx = await factory.createForwarder(
      parentAddr,
      s.feeAddress.address,
      SALT,
      true,
      true
    );
    const receipt = await tx.wait();

    const event = receipt!.logs.find((log) => {
      try {
        return factory.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === 'ForwarderCreated';
      } catch {
        return false;
      }
    });
    const parsedEvent = factory.interface.parseLog({
      topics: event!.topics as string[],
      data: event!.data,
    });
    const forwarderAddress = parsedEvent!.args.forwarderAddress;

    const parentBalanceBefore = await ethers.provider.getBalance(parentAddr);
    const amount = ethers.parseEther('2');

    // Send ETH to forwarder proxy — should auto-forward to parent
    await s.deployer.sendTransaction({ to: forwarderAddress, value: amount });

    const forwarderBalance = await ethers.provider.getBalance(forwarderAddress);
    const parentBalanceAfter = await ethers.provider.getBalance(parentAddr);

    expect(forwarderBalance).to.equal(0n);
    expect(parentBalanceAfter - parentBalanceBefore).to.equal(amount);
  });

  it('Has immutable implementation address', async () => {
    const implAddr = await forwarderImpl.getAddress();
    expect(await factory.implementationAddress()).to.equal(implAddr);
  });
});
