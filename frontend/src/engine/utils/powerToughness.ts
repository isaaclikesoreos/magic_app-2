/**
 * Centralized power/toughness calculation utilities.
 * Accounts for base stats, +1/+1 counters, buff effects, prowess, and attached roles.
 */

import { Permanent } from '@/types';

export const calculatePower = (creature: Permanent): number => {
  let power = parseInt(creature.power || '0');

  if (creature.counters?.['+1/+1']) {
    power += creature.counters['+1/+1'];
  }
  if (creature.counters?.['-1/-1']) {
    power -= creature.counters['-1/-1'];
  }
  if (creature.buffPower) {
    power += creature.buffPower;
  }
  if (creature.prowessBonus) {
    power += creature.prowessBonus;
  }
  if (creature.attachedRoles) {
    creature.attachedRoles.forEach(role => {
      if (role.power) power += role.power;
    });
  }

  return power;
};

export const calculateToughness = (creature: Permanent): number => {
  let toughness = parseInt(creature.toughness || '0');

  if (creature.counters?.['+1/+1']) {
    toughness += creature.counters['+1/+1'];
  }
  if (creature.counters?.['-1/-1']) {
    toughness -= creature.counters['-1/-1'];
  }
  if (creature.buffToughness) {
    toughness += creature.buffToughness;
  }
  if (creature.prowessBonus) {
    toughness += creature.prowessBonus;
  }
  if (creature.attachedRoles) {
    creature.attachedRoles.forEach(role => {
      if (role.toughness) toughness += role.toughness;
    });
  }

  return toughness;
};

export const isLethalDamage = (creature: Permanent, damage: number): boolean => {
  return damage >= calculateToughness(creature);
};
