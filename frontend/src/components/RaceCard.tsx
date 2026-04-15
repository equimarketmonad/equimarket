"use client";

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { useMarketData, useScratchedStatus, useUserPositions } from "@/hooks/useMarkets";
import { useBuyShares, useSellShares, useClaim, useApproveUSDC, useUSDCAllowance, useClaimCancelRefund } from "@/hooks/useMarketActions";
import { formatUSDC, toShares, toUSDC, fromFixedPoint } from "@/lib/contracts";

// ── Types ──

interface MockHorse {
  name: string;
  jockey: string;
  price: number;
  shares: number;
  scratched?: boolean;
}

interface MockRace {
  id: string;
  name: string;
  venue: string;
  time: string;
  date: string;
  status: "pre-race" | "in-race" | "settled" | "cancelled";
  winner?: number;
  horses: MockHorse[];
}

interface RaceCardProps {
  marketAddress?: `0x${string}`;
  mockData?: MockRace;
}

// ── Status styling ──

const STATUS_STYLES = {
  "pre-race": { label: "Upcoming", color: "text-text-dim", dot: "bg-text-dim" },
  "in-race": { label: "Live", color: "text-accent-green", dot: "bg-accent-green animate-pulse" },
  settled: { label: "Settled", color: "text-gold", dot: "bg-gold" },
  cancelled: { label: "Cancelled", color: "text-accent-red", dot: "bg-accent-red" },
};

const BAR_COLORS = [
  "bg-gold/60",
  "bg-accent-blue/50",
  "bg-accent-green/45",
  "bg-accent-red/40",
  "bg-purple-400/35",
  "bg-teal-400/30",
];

// ── Component ──

export default function RaceCard({ marketAddress, mockData }: RaceCardProps) {
  const [selectedHorse, setSelectedHorse] = useState<number | null>(null);
  const [stakeInput, setStakeInput] = useState("");
  const [mode, setMode] = useState<"buy" | "sell">("buy");

  const { address: userAddress, isConnected } = useAccount();

  // ── On-chain data (only fetched if marketAddress is provided) ──
  const { data: market } = useMarketData(marketAddress);
  const scratchedStatus = useScratchedStatus(marketAddress, market?.numOutcomes ?? 0);
  const userPositions = useUserPositions(marketAddress, userAddress, market?.numOutcomes ?? 0);

  // ── Actions ──
  const { approve, isPending: isApproving } = useApproveUSDC();
  const { allowance } = useUSDCAllowance(userAddress, marketAddress);
  const { buy, isPending: isBuying, isConfirming: isBuyConfirming } = useBuyShares(marketAddress);
  const { sell, isPending: isSelling, isConfirming: isSellConfirming } = useSellShares(marketAddress);
  const { claim, isPending: isClaiming } = useClaim(marketAddress);
  const { claimRefund: claimCancelRefund, isPending: isClaimingCancel } = useClaimCancelRefund(marketAddress);

  // ── Derive display data from either mock or on-chain ──

  const isLive = !!market;

  const raceStatus: "pre-race" | "in-race" | "settled" | "cancelled" = isLive
    ? market.cancelled
      ? "cancelled"
      : market.settled
      ? "settled"
      : Date.now() / 1000 > market.closesAt
      ? "settled" // closed but not settled yet — show as settled-ish
      : "pre-race"
    : mockData?.status ?? "pre-race";

  const numOutcomes = isLive ? market.numOutcomes : mockData?.horses.length ?? 0;
  const winnerIndex = isLive ? market.winningOutcome : mockData?.winner;
  const isCancelled = raceStatus === "cancelled";
  const status = STATUS_STYLES[raceStatus];
  const baseFeeRate = isLive ? market.baseFeeRate : 400;

  // Build horse display array
  const horses = Array.from({ length: numOutcomes }, (_, i) => {
    if (isLive) {
      const isScratched = scratchedStatus[i];
      const price = market.prices[i] ?? 0;
      return {
        name: `Horse #${i + 1}`, // on-chain markets don't store names — your backend maps raceId → horse metadata
        jockey: "",
        price,
        shares: Number(userPositions[i] ?? BigInt(0)) / 1e18,
        scratched: isScratched,
      };
    }
    return mockData!.horses[i];
  });

  // ── Handlers ──

  const handleBuy = useCallback(() => {
    if (!marketAddress || selectedHorse === null || !stakeInput) return;
    const shares = toShares(Number(stakeInput));
    // Check allowance first
    const estimatedCost = toUSDC(Number(stakeInput) * 2); // generous allowance
    if (allowance < estimatedCost) {
      approve(marketAddress, estimatedCost * BigInt(10)); // approve 10x to avoid repeated approvals
      return;
    }
    buy(selectedHorse, shares);
  }, [marketAddress, selectedHorse, stakeInput, allowance, approve, buy]);

  const handleSell = useCallback(() => {
    if (!marketAddress || selectedHorse === null || !stakeInput) return;
    const shares = toShares(Number(stakeInput));
    sell(selectedHorse, shares);
  }, [marketAddress, selectedHorse, stakeInput, sell]);

  const isTransacting = isBuying || isSelling || isBuyConfirming || isSellConfirming || isApproving;

  return (
    <div className={`bg-surface border rounded-sm overflow-hidden ${isCancelled ? "border-accent-red/30" : "border-border"}`}>
      {/* Cancellation banner */}
      {isCancelled && (
        <div className="bg-accent-red/10 border-b border-accent-red/20 px-5 py-3 flex items-center justify-between">
          <p className="text-accent-red text-xs font-semibold tracking-wide uppercase">
            Race Cancelled — Refunds at market value
          </p>
          {isConnected && isLive && (
            <button
              onClick={() => claimCancelRefund()}
              disabled={isClaimingCancel}
              className="font-mono text-[10px] tracking-[1.5px] uppercase px-4 py-1.5 rounded-sm bg-accent-red/20 text-accent-red border border-accent-red/30 hover:bg-accent-red/30 transition-colors disabled:opacity-50"
            >
              {isClaimingCancel ? "Claiming..." : "Claim Refund"}
            </button>
          )}
        </div>
      )}

      {/* Race header */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-4">
          <div>
            <h3 className="font-semibold text-sm">
              {isLive ? `Market ${marketAddress?.slice(0, 8)}...` : mockData?.name}
            </h3>
            <p className="text-text-dim text-xs mt-0.5">
              {isLive ? (
                <>
                  {market.numOutcomes} runners &middot; Pool: ${formatUSDC(market.totalDeposited)}
                </>
              ) : (
                <>
                  {mockData?.venue} &middot; {mockData?.date} &middot; {mockData?.time}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
          <span className={`font-mono text-[9px] tracking-[2px] uppercase ${status.color}`}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Horse list */}
      <div className="px-5 py-3">
        {horses.map((horse, i) => {
          const isScratched = horse.scratched === true;
          const odds = isScratched || horse.price === 0 ? "---" : (1 / horse.price).toFixed(2);
          const pct = isScratched ? "---" : (horse.price * 100).toFixed(1);
          const isWinner = raceStatus === "settled" && winnerIndex === i;
          const isSelected = selectedHorse === i;
          const userShareCount = isLive ? Number(userPositions[i] ?? BigInt(0)) / 1e18 : 0;

          return (
            <div
              key={i}
              onClick={() => {
                if (raceStatus !== "settled" && !isCancelled && !isScratched)
                  setSelectedHorse(isSelected ? null : i);
              }}
              className={`grid grid-cols-[140px_1fr_56px_56px] md:grid-cols-[180px_1fr_70px_70px] items-center gap-3 py-2.5 border-b border-border/50 last:border-0 transition-colors
                ${isScratched || isCancelled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
                ${isSelected && !isScratched && !isCancelled ? "bg-gold/5" : !isScratched && !isCancelled ? "hover:bg-surface-2" : ""}
                ${isWinner ? "bg-accent-green/5" : ""}
              `}
            >
              {/* Horse name + user position */}
              <div>
                <p className={`text-[13px] font-medium
                  ${isScratched ? "line-through text-text-dim" : ""}
                  ${isWinner ? "text-accent-green" : ""}
                  ${i === 0 && raceStatus !== "settled" && !isScratched ? "text-gold" : ""}
                `}>
                  {isWinner && <span className="mr-1">&#x2713;</span>}
                  {isScratched && <span className="mr-1 text-accent-red no-underline">SCR</span>}
                  {horse.name}
                </p>
                <p className="text-text-dim text-[11px]">
                  {isScratched
                    ? "Scratched — refund at market value"
                    : userShareCount > 0
                    ? `${userShareCount.toFixed(1)} shares held`
                    : horse.jockey}
                </p>
              </div>

              {/* Probability bar */}
              <div className="h-7 bg-surface-3 rounded-sm overflow-hidden relative">
                {!isScratched && (
                  <div
                    className={`h-full rounded-sm transition-all duration-700 ease-out ${BAR_COLORS[i % BAR_COLORS.length]}`}
                    style={{ width: `${horse.price * 100}%` }}
                  />
                )}
                {isScratched && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-px w-full bg-accent-red/30" />
                  </div>
                )}
              </div>

              {/* Probability % */}
              <p className="font-mono text-xs text-text-dim text-right">
                {pct}
                {!isScratched && "%"}
              </p>

              {/* Decimal odds */}
              <p className="font-mono text-xs text-gold text-right">
                {odds}
                {!isScratched && odds !== "---" && "x"}
              </p>
            </div>
          );
        })}
      </div>

      {/* Claim banner for settled markets */}
      {raceStatus === "settled" && isConnected && isLive && winnerIndex !== undefined && (
        (() => {
          const winShares = Number(userPositions[winnerIndex] ?? BigInt(0)) / 1e18;
          if (winShares <= 0) return null;
          return (
            <div className="px-5 py-4 border-t border-accent-green/20 bg-accent-green/[0.03]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-accent-green text-xs font-semibold">
                    You won! {winShares.toFixed(1)} shares &times; $1.00
                  </p>
                  <p className="text-text-dim text-[11px] mt-0.5">
                    Claim ${winShares.toFixed(2)} USDC
                  </p>
                </div>
                <button
                  onClick={() => claim()}
                  disabled={isClaiming}
                  className="font-mono text-[10px] tracking-[1.5px] uppercase px-5 py-2 rounded-sm bg-accent-green/20 text-accent-green border border-accent-green/30 hover:bg-accent-green/30 transition-colors disabled:opacity-50"
                >
                  {isClaiming ? "Claiming..." : "Claim Winnings"}
                </button>
              </div>
            </div>
          );
        })()
      )}

      {/* Trading panel (shows when a horse is selected in open market) */}
      {selectedHorse !== null && raceStatus !== "settled" && !isCancelled && !horses[selectedHorse]?.scratched && (
        <div className="px-5 py-4 border-t border-gold/20 bg-gold/[0.03]">
          <div className="flex-1">
            {/* Buy/Sell toggle */}
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => setMode("buy")}
                className={`font-mono text-[10px] tracking-[1.5px] uppercase px-3 py-1.5 rounded-sm border transition-colors ${
                  mode === "buy"
                    ? "border-gold/60 text-gold bg-gold/10"
                    : "border-border text-text-dim hover:text-text-primary"
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setMode("sell")}
                className={`font-mono text-[10px] tracking-[1.5px] uppercase px-3 py-1.5 rounded-sm border transition-colors ${
                  mode === "sell"
                    ? "border-accent-blue/60 text-accent-blue bg-accent-blue/10"
                    : "border-border text-text-dim hover:text-text-primary"
                }`}
              >
                Sell
              </button>
              <span className="text-text-dim text-[11px] ml-2">
                {mode === "buy" ? "Back" : "Sell"}{" "}
                <span className="text-gold font-semibold">{horses[selectedHorse].name}</span>
              </span>
            </div>

            <div className="flex gap-2">
              <input
                type="number"
                placeholder={mode === "buy" ? "Shares to buy" : "Shares to sell"}
                value={stakeInput}
                onChange={(e) => setStakeInput(e.target.value)}
                className="flex-1 bg-surface-2 border border-border-bright rounded-sm px-3 py-2 text-sm font-mono text-text-primary placeholder-text-dim/50 focus:outline-none focus:border-gold/50"
              />
              {isConnected && isLive ? (
                <button
                  onClick={mode === "buy" ? handleBuy : handleSell}
                  disabled={isTransacting || !stakeInput || Number(stakeInput) <= 0}
                  className={`font-mono text-[10px] tracking-[1.5px] uppercase px-5 py-2 rounded-sm font-semibold transition-colors disabled:opacity-50 ${
                    mode === "buy"
                      ? "bg-gold/90 text-bg hover:bg-gold"
                      : "bg-accent-blue/90 text-bg hover:bg-accent-blue"
                  }`}
                >
                  {isTransacting
                    ? "Confirming..."
                    : isApproving
                    ? "Approving..."
                    : mode === "buy"
                    ? "Buy Shares"
                    : "Sell Shares"}
                </button>
              ) : (
                <button
                  disabled
                  className="font-mono text-[10px] tracking-[1.5px] uppercase px-5 py-2 rounded-sm bg-gold/90 text-bg font-semibold opacity-50"
                >
                  {isConnected ? "Demo Mode" : "Connect Wallet"}
                </button>
              )}
            </div>

            {/* Fee breakdown */}
            {stakeInput && Number(stakeInput) > 0 &&
              (() => {
                const shares = Number(stakeInput);
                const p = horses[selectedHorse].price;
                const feeMultiplier = (baseFeeRate / 10000) * p * (1 - p);

                if (mode === "buy") {
                  const estimatedCost = shares * p; // rough estimate (actual from quoteBuy on-chain)
                  const fee = estimatedCost * feeMultiplier;
                  const totalCost = estimatedCost + fee;
                  const payout = shares; // each winning share pays $1
                  return (
                    <div className="text-xs text-text-dim mt-2 space-y-0.5">
                      <p>
                        Est. cost: <span className="text-text-primary font-mono">${estimatedCost.toFixed(2)}</span>
                        {" + "}
                        <span className="text-text-primary font-mono">${fee.toFixed(4)}</span>
                        <span className="text-text-dim/60 ml-1">fee ({(feeMultiplier * 100).toFixed(2)}%)</span>
                      </p>
                      <p>
                        If wins: <span className="text-accent-green font-mono">${payout.toFixed(2)}</span>
                        <span className="text-text-dim/60 ml-1">({(payout / totalCost).toFixed(1)}x return)</span>
                      </p>
                    </div>
                  );
                } else {
                  const proceeds = shares * p;
                  const fee = proceeds * feeMultiplier;
                  const net = proceeds - fee;
                  return (
                    <div className="text-xs text-text-dim mt-2 space-y-0.5">
                      <p>
                        Est. proceeds: <span className="text-text-primary font-mono">${proceeds.toFixed(2)}</span>
                        {" - "}
                        <span className="text-text-primary font-mono">${fee.toFixed(4)}</span>
                        <span className="text-text-dim/60 ml-1">fee</span>
                      </p>
                      <p>
                        You receive: <span className="text-accent-blue font-mono">${net.toFixed(2)}</span>
                      </p>
                    </div>
                  );
                }
              })()}
          </div>
        </div>
      )}
    </div>
  );
}
