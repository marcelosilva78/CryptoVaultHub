import { ethers } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

interface DeploymentResult {
  contract: string;
  address: string;
  verified: boolean;
  error?: string;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === 'unknown' ? `chain-${network.chainId}` : network.name;

  console.log('=== CryptoVaultHub Contract Deployment ===');
  console.log('Network:        ', networkName, `(chainId: ${network.chainId})`);
  console.log('Deployer:       ', deployer.address);
  console.log('Balance:        ', ethers.formatEther(await ethers.provider.getBalance(deployer.address)), 'ETH');
  console.log('');

  const results: DeploymentResult[] = [];
  let walletImplAddr = '';
  let forwarderImplAddr = '';
  let walletFactoryAddr = '';
  let forwarderFactoryAddr = '';
  let batcherAddr = '';

  // 1. Deploy CvhWalletSimple implementation
  try {
    console.log('[1/5] Deploying CvhWalletSimple (implementation)...');
    const WalletSimpleFactory = await ethers.getContractFactory('CvhWalletSimple');
    const walletImpl = await WalletSimpleFactory.deploy();
    await walletImpl.waitForDeployment();
    walletImplAddr = await walletImpl.getAddress();
    console.log('      Address:', walletImplAddr);

    // Verify: call a read function
    const code = await ethers.provider.getCode(walletImplAddr);
    const verified = code.length > 2;
    console.log('      Verified:', verified ? 'OK (code deployed)' : 'FAIL (no code)');

    results.push({ contract: 'CvhWalletSimple', address: walletImplAddr, verified });
  } catch (err: any) {
    console.error('      FAILED:', err.message);
    results.push({ contract: 'CvhWalletSimple', address: '', verified: false, error: err.message });
  }

  // 2. Deploy CvhForwarder implementation
  try {
    console.log('[2/5] Deploying CvhForwarder (implementation)...');
    const ForwarderFactory = await ethers.getContractFactory('CvhForwarder');
    const forwarderImpl = await ForwarderFactory.deploy();
    await forwarderImpl.waitForDeployment();
    forwarderImplAddr = await forwarderImpl.getAddress();
    console.log('      Address:', forwarderImplAddr);

    const code = await ethers.provider.getCode(forwarderImplAddr);
    const verified = code.length > 2;
    console.log('      Verified:', verified ? 'OK (code deployed)' : 'FAIL (no code)');

    results.push({ contract: 'CvhForwarder', address: forwarderImplAddr, verified });
  } catch (err: any) {
    console.error('      FAILED:', err.message);
    results.push({ contract: 'CvhForwarder', address: '', verified: false, error: err.message });
  }

  // 3. Deploy CvhWalletFactory (depends on walletImpl)
  if (walletImplAddr) {
    try {
      console.log('[3/5] Deploying CvhWalletFactory...');
      const WalletFactoryFactory = await ethers.getContractFactory('CvhWalletFactory');
      const walletFactory = await WalletFactoryFactory.deploy(walletImplAddr);
      await walletFactory.waitForDeployment();
      walletFactoryAddr = await walletFactory.getAddress();
      console.log('      Address:', walletFactoryAddr);

      const code = await ethers.provider.getCode(walletFactoryAddr);
      const verified = code.length > 2;
      console.log('      Verified:', verified ? 'OK (code deployed)' : 'FAIL (no code)');

      results.push({ contract: 'CvhWalletFactory', address: walletFactoryAddr, verified });
    } catch (err: any) {
      console.error('      FAILED:', err.message);
      results.push({ contract: 'CvhWalletFactory', address: '', verified: false, error: err.message });
    }
  } else {
    console.log('[3/5] Skipping CvhWalletFactory (CvhWalletSimple deployment failed)');
    results.push({ contract: 'CvhWalletFactory', address: '', verified: false, error: 'Skipped: dependency failed' });
  }

  // 4. Deploy CvhForwarderFactory (depends on forwarderImpl)
  if (forwarderImplAddr) {
    try {
      console.log('[4/5] Deploying CvhForwarderFactory...');
      const ForwarderFactoryFactory = await ethers.getContractFactory('CvhForwarderFactory');
      const forwarderFactory = await ForwarderFactoryFactory.deploy(forwarderImplAddr);
      await forwarderFactory.waitForDeployment();
      forwarderFactoryAddr = await forwarderFactory.getAddress();
      console.log('      Address:', forwarderFactoryAddr);

      const code = await ethers.provider.getCode(forwarderFactoryAddr);
      const verified = code.length > 2;
      console.log('      Verified:', verified ? 'OK (code deployed)' : 'FAIL (no code)');

      results.push({ contract: 'CvhForwarderFactory', address: forwarderFactoryAddr, verified });
    } catch (err: any) {
      console.error('      FAILED:', err.message);
      results.push({ contract: 'CvhForwarderFactory', address: '', verified: false, error: err.message });
    }
  } else {
    console.log('[4/5] Skipping CvhForwarderFactory (CvhForwarder deployment failed)');
    results.push({ contract: 'CvhForwarderFactory', address: '', verified: false, error: 'Skipped: dependency failed' });
  }

  // 5. Deploy CvhBatcher
  try {
    console.log('[5/5] Deploying CvhBatcher...');
    const BatcherFactory = await ethers.getContractFactory('CvhBatcher');
    const batcher = await BatcherFactory.deploy();
    await batcher.waitForDeployment();
    batcherAddr = await batcher.getAddress();
    console.log('      Address:', batcherAddr);

    const code = await ethers.provider.getCode(batcherAddr);
    const verified = code.length > 2;
    console.log('      Verified:', verified ? 'OK (code deployed)' : 'FAIL (no code)');

    results.push({ contract: 'CvhBatcher', address: batcherAddr, verified });
  } catch (err: any) {
    console.error('      FAILED:', err.message);
    results.push({ contract: 'CvhBatcher', address: '', verified: false, error: err.message });
  }

  // Summary
  console.log('\n=== Deployment Summary ===');
  const summary = {
    network: networkName,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: Object.fromEntries(results.map((r) => [r.contract, { address: r.address, verified: r.verified, ...(r.error ? { error: r.error } : {}) }])),
  };
  console.log(JSON.stringify(summary, null, 2));

  // Save to file
  const deploymentsDir = path.join(__dirname, '..', 'deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${networkName}-${timestamp}.json`;
  const filepath = path.join(deploymentsDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(summary, null, 2));
  console.log(`\nDeployment saved to: ${filepath}`);

  // Check for failures
  const failures = results.filter((r) => !r.verified);
  if (failures.length > 0) {
    console.warn(`\nWARNING: ${failures.length} contract(s) failed or could not be verified.`);
  }

  return summary;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
