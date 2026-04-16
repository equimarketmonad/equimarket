# EquiMarket — Project Reference

## Deployed Contract Addresses (Monad Testnet) — v2 (solvency fix)

| Contract | Address |
|---|---|
| MockUSDC | `0xb8D1589AA8Ab4a87D871b66B1A3B2C3395b981C8` |
| MarketFactory | `0x585dbE0a82872C51A9ED9a52ebaB76D05A603F0D` |
| RaceOracle | `0xE11Aed210D434083ff09a90544d44A29Dd623780` |

### Old Addresses (v1 — deprecated, solvency bug)

| Contract | Address |
|---|---|
| MockUSDC | `0xee2Ea709518126cB7591290AF7f386cE5576D4cc` |
| MarketFactory | `0xea4503F917A521608E5045B6D1F5f78be331C50C` |
| RaceOracle | `0x22FA7376E70f94AedBCf0C79d578B49a61533853` |

## Admin Wallet

| Role | Address |
|---|---|
| Admin / Treasury | `0xF53D8DC0f529A5c95Ae5BbDc73dE7250897197B7` |
| Reporter | `0xF53D8DC0f529A5c95Ae5BbDc73dE7250897197B7` |

## Network Configuration

| Setting | Value |
|---|---|
| Network | Monad Testnet |
| Chain ID | 10143 |
| RPC URL | `https://testnet-rpc.monad.xyz` |
| Currency | MON |
| Block Explorer | `https://testnet.monadexplorer.com` |

## Contract Details

**MockUSDC** — Test version of USDC (the dollar stablecoin users bet with). 6 decimals.

**MarketFactory** — Creates a new LMSRMarket contract for each race. Stores fee config (4% base rate) and protocol treasury.

**RaceOracle** — Receives race results from the reporter, triggers settlement after a 30-minute dispute window.

**LMSRMarket** — Per-race market contract (cloned by Factory). Handles buy/sell shares, scratches, cancellations, fee collection, and payouts.

## Fee Structure

- Base fee rate: 400 (4%)
- Dynamic formula: `baseFeeRate * P * (1-P) * tradeAmount / 10000`
- At 50/50 odds: effective fee = 1.0%
- At 90/10 odds: effective fee = 0.36%
- Fees accumulate in each market, withdrawable by treasury

## Key Technical Details

- LMSR pricing with 18-decimal fixed-point math
- USDC uses 6 decimals (1 USDC = 1,000,000 units)
- **Solvency subsidy:** Each market is seeded with `b * ln(n)` USDC at creation (e.g. ~$161 for b=100, 5 horses). This guarantees the pool can always pay $1 per winning share.
- Scratch refunds at curve value (not original cost) for pool solvency
- Race cancellation refunds all holders at curve value, processed sequentially

## Live URLs

- **Vercel:** https://equimarket-equimarketmonads-projects.vercel.app
- **GitHub:** https://github.com/equimarketmonad/equimarket

## Task Progress

- [x] Task 1: Install developer tools (Node.js, Git, Foundry, VS Code)
- [x] Task 2: Compile and test smart contracts (17/17 tests passing)
- [x] Task 3: Get Monad testnet tokens (1,000 MON acquired)
- [x] Task 4: Deploy contracts to Monad testnet (v2 with solvency fix)
- [x] Task 5: Connect frontend to live contracts
- [x] Task 6: End-to-end testing (buy shares, settle race, claim)
- [ ] Task 7: Oracle backend (race results)
- [x] Task 8: Domain and hosting (Vercel — equimarket-equimarketmonads-projects.vercel.app)
- [ ] Task 9: Mainnet deployment
- [ ] Task 10: Post-launch monitoring

## Useful Commands

```bash
# Compile contracts
cd ~/Desktop/equimarket/contracts && forge build

# Run tests
cd ~/Desktop/equimarket/contracts && forge test -vv

# Start frontend dev server
cd ~/Desktop/equimarket/frontend && npm run dev

# View contract on explorer
open https://testnet.monadexplorer.com/address/0x585dbE0a82872C51A9ED9a52ebaB76D05A603F0D
```
