// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.27;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./interfaces/IForwarder.sol";
import "./TransferHelper.sol";

/**
 * @title CvhWalletSimple
 * @notice 2-of-3 multisig wallet adapted from BitGo eth-multisig-v4
 */
contract CvhWalletSimple is IERC721Receiver, ERC1155Holder {
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

    // --- Modifiers ---
    modifier onlySigner() {
        require(isSigner[msg.sender], "CvhWalletSimple: not a signer");
        _;
    }

    /**
     * @notice Initialize the wallet with 3 signers
     * @param allowedSigners Array of exactly 3 unique non-zero signer addresses
     */
    function init(address[] calldata allowedSigners) external {
        require(!initialized, "CvhWalletSimple: already initialized");
        require(allowedSigners.length == 3, "CvhWalletSimple: requires exactly 3 signers");

        for (uint256 i = 0; i < 3; i++) {
            require(allowedSigners[i] != address(0), "CvhWalletSimple: zero address signer");
            require(!isSigner[allowedSigners[i]], "CvhWalletSimple: duplicate signer");
            isSigner[allowedSigners[i]] = true;
            signers.push(allowedSigners[i]);
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
    ) external onlySigner {
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
            toAddress,
            operationHash,
            signature,
            expireTime,
            sequenceId
        );

        // In safe mode, can only send to signers
        if (safeMode) {
            require(isSigner[toAddress], "CvhWalletSimple: safe mode - can only send to signers");
        }

        (bool success, ) = toAddress.call{value: value}(data);
        require(success, "CvhWalletSimple: call failed");

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
    ) external onlySigner {
        bytes32 operationHash = keccak256(
            abi.encodePacked(
                getTokenNetworkId(),
                toAddress,
                value,
                tokenContractAddress,
                expireTime,
                sequenceId
            )
        );

        address otherSigner = _verifyMultiSig(
            toAddress,
            operationHash,
            signature,
            expireTime,
            sequenceId
        );

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
    ) external onlySigner {
        require(!safeMode, "CvhWalletSimple: batch not allowed in safe mode");
        require(recipients.length == values.length, "CvhWalletSimple: unequal lengths");
        require(recipients.length > 0, "CvhWalletSimple: empty batch");
        require(recipients.length <= 255, "CvhWalletSimple: max 255 recipients");

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
            recipients[0],
            operationHash,
            signature,
            expireTime,
            sequenceId
        );

        for (uint256 i = 0; i < recipients.length; i++) {
            (bool success, ) = recipients[i].call{value: values[i]}("");
            require(success, "CvhWalletSimple: batch transfer failed");
            emit BatchTransfer(msg.sender, recipients[i], values[i]);
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
        for (uint256 i = 0; i < SEQUENCE_ID_WINDOW_SIZE; i++) {
            if (recentSequenceIds[i] > highest) {
                highest = recentSequenceIds[i];
            }
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

        for (uint256 i = 0; i < SEQUENCE_ID_WINDOW_SIZE; i++) {
            require(recentSequenceIds[i] != sequenceId, "CvhWalletSimple: sequence ID already used");
            if (recentSequenceIds[i] < lowestValue) {
                lowestValue = recentSequenceIds[i];
                lowestIndex = i;
            }
        }

        require(
            sequenceId > lowestValue,
            "CvhWalletSimple: sequence ID too low"
        );
        require(
            sequenceId <= lowestValue + MAX_SEQUENCE_ID_INCREASE,
            "CvhWalletSimple: sequence ID too high"
        );

        recentSequenceIds[lowestIndex] = sequenceId;
    }

    // --- Signature verification ---

    /**
     * @notice Verify multisig operation
     */
    function _verifyMultiSig(
        address toAddress,
        bytes32 operationHash,
        bytes calldata signature,
        uint256 expireTime,
        uint256 sequenceId
    ) internal returns (address) {
        // Silence unused variable warning
        toAddress;

        require(expireTime >= block.timestamp, "CvhWalletSimple: expired");

        _tryInsertSequenceId(sequenceId);

        address otherSigner = _recoverSigner(operationHash, signature);

        require(isSigner[otherSigner], "CvhWalletSimple: invalid signer");
        require(otherSigner != msg.sender, "CvhWalletSimple: signers must be different");

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
        require(signature.length == 65, "CvhWalletSimple: invalid signature length");

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
        require(v == 27 || v == 28, "CvhWalletSimple: invalid v value");

        // Malleability protection
        require(uint256(s) <= MAX_S_VALUE, "CvhWalletSimple: invalid s value (malleability)");

        bytes32 prefixedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", operationHash)
        );

        address recovered = ecrecover(prefixedHash, v, r, s);
        require(recovered != address(0), "CvhWalletSimple: invalid signature");

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
