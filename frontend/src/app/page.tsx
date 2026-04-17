"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import Header from "@/components/Header";
import RaceCard from "@/components/RaceCard";
import { useMarketAddresses, useMarketData } from "@/hooks/useMarkets";
import { CONTRACTS, formatUSDC } from "@/lib/contracts";
import { getRaceName, getRaceMetadata, getHorseInfo, getBarColor } from "@/lib/horseNames";
import type { RaceMetadata } from "@/lib/horseNames";

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

// ── Market summary component for the ticker ──
function MarketSummary({ address }: { address: `0x${string}` }) {
  const { data: market } = useMarketData(address);
  if (!market) return null;

  const meta = getRaceMetadata(market.raceId);
  if (!meta) return null; // Skip markets with no metadata (old test markets)

  const nowSec = Date.now() / 1000;
  const isOpen = !market.settled && !market.cancelled && nowSec <= market.closesAt;
  const isSettled = market.settled;
  const isCancelled = market.cancelled;

  // Find the favourite (highest probability)
  let favIdx = 0;
  let favPrice = 0;
  market.prices.forEach((p, i) => {
    if (p > favPrice) { favPrice = p; favIdx = i; }
  });
  const favHorse = getHorseInfo(favIdx, market.raceId);
  const favOdds = favPrice > 0 ? (1 / favPrice).toFixed(2) : "---";
  const favPct = (favPrice * 100).toFixed(0);
  const pool = formatUSDC(market.totalDeposited);

  return { market, meta, isOpen, isSettled, isCancelled, favHorse, favOdds, favPct, pool, favIdx };
}

// ── Ticker item (used in the live races bar) ──
function TickerItem({ address, isFirst }: { address: `0x${string}`; isFirst: boolean }) {
  const { data: market } = useMarketData(address);
  if (!market) return null;

  const meta = getRaceMetadata(market.raceId);
  if (!meta) return null;

  const nowSec = Date.now() / 1000;
  const isOpen = !market.settled && !market.cancelled && nowSec <= market.closesAt;

  let favIdx = 0;
  let favPrice = 0;
  market.prices.forEach((p, i) => {
    if (p > favPrice) { favPrice = p; favIdx = i; }
  });
  const favHorse = getHorseInfo(favIdx, market.raceId);
  const favOdds = favPrice > 0 ? `${(favPrice * 100).toFixed(0)}% — $${(1 / favPrice).toFixed(2)}` : "---";
  const pool = formatUSDC(market.totalDeposited);

  return (
    <div className={`flex-none flex items-start gap-5 px-6 py-3.5 min-w-[340px] cursor-pointer hover:bg-gold/[0.04] transition-colors ${!isFirst ? "border-l border-border" : "border-x border-border"}`}>
      <div className={`font-mono text-[9px] tracking-[2px] uppercase px-2 py-0.5 rounded-full flex items-center gap-1.5 whitespace-nowrap ${
        isOpen
          ? "text-accent-green bg-accent-green/10 border border-accent-green/30"
          : market.settled
          ? "text-gold bg-gold/10 border border-gold/25"
          : "text-text-dim bg-text-dim/10 border border-text-dim/30"
      }`}>
        {isOpen && <span className="w-[5px] h-[5px] rounded-full bg-accent-green animate-pulse" />}
        {isOpen ? "Live" : market.settled ? "Settled" : "Closed"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-serif text-sm font-semibold text-text-primary truncate">{meta.name}</div>
        <div className="font-mono text-[10px] text-text-dim mt-0.5">{meta.course} — {meta.offTime}</div>
      </div>
      <div className="text-right whitespace-nowrap">
        <div className="font-mono text-[11px] text-gold font-medium">{favHorse.name}</div>
        <div className="font-mono text-[10px] text-text-dim mt-0.5">{favOdds}</div>
      </div>
      <div className="text-right whitespace-nowrap">
        <div className="font-mono text-[9px] text-text-dim tracking-[1px] uppercase">Pool</div>
        <div className="font-mono text-[13px] text-text-primary font-medium mt-0.5">${pool}</div>
      </div>
    </div>
  );
}

// ── Upcoming race card ──
function UpcomingCard({ address }: { address: `0x${string}` }) {
  const { data: market } = useMarketData(address);
  if (!market) return null;

  const meta = getRaceMetadata(market.raceId);
  if (!meta) return null;

  let favIdx = 0;
  let favPrice = 0;
  market.prices.forEach((p, i) => {
    if (p > favPrice) { favPrice = p; favIdx = i; }
  });
  const favHorse = getHorseInfo(favIdx, market.raceId);
  const favOdds = favPrice > 0 ? `$${(1 / favPrice).toFixed(2)}` : "---";

  return (
    <div className="flex-none w-[260px] bg-surface border border-border rounded-xl p-4 cursor-pointer hover:border-border-bright hover:-translate-y-0.5 transition-all">
      <div className="flex items-center justify-between mb-2.5">
        <span className="font-mono text-[10px] tracking-[1.5px] uppercase text-gold bg-gold/10 border border-gold/25 px-2 py-0.5 rounded-full">{meta.offTime}</span>
        <span className="font-mono text-[10px] text-text-dim">{market.numOutcomes} runners</span>
      </div>
      <div className="font-serif text-base font-semibold text-text-primary mb-0.5 truncate">{meta.name}</div>
      <div className="font-mono text-[10px] text-text-dim mb-3.5">{meta.course} — {meta.date}</div>
      <div className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2">
        <div>
          <div className="font-mono text-[9px] text-text-dim uppercase tracking-[1px]">Favourite</div>
          <div className="text-xs font-medium text-text-primary mt-0.5 truncate max-w-[120px]">{favHorse.name}</div>
        </div>
        <div className="font-mono text-sm text-gold font-semibold">{favOdds}</div>
      </div>
    </div>
  );
}

// ── Market card with runners ──
function MarketCard({ address }: { address: `0x${string}` }) {
  const { data: market } = useMarketData(address);
  if (!market) return null;

  const meta = getRaceMetadata(market.raceId);
  if (!meta) return null;

  const nowSec = Date.now() / 1000;
  const isOpen = !market.settled && !market.cancelled && nowSec <= market.closesAt;
  const pool = formatUSDC(market.totalDeposited);

  // Show top 4 runners by price
  const runners = meta.runners
    .map((r, i) => ({ ...r, price: market.prices[i] || 0 }))
    .sort((a, b) => b.price - a.price)
    .slice(0, 4);

  return (
    <div className="flex-none w-[320px] bg-surface border border-border rounded-xl overflow-hidden cursor-pointer hover:border-border-bright hover:-translate-y-0.5 transition-all">
      {/* Banner */}
      <div className="flex items-start justify-between px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="font-serif text-[17px] font-bold text-text-primary mb-0.5 truncate">{meta.name}</div>
          <div className="font-mono text-[10px] text-text-dim">{meta.course} — {meta.date}</div>
        </div>
        <div className="text-right ml-3">
          <div className="font-mono text-[9px] text-text-dim uppercase tracking-[1px]">Pool</div>
          <div className="font-mono text-base text-gold font-semibold">${pool}</div>
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
              <button className="font-mono text-xs font-semibold text-gold bg-gold/10 border border-gold/25 px-3.5 py-1 rounded-lg hover:bg-gold/20 transition-colors">
                {odds}
              </button>
            </div>
          );
        })}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-surface-2 border-t border-border">
        <span className={`font-mono text-[9px] tracking-[1.5px] uppercase px-2 py-0.5 rounded-full ${
          isOpen
            ? "text-accent-green bg-accent-green/10 border border-accent-green/30"
            : "text-gold bg-gold/10 border border-gold/25"
        }`}>
          {isOpen ? "Live" : "Upcoming"}
        </span>
        <span className="font-mono text-[10px] text-text-dim">{market.numOutcomes} runners</span>
      </div>
    </div>
  );
}

// ── Expanded RaceCard view (when user clicks a market) ──
function ExpandedMarket({ address, onClose }: { address: `0x${string}`; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-sm flex items-start justify-center pt-20 px-4">
      <div className="w-full max-w-2xl relative">
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 font-mono text-[10px] tracking-[1.5px] uppercase text-text-dim hover:text-text-primary transition-colors"
        >
          Close ✕
        </button>
        <RaceCard marketAddress={address} />
      </div>
    </div>
  );
}

export default function Home() {
  const { isConnected } = useAccount();
  const { addresses: marketAddresses, isLoading } = useMarketAddresses();
  const [expandedMarket, setExpandedMarket] = useState<`0x${string}` | null>(null);

  // Filter to only markets that have metadata (skip old test markets)
  // We render all addresses but the components self-filter via getRaceMetadata

  const hasMarkets = marketAddresses.length > 0;

  return (
    <main className="min-h-screen">
      <Header />

      {/* Expanded market overlay */}
      {expandedMarket && (
        <ExpandedMarket address={expandedMarket} onClose={() => setExpandedMarket(null)} />
      )}

      {/* ═══ LIVE RACES TICKER ═══ */}
      <div className="flex items-center justify-between px-6 md:px-12 pt-5 pb-3">
        <span className="font-mono text-[11px] tracking-[2.5px] uppercase text-text-dim">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-green shadow-[0_0_8px_rgba(76,175,122,0.5)] animate-pulse mr-2 align-middle" />
          Live Races
        </span>
        {hasMarkets && (
          <span className="font-mono text-[10px] tracking-[1.5px] uppercase text-gold cursor-pointer hover:text-gold-dim">
            {marketAddresses.length} markets
          </span>
        )}
      </div>

      <div className="border-y border-border overflow-hidden relative">
        <div className="absolute top-0 bottom-0 left-0 w-[60px] bg-gradient-to-r from-bg to-transparent z-10 pointer-events-none" />
        <div className="absolute top-0 bottom-0 right-0 w-[60px] bg-gradient-to-l from-bg to-transparent z-10 pointer-events-none" />
        <div className="flex gap-0 px-6 md:px-12 overflow-x-auto hide-scrollbar">
          {isLoading ? (
            <div className="flex-none px-6 py-3.5 min-w-[340px]">
              <div className="font-mono text-[11px] text-text-dim animate-pulse">Loading markets...</div>
            </div>
          ) : hasMarkets ? (
            marketAddresses.slice(0, 10).map((addr, i) => (
              <div key={addr} onClick={() => setExpandedMarket(addr)}>
                <TickerItem address={addr} isFirst={i === 0} />
              </div>
            ))
          ) : (
            <div className="flex-none px-6 py-3.5 min-w-[340px]">
              <div className="font-mono text-[11px] text-text-dim">No markets deployed yet</div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ UPCOMING RACES ═══ */}
      <div className="flex items-center justify-between px-6 md:px-12 pt-5 pb-3">
        <span className="font-mono text-[11px] tracking-[2.5px] uppercase text-text-dim">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold mr-2 align-middle" />
          Upcoming Races
        </span>
      </div>

      <div className="flex gap-3 px-6 md:px-12 pb-6 overflow-x-auto hide-scrollbar">
        {hasMarkets ? (
          marketAddresses.slice(0, 8).map((addr) => (
            <div key={addr} onClick={() => setExpandedMarket(addr)}>
              <UpcomingCard address={addr} />
            </div>
          ))
        ) : (
          <div className="font-mono text-[11px] text-text-dim py-4">Loading...</div>
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
        {hasMarkets ? (
          marketAddresses.map((addr) => (
            <div key={addr} onClick={() => setExpandedMarket(addr)}>
              <MarketCard address={addr} />
            </div>
          ))
        ) : (
          <div className="font-mono text-[11px] text-text-dim py-4">Loading...</div>
        )}
      </div>
    </main>
  );
}
