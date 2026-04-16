"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import Header from "@/components/Header";
import RaceCard from "@/components/RaceCard";
import { useMarketAddresses } from "@/hooks/useMarkets";
import { CONTRACTS } from "@/lib/contracts";

// ── Design mode: set to true to preview the branded homepage ──
const DESIGN_MODE = true;

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

// ── Mock data ──
const LIVE_RACES = [
  { id: "champion-hurdle", name: "Champion Hurdle", venue: "Cheltenham", time: "1:30 PM", leader: "Constitution Hill", odds: "48% — $2.08", pool: "$12,400" },
  { id: "dubai-world-cup", name: "Dubai World Cup", venue: "Meydan", time: "7:40 PM", leader: "Laurel River", odds: "35% — $2.86", pool: "$28,600" },
  { id: "prix-saint-alary", name: "Prix Saint-Alary", venue: "Longchamp", time: "3:15 PM", leader: "Mqse de Sevigne", odds: "41% — $2.44", pool: "$6,200" },
  { id: "lockinge-stakes", name: "Lockinge Stakes", venue: "Newbury", time: "3:35 PM", leader: "Charyn", odds: "52% — $1.92", pool: "$9,100" },
];

const UPCOMING_RACES = [
  { id: "gold-cup", name: "Cheltenham Gold Cup", venue: "Cheltenham — Apr 18", time: "3:30 PM", runners: 6, fav: "Galopin des Champs", favOdds: "$3.13" },
  { id: "kentucky-derby", name: "Kentucky Derby", venue: "Churchill Downs — May 2", time: "6:57 PM", runners: 8, fav: "Fierceness", favOdds: "$4.55" },
  { id: "king-charles", name: "King Charles III Stakes", venue: "Royal Ascot — Jun 16", time: "2:30 PM", runners: 5, fav: "Big Evs", favOdds: "$3.57" },
  { id: "eclipse", name: "Eclipse Stakes", venue: "Sandown — Jul 5", time: "4:20 PM", runners: 7, fav: "City of Troy", favOdds: "$2.50" },
  { id: "arc-2026", name: "Prix de l'Arc 2026", venue: "Longchamp — Oct 4", time: "5:40 PM", runners: 10, fav: "Ace Impact", favOdds: "$3.33" },
];

const POPULAR_MARKETS = [
  {
    id: "pop-derby", name: "Kentucky Derby", venue: "Churchill Downs — May 2", volume: "$142,800", status: "upcoming" as const, runners: 8,
    horses: [
      { name: "Fierceness", jockey: "J. Velazquez", gate: 3, odds: "7/2" },
      { name: "Sierra Leone", jockey: "F. Prat", gate: 7, odds: "9/2" },
      { name: "Catching Freedom", jockey: "T. Gaffalione", gate: 2, odds: "11/2" },
      { name: "Resilience", jockey: "I. Ortiz Jr.", gate: 11, odds: "13/2" },
    ],
  },
  {
    id: "pop-hurdle", name: "Champion Hurdle", venue: "Cheltenham — Today", volume: "$89,400", status: "live" as const, runners: 5,
    horses: [
      { name: "Constitution Hill", jockey: "N. de Boinville", gate: 1, odds: "11/8" },
      { name: "State Man", jockey: "P. Townend", gate: 4, odds: "11/4" },
      { name: "Lossiemouth", jockey: "D. Mullins", gate: 6, odds: "6/1" },
      { name: "Doyen Quest", jockey: "R. Blackmore", gate: 3, odds: "8/1" },
    ],
  },
  {
    id: "pop-dubai", name: "Dubai World Cup", venue: "Meydan — Today", volume: "$71,200", status: "live" as const, runners: 6,
    horses: [
      { name: "Laurel River", jockey: "W. Buick", gate: 8, odds: "2/1" },
      { name: "Ushba Tesoro", jockey: "Y. Take", gate: 5, odds: "3/1" },
      { name: "Senor Buscador", jockey: "J. Rosario", gate: 2, odds: "9/2" },
      { name: "Kabirkhan", jockey: "L. Dettori", gate: 4, odds: "7/1" },
    ],
  },
  {
    id: "pop-goldcup", name: "Cheltenham Gold Cup", venue: "Cheltenham — Apr 18", volume: "$56,300", status: "upcoming" as const, runners: 7,
    horses: [
      { name: "Galopin des Champs", jockey: "P. Townend", gate: 1, odds: "2/1" },
      { name: "L'Homme Presse", jockey: "C. Deutsch", gate: 5, odds: "7/2" },
      { name: "Fastorslow", jockey: "J.W. Kennedy", gate: 3, odds: "9/2" },
      { name: "Shishkin", jockey: "N. de Boinville", gate: 8, odds: "6/1" },
    ],
  },
];

// Full mock data for RaceCard fallback
const MOCK_RACES = [
  {
    id: "champion-hurdle-2026", name: "Champion Hurdle", venue: "Cheltenham", time: "1:30 PM GMT", date: "April 15, 2026", status: "in-race" as const,
    horses: [
      { name: "Constitution Hill", jockey: "N. de Boinville", price: 0.48, shares: 580 },
      { name: "State Man", jockey: "P. Townend", price: 0.27, shares: 320 },
      { name: "Lossiemouth", jockey: "D. Mullins", price: 0.14, shares: 120 },
      { name: "Sir Gino", jockey: "H. Cobden", price: 0.07, shares: 50 },
      { name: "Doyen Quest", jockey: "R. Blackmore", price: 0.04, shares: 30 },
    ],
  },
];

const isContractsDeployed =
  CONTRACTS.factory !== "0x0000000000000000000000000000000000000000";

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

export default function Home() {
  const { isConnected } = useAccount();
  const { addresses: marketAddresses, isLoading } = useMarketAddresses();
  const useLiveData = !DESIGN_MODE && isContractsDeployed && marketAddresses.length > 0;

  if (!DESIGN_MODE && useLiveData) {
    // Live on-chain mode — show RaceCards
    return (
      <main className="min-h-screen">
        <Header />
        <div className="px-4 sm:px-6 md:px-12 py-6 space-y-4">
          {marketAddresses.map((addr) => (
            <RaceCard key={addr} marketAddress={addr} />
          ))}
        </div>
      </main>
    );
  }

  // ── Design / Demo mode: branded homepage ──
  return (
    <main className="min-h-screen">
      <Header />

      {/* ═══ LIVE RACES TICKER ═══ */}
      <div className="flex items-center justify-between px-6 md:px-12 pt-5 pb-3">
        <span className="font-mono text-[11px] tracking-[2.5px] uppercase text-text-dim">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-green shadow-[0_0_8px_rgba(76,175,122,0.5)] animate-pulse mr-2 align-middle" />
          Live Races
        </span>
        <a className="font-mono text-[10px] tracking-[1.5px] uppercase text-gold cursor-pointer hover:text-gold-dim">See all</a>
      </div>

      <div className="border-y border-border overflow-hidden relative">
        <div className="absolute top-0 bottom-0 left-0 w-[60px] bg-gradient-to-r from-bg to-transparent z-10 pointer-events-none" />
        <div className="absolute top-0 bottom-0 right-0 w-[60px] bg-gradient-to-l from-bg to-transparent z-10 pointer-events-none" />
        <div className="flex gap-0 px-6 md:px-12 overflow-x-auto hide-scrollbar">
          {LIVE_RACES.map((race, i) => (
            <div key={race.id} className={`flex-none flex items-start gap-5 px-6 py-3.5 min-w-[340px] cursor-pointer hover:bg-gold/[0.04] transition-colors ${i > 0 ? "border-l border-border" : "border-x border-border"}`}>
              <div className="font-mono text-[9px] tracking-[2px] uppercase text-accent-green bg-accent-green/10 border border-accent-green/30 px-2 py-0.5 rounded-full flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-[5px] h-[5px] rounded-full bg-accent-green animate-pulse" /> Live
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-serif text-sm font-semibold text-text-primary truncate">{race.name}</div>
                <div className="font-mono text-[10px] text-text-dim mt-0.5">{race.venue} — {race.time}</div>
              </div>
              <div className="text-right whitespace-nowrap">
                <div className="font-mono text-[11px] text-gold font-medium">{race.leader}</div>
                <div className="font-mono text-[10px] text-text-dim mt-0.5">{race.odds}</div>
              </div>
              <div className="text-right whitespace-nowrap">
                <div className="font-mono text-[9px] text-text-dim tracking-[1px] uppercase">Pool</div>
                <div className="font-mono text-[13px] text-text-primary font-medium mt-0.5">{race.pool}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ UPCOMING RACES ═══ */}
      <div className="flex items-center justify-between px-6 md:px-12 pt-5 pb-3">
        <span className="font-mono text-[11px] tracking-[2.5px] uppercase text-text-dim">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold mr-2 align-middle" />
          Upcoming Races
        </span>
        <a className="font-mono text-[10px] tracking-[1.5px] uppercase text-gold cursor-pointer hover:text-gold-dim">See all</a>
      </div>

      <div className="flex gap-3 px-6 md:px-12 pb-6 overflow-x-auto hide-scrollbar">
        {UPCOMING_RACES.map((race) => (
          <div key={race.id} className="flex-none w-[260px] bg-surface border border-border rounded-xl p-4 cursor-pointer hover:border-border-bright hover:-translate-y-0.5 transition-all">
            <div className="flex items-center justify-between mb-2.5">
              <span className="font-mono text-[10px] tracking-[1.5px] uppercase text-gold bg-gold/10 border border-gold/25 px-2 py-0.5 rounded-full">{race.time}</span>
              <span className="font-mono text-[10px] text-text-dim">{race.runners} runners</span>
            </div>
            <div className="font-serif text-base font-semibold text-text-primary mb-0.5">{race.name}</div>
            <div className="font-mono text-[10px] text-text-dim mb-3.5">{race.venue}</div>
            <div className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2">
              <div>
                <div className="font-mono text-[9px] text-text-dim uppercase tracking-[1px]">Favourite</div>
                <div className="text-xs font-medium text-text-primary mt-0.5">{race.fav}</div>
              </div>
              <div className="font-mono text-sm text-gold font-semibold">{race.favOdds}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="h-px bg-border mx-6 md:mx-12" />

      {/* ═══ POPULAR MARKETS ═══ */}
      <div className="flex items-center justify-between px-6 md:px-12 pt-5 pb-3">
        <span className="font-mono text-[11px] tracking-[2.5px] uppercase text-text-dim">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold-dim mr-2 align-middle" />
          Popular Markets
        </span>
        <a className="font-mono text-[10px] tracking-[1.5px] uppercase text-gold cursor-pointer hover:text-gold-dim">See all</a>
      </div>

      <div className="flex gap-4 px-6 md:px-12 pb-10 overflow-x-auto hide-scrollbar">
        {POPULAR_MARKETS.map((market) => (
          <div key={market.id} className="flex-none w-[320px] bg-surface border border-border rounded-xl overflow-hidden cursor-pointer hover:border-border-bright hover:-translate-y-0.5 transition-all">
            {/* Banner */}
            <div className="flex items-start justify-between px-5 py-4">
              <div>
                <div className="font-serif text-[17px] font-bold text-text-primary mb-0.5">{market.name}</div>
                <div className="font-mono text-[10px] text-text-dim">{market.venue}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[9px] text-text-dim uppercase tracking-[1px]">Volume</div>
                <div className="font-mono text-base text-gold font-semibold">{market.volume}</div>
              </div>
            </div>

            {/* Runners */}
            <div className="px-5 pb-4">
              {market.horses.map((horse, hi) => (
                <div key={hi} className={`flex items-center justify-between py-1.5 ${hi < market.horses.length - 1 ? "border-b border-border" : ""}`}>
                  <div className="flex items-center gap-2.5">
                    <GateNum gate={horse.gate} />
                    <div>
                      <div className="text-xs font-medium text-text-primary">{horse.name}</div>
                      <div className="font-mono text-[10px] text-text-dim">{horse.jockey}</div>
                    </div>
                  </div>
                  <button className="font-mono text-xs font-semibold text-gold bg-gold/10 border border-gold/25 px-3.5 py-1 rounded-lg hover:bg-gold/20 transition-colors">
                    {horse.odds}
                  </button>
                </div>
              ))}
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between px-5 py-2.5 bg-surface-2 border-t border-border">
              <span className={`font-mono text-[9px] tracking-[1.5px] uppercase px-2 py-0.5 rounded-full ${
                market.status === "live"
                  ? "text-accent-green bg-accent-green/10 border border-accent-green/30"
                  : "text-gold bg-gold/10 border border-gold/25"
              }`}>
                {market.status === "live" ? "Live" : "Upcoming"}
              </span>
              <span className="font-mono text-[10px] text-text-dim">{market.runners} runners</span>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
