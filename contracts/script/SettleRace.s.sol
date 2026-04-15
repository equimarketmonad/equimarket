// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {RaceOracle} from "../src/RaceOracle.sol";

/// @title SettleRace - Submit race result (step 1 of 2)
contract SettleRace is Script {
    function run() external {
        RaceOracle oracle = RaceOracle(0x22FA7376E70f94AedBCf0C79d578B49a61533853);
        bytes32 raceId = keccak256("test-derby-001");

        vm.startBroadcast();
        oracle.submitResult(raceId, 0); // Horse #1 wins (outcome index 0)
        vm.stopBroadcast();

        console.log("Result submitted: Horse #1 wins!");
        console.log("Wait 30 minutes, then run FinalizeRace.s.sol");
    }
}
