import { expect } from 'chai';
import { ethers } from 'hardhat';
import { CvhWalletSimple, CvhWalletFactory } from '../typechain-types';
import { getSigners, NamedSigners } from './helpers/setup';

describe('CvhWalletFactory', () => {
  let walletImpl: CvhWalletSimple;
  let factory: CvhWalletFactory;
  let s: NamedSigners;
  const SALT = ethers.id('test-salt-wallet');

  beforeEach(async () => {
    s = await getSigners();

    // Deploy implementation
    const WalletImplFactory = await ethers.getContractFactory('CvhWalletSimple');
    walletImpl = await WalletImplFactory.deploy();
    await walletImpl.waitForDeployment();

    // Deploy factory
    const WalletFactoryFactory = await ethers.getContractFactory('CvhWalletFactory');
    factory = await WalletFactoryFactory.deploy(await walletImpl.getAddress());
    await factory.waitForDeployment();
  });

  it('Deploys wallet proxy with correct signers', async () => {
    const signerAddresses = [s.signer1.address, s.signer2.address, s.signer3.address];

    const tx = await factory.createWallet(signerAddresses, SALT);
    const receipt = await tx.wait();

    // Get the wallet address from the WalletCreated event
    const event = receipt!.logs.find((log) => {
      try {
        return factory.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === 'WalletCreated';
      } catch {
        return false;
      }
    });

    const parsedEvent = factory.interface.parseLog({
      topics: event!.topics as string[],
      data: event!.data,
    });
    const walletAddress = parsedEvent!.args.walletAddress;

    // Attach to the deployed proxy
    const walletProxy = await ethers.getContractAt('CvhWalletSimple', walletAddress);

    expect(await walletProxy.initialized()).to.equal(true);
    expect(await walletProxy.isSigner(s.signer1.address)).to.equal(true);
    expect(await walletProxy.isSigner(s.signer2.address)).to.equal(true);
    expect(await walletProxy.isSigner(s.signer3.address)).to.equal(true);
  });

  it('Computes deterministic address correctly', async () => {
    const signerAddresses = [s.signer1.address, s.signer2.address, s.signer3.address];

    // Predict the address before deploying
    const predictedAddress = await factory.computeWalletAddress(signerAddresses, SALT);

    // Actually deploy
    const tx = await factory.createWallet(signerAddresses, SALT);
    const receipt = await tx.wait();

    const event = receipt!.logs.find((log) => {
      try {
        return factory.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === 'WalletCreated';
      } catch {
        return false;
      }
    });
    const parsedEvent = factory.interface.parseLog({
      topics: event!.topics as string[],
      data: event!.data,
    });
    const actualAddress = parsedEvent!.args.walletAddress;

    expect(predictedAddress).to.equal(actualAddress);
  });
});
