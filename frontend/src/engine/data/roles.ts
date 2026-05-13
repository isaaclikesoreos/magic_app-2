/**
 * Role token definitions - data-driven instead of hard-coded in effect handlers.
 */
export const roleDefinitions = {
  'Monster': { power: 1, toughness: 1, keywords: ['trample'] },
  'Royal': { power: 1, toughness: 1, keywords: ['ward'] },
  'Cursed': { setBasePT: { power: 1, toughness: 1 } },
  'Sorcerer': { power: 1, toughness: 1, keywords: ['scry_on_attack'] },
  'Wicked': { power: 1, toughness: 1, onDeath: 'opponent_loses_1' },
  'Young Hero': { keywords: ['young_hero_attack'] },
  'Virtuous': { powerPerEnchantment: 1, toughnessPerEnchantment: 1 },
};
