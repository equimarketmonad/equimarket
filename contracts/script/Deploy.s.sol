// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {RaceOracle} from "../src/RaceOracle.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @title Deploy — EquiMarket deployment to Monad testnet
/// @notice Deploys MockUSDC, MarketFactory, RaceOracle, then wires them together.
///
/// Usage:
///   source .env
///   forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast --private-key $PRIVATE_KEY
///
contract DeployEquiMarket is Script {
    function run() external {
        // The deployer's address (derived from the private key)
        address deployer = msg.sender;

        // Configuration
        uint256 baseFeeRate = 400;       // 4% base fee rate
        uint256 disputeWindow = 1800;    // 30 minutes

        vm.startBroadcast();

        // 1. Deploy MockUSDC (testnet only — mainnet uses real USDC)
        MockUSDC usdc = new MockUSDC();

        // 2. Deploy MarketFactory
        //    admin = deployer, oracle = address(0) temporarily, treasury = deployer
        MarketFactory factory = new MarketFactory(
            deployer,           // admin
            address(0),         // oracle (set below)
            address(usdc),      // USDC token
            baseFeeRate,        // 4% base fee
            deployer            // treasury (collects fees)
        );

        // 3. Deploy RaceOracle
        RaceOracle oracle = new RaceOracle(
            deployer,           // admin
            address(factory),   // factory address
            disputeWindow       // 30 min dispute window
        );

        // 4. Wire them together
        factory.setOracle(address(oracle));
        oracle.addReporter(deployer); // deployer can also submit results

        vm.stopBroadcast();

        // Log the deployed addresses
        console.log("=== EquiMarket Deployed ===");
        console.log("MockUSDC:       ", address(usdc));
        console.log("MarketFactory:  ", address(factory));
        console.log("RaceOracle:     ", address(oracle));
        console.log("");
        console.log("Admin/Treasury: ", deployer);
        console.log("Reporter:       ", deployer);
        console.log("");
        console.log("Save these addresses! You need them for frontend config (Task 5).");
    }
}
