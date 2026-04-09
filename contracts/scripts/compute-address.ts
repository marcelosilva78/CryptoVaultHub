import { ethers } from 'hardhat';

async function main() {
  const factoryAddress = process.env.FACTORY_ADDRESS;
  const parentAddress = process.env.PARENT_ADDRESS;
  const feeAddress = process.env.FEE_ADDRESS;
  const salt = process.env.SALT;

  if (!factoryAddress || !parentAddress || !feeAddress || !salt) {
    console.error(
      'Usage: FACTORY_ADDRESS=... PARENT_ADDRESS=... FEE_ADDRESS=... SALT=... npx hardhat run scripts/compute-address.ts'
    );
    process.exit(1);
  }

  const factory = await ethers.getContractAt('CvhForwarderFactory', factoryAddress);

  const saltBytes32 = ethers.id(salt);
  const predictedAddress = await factory.computeForwarderAddress(
    parentAddress,
    feeAddress,
    saltBytes32
  );

  console.log('Predicted forwarder address:', predictedAddress);
  console.log('Parameters:');
  console.log('  Factory:', factoryAddress);
  console.log('  Parent: ', parentAddress);
  console.log('  Fee:    ', feeAddress);
  console.log('  Salt:   ', salt, '->', saltBytes32);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
