"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { useMarketData, useScratchedStatus, useUserPositions } from "@/hooks/useMarkets";
import { useBuyShares, useSellShares, useClaim, useApproveUSDC, useUSDCAllowance, useClaimCancelRefund } from "@/hooks/useMarketActions";
import { formatUSDC, toShares, toUSDC } from "@/lib/contracts";
import { getHorseInfo, getBarColor, getRaceName } from "@/lib/horseNames";
import { useMarketAPI } from "@/hooks/useMarketsAPI";
import Link from "next/link";

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
  "pre-race": { label: "Upcoming", color: "text-text-dim", dot: "bg-text-dim", bg: "bg-text-dim/5" },
  "in-race": { label: "Live", color: "text-accent-green", dot: "bg-accent-green animate-pulse", bg: "bg-accent-green/5" },
  settled: { label: "Settled", color: "text-gold", dot: "bg-gold", bg: "bg-gold/5" },
  cancelled: { label: "Cancelled", color: "text-accent-red", dot: "bg-accent-red", bg: "bg-accent-red/5" },
};

// ── Component ──

export default function RaceCard({ marketAddress, mockData }: RaceCardProps) {
  const [selectedHorse, setSelectedHorse] = useState<number | null>(null);
  const [stakeInput, setStakeInput] = useState("");
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [showDetails, setShowDetails] = useState(false);

  const { address: userAddress, isConnected } = useAccount();

  // ── API metadata (course, going, distance, etc.) ──
  const { data: apiMarket } = useMarketAPI(marketAddress);

  // ── On-chain data ──
  const { data: market } = useMarketData(marketAddress);
  const scratchedStatus = useScratchedStatus(marketAddress, market?.numOutcomes ?? 0);
  const userPositions = useUserPositions(marketAddress, userAddress, market?.numOutcomes ?? 0);

  // ── Actions ──
  const { approve, isPending: isApproving, isSuccess: approveSuccess } = useApproveUSDC();
  const { allowance, refetch: refetchAllowance } = useUSDCAllowance(userAddress, marketAddress);
  const { buy, isPending: isBuying, isConfirming: isBuyConfirming } = useBuyShares(marketAddress);
  const { sell, isPending: isSelling, isConfirming: isSellConfirming } = useSellShares(marketAddress);
  const { claim, isPending: isClaiming } = useClaim(marketAddress);
  const { claimRefund: claimCancelRefund, isPending: isClaimingCancel } = useClaimCancelRefund(marketAddress);

  // ── Derive display data ──

  const isLive = !!market;
  const nowSec = Date.now() / 1000;

  const raceStatus: "pre-race" | "in-race" | "settled" | "cancelled" = isLive
    ? market.cancelled
      ? "cancelled"
      : market.settled
      ? "settled"
      : nowSec > market.closesAt
      ? "pre-race"
      : "in-race"
    : mockData?.status ?? "pre-race";

  const numOutcomes = isLive ? market.numOutcomes : mockData?.horses.length ?? 0;
  const isCancelled = raceStatus === "cancelled";
  const isSettled = raceStatus === "settled";
  const isOpen = raceStatus === "in-race";
  const status = STATUS_STYLES[raceStatus];
  const baseFeeRate = isLive ? market.baseFeeRate : 400;

  // Build horse display array with names
  const horses = Array.from({ length: numOutcomes }, (_, i) => {
    if (isLive) {
      const info = getHorseInfo(i, market.raceId);
      return {
        name: info.name,
        jockey: info.jockey,
        price: market.prices[i] ?? 0,
        shares: Number(userPositions[i] ?? BigInt(0)) / 1e18,
        scratched: scratchedStatus[i],
      };
    }
    return mockData!.horses[i];
  });

  // Total user position value
  const totalUserShares = horses.reduce((sum, h) => sum + (h.shares || 0), 0);

  // ── Auto-buy after approval ──

  const pendingBuyRef = useRef<{ outcome: number; shares: bigint } | null>(null);

  useEffect(() => {
    if (approveSuccess && pendingBuyRef.current) {
      refetchAllowance().then(() => {
        const pending = pendingBuyRef.current;
        if (pending) {
          buy(pending.outcome, pending.shares);
          pendingBuyRef.current = null;
        }
      });
    }
  }, [approveSuccess, refetchAllowance, buy]);

  const handleBuy = useCallback(() => {
    if (!marketAddress || selectedHorse === null || !stakeInput) return;
    const shares = toShares(Number(stakeInput));
    const estimatedCost = toUSDC(Number(stakeInput) * 2);
    if (allowance < estimatedCost) {
      pendingBuyRef.current = { outcome: selectedHorse, shares };
      approve(marketAddress, estimatedCost * BigInt(10));
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

  // ── Time remaining display ──
  const timeRemaining = isLive && !isSettled && !isCancelled
    ? Math.max(0, market.closesAt - nowSec)
    : 0;
  const timeDisplay = timeRemaining > 0
    ? timeRemaining > 3600
      ? `${Math.floor(timeRemaining / 3600)}h ${Math.floor((timeRemaining % 3600) / 60)}m`
      : timeRemaining > 60
      ? `${Math.floor(timeRemaining / 60)}m`
      : `${Math.floor(timeRemaining)}s`
    : null;

  return (
    <div className={`bg-surface border rounded-lg overflow-hidden transition-all ${
      isCancelled ? "border-accent-red/30" :
      isOpen ? "border-accent-green/20" :
      isSettled ? "border-gold/20" :
      "border-border"
    }`}>
      {/* Cancellation banner */}
      {isCancelled && (
        <div className="bg-accent-red/10 border-b border-accent-red/20 px-4 md:px-6 py-3 flex items-center justify-between">
          <p className="text-accent-red text-xs font-semibold tracking-wide uppercase">
            Race Cancelled - Refunds at market value
          </p>
          {isConnected && isLive && (
            <button
              onClick={() => claimCancelRefund()}
              disabled={isClaimingCancel}
              className="font-mono text-[10px] tracking-[1.5px] uppercase px-4 py-1.5 rounded bg-accent-red/20 text-accent-red border border-accent-red/30 hover:bg-accent-red/30 transition-colors disabled:opacity-50"
            >
              {isClaimingCancel ? "Claiming..." : "Claim Refund"}
            </button>
          )}
        </div>
      )}

      {/* Race header */}
      <div className="px-4 md:px-6 py-4 flex items-start md:items-center justify-between border-b border-border gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="font-semibold text-base truncate">
              {isLive ? (
                <Link href={`/race/${marketAddress}`} className="hover:text-gold transition-colors">
                  {getRaceName(market.raceId, marketAddress!)}
                </Link>
              ) : mockData?.name}
            </h3>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-wider uppercase whitespace-nowrap ${status.bg} ${status.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-text-dim text-xs">
            {isLive ? (
              <>
                <span>{market.numOutcomes} runners</span>
                <span className="text-border-bright">|</span>
                <span>Pool: <span className="text-text-primary font-mono">${formatUSDC(market.totalDeposited)}</span></span>
                {timeDisplay && (
                  <>
                    <span className="text-border-bright">|</span>
                    <span className={isOpen ? "text-accent-green" : "text-text-dim"}>
                      {isOpen ? `Closes in ${timeDisplay}` : `Closed`}
                    </span>
                  </>
                )}
                {totalUserShares > 0 && (
                  <>
                    <span className="text-border-bright">|</span>
                    <span className="text-gold">{totalUserShares.toFixed(1)} shares held</span>
                  </>
                )}
              </>
            ) : (
              <>
                <span>{mockData?.venue}</span>
                <span className="text-border-bright">|</span>
                <span>{mockData?.date}</span>
                <span className="text-border-bright">|</span>
                <span>{mockData?.time}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Full race details toggle */}
      {isLive && apiMarket?.meta && (
        <div className="px-4 md:px-6 border-b border-border">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full py-2.5 flex items-center justify-between text-text-dim hover:text-text-primary transition-colors"
          >
            <span className="font-mono text-[10px] tracking-[1.5px] uppercase">Full Race Details</span>
            <span className="font-mono text-[11px]">{showDetails ? "−" : "+"}</span>
          </button>
          {showDetails && (
            <div className="pb-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div>
                <span className="text-text-dim font-mono text-[10px] uppercase tracking-[1px]">Course</span>
                <div className="text-text-primary mt-0.5">{apiMarket.meta.course}</div>
              </div>
              <div>
                <span className="text-text-dim font-mono text-[10px] uppercase tracking-[1px]">Region</span>
                <div className="text-text-primary mt-0.5">{apiMarket.meta.region}</div>
              </div>
              <div>
                <span className="text-text-dim font-mono text-[10px] uppercase tracking-[1px]">Distance</span>
                <div className="text-text-primary mt-0.5">{apiMarket.meta.distance}f</div>
              </div>
              <div>
                <span className="text-text-dim font-mono text-[10px] uppercase tracking-[1px]">Going</span>
                <div className="text-text-primary mt-0.5">{apiMarket.meta.going}</div>
              </div>
              <div>
                <span className="text-text-dim font-mono text-[10px] uppercase tracking-[1px]">Surface</span>
                <div className="text-text-primary mt-0.5">{apiMarket.meta.surface}</div>
              </div>
              <div>
                <span className="text-text-dim font-mono text-[10px] uppercase tracking-[1px]">Type</span>
                <div className="text-text-primary mt-0.5">{apiMarket.meta.type}</div>
              </div>
              {apiMarket.meta.pattern && (
                <div>
                  <span className="text-text-dim font-mono text-[10px] uppercase tracking-[1px]">Class</span>
                  <div className="text-text-primary mt-0.5">{apiMarket.meta.pattern}</div>
                </div>
              )}
              <div>
                <span className="text-text-dim font-mono text-[10px] uppercase tracking-[1px]">Prize</span>
                <div className="text-text-primary mt-0.5">{apiMarket.meta.prize}</div>
              </div>
              <div>
                <span className="text-text-dim font-mono text-[10px] uppercase tracking-[1px]">Off Time</span>
                <div className="text-text-primary mt-0.5">{apiMarket.meta.offTime} ({apiMarket.meta.date})</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Horse list */}
      <div className="px-4 md:px-6 py-2">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_56px_56px] md:grid-cols-[1fr_70px_70px] items-center gap-3 py-2 text-text-dim/60 text-[10px] font-mono tracking-wider uppercase">
          <span>Runner</span>
          <span className="text-right">Prob</span>
          <span className="text-right">Odds</span>
        </div>

        {horses.map((horse, i) => {
          const isScratched = horse.scratched === true;
          const odds = isScratched || horse.price === 0 ? "---" : (1 / horse.price).toFixed(2);
          const pct = isScratched ? "---" : (horse.price * 100).toFixed(1);
          const isWinner = isSettled && isLive && market.settled && market.winningOutcome === i;
          const isSelected = selectedHorse === i;
          const userShareCount = isLive ? Number(userPositions[i] ?? BigInt(0)) / 1e18 : 0;

          return (
            <div
              key={i}
              onClick={() => {
                if (!isSettled && !isCancelled && !isScratched && isOpen)
                  setSelectedHorse(isSelected ? null : i);
              }}
              className={`grid grid-cols-[1fr_56px_56px] md:grid-cols-[1fr_70px_70px] items-center gap-3 py-3 border-t border-border/40 transition-all
                ${isScratched || isCancelled ? "opacity-40 cursor-not-allowed" :
                  isOpen ? "cursor-pointer" : "cursor-default"}
                ${isSelected && isOpen ? "bg-gold/[0.06] -mx-4 md:-mx-6 px-4 md:px-6" :
                  isOpen && !isScratched ? "hover:bg-surface-2 -mx-4 md:-mx-6 px-4 md:px-6" :
                  "-mx-4 md:-mx-6 px-4 md:px-6"}
                ${isWinner ? "bg-accent-green/[0.06]" : ""}
              `}
            >
              {/* Horse info + bar */}
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`w-3 h-3 rounded-full bg-gradient-to-br ${getHorseInfo(i).silkColor} flex-shrink-0`} />
                  <p className={`text-[13px] font-medium truncate
                    ${isScratched ? "line-through text-text-dim" : ""}
                    ${isWinner ? "text-accent-green" : ""}
                  `}>
                    {isWinner && <span className="mr-1">&#x2713;</span>}
                    {isScratched && <span className="mr-1 text-accent-red no-underline text-[10px] font-mono">SCR</span>}
                    {horse.name}
                  </p>
                  {userShareCount > 0 && !isScratched && (
                    <span className="text-[10px] font-mono text-gold bg-gold/10 px-1.5 py-0.5 rounded flex-shrink-0">
                      {userShareCount.toFixed(1)}
                    </span>
                  )}
                </div>
                <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
                  {!isScratched && (
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-out ${getBarColor(i)}`}
                      style={{ width: `${Math.max(horse.price * 100, 2)}%` }}
                    />
                  )}
                </div>
                {!isScratched && horse.jockey && (
                  <p className="text-text-dim/60 text-[10px] mt-1 truncate">{horse.jockey}</p>
                )}
                {isScratched && (
                  <p className="text-accent-red/60 text-[10px] mt-1">Scratched - refund available</p>
                )}
              </div>

              {/* Probability % */}
              <p className="font-mono text-xs text-text-dim text-right tabular-nums">
                {pct}{!isScratched && <span className="text-text-dim/40">%</span>}
              </p>

              {/* Decimal odds */}
              <p className={`font-mono text-xs text-right tabular-nums ${
                isWinner ? "text-accent-green font-semibold" :
                isSelected ? "text-gold" : "text-gold/80"
              }`}>
                {odds}{!isScratched && odds !== "---" && <span className="text-gold/40">x</span>}
              </p>
            </div>
          );
        })}
      </div>

      {/* Claim banner for settled markets */}
      {isSettled && isConnected && isLive && market.settled && (
        (() => {
          const wi = market.winningOutcome;
          const winShares = Number(userPositions[wi] ?? BigInt(0)) / 1e18;
          if (winShares <= 0) return null;
          return (
            <div className="mx-4 md:mx-6 mb-4 p-4 rounded-lg border border-accent-green/20 bg-accent-green/[0.04]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-accent-green text-sm font-semibold">
                    You won!
                  </p>
                  <p className="text-text-dim text-xs mt-0.5">
                    {winShares.toFixed(1)} shares x $1.00 = <span className="text-accent-green font-mono">${winShares.toFixed(2)}</span> USDC
                  </p>
                </div>
                <button
                  onClick={() => claim()}
                  disabled={isClaiming}
                  className="font-mono text-[11px] tracking-[1.5px] uppercase px-5 py-2.5 rounded-lg bg-accent-green text-bg font-semibold hover:bg-accent-green/90 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {isClaiming ? "Claiming..." : "Claim $" + winShares.toFixed(2)}
                </button>
              </div>
            </div>
          );
        })()
      )}

      {/* Trading panel */}
      {selectedHorse !== null && isOpen && !isCancelled && !horses[selectedHorse]?.scratched && (
        <div className="mx-4 md:mx-6 mb-4 p-4 rounded-lg border border-gold/15 bg-gold/[0.03]">
          {/* Buy/Sell toggle + horse name */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMode("buy")}
                className={`font-mono text-[11px] tracking-[1px] uppercase px-3 py-1.5 rounded-lg transition-colors ${
                  mode === "buy"
                    ? "bg-gold/15 text-gold border border-gold/30"
                    : "text-text-dim border border-transparent hover:text-text-primary"
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setMode("sell")}
                className={`font-mono text-[11px] tracking-[1px] uppercase px-3 py-1.5 rounded-lg transition-colors ${
                  mode === "sell"
                    ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30"
                    : "text-text-dim border border-transparent hover:text-text-primary"
                }`}
              >
                Sell
              </button>
            </div>
            <span className="text-text-dim text-xs">
              {mode === "buy" ? "Backing" : "Selling"}{" "}
              <span className="text-gold font-semibold">{horses[selectedHorse].name}</span>
            </span>
          </div>

          <div className="flex gap-2">
            <input
              type="number"
              placeholder={mode === "buy" ? "Number of shares" : "Shares to sell"}
              value={stakeInput}
              onChange={(e) => setStakeInput(e.target.value)}
              className="flex-1 bg-surface-2 border border-border-bright rounded-lg px-3 py-2.5 text-sm font-mono text-text-primary placeholder-text-dim/40 focus:outline-none focus:border-gold/40 transition-colors"
            />
            {isConnected && isLive ? (
              <button
                onClick={mode === "buy" ? handleBuy : handleSell}
                disabled={isTransacting || !stakeInput || Number(stakeInput) <= 0}
                className={`font-mono text-[11px] tracking-[1px] uppercase px-6 py-2.5 rounded-lg font-semibold transition-all disabled:opacity-40 ${
                  mode === "buy"
                    ? "bg-gold text-bg hover:bg-gold-bright"
                    : "bg-accent-blue text-bg hover:bg-accent-blue/90"
                }`}
              >
                {isApproving
                  ? "Approving..."
                  : pendingBuyRef.current
                  ? "Placing..."
                  : isTransacting
                  ? "Confirming..."
                  : mode === "buy"
                  ? "Buy"
                  : "Sell"}
              </button>
            ) : (
              <button
                disabled
                className="font-mono text-[11px] tracking-[1px] uppercase px-6 py-2.5 rounded-lg bg-gold text-bg font-semibold opacity-40"
              >
                {isConnected ? "Demo" : "Connect Wallet"}
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
                const estimatedCost = shares * p;
                const fee = estimatedCost * feeMultiplier;
                const totalCost = estimatedCost + fee;
                const payout = shares;
                return (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-dim mt-3 pt-3 border-t border-border/30">
                    <span>
                      Cost: <span className="text-text-primary font-mono">${totalCost.toFixed(2)}</span>
                      <span className="text-text-dim/40 ml-1">(incl. ${fee.toFixed(3)} fee)</span>
                    </span>
                    <span>
                      If wins: <span className="text-accent-green font-mono">${payout.toFixed(2)}</span>
                      <span className="text-text-dim/40 ml-1">({(payout / totalCost).toFixed(1)}x)</span>
                    </span>
                  </div>
                );
              } else {
                const proceeds = shares * p;
                const fee = proceeds * feeMultiplier;
                const net = proceeds - fee;
                return (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-dim mt-3 pt-3 border-t border-border/30">
                    <span>
                      Proceeds: <span className="text-text-primary font-mono">${proceeds.toFixed(2)}</span>
                      <span className="text-text-dim/40 ml-1">(-${fee.toFixed(3)} fee)</span>
                    </span>
                    <span>
                      You receive: <span className="text-accent-blue font-mono">${net.toFixed(2)}</span>
                    </span>
                  </div>
                );
              }
            })()}
        </div>
      )}

      {/* "Connect to trade" prompt for disconnected users on open markets */}
      {isOpen && !isConnected && isLive && (
        <div className="mx-4 md:mx-6 mb-4 p-3 rounded-lg border border-border bg-surface-2/50 text-center">
          <p className="text-text-dim text-xs">Connect your wallet to trade on this market</p>
        </div>
      )}
    </div>
  );
}
