// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LMSRMarket} from "./LMSRMarket.sol";
import {IERC20} from "./interfaces/IERC20.sol";

/// @title MarketFactory — Deploys one LMSRMarket per race
/// @notice This is the main entry point for creating new markets.
///         The admin (your backend service) calls createMarket() before each race,
///         specifying the number of horses, liquidity parameter, and close time.
///
/// @dev WHY A FACTORY? (for beginners):
///      Each race gets its own contract instance. This keeps markets isolated —
///      a bug in one race can't drain another race's funds. The factory
///      tracks all markets and makes it easy for the frontend to find them.

contract MarketFactory {
    // ── State ──
    address public admin;
    address public oracle;
    IERC20 public usdc;

    // ── Fee Config (protocol-wide defaults) ──
    uint256 public defaultBaseFeeRate; // basis points, e.g. 200 = 2%
    address public protocolTreasury;

    // All markets ever created
    address[] public allMarkets;

    // raceId => market address (for lookups)
    mapping(bytes32 => address) public markets;

    // ── Events ──
    event MarketCreated(
        bytes32 indexed raceId,
        address market,
        uint256 numOutcomes,
        uint256 b,
        uint256 closesAt
    );
    event AdminUpdated(address indexed newAdmin);
    event OracleUpdated(address indexed newOracle);

    // ── Errors ──
    error OnlyAdmin();
    error MarketAlreadyExists();
    error InvalidParams();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    constructor(
        address _admin,
        address _oracle,
        address _usdc,
        uint256 _defaultBaseFeeRate,
        address _protocolTreasury
    ) {
        admin = _admin;
        oracle = _oracle;
        usdc = IERC20(_usdc);
        defaultBaseFeeRate = _defaultBaseFeeRate;
        protocolTreasury = _protocolTreasury;
    }

    /// @notice Deploy a new market for a race
    /// @param raceId Unique identifier (e.g. keccak256 of "2026-cheltenham-gold-cup"))
    /// @param numOutcomes Number of horses
    /// @param b Liquidity parameter (fixed point 1e18). Higher = smoother prices.
    ///          Example: 100e18 means ~$100 subsidy risk, smooth price curves.
    ///          For big races use 500-1000e18. For small meets use 50-100e18.
    /// @param closesAt Unix timestamp when market stops accepting trades
    ///                 Set this to AFTER the expected race finish for in-race trading
    function createMarket(
        bytes32 raceId,
        uint256 numOutcomes,
        uint256 b,
        uint256 closesAt
    ) external onlyAdmin returns (address) {
        if (markets[raceId] != address(0)) revert MarketAlreadyExists();
        if (numOutcomes < 2 || numOutcomes > 30) revert InvalidParams();
        if (b == 0) revert InvalidParams();
        if (closesAt <= block.timestamp) revert InvalidParams();

        // Deploy a new market contract
        LMSRMarket market = new LMSRMarket();
        market.initialize(
            raceId, numOutcomes, b, closesAt,
            oracle, address(usdc),
            defaultBaseFeeRate, protocolTreasury
        );

        address marketAddr = address(market);
        markets[raceId] = marketAddr;
        allMarkets.push(marketAddr);

        emit MarketCreated(raceId, marketAddr, numOutcomes, b, closesAt);

        return marketAddr;
    }

    /// @notice Get total number of markets created
    function marketCount() external view returns (uint256) {
        return allMarkets.length;
    }

    /// @notice Get a page of markets (for frontend pagination)
    function getMarkets(uint256 offset, uint256 limit) external view returns (address[] memory) {
        uint256 len = allMarkets.length;
        if (offset >= len) return new address[](0);

        uint256 end = offset + limit;
        if (end > len) end = len;

        address[] memory result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = allMarkets[i];
        }
        return result;
    }

    // ── Admin Functions ──

    function setAdmin(address _admin) external onlyAdmin {
        admin = _admin;
        emit AdminUpdated(_admin);
    }

    function setOracle(address _oracle) external onlyAdmin {
        oracle = _oracle;
        emit OracleUpdated(_oracle);
    }

    function setDefaultBaseFeeRate(uint256 _rate) external onlyAdmin {
        defaultBaseFeeRate = _rate;
    }

    function setProtocolTreasury(address _treasury) external onlyAdmin {
        protocolTreasury = _treasury;
    }
}
