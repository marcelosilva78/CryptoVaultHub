# Smart Contract Documentation

## Overview

CryptoVaultHub uses 5 Solidity contracts adapted from BitGo's eth-multisig-v4. All contracts are compiled with Solidity 0.8.27, optimizer enabled (1000 runs), targeting the Cancun EVM version.

## Contracts

### CvhWalletSimple

**Purpose**: 2-of-3 multisig hot wallet for each client. All withdrawals and fund movements require 2 of 3 signer signatures.

**Source**: `contracts/contracts/CvhWalletSimple.sol`
**Based on**: BitGo WalletSimple.sol

**Interfaces**:

```solidity
// Initialize with exactly 3 signer addresses
function init(address[] calldata allowedSigners) external;

// Execute a multisig ETH transfer
function sendMultiSig(
    address toAddress,
    uint256 value,
    bytes calldata data,
    uint256 expireTime,
    uint256 sequenceId,
    bytes calldata signature
) external;

// Execute a multisig ERC-20 transfer
function sendMultiSigToken(
    address toAddress,
    uint256 value,
    address tokenContractAddress,
    uint256 expireTime,
    uint256 sequenceId,
    bytes calldata signature
) external;

// Execute a multisig batch ETH transfer (max 255 recipients)
function sendMultiSigBatch(
    address[] calldata recipients,
    uint256[] calldata values,
    uint256 expireTime,
    uint256 sequenceId,
    bytes calldata signature
) external;

// Flush tokens from a forwarder to this wallet
function flushForwarderTokens(
    address payable forwarderAddress,
    address tokenContractAddress
) external;

// Activate safe mode (irrevocable)
function activateSafeMode() external;

// Get the next available sequence ID
function getNextSequenceId() public view returns (uint256);
```

**Key Properties**:
- 3 signers set at initialization (immutable after init)
- All operations require `msg.sender` to be a signer (modifier `onlySigner`)
- Second signer verified via `ecrecover` on the operation hash
- Sequence ID window: 10 slots, max increase 10,000
- Cross-chain protection: `block.chainid` included in all operation hashes
- Network ID suffixes: base chain ID for ETH, `<chainId>-ERC20` for tokens, `<chainId>-Batch` for batches
- Signature malleability protection: `s <= secp256k1n/2`
- Supports receiving ETH, ERC-721 (`IERC721Receiver`), and ERC-1155 (`ERC1155Holder`)
- Safe mode: irrevocable, restricts `sendMultiSig` to signer addresses, disables `sendMultiSigBatch`

**Events**:
- `Deposited(address from, uint256 value, bytes data)` -- ETH received
- `Transacted(address msgSender, address otherSigner, bytes32 operation, address toAddress, uint256 value, bytes data)` -- Withdrawal executed
- `BatchTransacted(address msgSender, address otherSigner, bytes32 operation)` -- Batch transfer executed
- `BatchTransfer(address indexed sender, address recipient, uint256 value)` -- Individual transfer within batch
- `SafeModeActivated(address msgSender)` -- Safe mode engaged

---

### CvhForwarder

**Purpose**: Deposit address contract that auto-forwards ETH to the parent wallet (CvhWalletSimple). Holds ERC-20 tokens until manually flushed.

**Source**: `contracts/contracts/CvhForwarder.sol`
**Based on**: BitGo ForwarderV4.sol

**Interfaces**:

```solidity
// Initialize the forwarder (called once by factory)
function init(
    address _parentAddress,
    address _feeAddress,
    bool _autoFlush721,
    bool _autoFlush1155
) external;

// Flush all ETH to parent wallet
function flush() public;

// Flush a single ERC-20 token to parent
function flushTokens(address tokenContractAddress) external;

// Batch flush multiple ERC-20 tokens to parent
function batchFlushERC20Tokens(address[] calldata tokenContractAddresses) external;

// Flush an ERC-721 token to parent
function flushERC721Token(address tokenContractAddress, uint256 tokenId) external;

// Flush ERC-1155 tokens to parent
function flushERC1155Tokens(address tokenContractAddress, uint256 tokenId) external;

// Toggle auto-flush for ERC-721
function setAutoFlush721(bool _autoFlush721) external;

// Toggle auto-flush for ERC-1155
function setAutoFlush1155(bool _autoFlush1155) external;

// Execute arbitrary call (parent only)
function callFromParent(
    address target,
    uint256 value,
    bytes calldata data
) external returns (bytes memory);
```

**Key Properties**:
- `parentAddress` and `feeAddress` set once in `init()` (immutable)
- ETH auto-forwarding: `receive()` and `fallback()` call `flush()` which sends all ETH to parent
- ERC-20 flush: callable by parent or feeAddress (`onlyAllowedAddress` modifier)
- ERC-721 auto-forwarding: if `autoFlush721` is true, received NFTs are forwarded to parent
- ERC-1155 auto-forwarding: if `autoFlush1155` is true, received tokens are forwarded to parent
- `callFromParent`: allows parent wallet to execute arbitrary calls through the forwarder
- If ETH exists at the forwarder address before `init()`, it is flushed during initialization

**Access Control**:
- `onlyAllowedAddress`: parent OR feeAddress (for flush operations)
- `onlyParent`: parent only (for `callFromParent`)

**Events**:
- `ForwarderDeposited(address from, uint256 value)` -- ETH forwarded to parent

---

### CvhForwarderFactory

**Purpose**: Factory for deploying CvhForwarder clones using CREATE2 + EIP-1167 minimal proxy. Enables deterministic address computation before deployment.

**Source**: `contracts/contracts/CvhForwarderFactory.sol`
**Based on**: BitGo ForwarderFactoryV4.sol

**Interfaces**:

```solidity
// Deploy a new forwarder clone and initialize it
function createForwarder(
    address parent,
    address feeAddress,
    bytes32 salt,
    bool _autoFlush721,
    bool _autoFlush1155
) external returns (address payable forwarder);

// Predict the address of a forwarder clone (no deployment)
function computeForwarderAddress(
    address parent,
    address feeAddress,
    bytes32 salt
) external view returns (address);
```

**Key Properties**:
- `implementationAddress`: set in constructor, points to CvhForwarder implementation
- Salt binding: `finalSalt = keccak256(abi.encodePacked(parent, feeAddress, salt))`
- Deterministic: `computeForwarderAddress` returns the exact address before deployment
- Lazy deployment: compute address first, deploy only when needed (for ERC-20 flushing)

**Events**:
- `ForwarderCreated(address forwarderAddress, address parentAddress, address feeAddress)`

---

### CvhWalletFactory

**Purpose**: Factory for deploying CvhWalletSimple clones using CREATE2 + EIP-1167 minimal proxy.

**Source**: `contracts/contracts/CvhWalletFactory.sol`
**Based on**: BitGo WalletFactory.sol

**Interfaces**:

```solidity
// Deploy a new wallet clone and initialize it
function createWallet(
    address[] calldata allowedSigners,
    bytes32 salt
) external returns (address payable wallet);

// Predict the address of a wallet clone
function computeWalletAddress(
    address[] calldata allowedSigners,
    bytes32 salt
) external view returns (address);
```

**Key Properties**:
- `implementationAddress`: set in constructor, points to CvhWalletSimple implementation
- Salt binding: `finalSalt = keccak256(abi.encodePacked(allowedSigners, salt))`
- Creates and initializes wallet in a single transaction

**Events**:
- `WalletCreated(address walletAddress, address[] allowedSigners)`

---

### CvhBatcher

**Purpose**: Batch transfer contract for efficiently distributing ETH or ERC-20 tokens to multiple recipients in a single transaction.

**Source**: `contracts/contracts/CvhBatcher.sol`
**Based on**: BitGo Batcher.sol

**Interfaces**:

```solidity
// Batch transfer ETH (msg.value split among recipients)
function batchTransfer(
    address[] calldata recipients,
    uint256[] calldata values
) external payable;

// Batch transfer ERC-20 tokens (requires prior approval)
function batchTransferToken(
    address tokenAddress,
    address[] calldata recipients,
    uint256[] calldata values
) external;

// Admin: set gas limit per individual transfer
function setTransferGasLimit(uint256 _transferGasLimit) external;

// Admin: set maximum batch size
function setBatchTransferLimit(uint256 _batchTransferLimit) external;

// Admin: recover ETH stuck in contract
function recover(address payable to) external;
```

**Key Properties**:
- Default gas limit per transfer: 30,000
- Default max batch size: 255 recipients
- Excess ETH sent with `batchTransfer` is refunded to `msg.sender`
- Owner-only admin functions for adjusting limits and recovering funds
- No zero-address recipients allowed

**Events**:
- `BatchTransfer(address indexed sender, address recipient, uint256 value)`
- `TransferGasLimitChange(uint256 newGasLimit)`
- `BatchTransferLimitChange(uint256 newLimit)`

---

### Supporting Contracts

#### CloneFactory

**Source**: `contracts/contracts/CloneFactory.sol`

Internal library that implements EIP-1167 minimal proxy deployment using CREATE2:

- `createClone(address target, bytes32 salt)` -- Deploys a ~45-byte minimal proxy via inline assembly
- `computeCloneAddress(address target, bytes32 salt)` -- Predicts the CREATE2 address without deployment

The minimal proxy bytecode follows the EIP-1167 standard:
```
363d3d373d3d3d363d73<implementation>5af43d82803e903d91602b57fd5bf3
```

#### TransferHelper

**Source**: `contracts/contracts/TransferHelper.sol`

Safe ERC-20 transfer library:
- `safeTransfer(address token, address to, uint256 value)` -- Low-level call with return value check
- Handles tokens that return `bool` and tokens that return nothing (non-standard)

## CREATE2 Address Computation

CREATE2 enables deterministic contract addresses computed from:
1. Factory address
2. Salt (derived from inputs)
3. Bytecode hash (minimal proxy pointing to implementation)

```
address = keccak256(0xff ++ factory ++ salt ++ keccak256(bytecode))[12:]
```

### Forwarder Address Computation

```
salt = keccak256(parentAddress, feeAddress, userSalt)
bytecode = EIP-1167 proxy pointing to CvhForwarder implementation
address = CREATE2(factory, salt, bytecodeHash)
```

### Wallet Address Computation

```
salt = keccak256(allowedSigners, userSalt)
bytecode = EIP-1167 proxy pointing to CvhWalletSimple implementation
address = CREATE2(factory, salt, bytecodeHash)
```

## Forwarder Lifecycle

```
Phase 1: Pre-Compute (Free)
+--------------------------------+
| CvhForwarderFactory            |
| .computeForwarderAddress(      |
|   parent, feeAddress, salt     |
| ) --> 0xDeterministicAddr      |
+--------------------------------+
        |
        | Share address with end user
        | User can send ETH/tokens here
        v

Phase 2: Deposit Detection
+--------------------------------+
| Chain Indexer detects Transfer  |
| event to 0xDeterministicAddr   |
| (even before deployment)       |
+--------------------------------+
        |
        v

Phase 3: Deploy (On Demand, ~45k gas)
+--------------------------------+
| CvhForwarderFactory            |
| .createForwarder(              |
|   parent, feeAddress, salt,    |
|   autoFlush721, autoFlush1155  |
| )                              |
|                                |
| Deploys EIP-1167 proxy +      |
| calls init() in one tx        |
|                                |
| If ETH in address: auto-flush |
+--------------------------------+
        |
        v

Phase 4: Flush (Ongoing)
+--------------------------------+
| ETH: auto-forwarded on each   |
|   receive() via flush()        |
|                                |
| ERC-20: Cron Worker calls      |
|   flushTokens() or             |
|   batchFlushERC20Tokens()      |
|   via Gas Tank (feeAddress)    |
|                                |
| ERC-721/1155: auto-forwarded   |
|   if autoFlush enabled         |
+--------------------------------+
```

## Multisig Signing Flow

### For sendMultiSig (ETH withdrawal)

```
1. Compute operationHash:
   keccak256(
     getNetworkId(),     // block.chainid as string
     toAddress,
     value,
     data,
     expireTime,
     sequenceId
   )

2. Signer 2 signs the Ethereum prefixed hash:
   prefixedHash = keccak256("\x19Ethereum Signed Message:\n32" + operationHash)
   signature = ecSign(prefixedHash, signer2PrivateKey)

3. Signer 1 submits the transaction as msg.sender:
   wallet.sendMultiSig(toAddress, value, data, expireTime, sequenceId, signature)

4. Contract verifies:
   - msg.sender is a signer
   - expireTime >= block.timestamp
   - sequenceId is valid (not used, within window)
   - ecrecover(signature) returns a different signer than msg.sender
   - In safe mode: toAddress must be a signer
```

### For sendMultiSigToken (ERC-20 withdrawal)

Same flow, but operationHash includes `getTokenNetworkId()` (chainId + "-ERC20") and `tokenContractAddress` instead of `data`.

## Gas Optimization Notes

### EIP-1167 Minimal Proxy

- Each forwarder deployment costs approximately 45,000 gas (vs. ~2M+ for full contract)
- Runtime bytecode is ~45 bytes -- delegates all calls to the implementation
- All forwarders share the same implementation contract, reducing chain bloat

### Lazy Deployment

- Forwarder addresses are known before deployment (CREATE2)
- ETH can be sent to the address before the forwarder exists
- Deploy only when ERC-20 flushing is needed, saving gas for ETH-only addresses
- On deployment, any ETH balance at the address is immediately flushed

### Batch Operations

- `batchFlushERC20Tokens()`: Flush multiple tokens in one transaction
- `sendMultiSigBatch()`: Send ETH to up to 255 recipients in one transaction
- `CvhBatcher.batchTransfer()`: Distribute ETH to multiple addresses in one call
- `CvhBatcher.batchTransferToken()`: Distribute ERC-20 tokens to multiple addresses

### Gas Tank Strategy

- One Gas Tank (EOA) per client per chain serves as the `feeAddress`
- Gas Tank pays for forwarder deployments and token flush operations
- Separating gas costs from the hot wallet simplifies accounting
- Gas Tank can be topped up from the hot wallet via multisig

## Deployment Addresses

After deploying contracts to a chain, the addresses follow this structure:

```
Chain: Ethereum (chainId: 1)
  CvhWalletSimple (impl): 0x...
  CvhForwarder (impl):    0x...
  CvhWalletFactory:       0x...
  CvhForwarderFactory:    0x...
  CvhBatcher:             0x...

Chain: BSC (chainId: 56)
  CvhWalletSimple (impl): 0x...
  CvhForwarder (impl):    0x...
  CvhWalletFactory:       0x...
  CvhForwarderFactory:    0x...
  CvhBatcher:             0x...
```

Each chain gets its own set of 5 contracts. The implementation contracts (CvhWalletSimple, CvhForwarder) are referenced by the factories but never called directly by users.

Contract addresses are registered in the platform via the Admin API (`POST /admin/chains`) and stored in `cvh_admin.chains` (which contains `wallet_factory_address`, `forwarder_factory_address`, `wallet_impl_address`, and `forwarder_impl_address` columns).
