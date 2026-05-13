import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';
import { PHASES } from '../../constants/phases';

const PhaseIndicator: FC = () => {
  let puzzle = null;
  try {
    puzzle = usePuzzle();
  } catch {
    return null;
  }

  const { advancePhase, getCurrentPhase, isDeclaringAttackers, confirmAttackers, declaredAttackers, stack, gameState, attackerTargets, setAttackerTarget } = puzzle;
  const currentPhase = getCurrentPhase();
  const currentPhaseIndex = PHASES.findIndex(p => p.id === currentPhase.id);
  const isStackBlocked = stack.length > 0;

  // Opponent's planeswalkers — possible attack targets.
  const opponentPlaneswalkers = (gameState?.players.opponent.battlefield || [])
    .filter((c: any) => (c.type_line || '').toLowerCase().includes('planeswalker'));

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-2 w-28">
      {/* Phase list */}
      <div className="space-y-1">
        {PHASES.map((phase, index) => {
          const isActive = phase.id === currentPhase.id;
          const isPast = index < currentPhaseIndex;

          return (
            <div
              key={phase.id}
              className={`px-2 py-1.5 rounded text-xs font-medium transition-all ${
                isActive
                  ? 'bg-purple-600 text-white'
                  : isPast
                  ? 'bg-gray-700 text-gray-500'
                  : 'bg-gray-900 text-gray-400'
              }`}
            >
              <div className="flex items-center gap-1">
                {isActive && <span className="text-yellow-400">▶</span>}
                <span>{phase.shortName}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="mt-3 pt-2 border-t border-gray-700">
        {isStackBlocked && (
          <p className="text-yellow-400 text-xs text-center mb-2">Resolve stack first</p>
        )}
        {isDeclaringAttackers ? (
          <div className="space-y-2">
            {opponentPlaneswalkers.length > 0 && declaredAttackers.length > 0 && (
              <div className="bg-gray-900 rounded border border-gray-700 p-1 space-y-1">
                <div className="text-xs text-gray-400 px-1">Targets:</div>
                {declaredAttackers.map(attackerId => {
                  const attacker = gameState?.players.you.battlefield.find((c: any) => c.instance_id === attackerId);
                  if (!attacker) return null;
                  const current = attackerTargets[attackerId] || '';
                  return (
                    <div key={attackerId} className="text-[10px]">
                      <div className="text-gray-300 truncate">{attacker.name}</div>
                      <select
                        value={current}
                        onChange={(e) => setAttackerTarget(attackerId, e.target.value || null)}
                        className="w-full bg-gray-800 text-white text-[10px] py-0.5 px-1 rounded border border-gray-700"
                      >
                        <option value="">→ Player</option>
                        {opponentPlaneswalkers.map((pw: any) => (
                          <option key={pw.instance_id} value={pw.instance_id}>
                            → {pw.name} ({pw.loyalty ?? 0})
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
            <button
              onClick={confirmAttackers}
              disabled={declaredAttackers.length === 0 || isStackBlocked}
              className={`w-full py-2 rounded text-xs font-medium transition ${
                declaredAttackers.length > 0 && !isStackBlocked
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              Attack! ({declaredAttackers.length})
            </button>
            <button
              onClick={advancePhase}
              disabled={isStackBlocked}
              className={`w-full py-1 rounded text-xs font-medium transition ${
                isStackBlocked
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              No Attack
            </button>
          </div>
        ) : (
          <button
            onClick={advancePhase}
            disabled={isStackBlocked}
            className={`w-full py-2 rounded text-xs font-medium flex items-center justify-center gap-1 transition ${
              isStackBlocked
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-500 text-white'
            }`}
          >
            <span>Next</span>
            <span className="text-sm">→</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default PhaseIndicator;
