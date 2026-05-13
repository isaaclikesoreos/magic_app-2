/**
 * Centralized mana cost parsing, affordability checking, and spending utilities.
 */

import { ManaPool, Cost } from '@/types';

interface ParsedManaCost {
  colored: {
    W: number;
    U: number;
    B: number;
    R: number;
    G: number;
  };
  generic: number;
  xCount: number;
}

/**
 * Convert a Cost object to a mana cost string.
 * @param cost - Cost object or mana cost string
 * @returns Mana cost string like "{2}{R}{R}" or "{T}" or empty string
 */
export const costToString = (cost: Cost | string | undefined | null): string => {
  if (!cost) return '';
  if (typeof cost === 'string') return cost;

  // Build mana cost string from Cost object
  let result = '';

  // Add generic mana
  if (cost.mana?.generic) {
    result += `{${cost.mana.generic}}`;
  }

  // Add X costs
  if (cost.mana?.X) {
    for (let i = 0; i < cost.mana.X; i++) {
      result += '{X}';
    }
  }

  // Add colored mana
  if (cost.mana?.colored) {
    const colors: Array<keyof typeof cost.mana.colored> = ['W', 'U', 'B', 'R', 'G', 'C'];
    for (const color of colors) {
      const count = cost.mana.colored[color] || 0;
      for (let i = 0; i < count; i++) {
        result += `{${color}}`;
      }
    }
  }

  // Add tap symbol
  if (cost.tap) {
    result += '{T}';
  }

  return result;
};

/**
 * Parse a mana cost string into structured format.
 * @param manaCost - e.g., "{2}{R}{R}" or "{X}{X}{G}"
 * @returns Parsed mana cost object
 */
export const parseManaCost = (manaCost: string | undefined | null): ParsedManaCost => {
  // Convert to string and handle non-string inputs
  const cost = manaCost ? String(manaCost) : '';

  // Count each color — match exact {W}, Phyrexian {W/P}, and hybrid {W/U} (left side counts)
  const countColor = (color: string): number => {
    const exact = (cost.match(new RegExp(`\\{${color}\\}`, 'g')) || []).length;
    const phyrexian = (cost.match(new RegExp(`\\{${color}/P\\}`, 'gi')) || []).length;
    // Hybrid: only count if this color is on the LEFT side (to avoid double counting)
    const hybridLeft = (cost.match(new RegExp(`\\{${color}/[WUBRG]\\}`, 'g')) || []).length;
    return exact + phyrexian + hybridLeft;
  };

  return {
    colored: {
      W: countColor('W'),
      U: countColor('U'),
      B: countColor('B'),
      R: countColor('R'),
      G: countColor('G'),
    },
    generic: parseInt(cost.match(/{(\d+)}/)?.[1] || '0'),
    xCount: (cost.match(/{X}/g) || []).length,
  };
};

/**
 * Calculate converted mana cost (total mana value).
 * @param manaCost - e.g., "{2}{R}{R}"
 * @returns Total CMC
 */
export const calculateCMC = (manaCost: string | undefined | null): number => {
  const parsed = parseManaCost(manaCost);
  const coloredTotal = Object.values(parsed.colored).reduce((a, b) => a + b, 0);
  return coloredTotal + parsed.generic;
};

/**
 * Calculate actual mana spent to cast a spell.
 * Accounts for cost reduction (which only reduces the generic portion).
 * Accepts either a mana cost string or a pre-parsed cost (for combined costs like base + kicker).
 */
export const calculateManaSpent = (cost: string | undefined | null | ParsedManaCost, xValue = 0, costReduction = 0): number => {
  const parsed = (typeof cost === 'object' && cost !== null && 'colored' in cost)
    ? cost as ParsedManaCost
    : parseManaCost(cost as string | undefined | null);
  const coloredTotal = Object.values(parsed.colored).reduce((a, b) => a + b, 0);
  const xTotal = parsed.xCount * xValue;
  const genericSpent = Math.max(0, parsed.generic + xTotal - costReduction);
  return coloredTotal + genericSpent;
};

/**
 * Get total colored mana needed from a parsed cost.
 */
export const getTotalColoredNeeded = (parsedCost: ParsedManaCost): number => {
  return Object.values(parsedCost.colored).reduce((a, b) => a + b, 0);
};

/**
 * Check if a mana pool can afford a parsed cost.
 * @param parsedCost - from parseManaCost
 * @param manaPool - e.g., { R: 3, G: 1, C: 0 }
 * @param xValue - value chosen for each X
 * @param costReduction - generic cost reduction amount
 * @returns true if affordable
 */
export const canAffordCost = (
  parsedCost: ParsedManaCost,
  manaPool: Partial<ManaPool> | null | undefined,
  xValue = 0,
  costReduction = 0
): boolean => {
  const available = manaPool || {};
  const availableTotal = Object.values(available).reduce((a, b) => (a || 0) + (b || 0), 0) as number;

  // Check each colored requirement
  for (const [color, needed] of Object.entries(parsedCost.colored)) {
    if ((available[color as keyof ManaPool] || 0) < needed) {
      return false;
    }
  }

  // Check total for generic + X
  const coloredTotal = getTotalColoredNeeded(parsedCost);
  const xTotal = parsedCost.xCount * xValue;
  const genericNeeded = Math.max(0, parsedCost.generic + xTotal - costReduction);

  return availableTotal >= coloredTotal + genericNeeded;
};

/**
 * Spend mana from a pool. Returns a new pool object (does not mutate).
 * @param manaPool - current mana pool
 * @param parsedCost - from parseManaCost
 * @param xValue - value chosen for each X
 * @param costReduction - generic cost reduction amount
 * @returns new mana pool after spending
 */
export const spendMana = (
  manaPool: Partial<ManaPool>,
  parsedCost: ParsedManaCost,
  xValue = 0,
  costReduction = 0
): ManaPool => {
  const newPool: Partial<ManaPool> = { ...manaPool };

  // Spend colored mana
  for (const [color, needed] of Object.entries(parsedCost.colored)) {
    const key = color as keyof ManaPool;
    newPool[key] = (newPool[key] || 0) - needed;
  }

  // Spend generic (colorless first, then any color)
  const xTotal = parsedCost.xCount * xValue;
  let genericToSpend = Math.max(0, parsedCost.generic + xTotal - costReduction);
  for (const col of ['C', 'W', 'U', 'B', 'R', 'G'] as Array<keyof ManaPool>) {
    if (genericToSpend <= 0) break;
    const available = newPool[col] || 0;
    const toSpend = Math.min(available, genericToSpend);
    newPool[col] = available - toSpend;
    genericToSpend -= toSpend;
  }

  // Ensure all required keys exist
  return {
    W: newPool.W || 0,
    U: newPool.U || 0,
    B: newPool.B || 0,
    R: newPool.R || 0,
    G: newPool.G || 0,
    C: newPool.C || 0,
  };
};
