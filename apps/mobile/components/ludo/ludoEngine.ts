import type { LudoColor, LudoToken } from "@chatapp/shared";

export const LUDO_COLORS: LudoColor[] = [
  "RED",
  "GREEN",
  "YELLOW",
  "BLUE",
  "PURPLE",
  "ORANGE",
];

export const LUDO_COLOR_HEX: Record<LudoColor, string> = {
  RED: "#EF4444",
  GREEN: "#10B981",
  YELLOW: "#F59E0B",
  BLUE: "#3B82F6",
  PURPLE: "#8B5CF6",
  ORANGE: "#F97316",
};

export const LUDO_COLOR_DARK: Record<LudoColor, string> = {
  RED: "#DC2626",
  GREEN: "#059669",
  YELLOW: "#D97706",
  BLUE: "#2563EB",
  PURPLE: "#7C3AED",
  ORANGE: "#EA580C",
};

export const LUDO_COLOR_LIGHT: Record<LudoColor, string> = {
  RED: "rgba(239, 68, 68, 0.2)",
  GREEN: "rgba(16, 185, 129, 0.2)",
  YELLOW: "rgba(245, 158, 11, 0.2)",
  BLUE: "rgba(59, 130, 246, 0.2)",
  PURPLE: "rgba(139, 92, 246, 0.2)",
  ORANGE: "rgba(249, 115, 22, 0.2)",
};

export const WIN_STEP = 56;

export function getLudoConfig(maxPlayers: number) {
  if (maxPlayers <= 4) {
    return {
      trackLength: 52,
      offsets: {
        RED: 0,
        GREEN: 13,
        YELLOW: 26,
        BLUE: 39,
        PURPLE: 0,
        ORANGE: 0,
      } as Record<LudoColor, number>,
      safeTiles: [0, 8, 13, 21, 26, 34, 39, 47],
      outerTrackLimit: 50,
      winStep: 56,
    };
  } else {
    return {
      trackLength: 60,
      offsets: {
        RED: 0,
        GREEN: 10,
        YELLOW: 20,
        BLUE: 30,
        PURPLE: 40,
        ORANGE: 50,
      } as Record<LudoColor, number>,
      safeTiles: [0, 8, 10, 18, 20, 28, 30, 38, 40, 48, 50, 58],
      outerTrackLimit: 50,
      winStep: 56,
    };
  }
}

/**
 * 52 Perimeter Track Grid Coordinates for 15x15 Ludo Board
 * Index 0 is Red Start Tile (row 13, col 6)
 */
export const TRACK_52_COORDS: { row: number; col: number }[] = [
  // Red side up
  { row: 13, col: 6 }, // 0 (Red Start)
  { row: 12, col: 6 }, // 1
  { row: 11, col: 6 }, // 2
  { row: 10, col: 6 }, // 3
  { row: 9, col: 6 },  // 4
  // Left wing bottom row (going left)
  { row: 8, col: 5 },  // 5
  { row: 8, col: 4 },  // 6
  { row: 8, col: 3 },  // 7
  { row: 8, col: 2 },  // 8 (Safe Star)
  { row: 8, col: 1 },  // 9
  { row: 8, col: 0 },  // 10
  { row: 7, col: 0 },  // 11 (Left Cap)
  { row: 6, col: 0 },  // 12
  // Left wing top row (going right)
  { row: 6, col: 1 },  // 13 (Green Start)
  { row: 6, col: 2 },  // 14
  { row: 6, col: 3 },  // 15
  { row: 6, col: 4 },  // 16
  { row: 6, col: 5 },  // 17
  // Top wing left col (going up)
  { row: 5, col: 6 },  // 18
  { row: 4, col: 6 },  // 19
  { row: 3, col: 6 },  // 20
  { row: 2, col: 6 },  // 21 (Safe Star)
  { row: 1, col: 6 },  // 22
  { row: 0, col: 6 },  // 23
  { row: 0, col: 7 },  // 24 (Top Cap)
  { row: 0, col: 8 },  // 25
  // Top wing right col (going down)
  { row: 1, col: 8 },  // 26 (Yellow Start)
  { row: 2, col: 8 },  // 27
  { row: 3, col: 8 },  // 28
  { row: 4, col: 8 },  // 29
  { row: 5, col: 8 },  // 30
  // Right wing top row (going right)
  { row: 6, col: 9 },  // 31
  { row: 6, col: 10 }, // 32
  { row: 6, col: 11 }, // 33
  { row: 6, col: 12 }, // 34 (Safe Star)
  { row: 6, col: 13 }, // 35
  { row: 6, col: 14 }, // 36
  { row: 7, col: 14 }, // 37 (Right Cap)
  { row: 8, col: 14 }, // 38
  // Right wing bottom row (going left)
  { row: 8, col: 13 }, // 39 (Blue Start)
  { row: 8, col: 12 }, // 40
  { row: 8, col: 11 }, // 41
  { row: 8, col: 10 }, // 42
  { row: 8, col: 9 },  // 43
  // Bottom wing right col (going down)
  { row: 9, col: 8 },  // 44
  { row: 10, col: 8 }, // 45
  { row: 11, col: 8 }, // 46
  { row: 12, col: 8 }, // 47 (Safe Star)
  { row: 13, col: 8 }, // 48
  { row: 14, col: 8 }, // 49
  { row: 14, col: 7 }, // 50 (Bottom Cap)
  { row: 14, col: 6 }, // 51
];

export const SAFE_STAR_TILES = [8, 21, 34, 47];
export const COLOR_START_TILES: Record<LudoColor, number> = {
  RED: 0,
  GREEN: 13,
  YELLOW: 26,
  BLUE: 39,
  PURPLE: 0,
  ORANGE: 0,
};

/**
 * 5-Cell Home Runways leading from perimeter to center triangle
 * (Steps 51 to 55)
 */
export const HOME_RUNWAYS: Record<LudoColor, { row: number; col: number }[]> = {
  RED: [
    { row: 13, col: 7 },
    { row: 12, col: 7 },
    { row: 11, col: 7 },
    { row: 10, col: 7 },
    { row: 9, col: 7 },
  ],
  GREEN: [
    { row: 7, col: 1 },
    { row: 7, col: 2 },
    { row: 7, col: 3 },
    { row: 7, col: 4 },
    { row: 7, col: 5 },
  ],
  YELLOW: [
    { row: 1, col: 7 },
    { row: 2, col: 7 },
    { row: 3, col: 7 },
    { row: 4, col: 7 },
    { row: 5, col: 7 },
  ],
  BLUE: [
    { row: 7, col: 13 },
    { row: 7, col: 12 },
    { row: 7, col: 11 },
    { row: 7, col: 10 },
    { row: 7, col: 9 },
  ],
  PURPLE: [
    { row: 7, col: 1 },
    { row: 7, col: 2 },
    { row: 7, col: 3 },
    { row: 7, col: 4 },
    { row: 7, col: 5 },
  ],
  ORANGE: [
    { row: 7, col: 13 },
    { row: 7, col: 12 },
    { row: 7, col: 11 },
    { row: 7, col: 10 },
    { row: 7, col: 9 },
  ],
};

/**
 * Home center victory triangle coordinates
 */
export const HOME_CENTER_COORDS: Record<LudoColor, { row: number; col: number }> = {
  RED: { row: 8, col: 7 },
  GREEN: { row: 7, col: 6 },
  YELLOW: { row: 6, col: 7 },
  BLUE: { row: 7, col: 8 },
  PURPLE: { row: 7, col: 6.5 },
  ORANGE: { row: 7, col: 7.5 },
};

/**
 * 4 Circular Nest Pockets inside each 6x6 Yard
 */
export const YARD_NESTS: Record<LudoColor, { row: number; col: number }[]> = {
  GREEN: [
    { row: 1.5, col: 1.5 },
    { row: 1.5, col: 3.5 },
    { row: 3.5, col: 1.5 },
    { row: 3.5, col: 3.5 },
  ],
  YELLOW: [
    { row: 1.5, col: 10.5 },
    { row: 1.5, col: 12.5 },
    { row: 3.5, col: 10.5 },
    { row: 3.5, col: 12.5 },
  ],
  RED: [
    { row: 10.5, col: 1.5 },
    { row: 10.5, col: 3.5 },
    { row: 12.5, col: 1.5 },
    { row: 12.5, col: 3.5 },
  ],
  BLUE: [
    { row: 10.5, col: 10.5 },
    { row: 10.5, col: 12.5 },
    { row: 12.5, col: 10.5 },
    { row: 12.5, col: 12.5 },
  ],
  PURPLE: [
    { row: 0.5, col: 6 },
    { row: 0.5, col: 8 },
    { row: 1.5, col: 6 },
    { row: 1.5, col: 8 },
  ],
  ORANGE: [
    { row: 13.5, col: 6 },
    { row: 13.5, col: 8 },
    { row: 14.5, col: 6 },
    { row: 14.5, col: 8 },
  ],
};

export function createTokens(color: LudoColor): LudoToken[] {
  return [0, 1, 2, 3].map((id) => ({
    id,
    color,
    step: -1, // in yard
    isHome: false,
    inYard: true,
  }));
}

/**
 * Determines exact { row, col } for any token on the 15x15 board
 */
export function getTokenBoardCoordinates(
  token: LudoToken,
  playerColor: LudoColor,
  maxPlayers: number
): { row: number; col: number } {
  // 1. In Yard
  if (token.inYard || token.step < 0) {
    const nests = YARD_NESTS[playerColor] || YARD_NESTS.RED;
    return nests[token.id % 4];
  }

  // 2. Victory Home (step 56 or isHome)
  if (token.isHome || token.step >= WIN_STEP) {
    return HOME_CENTER_COORDS[playerColor] || { row: 7, col: 7 };
  }

  // 3. Home Runway (step 51..55)
  if (token.step >= 51 && token.step <= 55) {
    const runway = HOME_RUNWAYS[playerColor] || HOME_RUNWAYS.RED;
    const idx = token.step - 51;
    return runway[idx] || runway[0];
  }

  // 4. Perimeter Track (step 0..50)
  const config = getLudoConfig(maxPlayers);
  const offset = config.offsets[playerColor] || 0;
  const tileIndex = (offset + token.step) % config.trackLength;

  if (tileIndex < TRACK_52_COORDS.length) {
    return TRACK_52_COORDS[tileIndex];
  }

  return TRACK_52_COORDS[tileIndex % TRACK_52_COORDS.length];
}
