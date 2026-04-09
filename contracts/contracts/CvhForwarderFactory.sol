// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.27;

import "./CloneFactory.sol";
import "./CvhForwarder.sol";

/**
 * @title CvhForwarderFactory
 * @notice Factory for deploying CvhForwarder clones via CREATE2
 */
contract CvhForwarderFactory is CloneFactory {
    // --- Events ---
    event ForwarderCreated(address forwarderAddress, address parentAddress, address feeAddress);

    // --- State ---
    address public immutable implementationAddress;

    /**
     * @param _implementationAddress The CvhForwarder implementation address
     */
    constructor(address _implementationAddress) {
        implementationAddress = _implementationAddress;
    }

    /**
     * @notice Deploy a new forwarder clone and initialize it
     * @param parent The parent wallet address
     * @param feeAddress The fee address
     * @param salt User-provided salt
     * @param _autoFlush721 Whether to auto-forward ERC721
     * @param _autoFlush1155 Whether to auto-forward ERC1155
     * @return forwarder The address of the new forwarder
     */
    function createForwarder(
        address parent,
        address feeAddress,
        bytes32 salt,
        bool _autoFlush721,
        bool _autoFlush1155
    ) external returns (address payable forwarder) {
        bytes32 finalSalt = keccak256(abi.encodePacked(msg.sender, parent, feeAddress, salt));
        forwarder = createClone(implementationAddress, finalSalt);
        CvhForwarder(payable(forwarder)).init(parent, feeAddress, _autoFlush721, _autoFlush1155);
        emit ForwarderCreated(forwarder, parent, feeAddress);
    }

    /**
     * @notice Predict the address of a forwarder clone
     * @param parent The parent wallet address
     * @param feeAddress The fee address
     * @param salt User-provided salt
     * @return The predicted address
     */
    function computeForwarderAddress(
        address parent,
        address feeAddress,
        bytes32 salt
    ) external view returns (address) {
        bytes32 finalSalt = keccak256(abi.encodePacked(parent, feeAddress, salt));
        return computeCloneAddress(implementationAddress, finalSalt);
    }
}
