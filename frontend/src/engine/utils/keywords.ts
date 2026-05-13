/**
 * Keyword utility — checks if a source permanent has a keyword,
 * including keywords granted by attached equipment.
 */

/**
 * Check if a permanent has a keyword, either natively or via equipment.
 * Looks at the creature's own keywords array AND any equipment attached
 * to it that has a `grant_keywords_equipped` static ability.
 */
export function sourceHasKeyword(
  sourceInstanceId: string | undefined,
  keyword: string,
  allBattlefield: any[]
): boolean {
  if (!sourceInstanceId) return false;

  const creature = allBattlefield.find(c => c.instance_id === sourceInstanceId);
  if (!creature) return false;

  // Own keywords
  if (creature.keywords?.includes(keyword)) return true;

  // Keywords granted by attached equipment
  for (const equip of allBattlefield) {
    if (equip.equippedTo?.instance_id === sourceInstanceId) {
      for (const sa of (equip.static_abilities || [])) {
        if (
          sa.effect?.type === 'grant_keywords_equipped' &&
          sa.effect?.keywords?.includes(keyword)
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Ward cost descriptor.
 * - type 'mana': player must pay mana (cost is a mana string like "{1}")
 * - type 'discard': player must discard a card (count defaults to 1)
 */
export interface WardCost {
  type: 'mana' | 'discard';
  cost?: string;    // mana cost string for type='mana'
  count?: number;   // number of cards for type='discard'
}

/**
 * Get the ward cost for a permanent, checking native ward and equipment-granted ward.
 * Returns a WardCost object or null if no ward.
 */
export function getWardCost(
  targetInstanceId: string | undefined,
  allBattlefield: any[]
): WardCost | null {
  if (!targetInstanceId) return null;

  const creature = allBattlefield.find(c => c.instance_id === targetInstanceId);
  if (!creature) return null;

  // Native ward on the creature
  if (creature.ward) {
    return parseWardValue(creature.ward);
  }

  // Ward granted by attached equipment
  for (const equip of allBattlefield) {
    if (equip.equippedTo?.instance_id === targetInstanceId) {
      for (const sa of (equip.static_abilities || [])) {
        if (sa.effect?.type === 'grant_keywords_equipped' && sa.effect?.ward) {
          return parseWardValue(sa.effect.ward);
        }
      }
    }
  }

  return null;
}

/** Parse a ward value from card data into a WardCost. */
function parseWardValue(ward: any): WardCost {
  if (typeof ward === 'string') {
    // e.g. "{1}" or "{2}" — mana cost
    return { type: 'mana', cost: ward };
  }
  if (ward.type === 'discard') {
    return { type: 'discard', count: ward.count || 1 };
  }
  // Object with cost field — mana
  return { type: 'mana', cost: ward.cost || '{1}' };
}
