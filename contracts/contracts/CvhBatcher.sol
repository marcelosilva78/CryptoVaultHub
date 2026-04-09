// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.27;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./TransferHelper.sol";

/**
 * @title CvhBatcher
 * @notice Batch transfer contract for ETH and ERC20 tokens
 */
contract CvhBatcher is Ownable2Step {
    // --- Custom Errors ---
    error UnequalLengths();
    error EmptyBatch();
    error ExceedsBatchLimit();
    error ZeroAddressRecipient();
    error TransferFailed();
    error InsufficientETH();
    error RefundFailed();
    error RecoverFailed();
    error GasLimitOutOfRange();
    error BatchLimitOutOfRange();

    // --- Events ---
    event BatchTransfer(address indexed sender, address recipient, uint256 value);
    event TransferGasLimitChange(uint256 newGasLimit);
    event BatchTransferLimitChange(uint256 newLimit);

    // --- State ---
    uint256 public transferGasLimit;
    uint256 public batchTransferLimit;

    constructor() Ownable(msg.sender) {
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
    ) external payable onlyOwner {
        if (recipients.length != values.length) revert UnequalLengths();
        if (recipients.length == 0) revert EmptyBatch();
        if (recipients.length > batchTransferLimit) revert ExceedsBatchLimit();

        uint256 totalSent = 0;
        for (uint256 i = 0; i < recipients.length;) {
            if (recipients[i] == address(0)) revert ZeroAddressRecipient();
            (bool success, ) = recipients[i].call{value: values[i], gas: transferGasLimit}("");
            if (!success) revert TransferFailed();
            totalSent += values[i];
            emit BatchTransfer(msg.sender, recipients[i], values[i]);
            unchecked { ++i; }
        }

        if (totalSent > msg.value) revert InsufficientETH();

        // Refund excess
        uint256 excess = msg.value - totalSent;
        if (excess > 0) {
            (bool refundSuccess, ) = msg.sender.call{value: excess}("");
            if (!refundSuccess) revert RefundFailed();
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
    ) external onlyOwner {
        if (recipients.length != values.length) revert UnequalLengths();
        if (recipients.length == 0) revert EmptyBatch();
        if (recipients.length > batchTransferLimit) revert ExceedsBatchLimit();

        for (uint256 i = 0; i < recipients.length;) {
            if (recipients[i] == address(0)) revert ZeroAddressRecipient();
            TransferHelper.safeTransfer(tokenAddress, recipients[i], values[i]);
            emit BatchTransfer(msg.sender, recipients[i], values[i]);
            unchecked { ++i; }
        }
    }

    /**
     * @notice Set the gas limit for individual transfers
     */
    function setTransferGasLimit(uint256 _transferGasLimit) external onlyOwner {
        if (_transferGasLimit < 2300 || _transferGasLimit > 500000) revert GasLimitOutOfRange();
        transferGasLimit = _transferGasLimit;
        emit TransferGasLimitChange(_transferGasLimit);
    }

    /**
     * @notice Set the maximum batch size
     */
    function setBatchTransferLimit(uint256 _batchTransferLimit) external onlyOwner {
        if (_batchTransferLimit == 0 || _batchTransferLimit > 255) revert BatchLimitOutOfRange();
        batchTransferLimit = _batchTransferLimit;
        emit BatchTransferLimitChange(_batchTransferLimit);
    }

    /**
     * @notice Recover ETH stuck in contract
     * @param to Recipient address
     */
    function recover(address payable to) external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool success, ) = to.call{value: balance}("");
            if (!success) revert RecoverFailed();
        }
    }
}
