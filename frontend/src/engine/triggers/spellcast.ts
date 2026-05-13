import { createTriggerStackItem, matchesTriggerEvent, getTriggerSource, getTriggerCondition } from './helpers';
import { calculateCMC } from '../utils/manaCost';
import { getLandManaAbilities } from '../data/lands';
import { GameState, StackItem, Card, PlayerKey, Player } from '@/types';

interface SpellCastCMCEventData {
  spellCard: Card;
  casterIsYou: boolean;
}

interface SpellCastCountEventData {
  castingPlayer: PlayerKey;
  spellsCastThisTurn: number;
}

/**
 * Detect spell cast CMC triggers (Eidolon of the Great Revel).
 */
export const detectSpellCastCMCTriggers = (eventData: SpellCastCMCEventData, gameState: GameState): StackItem[] => {
  const { spellCard, casterIsYou } = eventData;
  const triggersToAdd: StackItem[] = [];
  const cmc = calculateCMC(spellCard.mana_cost);

  const checkPlayer = (playerObj: Player, playerKey: PlayerKey): void => {
    playerObj.battlefield?.forEach(permanent => {
      if (permanent.triggered_abilities) {
        permanent.triggered_abilities.forEach(ability => {
          // Old format: hardcoded string
          const isOldFormat = ability.trigger === 'spell_cast_cmc_3_or_less';
          // New DB format: event = "spell_cast" with condition.cmc.max
          const isNewFormat = matchesTriggerEvent(ability, 'spell_cast') && getTriggerCondition(ability)?.cmc;

          if (!isOldFormat && !isNewFormat) return;

          // Check CMC threshold
          const condition = getTriggerCondition(ability);
          const maxCmc = condition?.cmc?.max ?? 3;
          if (cmc > maxCmc) return;

          const targetOwner = casterIsYou ? 'you' : 'opponent';
          triggersToAdd.push({
            id: `spell-cmc-${permanent.card_id}-${Date.now()}-${Math.random()}`,
            type: 'triggered_ability',
            source: {
              card_id: permanent.card_id,
              name: permanent.name,
              owner: playerKey
            },
            effect: {
              ...ability.effect,
              type: 'damage_to_caster',
              targetOwner: targetOwner
            },
            requires_input: false,
            targeting_data: null,
            resolved: false,
            timestamp: Date.now()
          } as StackItem);
        });
      }
    });
  };

  checkPlayer(gameState.players.you, 'you');
  checkPlayer(gameState.players.opponent, 'opponent');

  return triggersToAdd;
};

/**
 * Detect spell count triggers (Cosmogrand Zenith "second spell each turn", etc.).
 * Uses condition.spell_count threshold, mirroring draw trigger's draw_count pattern.
 */
export const detectSpellCountTriggers = (eventData: SpellCastCountEventData, gameState: GameState): StackItem[] => {
  const { castingPlayer, spellsCastThisTurn } = eventData;
  const triggers: StackItem[] = [];

  (['you', 'opponent'] as PlayerKey[]).forEach(controllerKey => {
    const controller = gameState.players[controllerKey];
    controller.battlefield?.forEach(permanent => {
      if (!permanent.triggered_abilities) return;

      permanent.triggered_abilities.forEach(ability => {
        // Match both old format ('second_spell_each_turn' string) and new format
        const isOldFormat = ability.trigger === 'second_spell_each_turn';
        const isNewFormat = matchesTriggerEvent(ability, 'spell_cast');
        if (!isOldFormat && !isNewFormat) return;

        // New-format spell_cast triggers must have spell_count condition to be handled here.
        // Other spell_cast triggers (e.g. Eidolon's CMC-based) are handled by other detectors.
        if (isNewFormat && !getTriggerCondition(ability)?.spell_count) return;

        // Check source: does this trigger care about who cast?
        const source = getTriggerSource(ability);
        const casterIsController = castingPlayer === controllerKey;
        if (source === 'self' && !casterIsController) return;
        if (source === 'opponent' && casterIsController) return;

        // Check spell_count condition threshold
        const condition = getTriggerCondition(ability);
        const requiredCount = condition?.spell_count;
        // Old format has no condition — defaults to 2
        const threshold = requiredCount || (isOldFormat ? 2 : undefined);
        if (threshold && spellsCastThisTurn !== threshold) return;

        triggers.push(createTriggerStackItem('spell-count', permanent, ability, controllerKey));
      });
    });
  });

  return triggers;
};

// Backward compatibility alias
export const detectSecondSpellTriggers = detectSpellCountTriggers;

/**
 * Detect noncreature spell cast triggers (Prowess, Young Pyromancer, Third Path Iconoclast, etc).
 */
export const detectNoncreatureSpellCastTriggers = (eventData: { spell: Card }, gameState: GameState): StackItem[] => {
  const triggersToAdd: StackItem[] = [];
  const player = gameState.players.you;
  const spell = eventData.spell;

  // Check all creatures you control for noncreature spell cast triggers
  player.battlefield?.forEach(permanent => {
    // Check triggered_abilities for explicit triggers
    if (permanent.triggered_abilities) {
      permanent.triggered_abilities.forEach(ability => {
        if (ability.trigger === 'noncreature_spell_cast' || matchesTriggerEvent(ability, 'noncreature_spell_cast')) {
          // Check for spell_type condition (e.g. "instant_or_sorcery" for Young Pyromancer)
          const condition = getTriggerCondition(ability);
          if (condition?.spell_type === 'instant_or_sorcery') {
            const typeLine = (spell.type_line || '').toLowerCase();
            if (!typeLine.includes('instant') && !typeLine.includes('sorcery')) return;
          }
          triggersToAdd.push(createTriggerStackItem('noncreature-cast', permanent, ability, 'you'));
        }
      });
    }
    // Check keywords array for prowess keyword (creates a synthetic prowess trigger)
    if (permanent.keywords?.includes('prowess') && !permanent.triggered_abilities?.some(
      (a: any) => a.trigger === 'noncreature_spell_cast' || matchesTriggerEvent(a, 'noncreature_spell_cast')
    )) {
      const syntheticAbility = {
        trigger: { event: 'noncreature_spell_cast', source: 'self' },
        effect: { type: 'prowess_trigger' as const, power: 1, toughness: 1 }
      };
      triggersToAdd.push(createTriggerStackItem('prowess', permanent, syntheticAbility, 'you'));
    }
  });

  return triggersToAdd;
};

/**
 * Detect extort triggers — fires on ANY spell cast (creature or noncreature).
 * Checks keywords array for 'extort' keyword and synthesizes a trigger.
 */
export const detectExtortTriggers = (_eventData: { spell: Card }, gameState: GameState): StackItem[] => {
  const triggersToAdd: StackItem[] = [];
  const player = gameState.players.you;

  player.battlefield?.forEach(permanent => {
    if (permanent.keywords?.includes('extort')) {
      const syntheticAbility = {
        trigger: { event: 'any_spell_cast', source: 'self' },
        effect: { type: 'extort' as const }
      };
      triggersToAdd.push(createTriggerStackItem('extort', permanent, syntheticAbility, 'you'));
    }
  });

  return triggersToAdd;
};

/**
 * Check whether the player can potentially pay {W/B} for extort.
 * Checks mana pool and untapped permanents that produce W or B.
 */
export const canPayExtortCost = (gameState: GameState): { canPayWhite: boolean; canPayBlack: boolean } => {
  const player = gameState.players.you;
  const pool = player.mana_pool || {};
  let canPayWhite = (pool.W || 0) > 0;
  let canPayBlack = (pool.B || 0) > 0;

  if (canPayWhite && canPayBlack) return { canPayWhite, canPayBlack };

  // Check untapped permanents for mana production
  player.battlefield?.forEach(permanent => {
    if ((permanent as any).tapped) return;

    // Check lands via the mana abilities registry
    const typeLine = (permanent.type_line || '').toLowerCase();
    if (typeLine.includes('land')) {
      const abilities = getLandManaAbilities(permanent);
      abilities.forEach(a => {
        if (a.mana === 'W') canPayWhite = true;
        if (a.mana === 'B') canPayBlack = true;
      });
    }

    // Check activated abilities that produce W or B mana (signets, etc.)
    if (permanent.activated_abilities) {
      permanent.activated_abilities.forEach((ability: any) => {
        const effect = ability.effect;
        if (effect?.type === 'add_mana') {
          const mana = effect.mana || {};
          if (mana.W || mana.white) canPayWhite = true;
          if (mana.B || mana.black) canPayBlack = true;
          // Choice-based mana producers (e.g., signets with color options)
          if (effect.choices) {
            effect.choices.forEach((choice: any) => {
              if (choice.W || choice.white) canPayWhite = true;
              if (choice.B || choice.black) canPayBlack = true;
            });
          }
        }
      });
    }
  });

  return { canPayWhite, canPayBlack };
};

/**
 * Detect magecraft triggers — fires on instant/sorcery cast OR copy.
 * Checks keywords array for 'magecraft' keyword.
 * The caller is responsible for ensuring the spell is an instant or sorcery.
 */
export const detectMagecraftTriggers = (eventData: { spell: Card }, gameState: GameState): StackItem[] => {
  const triggersToAdd: StackItem[] = [];
  const player = gameState.players.you;
  const spell = eventData.spell;

  // Filter: only instant or sorcery
  const typeLine = (spell.type_line || '').toLowerCase();
  if (!typeLine.includes('instant') && !typeLine.includes('sorcery')) return triggersToAdd;

  player.battlefield?.forEach(permanent => {
    if (permanent.keywords?.includes('magecraft')) {
      // Build the effect from the card's triggered_abilities if present, otherwise default to draw
      const ability = permanent.triggered_abilities?.find(
        (a: any) => a.trigger === 'magecraft' || matchesTriggerEvent(a, 'magecraft')
      );
      const effect = ability?.effect || { type: 'draw_cards' as const, amount: 1 };
      const syntheticAbility = {
        trigger: { event: 'magecraft', source: 'self' },
        effect
      };
      triggersToAdd.push(createTriggerStackItem('magecraft', permanent, syntheticAbility, 'you'));
    }
  });

  return triggersToAdd;
};

/**
 * Detect opus triggers — fires on instant/sorcery CAST only (not copies).
 * Checks keywords array for 'opus' keyword.
 * Embeds the manaSpent value from eventData so the effect can check the threshold.
 */
export const detectOpusTriggers = (eventData: { spell: Card; manaSpent?: number }, gameState: GameState): StackItem[] => {
  const triggersToAdd: StackItem[] = [];
  const player = gameState.players.you;
  const spell = eventData.spell;

  // Filter: only instant or sorcery
  const typeLine = (spell.type_line || '').toLowerCase();
  if (!typeLine.includes('instant') && !typeLine.includes('sorcery')) return triggersToAdd;

  player.battlefield?.forEach(permanent => {
    if (permanent.keywords?.includes('opus')) {
      const manaSpent = eventData.manaSpent ?? 0;
      const syntheticAbility = {
        trigger: { event: 'opus', source: 'self' },
        effect: { type: 'opus' as const, manaSpent }
      };
      triggersToAdd.push(createTriggerStackItem('opus', permanent, syntheticAbility, 'you'));
    }
  });

  return triggersToAdd;
};
