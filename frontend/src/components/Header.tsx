"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useReadContract } from "wagmi";
import { CONTRACTS, USDC_ABI, formatUSDC } from "@/lib/contracts";

const POLL_INTERVAL = 5000;

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
    <header className="relative px-6 md:px-12 py-8 md:py-10 border-b border-border overflow-hidden">
      {/* Background gradients */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 60% 80% at 85% 50%, rgba(200,164,90,0.06) 0%, transparent 70%),
            radial-gradient(ellipse 40% 60% at 10% 80%, rgba(90,107,200,0.04) 0%, transparent 60%)
          `,
        }}
      />

      <div className="relative flex items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[3px] uppercase text-gold mb-3">
            Live Prediction Markets
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl md:text-7xl font-bold leading-[0.95] tracking-tight mb-4">
            Equi<em className="italic text-gold">Market</em>
          </h1>
          <p className="text-text-dim text-sm max-w-lg leading-relaxed hidden sm:block">
            Back horses before and during the race. Crowd-derived odds. Cash out
            any time. No bookmaker — the market IS the odds engine.
          </p>

          <div className="flex flex-wrap gap-2 mt-5">
            {[
              { label: "Live In-Race", color: "gold" },
              { label: "LMSR Pricing", color: "green" },
              { label: "USDC Settlement", color: "blue" },
              { label: "Monad L1", color: "dim" },
            ].map((pill) => (
              <span
                key={pill.label}
                className={`font-mono text-[10px] tracking-[2px] uppercase px-3 py-1 rounded-full border
                  ${pill.color === "gold" ? "border-gold/30 text-gold bg-gold/5" : ""}
                  ${pill.color === "green" ? "border-accent-green/30 text-accent-green bg-accent-green/5" : ""}
                  ${pill.color === "blue" ? "border-accent-blue/30 text-accent-blue bg-accent-blue/5" : ""}
                  ${pill.color === "dim" ? "border-border-bright text-text-dim" : ""}
                `}
              >
                {pill.label}
              </span>
            ))}
          </div>
        </div>

        {/* Wallet connection */}
        <div className="hidden md:flex flex-col items-end gap-3 shrink-0">
          {isConnected && usdcBalance !== undefined && (
            <div className="text-right bg-surface-card/50 border border-border rounded-lg px-4 py-2.5">
              <p className="font-mono text-[10px] tracking-[2px] uppercase text-text-dim mb-0.5">
                USDC Balance
              </p>
              <p className="font-mono text-lg text-gold font-semibold">
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
                    style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
                  })}
                >
                  {!connected ? (
                    <button
                      onClick={openConnectModal}
                      className="font-mono text-[10px] tracking-[2px] uppercase px-5 py-2.5 rounded-lg border border-gold/40 text-gold hover:bg-gold/10 transition-colors"
                    >
                      Connect Wallet
                    </button>
                  ) : chain?.unsupported ? (
                    <button
                      onClick={openChainModal}
                      className="font-mono text-[10px] tracking-[2px] uppercase px-5 py-2.5 rounded-lg border border-accent-red/40 text-accent-red hover:bg-accent-red/10 transition-colors"
                    >
                      Wrong Network
                    </button>
                  ) : (
                    <button
                      onClick={openAccountModal}
                      className="font-mono text-[10px] tracking-[2px] uppercase px-5 py-2.5 rounded-lg border border-gold/40 text-gold hover:bg-gold/10 transition-colors"
                    >
                      {account.displayName}
                    </button>
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
