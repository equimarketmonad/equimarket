/// @notice Market indexer — reads on-chain state and caches it in memory.
/// Listens for events (trades, settlements) and does periodic full refreshes.
/// The server.js API reads from this cache, so the frontend never hits the RPC.

import { ethers } from "ethers";
import { FACTORY_ABI, MARKET_ABI, USDC_ABI } from "./contracts.js";
import { getRaceMetadata } from "./metadata.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class MarketIndexer {
  constructor({ rpcUrl, factoryAddress, usdcAddress, oracleAddress }) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.factory = new ethers.Contract(factoryAddress, FACTORY_ABI, this.provider);
    this.usdcAddress = usdcAddress;
    this.oracleAddress = oracleAddress;

    // In-memory cache
    this.markets = new Map(); // address → market data
    this.marketsByRaceId = new Map(); // raceIdBytes → address
    this.priceHistory = new Map(); // address → [{timestamp, prices: number[]}]
    this.lastRefresh = 0;
    this.refreshing = false;
  }

  /** Full refresh: read all markets from chain */
  async refresh() {
    if (this.refreshing) return;
    this.refreshing = true;

    try {
      const count = await this.factory.marketCount();
      const numMarkets = Number(count);

      if (numMarkets === 0) {
        this.refreshing = false;
        return;
      }

      // Fetch all addresses
      const addresses = await this.factory.getMarkets(0n, count);

      // Read one market at a time with a pause between each.
      // Each market makes 8 parallel RPC calls — Monad caps at 15/sec,
      // so we serialize markets and wait 1s between them.
      for (let i = 0; i < addresses.length; i++) {
        await this.refreshMarket(addresses[i]);
        if (i < addresses.length - 1) await sleep(1000);
      }

      this.lastRefresh = Date.now();
      console.log(`[indexer] Refreshed ${this.markets.size} / ${numMarkets} markets`);
    } catch (e) {
      console.error("[indexer] Refresh failed:", e.message);
    }

    this.refreshing = false;
  }

  /** Read full state for a single market */
  async refreshMarket(address) {
    try {
      const market = new ethers.Contract(address, MARKET_ABI, this.provider);

      // Sequential calls to stay well under Monad's 15 req/sec limit
      const raceId = await market.raceId();
      const numOutcomes = await market.numOutcomes();
      const closesAt = await market.closesAt();
      const settled = await market.settled();
      const cancelled = await market.cancelled();
      const winningOutcome = await market.winningOutcome();
      const totalDeposited = await market.totalDeposited();
      const prices = await market.getAllPrices();

      const numOut = Number(numOutcomes);
      const priceArray = prices.map((p) => Number(p) / 1e18);

      // Get race metadata from our JSON
      const meta = getRaceMetadata(raceId);

      // Find favourite
      let favIdx = 0;
      let favPrice = 0;
      priceArray.forEach((p, i) => {
        if (p > favPrice) { favPrice = p; favIdx = i; }
      });

      const data = {
        address,
        raceId,
        numOutcomes: numOut,
        closesAt: Number(closesAt),
        settled,
        cancelled,
        winningOutcome: Number(winningOutcome),
        totalDeposited: Number(totalDeposited) / 1e6, // USDC → dollars
        prices: priceArray,
        hasMeta: !!meta,
        meta: meta
          ? {
              apiRaceId: meta.apiRaceId,
              name: meta.name,
              course: meta.course,
              date: meta.date,
              offTime: meta.offTime,
              offDt: meta.offDt || null,
              region: meta.region,
              pattern: meta.pattern,
              type: meta.type,
              distance: meta.distance,
              going: meta.going,
              surface: meta.surface,
              prize: meta.prize,
              runners: meta.runners.map((r, i) => ({
                index: i,
                name: r.name,
                jockey: r.jockey,
                trainer: r.trainer,
                number: r.number,
                draw: r.draw,
                weight: r.weight,
                form: r.form,
                age: r.age,
                sex: r.sex,
                sire: r.sire,
                dam: r.dam,
                officialRating: r.officialRating,
                price: priceArray[i] || 0,
                odds: priceArray[i] > 0 ? (1 / priceArray[i]).toFixed(2) : null,
                pct: priceArray[i] > 0 ? (priceArray[i] * 100).toFixed(1) : null,
              })),
            }
          : null,
        favourite: {
          index: favIdx,
          name: meta?.runners?.[favIdx]?.name || `Horse ${favIdx + 1}`,
          jockey: meta?.runners?.[favIdx]?.jockey || "Unknown",
          price: favPrice,
          odds: favPrice > 0 ? (1 / favPrice).toFixed(2) : null,
          pct: (favPrice * 100).toFixed(1),
        },
        updatedAt: Date.now(),
      };

      this.markets.set(address, data);
      this.marketsByRaceId.set(raceId, address);

      // Snapshot prices for history chart — only if prices changed
      const history = this.priceHistory.get(address) || [];
      const lastSnap = history.length > 0 ? history[history.length - 1] : null;
      const pricesChanged = !lastSnap || priceArray.some((p, i) => Math.abs(p - lastSnap.prices[i]) > 0.0001);
      if (pricesChanged) {
        history.push({ timestamp: Date.now(), prices: priceArray });
        // Keep last 500 snapshots per market (~4 hours at 30s intervals)
        if (history.length > 500) history.shift();
        this.priceHistory.set(address, history);
      }
    } catch (e) {
      console.error(`[indexer] Failed to read market ${address}:`, e.message);
    }
  }

  /** Start periodic refresh — Monad testnet doesn't support eth_newFilter
   *  so we skip event listeners and just poll every 30s instead. */
  startPeriodicRefresh(intervalMs = 30000) {
    setInterval(() => this.refresh(), intervalMs);
    console.log(`[indexer] Periodic refresh every ${intervalMs / 1000}s`);
  }

  /** Get all markets as an array (for the API) */
  getAllMarkets() {
    return Array.from(this.markets.values())
      .filter((m) => m.hasMeta) // Only return markets with metadata
      .sort((a, b) => a.closesAt - b.closesAt);
  }

  /** Get a single market by address */
  getMarket(address) {
    return this.markets.get(address) || null;
  }

  /** Get price history for a market */
  getPriceHistory(address) {
    return this.priceHistory.get(address) || [];
  }

  /** Get market by raceId */
  getMarketByRaceId(raceId) {
    const address = this.marketsByRaceId.get(raceId);
    return address ? this.markets.get(address) : null;
  }
}
