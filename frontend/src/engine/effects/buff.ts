import { roleDefinitions } from '../data/roles';
import { GameState, StackItem, Role, PlayerKey, Permanent } from '@/types';

interface EffectHelpers {
  addLog: (message: string) => void;
}

/**
 * Buff a target creature (e.g., Monstrous Rage).
 */
export const applyBuffCreature = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const targetType = stackItem.targeting_data?.targetType;
  const targetData = stackItem.targeting_data?.targetData;
  const powerBuff = stackItem.effect.power || 0;
  const toughnessBuff = stackItem.effect.toughness || 0;
  const roleToCreate = stackItem.effect.role || null;

  if (targetType === 'creature' && targetData) {
    const creatureOwner = (targetData.owner || 'you') as PlayerKey;
    const targetPlayer = newState.players[creatureOwner];
    const creature = targetPlayer.battlefield?.find((c: Permanent) =>
      targetData.instance_id
        ? c.instance_id === targetData.instance_id
        : c.card_id === targetData.card_id
    );

    if (creature) {
      // Handle +1/+1 counters (permanent) vs temporary buffs
      const counterType = stackItem.effect.counter as string | undefined;
      const counterAmount = stackItem.effect.counter_amount as number | undefined;
      if (counterType && counterAmount) {
        creature.counters = creature.counters || {};
        creature.counters[counterType] = (creature.counters[counterType] || 0) + counterAmount;
        addLog(`${stackItem.source.name} puts ${counterAmount} ${counterType} counter${counterAmount > 1 ? 's' : ''} on ${creature.name}.`);
      } else {
        creature.buffPower = (creature.buffPower || 0) + powerBuff;
        creature.buffToughness = (creature.buffToughness || 0) + toughnessBuff;
        const sign = (n: number) => (n >= 0 ? `+${n}` : String(n));
        addLog(`${stackItem.source.name} gives ${creature.name} ${sign(powerBuff)}/${sign(toughnessBuff)} until end of turn.`);

        if (stackItem.effect.grantsTrample) {
          creature.hasTrample = true;
          addLog(`${creature.name} gains trample until end of turn.`);
        }

        if (roleToCreate) {
          const existingRole = (creature.attachedRoles || []).find((r: Role) => r.type === roleToCreate);
          if (existingRole) {
            newState._leavingRoles = newState._leavingRoles || [];
            newState._leavingRoles.push({
              role: existingRole,
              owner: creatureOwner,
              attachedTo: creature.name
            });
          }
          creature.attachedRoles = (creature.attachedRoles || []).filter((r: Role) => r.type !== roleToCreate);

          const roleDef = (roleDefinitions as Record<string, any>)[roleToCreate] || { power: 1, toughness: 1 };
          creature.attachedRoles.push({
            type: roleToCreate as Role['type'],
            id: `role-${roleToCreate}-${Date.now()}`,
            ...roleDef
          });

          if (roleDef.keywords?.includes('trample')) {
            creature.hasTrample = true;
          }

          addLog(`Created ${roleToCreate} Role token attached to ${creature.name}.`);
        }
      }
    }
  }

  // Note: additional_effects (e.g., gain life) are handled generically by resolveStack

  return newState;
};

/**
 * Buff self (Fleshtaker effect - give self +X/+X until end of turn).
 */
export const applyBuffSelf = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const player = newState.players.you;

  const powerBuff = stackItem.effect.power || 0;
  const toughnessBuff = stackItem.effect.toughness || 0;
  const sourceId = stackItem.source.card_id;

  const sourcePermanent = player.battlefield?.find(c => c.card_id === sourceId);
  if (sourcePermanent) {
    sourcePermanent.buffPower = (sourcePermanent.buffPower || 0) + powerBuff;
    sourcePermanent.buffToughness = (sourcePermanent.buffToughness || 0) + toughnessBuff;
    addLog(`${sourcePermanent.name} gets +${powerBuff}/+${toughnessBuff} until end of turn.`);
  }

  return newState;
};

/**
 * Prowess trigger - give +1/+1 until end of turn.
 * The source of the trigger is the creature with prowess.
 */
export const applyProwessTrigger = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const player = newState.players.you;

  // Find the source permanent (the creature with prowess)
  const sourceInstanceId = stackItem.source.instance_id;
  const sourcePermanent = player.battlefield?.find(p => p.instance_id === sourceInstanceId);

  if (sourcePermanent) {
    sourcePermanent.prowessBonus = (sourcePermanent.prowessBonus || 0) + 1;
    addLog(`${sourcePermanent.name} gets +1/+1 from prowess until end of turn.`);
  }

  return newState;
};
