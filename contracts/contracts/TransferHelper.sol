// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.27;

library TransferHelper {
    error TransferFailed();
    error TransferFromFailed();

    function safeTransfer(address token, address to, uint256 value) internal {
        // solhint-disable-next-line no-inline-assembly
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(0xa9059cbb, to, value)
        );
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }
    }

    function safeTransferFrom(address token, address from, address to, uint256 value) internal {
        // solhint-disable-next-line no-inline-assembly
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(0x23b872dd, from, to, value)
        );
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert TransferFromFailed();
        }
    }
}
