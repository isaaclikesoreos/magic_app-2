import type { Permanent, GameState } from '@/types';
import { calculateCMC } from './manaCost';
import { creatureMatchesTypeFilter } from './typeMatching';

export type SacController = 'you' | 'opponent' | 'any';

export interface SacrificeFilter {
  types: string[];
  controller: SacController;
  excludeInstanceId?: string;
}

/**
 * Optional `gameState` enables Maskwood Nexus / changeling type-line modifiers
 * to apply. Callers without easy access to gameState can omit it — the filter
 * falls back to literal type_line substring matching (existing behavior).
 */
export const matchesSacFilter = (
  permanent: Permanent,
  permanentController: 'you' | 'opponent',
  filter: SacrificeFilter,
  gameState?: GameState
): boolean => {
  if (filter.controller === 'you' && permanentController !== 'you') return false;
  if (filter.controller === 'opponent' && permanentController !== 'opponent') return false;

  if (filter.excludeInstanceId && permanent.instance_id === filter.excludeInstanceId) {
    return false;
  }

  if (filter.types && filter.types.length > 0) {
    if (!creatureMatchesTypeFilter(permanent, filter.types, permanentController, gameState)) {
      return false;
    }
  }

  return true;
};

// Tiebreak order: highest CMC, then toughness, then power, then random.
// Opponent-sacrifices-X effects (Edicts) call this — heuristic approximates
// "opponent loses their biggest threat" while staying deterministic enough
// for puzzle design.
export const autoPickSacrifices = (
  candidates: Permanent[],
  count: number
): Permanent[] => {
  if (count <= 0 || candidates.length === 0) return [];
  const score = (p: Permanent) => ({
    cmc: calculateCMC(p.mana_cost || ''),
    tough: parseInt(p.toughness || '0', 10) || 0,
    pow: parseInt(p.power || '0', 10) || 0,
  });
  const sorted = [...candidates].sort((a, b) => {
    const sa = score(a), sb = score(b);
    if (sa.cmc !== sb.cmc) return sb.cmc - sa.cmc;
    if (sa.tough !== sb.tough) return sb.tough - sa.tough;
    if (sa.pow !== sb.pow) return sb.pow - sa.pow;
    return Math.random() - 0.5;
  });
  return sorted.slice(0, count);
};
