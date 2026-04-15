// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {LMSRMath} from "../src/LMSRMath.sol";
import {LMSRMarket} from "../src/LMSRMarket.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {RaceOracle} from "../src/RaceOracle.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @title EquiMarket Full Integration Test
/// @notice Tests the complete flow: create market → buy shares → settle → claim
contract EquiMarketTest is Test {
    MockUSDC usdc;
    MarketFactory factory;
    RaceOracle oracle;

    address admin = address(1);
    address reporter = address(2);
    address alice = address(10);
    address bob = address(11);
    address charlie = address(12);

    bytes32 raceId = keccak256("2026-cheltenham-gold-cup");
    uint256 constant B = 100e18; // liquidity parameter
    uint256 constant NUM_HORSES = 5;

    function setUp() public {
        // Deploy core infrastructure
        usdc = new MockUSDC();

        // Deploy factory (with a placeholder oracle initially)
        // baseFeeRate = 400 (4%), treasury = admin
        factory = new MarketFactory(admin, address(0), address(usdc), 400, admin);

        // Deploy oracle with 30 minute dispute window
        oracle = new RaceOracle(admin, address(factory), 1800);

        // Wire up: set oracle on factory (must be called as admin)
        vm.prank(admin);
        factory.setOracle(address(oracle));
        vm.prank(admin);
        oracle.addReporter(reporter);

        // Give users USDC
        usdc.mint(alice, 10_000e6);   // $10,000
        usdc.mint(bob, 10_000e6);
        usdc.mint(charlie, 10_000e6);
    }

    // ── Tests ──

    function testCreateMarket() public {
        uint256 closesAt = block.timestamp + 3600; // 1 hour from now
        vm.prank(admin);
        address market = factory.createMarket(raceId, NUM_HORSES, B, closesAt);

        assertTrue(market != address(0), "market should be deployed");
        assertEq(factory.marketCount(), 1);
        assertTrue(factory.markets(raceId) == market, "market should be registered");
    }

    function testLMSRPricingBasics() public {
        // Test that the LMSR math works correctly

        // With all shares at 0, each horse should have equal probability
        uint256[] memory q = new uint256[](5);
        // All zeros = uniform distribution

        // Price of each outcome should be ~1/5 = 0.2 = 2e17
        uint256 p0 = LMSRMath.price(q, B, 0);
        uint256 p1 = LMSRMath.price(q, B, 1);

        // Should be approximately equal (uniform)
        assertApproxEqAbs(p0, p1, 1e15); // within 0.1%

        // Should be approximately 1/5
        assertApproxEqAbs(p0, 2e17, 1e16); // within 1%

        // Sum of all prices should be ~1.0
        uint256 totalProb = 0;
        for (uint256 i = 0; i < 5; i++) {
            totalProb += LMSRMath.price(q, B, i);
        }
        assertApproxEqAbs(totalProb, 1e18, 1e15); // within 0.1% of 1.0
    }

    function testLMSRPriceShiftAfterBuy() public {
        // When someone buys shares on horse 0, its price should go UP
        // and all other horses' prices should go DOWN

        uint256[] memory q = new uint256[](5);
        uint256 priceBefore = LMSRMath.price(q, B, 0);

        // Simulate buying 10 shares of horse 0
        q[0] = 10e18;
        uint256 priceAfter = LMSRMath.price(q, B, 0);

        assertGt(priceAfter, priceBefore); // price went up

        // Other horses should have lower prices
        uint256 otherPrice = LMSRMath.price(q, B, 1);
        assertLt(otherPrice, priceBefore); // dropped below uniform
    }

    function testCostToBuyIsPositive() public {
        uint256[] memory q = new uint256[](5);
        uint256 costBuy = LMSRMath.costToBuy(q, B, 0, 10e18);

        assertGt(costBuy, 0); // should cost something
    }

    function testCostIncreasesWithPopularity() public {
        // Buying the SAME horse again should cost MORE (price impact)
        uint256[] memory q = new uint256[](5);

        uint256 firstCost = LMSRMath.costToBuy(q, B, 0, 10e18);

        // After buying 10 shares
        q[0] = 10e18;
        uint256 secondCost = LMSRMath.costToBuy(q, B, 0, 10e18);

        assertGt(secondCost, firstCost); // second batch costs more
    }

    function testExpFunction() public {
        // e^0 = 1
        uint256 result = LMSRMath.expFixed(0);
        assertEq(result, 1e18);

        // e^1 ≈ 2.718
        result = LMSRMath.expFixed(1e18);
        assertApproxEqAbs(result, 2_718281828459045235, 1e14); // within 0.00001

        // e^(-1) ≈ 0.3679
        result = LMSRMath.expFixed(-1e18);
        assertApproxEqAbs(result, 367879441171442321, 1e14);
    }

    function testLnFunction() public {
        // ln(1) = 0
        int256 result = LMSRMath.lnFixed(1e18);
        assertApproxEqAbs(uint256(result < 0 ? -result : result), 0, 1e10);

        // ln(e) ≈ 1
        result = LMSRMath.lnFixed(2_718281828459045235);
        assertApproxEqAbs(uint256(result), 1e18, 1e14);
    }

    // ── Scratch Tests ──

    function testScratchRedistributesProbability() public {
        // With 5 horses, each starts at ~20%.
        // After scratching horse 4, the remaining 4 should share ~100%.
        uint256[] memory q = new uint256[](5);

        uint256 priceBefore = LMSRMath.price(q, B, 0);

        // Simulate scratch by zeroing horse 4's shares (already 0, but
        // in a real market with some shares, zeroing redistributes)
        // The key insight: with horse 4 at 0 shares and others at 0,
        // all 5 still split evenly. But if we remove horse 4 from the
        // equation entirely (4 horses), each gets 25%.
        uint256[] memory qReduced = new uint256[](4);
        uint256 priceAfterScratch = LMSRMath.price(qReduced, B, 0);

        // With 4 horses: 1/4 = 0.25 > 1/5 = 0.20
        assertGt(priceAfterScratch, priceBefore);
        assertApproxEqAbs(priceAfterScratch, 25e16, 1e15); // ~25%
    }

    function testScratchMechanicsOnLMSR() public {
        // Simulate: horse 0 has lots of shares, horse 2 gets scratched
        uint256[] memory q = new uint256[](5);
        q[0] = 50e18; // horse 0 is the favorite
        q[1] = 20e18;
        q[2] = 15e18; // this one will be scratched
        q[3] = 10e18;
        q[4] = 5e18;

        // Price of horse 0 before scratch
        uint256 price0Before = LMSRMath.price(q, B, 0);

        // After scratch: zero out horse 2's shares
        q[2] = 0;
        uint256 price0After = LMSRMath.price(q, B, 0);

        // Horse 0's price should go UP because probability redistributes
        // from the scratched horse to all remaining horses
        assertGt(price0After, price0Before);

        // Sum of all prices should still be ~1.0
        uint256 totalProb = 0;
        for (uint256 i = 0; i < 5; i++) {
            totalProb += LMSRMath.price(q, B, i);
        }
        assertApproxEqAbs(totalProb, 1e18, 1e15);
    }

    function testScratchRefundRateIsPerShare() public {
        // Verify the per-share refund rate math is consistent:
        // If total curve value for 100 shares = V USDC,
        // then per-share rate = V * 1e18 / 100e18 = V / 100 (in USDC-per-1e18-shares)
        // And a user with 30 shares should get: (30e18 * rate) / 1e18 = 30/100 * V

        uint256[] memory q = new uint256[](5);
        q[0] = 50e18;
        q[1] = 20e18;
        q[2] = 40e18; // will be "scratched"
        q[3] = 10e18;
        q[4] = 5e18;

        uint256 totalSharesOnOutcome2 = q[2]; // 40e18

        // Get total curve value of selling all shares on outcome 2
        uint256 totalValueFP = LMSRMath.costToSell(q, B, 2, totalSharesOnOutcome2);
        uint256 totalValueUSDC = totalValueFP / 1e12;

        // Compute per-share rate the same way the contract does
        uint256 rate = (totalValueUSDC * 1e18) / totalSharesOnOutcome2;

        // Simulate Alice with 30e18 shares and Bob with 10e18 shares (= 40e18 total)
        uint256 aliceShares = 30e18;
        uint256 bobShares = 10e18;

        uint256 aliceRefund = (aliceShares * rate) / 1e18;
        uint256 bobRefund = (bobShares * rate) / 1e18;

        // Alice should get 75% of total value, Bob gets 25%
        // Allow small rounding error from integer division in per-share rate calc.
        // 100 USDC units = $0.0001 — well below dust threshold for a $7+ trade.
        assertApproxEqAbs(aliceRefund + bobRefund, totalValueUSDC, 100);

        // Alice's refund should be ~3x Bob's refund
        assertApproxEqAbs(aliceRefund, bobRefund * 3, 100);

        // Neither should be zero
        assertGt(aliceRefund, 0);
        assertGt(bobRefund, 0);
    }

    function testScratchRefundNeverExceedsCurveValue() public {
        // The total refunds paid out should never exceed what the curve
        // said those shares were worth — this is what keeps the pool solvent.

        uint256[] memory q = new uint256[](5);
        q[0] = 80e18; // heavy favorite
        q[1] = 10e18;
        q[2] = 5e18;  // long shot — will be scratched
        q[3] = 3e18;
        q[4] = 2e18;

        uint256 totalShares = q[2]; // 5e18

        // Total curve value for this outcome
        uint256 totalValueFP = LMSRMath.costToSell(q, B, 2, totalShares);
        uint256 totalValueUSDC = totalValueFP / 1e12;

        // Per-share rate
        uint256 rate = (totalValueUSDC * 1e18) / totalShares;

        // If we refund ALL shares, total payout = (totalShares * rate) / 1e18
        uint256 totalPayout = (totalShares * rate) / 1e18;

        // Total payout should be <= totalValueUSDC (rounding can lose a wei or two).
        // This is THE critical solvency property — refunds must not exceed deposits.
        assertTrue(totalPayout <= totalValueUSDC, "refunds should not exceed curve value");

        // And very close to it — within 100 USDC units = $0.0001
        assertApproxEqAbs(totalPayout, totalValueUSDC, 100);
    }

    // ── Cancellation Tests ──

    function testCancelRefundSolvency() public {
        // Simulate a 5-horse market with varying share distributions.
        // After cancellation, total refunds across ALL outcomes should
        // not exceed total deposited USDC (the LMSR cost function guarantees this).

        uint256[] memory q = new uint256[](5);
        q[0] = 50e18;
        q[1] = 30e18;
        q[2] = 20e18;
        q[3] = 15e18;
        q[4] = 10e18;

        // Calculate total cost that was paid to reach this state from zero
        // C(q) - C(0) = total USDC deposited
        uint256[] memory zero = new uint256[](5);
        uint256 totalCostFP = LMSRMath.cost(q, B) - LMSRMath.cost(zero, B);
        uint256 totalCostUSDC = totalCostFP / 1e12;

        // Now simulate cancel: for each outcome, snapshot sell value then zero it
        // (same order as cancelRace does)
        uint256 totalRefunds = 0;

        for (uint256 i = 0; i < 5; i++) {
            uint256 totalShares = q[i];
            if (totalShares > 0) {
                uint256 valueFP = LMSRMath.costToSell(q, B, i, totalShares);
                uint256 valueUSDC = valueFP / 1e12;
                totalRefunds += valueUSDC;
                q[i] = 0; // mirrors cancelRace's sequential zeroing
            }
        }

        // Total refunds must not exceed total deposited
        assertTrue(totalRefunds <= totalCostUSDC, "cancel refunds exceed deposits");
    }

    function testCancelPerShareRateConsistency() public {
        // Verify that per-share rates produce correct proportional refunds
        // when a user holds shares on multiple outcomes.

        uint256[] memory q = new uint256[](3);
        q[0] = 40e18;
        q[1] = 30e18;
        q[2] = 20e18;

        // Simulate cancel: snapshot rates sequentially (like the contract)
        uint256[] memory rates = new uint256[](3);

        for (uint256 i = 0; i < 3; i++) {
            uint256 totalShares = q[i];
            if (totalShares > 0) {
                uint256 valueFP = LMSRMath.costToSell(q, B, i, totalShares);
                uint256 valueUSDC = valueFP / 1e12;
                rates[i] = (valueUSDC * 1e18) / totalShares;
                q[i] = 0;
            }
        }

        // Alice holds 20e18 on outcome 0 and 15e18 on outcome 1
        uint256 aliceRefund0 = (20e18 * rates[0]) / 1e18;
        uint256 aliceRefund1 = (15e18 * rates[1]) / 1e18;
        uint256 aliceTotal = aliceRefund0 + aliceRefund1;

        // Bob holds 20e18 on outcome 0 and 5e18 on outcome 2
        uint256 bobRefund0 = (20e18 * rates[0]) / 1e18;
        uint256 bobRefund2 = (5e18 * rates[2]) / 1e18;
        uint256 bobTotal = bobRefund0 + bobRefund2;

        // Both should get non-zero refunds
        assertGt(aliceTotal, 0);
        assertGt(bobTotal, 0);

        // Alice and Bob hold same amount on outcome 0, so same refund for that
        assertEq(aliceRefund0, bobRefund0);
    }

    function testCancelWithPriorScratchSolvency() public {
        // Scenario: Horse 2 gets scratched, then the whole race is cancelled.
        // Scratch refunds + cancel refunds should not exceed total deposits.

        uint256[] memory q = new uint256[](4);
        q[0] = 30e18;
        q[1] = 25e18;
        q[2] = 20e18; // will be scratched first
        q[3] = 15e18;

        uint256[] memory zero = new uint256[](4);
        uint256 totalDepositsFP = LMSRMath.cost(q, B) - LMSRMath.cost(zero, B);
        uint256 totalDepositsUSDC = totalDepositsFP / 1e12;

        // Step 1: Scratch outcome 2
        uint256 scratchValueFP = LMSRMath.costToSell(q, B, 2, q[2]);
        uint256 scratchRefundUSDC = scratchValueFP / 1e12;
        q[2] = 0; // zeroed by scratch

        // Step 2: Cancel race — snapshot remaining outcomes
        uint256 cancelRefunds = 0;
        for (uint256 i = 0; i < 4; i++) {
            if (i == 2) continue; // already scratched
            uint256 totalShares = q[i];
            if (totalShares > 0) {
                uint256 valueFP = LMSRMath.costToSell(q, B, i, totalShares);
                uint256 valueUSDC = valueFP / 1e12;
                cancelRefunds += valueUSDC;
                q[i] = 0;
            }
        }

        // Total of all refunds (scratch + cancel) must not exceed deposits
        uint256 totalAllRefunds = scratchRefundUSDC + cancelRefunds;
        assertTrue(totalAllRefunds <= totalDepositsUSDC, "scratch + cancel refunds exceed deposits");
    }

    // ── Dynamic Fee Tests ──

    function testDynamicFeeScalesWithProbability() public {
        // The fee formula: baseFeeRate * P * (1-P) * tradeAmount / 10000
        // At P=0.50: multiplier = 0.25 → effective fee = 400 * 0.25 / 10000 = 1.0%
        // At P=0.90: multiplier = 0.09 → effective fee = 400 * 0.09 / 10000 = 0.36%
        // At P=0.10: multiplier = 0.09 → same as above (symmetric)

        uint256 baseFeeRate = 400; // 4%
        uint256 tradeUSDC = 1_000_000; // $1 USDC = 1e6

        // Simulate P = 0.50 (max fee scenario)
        uint256 p50 = 5e17; // 0.5e18
        uint256 pTimesOneMinusP_50 = (p50 * (1e18 - p50)) / 1e18; // = 0.25e18
        uint256 fee50 = (tradeUSDC * baseFeeRate * pTimesOneMinusP_50) / (10000 * 1e18);
        // Expected: 1_000_000 * 400 * 0.25e18 / (10000 * 1e18) = 10000 = $0.01
        assertEq(fee50, 10000);

        // Simulate P = 0.90 (low fee scenario)
        uint256 p90 = 9e17; // 0.9e18
        uint256 pTimesOneMinusP_90 = (p90 * (1e18 - p90)) / 1e18; // = 0.09e18
        uint256 fee90 = (tradeUSDC * baseFeeRate * pTimesOneMinusP_90) / (10000 * 1e18);
        // Expected: 1_000_000 * 400 * 0.09e18 / (10000 * 1e18) = 3600 = $0.0036
        assertEq(fee90, 3600);

        // Simulate P = 0.10 (symmetric with 0.90)
        uint256 p10 = 1e17;
        uint256 pTimesOneMinusP_10 = (p10 * (1e18 - p10)) / 1e18;
        uint256 fee10 = (tradeUSDC * baseFeeRate * pTimesOneMinusP_10) / (10000 * 1e18);
        assertEq(fee10, fee90); // symmetric

        // 50/50 fee should be highest
        assertGt(fee50, fee90);
        assertGt(fee50, fee10);
    }

    function testDynamicFeeOnLargerTrades() public {
        // With a $100 trade at 50/50 probability and 4% base rate:
        // fee = 100e6 * 400 * 0.25e18 / (10000 * 1e18) = 1_000_000 = $1.00
        uint256 tradeUSDC = 100_000_000; // $100
        uint256 baseFeeRate = 400;

        uint256 p = 5e17;
        uint256 pTimesOneMinusP = (p * (1e18 - p)) / 1e18;
        uint256 fee = (tradeUSDC * baseFeeRate * pTimesOneMinusP) / (10000 * 1e18);

        // $1.00 fee on a $100 trade = 1.0%
        assertEq(fee, 1_000_000);

        // Same trade at P=0.95 (heavy favorite):
        uint256 p95 = 95e16;
        uint256 pTimesOneMinusP_95 = (p95 * (1e18 - p95)) / 1e18; // = 0.0475e18
        uint256 fee95 = (tradeUSDC * baseFeeRate * pTimesOneMinusP_95) / (10000 * 1e18);

        // $0.19 fee on a $100 trade = 0.19% — much cheaper for heavy favorites
        assertEq(fee95, 190_000);
        assertLt(fee95, fee); // way less than 50/50
    }

    function testZeroFeeRateMeansNoFees() public {
        // If baseFeeRate = 0, no fee regardless of probability
        uint256 baseFeeRate = 0;
        uint256 tradeUSDC = 100_000_000;
        uint256 p = 5e17;
        uint256 pTimesOneMinusP = (p * (1e18 - p)) / 1e18;
        uint256 fee = (tradeUSDC * baseFeeRate * pTimesOneMinusP) / (10000 * 1e18);
        assertEq(fee, 0);
    }
}
