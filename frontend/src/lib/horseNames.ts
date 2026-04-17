/// @notice Horse name and color mapping for on-chain markets.
/// Maps raceId (bytes32 hash) → horse metadata using data generated
/// by the backend from The Racing API.

import raceData from "./race-data.json";

export interface RunnerInfo {
  index: number;
  name: string;
  jockey: string;
  trainer: string;
  number: number;
  draw: number;
  weight: string;
  form: string;
  age: string;
  sex: string;
  sire: string;
  dam: string;
  officialRating: string;
}

export interface RaceMetadata {
  apiRaceId: string;
  name: string;
  course: string;
  date: string;
  offTime: string;
  region: string;
  pattern: string;
  type: string;
  distance: string;
  going: string;
  surface: string;
  prize: string;
  runners: RunnerInfo[];
}

export interface HorseInfo {
  name: string;
  jockey: string;
  silkColor: string;
  trainer?: string;
  form?: string;
  draw?: number;
  weight?: string;
  age?: string;
  sire?: string;
  dam?: string;
}

// Typed race data from the backend-generated JSON
const RACE_DATA: Record<string, RaceMetadata> = raceData as Record<string, RaceMetadata>;

// Default fallbacks for when metadata isn't available
const DEFAULT_NAMES = [
  "Thunderbolt", "Golden Arrow", "Night Storm", "Silver Moon", "Iron Duke",
  "Wild Card", "Dark Star", "Lucky Strike", "Phantom", "Blaze Runner",
];

const DEFAULT_JOCKEYS = [
  "R. Moore", "F. Dettori", "J. Doyle", "T. Marquand", "W. Buick",
  "O. Murphy", "B. Curtis", "H. Bentley", "D. Tudhope", "C. Soumillon",
];

const SILK_COLORS = [
  "from-gold/70 to-gold/30",
  "from-accent-blue/60 to-accent-blue/25",
  "from-accent-green/55 to-accent-green/20",
  "from-accent-red/50 to-accent-red/20",
  "from-purple-400/45 to-purple-400/15",
  "from-teal-400/40 to-teal-400/15",
  "from-orange-400/45 to-orange-400/15",
  "from-pink-400/40 to-pink-400/15",
  "from-cyan-400/40 to-cyan-400/15",
  "from-yellow-400/40 to-yellow-400/15",
];

const BAR_COLORS = [
  "bg-gold/60", "bg-accent-blue/50", "bg-accent-green/45", "bg-accent-red/40",
  "bg-purple-400/35", "bg-teal-400/30", "bg-orange-400/35", "bg-pink-400/30",
  "bg-cyan-400/30", "bg-yellow-400/30",
];

/**
 * Get horse info for a given outcome index.
 * If raceId is provided and we have metadata from The Racing API, use real data.
 * Otherwise fall back to defaults.
 */
export function getHorseInfo(outcomeIndex: number, raceId?: string): HorseInfo {
  // Try to look up real data from The Racing API
  if (raceId && RACE_DATA[raceId]) {
    const race = RACE_DATA[raceId];
    const runner = race.runners[outcomeIndex];
    if (runner) {
      return {
        name: runner.name,
        jockey: runner.jockey,
        silkColor: SILK_COLORS[outcomeIndex % SILK_COLORS.length],
        trainer: runner.trainer,
        form: runner.form,
        draw: runner.draw,
        weight: runner.weight,
        age: runner.age,
        sire: runner.sire,
        dam: runner.dam,
      };
    }
  }

  // Fallback to defaults
  return {
    name: DEFAULT_NAMES[outcomeIndex % DEFAULT_NAMES.length],
    jockey: DEFAULT_JOCKEYS[outcomeIndex % DEFAULT_JOCKEYS.length],
    silkColor: SILK_COLORS[outcomeIndex % SILK_COLORS.length],
  };
}

export function getBarColor(outcomeIndex: number): string {
  return BAR_COLORS[outcomeIndex % BAR_COLORS.length];
}

/**
 * Get the display name for a race.
 * Uses real metadata if available, otherwise generates from address.
 */
export function getRaceName(raceId: string, marketAddress: string): string {
  if (RACE_DATA[raceId]) {
    const race = RACE_DATA[raceId];
    return `${race.name}`;
  }
  return `Race ${marketAddress.slice(2, 6).toUpperCase()}`;
}

/**
 * Get full race metadata if available.
 */
export function getRaceMetadata(raceId: string): RaceMetadata | null {
  return RACE_DATA[raceId] || null;
}

/**
 * Get the venue/course for a race.
 */
export function getRaceVenue(raceId: string): string | null {
  return RACE_DATA[raceId]?.course || null;
}
