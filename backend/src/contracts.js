/// @notice Contract ABIs and helpers for interacting with Silks & Stakes on-chain

export const FACTORY_ABI = [
  "function createMarket(bytes32 raceId, uint256 numOutcomes, uint256 b, uint256 closesAt) returns (address)",
  "function markets(bytes32 raceId) view returns (address)",
  "function allMarkets(uint256 index) view returns (address)",
  "function marketCount() view returns (uint256)",
  "function getMarkets(uint256 offset, uint256 limit) view returns (address[])",
  "event MarketCreated(bytes32 indexed raceId, address market, uint256 numOutcomes, uint256 b, uint256 closesAt, uint256 subsidy)",
];

export const MARKET_ABI = [
  "function raceId() view returns (bytes32)",
  "function numOutcomes() view returns (uint256)",
  "function settled() view returns (bool)",
  "function cancelled() view returns (bool)",
  "function winningOutcome() view returns (uint8)",
  "function closesAt() view returns (uint256)",
  "function totalDeposited() view returns (uint256)",
  "function getAllPrices() view returns (uint256[])",
];

export const USDC_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function mint(address to, uint256 amount)",
];

export const ORACLE_ABI = [
  "function submitResult(bytes32 raceId, uint8 winner)",
  "function finalizeResult(bytes32 raceId)",
  "function reportScratch(bytes32 raceId, uint256 outcome)",
  "function reportCancellation(bytes32 raceId)",
  "function results(bytes32 raceId) view returns (uint8 winner, uint256 submittedAt, bool finalized, bool disputed, address submittedBy)",
  "function disputeWindow() view returns (uint256)",
];
