#!/bin/bash
# EquiMarket — One-command setup
# Run this from the equimarket/ directory

set -e

echo "=== EquiMarket Setup ==="
echo ""

# ── 1. Install Foundry (if not already installed) ──
if ! command -v forge &> /dev/null; then
    echo "[1/5] Installing Foundry (Solidity toolchain)..."
    curl -L https://foundry.paradigm.xyz | bash
    source ~/.bashrc 2>/dev/null || source ~/.zshrc 2>/dev/null || true
    foundryup
else
    echo "[1/5] Foundry already installed ✓"
fi

# ── 2. Install Forge Std (testing library) ──
echo "[2/5] Setting up contracts..."
cd contracts

if [ ! -d "lib/forge-std" ]; then
    # forge install uses git submodules, so we need a git repo
    if [ ! -d ".git" ]; then
        git init -q
    fi
    forge install foundry-rs/forge-std
fi

echo "     Compiling contracts..."
forge build

echo "     Running tests..."
forge test -vv

cd ..

# ── 3. Install frontend dependencies ──
echo "[3/5] Setting up frontend..."
cd frontend
npm install
cd ..

# ── 4. WalletConnect Project ID check ──
echo "[4/5] Checking configuration..."
if grep -q "YOUR_WALLETCONNECT_PROJECT_ID" frontend/src/lib/wagmi.ts; then
    echo ""
    echo "  ⚠  You need a WalletConnect Project ID!"
    echo "     1. Go to https://cloud.walletconnect.com"
    echo "     2. Create a free project"
    echo "     3. Copy the Project ID"
    echo "     4. Replace YOUR_WALLETCONNECT_PROJECT_ID in frontend/src/lib/wagmi.ts"
    echo ""
fi

echo ""
echo "[5/5] Setup complete! ✓"
echo ""
echo "=== Quick Start ==="
echo ""
echo "  Contracts:"
echo "    cd contracts"
echo "    forge build          # compile"
echo "    forge test -vvv      # run tests with verbose output"
echo ""
echo "  Frontend:"
echo "    cd frontend"
echo "    npm run dev          # start dev server at http://localhost:3000"
echo ""
echo "  Deploy to Monad Testnet:"
echo "    cd contracts"
echo "    forge script script/Deploy.s.sol --rpc-url \$MONAD_TESTNET_RPC --broadcast --private-key \$DEPLOYER_KEY"
echo ""
echo "  After deploying, update the contract addresses in:"
echo "    frontend/src/lib/contracts.ts → CONTRACTS object"
echo ""
echo "=== Architecture ==="
echo ""
echo "  Contracts (Solidity):"
echo "    LMSRMath.sol      — LMSR pricing math (fixed-point)"
echo "    LMSRMarket.sol    — Per-race market (buy/sell/settle/scratch/cancel/fees)"
echo "    MarketFactory.sol — Deploys markets, stores fee config"
echo "    RaceOracle.sol    — Result submission with dispute window"
echo ""
echo "  Frontend (Next.js + wagmi + RainbowKit):"
echo "    Providers.tsx      — Wallet + chain setup"
echo "    hooks/useMarkets   — Read on-chain market data"
echo "    hooks/useActions   — Buy/sell/claim transactions"
echo "    RaceCard.tsx       — Race display + trading panel"
echo ""
