/**
 * Effect handler registry.
 * Maps effect type strings to handler functions.
 * Each handler: (stackItem, gameState, helpers) => newGameState
 */
import { applyDamage, applyDamageDivided, applyDamageAll, applyDamagePerNonbasicLands, applyDealDamageToController, applyDamageToCaster, applyDamageAndSelfDamage, applyCoinFlipDamage } from './damage';
import { applyGainLife, applyGainLifeEqualToughness, applyGainLifeAndScry, applyDrainLife, applyOpponentLosesLife, applyTargetPlayerLosesLife, applyExtort } from './lifegain';
import { applyDrawCards, applyEachPlayerDraws, applyMill } from './draw';
import { applyBuffCreature, applyBuffSelf, applyProwessTrigger, applyGrantKeywordUntilEOT } from './buff';
import { applyAddCounterToSelf, applyAddCounterToSource, applyAddCounterToEachCreature } from './counters';
import { applyAddMana, applyChannelActivate } from './mana';
import { applyEnterBattlefield, applyEnterBattlefieldPermanent, applyCreateToken, applyCreateTokenCopy, applySacrificeSelf, applyReanimateCreature, applyAttachAura, applyYawgmothsWill, applySacrificeAttached, applyEquip, applyAttachSelfToTriggeringCreature, applyAnimateArtifactAsCreature } from './battlefield';
import { applyDestroy, applyDestroyLand, applyWildfire, applyDestroyAll, applyTargetPlayerSacrifice } from './destruction';
import { applyGrantProtection } from './protection';
import { applyExileAllGraveyards, applyFlicker, applyExileUntilEndStep, applyExileUntilLeaves, applyExileUnder, applyReturnExiledUnder, applyImpulseDraw, applyExileTargetCreature, applyExileSelfFromGraveyard } from './exile';
import { applyCopySpell } from './copySpell';
import { applyReturnToHand, applyPutIntoLibrary, applyReturnFromGraveyardToHand } from './bounce';
import { applyRandomDiscard } from './discard';
import { applyTutor } from './tutor';
import { GameState, StackItem } from '@/types';

interface EffectHelpers {
  addLog: (message: string) => void;
}

type EffectHandler = (stackItem: StackItem, gameState: GameState, helpers: EffectHelpers) => GameState;

/**
 * Pay mana to untap source permanent (Mana Vault).
 * If player can afford the cost, spend mana and untap. Otherwise do nothing.
 * Note: the "may" choice and affordability check happen in resolveStack() before this is called.
 */
const applyPayToUntapSelf = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const sourceId = (stackItem.source as any)?.instance_id;
  if (!sourceId) return newState;

  const permanent = newState.players.you.battlefield.find(
    (c: any) => c.instance_id === sourceId
  );
  if (!permanent) {
    addLog(`${stackItem.source.name} is no longer on the battlefield.`);
    return newState;
  }

  (permanent as any).tapped = false;
  addLog(`Paid to untap ${stackItem.source.name}.`);
  return newState;
};

/**
 * Untap the source permanent (Basalt Monolith, Grim Monolith).
 * Used as an activated ability effect — mana cost is already paid by the ability cost system.
 */
const applyUntapSelf = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const sourceId = (stackItem.source as any)?.instance_id;
  if (!sourceId) return newState;

  const permanent = newState.players.you.battlefield.find(
    (c: any) => c.instance_id === sourceId
  );
  if (!permanent) {
    addLog(`${stackItem.source.name} is no longer on the battlefield.`);
    return newState;
  }

  (permanent as any).tapped = false;
  addLog(`Untapped ${stackItem.source.name}.`);
  return newState;
};

export const effectHandlers: Record<string, EffectHandler> = {
  'damage': applyDamage,
  'damage_divided': applyDamageDivided,
  'deal_damage_divided': applyDamageDivided, // DB card format uses "deal_" prefix
  'damage_per_nonbasic_lands': applyDamagePerNonbasicLands,
  'deal_damage_to_controller': applyDealDamageToController,
  'damage_to_caster': applyDamageToCaster,
  'damage_and_self_damage': applyDamageAndSelfDamage,
  'damage_all': applyDamageAll,
  'gain_life': applyGainLife,
  'gain_life_equal_toughness': applyGainLifeEqualToughness,
  'gain_life_and_scry': applyGainLifeAndScry,
  'drain_life': applyDrainLife,
  'opponent_loses_life': applyOpponentLosesLife,
  'extort': applyExtort,
  // 'opus' is handled directly in resolveStack (draw + conditional discard selection)
  'deal_damage': applyDamage, // Targeted or untargeted damage (Overlord of the Boilerbilges, Marionette Apprentice)
  'draw_cards': applyDrawCards,
  'each_player_draws': applyEachPlayerDraws,
  'buff_creature': applyBuffCreature,
  'buff_self': applyBuffSelf,
  'prowess_trigger': applyProwessTrigger,
  'grant_keyword_until_eot': applyGrantKeywordUntilEOT,
  'add_counter': applyAddCounterToSelf, // Alias for Pridemate-style triggers
  'add_counter_to_self': applyAddCounterToSelf,
  'add_counter_to_source': applyAddCounterToSource,
  'add_counter_to_each_creature': applyAddCounterToEachCreature,
  'add_mana': applyAddMana,
  'channel_activate': applyChannelActivate,
  'enter_battlefield': applyEnterBattlefield,
  'enter_battlefield_permanent': applyEnterBattlefieldPermanent,
  'create_token': applyCreateToken,
  'create_token_copy': applyCreateTokenCopy,
  'animate_artifact_as_creature': applyAnimateArtifactAsCreature,
  'sacrifice_self': applySacrificeSelf,
  'reanimate_creature': applyReanimateCreature,
  'destroy': applyDestroy,
  'destroy_all': applyDestroyAll,
  'destroy_land': applyDestroyLand,
  'wildfire': applyWildfire,
  'target_player_sacrifice': applyTargetPlayerSacrifice,
  'target_player_loses_life': applyTargetPlayerLosesLife,
  'grant_protection': applyGrantProtection,
  'exile_all_graveyards': applyExileAllGraveyards,
  'exile_self_from_graveyard': applyExileSelfFromGraveyard,
  'flicker': applyFlicker,
  'exile_until_end_step': applyExileUntilEndStep,
  'exile_until_leaves': applyExileUntilLeaves,
  'exile_under': applyExileUnder,
  'return_exiled_under': applyReturnExiledUnder,
  'copy_spell': applyCopySpell,
  'attach_aura': applyAttachAura,
  'yawgmoths_will': applyYawgmothsWill,
  'sacrifice_attached': applySacrificeAttached,
  'return_to_hand': applyReturnToHand,
  'put_into_library': applyPutIntoLibrary,
  'coin_flip_damage': applyCoinFlipDamage,
  'pay_to_untap_self': applyPayToUntapSelf,
  'untap_self': applyUntapSelf,
  'random_discard': applyRandomDiscard,
  'return_from_graveyard_to_hand': applyReturnFromGraveyardToHand,
  'tutor': applyTutor,
  'equip': applyEquip,
  'attach_self_to_triggering_creature': applyAttachSelfToTriggeringCreature,
  'mill': applyMill,
  'impulse_draw': applyImpulseDraw,
  'exile_target_creature': applyExileTargetCreature,
};

/**
 * Apply an effect from a resolved stack item.
 * Dispatches to the appropriate handler and checks win/loss conditions.
 */
export const applyEffect = (stackItem: StackItem, gameState: GameState, helpers: EffectHelpers): GameState => {
  const handler = effectHandlers[stackItem.effect.type];
  if (!handler) {
    helpers.addLog(`Unknown effect type: ${stackItem.effect.type}`);
    return JSON.parse(JSON.stringify(gameState)) as GameState;
  }

  const newState = handler(stackItem, gameState, helpers);

  // Check victory/defeat conditions
  const player = newState.players.you;
  const opponent = newState.players.opponent;

  if (opponent.life <= 0) {
    helpers.addLog('VICTORY! You found lethal!');
  }
  if (opponent.deckedOut) {
    helpers.addLog('VICTORY! Opponent decked out!');
  }
  if (player.life <= 0) {
    helpers.addLog('DEFEAT! You died!');
  }
  if (player.deckedOut) {
    helpers.addLog('DEFEAT! You decked out!');
  }

  return newState;
};
