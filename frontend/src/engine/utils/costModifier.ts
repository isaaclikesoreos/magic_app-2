import type { Card, GameState } from '@/types';

/**
 * Generic-mana tax on a noncreature spell from opponent's static abilities
 * (Thalia, Guardian of Thraben — "Noncreature spells cost {1} more to cast.").
 *
 * Returns the TOTAL generic increase (sum of `amount` across all matching
 * statics on opponent's battlefield). 0 for creature spells, 0 if no Thalia.
 *
 * Folded into `getCostReduction` via subtraction so the existing cost-payment
 * math (`generic - reduction`) handles the tax without further changes —
 * negative reduction = net increase.
 */
export function getNoncreatureCostTax(card: Card, gameState: GameState): number {
  const tl = (card.type_line || '').toLowerCase();
  if (tl.includes('creature')) return 0;
  let tax = 0;
  const oppBf = gameState.players.opponent?.battlefield || [];
  for (const perm of oppBf) {
    const statics = (perm as any).static_abilities || [];
    for (const sa of statics) {
      if (sa?.effect?.type === 'noncreature_spell_cost_more') {
        tax += sa.effect.amount ?? 1;
      }
    }
  }
  return tax;
}
