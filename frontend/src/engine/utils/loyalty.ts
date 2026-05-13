/**
 * Loyalty access for planeswalkers.
 *
 * Loyalty is stored as a direct field (`permanent.loyalty`), not as a counter.
 * This is a deliberate simplification: it works for single-target damage,
 * activated +N/-N costs, and combat damage. Future effects that manipulate
 * counters in general (proliferate, add_counter, remove_counter) should
 * special-case planeswalkers and call addLoyalty/setLoyalty here so all
 * loyalty manipulation routes through one place.
 */

import { Permanent } from '@/types';

export const isPlaneswalker = (p: Permanent): boolean =>
  (p.type_line || '').toLowerCase().includes('planeswalker');

export const getLoyalty = (p: Permanent): number =>
  ((p as any).loyalty as number | undefined) ?? 0;

export const setLoyalty = (p: Permanent, n: number): void => {
  (p as any).loyalty = n;
};

/** Adjust loyalty by delta. Negative reduces (cost or damage); positive gains. */
export const addLoyalty = (p: Permanent, delta: number): number => {
  const next = getLoyalty(p) + delta;
  (p as any).loyalty = next;
  return next;
};
