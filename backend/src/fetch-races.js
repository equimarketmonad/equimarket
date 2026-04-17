/// @notice Fetch upcoming races from The Racing API and save to local JSON
/// This is the first step: pull racecards → save metadata → then create markets
///
/// Usage: node src/fetch-races.js

import "dotenv/config";
import { RacingAPIClient } from "./racing-api.js";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

async function main() {
  const client = new RacingAPIClient(
    process.env.RACING_API_USER,
    process.env.RACING_API_PASS
  );

  console.log("Fetching racecards from The Racing API...\n");

  // Fetch available racecards
  const racecards = await client.getFreeRacecards();

  if (racecards.length === 0) {
    console.log("No racecards available. Try again later or upgrade plan.");
    return;
  }

  console.log(`Found ${racecards.length} races:\n`);

  // Normalize all races
  const races = racecards.map((rc) => client.normalizeRace(rc));

  // Display summary
  for (const race of races) {
    console.log(
      `  ${race.offTime} | ${race.course.padEnd(16)} | ${race.name.slice(0, 45).padEnd(45)} | ${race.numOutcomes} runners | ${race.region}`
    );
  }

  // Filter: only races with 2-20 runners (contract limit is 30)
  const eligible = races.filter(
    (r) => r.numOutcomes >= 2 && r.numOutcomes <= 20
  );

  console.log(`\n${eligible.length} eligible for market creation (2-20 runners)`);

  // Save to disk
  mkdirSync(DATA_DIR, { recursive: true });

  const outputPath = join(DATA_DIR, "upcoming-races.json");
  writeFileSync(outputPath, JSON.stringify(eligible, null, 2));
  console.log(`\nSaved to ${outputPath}`);

  // Also save a race-metadata file the frontend will use
  const metadata = {};
  for (const race of eligible) {
    metadata[race.apiRaceId] = {
      name: race.name,
      course: race.course,
      date: race.date,
      offTime: race.offTime,
      region: race.region,
      pattern: race.pattern,
      type: race.type,
      distance: race.distance,
      going: race.going,
      surface: race.surface,
      prize: race.prize,
      runners: race.runners.map((r) => ({
        index: r.index,
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
      })),
    };
  }

  const metaPath = join(DATA_DIR, "race-metadata.json");
  writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
  console.log(`Saved metadata to ${metaPath}`);

  console.log("\nNext step: run 'npm run create-markets' to deploy these on-chain");
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
