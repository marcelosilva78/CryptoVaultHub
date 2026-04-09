// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.27;

import "./TransferHelper.sol";

/**
 * @title CvhBatcher
 * @notice Batch transfer contract for ETH and ERC20 tokens
 */
contract CvhBatcher {
    // --- Events ---
    event BatchTransfer(address indexed sender, address recipient, uint256 value);
    event TransferGasLimitChange(uint256 newGasLimit);
    event BatchTransferLimitChange(uint256 newLimit);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // --- State ---
    address public owner;
    uint256 public transferGasLimit;
    uint256 public batchTransferLimit;

    // --- Modifiers ---
    modifier onlyOwner() {
        require(msg.sender == owner, "CvhBatcher: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        transferGasLimit = 30000;
        batchTransferLimit = 255;
    }

    /**
     * @notice Batch transfer ETH to multiple recipients
     * @param recipients Array of recipient addresses
     * @param values Array of values to send
     */
    function batchTransfer(
        address[] calldata recipients,
        uint256[] calldata values
    ) external payable {
        require(recipients.length == values.length, "CvhBatcher: unequal lengths");
        require(recipients.length > 0, "CvhBatcher: empty batch");
        require(recipients.length <= batchTransferLimit, "CvhBatcher: exceeds batch limit");

        uint256 totalSent = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "CvhBatcher: zero address recipient");
            (bool success, ) = recipients[i].call{value: values[i], gas: transferGasLimit}("");
            require(success, "CvhBatcher: transfer failed");
            totalSent += values[i];
            emit BatchTransfer(msg.sender, recipients[i], values[i]);
        }

        require(totalSent <= msg.value, "CvhBatcher: insufficient ETH");

        // Refund excess
        uint256 excess = msg.value - totalSent;
        if (excess > 0) {
            (bool refundSuccess, ) = msg.sender.call{value: excess}("");
            require(refundSuccess, "CvhBatcher: refund failed");
        }
    }

    /**
     * @notice Batch transfer ERC20 tokens to multiple recipients
     * @param tokenAddress The ERC20 token address
     * @param recipients Array of recipient addresses
     * @param values Array of values to send
     */
    function batchTransferToken(
        address tokenAddress,
        address[] calldata recipients,
        uint256[] calldata values
    ) external {
        require(recipients.length == values.length, "CvhBatcher: unequal lengths");
        require(recipients.length > 0, "CvhBatcher: empty batch");
        require(recipients.length <= batchTransferLimit, "CvhBatcher: exceeds batch limit");

        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "CvhBatcher: zero address recipient");
            TransferHelper.safeTransfer(tokenAddress, recipients[i], values[i]);
            emit BatchTransfer(msg.sender, recipients[i], values[i]);
        }
    }

    /**
     * @notice Set the gas limit for individual transfers
     */
    function setTransferGasLimit(uint256 _transferGasLimit) external onlyOwner {
        transferGasLimit = _transferGasLimit;
        emit TransferGasLimitChange(_transferGasLimit);
    }

    /**
     * @notice Set the maximum batch size
     */
    function setBatchTransferLimit(uint256 _batchTransferLimit) external onlyOwner {
        batchTransferLimit = _batchTransferLimit;
        emit BatchTransferLimitChange(_batchTransferLimit);
    }

    /**
     * @notice Transfer ownership to a new address
     * @param newOwner The new owner address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "CvhBatcher: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /**
     * @notice Recover ETH stuck in contract
     * @param to Recipient address
     */
    function recover(address payable to) external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool success, ) = to.call{value: balance}("");
            require(success, "CvhBatcher: recover failed");
        }
    }
}
