// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.27;

/**
 * @title CloneFactory
 * @notice EIP-1167 minimal proxy deployer using CREATE2
 */
contract CloneFactory {
    /**
     * @notice Deploys a minimal proxy (EIP-1167) clone of `target` using CREATE2
     * @param target The implementation contract address
     * @param salt The CREATE2 salt
     * @return result The address of the newly deployed clone
     */
    function createClone(address target, bytes32 salt) internal returns (address payable result) {
        bytes20 targetBytes = bytes20(target);
        // solhint-disable-next-line no-inline-assembly
        assembly {
            let clone := mload(0x40)
            mstore(clone, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(clone, 0x14), targetBytes)
            mstore(add(clone, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            result := create2(0, clone, 0x37, salt)
        }
        require(result != address(0), "CloneFactory: CREATE2 failed");
    }

    /**
     * @notice Predicts the CREATE2 address of a minimal proxy clone
     * @param target The implementation contract address
     * @param salt The CREATE2 salt
     * @return predicted The predicted address
     */
    function computeCloneAddress(address target, bytes32 salt) internal view returns (address predicted) {
        bytes20 targetBytes = bytes20(target);
        bytes memory bytecode = abi.encodePacked(
            hex"3d602d80600a3d3981f3363d3d373d3d3d363d73",
            targetBytes,
            hex"5af43d82803e903d91602b57fd5bf3"
        );
        bytes32 bytecodeHash = keccak256(bytecode);
        predicted = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(bytes1(0xff), address(this), salt, bytecodeHash)
                    )
                )
            )
        );
    }
}
