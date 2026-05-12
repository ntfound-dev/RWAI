// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

contract MockPyth {
    PythStructs.Price private price;
    uint256 public updateFee;
    bytes32 public lastPriceId;

    constructor(int64 initialPrice, uint64 initialConf, int32 initialExpo, uint256 initialPublishTime) {
        price = PythStructs.Price(initialPrice, initialConf, initialExpo, initialPublishTime);
    }

    function setPrice(int64 newPrice, uint64 newConf, int32 newExpo, uint256 newPublishTime) external {
        price = PythStructs.Price(newPrice, newConf, newExpo, newPublishTime);
    }

    function setUpdateFee(uint256 newUpdateFee) external {
        updateFee = newUpdateFee;
    }

    function getUpdateFee(bytes[] calldata) external view returns (uint256) {
        return updateFee;
    }

    function updatePriceFeeds(bytes[] calldata) external payable {
        require(msg.value >= updateFee, "Insufficient fee");
    }

    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (PythStructs.Price memory) {
        require(block.timestamp - price.publishTime <= age, "Stale price");
        id;
        return price;
    }
}
