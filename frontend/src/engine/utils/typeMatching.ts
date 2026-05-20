import type { Card, GameState, PlayerKey } from '@/types';

/**
 * Does `card` satisfy the tribal/type filter `types` from `controllerKey`'s
 * perspective? Centralizes the "X is creature type Y" check so type-line
 * modifiers (Maskwood Nexus's `every_creature_type` static, the `changeling`
 * keyword, etc.) apply consistently across sacrifice filters, tribal tutors,
 * and counting effects.
 *
 * Returns true if any of:
 *   - `types` is empty (no filter).
 *   - Card's type_line directly contains one of the requested types (existing
 *     substring behavior).
 *   - Card has the `changeling` keyword — it is every creature type.
 *   - Card is a creature AND the controller has a permanent on the battlefield
 *     with the `every_creature_type` static (Maskwood Nexus). The static
 *     extends to creatures the controller owns in any zone (creature spells
 *     on the stack, creature cards in hand / library / graveyard / exile).
 */
export function creatureMatchesTypeFilter(
  card: Card | undefined | null,
  types: string[] | undefined,
  controllerKey: PlayerKey,
  gameState: GameState | undefined | null
): boolean {
  if (!card) return false;
  if (!types || types.length === 0) return true;

  const tl = (card.type_line || '').toLowerCase();
  if (types.some(t => tl.includes(String(t).toLowerCase()))) return true;

  // Changeling: card is every creature type.
  if ((card as any).keywords?.includes('changeling')) return true;

  // Maskwood Nexus-style static — extends to creatures controlled/owned by
  // the player regardless of zone (creature cards, creature spells, etc.).
  if (!tl.includes('creature')) return false;
  if (!gameState) return false;
  const bf = gameState.players[controllerKey]?.battlefield || [];
  return bf.some((p: any) =>
    (p.static_abilities || []).some((sa: any) =>
      sa.effect?.type === 'every_creature_type'
    )
  );
}
