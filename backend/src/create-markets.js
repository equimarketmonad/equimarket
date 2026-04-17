/// @notice Read fetched races and create on-chain markets via the factory
/// Reads from data/upcoming-races.json, deploys markets, saves mapping
///
/// Usage: node src/create-markets.js

import "dotenv/config";
import { ethers } from "ethers";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { FACTORY_ABI, USDC_ABI } from "./contracts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

async function main() {
  // ── Load races ──
  const racesPath = join(DATA_DIR, "upcoming-races.json");
  if (!existsSync(racesPath)) {
    console.error("No races found. Run 'npm run fetch-races' first.");
    process.exit(1);
  }

  const races = JSON.parse(readFileSync(racesPath, "utf-8"));
  console.log(`Loaded ${races.length} races to deploy\n`);

  // ── Connect to chain ──
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const factory = new ethers.Contract(process.env.FACTORY_ADDRESS, FACTORY_ABI, wallet);
  const usdc = new ethers.Contract(process.env.USDC_ADDRESS, USDC_ABI, wallet);

  console.log(`Deployer: ${wallet.address}`);

  // Check USDC balance
  const balance = await usdc.balanceOf(wallet.address);
  console.log(`USDC balance: $${(Number(balance) / 1e6).toFixed(2)}\n`);

  // Liquidity parameter (b)
  const b = ethers.parseEther(process.env.DEFAULT_LIQUIDITY || "100");

  // Approve factory to spend USDC (one big approval)
  const currentAllowance = await usdc.allowance(wallet.address, process.env.FACTORY_ADDRESS);
  if (currentAllowance < ethers.parseUnits("10000", 6)) {
    console.log("Approving factory to spend USDC...");
    const tx = await usdc.approve(process.env.FACTORY_ADDRESS, ethers.MaxUint256);
    await tx.wait();
    console.log("Approved ✓\n");
  }

  // ── Load existing deployments to skip duplicates ──
  const deploymentsPath = join(DATA_DIR, "deployments.json");
  const deployments = existsSync(deploymentsPath)
    ? JSON.parse(readFileSync(deploymentsPath, "utf-8"))
    : {};

  // ── Deploy each race ──
  let created = 0;
  for (const race of races) {
    const raceIdBytes = ethers.keccak256(ethers.toUtf8Bytes(race.apiRaceId));

    // Skip if already deployed
    if (deployments[race.apiRaceId]) {
      console.log(`SKIP  ${race.course} — ${race.name} (already deployed)`);
      continue;
    }

    // Check if market already exists on-chain
    const existing = await factory.markets(raceIdBytes);
    if (existing !== ethers.ZeroAddress) {
      console.log(`SKIP  ${race.course} — ${race.name} (exists on-chain)`);
      deployments[race.apiRaceId] = {
        marketAddress: existing,
        raceIdBytes,
        course: race.course,
        name: race.name,
        numOutcomes: race.numOutcomes,
        closesAt: race.closesAt,
        createdAt: new Date().toISOString(),
      };
      continue;
    }

    // Estimate subsidy: b * ln(n) USDC
    const subsidyEstimate =
      (Number(process.env.DEFAULT_LIQUIDITY || 100) *
        Math.log(race.numOutcomes) *
        1.1); // 10% buffer
    console.log(
      `CREATE ${race.course} — ${race.name}`,
      `| ${race.numOutcomes} runners`,
      `| closes ${race.offTime} ${race.date}`,
      `| ~$${subsidyEstimate.toFixed(0)} subsidy`
    );

    try {
      const tx = await factory.createMarket(
        raceIdBytes,
        race.numOutcomes,
        b,
        race.closesAt
      );
      const receipt = await tx.wait();

      // Parse MarketCreated event to get market address
      const event = receipt.logs
        .map((log) => {
          try {
            return factory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e) => e?.name === "MarketCreated");

      const marketAddress = event?.args?.market || "unknown";

      console.log(`  ✓ Market deployed at ${marketAddress}`);
      console.log(`    TX: ${receipt.hash}\n`);

      deployments[race.apiRaceId] = {
        marketAddress,
        raceIdBytes,
        course: race.course,
        name: race.name,
        numOutcomes: race.numOutcomes,
        closesAt: race.closesAt,
        runners: race.runners.map((r) => ({
          index: r.index,
          name: r.name,
          jockey: r.jockey,
          trainer: r.trainer,
          number: r.number,
          draw: r.draw,
        })),
        createdAt: new Date().toISOString(),
      };

      created++;
    } catch (e) {
      console.error(`  ✗ Failed: ${e.message}\n`);
    }
  }

  // ── Save deployments ──
  writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  console.log(`\nCreated ${created} new markets`);
  console.log(`Total deployed: ${Object.keys(deployments).length}`);
  console.log(`Saved to ${deploymentsPath}`);

  // ── Generate frontend metadata ──
  generateFrontendMetadata(deployments);
}

/**
 * Generate the race-metadata JSON that the frontend uses
 * to map raceId hashes → horse names, jockeys, etc.
 */
function generateFrontendMetadata(deployments) {
  const racesPath = join(DATA_DIR, "upcoming-races.json");
  const races = JSON.parse(readFileSync(racesPath, "utf-8"));

  // Build mapping: raceIdBytes32 → metadata
  const metadata = {};
  for (const race of races) {
    const deployment = deployments[race.apiRaceId];
    if (!deployment) continue;

    metadata[deployment.raceIdBytes] = {
      apiRaceId: race.apiRaceId,
      name: race.name,
      course: race.course,
      date: race.date,
      offTime: race.offTime,
      offDt: race.offDt,
      region: race.region,
      pattern: race.pattern,
      type: race.type,
      distance: race.distance,
      going: race.going,
      surface: race.surface,
      prize: race.prize,
      runners: race.runners,
    };
  }

  // Write to frontend-accessible location
  const frontendPath = join(
    __dirname,
    "..",
    "..",
    "frontend",
    "src",
    "lib",
    "race-data.json"
  );
  writeFileSync(frontendPath, JSON.stringify(metadata, null, 2));
  console.log(`\nFrontend metadata written to ${frontendPath}`);
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
