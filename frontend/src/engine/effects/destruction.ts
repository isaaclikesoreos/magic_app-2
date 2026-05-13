import { calculateToughness } from '../utils/powerToughness';
import { calculateCMC } from '../utils/manaCost';
import { pushToGraveyardOrExile, removeAttachedAuras } from '../replacement';
import { matchesSacFilter, autoPickSacrifices } from '../utils/sacFilter';
import { GameState, StackItem, Permanent, Player, PlayerKey } from '@/types';

interface EffectHelpers {
  addLog: (message: string) => void;
}

/**
 * Destroy a target land (Wasteland ability).
 */
export const applyDestroyLand = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const targetData = stackItem.targeting_data?.targetData;
  const targetOwner = (stackItem.targeting_data?.targetOwner || 'opponent') as PlayerKey;
  const targetPlayer = newState.players[targetOwner];

  if (targetData && targetPlayer.battlefield) {
    const landId = targetData.instance_id || targetData.card_id;
    const land = targetPlayer.battlefield.find(l => (l.instance_id || l.card_id) === landId);
    if (land) {
      targetPlayer.battlefield = targetPlayer.battlefield.filter(l => (l.instance_id || l.card_id) !== landId);
      pushToGraveyardOrExile(newState, targetPlayer, land);
      addLog(`${land.name} is destroyed.`);
      newState._destroyedLand = { land, owner: targetOwner };
      newState._leavingPermanents = newState._leavingPermanents || [];
      newState._leavingPermanents.push({ permanent: land, owner: targetOwner });
    }
  }

  return newState;
};

/**
 * Destroy target permanent (creature, artifact, enchantment, land, or any).
 * Supports optional life_loss on the caster.
 */
export const applyDestroy = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;

  // Handle overloaded destroy — destroy each matching permanent you don't control
  if ((stackItem as any).wasOverloaded) {
    const targetFilter = stackItem.effect.valid_targets || ['creature'];
    const opponent = newState.players.opponent;
    const toDestroy = [...(opponent.battlefield || [])].filter((c: any) => {
      const tl = (c.type_line || '').toLowerCase();
      if ((c as any).keywords?.includes('indestructible')) return false;
      return targetFilter.some((f: string) => tl.includes(f));
    });
    const destroyed: string[] = [];
    for (const perm of toDestroy) {
      opponent.battlefield = opponent.battlefield.filter((c: any) => c.instance_id !== perm.instance_id);
      removeAttachedAuras(newState, perm.instance_id);
      pushToGraveyardOrExile(newState, opponent, perm);
      destroyed.push(perm.name);
      newState._dyingCreatures = newState._dyingCreatures || [];
      newState._dyingCreatures.push({ creature: perm, owner: 'opponent' });
      newState._leavingPermanents = newState._leavingPermanents || [];
      newState._leavingPermanents.push({ permanent: perm, owner: 'opponent' });
    }
    if (destroyed.length > 0) {
      addLog(`${stackItem.source.name} (overloaded) destroys ${destroyed.join(', ')}.`);
    } else {
      addLog(`${stackItem.source.name} (overloaded) — no valid targets.`);
    }
    return newState;
  }

  const targetData = stackItem.targeting_data?.targetData;
  const targetOwner = (targetData?.owner || stackItem.targeting_data?.targetOwner || 'opponent') as PlayerKey;
  const targetPlayer = newState.players[targetOwner];

  if (!targetData || !targetPlayer.battlefield) return newState;

  const targetId = targetData.instance_id || targetData.card_id;
  const permanent = targetPlayer.battlefield.find(
    (c: any) => (c.instance_id || c.card_id) === targetId
  );

  if (!permanent) {
    addLog('Destroy: target is no longer on the battlefield.');
    return newState;
  }

  // Check for indestructible
  if ((permanent as any).keywords?.includes('indestructible')) {
    addLog(`${permanent.name} is indestructible and can't be destroyed.`);
    return newState;
  }

  // Check CMC restriction (e.g., Overload: "if its mana value is 2 or less")
  const cmcMax = stackItem.effect.cmc_restriction?.max;
  if (cmcMax !== undefined) {
    const targetCMC = calculateCMC(permanent.mana_cost);
    if (targetCMC > cmcMax) {
      addLog(`${permanent.name} has mana value ${targetCMC} (max ${cmcMax}) — can't be destroyed.`);
      return newState;
    }
  }

  // Remove from battlefield
  targetPlayer.battlefield = targetPlayer.battlefield.filter(
    (c: any) => (c.instance_id || c.card_id) !== targetId
  );
  removeAttachedAuras(newState, targetId);
  pushToGraveyardOrExile(newState, targetPlayer, permanent);
  addLog(`${permanent.name} is destroyed.`);

  // Track leaving permanent
  newState._leavingPermanents = newState._leavingPermanents || [];
  newState._leavingPermanents.push({ permanent, owner: targetOwner });

  // Track dying permanent for death triggers (creatures, artifacts, enchantments, etc.)
  // This feeds detectDeathTriggers which checks for both creature-specific and permanent_dies triggers
  newState._dyingCreatures = newState._dyingCreatures || [];
  newState._dyingCreatures.push({ creature: permanent, owner: targetOwner });

  // Track destroyed land
  const isLand = (permanent.type_line || '').toLowerCase().includes('land');
  if (isLand) {
    newState._destroyedLand = { land: permanent, owner: targetOwner };
  }

  // Life loss on caster (e.g., Infernal Grasp)
  if (stackItem.effect.life_loss) {
    const casterOwner = ((stackItem.source as any)?.owner || 'you') as PlayerKey;
    newState.players[casterOwner].life -= stackItem.effect.life_loss;
    addLog(`You lose ${stackItem.effect.life_loss} life. (Life: ${newState.players[casterOwner].life})`);
  }

  return newState;
};

/**
 * Wildfire - each player sacrifices 4 lands, then deal 4 damage to each creature.
 */
export const applyWildfire = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const player = newState.players.you;
  const opponent = newState.players.opponent;
  const landSacCount = stackItem.effect.landSacrificeCount || 4;
  const creatureDamage = stackItem.effect.creatureDamage || 4;
  const sacrificedLands: Array<{ land: Permanent; owner: PlayerKey }> = [];

  const sacrificeLandsForPlayer = (targetPlayer: Player, playerName: string, ownerKey: PlayerKey): void => {
    const lands = (targetPlayer.battlefield || []).filter(card =>
      (card.type_line || '').toLowerCase().includes('land')
    );
    const toSacrifice = lands.slice(0, landSacCount);
    toSacrifice.forEach(land => {
      targetPlayer.battlefield = targetPlayer.battlefield.filter(c => c.card_id !== land.card_id);
      pushToGraveyardOrExile(newState, targetPlayer, land);
      sacrificedLands.push({ land, owner: ownerKey });
    });
    if (toSacrifice.length > 0) {
      addLog(`${playerName} sacrifices ${toSacrifice.length} land(s): ${toSacrifice.map(l => l.name).join(', ')}`);
    }
  };

  sacrificeLandsForPlayer(player, 'You', 'you');
  sacrificeLandsForPlayer(opponent, 'Opponent', 'opponent');

  const deadCreatures: Array<{ creature: Permanent; owner: PlayerKey }> = [];
  const damageCreatures = (targetPlayer: Player, ownerKey: PlayerKey): void => {
    (targetPlayer.battlefield || []).forEach(card => {
      if ((card.type_line || '').toLowerCase().includes('creature')) {
        const toughness = calculateToughness(card);
        if (toughness <= creatureDamage) {
          deadCreatures.push({ creature: card, owner: ownerKey });
        }
      }
    });
  };

  damageCreatures(player, 'you');
  damageCreatures(opponent, 'opponent');

  deadCreatures.forEach(({ creature, owner }) => {
    const targetPlayer = newState.players[owner];
    removeAttachedAuras(newState, creature.instance_id);
    targetPlayer.battlefield = targetPlayer.battlefield.filter(c => c.card_id !== creature.card_id);
    pushToGraveyardOrExile(newState, targetPlayer, creature);
    addLog(`${creature.name} dies from Wildfire's ${creatureDamage} damage.`);
  });

  newState._sacrificedLands = sacrificedLands;
  newState._deadCreatures = deadCreatures;

  // Track all leaving permanents (lands + creatures) for permanent_left triggers
  const leavingPermanents = newState._leavingPermanents = newState._leavingPermanents || [];
  sacrificedLands.forEach(({ land, owner }) => {
    leavingPermanents.push({ permanent: land, owner });
  });
  deadCreatures.forEach(({ creature, owner }) => {
    leavingPermanents.push({ permanent: creature, owner });
  });
  // Track dying creatures for death triggers
  const dyingCreatures = newState._dyingCreatures = newState._dyingCreatures || [];
  deadCreatures.forEach(({ creature, owner }) => {
    dyingCreatures.push({ creature, owner });
  });

  return newState;
};

/**
 * Destroy all permanents matching a type filter (Day of Judgment, Cleansing Nova, etc.).
 * effect.filter: string[] of type keywords, e.g. ["creature"] or ["artifact", "enchantment"]
 */
export const applyDestroyAll = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const filters: string[] = stackItem.effect.filter || ['creature'];
  const destroyed: Array<{ permanent: Permanent; owner: PlayerKey }> = [];

  const processPlayer = (player: Player, ownerKey: PlayerKey) => {
    const toDestroy = (player.battlefield || []).filter(card => {
      const typeLine = (card.type_line || '').toLowerCase();
      return filters.some(f => typeLine.includes(f));
    });

    toDestroy.forEach(permanent => {
      if ((permanent as any).keywords?.includes('indestructible')) {
        addLog(`${permanent.name} is indestructible.`);
        return;
      }
      player.battlefield = player.battlefield.filter(c => c.instance_id !== permanent.instance_id);
      removeAttachedAuras(newState, permanent.instance_id);
      pushToGraveyardOrExile(newState, player, permanent);
      destroyed.push({ permanent, owner: ownerKey });
      addLog(`${permanent.name} is destroyed.`);
    });
  };

  processPlayer(newState.players.you, 'you');
  processPlayer(newState.players.opponent, 'opponent');

  // Track for death + leaves triggers
  const dyingArr = newState._dyingCreatures = newState._dyingCreatures || [];
  const leavingArr = newState._leavingPermanents = newState._leavingPermanents || [];
  destroyed.forEach(({ permanent, owner }) => {
    dyingArr.push({ creature: permanent, owner });
    leavingArr.push({ permanent, owner });
  });

  return newState;
};

/**
 * Targeted player sacrifices a permanent (Edict effects: Diabolic Edict,
 * Cruel Edict, Geth's Verdict). Reads the targeted player from
 * targeting_data.targetData. Uses the auto-pick heuristic (CMC → toughness →
 * power → random) since opponent doesn't get a choice in our puzzle mode.
 * If the caster targeted themselves (Diabolic/Geth's), that's allowed —
 * "you" sacrifices instead.
 *
 * Populates _dyingCreatures + _leavingPermanents + _sacrificedPermanents so
 * resolveStack dispatches death / leaves / sacrifice triggers.
 */
export const applyTargetPlayerSacrifice = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const targetPlayer = ((stackItem.targeting_data?.targetData as any) || 'opponent') as PlayerKey;
  const types = (stackItem.effect.types as string[]) || ['creature'];
  const count = (stackItem.effect.count as number) || 1;
  const filter = { types, controller: targetPlayer };
  const playerLabel = targetPlayer === 'opponent' ? 'Opponent' : 'You';

  // _chosenSacs is populated by resolveStack's intercept when targetPlayer='you'
  // (player picks via sacrificeMode UI). Opponent-target path: auto-pick.
  const chosenSacs = (stackItem.effect as any)._chosenSacs as Permanent[] | undefined;
  let picked: Permanent[];
  if (chosenSacs !== undefined) {
    picked = chosenSacs;
    if (picked.length === 0) {
      addLog(`${stackItem.source.name}: ${playerLabel.toLowerCase()} has no ${types.join(' or ')} to sacrifice.`);
      return newState;
    }
  } else {
    const candidates = (newState.players[targetPlayer].battlefield || []).filter(p =>
      matchesSacFilter(p, targetPlayer, filter)
    );
    if (candidates.length === 0) {
      addLog(`${stackItem.source.name}: ${playerLabel.toLowerCase()} has no ${types.join(' or ')} to sacrifice.`);
      return newState;
    }
    picked = autoPickSacrifices(candidates, count);
  }
  const dyingArr = newState._dyingCreatures = newState._dyingCreatures || [];
  const leavingArr = newState._leavingPermanents = newState._leavingPermanents || [];
  const sacArr = newState._sacrificedPermanents = newState._sacrificedPermanents || [];
  for (const c of picked) {
    newState.players[targetPlayer].battlefield = newState.players[targetPlayer].battlefield.filter(
      (p: Permanent) => p.instance_id !== c.instance_id
    );
    removeAttachedAuras(newState, c.instance_id || '');
    pushToGraveyardOrExile(newState, newState.players[targetPlayer], c);
    addLog(`${playerLabel} sacrifice${targetPlayer === 'opponent' ? 's' : ''} ${c.name}.`);
    if ((c.type_line || '').toLowerCase().includes('creature')) {
      dyingArr.push({ creature: c, owner: targetPlayer });
    }
    leavingArr.push({ permanent: c, owner: targetPlayer });
    sacArr.push({ permanent: c, owner: targetPlayer });
  }

  return newState;
};
