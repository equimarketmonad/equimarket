"use client";

import { useState } from "react";
import Header from "@/components/Header";
import RaceCard from "@/components/RaceCard";
import { useMarketsAPI } from "@/hooks/useMarketsAPI";
import type { APIMarket } from "@/hooks/useMarketsAPI";

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

function formatPool(dollars: number): string {
  return dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Home() {
  const { data, isLoading, error } = useMarketsAPI();
  const [expandedMarket, setExpandedMarket] = useState<`0x${string}` | null>(null);

  const markets = data?.all || [];
  // "Racing now" = off time has passed (closesAt < now) but not yet settled — horses are on the track
  const now = Date.now() / 1000;
  const racingNow = markets.filter((m) => !m.settled && !m.cancelled && m.closesAt < now);
  const tickerMarkets = racingNow.length > 0 ? racingNow : markets.filter((m) => !m.settled && !m.cancelled).slice(0, 6);

  return (
    <main className="min-h-screen">
      <Header />

      {/* Expanded market overlay — uses on-chain RaceCard for trading */}
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
          {racingNow.length > 0 ? "Racing Now" : "Live Races"}
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
              <div className="font-mono text-[11px] text-text-dim animate-pulse">Loading markets...</div>
            </div>
          ) : error && markets.length === 0 ? (
            <div className="flex-none px-6 py-3.5 min-w-[340px]">
              <div className="font-mono text-[11px] text-accent-red">API offline — start backend with: npm run dev</div>
            </div>
          ) : markets.length === 0 ? (
            <div className="flex-none px-6 py-3.5 min-w-[340px]">
              <div className="font-mono text-[11px] text-text-dim">No markets deployed yet</div>
            </div>
          ) : (
            tickerMarkets.map((m, i) => (
              <div
                key={m.address}
                onClick={() => setExpandedMarket(m.address as `0x${string}`)}
                className={`flex-none flex items-start gap-5 px-6 py-3.5 min-w-[340px] cursor-pointer hover:bg-gold/[0.04] transition-colors ${i > 0 ? "border-l border-border" : "border-x border-border"}`}
              >
                <div className={`font-mono text-[9px] tracking-[2px] uppercase px-2 py-0.5 rounded-full flex items-center gap-1.5 whitespace-nowrap ${
                  !m.settled && !m.cancelled
                    ? "text-accent-green bg-accent-green/10 border border-accent-green/30"
                    : m.settled
                    ? "text-gold bg-gold/10 border border-gold/25"
                    : "text-text-dim bg-text-dim/10 border border-text-dim/30"
                }`}>
                  {!m.settled && !m.cancelled && <span className="w-[5px] h-[5px] rounded-full bg-accent-green animate-pulse" />}
                  {!m.settled && !m.cancelled ? "Live" : m.settled ? "Settled" : "Cancelled"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-sm font-semibold text-text-primary truncate">{m.meta?.name}</div>
                  <div className="font-mono text-[10px] text-text-dim mt-0.5">{m.meta?.course} — {m.meta?.offTime}</div>
                </div>
                <div className="text-right whitespace-nowrap">
                  <div className="font-mono text-[11px] text-gold font-medium">{m.favourite.name}</div>
                  <div className="font-mono text-[10px] text-text-dim mt-0.5">{m.favourite.pct}% — ${m.favourite.odds}</div>
                </div>
                <div className="text-right whitespace-nowrap">
                  <div className="font-mono text-[9px] text-text-dim tracking-[1px] uppercase">Pool</div>
                  <div className="font-mono text-[13px] text-text-primary font-medium mt-0.5">${formatPool(m.totalDeposited)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ═══ RACE CARDS ═══ */}
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
          markets.slice(0, 10).map((m) => (
            <div
              key={m.address}
              onClick={() => setExpandedMarket(m.address as `0x${string}`)}
              className="flex-none w-[260px] bg-surface border border-border rounded-xl p-4 cursor-pointer hover:border-border-bright hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-center justify-between mb-2.5">
                <span className={`font-mono text-[10px] tracking-[1.5px] uppercase px-2 py-0.5 rounded-full ${
                  !m.settled && !m.cancelled
                    ? "text-accent-green bg-accent-green/10 border border-accent-green/30"
                    : "text-gold bg-gold/10 border border-gold/25"
                }`}>{m.meta?.offTime}</span>
                <span className="font-mono text-[10px] text-text-dim">{m.numOutcomes} runners</span>
              </div>
              <div className="font-serif text-base font-semibold text-text-primary mb-0.5 truncate">{m.meta?.name}</div>
              <div className="font-mono text-[10px] text-text-dim mb-3.5">{m.meta?.course} — {m.meta?.date}</div>
              <div className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2">
                <div>
                  <div className="font-mono text-[9px] text-text-dim uppercase tracking-[1px]">Favourite</div>
                  <div className="text-xs font-medium text-text-primary mt-0.5 truncate max-w-[120px]">{m.favourite.name}</div>
                </div>
                <div className="font-mono text-sm text-gold font-semibold">${m.favourite.odds}</div>
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
          markets.map((m) => {
            const runners = (m.meta?.runners || [])
              .slice()
              .sort((a, b) => b.price - a.price)
              .slice(0, 4);

            return (
              <div
                key={m.address}
                onClick={() => setExpandedMarket(m.address as `0x${string}`)}
                className="flex-none w-[320px] bg-surface border border-border rounded-xl overflow-hidden cursor-pointer hover:border-border-bright hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-start justify-between px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-serif text-[17px] font-bold text-text-primary mb-0.5 truncate">{m.meta?.name}</div>
                    <div className="font-mono text-[10px] text-text-dim">{m.meta?.course} — {m.meta?.date}</div>
                  </div>
                  <div className="text-right ml-3">
                    <div className="font-mono text-[9px] text-text-dim uppercase tracking-[1px]">Pool</div>
                    <div className="font-mono text-base text-gold font-semibold">${formatPool(m.totalDeposited)}</div>
                  </div>
                </div>

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

                <div className="flex items-center justify-between px-5 py-2.5 bg-surface-2 border-t border-border">
                  <span className={`font-mono text-[9px] tracking-[1.5px] uppercase px-2 py-0.5 rounded-full ${
                    !m.settled && !m.cancelled
                      ? "text-accent-green bg-accent-green/10 border border-accent-green/30"
                      : "text-gold bg-gold/10 border border-gold/25"
                  }`}>
                    {!m.settled && !m.cancelled ? "Live" : "Settled"}
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
