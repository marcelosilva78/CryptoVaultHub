// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

/**
 * @notice A contract with an expensive fallback, used to test gas griefing protection.
 */
contract GasGriefer {
    uint256 public counter;

    receive() external payable {
        // Burn gas in a loop
        for (uint256 i = 0; i < 500; i++) {
            counter = i;
        }
    }
}
