// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {RaceOracle} from "../src/RaceOracle.sol";

/// @title FinalizeRace - Finalize result after dispute window (step 2 of 2)
contract FinalizeRace is Script {
    function run() external {
        RaceOracle oracle = RaceOracle(0xE11Aed210D434083ff09a90544d44A29Dd623780);
        bytes32 raceId = keccak256("test-derby-002");

        vm.startBroadcast();
        oracle.finalizeResult(raceId);
        vm.stopBroadcast();

        console.log("Race finalized! Market is settled.");
        console.log("Refresh the frontend and claim your winnings.");
    }
}
