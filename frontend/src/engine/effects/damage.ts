import { calculateToughness } from '../utils/powerToughness';
import { pushToGraveyardOrExile, removeAttachedAuras } from '../replacement';
import { sourceHasKeyword } from '../utils/keywords';
import { isPlaneswalker, addLoyalty } from '../utils/loyalty';
import { GameState, StackItem, Permanent, PlayerKey } from '@/types';

interface EffectHelpers {
  addLog: (message: string) => void;
}

interface DamageAssignment {
  damage: number;
  target: {
    type: string;
    data: any;
    owner?: PlayerKey;
  };
}

// Filter spec for AoE damage (damage_all). When absent, legacy behavior is used.
interface AoeTargetsSpec {
  players?: 'each' | 'each_opponent' | 'you' | 'none';
  permanents?: {
    controller?: 'any' | 'opponents' | 'you';
    types?: string[];
    exclude_source?: boolean;
  };
}

// Apply damage to a single permanent (creature or planeswalker).
// Returns whether the permanent died and mutates newState in place for death bookkeeping.
const applyDamageToPermanent = (
  newState: GameState,
  permanent: Permanent,
  owner: PlayerKey,
  damage: number,
  hasDeathtouch: boolean,
  sourceName: string,
  { addLog }: EffectHelpers
): boolean => {
  const ownerPlayer = newState.players[owner];

  if (isPlaneswalker(permanent)) {
    const newLoyalty = addLoyalty(permanent, -damage);
    if (newLoyalty <= 0) {
      removeAttachedAuras(newState, permanent.instance_id);
      ownerPlayer.battlefield = ownerPlayer.battlefield.filter(
        (c: any) => c.instance_id !== permanent.instance_id
      );
      pushToGraveyardOrExile(newState, ownerPlayer, permanent);
      newState._dyingCreatures = newState._dyingCreatures || [];
      newState._dyingCreatures.push({ creature: permanent, owner });
      newState._leavingPermanents = newState._leavingPermanents || [];
      newState._leavingPermanents.push({ permanent, owner });
      addLog(`${sourceName} deals ${damage} damage to ${permanent.name}, destroying it.`);
      return true;
    }
    addLog(`${sourceName} deals ${damage} damage to ${permanent.name} (${newLoyalty} loyalty).`);
    return false;
  }

  // Creature — mark damage and run SBA check on cumulative total.
  // Damage persists until cleared in end-of-turn cleanup.
  const prev = permanent.damage || 0;
  permanent.damage = prev + damage;
  if (hasDeathtouch && damage > 0) {
    permanent.damaged_by_deathtouch = true;
  }
  const toughness = calculateToughness(permanent);
  const marked = permanent.damage;
  const deathtouched = permanent.damaged_by_deathtouch === true;
  const wouldBeLethal = marked >= toughness || deathtouched;
  // Indestructible saves from the lethal-damage SBA (rule 704.5g) and from
  // destroy effects, but NOT from 0 toughness (704.5f, handled by a separate
  // toughness SBA in PuzzleContext). Damage is still marked on the creature
  // so reflective effects (Stuffy Doll-style) and lifelink still apply.
  const hasIndestructible = (permanent as any).keywords?.includes('indestructible');
  const isLethal = wouldBeLethal && !hasIndestructible;
  if (isLethal) {
    removeAttachedAuras(newState, permanent.instance_id);
    ownerPlayer.battlefield = ownerPlayer.battlefield.filter(
      (c: any) => c.instance_id !== permanent.instance_id
    );
    pushToGraveyardOrExile(newState, ownerPlayer, permanent);
    newState._dyingCreatures = newState._dyingCreatures || [];
    newState._dyingCreatures.push({ creature: permanent, owner });
    newState._leavingPermanents = newState._leavingPermanents || [];
    newState._leavingPermanents.push({ permanent, owner });
    const deathReason = marked >= toughness ? 'destroying it' : 'destroying it (deathtouch)';
    addLog(`${sourceName} deals ${damage} damage to ${permanent.name}, ${deathReason}.`);
    return true;
  }
  if (wouldBeLethal && hasIndestructible) {
    addLog(`${sourceName} deals ${damage} damage to ${permanent.name} (${marked}/${toughness}) — indestructible.`);
  } else {
    addLog(`${sourceName} deals ${damage} damage to ${permanent.name} (${marked}/${toughness} marked).`);
  }
  return false;
};

/**
 * Deal damage to a single target (player or creature).
 */
export const applyDamage = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const player = newState.players.you;
  const opponent = newState.players.opponent;

  const damage = stackItem.effect.amount ?? stackItem.effect.xValue ?? 0;
  const targetType = stackItem.targeting_data?.targetType;
  const targetData = stackItem.targeting_data?.targetData;

  // Check for deathtouch and lifelink on the source
  const allBF = [...newState.players.you.battlefield, ...newState.players.opponent.battlefield];
  const sourceId = (stackItem.source as any)?.instance_id;
  const hasDeathtouch = sourceHasKeyword(sourceId, 'deathtouch', allBF);
  const hasLifelink = sourceHasKeyword(sourceId, 'lifelink', allBF);
  const sourceOwner = ((stackItem.source as any)?.owner || 'you') as PlayerKey;

  let totalDamageDealt = 0;

  // Handle overloaded spells — deal damage to each creature you don't control
  if ((stackItem as any).wasOverloaded) {
    // Determine which side's creatures to hit based on the spell text
    // Most overload damage spells target creatures "you don't control" → opponent's creatures
    const targetOwner: PlayerKey = 'opponent';
    const targetPlayerObj = newState.players[targetOwner];
    const creatures = [...(targetPlayerObj.battlefield || [])].filter(
      (c: any) => (c.type_line || '').toLowerCase().includes('creature')
    );

    if (creatures.length === 0) {
      addLog(`${stackItem.source.name} overloaded — no creatures to damage.`);
      return newState;
    }

    // Deal damage to each creature
    const killed: any[] = [];
    for (const creature of creatures) {
      const toughness = calculateToughness(creature);
      const hasIndestructible = (creature as any).keywords?.includes('indestructible');
      const wouldBeLethal = damage >= toughness || (damage > 0 && hasDeathtouch);
      const isLethal = wouldBeLethal && !hasIndestructible;
      totalDamageDealt += damage;

      if (isLethal) {
        removeAttachedAuras(newState, creature.instance_id);
        targetPlayerObj.battlefield = targetPlayerObj.battlefield.filter(
          (c: any) => c.instance_id !== creature.instance_id
        );
        pushToGraveyardOrExile(newState, targetPlayerObj, creature);
        killed.push(creature);
        newState._dyingCreatures = newState._dyingCreatures || [];
        newState._dyingCreatures.push({ creature, owner: targetOwner });
        newState._leavingPermanents = newState._leavingPermanents || [];
        newState._leavingPermanents.push({ permanent: creature, owner: targetOwner });
      }
    }
    const killedNames = killed.map((c: any) => c.name);
    if (killedNames.length > 0) {
      addLog(`${stackItem.source.name} (overloaded) deals ${damage} damage to each creature opponent controls, destroying ${killedNames.join(', ')}.`);
    } else {
      addLog(`${stackItem.source.name} (overloaded) deals ${damage} damage to each creature opponent controls.`);
    }

    // Lifelink
    if (hasLifelink && totalDamageDealt > 0) {
      const lifelinkPlayer = newState.players[sourceOwner];
      lifelinkPlayer.life = (lifelinkPlayer.life || 0) + totalDamageDealt;
      addLog(`Lifelink — you gain ${totalDamageDealt} life. Life: ${lifelinkPlayer.life}`);
      newState._lifeGained = totalDamageDealt;
    }

    return newState;
  }

  // Handle untargeted "each_opponent" damage (e.g. Marionette Apprentice death trigger)
  if (!targetType && stackItem.effect.target === 'each_opponent') {
    opponent.life -= damage;
    totalDamageDealt = damage;
    addLog(`${stackItem.source.name} deals ${damage} damage to opponent. Opponent is now at ${opponent.life} life.`);
  } else if (targetType === 'player') {
    if (targetData === 'opponent') {
      opponent.life -= damage;
      totalDamageDealt = damage;
      addLog(`${stackItem.source.name} deals ${damage} damage to opponent. Opponent is now at ${opponent.life} life.`);
    } else {
      player.life -= damage;
      totalDamageDealt = damage;
      addLog(`${stackItem.source.name} deals ${damage} damage to you. You are now at ${player.life} life.`);
    }
  } else if (targetType === 'creature' || targetType === 'planeswalker') {
    const snapshot = targetData as Permanent;
    const permanentOwner = (targetData.owner || 'opponent') as PlayerKey;

    // Resolve to the live battlefield object so marked-damage mutations persist.
    const live = (newState.players[permanentOwner].battlefield || [])
      .find((c: any) => c.instance_id === snapshot.instance_id) as Permanent | undefined;
    if (!live) {
      addLog(`${stackItem.source.name} fizzles — ${snapshot.name} is no longer on the battlefield.`);
      newState._fizzled = true;
      return newState;
    }

    totalDamageDealt = damage;
    const died = applyDamageToPermanent(
      newState,
      live,
      permanentOwner,
      damage,
      hasDeathtouch,
      stackItem.source.name,
      { addLog }
    );

    if (died && targetType === 'creature' && (live.attachedRoles?.length ?? 0) > 0) {
      const leavingRoles = newState._leavingRoles = newState._leavingRoles || [];
      live.attachedRoles!.forEach(role => {
        leavingRoles.push({
          role,
          owner: permanentOwner,
          attachedTo: live.name,
        });
      });
    }
  }

  // Lifelink: source's controller gains life equal to damage dealt
  if (hasLifelink && totalDamageDealt > 0) {
    const lifelinkPlayer = newState.players[sourceOwner];
    lifelinkPlayer.life = (lifelinkPlayer.life || 0) + totalDamageDealt;
    addLog(`Lifelink — ${sourceOwner === 'you' ? 'you' : 'opponent'} gain${sourceOwner === 'you' ? '' : 's'} ${totalDamageDealt} life. Life: ${lifelinkPlayer.life}`);
    newState._lifeGained = totalDamageDealt;
  }

  return newState;
};

/**
 * Deal damage to a filtered set of players and permanents (damage_all).
 *
 * Payload shape:
 *   {
 *     type: 'damage_all',
 *     amount: number | amount_from: 'x',
 *     targets?: {
 *       players?: 'each' | 'each_opponent' | 'you' | 'none',
 *       permanents?: {
 *         controller?: 'any' | 'opponents' | 'you',
 *         types?: string[],          // e.g. ['creature', 'planeswalker']
 *         exclude_source?: boolean,
 *       }
 *     }
 *   }
 *
 * When `targets` is absent, legacy behavior is used (Exocrine-style:
 * each player + each other creature, both sides).
 */
export const applyDamageAll = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const damage = stackItem.effect.amount ?? stackItem.effect.xValue ?? 0;
  const sourceId = (stackItem.source as any)?.instance_id;
  const sourceOwner = ((stackItem.source as any)?.owner || 'you') as PlayerKey;

  if (damage <= 0) {
    addLog(`${stackItem.source.name}: X is 0, no damage dealt.`);
    return newState;
  }

  // Resolve filter with legacy defaults.
  const LEGACY: AoeTargetsSpec = {
    players: 'each',
    permanents: { controller: 'any', types: ['creature'], exclude_source: true },
  };
  const spec: AoeTargetsSpec = (stackItem.effect as any).targets ?? LEGACY;
  const playersFilter = spec.players ?? 'each';
  const permFilter = spec.permanents ?? { controller: 'any', types: ['creature'], exclude_source: true };
  const typeSet = new Set((permFilter.types ?? ['creature']).map(t => t.toLowerCase()));
  const controllerFilter = permFilter.controller ?? 'any';
  const excludeSource = permFilter.exclude_source ?? false;

  // Determine opponents of the source's controller.
  const opponentOf = (who: PlayerKey): PlayerKey => (who === 'you' ? 'opponent' : 'you');

  // --- Apply damage to players ---
  const playerTargets: PlayerKey[] = (() => {
    switch (playersFilter) {
      case 'each': return ['you', 'opponent'];
      case 'each_opponent': return [opponentOf(sourceOwner)];
      case 'you': return [sourceOwner];
      case 'none': return [];
      default: return [];
    }
  })();

  for (const pk of playerTargets) {
    newState.players[pk].life -= damage;
  }
  if (playerTargets.length > 0) {
    const lifeSummary = playerTargets
      .map(pk => `${pk === 'you' ? 'You' : 'Opponent'}: ${newState.players[pk].life}`)
      .join(', ');
    const target = playerTargets.length === 1
      ? (playerTargets[0] === sourceOwner ? 'you' : 'opponent')
      : 'each player';
    addLog(`${stackItem.source.name} deals ${damage} damage to ${target}. ${lifeSummary}`);
  }

  // --- Collect permanents to damage ---
  const ownersToScan: PlayerKey[] = (() => {
    switch (controllerFilter) {
      case 'any': return ['you', 'opponent'];
      case 'opponents': return [opponentOf(sourceOwner)];
      case 'you': return [sourceOwner];
      default: return ['you', 'opponent'];
    }
  })();

  const matchesTypes = (p: Permanent): boolean => {
    const typeLine = (p.type_line || '').toLowerCase();
    for (const t of typeSet) {
      if (typeLine.includes(t)) return true;
    }
    return false;
  };

  const permanentTargets: Array<{ permanent: Permanent; owner: PlayerKey }> = [];
  for (const ownerKey of ownersToScan) {
    const bf = newState.players[ownerKey].battlefield || [];
    for (const p of bf) {
      if (excludeSource && p.instance_id === sourceId) continue;
      if (!matchesTypes(p)) continue;
      permanentTargets.push({ permanent: p, owner: ownerKey });
    }
  }

  newState._dyingCreatures = newState._dyingCreatures || [];
  newState._leavingPermanents = newState._leavingPermanents || [];

  // Check deathtouch once on the source (creatures like Pestilence Demon with DT).
  const allBF = [...newState.players.you.battlefield, ...newState.players.opponent.battlefield];
  const hasDeathtouch = sourceId ? sourceHasKeyword(sourceId, 'deathtouch', allBF) : false;

  for (const { permanent, owner } of permanentTargets) {
    applyDamageToPermanent(
      newState,
      permanent,
      owner,
      damage,
      hasDeathtouch,
      stackItem.source.name,
      { addLog }
    );
  }

  return newState;
};

/**
 * Deal divided damage across multiple targets (e.g., Inferno Titan).
 */
export const applyDamageDivided = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const player = newState.players.you;
  const opponent = newState.players.opponent;

  // Check for deathtouch and lifelink on the source
  const allBF = [...newState.players.you.battlefield, ...newState.players.opponent.battlefield];
  const sourceId = (stackItem.source as any)?.instance_id;
  const hasDeathtouch = sourceHasKeyword(sourceId, 'deathtouch', allBF);
  const hasLifelink = sourceHasKeyword(sourceId, 'lifelink', allBF);
  const sourceOwner = ((stackItem.source as any)?.owner || 'you') as PlayerKey;
  let totalDamageDealt = 0;

  if (stackItem.targeting_data && stackItem.targeting_data.assignments) {
    (stackItem.targeting_data.assignments as DamageAssignment[]).forEach(assignment => {
      const damage = assignment.damage;
      if (damage === 0) return;

      totalDamageDealt += damage;

      if (assignment.target.type === 'player') {
        if (assignment.target.data === 'opponent') {
          opponent.life -= damage;
          addLog(`${stackItem.source.name} deals ${damage} damage to opponent.`);
        } else {
          player.life -= damage;
          addLog(`${stackItem.source.name} deals ${damage} damage to you.`);
        }
      } else if (assignment.target.type === 'creature' || assignment.target.type === 'planeswalker') {
        const targetPermanent = assignment.target.data as Permanent;
        const creatureOwner = (assignment.target.owner || 'opponent') as PlayerKey;
        // Resolve to the live battlefield object (not a stale targeting snapshot)
        // so marked damage persists across multiple assignments this turn.
        const live = (newState.players[creatureOwner].battlefield || [])
          .find((c: any) => c.instance_id === targetPermanent.instance_id) as Permanent | undefined;
        if (!live) return;
        applyDamageToPermanent(
          newState,
          live,
          creatureOwner,
          damage,
          hasDeathtouch,
          stackItem.source.name,
          { addLog }
        );
      }
    });
  }

  // Lifelink: source's controller gains life equal to total damage dealt
  if (hasLifelink && totalDamageDealt > 0) {
    const lifelinkPlayer = newState.players[sourceOwner];
    lifelinkPlayer.life = (lifelinkPlayer.life || 0) + totalDamageDealt;
    addLog(`Lifelink — ${sourceOwner === 'you' ? 'you' : 'opponent'} gain${sourceOwner === 'you' ? '' : 's'} ${totalDamageDealt} life. Life: ${lifelinkPlayer.life}`);
    newState._lifeGained = totalDamageDealt;
  }

  return newState;
};

/**
 * Deal damage per nonbasic lands (Price of Progress).
 */
export const applyDamagePerNonbasicLands = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const player = newState.players.you;
  const opponent = newState.players.opponent;
  const multiplier = stackItem.effect.multiplier || 2;

  const countNonbasicLands = (playerObj: typeof player): number => {
    return (playerObj.battlefield || []).filter(card => {
      const typeLine = (card.type_line || '').toLowerCase();
      return typeLine.includes('land') && !card.isBasic;
    }).length;
  };

  const yourNonbasics = countNonbasicLands(player);
  const opponentNonbasics = countNonbasicLands(opponent);
  const yourDamage = yourNonbasics * multiplier;
  const opponentDamage = opponentNonbasics * multiplier;

  player.life -= yourDamage;
  opponent.life -= opponentDamage;

  addLog(`Price of Progress deals ${yourDamage} damage to you (${yourNonbasics} nonbasic lands) and ${opponentDamage} damage to opponent (${opponentNonbasics} nonbasic lands).`);
  addLog(`You are at ${player.life} life. Opponent is at ${opponent.life} life.`);

  return newState;
};

/**
 * Deal damage to a land's controller (Dingus Egg).
 */
export const applyDealDamageToController = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const targetOwner = (stackItem.effect.owner || 'you') as PlayerKey;
  const damageAmount = stackItem.effect.amount || 2;
  const targetPlayer = newState.players[targetOwner];

  targetPlayer.life -= damageAmount;
  addLog(`Dingus Egg deals ${damageAmount} damage to ${targetOwner === 'you' ? 'you' : 'opponent'}. Life: ${targetPlayer.life}`);

  return newState;
};

/**
 * Deal damage to the caster of a spell (Eidolon of the Great Revel).
 */
export const applyDamageToCaster = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const targetOwner = (stackItem.effect.targetOwner || 'you') as PlayerKey;
  const damageAmount = stackItem.effect.amount || 2;
  const targetPlayer = newState.players[targetOwner];

  targetPlayer.life -= damageAmount;
  addLog(`${stackItem.source.name} deals ${damageAmount} damage to ${targetOwner === 'you' ? 'you' : 'opponent'}. Life: ${targetPlayer.life}`);

  return newState;
};

/**
 * Deal damage to a target AND damage to yourself (Fireslinger).
 * Lifelink applies to both pings — the target damage AND the self-damage.
 */
export const applyDamageAndSelfDamage = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  // First apply damage to the target (lifelink handled inside applyDamage)
  let newState = applyDamage(stackItem, gameState, { addLog });

  // Then deal self-damage to the controller (you)
  const selfDamage = stackItem.effect.self_damage || 1;
  newState.players.you.life -= selfDamage;
  addLog(`${stackItem.source.name} deals ${selfDamage} damage to you. You are now at ${newState.players.you.life} life.`);

  // Lifelink also applies to self-damage — source still dealt damage
  const allBF = [...newState.players.you.battlefield, ...newState.players.opponent.battlefield];
  const sourceId = (stackItem.source as any)?.instance_id;
  if (sourceHasKeyword(sourceId, 'lifelink', allBF) && selfDamage > 0) {
    newState.players.you.life += selfDamage;
    addLog(`Lifelink — you gain ${selfDamage} life from self-damage. Life: ${newState.players.you.life}`);
    newState._lifeGained = (newState._lifeGained || 0) + selfDamage;
  }

  return newState;
};

/**
 * Coin flip damage (Mana Crypt).
 * 50/50 coin flip — on loss, deal effect.amount damage to controller.
 */
export const applyCoinFlipDamage = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const win = Math.random() < 0.5;
  const damageAmount = stackItem.effect.amount || 3;

  if (win) {
    addLog(`${stackItem.source.name}: Flipped heads — you win the flip!`);
  } else {
    newState.players.you.life -= damageAmount;
    addLog(`${stackItem.source.name}: Flipped tails — ${stackItem.source.name} deals ${damageAmount} damage to you. Life: ${newState.players.you.life}`);
  }

  return newState;
};
