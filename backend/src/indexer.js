/// @notice Market indexer — reads on-chain state and caches it in memory.
/// Listens for events (trades, settlements) and does periodic full refreshes.
/// The server.js API reads from this cache, so the frontend never hits the RPC.

import { ethers } from "ethers";
import { FACTORY_ABI, MARKET_ABI, USDC_ABI } from "./contracts.js";
import { getRaceMetadata } from "./metadata.js";

export class MarketIndexer {
  constructor({ rpcUrl, factoryAddress, usdcAddress, oracleAddress }) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.factory = new ethers.Contract(factoryAddress, FACTORY_ABI, this.provider);
    this.usdcAddress = usdcAddress;
    this.oracleAddress = oracleAddress;

    // In-memory cache
    this.markets = new Map(); // address → market data
    this.marketsByRaceId = new Map(); // raceIdBytes → address
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

      // Read data for each market (batched with Promise.all in chunks)
      const CHUNK_SIZE = 5;
      for (let i = 0; i < addresses.length; i += CHUNK_SIZE) {
        const chunk = addresses.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map((addr) => this.refreshMarket(addr)));
      }

      this.lastRefresh = Date.now();
      console.log(`[indexer] Refreshed ${numMarkets} markets`);
    } catch (e) {
      console.error("[indexer] Refresh failed:", e.message);
    }

    this.refreshing = false;
  }

  /** Read full state for a single market */
  async refreshMarket(address) {
    try {
      const market = new ethers.Contract(address, MARKET_ABI, this.provider);

      const [
        raceId,
        numOutcomes,
        closesAt,
        settled,
        cancelled,
        winningOutcome,
        totalDeposited,
        baseFeeRate,
        prices,
      ] = await Promise.all([
        market.raceId(),
        market.numOutcomes(),
        market.closesAt(),
        market.settled(),
        market.cancelled(),
        market.winningOutcome(),
        market.totalDeposited(),
        market.baseFeeRate(),
        market.getAllPrices(),
      ]);

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
        baseFeeRate: Number(baseFeeRate),
        prices: priceArray,
        hasMeta: !!meta,
        meta: meta
          ? {
              apiRaceId: meta.apiRaceId,
              name: meta.name,
              course: meta.course,
              date: meta.date,
              offTime: meta.offTime,
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
    } catch (e) {
      console.error(`[indexer] Failed to read market ${address}:`, e.message);
    }
  }

  /** Listen for on-chain events to update cache in real-time */
  async startEventListener() {
    try {
      // Listen for new markets
      this.factory.on("MarketCreated", async (raceId, marketAddr) => {
        console.log(`[indexer] New market created: ${marketAddr}`);
        await this.refreshMarket(marketAddr);
      });

      // For each known market, listen for trades
      for (const [address] of this.markets) {
        this.listenToMarket(address);
      }

      console.log("[indexer] Event listeners active");
    } catch (e) {
      console.error("[indexer] Event listener setup failed:", e.message);
      console.log("[indexer] Falling back to periodic refresh only");
    }
  }

  listenToMarket(address) {
    try {
      const market = new ethers.Contract(address, MARKET_ABI, this.provider);

      market.on("SharesBought", () => {
        console.log(`[indexer] Trade on ${address.slice(0, 10)}...`);
        this.refreshMarket(address);
      });

      market.on("SharesSold", () => {
        console.log(`[indexer] Sale on ${address.slice(0, 10)}...`);
        this.refreshMarket(address);
      });

      market.on("MarketSettled", () => {
        console.log(`[indexer] Settled: ${address.slice(0, 10)}...`);
        this.refreshMarket(address);
      });
    } catch {
      // Events may not be supported on all RPCs
    }
  }

  /** Start periodic refresh (fallback for missed events) */
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

  /** Get market by raceId */
  getMarketByRaceId(raceId) {
    const address = this.marketsByRaceId.get(raceId);
    return address ? this.markets.get(address) : null;
  }
}
