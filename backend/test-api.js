// Quick test script to explore The Racing API endpoints
// Run: node test-api.js

const https = require("https");

const USERNAME = "cctkV76PStR6T1Ue59pSjZSH";
const PASSWORD = "NhUGTKbMLSrIKbAOemq65KnA";
const BASE = "https://api.theracingapi.com/v1";
const AUTH = Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64");

function get(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: { Authorization: `Basic ${AUTH}` },
    };
    https.get(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        console.log(`\n=== ${path} (${res.statusCode}) ===`);
        try {
          const json = JSON.parse(data);
          console.log(JSON.stringify(json, null, 2).slice(0, 3000));
          if (JSON.stringify(json).length > 3000) console.log("\n... (truncated)");
          resolve(json);
        } catch {
          console.log(data.slice(0, 1000));
          resolve(data);
        }
      });
    }).on("error", reject);
  });
}

async function main() {
  console.log("Testing The Racing API...\n");

  // 1. Today's racecards
  await get("/racecards/today");

  // 2. Tomorrow's racecards
  await get("/racecards/tomorrow");

  // 3. Today's results
  const today = new Date().toISOString().split("T")[0];
  await get(`/results?start_date=${today}&end_date=${today}`);

  // 4. Try free/standard racecard endpoint
  await get("/racecards/free");

  console.log("\n\nDone! Copy-paste the output and send it to me.");
}

main().catch(console.error);
