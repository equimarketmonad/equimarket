/// @notice Silks & Stakes API server
/// Serves cached market data from the indexer. The frontend reads from here
/// instead of hitting the blockchain directly — same pattern as Polymarket.
///
/// Endpoints:
///   GET /api/markets         — All markets with metadata
///   GET /api/markets/:address — Single market by contract address
///   GET /api/health          — Server health check
///
/// Usage: npm run dev (or npm start)

import "dotenv/config";
import express from "express";
import cors from "cors";
import { MarketIndexer } from "./indexer.js";

const PORT = process.env.PORT || 3001;

// ── Initialize ──

const app = express();
app.use(cors());
app.use(express.json());

const indexer = new MarketIndexer({
  rpcUrl: process.env.RPC_URL,
  factoryAddress: process.env.FACTORY_ADDRESS,
  usdcAddress: process.env.USDC_ADDRESS,
  oracleAddress: process.env.ORACLE_ADDRESS,
});

// ── Routes ──

/** All markets — the main endpoint the frontend homepage uses */
app.get("/api/markets", (req, res) => {
  const markets = indexer.getAllMarkets();

  // Split by status using offDt (actual race start time), not closesAt
  // closesAt = off time + 7 days (when betting closes), NOT when the race starts
  const now = Date.now() / 1000;
  const live = [];      // race has started (past off time), not yet settled
  const upcoming = [];  // race hasn't started yet (before off time)
  const settled = [];
  const cancelled = [];

  for (const m of markets) {
    if (m.cancelled) { cancelled.push(m); continue; }
    if (m.settled) { settled.push(m); continue; }

    // Use offDt (actual race start time) to determine if race has started
    const offDt = m.meta?.offDt;
    let offTimestamp = null;
    if (offDt) {
      const d = new Date(offDt);
      if (!isNaN(d.getTime())) offTimestamp = d.getTime() / 1000;
    }

    if (offTimestamp && now < offTimestamp) {
      upcoming.push(m); // race hasn't started yet
    } else {
      live.push(m);     // race has started (or no offDt, assume live)
    }
  }

  res.json({
    total: markets.length,
    live,
    upcoming,
    settled,
    cancelled,
    all: markets,
    lastRefresh: indexer.lastRefresh,
  });
});

/** Single market by address */
app.get("/api/markets/:address", (req, res) => {
  const market = indexer.getMarket(req.params.address);
  if (!market) {
    return res.status(404).json({ error: "Market not found" });
  }
  res.json(market);
});

/** Health check */
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    markets: indexer.getAllMarkets().length,
    lastRefresh: indexer.lastRefresh,
    uptime: process.uptime(),
  });
});

// ── Start ──

async function start() {
  console.log("[server] Starting Silks & Stakes API...");

  // Initial full refresh
  console.log("[server] Loading market data from Monad...");
  await indexer.refresh();
  console.log(`[server] Indexed ${indexer.getAllMarkets().length} markets`);

  // Periodic refresh every 30s (Monad testnet doesn't support event filters)
  indexer.startPeriodicRefresh(30000);

  // Start HTTP server
  app.listen(PORT, () => {
    console.log(`[server] API running at http://localhost:${PORT}`);
    console.log(`[server] Try: http://localhost:${PORT}/api/markets`);
  });
}

// Catch unhandled rejections (e.g. RPC rate-limit errors from event listeners)
// so they don't crash the server
process.on("unhandledRejection", (err) => {
  console.warn("[server] Unhandled rejection (non-fatal):", err?.message || err);
});

start().catch((e) => {
  console.error("[server] Fatal:", e.message);
  process.exit(1);
});
