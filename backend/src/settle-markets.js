/// @notice Poll for race results and settle on-chain markets
/// Reads deployments, checks for results via The Racing API,
/// submits winners to the oracle, and finalizes after dispute window.
///
/// Usage: node src/settle-markets.js

import "dotenv/config";
import { ethers } from "ethers";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { RacingAPIClient } from "./racing-api.js";
import { ORACLE_ABI, MARKET_ABI } from "./contracts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

async function main() {
  // ── Load deployments ──
  const deploymentsPath = join(DATA_DIR, "deployments.json");
  if (!existsSync(deploymentsPath)) {
    console.error("No deployments found. Run create-markets first.");
    process.exit(1);
  }

  const deployments = JSON.parse(readFileSync(deploymentsPath, "utf-8"));
  const raceIds = Object.keys(deployments);
  console.log(`Checking ${raceIds.length} deployed markets for results...\n`);

  // ── Connect ──
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const oracle = new ethers.Contract(process.env.ORACLE_ADDRESS, ORACLE_ABI, wallet);

  // ── Racing API ──
  const client = new RacingAPIClient(
    process.env.RACING_API_USER,
    process.env.RACING_API_PASS
  );

  // Fetch today's results (requires Standard plan)
  let results = [];
  try {
    results = await client.getTodayResults();
    console.log(`Found ${results.length} results from today\n`);
  } catch (e) {
    console.error("Could not fetch results (Standard plan required):", e.message);
    console.log("\nTo settle markets, you need:");
    console.log("  1. Standard plan on The Racing API (for results endpoint)");
    console.log("  2. Or manually settle via the oracle contract");
    return;
  }

  // ── Match results to deployments ──
  for (const result of results) {
    const apiRaceId = result.race_id;
    const deployment = deployments[apiRaceId];

    if (!deployment) continue; // Not one of our markets

    // Check if already settled on-chain
    const market = new ethers.Contract(deployment.marketAddress, MARKET_ABI, provider);
    const isSettled = await market.settled();
    if (isSettled) {
      console.log(`SETTLED  ${deployment.course} — ${deployment.name}`);
      continue;
    }

    // Find winning horse
    if (!result.runners || result.runners.length === 0) continue;

    // The winner is the runner with position "1"
    const winner = result.runners.find(
      (r) => r.position === "1" || r.position === 1
    );

    if (!winner) {
      console.log(`NO WINNER  ${deployment.course} — ${deployment.name}`);
      continue;
    }

    // Find the outcome index for the winner
    const runners = deployment.runners || [];
    const winnerIndex = runners.findIndex(
      (r) => r.name === winner.horse || r.name === winner.horse_name
    );

    if (winnerIndex === -1) {
      console.log(
        `WINNER NOT FOUND  ${deployment.course} — ${deployment.name} (winner: ${winner.horse})`
      );
      continue;
    }

    console.log(
      `SUBMIT  ${deployment.course} — ${deployment.name} → Winner: ${runners[winnerIndex].name} (index ${winnerIndex})`
    );

    try {
      const tx = await oracle.submitResult(deployment.raceIdBytes, winnerIndex);
      const receipt = await tx.wait();
      console.log(`  ✓ Result submitted: ${receipt.hash}`);
      console.log(`  ⏳ Dispute window active — finalize later\n`);
    } catch (e) {
      console.error(`  ✗ Failed to submit: ${e.message}\n`);
    }
  }

  // ── Finalize any markets past dispute window ──
  console.log("\nChecking for markets ready to finalize...");
  const disputeWindow = Number(await oracle.disputeWindow());

  for (const apiRaceId of raceIds) {
    const deployment = deployments[apiRaceId];
    try {
      const result = await oracle.results(deployment.raceIdBytes);
      if (
        result.submittedAt > 0n &&
        !result.finalized &&
        Date.now() / 1000 > Number(result.submittedAt) + disputeWindow
      ) {
        console.log(`FINALIZE  ${deployment.course} — ${deployment.name}`);
        const tx = await oracle.finalizeResult(deployment.raceIdBytes);
        await tx.wait();
        console.log(`  ✓ Finalized\n`);
      }
    } catch {
      // Not submitted yet, skip
    }
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
