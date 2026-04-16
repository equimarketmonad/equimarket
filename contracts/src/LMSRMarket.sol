// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LMSRMath} from "./LMSRMath.sol";
import {IERC20} from "./interfaces/IERC20.sol";

/// @title LMSRMarket — A single prediction market for one horse race
/// @notice Deployed per race by the MarketFactory. Handles buying/selling
///         positions, and settlement after the oracle confirms a winner.
///
/// @dev HOW THIS WORKS (for Solidity beginners):
///
///   1. CREATION: Factory deploys this with a race ID, number of horses,
///      and a liquidity parameter `b`. The protocol seeds initial subsidy.
///
///   2. TRADING: Users call buyShares(horse, amount) which costs them USDC.
///      The cost is determined by the LMSR formula — buying shares of a
///      popular horse costs more (higher implied probability).
///      Users can also sellShares() to exit positions at current prices.
///
///   3. SETTLEMENT: After the race, the oracle calls settle(winningHorse).
///      This locks the market — no more trading.
///
///   4. CLAIMING: Winners call claim() to receive their payout.
///      Each winning share pays out 1 USDC (1e6, since USDC has 6 decimals).
///      Losers get nothing — their stakes fund the winners.

contract LMSRMarket {
    using LMSRMath for uint256[];

    // ── Constants ──
    uint256 constant FIXED_ONE = 1e18;
    uint256 constant USDC_DECIMALS = 1e6;

    // ── State ──
    address public factory;
    address public oracle;
    IERC20 public usdc;

    bytes32 public raceId;
    uint256 public numOutcomes;   // number of horses
    uint256 public b;             // liquidity parameter (fixed point 1e18)
    uint256 public createdAt;
    uint256 public closesAt;      // timestamp when market stops accepting trades

    bool public settled;
    uint8 public winningOutcome;

    // Shares outstanding per outcome (in fixed point 1e18)
    uint256[] public qShares;

    // User positions: user => outcome => shares (fixed point 1e18)
    mapping(address => mapping(uint256 => uint256)) public userShares;

    // Track total USDC held by the market
    uint256 public totalDeposited;

    // Has user claimed their winnings?
    mapping(address => bool) public claimed;

    // ── Protocol Fee State ──
    // Dynamic fee: fee = baseFeeRate * P * (1 - P) * tradeAmount
    // Where P is the LMSR implied probability of the outcome.
    // At P=0.50, fee multiplier = 0.25 (max). At P=0.95, multiplier = 0.0475.
    // baseFeeRate is in basis points (10000 = 100%). E.g. 400 = 4%.
    // Effective max fee at 50/50 = baseFeeRate * 0.25, e.g. 400bp * 0.25 = 1.0%
    uint256 public baseFeeRate;     // in basis points (set by factory)
    address public protocolTreasury;
    uint256 public accumulatedFees;  // USDC fees held in contract, withdrawable

    // ── Cancellation State ──
    bool public cancelled;
    // outcome => per-share refund rate in USDC at time of cancellation
    mapping(uint256 => uint256) public cancelRefundRatePerShare;
    mapping(address => bool) public cancelRefundClaimed;

    // ── Scratch State ──
    // Which outcomes have been scratched (horse withdrawn before race)
    mapping(uint256 => bool) public scratched;
    uint256 public scratchCount;

    // Snapshot of the LMSR sell-value per share at the moment of scratch.
    // This is the fair refund rate — what the shares were worth on the curve
    // right before the horse was removed. Stored in USDC (1e6).
    // outcome => refund rate per 1e18 shares, in USDC
    mapping(uint256 => uint256) public scratchRefundRatePerShare;

    // Has user claimed their scratch refund for a given outcome?
    mapping(address => mapping(uint256 => bool)) public scratchRefundClaimed;

    // ── Events ──
    event SharesBought(
        address indexed user,
        uint256 indexed outcome,
        uint256 shares,
        uint256 cost
    );
    event SharesSold(
        address indexed user,
        uint256 indexed outcome,
        uint256 shares,
        uint256 proceeds
    );
    event MarketSettled(uint8 winningOutcome);
    event WinningsClaimed(address indexed user, uint256 payout);
    event OutcomeScratched(uint256 indexed outcome);
    event ScratchRefundClaimed(address indexed user, uint256 indexed outcome, uint256 refund);
    event MarketCancelled();
    event CancelRefundClaimed(address indexed user, uint256 totalRefund);
    event FeesCollected(address indexed treasury, uint256 amount);

    // ── Errors ──
    error MarketClosed();
    error MarketNotSettled();
    error MarketAlreadySettled();
    error InvalidOutcome();
    error OutcomeIsScratched();
    error AlreadyScratched();
    error InsufficientShares();
    error AlreadyClaimed();
    error OnlyOracle();
    error OnlyFactory();
    error ZeroAmount();
    error TransferFailed();
    error NoRefundAvailable();
    error MarketAlreadyCancelled();
    error MarketNotCancelled();

    // ── Modifiers ──
    modifier onlyOracle() {
        if (msg.sender != oracle) revert OnlyOracle();
        _;
    }

    modifier marketOpen() {
        if (settled) revert MarketClosed();
        if (cancelled) revert MarketAlreadyCancelled();
        if (block.timestamp > closesAt) revert MarketClosed();
        _;
    }

    /// @notice Initialize the market (called by factory)
    /// @param _raceId Unique identifier for this race
    /// @param _numOutcomes Number of horses in the race
    /// @param _b Liquidity parameter (e.g. 100e18 = smooth prices)
    /// @param _closesAt When trading stops (unix timestamp)
    /// @param _oracle Address of the RaceOracle contract
    /// @param _usdc Address of the USDC token
    /// @param _baseFeeRate Dynamic fee base rate in basis points (e.g. 400 = 4%)
    /// @param _treasury Address that receives protocol fees
    function initialize(
        bytes32 _raceId,
        uint256 _numOutcomes,
        uint256 _b,
        uint256 _closesAt,
        address _oracle,
        address _usdc,
        uint256 _baseFeeRate,
        address _treasury,
        uint256 _initialSubsidy
    ) external {
        if (factory != address(0)) revert OnlyFactory(); // can only init once
        factory = msg.sender;
        raceId = _raceId;
        numOutcomes = _numOutcomes;
        b = _b;
        closesAt = _closesAt;
        oracle = _oracle;
        usdc = IERC20(_usdc);
        baseFeeRate = _baseFeeRate;
        protocolTreasury = _treasury;
        createdAt = block.timestamp;

        // Initialize shares array — all zeros (uniform probability at start)
        qShares = new uint256[](_numOutcomes);

        // Record the initial LMSR subsidy (b * ln(n) in USDC).
        // This amount is transferred by the factory and guarantees solvency:
        // the market can always pay $1 per winning share.
        totalDeposited = _initialSubsidy;
    }

    /// @notice Calculate the dynamic protocol fee for a trade
    /// @dev fee = baseFeeRate * P * (1 - P) * tradeAmountUSDC / 10000
    ///      P is the LMSR implied probability in fixed point [0, 1e18].
    ///      The P*(1-P) term peaks at 0.25 when P=0.50, and drops to near
    ///      zero at the extremes. This means:
    ///        - 50/50 markets: highest fees (max uncertainty, most activity)
    ///        - 95/5 markets: tiny fees (low uncertainty, less churn)
    ///      Just like Polymarket and Kalshi do it.
    ///
    /// @param outcome The horse being traded
    /// @param tradeUSDC The USDC amount of the trade (before fee)
    /// @return feeUSDC The fee in USDC (6 decimals)
    function _calculateFee(uint256 outcome, uint256 tradeUSDC) internal view returns (uint256) {
        if (baseFeeRate == 0) return 0;

        // Get current probability for this outcome (fixed point 1e18)
        uint256 p = LMSRMath.price(qShares, b, outcome);

        // P * (1 - P) in fixed point. Max = 0.25e18 at P = 0.5e18
        uint256 pTimesOneMinusP = (p * (FIXED_ONE - p)) / FIXED_ONE;

        // fee = tradeUSDC * baseFeeRate * pTimesOneMinusP / (10000 * 1e18)
        // Reorder to avoid overflow: (tradeUSDC * baseFeeRate * pTimesOneMinusP) / (10000 * 1e18)
        // Since tradeUSDC is ~1e6 scale, baseFeeRate ~200, pTimesOneMinusP ~0.25e18,
        // product is ~1e6 * 200 * 0.25e18 = 5e25, well under uint256 max.
        uint256 feeUSDC = (tradeUSDC * baseFeeRate * pTimesOneMinusP) / (10000 * FIXED_ONE);

        return feeUSDC;
    }

    /// @notice Buy shares on a horse
    /// @param outcome Index of the horse (0-based)
    /// @param sharesToBuy Number of shares to buy (in fixed point 1e18)
    /// @dev The cost increases as more people bet on the same horse.
    ///      Cost is calculated by the LMSR: C(q_after) - C(q_before)
    ///      A dynamic fee is added on top, scaling with probability.
    function buyShares(uint256 outcome, uint256 sharesToBuy) external marketOpen {
        if (outcome >= numOutcomes) revert InvalidOutcome();
        if (scratched[outcome]) revert OutcomeIsScratched();
        if (sharesToBuy == 0) revert ZeroAmount();

        // Calculate cost in fixed point (1e18), then convert to USDC (1e6)
        uint256 costFP = LMSRMath.costToBuy(qShares, b, outcome, sharesToBuy);

        // Convert from 18 decimal fixed point to 6 decimal USDC
        // Add 1 to round up (protocol always charges slightly more, never less)
        uint256 costUSDC = (costFP / 1e12) + 1;

        // Calculate dynamic fee (based on pre-trade probability)
        uint256 feeUSDC = _calculateFee(outcome, costUSDC);

        // Total charge = cost to LMSR pool + fee to protocol
        uint256 totalChargeUSDC = costUSDC + feeUSDC;

        // Transfer total from user to this contract
        bool success = usdc.transferFrom(msg.sender, address(this), totalChargeUSDC);
        if (!success) revert TransferFailed();

        // Update state
        qShares[outcome] += sharesToBuy;
        userShares[msg.sender][outcome] += sharesToBuy;
        totalDeposited += costUSDC; // only the LMSR cost, not the fee
        accumulatedFees += feeUSDC;

        emit SharesBought(msg.sender, outcome, sharesToBuy, totalChargeUSDC);
    }

    /// @notice Sell shares back to the market
    /// @param outcome Index of the horse
    /// @param sharesToSell Number of shares to sell (fixed point 1e18)
    /// @dev You get back LESS than you paid if the horse became less popular.
    ///      You get back MORE if it became more popular. A dynamic fee is
    ///      deducted from the proceeds before payout.
    function sellShares(uint256 outcome, uint256 sharesToSell) external marketOpen {
        if (outcome >= numOutcomes) revert InvalidOutcome();
        if (scratched[outcome]) revert OutcomeIsScratched(); // use claimScratchRefund instead
        if (sharesToSell == 0) revert ZeroAmount();
        if (userShares[msg.sender][outcome] < sharesToSell) revert InsufficientShares();

        // Calculate proceeds
        uint256 proceedsFP = LMSRMath.costToSell(qShares, b, outcome, sharesToSell);

        // Convert to USDC (round down — user gets slightly less)
        uint256 proceedsUSDC = proceedsFP / 1e12;

        // Calculate dynamic fee (deducted from proceeds)
        uint256 feeUSDC = _calculateFee(outcome, proceedsUSDC);

        // Net payout = proceeds minus fee
        uint256 payoutUSDC = proceedsUSDC - feeUSDC;

        // Update state BEFORE transfer (reentrancy protection)
        qShares[outcome] -= sharesToSell;
        userShares[msg.sender][outcome] -= sharesToSell;
        totalDeposited -= proceedsUSDC; // full amount leaves the LMSR pool
        accumulatedFees += feeUSDC;

        // Transfer net payout to user
        bool success = usdc.transfer(msg.sender, payoutUSDC);
        if (!success) revert TransferFailed();

        emit SharesSold(msg.sender, outcome, sharesToSell, payoutUSDC);
    }

    /// @notice Withdraw accumulated protocol fees to treasury
    /// @dev Anyone can call this — fees always go to the treasury address
    function withdrawFees() external {
        uint256 fees = accumulatedFees;
        if (fees == 0) revert ZeroAmount();

        accumulatedFees = 0;

        bool success = usdc.transfer(protocolTreasury, fees);
        if (!success) revert TransferFailed();

        emit FeesCollected(protocolTreasury, fees);
    }

    /// @notice Oracle settles the market after the race finishes
    /// @param _winner Index of the winning horse
    function settle(uint8 _winner) external onlyOracle {
        if (settled) revert MarketAlreadySettled();
        if (_winner >= numOutcomes) revert InvalidOutcome();

        settled = true;
        winningOutcome = _winner;

        emit MarketSettled(_winner);
    }

    /// @notice Winners claim their payout
    /// @dev Each winning share is worth 1 USDC (1e6).
    ///      Example: You hold 10e18 shares of the winner → you get 10 USDC.
    function claim() external {
        if (!settled) revert MarketNotSettled();
        if (claimed[msg.sender]) revert AlreadyClaimed();

        uint256 winningShares = userShares[msg.sender][winningOutcome];
        if (winningShares == 0) revert ZeroAmount();

        claimed[msg.sender] = true;

        // Convert shares (1e18) to USDC payout (1e6)
        // 1 share = 1 USDC
        uint256 payout = (winningShares * USDC_DECIMALS) / FIXED_ONE;

        bool success = usdc.transfer(msg.sender, payout);
        if (!success) revert TransferFailed();

        emit WinningsClaimed(msg.sender, payout);
    }

    // ── Scratch Handling ──

    /// @notice Scratch a horse (withdrawn before the race)
    /// @dev Called by the oracle when a horse is officially scratched.
    ///
    ///      ECONOMICS: We snapshot the LMSR curve-value of the scratched horse's
    ///      shares BEFORE zeroing them out, then store a per-share refund rate.
    ///      Users who held shares on this horse can claim a proportional refund
    ///      equal to what their shares were worth on the curve at scratch time.
    ///
    ///      Why curve value and not original cost? Because a user who bought at
    ///      15% and the horse dropped to 5% would drain funds backing other
    ///      positions if refunded at original cost. The curve value IS the fair
    ///      market price — it's what they'd get if they sold right before the
    ///      scratch happened.
    ///
    /// @param outcome Index of the scratched horse
    function scratchOutcome(uint256 outcome) external onlyOracle {
        if (outcome >= numOutcomes) revert InvalidOutcome();
        if (scratched[outcome]) revert AlreadyScratched();
        if (settled) revert MarketAlreadySettled();

        // Snapshot the sell value BEFORE removing shares.
        // costToSell gives us the LMSR proceeds for selling ALL shares of this outcome.
        // We divide by total shares to get per-share refund rate.
        uint256 totalSharesOnOutcome = qShares[outcome];

        if (totalSharesOnOutcome > 0) {
            // Get total USDC value of all shares on this outcome at current curve price
            uint256 totalValueFP = LMSRMath.costToSell(qShares, b, outcome, totalSharesOnOutcome);
            // Convert to USDC (6 decimals)
            uint256 totalValueUSDC = totalValueFP / 1e12;
            // Store per-share rate: USDC per 1e18 shares (scaled by FIXED_ONE for precision)
            // claimScratchRefund computes: (userShares * rate) / FIXED_ONE
            // So rate = totalValueUSDC * FIXED_ONE / totalSharesOnOutcome
            scratchRefundRatePerShare[outcome] = (totalValueUSDC * FIXED_ONE) / totalSharesOnOutcome;
        }

        scratched[outcome] = true;
        scratchCount++;

        // Zero out this horse's shares in the LMSR
        // This redistributes implied probability to remaining horses automatically
        qShares[outcome] = 0;

        emit OutcomeScratched(outcome);
    }

    /// @notice Claim refund for a scratched horse at fair curve value
    /// @dev Users get back what their shares were worth on the LMSR curve
    ///      at the moment of the scratch. This is economically equivalent to
    ///      having sold their shares right before the scratch happened.
    ///
    ///      Example: Alice has 10e18 shares, total was 50e18 shares,
    ///      total curve value at scratch was $40 USDC.
    ///      Alice gets: (10/50) * $40 = $8 USDC.
    ///
    /// @param outcome Index of the scratched horse
    function claimScratchRefund(uint256 outcome) external {
        if (!scratched[outcome]) revert InvalidOutcome();
        if (scratchRefundClaimed[msg.sender][outcome]) revert AlreadyClaimed();

        uint256 shares = userShares[msg.sender][outcome];
        if (shares == 0) revert NoRefundAvailable();

        // scratchRefundRatePerShare stores USDC per 1e18 shares (scaled by FIXED_ONE).
        // It was computed at scratch time as: (totalCurveValueUSDC * 1e18) / totalShares
        // So: refund = (userShares * rate) / 1e18 gives correct proportional USDC refund.

        uint256 refundUSDC = (shares * scratchRefundRatePerShare[outcome]) / FIXED_ONE;
        if (refundUSDC == 0) revert NoRefundAvailable();

        // Mark as claimed and clear user state
        scratchRefundClaimed[msg.sender][outcome] = true;
        userShares[msg.sender][outcome] = 0;

        // Transfer refund
        bool success = usdc.transfer(msg.sender, refundUSDC);
        if (!success) revert TransferFailed();

        emit ScratchRefundClaimed(msg.sender, outcome, refundUSDC);
    }

    /// @notice Check how much a user would get from a scratch refund
    function getScratchRefund(address user, uint256 outcome) external view returns (uint256) {
        if (!scratched[outcome]) return 0;
        if (scratchRefundClaimed[user][outcome]) return 0;
        uint256 shares = userShares[user][outcome];
        if (shares == 0) return 0;
        return (shares * scratchRefundRatePerShare[outcome]) / FIXED_ONE;
    }

    // ── Race Cancellation ──

    /// @notice Cancel the entire race — all positions unwind at curve value
    /// @dev Called by the oracle when a race is officially cancelled (weather,
    ///      track conditions, stewards' decision, etc.).
    ///
    ///      ECONOMICS: Same principle as scratch refunds. For each outcome that
    ///      has shares, we snapshot the LMSR curve sell-value per share. Users
    ///      then claim refunds across all their positions. The curve value
    ///      ensures the pool stays solvent — total refunds never exceed what
    ///      was deposited.
    ///
    ///      Note: outcomes already scratched before cancellation keep their
    ///      existing scratch refund rates. We only snapshot non-scratched outcomes.
    function cancelRace() external onlyOracle {
        if (settled) revert MarketAlreadySettled();
        if (cancelled) revert MarketAlreadyCancelled();

        // Snapshot per-share refund rates for every non-scratched outcome
        for (uint256 i = 0; i < numOutcomes; i++) {
            if (scratched[i]) continue; // already has its own refund rate

            uint256 totalShares = qShares[i];
            if (totalShares > 0) {
                uint256 totalValueFP = LMSRMath.costToSell(qShares, b, i, totalShares);
                uint256 totalValueUSDC = totalValueFP / 1e12;
                cancelRefundRatePerShare[i] = (totalValueUSDC * FIXED_ONE) / totalShares;
            }

            // Zero out shares so each costToSell call for subsequent outcomes
            // sees the updated state (shares already removed from curve).
            // This is important: removing outcome i's shares changes the curve
            // for outcomes i+1, i+2, etc. We process sequentially.
            qShares[i] = 0;
        }

        cancelled = true;
        emit MarketCancelled();
    }

    /// @notice Claim refund for all positions after race cancellation
    /// @dev Users get back the curve value of their shares across all outcomes.
    ///      For previously-scratched outcomes, they should use claimScratchRefund()
    ///      separately (if they haven't already).
    function claimCancelRefund() external {
        if (!cancelled) revert MarketNotCancelled();
        if (cancelRefundClaimed[msg.sender]) revert AlreadyClaimed();

        uint256 totalRefund = 0;

        for (uint256 i = 0; i < numOutcomes; i++) {
            if (scratched[i]) continue; // handled by claimScratchRefund()

            uint256 shares = userShares[msg.sender][i];
            if (shares == 0) continue;

            uint256 refund = (shares * cancelRefundRatePerShare[i]) / FIXED_ONE;
            totalRefund += refund;

            // Clear position
            userShares[msg.sender][i] = 0;
        }

        if (totalRefund == 0) revert NoRefundAvailable();

        cancelRefundClaimed[msg.sender] = true;

        bool success = usdc.transfer(msg.sender, totalRefund);
        if (!success) revert TransferFailed();

        emit CancelRefundClaimed(msg.sender, totalRefund);
    }

    /// @notice Check how much a user would get from a cancel refund
    function getCancelRefund(address user) external view returns (uint256) {
        if (!cancelled) return 0;
        if (cancelRefundClaimed[user]) return 0;

        uint256 total = 0;
        for (uint256 i = 0; i < numOutcomes; i++) {
            if (scratched[i]) continue;
            uint256 shares = userShares[user][i];
            if (shares == 0) continue;
            total += (shares * cancelRefundRatePerShare[i]) / FIXED_ONE;
        }
        return total;
    }

    // ── View Functions ──

    /// @notice Get implied probability (price) of a horse winning
    /// @return price in fixed point [0, 1e18] where 1e18 = 100%
    function getPrice(uint256 outcome) external view returns (uint256) {
        return LMSRMath.price(qShares, b, outcome);
    }

    /// @notice Get decimal odds for a horse (e.g. 2.5x)
    /// @return odds in fixed point (2.5x = 2.5e18)
    function getOdds(uint256 outcome) external view returns (uint256) {
        uint256 p = LMSRMath.price(qShares, b, outcome);
        if (p == 0) return type(uint256).max; // infinite odds
        return (FIXED_ONE * FIXED_ONE) / p;
    }

    /// @notice Get all prices at once (for the UI)
    function getAllPrices() external view returns (uint256[] memory prices) {
        prices = new uint256[](numOutcomes);
        for (uint256 i = 0; i < numOutcomes; i++) {
            prices[i] = LMSRMath.price(qShares, b, i);
        }
    }

    /// @notice Get all shares outstanding
    function getAllShares() external view returns (uint256[] memory) {
        return qShares;
    }

    /// @notice Preview cost to buy shares (for UI quote)
    function quoteBuy(uint256 outcome, uint256 shares) external view returns (uint256) {
        uint256 costFP = LMSRMath.costToBuy(qShares, b, outcome, shares);
        return (costFP / 1e12) + 1; // USDC amount, rounded up
    }

    /// @notice Preview proceeds from selling shares (for UI quote)
    function quoteSell(uint256 outcome, uint256 shares) external view returns (uint256) {
        uint256 proceedsFP = LMSRMath.costToSell(qShares, b, outcome, shares);
        return proceedsFP / 1e12; // USDC amount, rounded down
    }
}
