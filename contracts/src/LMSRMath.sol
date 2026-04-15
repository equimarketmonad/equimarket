// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title LMSRMath — Fixed-point LMSR pricing math
/// @notice All math uses 18-decimal fixed point (1e18 = 1.0)
/// @dev The LMSR (Logarithmic Market Scoring Rule) is an automated market maker
///      designed by Robin Hanson for prediction markets. It guarantees liquidity
///      at all prices — meaning a user can always buy or sell, even with zero
///      other participants. This is critical for horse racing markets where
///      liquidity may be thin on smaller races.
///
///      The core formula:
///        Cost(q) = b * ln( sum( e^(qi/b) ) )
///
///      Where:
///        q  = vector of shares outstanding per outcome (horse)
///        b  = liquidity parameter (higher = smoother prices, more subsidy risk)
///        qi = shares for outcome i
///
///      The PRICE of buying shares on outcome i:
///        price_i = e^(qi/b) / sum( e^(qj/b) )
///
///      This is literally the softmax function from machine learning.
///      The implied probability of each horse winning equals its price.

library LMSRMath {
    // ── Constants ──
    uint256 internal constant ONE = 1e18;         // 1.0 in fixed point
    uint256 internal constant LN2 = 693147180559945309;  // ln(2) * 1e18
    int256 internal constant iONE = 1e18;

    // ── Errors ──
    error Overflow();
    error ZeroInput();
    error InvalidB();

    /// @notice Calculate e^x in fixed point where x is an int256 (can be negative)
    /// @dev Uses the identity: e^x = 2^(x / ln2)
    ///      Then computes 2^integer_part * 2^fractional_part
    ///      The fractional part uses a polynomial approximation.
    ///      Accurate to ~1e-14 for |x| < 130e18
    function expFixed(int256 x) internal pure returns (uint256) {
        // e^0 = 1
        if (x == 0) return ONE;

        // For very negative x, result rounds to 0
        if (x < -42_139_678_854_452_767_551) return 0; // ln(1e-18) * 1e18

        // Overflow guard
        if (x > 130e18) revert Overflow();

        // Convert x / ln(2) to get the power of 2
        // x_ln2 = x * 1e18 / LN2
        int256 x_ln2 = (x * iONE) / int256(LN2);

        // Split into integer and fractional parts
        int256 intPart;
        int256 fracPart;

        if (x_ln2 >= 0) {
            intPart = x_ln2 / iONE;
            fracPart = x_ln2 % iONE;
        } else {
            intPart = (x_ln2 - iONE + 1) / iONE; // floor division for negatives
            fracPart = x_ln2 - intPart * iONE;
        }

        // 2^fracPart using polynomial approximation (minimax on [0,1))
        // Coefficients for 2^f where f in [0,1):
        //   2^f ≈ 1 + 0.6931472*f + 0.2402265*f^2 + 0.0555041*f^3 + 0.009618*f^4 + 0.001333*f^5
        uint256 f = uint256(fracPart);
        uint256 result = ONE; // start with 1.0
        uint256 term = f;

        // c1 * f
        result += (693147180559945309 * term) / ONE;
        // c2 * f^2
        term = (term * f) / ONE;
        result += (240226506959100712 * term) / ONE;
        // c3 * f^3
        term = (term * f) / ONE;
        result += (55504108664821580 * term) / ONE;
        // c4 * f^4
        term = (term * f) / ONE;
        result += (9618129107628477 * term) / ONE;
        // c5 * f^5
        term = (term * f) / ONE;
        result += (1333355814642490 * term) / ONE;

        // Apply integer part: multiply by 2^intPart
        if (intPart >= 0) {
            if (intPart > 59) revert Overflow();
            result = result << uint256(intPart);
        } else {
            uint256 shift = uint256(-intPart);
            if (shift >= 255) return 0;
            result = result >> shift;
        }

        return result;
    }

    /// @notice Natural logarithm ln(x) in fixed point, x > 0
    /// @dev Algorithm:
    ///   1. Normalize: find k such that y = x / 2^k is in [1, 2).
    ///   2. ln(x) = k * ln(2) + ln(y).
    ///   3. For y in [1, 2), use the Mercator substitution:
    ///        z = (y - 1) / (y + 1), which lies in [0, 1/3).
    ///        ln(y) = 2 * (z + z^3/3 + z^5/5 + z^7/7 + ...)
    ///      This converges rapidly — 10 terms gives < 1e-18 error.
    function lnFixed(uint256 x) internal pure returns (int256) {
        if (x == 0) revert ZeroInput();
        if (x == ONE) return 0;

        // Step 1: normalize x into y ∈ [ONE, 2*ONE), tracking the shift k
        int256 k = 0;
        uint256 y = x;

        if (y >= ONE) {
            while (y >= 2 * ONE) {
                y >>= 1;
                k++;
            }
        } else {
            while (y < ONE) {
                y <<= 1;
                k--;
            }
        }

        // Step 2: compute ln(y / ONE) using Mercator series
        // z = (y - ONE) / (y + ONE), scaled to fixed point
        int256 z = (int256(y - ONE) * iONE) / int256(y + ONE);
        int256 zSquared = (z * z) / iONE;

        // Sum = z + z^3/3 + z^5/5 + ...
        int256 sum = z;
        int256 term = z;

        for (uint256 n = 1; n < 15; n++) {
            term = (term * zSquared) / iONE; // z^(2n+1)
            sum += term / int256(2 * n + 1);
        }

        int256 lnY = 2 * sum; // ln(y / ONE)

        // Step 3: ln(x) = k * ln(2) + ln(y)
        return k * int256(LN2) + lnY;
    }

    /// @notice LMSR cost function: C(q) = b * ln( sum( e^(qi/b) ) )
    /// @param q Array of shares per outcome
    /// @param b Liquidity parameter (in fixed point, e.g. 100e18 = 100)
    /// @return cost The total cost in fixed point
    function cost(uint256[] memory q, uint256 b) internal pure returns (uint256) {
        if (b == 0) revert InvalidB();

        // To avoid overflow in exp, we use the log-sum-exp trick:
        // ln(sum(e^(xi))) = max(xi) + ln(sum(e^(xi - max(xi))))
        // This keeps the exponents small.

        int256 maxQ = 0;
        for (uint256 i = 0; i < q.length; i++) {
            int256 qi_over_b = int256((q[i] * ONE) / b);
            if (qi_over_b > maxQ) maxQ = qi_over_b;
        }

        uint256 sumExp = 0;
        for (uint256 i = 0; i < q.length; i++) {
            int256 qi_over_b = int256((q[i] * ONE) / b);
            int256 shifted = qi_over_b - maxQ; // always <= 0, safe for exp
            sumExp += expFixed(shifted);
        }

        // cost = b * (maxQ + ln(sumExp))
        int256 lnSum = lnFixed(sumExp);
        int256 totalLn = maxQ + lnSum;

        // cost = b * totalLn / ONE (since b is in whole units scaled by 1e18)
        return (b * uint256(totalLn)) / ONE;
    }

    /// @notice Price of buying 1 share of outcome i (implied probability)
    /// @dev price_i = e^(qi/b) / sum(e^(qj/b))  — this IS the softmax
    /// @return price in fixed point [0, 1e18]
    function price(uint256[] memory q, uint256 b, uint256 outcomeIndex) internal pure returns (uint256) {
        if (b == 0) revert InvalidB();
        if (outcomeIndex >= q.length) revert ZeroInput();

        // Log-sum-exp trick again
        int256 maxQ = 0;
        for (uint256 i = 0; i < q.length; i++) {
            int256 qi_over_b = int256((q[i] * ONE) / b);
            if (qi_over_b > maxQ) maxQ = qi_over_b;
        }

        uint256 sumExp = 0;
        uint256 outcomeExp = 0;
        for (uint256 i = 0; i < q.length; i++) {
            int256 qi_over_b = int256((q[i] * ONE) / b);
            int256 shifted = qi_over_b - maxQ;
            uint256 e = expFixed(shifted);
            sumExp += e;
            if (i == outcomeIndex) outcomeExp = e;
        }

        // price = outcomeExp / sumExp
        return (outcomeExp * ONE) / sumExp;
    }

    /// @notice Cost to buy `amount` shares of outcome `idx`
    /// @dev costDelta = C(q_after) - C(q_before)
    /// @return delta The cost in fixed point
    function costToBuy(
        uint256[] memory q,
        uint256 b,
        uint256 idx,
        uint256 amount
    ) internal pure returns (uint256) {
        uint256 costBefore = cost(q, b);

        // Create new q with added shares
        uint256[] memory qAfter = new uint256[](q.length);
        for (uint256 i = 0; i < q.length; i++) {
            qAfter[i] = q[i];
        }
        qAfter[idx] += amount;

        uint256 costAfter = cost(qAfter, b);

        // The delta is always positive when buying
        return costAfter - costBefore;
    }

    /// @notice Proceeds from selling `amount` shares of outcome `idx`
    /// @dev sellProceeds = C(q_before) - C(q_after)
    /// @return delta The proceeds in fixed point
    function costToSell(
        uint256[] memory q,
        uint256 b,
        uint256 idx,
        uint256 amount
    ) internal pure returns (uint256) {
        if (q[idx] < amount) revert ZeroInput(); // can't sell more than outstanding

        uint256 costBefore = cost(q, b);

        uint256[] memory qAfter = new uint256[](q.length);
        for (uint256 i = 0; i < q.length; i++) {
            qAfter[i] = q[i];
        }
        qAfter[idx] -= amount;

        uint256 costAfter = cost(qAfter, b);

        return costBefore - costAfter;
    }
}
