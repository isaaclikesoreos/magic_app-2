import type { Permanent } from '@/types';
import { calculateCMC } from './manaCost';

export type SacController = 'you' | 'opponent' | 'any';

export interface SacrificeFilter {
  types: string[];
  controller: SacController;
  excludeInstanceId?: string;
}

export const matchesSacFilter = (
  permanent: Permanent,
  permanentController: 'you' | 'opponent',
  filter: SacrificeFilter
): boolean => {
  if (filter.controller === 'you' && permanentController !== 'you') return false;
  if (filter.controller === 'opponent' && permanentController !== 'opponent') return false;

  if (filter.excludeInstanceId && permanent.instance_id === filter.excludeInstanceId) {
    return false;
  }

  if (filter.types && filter.types.length > 0) {
    const tl = (permanent.type_line || '').toLowerCase();
    const matchesType = filter.types.some(t => tl.includes(t.toLowerCase()));
    if (!matchesType) return false;
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
