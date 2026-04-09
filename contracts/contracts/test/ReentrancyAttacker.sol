// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

interface ICvhBatcher {
    function batchTransfer(
        address[] calldata recipients,
        uint256[] calldata values
    ) external payable;
}

/**
 * @notice Contract that attempts reentrancy on CvhBatcher.batchTransfer
 */
contract ReentrancyAttacker {
    ICvhBatcher public target;
    uint256 public attackCount;

    constructor(address _target) {
        target = ICvhBatcher(_target);
    }

    receive() external payable {
        if (attackCount < 1) {
            attackCount++;
            address[] memory recipients = new address[](1);
            recipients[0] = address(this);
            uint256[] memory values = new uint256[](1);
            values[0] = 0;
            // Attempt reentrant call - will fail due to onlyOwner (attacker is not owner)
            try target.batchTransfer{value: 0}(recipients, values) {} catch {}
        }
    }
}
