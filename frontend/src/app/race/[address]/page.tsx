"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { useMarketData, useScratchedStatus, useUserPositions } from "@/hooks/useMarkets";
import { useMarketAPI } from "@/hooks/useMarketsAPI";
import {
  useBuyShares,
  useSellShares,
  useClaim,
  useApproveUSDC,
  useUSDCAllowance,
  useClaimCancelRefund,
} from "@/hooks/useMarketActions";
import { formatUSDC, toShares, toUSDC, CONTRACTS, USDC_ABI } from "@/lib/contracts";
import { getHorseInfo, getBarColor, getRaceName } from "@/lib/horseNames";
import { ConnectButton } from "@rainbow-me/rainbowkit";

// ── Silk dot colors (solid hex for the mockup style) ──
const SILK_COLORS = [
  "#c8a45a", "#5a7fc8", "#5aab7a", "#c85a5a", "#9b7fcf",
  "#e6944a", "#45b5aa", "#d4699e", "#7ab8d4", "#c4c44a",
  "#f07070", "#6a9fd8", "#82c46a", "#c47ad8", "#d4a86a",
];

const REGION_FLAGS: Record<string, string> = {
  GB: "🇬🇧", IRE: "🇮🇪", IE: "🇮🇪", FR: "🇫🇷", US: "🇺🇸", USA: "🇺🇸",
  AUS: "🇦🇺", AU: "🇦🇺", HK: "🇭🇰", JP: "🇯🇵", UAE: "🇦🇪", SA: "🇿🇦",
  ZA: "🇿🇦", DE: "🇩🇪", IT: "🇮🇹", CAN: "🇨🇦", CA: "🇨🇦", NZ: "🇳🇿",
  SG: "🇸🇬", KR: "🇰🇷", IN: "🇮🇳", BRZ: "🇧🇷", BR: "🇧🇷", ARG: "🇦🇷",
  CHI: "🇨🇱", CL: "🇨🇱",
};

function getSilkColor(i: number) {
  return SILK_COLORS[i % SILK_COLORS.length];
}

/** Convert LMSR price to fractional racing odds string */
function toFractionalOdds(price: number): string {
  if (price <= 0 || price >= 1) return "—";
  const decimal = 1 / price;
  const profit = decimal - 1;
  // Common fractional odds lookup
  const fractions = [
    [1, 10], [1, 8], [1, 6], [1, 5], [1, 4], [1, 3], [2, 5], [1, 2], [4, 7],
    [8, 13], [4, 6], [8, 11], [4, 5], [5, 6], [10, 11], [1, 1], [6, 5], [5, 4],
    [11, 8], [6, 4], [13, 8], [7, 4], [2, 1], [9, 4], [5, 2], [11, 4], [3, 1],
    [7, 2], [4, 1], [9, 2], [5, 1], [6, 1], [7, 1], [8, 1], [10, 1], [12, 1],
    [14, 1], [16, 1], [20, 1], [25, 1], [33, 1], [40, 1], [50, 1], [66, 1],
    [80, 1], [100, 1],
  ];
  let best = fractions[0];
  let bestDiff = Infinity;
  for (const f of fractions) {
    const diff = Math.abs(f[0] / f[1] - profit);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = f;
    }
  }
  return `${best[0]}/${best[1]}`;
}

export default function RacePage() {
  const params = useParams();
  const address = params.address as string;
  const marketAddress = address as `0x${string}`;

  // ── State ──
  const [selectedHorse, setSelectedHorse] = useState<number | null>(null);
  const [stakeInput, setStakeInput] = useState("");
  const [mode, setMode] = useState<"buy" | "sell">("buy");

  // ── Wallet ──
  const { address: userAddress, isConnected } = useAccount();

  // ── USDC balance ──
  const { data: usdcBalance } = useReadContract({
    address: CONTRACTS.usdc,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: isConnected && !!userAddress, refetchInterval: 5000 },
  });

  // ── API metadata ──
  const { data: apiMarket } = useMarketAPI(address);

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

  // ── Derived state ──
  const isLive = !!market;
  const nowSec = Date.now() / 1000;
  const meta = apiMarket?.meta;

  const raceStatus: "pre-race" | "in-race" | "settled" | "cancelled" = isLive
    ? market.cancelled
      ? "cancelled"
      : market.settled
      ? "settled"
      : nowSec > market.closesAt
      ? "pre-race"
      : "in-race"
    : "pre-race";

  const numOutcomes = isLive ? market.numOutcomes : 0;
  const isCancelled = raceStatus === "cancelled";
  const isSettled = raceStatus === "settled";
  const isOpen = raceStatus === "in-race";
  const baseFeeRate = isLive ? market.baseFeeRate : 400;

  // Compute off time from meta
  const offTimestamp = meta?.offDt
    ? new Date(meta.offDt).getTime() / 1000
    : null;
  const raceStarted = offTimestamp ? nowSec > offTimestamp : false;
  const timeSinceStart = offTimestamp && raceStarted
    ? Math.floor(nowSec - offTimestamp)
    : 0;

  const startedDisplay = timeSinceStart > 0
    ? timeSinceStart > 3600
      ? `${Math.floor(timeSinceStart / 3600)}h ${Math.floor((timeSinceStart % 3600) / 60)}m ago`
      : `${Math.floor(timeSinceStart / 60)}m ago`
    : null;

  // Build horses array
  const horses = Array.from({ length: numOutcomes }, (_, i) => {
    if (isLive) {
      const info = getHorseInfo(i, market.raceId);
      // Try to get API runner data for richer info
      const apiRunner = meta?.runners?.[i];
      return {
        name: apiRunner?.name || info.name,
        jockey: apiRunner?.jockey || info.jockey,
        trainer: apiRunner?.trainer || info.trainer || "",
        number: apiRunner?.number || i + 1,
        draw: apiRunner?.draw || 0,
        weight: apiRunner?.weight || "",
        form: apiRunner?.form || info.form || "",
        age: apiRunner?.age || info.age || "",
        sire: apiRunner?.sire || info.sire || "",
        dam: apiRunner?.dam || info.dam || "",
        price: market.prices[i] ?? 0,
        shares: Number(userPositions[i] ?? BigInt(0)) / 1e18,
        scratched: scratchedStatus[i],
        odds: apiRunner?.odds || null,
      };
    }
    return {
      name: `Horse ${i + 1}`, jockey: "", trainer: "", number: i + 1, draw: 0,
      weight: "", form: "", age: "", sire: "", dam: "",
      price: 0, shares: 0, scratched: false, odds: null,
    };
  });

  // Pool size
  const poolDisplay = isLive ? formatUSDC(market.totalDeposited) : "0.00";

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

  // Trade summary calculations
  const tradeSummary = selectedHorse !== null && stakeInput && Number(stakeInput) > 0
    ? (() => {
        const shares = Number(stakeInput);
        const p = horses[selectedHorse]?.price || 0;
        const feeMultiplier = (baseFeeRate / 10000) * p * (1 - p);
        if (mode === "buy") {
          const estimatedCost = shares * p;
          const fee = estimatedCost * feeMultiplier;
          const totalCost = estimatedCost + fee;
          return {
            youPay: totalCost,
            sharesReceived: shares,
            avgPrice: totalCost / shares,
            fee,
            feeRate: feeMultiplier * 100,
            potentialPayout: shares,
          };
        } else {
          const proceeds = shares * p;
          const fee = proceeds * feeMultiplier;
          const net = proceeds - fee;
          return {
            youPay: 0,
            sharesReceived: 0,
            avgPrice: 0,
            fee,
            feeRate: feeMultiplier * 100,
            potentialPayout: net,
          };
        }
      })()
    : null;

  // ── Invalid address guard ──
  if (!address || !address.startsWith("0x")) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <p className="font-mono text-text-dim text-sm">Invalid market address</p>
      </div>
    );
  }

  // ── Loading state ──
  if (!isLive && !apiMarket) {
    return (
      <div className="min-h-screen bg-bg">
        <TopNav />
        <div className="flex items-center justify-center pt-32">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
            <p className="font-mono text-text-dim text-xs tracking-widest uppercase">Loading market...</p>
          </div>
        </div>
      </div>
    );
  }

  const raceName = isLive ? getRaceName(market.raceId, address) : "Race";
  const venue = meta?.course || "";
  const region = meta?.region || "";
  const flag = REGION_FLAGS[region] || "";
  const distance = meta?.distance ? `${meta.distance}` : "";
  const pattern = meta?.pattern || "";
  const going = meta?.going || "";
  const raceType = meta?.type || "";
  const surface = meta?.surface || "";
  const prize = meta?.prize || "";
  const localOffTime = meta?.offDt
    ? new Date(meta.offDt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : meta?.offTime || "";

  // Status badge
  const statusLabel = isCancelled ? "Cancelled" : isSettled ? "Settled" : isOpen ? (raceStarted ? "In Race" : "Market Open") : "Upcoming";
  const statusColor = isCancelled ? "text-red-400" : isSettled ? "text-gold" : isOpen ? "text-green-400" : "text-text-dim";
  const statusBg = isCancelled ? "bg-red-400/10 border-red-400/25" : isSettled ? "bg-gold/10 border-gold/25" : isOpen ? "bg-green-400/10 border-green-400/25" : "bg-text-dim/10 border-text-dim/25";

  return (
    <div className="min-h-screen bg-bg">
      {/* ═══ TOP NAV ═══ */}
      <TopNav />

      {/* ═══ RACE HERO ═══ */}
      <div className="relative px-6 md:px-12 py-8 border-b border-border overflow-hidden">
        {/* Subtle radial gradients */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse 50% 100% at 80% 30%, rgba(76,175,122,0.05) 0%, transparent 60%),
              radial-gradient(ellipse 60% 80% at 10% 70%, rgba(197,165,90,0.04) 0%, transparent 60%)
            `,
          }}
        />

        <div className="relative">
          {/* Top: status badge + venue line */}
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono tracking-[2px] uppercase border ${statusBg} ${statusColor}`}>
              {(isOpen && raceStarted) && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
              {statusLabel}
            </span>
            <span className="font-mono text-[11px] text-text-dim tracking-wider">
              {flag && <span className="mr-1">{flag}</span>}
              {venue}
              {pattern && <> · {pattern}</>}
              {distance && <> · {distance}</>}
            </span>
          </div>

          {/* Race name */}
          <h1 className="font-serif text-4xl md:text-[44px] font-bold leading-none tracking-tight mb-4">
            {raceName}
          </h1>

          {/* Meta row */}
          <div className="flex gap-6 flex-wrap">
            <MetaItem label="Pool Size" value={`$${poolDisplay}`} gold />
            <MetaItem label="Runners" value={`${numOutcomes}`} />
            <MetaItem label="Status" value={statusLabel} green={isOpen} />
            {going && <MetaItem label="Going" value={going} />}
            {surface && <MetaItem label="Surface" value={surface} />}
            {raceType && <MetaItem label="Type" value={raceType} />}
            {localOffTime && <MetaItem label="Off Time" value={localOffTime} />}
            {startedDisplay && <MetaItem label="Started" value={startedDisplay} />}
          </div>
        </div>
      </div>

      {/* ═══ MAIN GRID ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] min-h-[calc(100vh-260px)]">
        {/* ─── LEFT COLUMN ─── */}
        <div>
          {/* Runners Table */}
          <div className="px-6 md:px-12 py-6 border-r border-border">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[11px] tracking-[2.5px] uppercase text-text-dim">
                Runners
              </span>
            </div>

            {/* Column headers */}
            <div className="hidden md:grid grid-cols-[36px_1fr_80px_80px_100px] gap-2 px-4 pb-2 border-b border-border mb-1">
              <span className="font-mono text-[9px] tracking-[1.5px] uppercase text-text-dim text-center">#</span>
              <span className="font-mono text-[9px] tracking-[1.5px] uppercase text-text-dim">Runner</span>
              <span className="font-mono text-[9px] tracking-[1.5px] uppercase text-text-dim text-right">Prob</span>
              <span className="font-mono text-[9px] tracking-[1.5px] uppercase text-text-dim text-right">Odds</span>
              <span className="font-mono text-[9px] tracking-[1.5px] uppercase text-text-dim text-right"></span>
            </div>

            {/* Runner rows */}
            {horses.map((horse, i) => {
              const isScratched = horse.scratched === true;
              const pct = isScratched ? "—" : `${(horse.price * 100).toFixed(1)}%`;
              const odds = isScratched ? "—" : (horse.odds || toFractionalOdds(horse.price));
              const isWinner = isSettled && isLive && market.winningOutcome === i;
              const isSelected = selectedHorse === i;
              const color = getSilkColor(i);

              return (
                <div
                  key={i}
                  onClick={() => {
                    if (!isSettled && !isCancelled && !isScratched && isOpen)
                      setSelectedHorse(isSelected ? null : i);
                  }}
                  className={`grid grid-cols-[36px_1fr_60px_60px] md:grid-cols-[36px_1fr_80px_80px_100px] gap-2 items-center px-4 py-3 rounded-lg transition-all
                    ${isScratched ? "opacity-35 pointer-events-none" : ""}
                    ${isOpen && !isScratched ? "cursor-pointer" : "cursor-default"}
                    ${isSelected ? "bg-gold/[0.06] border border-gold/15" : "hover:bg-surface-2"}
                    ${isWinner ? "bg-accent-green/[0.06]" : ""}
                  `}
                >
                  {/* Number */}
                  <span className="font-mono text-[13px] font-semibold text-text-dim text-center">
                    {horse.number}
                  </span>

                  {/* Runner info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: color }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold truncate ${isScratched ? "line-through text-text-dim" : ""} ${isWinner ? "text-accent-green" : ""}`}>
                          {isWinner && <span className="mr-1">✓</span>}
                          {isScratched && <span className="mr-1 text-accent-red no-underline text-[10px] font-mono">SCR</span>}
                          {horse.name}
                        </span>
                        {horse.shares > 0 && !isScratched && (
                          <span className="text-[9px] font-mono text-gold bg-gold/10 px-1.5 py-0.5 rounded flex-shrink-0">
                            {horse.shares.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[10px] text-text-dim mt-0.5 truncate">
                        {horse.jockey}
                        {horse.trainer && <span className="text-text-dim/50"> · {horse.trainer}</span>}
                      </div>
                      {/* Prob bar (small) */}
                      {!isScratched && (
                        <div className="h-1 bg-surface-3 rounded-full overflow-hidden mt-1.5 max-w-[120px]">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${Math.max(horse.price * 100, 2)}%`, background: color }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Probability */}
                  <span className="font-mono text-[13px] text-text-dim text-right tabular-nums">
                    {pct}
                  </span>

                  {/* Odds */}
                  <span className={`font-mono text-[13px] text-right font-medium tabular-nums ${isWinner ? "text-accent-green" : "text-gold"}`}>
                    {odds}
                  </span>

                  {/* Bet button (desktop only) */}
                  <div className="hidden md:flex justify-end">
                    {isOpen && !isScratched && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedHorse(i);
                        }}
                        className="font-mono text-[10px] tracking-[1px] uppercase px-4 py-1.5 rounded-lg border border-gold/25 text-gold bg-gold/[0.06] hover:bg-gold/15 hover:border-gold/40 transition-all"
                      >
                        Bet
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ─── Price History Chart (placeholder) ─── */}
          <div className="px-6 md:px-12 pb-8 border-r border-border">
            <div className="flex items-center justify-between mb-4 pt-6 border-t border-border">
              <span className="font-mono text-[11px] tracking-[2.5px] uppercase text-text-dim">
                Price History
              </span>
              <div className="flex gap-1">
                {["1m", "5m", "All"].map((tf, i) => (
                  <button
                    key={tf}
                    className={`font-mono text-[9px] tracking-[1px] px-2.5 py-1 rounded-md transition-colors ${
                      i === 2
                        ? "text-gold bg-gold/[0.08] border border-gold/20"
                        : "text-text-dim border border-transparent hover:text-text-primary"
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-full h-[200px] bg-surface border border-border rounded-xl relative overflow-hidden">
              {/* SVG chart placeholder showing horse price lines */}
              <svg viewBox="0 0 600 200" preserveAspectRatio="none" className="w-full h-full">
                {horses.slice(0, 5).map((horse, i) => {
                  const baseY = 40 + (i * 30);
                  const color = getSilkColor(i);
                  // Generate a gentle curve for each horse
                  const drift = horse.price > 0.3 ? -20 : horse.price > 0.15 ? -5 : 5;
                  const path = `M0,${baseY + 20} C150,${baseY + 15} 300,${baseY + 10 + drift} 450,${baseY + drift} S550,${baseY + drift - 5} 600,${baseY + drift - 8}`;
                  return (
                    <g key={i}>
                      <path d={`${path} L600,200 L0,200 Z`} fill={color} opacity="0.06" />
                      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </g>
                  );
                })}
              </svg>
            </div>
            {/* Legend */}
            <div className="flex gap-4 mt-3 flex-wrap">
              {horses.slice(0, 5).map((horse, i) => (
                <div key={i} className="flex items-center gap-1.5 font-mono text-[10px] text-text-dim">
                  <div className="w-4 h-0.5 rounded-sm" style={{ background: getSilkColor(i) }} />
                  {horse.name}
                </div>
              ))}
            </div>
          </div>

          {/* ─── Market Info Grid ─── */}
          <div className="px-6 md:px-12 py-6 border-r border-border">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <InfoCard label="Total Pool" value={`$${poolDisplay}`} gold />
              <InfoCard label="LMSR Liquidity (b)" value="100" />
              <InfoCard label="Base Fee" value={`${(baseFeeRate / 100).toFixed(1)}%`} />
              <InfoCard label="Contract" value={`${address.slice(0, 6)}...${address.slice(-4)}`} small />
              <InfoCard label="Oracle" value={`${CONTRACTS.oracle.slice(0, 6)}...${CONTRACTS.oracle.slice(-4)}`} small />
              {prize && <InfoCard label="Prize" value={prize} small />}
            </div>
          </div>
        </div>

        {/* ─── RIGHT COLUMN: TRADE PANEL ─── */}
        <div className="bg-surface sticky top-0 h-fit max-h-screen overflow-y-auto px-6 md:px-8 py-6">
          <h2 className="font-mono text-[11px] tracking-[2.5px] uppercase text-text-dim mb-5">
            Place a Bet
          </h2>

          {/* Buy / Sell tabs */}
          <div className="flex bg-surface-2 rounded-lg p-0.5 mb-5">
            <button
              onClick={() => setMode("buy")}
              className={`flex-1 font-mono text-[11px] tracking-[1.5px] uppercase py-2 rounded-md transition-all ${
                mode === "buy"
                  ? "bg-surface-3 text-gold shadow-sm"
                  : "text-text-dim hover:text-text-primary"
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setMode("sell")}
              className={`flex-1 font-mono text-[11px] tracking-[1.5px] uppercase py-2 rounded-md transition-all ${
                mode === "sell"
                  ? "bg-surface-3 text-accent-blue shadow-sm"
                  : "text-text-dim hover:text-text-primary"
              }`}
            >
              Sell
            </button>
          </div>

          {/* Selected horse display */}
          {selectedHorse !== null && horses[selectedHorse] ? (
            <div className="bg-surface-2 border border-border rounded-xl p-4 mb-5 flex items-center gap-3">
              <div
                className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                style={{ background: getSilkColor(selectedHorse) }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold truncate">{horses[selectedHorse].name}</div>
                <div className="font-mono text-[10px] text-text-dim">{horses[selectedHorse].jockey}</div>
              </div>
              <div className="font-mono text-lg text-gold font-semibold">
                {horses[selectedHorse].odds || toFractionalOdds(horses[selectedHorse].price)}
              </div>
            </div>
          ) : (
            <div className="bg-surface-2 border border-border border-dashed rounded-xl p-4 mb-5 text-center">
              <p className="font-mono text-[11px] text-text-dim">Select a runner to bet</p>
            </div>
          )}

          {/* Amount input */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] tracking-[2px] uppercase text-text-dim">
                {mode === "buy" ? "Shares to Buy" : "Shares to Sell"}
              </span>
              {isConnected && usdcBalance !== undefined && (
                <span className="font-mono text-[9px] text-gold/60 cursor-pointer hover:text-gold transition-colors">
                  Bal: ${formatUSDC(usdcBalance as bigint)}
                </span>
              )}
            </div>
            <div className="flex items-center bg-surface-2 border border-border rounded-lg px-3 focus-within:border-gold/40 transition-colors">
              <input
                type="number"
                placeholder="0"
                value={stakeInput}
                onChange={(e) => setStakeInput(e.target.value)}
                className="flex-1 bg-transparent border-none outline-none font-mono text-lg text-text-primary py-3 placeholder-text-dim/30"
              />
              <span className="font-mono text-[11px] text-text-dim">shares</span>
            </div>
          </div>

          {/* Quick amounts */}
          <div className="flex gap-1.5 mb-5">
            {[10, 50, 100, 500].map((amt) => (
              <button
                key={amt}
                onClick={() => setStakeInput(String(amt))}
                className="flex-1 font-mono text-[10px] py-1.5 rounded-md border border-border text-text-dim hover:border-gold/40 hover:text-gold transition-all"
              >
                {amt}
              </button>
            ))}
          </div>

          {/* Trade summary */}
          {tradeSummary && selectedHorse !== null && (
            <div className="bg-surface-2 rounded-lg p-3.5 mb-5">
              {mode === "buy" ? (
                <>
                  <SummaryRow label="You Pay" value={`$${tradeSummary.youPay.toFixed(2)}`} />
                  <SummaryRow label="Shares Received" value={tradeSummary.sharesReceived.toFixed(1)} />
                  <SummaryRow label="Avg Price / Share" value={`$${tradeSummary.avgPrice.toFixed(3)}`} />
                  <div className="h-px bg-border my-1.5" />
                  <SummaryRow label={`Fee (${tradeSummary.feeRate.toFixed(2)}%)`} value={`$${tradeSummary.fee.toFixed(3)}`} />
                  <SummaryRow label="Potential Payout" value={`$${tradeSummary.potentialPayout.toFixed(2)}`} green />
                </>
              ) : (
                <>
                  <SummaryRow label="Shares to Sell" value={stakeInput} />
                  <SummaryRow label={`Fee (${tradeSummary.feeRate.toFixed(2)}%)`} value={`$${tradeSummary.fee.toFixed(3)}`} />
                  <div className="h-px bg-border my-1.5" />
                  <SummaryRow label="You Receive" value={`$${tradeSummary.potentialPayout.toFixed(2)}`} green />
                </>
              )}
            </div>
          )}

          {/* Submit button */}
          {isConnected ? (
            isOpen && selectedHorse !== null ? (
              <button
                onClick={mode === "buy" ? handleBuy : handleSell}
                disabled={isTransacting || !stakeInput || Number(stakeInput) <= 0}
                className={`w-full font-mono text-[12px] tracking-[2px] uppercase py-3.5 rounded-lg font-semibold transition-all disabled:opacity-40 ${
                  mode === "buy"
                    ? "bg-gradient-to-r from-gold to-gold-bright text-bg hover:shadow-lg hover:shadow-gold/20 hover:-translate-y-0.5"
                    : "bg-gradient-to-r from-accent-blue to-accent-blue/80 text-bg hover:shadow-lg hover:shadow-accent-blue/20 hover:-translate-y-0.5"
                }`}
              >
                {isApproving
                  ? "Approving USDC..."
                  : pendingBuyRef.current
                  ? "Placing Bet..."
                  : isTransacting
                  ? "Confirming..."
                  : mode === "buy"
                  ? `Buy ${stakeInput || "0"} Shares`
                  : `Sell ${stakeInput || "0"} Shares`}
              </button>
            ) : !isOpen ? (
              <div className="w-full font-mono text-[11px] tracking-[1.5px] uppercase py-3.5 rounded-lg text-center text-text-dim bg-surface-2 border border-border">
                {isSettled ? "Market Settled" : isCancelled ? "Market Cancelled" : "Market Not Open"}
              </div>
            ) : (
              <div className="w-full font-mono text-[11px] tracking-[1.5px] uppercase py-3.5 rounded-lg text-center text-text-dim bg-surface-2 border border-border">
                Select a runner above
              </div>
            )
          ) : (
            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) => (
                <button
                  onClick={openConnectModal}
                  disabled={!mounted}
                  className="w-full font-mono text-[12px] tracking-[2px] uppercase py-3.5 rounded-lg font-semibold bg-gradient-to-r from-gold to-gold-bright text-bg hover:shadow-lg hover:shadow-gold/20 transition-all"
                >
                  Connect Wallet to Bet
                </button>
              )}
            </ConnectButton.Custom>
          )}

          {/* ── Claim Banner (settled) ── */}
          {isSettled && isConnected && isLive && market.settled && (() => {
            const wi = market.winningOutcome;
            const winShares = Number(userPositions[wi] ?? BigInt(0)) / 1e18;
            if (winShares <= 0) return null;
            return (
              <div className="mt-5 p-4 rounded-xl border border-accent-green/20 bg-accent-green/[0.04]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-accent-green text-sm font-semibold">You won!</p>
                    <p className="text-text-dim text-xs mt-0.5 font-mono">
                      {winShares.toFixed(1)} shares × $1.00 = <span className="text-accent-green">${winShares.toFixed(2)}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => claim()}
                    disabled={isClaiming}
                    className="font-mono text-[11px] tracking-[1.5px] uppercase px-5 py-2.5 rounded-lg bg-accent-green text-bg font-semibold hover:bg-accent-green/90 transition-colors disabled:opacity-50"
                  >
                    {isClaiming ? "Claiming..." : `Claim $${winShares.toFixed(2)}`}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* ── Cancel Refund ── */}
          {isCancelled && isConnected && isLive && (
            <div className="mt-5 p-4 rounded-xl border border-accent-red/20 bg-accent-red/[0.04]">
              <p className="text-accent-red text-xs font-semibold tracking-wide uppercase mb-2">Race Cancelled</p>
              <button
                onClick={() => claimCancelRefund()}
                disabled={isClaimingCancel}
                className="font-mono text-[10px] tracking-[1.5px] uppercase px-4 py-2 rounded-lg bg-accent-red/20 text-accent-red border border-accent-red/30 hover:bg-accent-red/30 transition-colors disabled:opacity-50"
              >
                {isClaimingCancel ? "Claiming..." : "Claim Refund"}
              </button>
            </div>
          )}

          {/* ── YOUR POSITIONS ── */}
          {isConnected && horses.some((h) => h.shares > 0) && (
            <div className="mt-7 pt-5 border-t border-border">
              <h3 className="font-mono text-[11px] tracking-[2.5px] uppercase text-text-dim mb-4">
                Your Positions
              </h3>

              {horses.map((horse, i) => {
                if (horse.shares <= 0 || horse.scratched) return null;
                const costBasis = horse.shares * horse.price;
                const currentValue = horse.shares * horse.price;
                const ifWins = horse.shares;
                return (
                  <div key={i} className="bg-surface-2 border border-border rounded-lg p-3.5 mb-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: getSilkColor(i) }} />
                        <span className="text-[13px] font-semibold">{horse.name}</span>
                      </div>
                    </div>
                    <div className="flex gap-5">
                      <div>
                        <span className="font-mono text-[9px] text-text-dim uppercase tracking-[1px]">Shares</span>
                        <div className="font-mono text-[11px]">{horse.shares.toFixed(1)}</div>
                      </div>
                      <div>
                        <span className="font-mono text-[9px] text-text-dim uppercase tracking-[1px]">Value</span>
                        <div className="font-mono text-[11px]">${currentValue.toFixed(2)}</div>
                      </div>
                      <div>
                        <span className="font-mono text-[9px] text-text-dim uppercase tracking-[1px]">If Wins</span>
                        <div className="font-mono text-[11px] text-accent-green">${ifWins.toFixed(2)}</div>
                      </div>
                    </div>
                    {isOpen && (
                      <button
                        onClick={() => {
                          setSelectedHorse(i);
                          setMode("sell");
                          setStakeInput(horse.shares.toFixed(1));
                        }}
                        className="mt-2.5 font-mono text-[10px] tracking-[1px] uppercase px-3 py-1.5 rounded-md border border-gold/25 text-gold hover:bg-gold/10 transition-colors"
                      >
                        Cash Out ${currentValue.toFixed(0)}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── RECENT ACTIVITY (placeholder) ── */}
          <div className="mt-7 pt-5 border-t border-border">
            <h3 className="font-mono text-[11px] tracking-[2.5px] uppercase text-text-dim mb-4">
              Recent Activity
            </h3>
            <div className="text-center py-6">
              <p className="font-mono text-[11px] text-text-dim/50">Activity feed coming soon</p>
              <p className="font-mono text-[9px] text-text-dim/30 mt-1">On-chain events will appear here</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════ SUB-COMPONENTS ═══════════════

function TopNav() {
  const { address: userAddress, isConnected } = useAccount();
  const { data: usdcBalance } = useReadContract({
    address: CONTRACTS.usdc,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: isConnected && !!userAddress, refetchInterval: 5000 },
  });

  return (
    <nav className="flex items-center justify-between px-6 md:px-12 py-3.5 border-b border-border">
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="font-mono text-[11px] text-text-dim hover:text-gold transition-colors flex items-center gap-1.5"
        >
          <span className="text-base">←</span> Back to races
        </Link>
        <Link href="/" className="font-serif text-xl font-bold tracking-tight">
          Silks<em className="text-gold not-italic">&</em>Stakes
        </Link>
      </div>
      <div className="hidden md:flex items-center gap-3">
        {isConnected && usdcBalance !== undefined && (
          <span className="font-mono text-xs text-gold">
            ${formatUSDC(usdcBalance as bigint)}
          </span>
        )}
        <ConnectButton.Custom>
          {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
            const connected = mounted && account && chain;
            return (
              <div {...(!mounted && { "aria-hidden": true, style: { opacity: 0, pointerEvents: "none" as const, userSelect: "none" as const } })}>
                {!connected ? (
                  <button
                    onClick={openConnectModal}
                    className="font-mono text-[10px] tracking-[1.5px] uppercase px-4 py-1.5 rounded-lg border border-gold/35 text-gold hover:bg-gold/10 transition-colors"
                  >
                    Connect Wallet
                  </button>
                ) : (
                  <button
                    onClick={openAccountModal}
                    className="font-mono text-[10px] tracking-[1.5px] uppercase px-4 py-1.5 rounded-lg border border-gold/35 text-gold hover:bg-gold/10 transition-colors"
                  >
                    {account.displayName}
                  </button>
                )}
              </div>
            );
          }}
        </ConnectButton.Custom>
      </div>
    </nav>
  );
}

function MetaItem({ label, value, gold, green }: { label: string; value: string; gold?: boolean; green?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] tracking-[2px] uppercase text-text-dim">{label}</span>
      <span className={`font-mono text-sm font-medium ${gold ? "text-gold" : green ? "text-accent-green" : "text-text-primary"}`}>
        {value}
      </span>
    </div>
  );
}

function InfoCard({ label, value, gold, small }: { label: string; value: string; gold?: boolean; small?: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-3.5">
      <div className="font-mono text-[9px] tracking-[2px] uppercase text-text-dim mb-1">{label}</div>
      <div className={`font-mono font-semibold ${small ? "text-[11px] break-all" : "text-base"} ${gold ? "text-gold" : "text-text-primary"}`}>
        {value}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="font-mono text-[10px] text-text-dim tracking-[1px] uppercase">{label}</span>
      <span className={`font-mono text-xs ${green ? "text-accent-green" : "text-text-primary"}`}>{value}</span>
    </div>
  );
}
