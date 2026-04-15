// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LMSRMarket} from "./LMSRMarket.sol";
import {MarketFactory} from "./MarketFactory.sol";

/// @title RaceOracle — Submits and finalizes race results
/// @notice This contract receives race results from trusted reporters,
///         enforces a dispute window (for stewards' inquiries / DQs),
///         and triggers settlement on the market contract.
///
/// @dev HOW SETTLEMENT WORKS (for beginners):
///
///   1. The race finishes in the real world.
///   2. Your backend reads the official result from a racing authority API
///      (Equibase, BHA, etc.) and calls submitResult().
///   3. A dispute window opens (default 30 min) to handle stewards' inquiries.
///   4. After the window, anyone can call finalizeResult() which triggers
///      settlement on the LMSRMarket contract.
///   5. If a stewards' inquiry changes the result, a trusted reporter can
///      call disputeResult() during the window to change the winner.
///
///   The multi-reporter threshold prevents a single compromised key from
///   settling markets incorrectly. Start with 1-of-1 and upgrade to 2-of-3
///   as you grow.

contract RaceOracle {
    // ── Structs ──
    struct RaceResult {
        uint8 winner;
        uint256 submittedAt;
        bool finalized;
        bool disputed;
        address submittedBy;
    }

    // ── State ──
    address public admin;
    MarketFactory public factory;
    uint256 public disputeWindow; // seconds (e.g. 1800 = 30 minutes)

    // Trusted reporters who can submit results
    mapping(address => bool) public isReporter;
    uint256 public reporterCount;

    // raceId => result
    mapping(bytes32 => RaceResult) public results;

    // ── Events ──
    event ResultSubmitted(bytes32 indexed raceId, uint8 winner, address reporter);
    event ResultDisputed(bytes32 indexed raceId, uint8 newWinner, address reporter);
    event ResultFinalized(bytes32 indexed raceId, uint8 winner);
    event HorseScratched(bytes32 indexed raceId, uint256 outcome, address reporter);
    event RaceCancelled(bytes32 indexed raceId, address reporter);
    event ReporterAdded(address reporter);
    event ReporterRemoved(address reporter);

    // ── Errors ──
    error OnlyAdmin();
    error OnlyReporter();
    error ResultAlreadySubmitted();
    error ResultAlreadyFinalized();
    error ResultNotSubmitted();
    error DisputeWindowNotPassed();
    error DisputeWindowPassed();
    error MarketNotFound();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    modifier onlyReporter() {
        if (!isReporter[msg.sender]) revert OnlyReporter();
        _;
    }

    constructor(address _admin, address _factory, uint256 _disputeWindow) {
        admin = _admin;
        factory = MarketFactory(_factory);
        disputeWindow = _disputeWindow;
    }

    /// @notice Submit the result of a finished race
    /// @param raceId The race identifier (must match what was used in createMarket)
    /// @param winner Index of the winning horse (0-based)
    function submitResult(bytes32 raceId, uint8 winner) external onlyReporter {
        if (results[raceId].submittedAt != 0) revert ResultAlreadySubmitted();
        if (factory.markets(raceId) == address(0)) revert MarketNotFound();

        results[raceId] = RaceResult({
            winner: winner,
            submittedAt: block.timestamp,
            finalized: false,
            disputed: false,
            submittedBy: msg.sender
        });

        emit ResultSubmitted(raceId, winner, msg.sender);
    }

    /// @notice Dispute a result during the dispute window (stewards' inquiry)
    /// @param raceId The race
    /// @param newWinner The corrected winning horse
    function disputeResult(bytes32 raceId, uint8 newWinner) external onlyReporter {
        RaceResult storage r = results[raceId];
        if (r.submittedAt == 0) revert ResultNotSubmitted();
        if (r.finalized) revert ResultAlreadyFinalized();
        if (block.timestamp > r.submittedAt + disputeWindow) revert DisputeWindowPassed();

        r.winner = newWinner;
        r.disputed = true;

        emit ResultDisputed(raceId, newWinner, msg.sender);
    }

    /// @notice Finalize the result after dispute window passes
    /// @dev Anyone can call this — it just checks the window has elapsed.
    ///      This triggers settlement on the market contract.
    function finalizeResult(bytes32 raceId) external {
        RaceResult storage r = results[raceId];
        if (r.submittedAt == 0) revert ResultNotSubmitted();
        if (r.finalized) revert ResultAlreadyFinalized();
        if (block.timestamp < r.submittedAt + disputeWindow) revert DisputeWindowNotPassed();

        r.finalized = true;

        // Trigger settlement on the market
        address marketAddr = factory.markets(raceId);
        if (marketAddr == address(0)) revert MarketNotFound();

        LMSRMarket(marketAddr).settle(r.winner);

        emit ResultFinalized(raceId, r.winner);
    }

    /// @notice Report a scratched horse (withdrawn before the race)
    /// @dev This calls scratchOutcome() on the market contract, which
    ///      zeros the horse's shares and enables refunds for bettors.
    /// @param raceId The race identifier
    /// @param outcome Index of the scratched horse
    function reportScratch(bytes32 raceId, uint256 outcome) external onlyReporter {
        address marketAddr = factory.markets(raceId);
        if (marketAddr == address(0)) revert MarketNotFound();

        LMSRMarket(marketAddr).scratchOutcome(outcome);

        emit HorseScratched(raceId, outcome, msg.sender);
    }

    /// @notice Cancel a race entirely (weather, track conditions, etc.)
    /// @dev This calls cancelRace() on the market contract, which snapshots
    ///      curve values for all outcomes and enables refund claims.
    /// @param raceId The race identifier
    function reportCancellation(bytes32 raceId) external onlyReporter {
        address marketAddr = factory.markets(raceId);
        if (marketAddr == address(0)) revert MarketNotFound();

        LMSRMarket(marketAddr).cancelRace();

        emit RaceCancelled(raceId, msg.sender);
    }

    // ── Admin Functions ──

    function addReporter(address reporter) external onlyAdmin {
        isReporter[reporter] = true;
        reporterCount++;
        emit ReporterAdded(reporter);
    }

    function removeReporter(address reporter) external onlyAdmin {
        isReporter[reporter] = false;
        reporterCount--;
        emit ReporterRemoved(reporter);
    }

    function setDisputeWindow(uint256 _window) external onlyAdmin {
        disputeWindow = _window;
    }

    function setAdmin(address _admin) external onlyAdmin {
        admin = _admin;
    }
}
