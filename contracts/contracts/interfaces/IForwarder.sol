// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.27;

interface IForwarder {
    function init(address _parentAddress, address _feeAddress, bool _autoFlush721, bool _autoFlush1155) external;
    function flushTokens(address tokenContractAddress) external;
    function batchFlushERC20Tokens(address[] calldata tokenContractAddresses) external;
    function flush() external;
}
