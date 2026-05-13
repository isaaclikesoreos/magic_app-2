import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const ImproviseSelector: FC = () => {
  const {
    improviseState,
    toggleImproviseArtifact,
    confirmImprovise,
    cancelImprovise,
    gameState
  } = usePuzzle();

  if (!improviseState || !gameState) return null;

  const { card, tappedCreatures: tappedArtifacts } = improviseState;
  const battlefield = gameState.players.you.battlefield || [];
  const untappedArtifacts = battlefield.filter(
    (c: any) => (c.type_line || '').toLowerCase().includes('artifact') && !c.tapped
  );
  const tappedIds = new Set(tappedArtifacts.map(c => c.instance_id));
  const tappedCount = tappedArtifacts.length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-slate-400 rounded-lg p-6 shadow-xl max-w-2xl">
        <div className="text-white font-semibold mb-2 text-center text-lg">
          Improvise — {card.name}
        </div>
        <div className="text-slate-300 text-sm text-center mb-1">
          Tap artifacts to reduce the generic mana cost ({card.mana_cost})
        </div>
        <div className={`text-center text-sm mb-4 font-bold ${tappedCount > 0 ? 'text-slate-200' : 'text-gray-400'}`}>
          {tappedCount > 0 ? `Tapping ${tappedCount} artifact${tappedCount !== 1 ? 's' : ''} (saves ${tappedCount} generic mana)` : 'No artifacts tapped'}
        </div>

        {untappedArtifacts.length === 0 ? (
          <div className="text-gray-500 text-center py-4">No untapped artifacts</div>
        ) : (
          <div className="grid grid-cols-4 gap-3 max-h-64 overflow-y-auto">
            {untappedArtifacts.map((artifact: any) => {
              const isSelected = tappedIds.has(artifact.instance_id);
              return (
                <button
                  key={artifact.instance_id}
                  onClick={() => toggleImproviseArtifact(artifact)}
                  className={`rounded-lg p-3 transition text-left border-2 ${
                    isSelected
                      ? 'bg-slate-700/50 border-slate-400'
                      : 'bg-gray-800 hover:bg-gray-700 border-gray-600 hover:border-slate-400'
                  }`}
                >
                  <div className="text-white text-xs font-bold truncate">{artifact.name}</div>
                  <div className="text-gray-400 text-xs truncate">{artifact.mana_cost || ''}</div>
                  <div className="text-gray-500 text-xs truncate">
                    {(artifact.type_line || '').split(' — ')[0]}
                  </div>
                  {isSelected && <div className="text-slate-300 text-xs mt-1">✓ Tapping</div>}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex justify-center gap-3">
          <button
            onClick={confirmImprovise}
            className="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded font-semibold transition"
          >
            Cast{tappedCount > 0 ? ` (improvise ${tappedCount})` : ''}
          </button>
          <button
            onClick={cancelImprovise}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded font-semibold transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImproviseSelector;
