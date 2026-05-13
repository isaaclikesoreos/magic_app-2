import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';
import { calculatePower } from '../../engine/utils/powerToughness';
import { parseManaCost, canAffordCost } from '../../engine/utils/manaCost';

const formatCost = (cost: any): string => {
  if (!cost) return 'Activate';
  if (typeof cost === 'string') return cost;
  const parts: string[] = [];
  if (cost.mana) {
    parts.push(typeof cost.mana === 'string' ? cost.mana : JSON.stringify(cost.mana));
  }
  if (cost.tap) parts.push('{T}');
  if (cost.sacrifice?.self) parts.push('Sacrifice ~');
  if (cost.sacrifice && !cost.sacrifice.self) parts.push('Sacrifice a creature');
  return parts.join(', ') || 'Activate';
};

const AbilityMenu: FC = () => {
  const { abilityMenuState, selectAbilityFromMenu, cancelAbilityMenu, gameState } = usePuzzle();

  if (!abilityMenuState || !gameState) return null;

  const { permanent, abilities } = abilityMenuState;
  const currentPower = calculatePower(permanent);
  const manaPool = gameState.players.you.mana_pool;

  const canActivate = (ability: any): boolean => {
    const cost = ability.cost;
    // Check tap
    if (cost && typeof cost !== 'string' && cost.tap && permanent.tapped) return false;
    // Check mana
    if (cost && typeof cost !== 'string' && cost.mana) {
      const manaString = typeof cost.mana === 'string' ? cost.mana : String(cost.mana);
      const parsedCost = parseManaCost(manaString);
      if (!canAffordCost(parsedCost, manaPool)) return false;
    }
    // Check condition
    if (ability.condition?.type === 'power_gte') {
      if (currentPower < ability.condition.value) return false;
    }
    return true;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-cyan-500 rounded-lg p-6 shadow-xl max-w-md">
        <div className="text-white font-semibold mb-4 text-center text-lg">
          {permanent.name} — Choose Ability
        </div>
        <div className="space-y-2">
          {abilities.map((ability: any, index: number) => {
            const enabled = canActivate(ability);
            return (
              <button
                key={index}
                onClick={() => enabled && selectAbilityFromMenu(index)}
                disabled={!enabled}
                className={`w-full py-3 px-4 rounded font-medium transition text-left border-2 ${
                  enabled
                    ? 'bg-cyan-800 hover:bg-cyan-700 border-cyan-600 text-white cursor-pointer'
                    : 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed opacity-60'
                }`}
              >
                <div className="font-bold text-sm">{formatCost(ability.cost)}</div>
                <div className={`text-xs mt-1 ${enabled ? 'text-cyan-200' : 'text-gray-500'}`}>
                  {ability.description || 'Activate ability'}
                </div>
                {ability.condition?.type === 'power_gte' && (
                  <div className={`text-xs mt-1 ${
                    currentPower >= ability.condition.value ? 'text-green-400' : 'text-red-400'
                  }`}>
                    Requires power &gt;= {ability.condition.value} (current: {currentPower})
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={cancelAbilityMenu}
          className="mt-4 w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default AbilityMenu;
