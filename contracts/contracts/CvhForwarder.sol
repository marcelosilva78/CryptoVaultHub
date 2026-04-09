// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.27;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "./interfaces/IERC20.sol";
import "./TransferHelper.sol";

/**
 * @title CvhForwarder
 * @notice Deposit address contract that auto-forwards ETH to the parent wallet
 */
contract CvhForwarder is IERC721Receiver, IERC1155Receiver, ERC165 {
    // --- Events ---
    event ForwarderDeposited(address from, uint256 value);

    // --- State ---
    bool public initialized;
    address payable public parentAddress;
    address public feeAddress;
    bool public autoFlush721;
    bool public autoFlush1155;

    // --- Constructor (disable init on implementation) ---
    constructor() {
        initialized = true;
    }

    // --- Modifiers ---
    modifier onlyAllowedAddress() {
        require(
            msg.sender == parentAddress || msg.sender == feeAddress,
            "CvhForwarder: not allowed"
        );
        _;
    }

    modifier onlyParent() {
        require(msg.sender == parentAddress, "CvhForwarder: not parent");
        _;
    }

    /**
     * @notice Initialize the forwarder
     * @param _parentAddress The parent wallet address
     * @param _feeAddress The fee address
     * @param _autoFlush721 Whether to auto-forward ERC721 tokens
     * @param _autoFlush1155 Whether to auto-forward ERC1155 tokens
     */
    function init(
        address _parentAddress,
        address _feeAddress,
        bool _autoFlush721,
        bool _autoFlush1155
    ) external {
        require(!initialized, "CvhForwarder: already initialized");
        require(_parentAddress != address(0), "CvhForwarder: zero parent");
        require(_feeAddress != address(0), "CvhForwarder: zero fee address");

        parentAddress = payable(_parentAddress);
        feeAddress = _feeAddress;
        autoFlush721 = _autoFlush721;
        autoFlush1155 = _autoFlush1155;
        initialized = true;

        // If contract has ETH balance at init, flush immediately
        uint256 balance = address(this).balance;
        if (balance > 0) {
            _flush();
        }
    }

    /**
     * @notice Flush all ETH to parent
     */
    function flush() public {
        _flush();
    }

    function _flush() internal {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool success, ) = parentAddress.call{value: balance}("");
            require(success, "CvhForwarder: flush failed");
            emit ForwarderDeposited(address(this), balance);
        }
    }

    /**
     * @notice Flush ERC20 tokens to parent
     * @param tokenContractAddress The ERC20 token address
     */
    function flushTokens(address tokenContractAddress) external onlyAllowedAddress {
        ERC20Interface token = ERC20Interface(tokenContractAddress);
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) {
            TransferHelper.safeTransfer(tokenContractAddress, parentAddress, balance);
        }
    }

    /**
     * @notice Batch flush multiple ERC20 tokens to parent
     * @param tokenContractAddresses Array of ERC20 token addresses
     */
    function batchFlushERC20Tokens(address[] calldata tokenContractAddresses) external onlyAllowedAddress {
        for (uint256 i = 0; i < tokenContractAddresses.length; i++) {
            ERC20Interface token = ERC20Interface(tokenContractAddresses[i]);
            uint256 balance = token.balanceOf(address(this));
            if (balance > 0) {
                TransferHelper.safeTransfer(tokenContractAddresses[i], parentAddress, balance);
            }
        }
    }

    /**
     * @notice Flush an ERC721 token to parent
     * @param tokenContractAddress The ERC721 token address
     * @param tokenId The token ID
     */
    function flushERC721Token(
        address tokenContractAddress,
        uint256 tokenId
    ) external onlyAllowedAddress {
        IERC721(tokenContractAddress).safeTransferFrom(address(this), parentAddress, tokenId);
    }

    /**
     * @notice Flush ERC1155 tokens to parent
     * @param tokenContractAddress The ERC1155 token address
     * @param tokenId The token ID
     */
    function flushERC1155Tokens(
        address tokenContractAddress,
        uint256 tokenId
    ) external onlyAllowedAddress {
        uint256 balance = IERC1155(tokenContractAddress).balanceOf(address(this), tokenId);
        if (balance > 0) {
            IERC1155(tokenContractAddress).safeTransferFrom(
                address(this),
                parentAddress,
                tokenId,
                balance,
                ""
            );
        }
    }

    /**
     * @notice Set auto-flush for ERC721
     */
    function setAutoFlush721(bool _autoFlush721) external onlyAllowedAddress {
        autoFlush721 = _autoFlush721;
    }

    /**
     * @notice Set auto-flush for ERC1155
     */
    function setAutoFlush1155(bool _autoFlush1155) external onlyAllowedAddress {
        autoFlush1155 = _autoFlush1155;
    }

    /**
     * @notice Execute an arbitrary call from the parent
     * @param target Target address
     * @param value ETH value
     * @param data Call data
     */
    function callFromParent(
        address target,
        uint256 value,
        bytes calldata data
    ) external onlyParent returns (bytes memory) {
        (bool success, bytes memory returnData) = target.call{value: value}(data);
        require(success, "CvhForwarder: call failed");
        return returnData;
    }

    // --- NFT auto-forwarding ---

    function onERC721Received(
        address,
        address,
        uint256 tokenId,
        bytes calldata
    ) external override returns (bytes4) {
        if (autoFlush721) {
            // Try to forward to parent. Use try/catch to check if parent supports IERC721Receiver
            try IERC165(parentAddress).supportsInterface(type(IERC721Receiver).interfaceId) returns (bool supported) {
                if (supported) {
                    IERC721(msg.sender).safeTransferFrom(address(this), parentAddress, tokenId);
                } else {
                    IERC721(msg.sender).transferFrom(address(this), parentAddress, tokenId);
                }
            } catch {
                IERC721(msg.sender).transferFrom(address(this), parentAddress, tokenId);
            }
        }
        return IERC721Receiver.onERC721Received.selector;
    }

    function onERC1155Received(
        address,
        address,
        uint256 id,
        uint256 value,
        bytes calldata
    ) external override returns (bytes4) {
        if (autoFlush1155) {
            IERC1155(msg.sender).safeTransferFrom(address(this), parentAddress, id, value, "");
        }
        return IERC1155Receiver.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata
    ) external override returns (bytes4) {
        if (autoFlush1155) {
            IERC1155(msg.sender).safeBatchTransferFrom(address(this), parentAddress, ids, values, "");
        }
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return
            interfaceId == type(IERC721Receiver).interfaceId ||
            interfaceId == type(IERC1155Receiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    // --- Receive / Fallback ---

    receive() external payable {
        flush();
    }

    fallback() external payable {
        flush();
    }
}
