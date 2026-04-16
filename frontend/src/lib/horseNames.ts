/// @notice Horse name and color mapping for on-chain markets.
/// Since the contracts only store outcome indices (0, 1, 2...),
/// we map raceId → horse metadata here. In production, this would
/// come from your oracle backend / API.

export interface HorseInfo {
  name: string;
  jockey: string;
  silkColor: string; // tailwind color class for the probability bar
}

// Default horse names for when we don't have metadata
const DEFAULT_NAMES = [
  "Thunderbolt",
  "Golden Arrow",
  "Night Storm",
  "Silver Moon",
  "Iron Duke",
  "Wild Card",
  "Dark Star",
  "Lucky Strike",
  "Phantom",
  "Blaze Runner",
];

const DEFAULT_JOCKEYS = [
  "R. Moore",
  "F. Dettori",
  "J. Doyle",
  "T. Marquand",
  "W. Buick",
  "O. Murphy",
  "B. Curtis",
  "H. Bentley",
  "D. Tudhope",
  "C. Soumillon",
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
  "bg-gold/60",
  "bg-accent-blue/50",
  "bg-accent-green/45",
  "bg-accent-red/40",
  "bg-purple-400/35",
  "bg-teal-400/30",
  "bg-orange-400/35",
  "bg-pink-400/30",
  "bg-cyan-400/30",
  "bg-yellow-400/30",
];

export function getHorseInfo(outcomeIndex: number, _raceId?: string): HorseInfo {
  // In production, look up by raceId from your backend
  // For now, use deterministic defaults
  return {
    name: DEFAULT_NAMES[outcomeIndex % DEFAULT_NAMES.length],
    jockey: DEFAULT_JOCKEYS[outcomeIndex % DEFAULT_JOCKEYS.length],
    silkColor: SILK_COLORS[outcomeIndex % SILK_COLORS.length],
  };
}

export function getBarColor(outcomeIndex: number): string {
  return BAR_COLORS[outcomeIndex % BAR_COLORS.length];
}

// Race name mapping (raceId hash → display name)
// In production this comes from your API
export function getRaceName(raceId: string, marketAddress: string): string {
  // For now, generate a friendly name from the address
  return `Race ${marketAddress.slice(2, 6).toUpperCase()}`;
}
