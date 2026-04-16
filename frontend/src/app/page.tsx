"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import Header from "@/components/Header";
import RaceCard from "@/components/RaceCard";
import { useMarketAddresses } from "@/hooks/useMarkets";
import { CONTRACTS } from "@/lib/contracts";

// ── Mock data for development (shown when contracts aren't deployed) ──
const MOCK_RACES = [
  {
    id: "cheltenham-gold-cup-2026",
    name: "Cheltenham Gold Cup",
    venue: "Cheltenham",
    time: "3:30 PM GMT",
    date: "March 13, 2026",
    status: "pre-race" as const,
    horses: [
      { name: "Galopin des Champs", jockey: "P. Townend", price: 0.32, shares: 320 },
      { name: "L'Homme Presse", jockey: "C. Deutsch", price: 0.22, shares: 220 },
      { name: "Fastorslow", jockey: "J.W. Kennedy", price: 0.18, shares: 180 },
      { name: "Shishkin", jockey: "N. de Boinville", price: 0.14, shares: 140 },
      { name: "Gerri Colombe", jockey: "M.P. Walsh", price: 0.08, shares: 80 },
      { name: "Bravemansgame", jockey: "H. Cobden", price: 0.06, shares: 60 },
    ],
  },
  {
    id: "champion-hurdle-2026",
    name: "Champion Hurdle",
    venue: "Cheltenham",
    time: "1:30 PM GMT",
    date: "March 11, 2026",
    status: "in-race" as const,
    horses: [
      { name: "Constitution Hill", jockey: "N. de Boinville", price: 0.58, shares: 580 },
      { name: "State Man", jockey: "P. Townend", price: 0.22, shares: 220 },
      { name: "Lossiemouth", jockey: "D. Mullins", price: 0.12, shares: 120 },
      { name: "Sir Gino", jockey: "H. Cobden", price: 0.05, shares: 50 },
      { name: "Doyen Quest", jockey: "R. Blackmore", price: 0.03, shares: 30 },
    ],
  },
  {
    id: "arkle-challenge-2026",
    name: "Arkle Challenge Trophy",
    venue: "Cheltenham",
    time: "1:30 PM GMT",
    date: "March 12, 2026",
    status: "settled" as const,
    winner: 0,
    horses: [
      { name: "Ballyburn", jockey: "P. Townend", price: 0.45, shares: 450 },
      { name: "Fil Dor", jockey: "M.P. Walsh", price: 0.25, shares: 250 },
      { name: "Sir Gino", jockey: "H. Cobden", price: 0.18, shares: 180 },
      { name: "Embassy Gardens", jockey: "J.W. Kennedy", price: 0.12, shares: 120 },
    ],
  },
];

type FilterType = "all" | "pre-race" | "in-race" | "settled" | "cancelled";

const isContractsDeployed =
  CONTRACTS.factory !== "0x0000000000000000000000000000000000000000";

export default function Home() {
  const [filter, setFilter] = useState<FilterType>("all");
  const { isConnected } = useAccount();
  const { addresses: marketAddresses, isLoading } = useMarketAddresses();

  // Determine if we should show live data or mock data
  const useLiveData = isContractsDeployed && marketAddresses.length > 0;

  const filtered =
    filter === "all" ? MOCK_RACES : MOCK_RACES.filter((r) => r.status === filter);

  return (
    <main className="min-h-screen">
      <Header />

      {/* Testnet banner */}
      {!isContractsDeployed && (
        <div className="bg-gold/5 border-b border-gold/20 px-6 md:px-12 py-3">
          <p className="text-gold/80 text-xs font-mono tracking-wide text-center">
            Demo Mode — contracts not yet deployed. Showing mock data.
            Deploy to Monad testnet to see live markets.
          </p>
        </div>
      )}

      {/* Filter tabs */}
      <nav className="flex border-b border-border overflow-x-auto px-6 md:px-12 gap-1 py-2">
        {(["all", "pre-race", "in-race", "settled", "cancelled"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`font-mono text-[10px] tracking-[2px] uppercase px-4 py-2 rounded-full transition-colors whitespace-nowrap ${
              filter === f
                ? "text-gold bg-gold/10 border border-gold/30"
                : "text-text-dim hover:text-text-primary hover:bg-surface-card/50 border border-transparent"
            }`}
          >
            {f === "all"
              ? "All Races"
              : f === "in-race"
              ? "Live Now"
              : f === "pre-race"
              ? "Upcoming"
              : f === "cancelled"
              ? "Cancelled"
              : "Settled"}
          </button>
        ))}
      </nav>

      {/* Race list */}
      <div className="px-4 sm:px-6 md:px-12 py-6 space-y-4">
        {useLiveData ? (
          // Live mode: render a RaceCard for each on-chain market
          marketAddresses.map((addr) => (
            <RaceCard key={addr} marketAddress={addr} />
          ))
        ) : (
          // Demo mode: show mock data
          filtered.map((race) => (
            <RaceCard key={race.id} mockData={race} />
          ))
        )}

        {!useLiveData && filtered.length === 0 && (
          <div className="text-center py-20 text-text-dim">
            <p className="font-mono text-xs tracking-widest uppercase">No races found</p>
          </div>
        )}

        {useLiveData && marketAddresses.length === 0 && !isLoading && (
          <div className="text-center py-20">
            <div className="inline-block bg-surface-card/50 border border-border rounded-lg px-8 py-6">
              <p className="font-mono text-xs tracking-widest uppercase text-text-dim mb-2">
                No active markets
              </p>
              <p className="text-text-dim text-sm">
                Create a market using the admin scripts to get started.
              </p>
            </div>
          </div>
        )}

        {useLiveData && isLoading && (
          <div className="text-center py-20 text-text-dim">
            <p className="font-mono text-xs tracking-widest uppercase animate-pulse">
              Loading markets from chain...
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
