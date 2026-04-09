// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.27;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IForwarder.sol";
import "./TransferHelper.sol";

/**
 * @title CvhWalletSimple
 * @notice 2-of-3 multisig wallet adapted from BitGo eth-multisig-v4
 */
contract CvhWalletSimple is IERC721Receiver, ERC1155Holder, ReentrancyGuard {
    // --- Custom Errors ---
    error AlreadyInitialized();
    error RequiresThreeSigners();
    error ZeroAddressSigner();
    error DuplicateSigner();
    error NotASigner();
    error SafeModeRestriction();
    error UnequalLengths();
    error EmptyBatch();
    error MaxRecipientsExceeded();
    error BatchNotAllowedInSafeMode();
    error CallFailed();
    error BatchTransferFailed();
    error Expired();
    error SequenceIdAlreadyUsed();
    error SequenceIdTooLow();
    error SequenceIdTooHigh();
    error InvalidSignatureLength();
    error InvalidVValue();
    error InvalidSValue();
    error InvalidSignature();
    error SignersMustBeDifferent();

    // --- Events ---
    event Deposited(address from, uint256 value, bytes data);
    event Transacted(
        address msgSender,
        address otherSigner,
        bytes32 operation,
        address toAddress,
        uint256 value,
        bytes data
    );
    event BatchTransacted(
        address msgSender,
        address otherSigner,
        bytes32 operation
    );
    event BatchTransfer(address indexed sender, address recipient, uint256 value);
    event SafeModeActivated(address msgSender);

    // --- Constants ---
    uint256 private constant SEQUENCE_ID_WINDOW_SIZE = 10;
    uint256 private constant MAX_SEQUENCE_ID_INCREASE = 10000;

    // secp256k1n / 2 for malleability protection
    uint256 private constant MAX_S_VALUE = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    // --- State ---
    bool public initialized;
    bool public safeMode;
    address[] public signers;
    mapping(address => bool) public isSigner;
    uint256[10] private recentSequenceIds;

    // --- Constructor (disable init on implementation) ---
    constructor() {
        initialized = true;
    }

    // --- Modifiers ---
    modifier onlySigner() {
        if (!isSigner[msg.sender]) revert NotASigner();
        _;
    }

    /**
     * @notice Initialize the wallet with 3 signers
     * @param allowedSigners Array of exactly 3 unique non-zero signer addresses
     */
    function init(address[] calldata allowedSigners) external {
        if (initialized) revert AlreadyInitialized();
        if (allowedSigners.length != 3) revert RequiresThreeSigners();

        for (uint256 i = 0; i < 3;) {
            if (allowedSigners[i] == address(0)) revert ZeroAddressSigner();
            if (isSigner[allowedSigners[i]]) revert DuplicateSigner();
            isSigner[allowedSigners[i]] = true;
            signers.push(allowedSigners[i]);
            unchecked { ++i; }
        }

        initialized = true;
    }

    // --- Network IDs (virtual for override) ---

    function getNetworkId() public view virtual returns (string memory) {
        return Strings.toString(block.chainid);
    }

    function getTokenNetworkId() public view virtual returns (string memory) {
        return string(abi.encodePacked(getNetworkId(), "-ERC20"));
    }

    function getBatchNetworkId() public view virtual returns (string memory) {
        return string(abi.encodePacked(getNetworkId(), "-Batch"));
    }

    // --- Main operations ---

    /**
     * @notice Execute a multisig transaction
     * @param toAddress Destination address
     * @param value Amount of ETH to send
     * @param data Transaction data
     * @param expireTime Expiration timestamp
     * @param sequenceId Sequence ID for replay protection
     * @param signature Signature from the second signer
     */
    function sendMultiSig(
        address toAddress,
        uint256 value,
        bytes calldata data,
        uint256 expireTime,
        uint256 sequenceId,
        bytes calldata signature
    ) external onlySigner nonReentrant {
        bytes32 operationHash = keccak256(
            abi.encode(
                getNetworkId(),
                toAddress,
                value,
                data,
                expireTime,
                sequenceId
            )
        );

        address otherSigner = _verifyMultiSig(
            operationHash,
            signature,
            expireTime,
            sequenceId
        );

        // In safe mode, can only send to signers
        if (safeMode) {
            if (!isSigner[toAddress]) revert SafeModeRestriction();
        }

        (bool success, ) = toAddress.call{value: value}(data);
        if (!success) revert CallFailed();

        emit Transacted(msg.sender, otherSigner, operationHash, toAddress, value, data);
    }

    /**
     * @notice Execute a multisig ERC20 token transfer
     */
    function sendMultiSigToken(
        address toAddress,
        uint256 value,
        address tokenContractAddress,
        uint256 expireTime,
        uint256 sequenceId,
        bytes calldata signature
    ) external onlySigner nonReentrant {
        bytes32 operationHash = keccak256(
            abi.encode(
                getTokenNetworkId(),
                toAddress,
                value,
                tokenContractAddress,
                expireTime,
                sequenceId
            )
        );

        address otherSigner = _verifyMultiSig(
            operationHash,
            signature,
            expireTime,
            sequenceId
        );

        // IMPORTANT-7: Safe mode check for token transfers
        if (safeMode) {
            if (!isSigner[toAddress]) revert SafeModeRestriction();
        }

        TransferHelper.safeTransfer(tokenContractAddress, toAddress, value);

        emit Transacted(msg.sender, otherSigner, operationHash, toAddress, value, "");
    }

    /**
     * @notice Execute a multisig batch transfer of ETH
     * @param recipients Array of recipient addresses
     * @param values Array of values to send
     * @param expireTime Expiration timestamp
     * @param sequenceId Sequence ID
     * @param signature Signature from second signer
     */
    function sendMultiSigBatch(
        address[] calldata recipients,
        uint256[] calldata values,
        uint256 expireTime,
        uint256 sequenceId,
        bytes calldata signature
    ) external onlySigner nonReentrant {
        if (safeMode) revert BatchNotAllowedInSafeMode();
        if (recipients.length != values.length) revert UnequalLengths();
        if (recipients.length == 0) revert EmptyBatch();
        if (recipients.length > 255) revert MaxRecipientsExceeded();

        bytes32 operationHash = keccak256(
            abi.encode(
                getBatchNetworkId(),
                recipients,
                values,
                expireTime,
                sequenceId
            )
        );

        address otherSigner = _verifyMultiSig(
            operationHash,
            signature,
            expireTime,
            sequenceId
        );

        for (uint256 i = 0; i < recipients.length;) {
            (bool success, ) = recipients[i].call{value: values[i], gas: 100000}("");
            if (!success) revert BatchTransferFailed();
            emit BatchTransfer(msg.sender, recipients[i], values[i]);
            unchecked { ++i; }
        }

        emit BatchTransacted(msg.sender, otherSigner, operationHash);
    }

    /**
     * @notice Flush tokens from a forwarder back to this wallet
     */
    function flushForwarderTokens(
        address payable forwarderAddress,
        address tokenContractAddress
    ) external onlySigner {
        IForwarder(forwarderAddress).flushTokens(tokenContractAddress);
    }

    /**
     * @notice Activate safe mode (irrevocable)
     */
    function activateSafeMode() external onlySigner {
        safeMode = true;
        emit SafeModeActivated(msg.sender);
    }

    // --- Sequence ID management ---

    /**
     * @notice Get the next available sequence ID
     * @return The next sequence ID (highest in window + 1)
     */
    function getNextSequenceId() public view returns (uint256) {
        uint256 highest = 0;
        for (uint256 i = 0; i < SEQUENCE_ID_WINDOW_SIZE;) {
            if (recentSequenceIds[i] > highest) {
                highest = recentSequenceIds[i];
            }
            unchecked { ++i; }
        }
        return highest + 1;
    }

    /**
     * @notice Try to insert a sequence ID into the window
     * @param sequenceId The sequence ID to insert
     */
    function _tryInsertSequenceId(uint256 sequenceId) internal {
        uint256 lowestValue = type(uint256).max;
        uint256 lowestIndex = 0;

        for (uint256 i = 0; i < SEQUENCE_ID_WINDOW_SIZE;) {
            if (recentSequenceIds[i] == sequenceId) revert SequenceIdAlreadyUsed();
            if (recentSequenceIds[i] < lowestValue) {
                lowestValue = recentSequenceIds[i];
                lowestIndex = i;
            }
            unchecked { ++i; }
        }

        if (sequenceId <= lowestValue) revert SequenceIdTooLow();
        if (sequenceId > lowestValue + MAX_SEQUENCE_ID_INCREASE) revert SequenceIdTooHigh();

        recentSequenceIds[lowestIndex] = sequenceId;
    }

    // --- Signature verification ---

    /**
     * @notice Verify multisig operation
     */
    function _verifyMultiSig(
        bytes32 operationHash,
        bytes calldata signature,
        uint256 expireTime,
        uint256 sequenceId
    ) internal returns (address) {
        if (expireTime < block.timestamp) revert Expired();

        _tryInsertSequenceId(sequenceId);

        address otherSigner = _recoverSigner(operationHash, signature);

        if (!isSigner[otherSigner]) revert NotASigner();
        if (otherSigner == msg.sender) revert SignersMustBeDifferent();

        return otherSigner;
    }

    /**
     * @notice Recover signer address from signature
     * @param operationHash Hash that was signed
     * @param signature 65-byte ECDSA signature (r, s, v)
     */
    function _recoverSigner(
        bytes32 operationHash,
        bytes calldata signature
    ) internal pure returns (address) {
        if (signature.length != 65) revert InvalidSignatureLength();

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            let sigOffset := signature.offset
            r := calldataload(sigOffset)
            s := calldataload(add(sigOffset, 32))
            v := byte(0, calldataload(add(sigOffset, 64)))
        }

        // v correction
        if (v < 27) {
            v += 27;
        }
        if (v != 27 && v != 28) revert InvalidVValue();

        // Malleability protection
        if (uint256(s) > MAX_S_VALUE) revert InvalidSValue();

        bytes32 prefixedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", operationHash)
        );

        address recovered = ecrecover(prefixedHash, v, r, s);
        if (recovered == address(0)) revert InvalidSignature();

        return recovered;
    }

    // --- NFT support ---

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
            interfaceId == type(IERC721Receiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    // --- Receive / Fallback ---

    receive() external payable {
        if (msg.value > 0) {
            emit Deposited(msg.sender, msg.value, "");
        }
    }

    fallback() external payable {
        if (msg.value > 0) {
            emit Deposited(msg.sender, msg.value, msg.data);
        }
    }
}
