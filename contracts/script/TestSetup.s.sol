// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @title TestSetup — Mint USDC and create a test race market
/// @notice Run after deploying. Mints 10,000 test USDC to your wallet
///         and creates a 5-horse race market that closes in 1 hour.
contract TestSetup is Script {
    function run() external {
        address deployer = msg.sender;

        // Deployed contract addresses (Monad testnet)
        MockUSDC usdc = MockUSDC(0xee2Ea709518126cB7591290AF7f386cE5576D4cc);
        MarketFactory factory = MarketFactory(0xea4503F917A521608E5045B6D1F5f78be331C50C);

        vm.startBroadcast();

        // 1. Mint 10,000 USDC to your wallet
        usdc.mint(deployer, 10_000e6); // 10,000 USDC (6 decimals)
        console.log("Minted 10,000 USDC to:", deployer);

        // 2. Create a test race: "Test Derby" with 5 horses, closes in 1 hour
        bytes32 raceId = keccak256("test-derby-001");
        uint256 numHorses = 5;
        uint256 b = 100e18;  // liquidity parameter
        uint256 closesAt = block.timestamp + 3600; // 1 hour from now

        address market = factory.createMarket(raceId, numHorses, b, closesAt);
        console.log("Created market at:", market);
        console.log("Race ID:          ", vm.toString(raceId));
        console.log("Horses:            5");
        console.log("Closes at:        ", closesAt);
        console.log("Liquidity (b):     100");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Ready for E2E Testing ===");
        console.log("1. Open http://localhost:3000");
        console.log("2. Connect wallet");
        console.log("3. You should see the new market");
        console.log("4. Try buying shares on a horse!");
    }
}
