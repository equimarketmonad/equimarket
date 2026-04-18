/// @notice Hook to fetch market data from our backend API instead of the chain.
/// The backend indexer caches all on-chain state, so the frontend never
/// hits the RPC directly for reads. Only writes (buy/sell/claim) go on-chain.

"use client";

import { useState, useEffect, useCallback } from "react";

// In production, this would be your deployed backend URL
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://silks-stakes-api.onrender.com";

export interface APIRunner {
  index: number;
  name: string;
  jockey: string;
  trainer: string;
  number: number;
  draw: number;
  weight: string;
  form: string;
  age: string;
  sex: string;
  sire: string;
  dam: string;
  officialRating: string;
  price: number;
  odds: string | null;
  pct: string | null;
}

export interface APIMarketMeta {
  apiRaceId: string;
  name: string;
  course: string;
  date: string;
  offTime: string;
  offDt: string | null;
  region: string;
  pattern: string;
  type: string;
  distance: string;
  going: string;
  surface: string;
  prize: string;
  runners: APIRunner[];
}

export interface APIMarket {
  address: string;
  raceId: string;
  numOutcomes: number;
  closesAt: number;
  settled: boolean;
  cancelled: boolean;
  winningOutcome: number;
  totalDeposited: number;
  prices: number[];
  hasMeta: boolean;
  meta: APIMarketMeta | null;
  favourite: {
    index: number;
    name: string;
    jockey: string;
    price: number;
    odds: string | null;
    pct: string;
  };
  updatedAt: number;
}

export interface APIMarketsResponse {
  total: number;
  live: APIMarket[];
  upcoming: APIMarket[];
  settled: APIMarket[];
  cancelled: APIMarket[];
  all: APIMarket[];
  lastRefresh: number;
}

/**
 * Fetch all markets from the backend API.
 * Refreshes every 10 seconds (the backend handles the heavy RPC lifting).
 */
export function useMarketsAPI() {
  const [data, setData] = useState<APIMarketsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMarkets = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/markets`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      // Don't clear existing data on error — keep showing stale data
      if (!data) setError(msg);
      console.warn("[useMarketsAPI] Fetch failed:", msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkets();
    const interval = setInterval(fetchMarkets, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [fetchMarkets]);

  return { data, isLoading, error, refetch: fetchMarkets };
}

export interface PriceSnapshot {
  timestamp: number;
  prices: number[];
}

/**
 * Fetch price history for a market (for the chart).
 * Refreshes every 30s to match the backend polling interval.
 */
export function usePriceHistory(address: string | undefined) {
  const [snapshots, setSnapshots] = useState<PriceSnapshot[]>([]);

  useEffect(() => {
    if (!address) return;

    const fetchHistory = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/markets/${address}/history`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setSnapshots(json.snapshots || []);
      } catch (e) {
        console.warn("[usePriceHistory] Fetch failed:", e);
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 30000);
    return () => clearInterval(interval);
  }, [address]);

  return snapshots;
}

/**
 * Fetch a single market by address.
 */
export function useMarketAPI(address: string | undefined) {
  const [data, setData] = useState<APIMarket | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!address) return;

    const fetchMarket = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/markets/${address}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setData(json);
      } catch (e) {
        console.warn("[useMarketAPI] Fetch failed:", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMarket();
    const interval = setInterval(fetchMarket, 10000);
    return () => clearInterval(interval);
  }, [address]);

  return { data, isLoading };
}
