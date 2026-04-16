"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { parseAbi } from "viem";
import { CONTRACTS, FACTORY_ABI, MARKET_ABI, fromFixedPoint } from "@/lib/contracts";

// ── Types ──

export interface MarketData {
  address: `0x${string}`;
  raceId: string;
  numOutcomes: number;
  closesAt: number;
  settled: boolean;
  cancelled: boolean;
  winningOutcome: number;
  totalDeposited: bigint;
  baseFeeRate: number;
  prices: number[];       // implied probabilities [0-1]
  scratched: boolean[];
}

// Auto-refresh interval (ms) — polls chain every 5 seconds
const POLL_INTERVAL = 5000;

// ── Fetch all market addresses from the factory ──

export function useMarketAddresses() {
  const { data: count } = useReadContract({
    address: CONTRACTS.factory,
    abi: parseAbi(FACTORY_ABI),
    functionName: "marketCount",
    query: { refetchInterval: POLL_INTERVAL },
  });

  const { data: addresses, isLoading, error } = useReadContract({
    address: CONTRACTS.factory,
    abi: parseAbi(FACTORY_ABI),
    functionName: "getMarkets",
    args: count !== undefined ? [BigInt(0), count as bigint] : undefined,
    query: { enabled: count !== undefined, refetchInterval: POLL_INTERVAL },
  });

  return {
    addresses: (addresses as `0x${string}`[] | undefined) ?? [],
    isLoading,
    error,
  };
}

// ── Fetch full data for a single market ──

export function useMarketData(marketAddress: `0x${string}` | undefined) {
  const abi = parseAbi(MARKET_ABI);
  const enabled = !!marketAddress;

  const { data: results, isLoading, refetch } = useReadContracts({
    contracts: marketAddress
      ? [
          { address: marketAddress, abi, functionName: "raceId" },
          { address: marketAddress, abi, functionName: "numOutcomes" },
          { address: marketAddress, abi, functionName: "closesAt" },
          { address: marketAddress, abi, functionName: "settled" },
          { address: marketAddress, abi, functionName: "cancelled" },
          { address: marketAddress, abi, functionName: "winningOutcome" },
          { address: marketAddress, abi, functionName: "totalDeposited" },
          { address: marketAddress, abi, functionName: "baseFeeRate" },
          { address: marketAddress, abi, functionName: "getAllPrices" },
        ]
      : [],
    query: { enabled, refetchInterval: POLL_INTERVAL },
  });

  if (!results || results.length < 9 || results.some((r) => r.status === "failure")) {
    return { data: undefined, isLoading, refetch };
  }

  const r = results as { status: "success"; result: unknown }[];
  const numOutcomes = Number(r[1].result as bigint);
  const pricesRaw = r[8].result as bigint[];

  const data: MarketData = {
    address: marketAddress!,
    raceId: r[0].result as string,
    numOutcomes,
    closesAt: Number(r[2].result as bigint),
    settled: r[3].result as boolean,
    cancelled: r[4].result as boolean,
    winningOutcome: Number(r[5].result),
    totalDeposited: r[6].result as bigint,
    baseFeeRate: Number(r[7].result as bigint),
    prices: pricesRaw.map((p) => fromFixedPoint(p)),
    scratched: [], // filled below
  };

  return { data, isLoading, refetch };
}

// ── Fetch scratch status for all outcomes of a market ──

export function useScratchedStatus(
  marketAddress: `0x${string}` | undefined,
  numOutcomes: number
) {
  const abi = parseAbi(MARKET_ABI);

  const { data: results } = useReadContracts({
    contracts: marketAddress
      ? Array.from({ length: numOutcomes }, (_, i) => ({
          address: marketAddress,
          abi,
          functionName: "scratched" as const,
          args: [BigInt(i)],
        }))
      : [],
    query: { enabled: !!marketAddress && numOutcomes > 0, refetchInterval: POLL_INTERVAL },
  });

  return (results?.map((r) => r.result as boolean) ?? Array(numOutcomes).fill(false)) as boolean[];
}

// ── Fetch user positions for a market ──

export function useUserPositions(
  marketAddress: `0x${string}` | undefined,
  userAddress: `0x${string}` | undefined,
  numOutcomes: number
) {
  const abi = parseAbi(MARKET_ABI);
  const enabled = !!marketAddress && !!userAddress && numOutcomes > 0;

  const { data: results } = useReadContracts({
    contracts: enabled
      ? Array.from({ length: numOutcomes }, (_, i) => ({
          address: marketAddress!,
          abi,
          functionName: "userShares" as const,
          args: [userAddress!, BigInt(i)],
        }))
      : [],
    query: { enabled, refetchInterval: POLL_INTERVAL },
  });

  return (results?.map((r) => r.result as bigint ?? BigInt(0)) ?? Array(numOutcomes).fill(BigInt(0))) as bigint[];
}
