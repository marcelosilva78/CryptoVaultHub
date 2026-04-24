# Smart Contract Deployment Runbook

Step-by-step guide for deploying CryptoVaultHub smart contracts (CvhWalletSimple, CvhForwarder, CvhWalletFactory, CvhForwarderFactory, CvhBatcher) to testnet and mainnet networks.

## 1. Prerequisites

- **Deployer wallet** with sufficient native gas tokens on the target network
  - Testnet: use a faucet (BSC Testnet faucet, Sepolia faucet, etc.)
  - Mainnet: fund from a secure wallet
- **RPC URLs** for the target network (from Tatum.io, Alchemy, Infura, or self-hosted)
- **Node.js 18+** and `pnpm` installed
- `.env` file configured in `contracts/` (copy from `.env.example`)

```bash
cd contracts
cp .env.example .env
# Edit .env with your DEPLOYER_PRIVATE_KEY and RPC URLs
```

## 2. Compile Contracts

```bash
cd contracts
npx hardhat compile
```

Verify that `artifacts/` and `typechain-types/` directories are generated without errors.

## 3. Run Tests

```bash
npx hardhat test
```

All tests must pass before proceeding to deployment. Do not deploy with failing tests.

## 4. Deploy to Testnet

Start with BSC Testnet (cheapest gas, reliable faucet):

```bash
npx hardhat run scripts/deploy.ts --network bscTestnet
```

Other testnet options:

```bash
npx hardhat run scripts/deploy.ts --network sepolia
npx hardhat run scripts/deploy.ts --network amoy
```

## 5. Verify Deployment Output

The deploy script saves a JSON file to `contracts/deployments/<network>-<timestamp>.json`. Inspect it:

```bash
cat contracts/deployments/bnbt-*.json
```

Expected structure:

```json
{
  "network": "bnbt",
  "chainId": 97,
  "deployer": "0x...",
  "timestamp": "2026-04-23T...",
  "contracts": {
    "CvhWalletSimple": { "address": "0x...", "verified": true },
    "CvhForwarder": { "address": "0x...", "verified": true },
    "CvhWalletFactory": { "address": "0x...", "verified": true },
    "CvhForwarderFactory": { "address": "0x...", "verified": true },
    "CvhBatcher": { "address": "0x...", "verified": true }
  }
}
```

Confirm all contracts show `"verified": true`. If any show `false`, investigate the error field before proceeding.

## 6. Register Addresses via Admin API

Use the Admin API to register the new contract addresses for the chain:

```bash
curl -X PATCH https://admin-api.vaulthub.live/admin/chains/<chainId> \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "walletFactoryAddress": "0x_FROM_DEPLOYMENT_JSON",
    "forwarderFactoryAddress": "0x_FROM_DEPLOYMENT_JSON",
    "walletImplAddress": "0x_FROM_DEPLOYMENT_JSON",
    "forwarderImplAddress": "0x_FROM_DEPLOYMENT_JSON"
  }'
```

Replace `<chainId>` with the database chain ID (not the EVM chainId). Use the addresses from the deployment JSON file.

## 7. Restart core-wallet-service

The core-wallet-service caches contract addresses at startup. After registering new addresses, restart it:

```bash
ssh green@vaulthub.live
cd /docker/CryptoVaultHub
docker compose restart core-wallet-service
```

Monitor logs to confirm the service picks up the new addresses:

```bash
docker compose logs -f core-wallet-service --tail=50
```

## 8. Verification Checklist

After deployment and registration, verify end-to-end functionality:

- [ ] **computeForwarderAddress** -- Call the forwarder factory's `computeAddress(salt)` to ensure deterministic address generation works
- [ ] **Create a new wallet** -- Via the client API, create a wallet on the deployed chain and confirm the transaction succeeds
- [ ] **Deposit to forwarder** -- Send a small amount of native token to a computed forwarder address
- [ ] **Flush forwarder** -- Call flush on the forwarder and verify funds arrive at the parent wallet
- [ ] **ERC-20 flush** -- Send a testnet ERC-20 token to the forwarder and flush it
- [ ] **Batcher** -- Execute a batch operation through CvhBatcher and confirm all sub-transactions succeed
- [ ] **Indexer events** -- Confirm the indexer detects and records on-chain events from the new contracts

## 9. Mainnet Deployment

Follow the same steps as above, using the mainnet network flag:

```bash
# Example: BSC Mainnet
npx hardhat run scripts/deploy.ts --network bsc

# Ethereum Mainnet
npx hardhat run scripts/deploy.ts --network ethereum

# Polygon Mainnet
npx hardhat run scripts/deploy.ts --network polygon
```

Repeat steps 5-8 for each mainnet chain. Use real (small) amounts for verification on mainnet.

### Mainnet Deployment Order (recommended)

1. BSC (lowest gas costs, good for initial mainnet validation)
2. Polygon
3. Arbitrum / Optimism / Base (L2s with low gas)
4. Avalanche
5. Ethereum (highest gas, deploy last after full confidence)

## 10. Rollback

If issues are found after deployment:

1. **Old factory addresses still work** -- Contracts are immutable once deployed. The old factories remain functional on-chain.
2. **Re-register old addresses** -- Use the same `PATCH /admin/chains/:chainId` endpoint to restore the previous contract addresses.
3. **Restart core-wallet-service** -- After re-registering, restart the service to pick up the reverted addresses.

```bash
# Re-register old addresses
curl -X PATCH https://admin-api.vaulthub.live/admin/chains/<chainId> \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "walletFactoryAddress": "0x_OLD_ADDRESS",
    "forwarderFactoryAddress": "0x_OLD_ADDRESS",
    "walletImplAddress": "0x_OLD_ADDRESS",
    "forwarderImplAddress": "0x_OLD_ADDRESS"
  }'
```

No on-chain rollback is needed. The blockchain state is append-only; simply point the platform back to the old addresses.
