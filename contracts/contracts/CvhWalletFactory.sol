// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.27;

import "./CloneFactory.sol";
import "./CvhWalletSimple.sol";

/**
 * @title CvhWalletFactory
 * @notice Factory for deploying CvhWalletSimple clones via CREATE2
 */
contract CvhWalletFactory is CloneFactory {
    // --- Events ---
    event WalletCreated(address walletAddress, address[] allowedSigners);

    // --- State ---
    address public implementationAddress;

    /**
     * @param _implementationAddress The CvhWalletSimple implementation address
     */
    constructor(address _implementationAddress) {
        implementationAddress = _implementationAddress;
    }

    /**
     * @notice Deploy a new wallet clone and initialize it
     * @param allowedSigners Array of 3 signer addresses
     * @param salt User-provided salt
     * @return wallet The address of the new wallet
     */
    function createWallet(
        address[] calldata allowedSigners,
        bytes32 salt
    ) external returns (address payable wallet) {
        bytes32 finalSalt = keccak256(abi.encodePacked(allowedSigners, salt));
        wallet = createClone(implementationAddress, finalSalt);
        CvhWalletSimple(wallet).init(allowedSigners);
        emit WalletCreated(wallet, allowedSigners);
    }

    /**
     * @notice Predict the address of a wallet clone
     * @param allowedSigners Array of 3 signer addresses
     * @param salt User-provided salt
     * @return The predicted address
     */
    function computeWalletAddress(
        address[] calldata allowedSigners,
        bytes32 salt
    ) external view returns (address) {
        bytes32 finalSalt = keccak256(abi.encodePacked(allowedSigners, salt));
        return computeCloneAddress(implementationAddress, finalSalt);
    }
}
