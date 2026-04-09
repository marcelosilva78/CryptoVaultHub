import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying contracts with account:', deployer.address);
  console.log('Account balance:', (await ethers.provider.getBalance(deployer.address)).toString());

  // 1. Deploy CvhWalletSimple implementation
  const WalletSimpleFactory = await ethers.getContractFactory('CvhWalletSimple');
  const walletImpl = await WalletSimpleFactory.deploy();
  await walletImpl.waitForDeployment();
  const walletImplAddr = await walletImpl.getAddress();
  console.log('CvhWalletSimple (impl):', walletImplAddr);

  // 2. Deploy CvhForwarder implementation
  const ForwarderFactory = await ethers.getContractFactory('CvhForwarder');
  const forwarderImpl = await ForwarderFactory.deploy();
  await forwarderImpl.waitForDeployment();
  const forwarderImplAddr = await forwarderImpl.getAddress();
  console.log('CvhForwarder (impl):  ', forwarderImplAddr);

  // 3. Deploy CvhWalletFactory
  const WalletFactoryFactory = await ethers.getContractFactory('CvhWalletFactory');
  const walletFactory = await WalletFactoryFactory.deploy(walletImplAddr);
  await walletFactory.waitForDeployment();
  const walletFactoryAddr = await walletFactory.getAddress();
  console.log('CvhWalletFactory:     ', walletFactoryAddr);

  // 4. Deploy CvhForwarderFactory
  const ForwarderFactoryFactory = await ethers.getContractFactory('CvhForwarderFactory');
  const forwarderFactory = await ForwarderFactoryFactory.deploy(forwarderImplAddr);
  await forwarderFactory.waitForDeployment();
  const forwarderFactoryAddr = await forwarderFactory.getAddress();
  console.log('CvhForwarderFactory:  ', forwarderFactoryAddr);

  // 5. Deploy CvhBatcher
  const BatcherFactory = await ethers.getContractFactory('CvhBatcher');
  const batcher = await BatcherFactory.deploy();
  await batcher.waitForDeployment();
  const batcherAddr = await batcher.getAddress();
  console.log('CvhBatcher:           ', batcherAddr);

  console.log('\n--- Deployment Summary ---');
  const summary = {
    CvhWalletSimple: walletImplAddr,
    CvhForwarder: forwarderImplAddr,
    CvhWalletFactory: walletFactoryAddr,
    CvhForwarderFactory: forwarderFactoryAddr,
    CvhBatcher: batcherAddr,
  };
  console.log(JSON.stringify(summary, null, 2));

  return summary;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
