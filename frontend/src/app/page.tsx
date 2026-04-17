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

/** Convert an ISO datetime or raw time string to the user's local time (e.g. "10:45 AM") */
function localTime(offDt: string | null | undefined, offTime: string | undefined): string {
  if (offDt) {
    const d = new Date(offDt);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
  }
  return offTime || "";
}

const REGION_FLAGS: Record<string, { flag: string; label: string }> = {
  GB: { flag: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}", label: "GB" },   // England flag
  IRE: { flag: "\u{1F1EE}\u{1F1EA}", label: "IRE" },  // Ireland
  FR: { flag: "\u{1F1EB}\u{1F1F7}", label: "FR" },    // France
  US: { flag: "\u{1F1FA}\u{1F1F8}", label: "US" },
  AUS: { flag: "\u{1F1E6}\u{1F1FA}", label: "AUS" },
  HK: { flag: "\u{1F1ED}\u{1F1F0}", label: "HK" },
  UAE: { flag: "\u{1F1E6}\u{1F1EA}", label: "UAE" },
  JPN: { flag: "\u{1F1EF}\u{1F1F5}", label: "JPN" },
};

function RegionBadge({ region }: { region?: string }) {
  const r = REGION_FLAGS[region || ""] || { flag: "\u{1F3C7}", label: region || "" };
  return (
    <span className="font-mono text-[10px] text-text-dim whitespace-nowrap">
      <span className="text-[13px] mr-1 align-middle">{r.flag}</span>
      {r.label}
    </span>
  );
}

export default function Home() {
  const { data, isLoading, error } = useMarketsAPI();
  const [expandedMarket, setExpandedMarket] = useState<`0x${string}` | null>(null);

  const markets = data?.all || [];
  // "Racing now" = off time has passed (closesAt < now) but not yet settled — horses are on the track
  const now = Date.now() / 1000;
  const racingNow = markets.filter((m) => !m.settled && !m.cancelled && m.closesAt < now);
  const tickerMarkets = racingNow.length > 0 ? racingNow : markets.filter((m) => !m.settled && !m.cancelled).slice(0, 6);

  // Compute race number per course (R1, R2, R3… based on off-time order)
  const raceNumMap = new Map<string, number>();
  if (markets.length > 0) {
    const byCourse: Record<string, typeof markets> = {};
    for (const m of markets) {
      const course = m.meta?.course || "Unknown";
      if (!byCourse[course]) byCourse[course] = [];
      byCourse[course].push(m);
    }
    for (const course of Object.keys(byCourse)) {
      byCourse[course]
        .sort((a, b) => a.closesAt - b.closesAt)
        .forEach((m, i) => raceNumMap.set(m.address, i + 1));
    }
  }

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
                className={`flex-none flex items-center gap-4 px-5 py-3.5 min-w-[180px] cursor-pointer hover:bg-gold/[0.04] transition-colors ${i > 0 ? "border-l border-border" : "border-x border-border"}`}
              >
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <div className={`font-mono text-[9px] tracking-[2px] uppercase px-2 py-0.5 rounded-full flex items-center gap-1.5 whitespace-nowrap ${
                    !m.settled && !m.cancelled
                      ? "text-accent-green bg-accent-green/10 border border-accent-green/30"
                      : m.settled
                      ? "text-gold bg-gold/10 border border-gold/25"
                      : "text-text-dim bg-text-dim/10 border border-text-dim/30"
                  }`}>
                    {!m.settled && !m.cancelled && <span className="w-[5px] h-[5px] rounded-full bg-accent-green animate-pulse" />}
                    R{raceNumMap.get(m.address) || "?"}
                  </div>
                  <RegionBadge region={m.meta?.region} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-sm font-semibold text-text-primary truncate">{m.meta?.course}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ═══ UPCOMING RACES ═══ */}
      {(() => {
        // Races within 60 minutes of start, not yet started, sorted soonest first.
        // Use offDt if available (future markets have closesAt = off time + 7 days),
        // otherwise fall back to closesAt (current markets where closesAt = off time).
        const getOffTimestamp = (m: typeof markets[0]) => {
          if (m.meta?.offDt) {
            const d = new Date(m.meta.offDt);
            if (!isNaN(d.getTime())) return d.getTime() / 1000;
          }
          return m.closesAt;
        };
        const upcoming = markets
          .filter((m) => {
            if (m.settled || m.cancelled) return false;
            const offTs = getOffTimestamp(m);
            return offTs > now && (offTs - now) <= 3600;
          })
          .sort((a, b) => getOffTimestamp(a) - getOffTimestamp(b));
        if (upcoming.length === 0 && !isLoading) return null;
        return (
          <>
            <div className="flex items-center justify-between px-6 md:px-12 pt-5 pb-3">
              <span className="font-mono text-[11px] tracking-[2.5px] uppercase text-text-dim">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold mr-2 align-middle" />
                Upcoming Races
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
                upcoming.map((m) => {
                  const minsUntil = Math.max(0, Math.round((getOffTimestamp(m) - now) / 60));
                  return (
                    <div
                      key={m.address}
                      onClick={() => setExpandedMarket(m.address as `0x${string}`)}
                      className="flex-none w-[260px] bg-surface border border-border rounded-xl p-4 cursor-pointer hover:border-border-bright hover:-translate-y-0.5 transition-all"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-[10px] tracking-[1.5px] uppercase px-2 py-0.5 rounded-full text-accent-green bg-accent-green/10 border border-accent-green/30">
                          {minsUntil <= 1 ? "Race off soon" : `Race off in ${minsUntil}m`}
                        </span>
                        <div className="flex items-center gap-2">
                          <RegionBadge region={m.meta?.region} />
                          <span className="font-mono text-[10px] text-text-dim">R{raceNumMap.get(m.address) || "?"}</span>
                        </div>
                      </div>
                      <div className="font-serif text-lg font-bold text-text-primary mb-0.5 truncate">{m.meta?.course}</div>
                      <div className="font-mono text-[10px] text-text-dim mb-3 truncate">{m.meta?.name} — {m.numOutcomes} runners</div>
                      {(() => {
                        const favRunner = m.meta?.runners?.[m.favourite.index];
                        const odds = m.favourite.odds ? Math.round(parseFloat(m.favourite.odds)) + "/1" : "---";
                        return (
                          <div className="bg-surface-2 rounded-lg px-3 py-2.5">
                            <div className="font-mono text-[9px] text-text-dim uppercase tracking-[1px] mb-1.5">Favorite</div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <GateNum gate={favRunner?.draw || favRunner?.number || m.favourite.index + 1} />
                                <div>
                                  <div className="text-xs font-medium text-text-primary">{m.favourite.name}</div>
                                  <div className="font-mono text-[10px] text-text-dim">{m.favourite.jockey}</div>
                                </div>
                              </div>
                              <span className="font-mono text-xs font-semibold text-gold bg-gold/10 border border-gold/25 px-3.5 py-1 rounded-lg">
                                {odds}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })
              )}
            </div>
          </>
        );
      })()}

      {/* ═══ POPULAR MARKETS ═══ */}
      {markets.length > 0 && (() => {
        const popular = markets
          .filter((m) => !m.settled && !m.cancelled)
          .sort((a, b) => b.totalDeposited - a.totalDeposited)
          .slice(0, 8);
        if (popular.length === 0) return null;
        return (
          <>
            <div className="flex items-center justify-between px-6 md:px-12 pt-5 pb-3">
              <span className="font-mono text-[11px] tracking-[2.5px] uppercase text-text-dim">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold mr-2 align-middle" />
                Popular Markets
              </span>
            </div>
            <div className="flex gap-4 px-6 md:px-12 pb-6 overflow-x-auto hide-scrollbar">
              {popular.map((m) => {
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
                        <div className="flex items-center gap-2 mb-1">
                          <RegionBadge region={m.meta?.region} />
                          <span className="font-mono text-[10px] text-text-dim">R{raceNumMap.get(m.address) || "?"}</span>
                        </div>
                        <div className="font-serif text-[17px] font-bold text-text-primary mb-0.5 truncate">{m.meta?.course}</div>
                        <div className="font-mono text-[10px] text-text-dim truncate">{m.meta?.name}</div>
                      </div>
                      <div className="text-right ml-3">
                        <div className="font-mono text-[9px] text-text-dim uppercase tracking-[1px]">Pool</div>
                        <div className="font-mono text-base text-gold font-semibold">${formatPool(m.totalDeposited)}</div>
                      </div>
                    </div>
                    <div className="px-5 pb-4">
                      {runners.map((runner, hi) => {
                        const odds = runner.price > 0 ? Math.round(1 / runner.price) + "/1" : "---";
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
                      <span className="font-mono text-[9px] tracking-[1.5px] uppercase px-2 py-0.5 rounded-full text-accent-green bg-accent-green/10 border border-accent-green/30">
                        Market Open
                      </span>
                      <span className="font-mono text-[10px] text-text-dim">{m.numOutcomes} runners</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      <div className="h-px bg-border mx-6 md:mx-12" />

      {/* ═══ TOP TRACKS ═══ */}
      <div className="flex items-center justify-between px-6 md:px-12 pt-5 pb-3">
        <span className="font-mono text-[11px] tracking-[2.5px] uppercase text-text-dim">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold-dim mr-2 align-middle" />
          Top Tracks
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
                    {!m.settled && !m.cancelled ? "Market Open" : "Settled"}
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
