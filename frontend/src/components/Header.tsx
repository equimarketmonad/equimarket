"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useReadContract } from "wagmi";
import { CONTRACTS, USDC_ABI, formatUSDC } from "@/lib/contracts";

const POLL_INTERVAL = 5000;

// Racing saddle cloth colors for the gate logo
const RACING_STALLS = [
  { num: 1, letter: "S", bg: "#D32F2F", text: "white" },
  { num: 2, letter: "I", bg: "#FFFFFF", text: "#1a1a18" },
  { num: 3, letter: "L", bg: "#1565C0", text: "white" },
  { num: 4, letter: "K", bg: "#F9A825", text: "#1a1a18" },
  { num: 5, letter: "S", bg: "#2E7D32", text: "white" },
  { num: 6, letter: "\u25C6", bg: "#212121", text: "white" },
  { num: 7, letter: "S", bg: "#E65100", text: "white" },
  { num: 8, letter: "T", bg: "#E91E90", text: "white" },
  { num: 9, letter: "A", bg: "#00ACC1", text: "white" },
  { num: 10, letter: "K", bg: "#7B1FA2", text: "white" },
  { num: 11, letter: "E", bg: "#9E9E9E", text: "#1a1a18" },
  { num: 12, letter: "S", bg: "#7CB342", text: "#1a1a18" },
];

function GateLogo({ className }: { className?: string }) {
  const sw = 28;
  return (
    <svg
      viewBox="0 0 360 130"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <style>{`text { font-family: 'Space Grotesk','Inter',sans-serif; font-weight: 800; text-anchor: middle; dominant-baseline: middle; }`}</style>
      {/* Arch */}
      <path d="M 12 35 Q 180 2 348 35" fill="none" stroke="#FAF8F5" strokeWidth="2.2" />
      <line x1="12" y1="35" x2="348" y2="35" stroke="#FAF8F5" strokeWidth="2.2" />
      {/* Arch uprights */}
      <line x1="96" y1="18" x2="96" y2="35" stroke="#FAF8F5" strokeWidth="1" opacity="0.5" />
      <line x1="180" y1="12" x2="180" y2="35" stroke="#FAF8F5" strokeWidth="1" opacity="0.5" />
      <line x1="264" y1="18" x2="264" y2="35" stroke="#FAF8F5" strokeWidth="1" opacity="0.5" />
      {/* Second line */}
      <line x1="12" y1="38" x2="348" y2="38" stroke="#FAF8F5" strokeWidth="1.8" />
      {/* Stalls */}
      {RACING_STALLS.map((stall, i) => {
        const x = 12 + i * sw;
        const strokeAttr = stall.bg === "#FFFFFF" ? { stroke: "#ccc", strokeWidth: 0.5 } : {};
        return (
          <g key={i}>
            <rect x={x + 2} y={40} width={24} height={14} rx={3} fill={stall.bg} {...strokeAttr} />
            <text x={x + sw / 2} y={48} style={{ fontSize: "11px", fontWeight: 700, fill: stall.text }}>{stall.num}</text>
            <rect x={x} y={56} width={sw} height={59} fill={stall.bg} opacity={0.12} />
            <text x={x + sw / 2} y={85.5} style={{ fontSize: "26px", fontWeight: 800, fill: "#FAF8F5" }}>{stall.letter}</text>
          </g>
        );
      })}
      {/* Frame */}
      <line x1="12" y1="35" x2="12" y2="115" stroke="#FAF8F5" strokeWidth="2.2" />
      <line x1="348" y1="35" x2="348" y2="115" stroke="#FAF8F5" strokeWidth="2.2" />
      {Array.from({ length: 11 }, (_, i) => (
        <line key={i} x1={40 + i * sw} y1="38" x2={40 + i * sw} y2="115" stroke="#FAF8F5" strokeWidth="1" />
      ))}
      <line x1="12" y1="115" x2="348" y2="115" stroke="#FAF8F5" strokeWidth="2.2" />
    </svg>
  );
}

export default function Header() {
  const { address, isConnected } = useAccount();

  const { data: usdcBalance } = useReadContract({
    address: CONTRACTS.usdc,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: isConnected && !!address, refetchInterval: POLL_INTERVAL },
  });

  return (
    <header className="relative px-6 md:px-12 py-6 border-b border-border overflow-hidden">
      {/* Background gradients */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 60% 80% at 85% 50%, rgba(197,165,90,0.06) 0%, transparent 70%),
            radial-gradient(ellipse 40% 60% at 10% 80%, rgba(76,175,122,0.04) 0%, transparent 60%)
          `,
        }}
      />

      {/* Top row: Gate logo */}
      <div className="relative flex items-center justify-between mb-3">
        <GateLogo className="h-12 w-auto" />
      </div>

      {/* Bottom row: Nav + Wallet */}
      <div className="relative flex items-center justify-between">
        <nav className="flex gap-1">
          {["Live", "Upcoming", "Popular", "Schedule", "Results"].map((item, i) => (
            <a
              key={item}
              href="#"
              className={`font-mono text-[11px] tracking-[2px] uppercase px-4 py-2 rounded-lg transition-colors ${
                i === 0
                  ? "text-gold bg-gold/10"
                  : "text-text-dim hover:text-text-primary hover:bg-surface-2"
              }`}
            >
              {item}
            </a>
          ))}
        </nav>

        {/* Wallet area */}
        <div className="hidden md:flex items-center gap-3">
          {isConnected && usdcBalance !== undefined && (
            <div className="bg-surface border border-border rounded-lg px-4 py-2 text-center">
              <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-text-dim">Balance</p>
              <p className="font-mono text-sm text-gold font-semibold">
                ${formatUSDC(usdcBalance as bigint)}
              </p>
            </div>
          )}
          <ConnectButton.Custom>
            {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
              const connected = mounted && account && chain;
              return (
                <div
                  {...(!mounted && {
                    "aria-hidden": true,
                    style: { opacity: 0, pointerEvents: "none" as const, userSelect: "none" as const },
                  })}
                >
                  {!connected ? (
                    <button
                      onClick={openConnectModal}
                      className="font-mono text-[10px] tracking-[1.5px] uppercase px-4 py-2 rounded-lg bg-gradient-to-r from-gold to-gold-bright text-bg font-semibold hover:shadow-lg hover:shadow-gold/20 transition-all"
                    >
                      Connect Wallet
                    </button>
                  ) : chain?.unsupported ? (
                    <button
                      onClick={openChainModal}
                      className="font-mono text-[10px] tracking-[2px] uppercase px-4 py-2 rounded-lg border border-accent-red/40 text-accent-red hover:bg-accent-red/10 transition-colors"
                    >
                      Wrong Network
                    </button>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={openAccountModal}
                        className="font-mono text-[10px] tracking-[1.5px] uppercase px-4 py-2 rounded-lg border border-gold/40 text-gold hover:bg-gold/10 transition-colors"
                      >
                        {account.displayName}
                      </button>
                      <button className="font-mono text-[10px] tracking-[1.5px] uppercase px-4 py-2 rounded-lg bg-gradient-to-r from-gold to-gold-bright text-bg font-semibold hover:shadow-lg hover:shadow-gold/20 transition-all">
                        Deposit
                      </button>
                    </div>
                  )}
                </div>
              );
            }}
          </ConnectButton.Custom>
        </div>
      </div>
    </header>
  );
}
