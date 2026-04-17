"use client";

import { useState, useMemo } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { parseAbi } from "viem";
import Header from "@/components/Header";
import RaceCard from "@/components/RaceCard";
import { useMarketAddresses } from "@/hooks/useMarkets";
import { CONTRACTS, MARKET_ABI, formatUSDC, fromFixedPoint } from "@/lib/contracts";
import { getRaceMetadata, getHorseInfo } from "@/lib/horseNames";

// ── Types ──

interface LoadedMarket {
  address: `0x${string}`;
  raceId: string;
  numOutcomes: number;
  closesAt: number;
  settled: boolean;
  cancelled: boolean;
  totalDeposited: bigint;
  prices: number[];
  meta: {
    name: string;
    course: string;
    date: string;
    offTime: string;
    region: string;
  };
  favName: string;
  favJockey: string;
  favOdds: string;
  favPct: string;
  pool: string;
  isOpen: boolean;
}

// Racing saddle cloth colors
const GATE_COLORS: Record<number, { bg: string; text: string }> = {
  1: { bg: "#D32F2F", text: "#fff" },
  2: { bg: "#FFFFFF", text: "#1a1a18" },
  3: { bg: "#1565C0", text: "#fff" },
  4: { bg: "#F9A825", text: "#1a1a18" },
  5: { bg: "#2E7D32", text: "#fff" },
  6: { bg: "#212121", text: "#fff" },
  7: { bg: "#E65100", text: "#fff" },
  8: { bg: "#E91E90", text: "#fff" },
  9: { bg: "#00ACC1", text: "#fff" },
  10: { bg: "#7B1FA2", text: "#fff" },
  11: { bg: "#9E9E9E", text: "#1a1a18" },
  12: { bg: "#7CB342", text: "#1a1a18" },
};

const MAX_MARKETS = 12; // Limit to avoid RPC overload
const POLL_INTERVAL = 15000; // 15s instead of 5s

function GateNum({ gate }: { gate: number }) {
  const c = GATE_COLORS[gate] || { bg: "#666", text: "#fff" };
  const border = gate === 2 ? "1px solid #666" : "none";
  return (
    <div
      className="w-[30px] h-[30px] rounded-md flex items-center justify-center font-mono text-[13px] font-bold shrink-0"
      style={{ background: c.bg, color: c.text, border }}
    >
      {gate}
    </div>
  );
}

/**
 * Batch-fetch market data for multiple addresses in a single multicall.
 * This avoids N×9 individual RPC calls that cause rate limiting.
 */
function useBatchMarketData(addresses: `0x${string}`[]) {
  const limited = addresses.slice(0, MAX_MARKETS);
  const abi = parseAbi(MARKET_ABI);

  // Build a single multicall for all markets
  const contracts = limited.flatMap((addr) => [
    { address: addr, abi, functionName: "raceId" as const },
    { address: addr, abi, functionName: "numOutcomes" as const },
    { address: addr, abi, functionName: "closesAt" as const },
    { address: addr, abi, functionName: "settled" as const },
    { address: addr, abi, functionName: "cancelled" as const },
    { address: addr, abi, functionName: "totalDeposited" as const },
    { address: addr, abi, functionName: "getAllPrices" as const },
  ]);

  const { data: results, isLoading } = useReadContracts({
    contracts: contracts.length > 0 ? contracts : [],
    query: {
      enabled: limited.length > 0,
      refetchInterval: POLL_INTERVAL,
      staleTime: 10000, // Keep data for 10s before considering stale
    },
  });

  // Parse results into market objects
  const markets = useMemo(() => {
    if (!results) return [];

    const parsed: LoadedMarket[] = [];
    const fieldsPerMarket = 7;

    for (let i = 0; i < limited.length; i++) {
      const offset = i * fieldsPerMarket;
      const slice = results.slice(offset, offset + fieldsPerMarket);

      // Skip if any call failed
      if (slice.some((r) => r.status === "failure")) continue;

      const raceId = slice[0].result as string;
      const numOutcomes = Number(slice[1].result as bigint);
      const closesAt = Number(slice[2].result as bigint);
      const settled = slice[3].result as boolean;
      const cancelled = slice[4].result as boolean;
      const totalDeposited = slice[5].result as bigint;
      const pricesRaw = slice[6].result as bigint[];
      const prices = pricesRaw.map((p) => fromFixedPoint(p));

      // Get metadata — skip markets without it
      const meta = getRaceMetadata(raceId);
      if (!meta) continue;

      const nowSec = Date.now() / 1000;
      const isOpen = !settled && !cancelled && nowSec <= closesAt;

      // Find favourite
      let favIdx = 0;
      let favPrice = 0;
      prices.forEach((p, j) => {
        if (p > favPrice) { favPrice = p; favIdx = j; }
      });
      const favInfo = getHorseInfo(favIdx, raceId);

      parsed.push({
        address: limited[i],
        raceId,
        numOutcomes,
        closesAt,
        settled,
        cancelled,
        totalDeposited,
        prices,
        meta: {
          name: meta.name,
          course: meta.course,
          date: meta.date,
          offTime: meta.offTime,
          region: meta.region,
        },
        favName: favInfo.name,
        favJockey: favInfo.jockey,
        favOdds: favPrice > 0 ? `${(favPrice * 100).toFixed(0)}% — $${(1 / favPrice).toFixed(2)}` : "---",
        favPct: (favPrice * 100).toFixed(0),
        pool: formatUSDC(totalDeposited),
        isOpen,
      });
    }

    return parsed;
  }, [results, limited]);

  return { markets, isLoading };
}

export default function Home() {
  const { isConnected } = useAccount();
  const { addresses: marketAddresses, isLoading: addressesLoading } = useMarketAddresses();
  const { markets, isLoading: marketsLoading } = useBatchMarketData(marketAddresses);
  const [expandedMarket, setExpandedMarket] = useState<`0x${string}` | null>(null);

  const isLoading = addressesLoading || marketsLoading;

  // Split markets by status
  const liveMarkets = markets.filter((m) => m.isOpen);
  const upcomingMarkets = markets.filter((m) => !m.isOpen && !m.settled && !m.cancelled);
  const allMarkets = markets;

  return (
    <main className="min-h-screen">
      <Header />

      {/* Expanded market overlay */}
      {expandedMarket && (
        <div className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-sm flex items-start justify-center pt-20 px-4 overflow-y-auto">
          <div className="w-full max-w-2xl relative pb-20">
            <button
              onClick={() => setExpandedMarket(null)}
              className="absolute -top-10 right-0 font-mono text-[10px] tracking-[1.5px] uppercase text-text-dim hover:text-text-primary transition-colors"
            >
              Close ✕
            </button>
            <RaceCard marketAddress={expandedMarket} />
          </div>
        </div>
      )}

      {/* ═══ LIVE RACES TICKER ═══ */}
      <div className="flex items-center justify-between px-6 md:px-12 pt-5 pb-3">
        <span className="font-mono text-[11px] tracking-[2.5px] uppercase text-text-dim">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-green shadow-[0_0_8px_rgba(76,175,122,0.5)] animate-pulse mr-2 align-middle" />
          Live Races
        </span>
        {markets.length > 0 && (
          <span className="font-mono text-[10px] tracking-[1.5px] uppercase text-gold">
            {markets.length} markets
          </span>
        )}
      </div>

      <div className="border-y border-border overflow-hidden relative">
        <div className="absolute top-0 bottom-0 left-0 w-[60px] bg-gradient-to-r from-bg to-transparent z-10 pointer-events-none" />
        <div className="absolute top-0 bottom-0 right-0 w-[60px] bg-gradient-to-l from-bg to-transparent z-10 pointer-events-none" />
        <div className="flex gap-0 px-6 md:px-12 overflow-x-auto hide-scrollbar">
          {isLoading && markets.length === 0 ? (
            <div className="flex-none px-6 py-3.5 min-w-[340px]">
              <div className="font-mono text-[11px] text-text-dim animate-pulse">Loading markets from Monad...</div>
            </div>
          ) : markets.length === 0 ? (
            <div className="flex-none px-6 py-3.5 min-w-[340px]">
              <div className="font-mono text-[11px] text-text-dim">No markets deployed yet</div>
            </div>
          ) : (
            (liveMarkets.length > 0 ? liveMarkets : allMarkets.slice(0, 6)).map((m, i) => (
              <div
                key={m.address}
                onClick={() => setExpandedMarket(m.address)}
                className={`flex-none flex items-start gap-5 px-6 py-3.5 min-w-[340px] cursor-pointer hover:bg-gold/[0.04] transition-colors ${i > 0 ? "border-l border-border" : "border-x border-border"}`}
              >
                <div className={`font-mono text-[9px] tracking-[2px] uppercase px-2 py-0.5 rounded-full flex items-center gap-1.5 whitespace-nowrap ${
                  m.isOpen
                    ? "text-accent-green bg-accent-green/10 border border-accent-green/30"
                    : m.settled
                    ? "text-gold bg-gold/10 border border-gold/25"
                    : "text-text-dim bg-text-dim/10 border border-text-dim/30"
                }`}>
                  {m.isOpen && <span className="w-[5px] h-[5px] rounded-full bg-accent-green animate-pulse" />}
                  {m.isOpen ? "Live" : m.settled ? "Settled" : "Open"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-sm font-semibold text-text-primary truncate">{m.meta.name}</div>
                  <div className="font-mono text-[10px] text-text-dim mt-0.5">{m.meta.course} — {m.meta.offTime}</div>
                </div>
                <div className="text-right whitespace-nowrap">
                  <div className="font-mono text-[11px] text-gold font-medium">{m.favName}</div>
                  <div className="font-mono text-[10px] text-text-dim mt-0.5">{m.favOdds}</div>
                </div>
                <div className="text-right whitespace-nowrap">
                  <div className="font-mono text-[9px] text-text-dim tracking-[1px] uppercase">Pool</div>
                  <div className="font-mono text-[13px] text-text-primary font-medium mt-0.5">${m.pool}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ═══ UPCOMING RACES ═══ */}
      <div className="flex items-center justify-between px-6 md:px-12 pt-5 pb-3">
        <span className="font-mono text-[11px] tracking-[2.5px] uppercase text-text-dim">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold mr-2 align-middle" />
          Race Cards
        </span>
      </div>

      <div className="flex gap-3 px-6 md:px-12 pb-6 overflow-x-auto hide-scrollbar">
        {isLoading && markets.length === 0 ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-none w-[260px] bg-surface border border-border rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-surface-2 rounded w-20 mb-3" />
              <div className="h-5 bg-surface-2 rounded w-40 mb-2" />
              <div className="h-3 bg-surface-2 rounded w-28 mb-4" />
              <div className="h-10 bg-surface-2 rounded" />
            </div>
          ))
        ) : (
          allMarkets.slice(0, 8).map((m) => (
            <div
              key={m.address}
              onClick={() => setExpandedMarket(m.address)}
              className="flex-none w-[260px] bg-surface border border-border rounded-xl p-4 cursor-pointer hover:border-border-bright hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-center justify-between mb-2.5">
                <span className={`font-mono text-[10px] tracking-[1.5px] uppercase px-2 py-0.5 rounded-full ${
                  m.isOpen
                    ? "text-accent-green bg-accent-green/10 border border-accent-green/30"
                    : "text-gold bg-gold/10 border border-gold/25"
                }`}>{m.meta.offTime}</span>
                <span className="font-mono text-[10px] text-text-dim">{m.numOutcomes} runners</span>
              </div>
              <div className="font-serif text-base font-semibold text-text-primary mb-0.5 truncate">{m.meta.name}</div>
              <div className="font-mono text-[10px] text-text-dim mb-3.5">{m.meta.course} — {m.meta.date}</div>
              <div className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2">
                <div>
                  <div className="font-mono text-[9px] text-text-dim uppercase tracking-[1px]">Favourite</div>
                  <div className="text-xs font-medium text-text-primary mt-0.5 truncate max-w-[120px]">{m.favName}</div>
                </div>
                <div className="font-mono text-sm text-gold font-semibold">
                  ${m.prices[0] > 0 ? (1 / Math.max(...m.prices)).toFixed(2) : "---"}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="h-px bg-border mx-6 md:mx-12" />

      {/* ═══ ALL MARKETS ═══ */}
      <div className="flex items-center justify-between px-6 md:px-12 pt-5 pb-3">
        <span className="font-mono text-[11px] tracking-[2.5px] uppercase text-text-dim">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold-dim mr-2 align-middle" />
          All Markets
        </span>
      </div>

      <div className="flex flex-wrap gap-4 px-6 md:px-12 pb-10">
        {isLoading && markets.length === 0 ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-none w-[320px] bg-surface border border-border rounded-xl overflow-hidden animate-pulse">
              <div className="px-5 py-4"><div className="h-6 bg-surface-2 rounded w-40 mb-2" /><div className="h-3 bg-surface-2 rounded w-28" /></div>
              <div className="px-5 pb-4 space-y-3">{Array.from({ length: 3 }).map((_, j) => <div key={j} className="h-8 bg-surface-2 rounded" />)}</div>
            </div>
          ))
        ) : (
          allMarkets.map((m) => {
            const meta = getRaceMetadata(m.raceId);
            const runners = (meta?.runners || [])
              .map((r, i) => ({ ...r, price: m.prices[i] || 0 }))
              .sort((a, b) => b.price - a.price)
              .slice(0, 4);

            return (
              <div
                key={m.address}
                onClick={() => setExpandedMarket(m.address)}
                className="flex-none w-[320px] bg-surface border border-border rounded-xl overflow-hidden cursor-pointer hover:border-border-bright hover:-translate-y-0.5 transition-all"
              >
                {/* Banner */}
                <div className="flex items-start justify-between px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-serif text-[17px] font-bold text-text-primary mb-0.5 truncate">{m.meta.name}</div>
                    <div className="font-mono text-[10px] text-text-dim">{m.meta.course} — {m.meta.date}</div>
                  </div>
                  <div className="text-right ml-3">
                    <div className="font-mono text-[9px] text-text-dim uppercase tracking-[1px]">Pool</div>
                    <div className="font-mono text-base text-gold font-semibold">${m.pool}</div>
                  </div>
                </div>

                {/* Runners */}
                <div className="px-5 pb-4">
                  {runners.map((runner, hi) => {
                    const odds = runner.price > 0 ? (1 / runner.price).toFixed(1) + "/1" : "---";
                    return (
                      <div key={hi} className={`flex items-center justify-between py-1.5 ${hi < runners.length - 1 ? "border-b border-border" : ""}`}>
                        <div className="flex items-center gap-2.5">
                          <GateNum gate={runner.draw || runner.number} />
                          <div>
                            <div className="text-xs font-medium text-text-primary">{runner.name}</div>
                            <div className="font-mono text-[10px] text-text-dim">{runner.jockey}</div>
                          </div>
                        </div>
                        <span className="font-mono text-xs font-semibold text-gold bg-gold/10 border border-gold/25 px-3.5 py-1 rounded-lg">
                          {odds}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Status bar */}
                <div className="flex items-center justify-between px-5 py-2.5 bg-surface-2 border-t border-border">
                  <span className={`font-mono text-[9px] tracking-[1.5px] uppercase px-2 py-0.5 rounded-full ${
                    m.isOpen
                      ? "text-accent-green bg-accent-green/10 border border-accent-green/30"
                      : "text-gold bg-gold/10 border border-gold/25"
                  }`}>
                    {m.isOpen ? "Live" : "Open"}
                  </span>
                  <span className="font-mono text-[10px] text-text-dim">{m.numOutcomes} runners</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
