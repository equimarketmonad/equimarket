/// @notice Contract addresses, ABIs, and chain config for EquiMarket
/// After deploying contracts, update the addresses below.

import { defineChain } from "viem";

// ── Monad Testnet Chain Definition ──
export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com" },
  },
  testnet: true,
});

// ── Contract Addresses (Monad Testnet — deployed April 2026) ──
export const CONTRACTS = {
  usdc: "0xb8D1589AA8Ab4a87D871b66B1A3B2C3395b981C8" as `0x${string}`,
  factory: "0x585dbE0a82872C51A9ED9a52ebaB76D05A603F0D" as `0x${string}`,
  oracle: "0xE11Aed210D434083ff09a90544d44A29Dd623780" as `0x${string}`,
};

// ── ABIs (viem-compatible, using human-readable format) ──

export const FACTORY_ABI = [
  "function createMarket(bytes32 raceId, uint256 numOutcomes, uint256 b, uint256 closesAt) returns (address)",
  "function markets(bytes32 raceId) view returns (address)",
  "function allMarkets(uint256 index) view returns (address)",
  "function marketCount() view returns (uint256)",
  "function getMarkets(uint256 offset, uint256 limit) view returns (address[])",
  "function defaultBaseFeeRate() view returns (uint256)",
  "function protocolTreasury() view returns (address)",
] as const;

export const MARKET_ABI = [
  // ── Read functions ──
  "function raceId() view returns (bytes32)",
  "function numOutcomes() view returns (uint256)",
  "function b() view returns (uint256)",
  "function settled() view returns (bool)",
  "function cancelled() view returns (bool)",
  "function winningOutcome() view returns (uint8)",
  "function closesAt() view returns (uint256)",
  "function createdAt() view returns (uint256)",
  "function qShares(uint256 index) view returns (uint256)",
  "function userShares(address user, uint256 outcome) view returns (uint256)",
  "function getPrice(uint256 outcome) view returns (uint256)",
  "function getOdds(uint256 outcome) view returns (uint256)",
  "function getAllPrices() view returns (uint256[])",
  "function getAllShares() view returns (uint256[])",
  "function quoteBuy(uint256 outcome, uint256 shares) view returns (uint256)",
  "function quoteSell(uint256 outcome, uint256 shares) view returns (uint256)",
  "function baseFeeRate() view returns (uint256)",
  "function accumulatedFees() view returns (uint256)",
  "function totalDeposited() view returns (uint256)",
  "function scratched(uint256 outcome) view returns (bool)",
  "function scratchCount() view returns (uint256)",
  "function getScratchRefund(address user, uint256 outcome) view returns (uint256)",
  "function getCancelRefund(address user) view returns (uint256)",
  // ── Write functions ──
  "function buyShares(uint256 outcome, uint256 sharesToBuy)",
  "function sellShares(uint256 outcome, uint256 sharesToSell)",
  "function claim()",
  "function claimScratchRefund(uint256 outcome)",
  "function claimCancelRefund()",
  "function withdrawFees()",
  // ── Events ──
  "event SharesBought(address indexed user, uint256 indexed outcome, uint256 shares, uint256 cost)",
  "event SharesSold(address indexed user, uint256 indexed outcome, uint256 shares, uint256 proceeds)",
  "event MarketSettled(uint8 winningOutcome)",
  "event WinningsClaimed(address indexed user, uint256 payout)",
  "event OutcomeScratched(uint256 indexed outcome)",
  "event ScratchRefundClaimed(address indexed user, uint256 indexed outcome, uint256 refund)",
  "event MarketCancelled()",
  "event CancelRefundClaimed(address indexed user, uint256 totalRefund)",
  "event FeesCollected(address indexed treasury, uint256 amount)",
] as const;

export const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
] as const;

export const ORACLE_ABI = [
  "function submitResult(bytes32 raceId, uint8 winner)",
  "function disputeResult(bytes32 raceId, uint8 newWinner)",
  "function finalizeResult(bytes32 raceId)",
  "function reportScratch(bytes32 raceId, uint256 outcome)",
  "function reportCancellation(bytes32 raceId)",
  "function results(bytes32 raceId) view returns (uint8 winner, uint256 submittedAt, bool finalized, bool disputed, address submittedBy)",
  "function disputeWindow() view returns (uint256)",
] as const;

// ── Constants ──
export const FIXED_ONE = BigInt("1000000000000000000"); // 1e18
export const USDC_DECIMALS = 6;

// ── Helpers ──

/** Convert a fixed-point 1e18 value to a human-readable number (0-1 range for probabilities) */
export function fromFixedPoint(fp: bigint): number {
  return Number(fp) / 1e18;
}

/** Convert a USDC amount (6 decimals) to a human-readable dollar string */
export function formatUSDC(amount: bigint): string {
  const dollars = Number(amount) / 1e6;
  return dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Convert a dollar amount to USDC units (6 decimals) */
export function toUSDC(dollars: number): bigint {
  return BigInt(Math.round(dollars * 1e6));
}

/** Convert shares input (human number like 10) to fixed-point 1e18 */
export function toShares(amount: number): bigint {
  return BigInt(Math.round(amount * 1e18));
}
