/**
 * Data-driven land mana abilities registry.
 * Maps lowercase land names to their mana production abilities.
 */

import { Card, Permanent } from '@/types';

// Land mana map: land name to colors produced
const landManaMap: Record<string, string[]> = {
  // Original dual lands
  'badlands': ['B', 'R'],
  'bayou': ['B', 'G'],
  'plateau': ['R', 'W'],
  'savannah': ['G', 'W'],
  'scrubland': ['W', 'B'],
  'taiga': ['R', 'G'],
  'tropical island': ['G', 'U'],
  'tundra': ['U', 'W'],
  'underground sea': ['U', 'B'],
  'volcanic island': ['U', 'R'],

  // Shock lands
  'blood crypt': ['B', 'R'],
  'breeding pool': ['G', 'U'],
  'godless shrine': ['W', 'B'],
  'hallowed fountain': ['W', 'U'],
  'overgrown tomb': ['B', 'G'],
  'sacred foundry': ['R', 'W'],
  'steam vents': ['U', 'R'],
  'stomping ground': ['R', 'G'],
  'temple garden': ['G', 'W'],
  'watery grave': ['U', 'B'],

  // Colorless utility lands
  'wasteland': ['C'],
};

// Basic land type to color mapping
const basicTypeColors: Record<string, string> = {
  'mountain': 'R',
  'island': 'U',
  'swamp': 'B',
  'forest': 'G',
  'plains': 'W',
};

// Mana ability interface
export interface ManaAbility {
  mana: string;
  label: string;
}

/**
 * Get mana abilities for a land card.
 * @param land - card object with name, type_line, oracle_text
 * @returns Array of mana abilities
 */
export const getLandManaAbilities = (land: Card | Permanent): ManaAbility[] => {
  const abilities: ManaAbility[] = [];
  const name = (land.name || '').toLowerCase();
  const typeLine = (land.type_line || '').toLowerCase();
  const oracleText = (land.oracle_text || '').toLowerCase();
  const addedColors = new Set<string>();

  const addColor = (color: string): void => {
    if (!addedColors.has(color)) {
      addedColors.add(color);
      abilities.push({ mana: color, label: `{${color}}` });
    }
  };

  // Check basic land types in the type line
  for (const [landType, color] of Object.entries(basicTypeColors)) {
    if (typeLine.includes(landType) || (typeLine.includes('basic') && name.includes(landType))) {
      addColor(color);
    }
  }

  // Check the named land registry
  if (landManaMap[name]) {
    landManaMap[name].forEach(color => addColor(color));
  }

  // Parse oracle text for "add {X}" patterns
  const addManaPattern = /add \{([wubrgc])\}/gi;
  let match: RegExpExecArray | null;
  while ((match = addManaPattern.exec(oracleText)) !== null) {
    addColor(match[1].toUpperCase());
  }

  // Fallback: any land with no identified abilities produces colorless
  if (abilities.length === 0 && typeLine.includes('land')) {
    if (oracleText.includes('add one colorless') || name === 'wasteland') {
      addColor('C');
    } else {
      addColor('C');
    }
  }

  return abilities;
};
