/// @notice Client for The Racing API
/// Fetches racecards, results, and race metadata.

import https from "https";

export class RacingAPIClient {
  constructor(username, password) {
    this.auth = Buffer.from(`${username}:${password}`).toString("base64");
    this.base = "https://api.theracingapi.com/v1";
  }

  /** Generic GET request */
  _get(path) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.base + path);
      const opts = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: { Authorization: `Basic ${this.auth}` },
      };
      https.get(opts, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`API ${res.statusCode}: ${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Invalid JSON: ${data.slice(0, 200)}`));
          }
        });
      }).on("error", reject);
    });
  }

  // ── Racecards ──

  /** Get free racecards (available on all plans) */
  async getFreeRacecards() {
    const res = await this._get("/racecards/free");
    return res.racecards || [];
  }

  /** Get today's racecards (Basic+ plan) */
  async getTodayRacecards() {
    try {
      const res = await this._get("/racecards/today");
      return res.racecards || [];
    } catch (e) {
      console.warn("Today's racecards not available, falling back to free:", e.message);
      return this.getFreeRacecards();
    }
  }

  /** Get tomorrow's racecards (Basic+ plan) */
  async getTomorrowRacecards() {
    try {
      const res = await this._get("/racecards/tomorrow");
      return res.racecards || [];
    } catch (e) {
      console.warn("Tomorrow's racecards not available:", e.message);
      return [];
    }
  }

  /** Get racecards for a specific date range (Standard+ plan) */
  async getRacecards(startDate, endDate) {
    try {
      const res = await this._get(`/racecards?start_date=${startDate}&end_date=${endDate}`);
      return res.racecards || [];
    } catch (e) {
      console.warn("Date range racecards not available:", e.message);
      return [];
    }
  }

  // ── Results ──

  /** Get results for a date range (Standard+ plan) */
  async getResults(startDate, endDate) {
    const res = await this._get(`/results?start_date=${startDate}&end_date=${endDate}`);
    return res.results || [];
  }

  /** Get results for today */
  async getTodayResults() {
    const today = new Date().toISOString().split("T")[0];
    return this.getResults(today, today);
  }

  // ── Helpers ──

  /**
   * Normalize a racecard into our internal format for market creation.
   * Returns an object ready for on-chain deployment + frontend display.
   */
  normalizeRace(racecard) {
    const offDt = new Date(racecard.off_dt);
    // Betting stays open until we settle with confirmed results from the API.
    // Set closesAt far in the future so the contract never blocks bets.
    const closesAt = Math.floor(offDt.getTime() / 1000) + 7 * 24 * 60 * 60;

    return {
      // Identifiers
      apiRaceId: racecard.race_id,
      raceIdHash: this.hashRaceId(racecard.race_id),

      // Display info
      name: this.cleanRaceName(racecard.race_name),
      course: racecard.course,
      date: racecard.date,
      offTime: racecard.off_time,
      offDt: racecard.off_dt,
      region: racecard.region,
      pattern: racecard.pattern || "",
      raceClass: racecard.race_class || "",
      type: racecard.type,
      distance: racecard.distance_f,
      going: racecard.going,
      surface: racecard.surface,
      prize: racecard.prize,
      ageBand: racecard.age_band,
      fieldSize: parseInt(racecard.field_size) || 0,

      // On-chain params
      numOutcomes: (racecard.runners || []).length,
      closesAt,

      // Runners
      runners: (racecard.runners || []).map((r, i) => ({
        index: i,
        name: r.horse,
        horseId: r.horse_id,
        jockey: r.jockey,
        jockeyId: r.jockey_id,
        trainer: r.trainer,
        trainerId: r.trainer_id,
        owner: r.owner,
        age: r.age,
        sex: r.sex,
        colour: r.colour,
        sire: r.sire,
        dam: r.dam,
        number: parseInt(r.number) || i + 1,
        draw: parseInt(r.draw) || 0,
        weight: r.lbs,
        headgear: r.headgear,
        officialRating: r.ofr,
        form: r.form,
        lastRun: r.last_run,
      })),
    };
  }

  /** Clean up race name — strip sponsor prefix noise */
  cleanRaceName(name) {
    // Remove common patterns like "Sponsor Name (Group X)" → keep "Group X" part
    // But keep the full name if it's short enough
    if (name.length <= 40) return name;
    // Try to extract the pattern/group part
    const match = name.match(/\((Group \d|Grade \d|Listed|Class \d)[^)]*\)/);
    const coursePart = name.split("(")[0].trim();
    if (match && coursePart.length > 30) {
      // Take last meaningful words before the bracket
      const words = coursePart.split(" ");
      const shortName = words.slice(-3).join(" ");
      return `${shortName} ${match[0]}`;
    }
    return name;
  }

  /** Hash a race_id string to bytes32 for on-chain use */
  hashRaceId(raceId) {
    // Simple keccak256-compatible hash using the API race_id
    // We'll use ethers.js for actual keccak256 in the create-markets script
    return raceId; // Return raw for now, hash at creation time
  }
}
