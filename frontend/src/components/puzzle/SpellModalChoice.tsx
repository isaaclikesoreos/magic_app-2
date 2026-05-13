import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const SpellModalChoice: FC = () => {
  const {
    modalSpellState,
    selectModalSpellMode,
    cancelModalSpell,
    gameState,
  } = usePuzzle();

  if (!modalSpellState) return null;

  const { card, modes, chooseCount, chosenModes, phase } = modalSpellState;

  // Check if a mode has valid targets available
  const hasValidTargets = (mode: typeof modes[0]): boolean => {
    if (!gameState) return false;
    if (mode.targetType === 'none') return true;
    if (mode.targetType === 'player') return true;
    if (mode.targetType === 'creature_or_player') {
      // Always valid — can target a player at minimum
      return true;
    }
    if (mode.targetType === 'creature') {
      const allCreatures = [
        ...(gameState.players.you.battlefield || []),
        ...(gameState.players.opponent.battlefield || []),
      ].filter(c => (c.type_line || '').toLowerCase().includes('creature'));
      return allCreatures.length > 0;
    }
    if (mode.targetType === 'artifact') {
      const allArtifacts = [
        ...(gameState.players.you.battlefield || []),
        ...(gameState.players.opponent.battlefield || []),
      ].filter(c => (c.type_line || '').toLowerCase().includes('artifact'));
      return allArtifacts.length > 0;
    }
    if (mode.targetType === 'graveyard_creature') {
      const graveyardCreatures = (gameState.players.you.graveyard || []).filter(
        c => (c.type_line || '').toLowerCase().includes('creature')
      );
      return graveyardCreatures.length > 0;
    }
    return true;
  };

  // Mode selection phase
  if (phase === 'choosing') {
    const remaining = chooseCount - chosenModes.length;
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-gray-900 border-2 border-amber-500 rounded-lg p-6 shadow-xl max-w-md">
          <h3 className="text-lg font-bold text-white mb-1">
            {card.name}
          </h3>
          <p className="text-gray-400 text-sm mb-4">
            Choose {remaining} more mode{remaining !== 1 ? 's' : ''} ({chosenModes.length}/{chooseCount} selected)
          </p>

          <div className="space-y-3">
            {modes.map((mode, i) => {
              const isChosen = chosenModes.includes(i);
              const noTargets = !hasValidTargets(mode);
              const disabled = isChosen || noTargets;

              return (
                <button
                  key={i}
                  onClick={() => !disabled && selectModalSpellMode(i)}
                  disabled={disabled}
                  className={`w-full py-3 px-4 rounded text-left transition-colors border ${
                    isChosen
                      ? 'bg-amber-800 border-amber-500 text-amber-200'
                      : noTargets
                        ? 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed'
                        : 'bg-gray-700 hover:bg-gray-600 border-gray-500 hover:border-amber-400 text-white cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isChosen && <span className="text-amber-400">✓</span>}
                    <span>{mode.description}</span>
                  </div>
                  {noTargets && !isChosen && (
                    <div className="text-xs text-gray-500 mt-1">No valid targets</div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={cancelModalSpell}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Targeting phase — show a banner indicating what target is needed
  if (phase === 'targeting') {
    const currentModeIdx = modalSpellState.chosenModes[modalSpellState.currentTargetingModeIdx];
    const currentMode = modes[currentModeIdx];

    return (
      <div className="bg-amber-900 border border-amber-500 rounded-lg p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-amber-300 font-semibold">{card.name}:</span>
          <span className="text-white">
            Mode {modalSpellState.currentTargetingModeIdx + 1}/{modalSpellState.chosenModes.length}
          </span>
          <span className="text-amber-400">— {currentMode.description}</span>
        </div>
        <button
          onClick={cancelModalSpell}
          className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm transition"
        >
          Cancel
        </button>
      </div>
    );
  }

  return null;
};

export default SpellModalChoice;
