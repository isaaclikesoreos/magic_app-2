import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';
import { Permanent, PlayerKey } from '@/types';

const BallistaControls: FC = () => {
  const { ballistaState, completeBallistaAbility, cancelBallistaAbility, gameState } = usePuzzle();

  if (!ballistaState) return null;

  const { card, countersToRemove } = ballistaState;
  const opponentLife = gameState?.players?.opponent?.life || 0;
  const playerLife = gameState?.players?.you?.life || 0;

  const opponentCreatures = gameState?.players?.opponent?.battlefield?.filter(
    c => c.type_line?.toLowerCase().includes('creature')
  ) || [];

  const yourCreatures = gameState?.players?.you?.battlefield?.filter(
    c => c.type_line?.toLowerCase().includes('creature') && c.instance_id !== card.instance_id
  ) || [];

  const handleTargetPlayer = (playerType: PlayerKey) => {
    completeBallistaAbility('player', playerType);
  };

  const handleTargetCreature = (creature: Permanent, owner: PlayerKey) => {
    completeBallistaAbility('creature', { ...creature, owner });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-cyan-500 rounded-lg p-6 shadow-xl max-w-lg">
        <div className="text-white font-semibold mb-2 text-center">
          {card.name} - Deal {countersToRemove} Damage
        </div>
        <div className="text-cyan-400 text-sm text-center mb-4">
          Removing {countersToRemove} counter{countersToRemove > 1 ? 's' : ''} to deal {countersToRemove} damage
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Players column */}
          <div className="space-y-2">
            <div className="text-gray-400 text-xs mb-1">Target Player:</div>
            <button
              onClick={() => handleTargetPlayer('opponent')}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-3 rounded font-medium transition text-sm"
            >
              Opponent ({opponentLife} life)
            </button>
            <button
              onClick={() => handleTargetPlayer('you')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded font-medium transition text-sm"
            >
              Yourself ({playerLife} life)
            </button>
          </div>

          {/* Creatures column */}
          <div className="space-y-2">
            <div className="text-gray-400 text-xs mb-1">Target Creature:</div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {opponentCreatures.map(creature => {
                const toughness = parseInt(creature.toughness || '0') +
                  (creature.counters?.['+1/+1'] || 0);
                return (
                  <button
                    key={creature.instance_id}
                    onClick={() => handleTargetCreature(creature, 'opponent')}
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white py-1.5 px-2 rounded text-xs transition text-left"
                  >
                    <span className="text-orange-200">[Opp]</span> {creature.name} ({creature.power}/{toughness})
                  </button>
                );
              })}
              {yourCreatures.map(creature => {
                const toughness = parseInt(creature.toughness || '0') +
                  (creature.counters?.['+1/+1'] || 0);
                return (
                  <button
                    key={creature.instance_id}
                    onClick={() => handleTargetCreature(creature, 'you')}
                    className="w-full bg-green-600 hover:bg-green-700 text-white py-1.5 px-2 rounded text-xs transition text-left"
                  >
                    <span className="text-green-200">[You]</span> {creature.name} ({creature.power}/{toughness})
                  </button>
                );
              })}
              {opponentCreatures.length === 0 && yourCreatures.length === 0 && (
                <div className="text-gray-500 text-xs italic">No creatures on battlefield</div>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={cancelBallistaAbility}
          className="mt-4 w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default BallistaControls;
