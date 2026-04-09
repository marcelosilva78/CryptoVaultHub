// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.27;

abstract contract ERC20Interface {
    function transfer(address to, uint256 value) public virtual returns (bool);
    function balanceOf(address who) public view virtual returns (uint256);
}
