import { FC, useState } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';
import type { Card } from '@/types';

/**
 * Multi-select library tutor with player-chosen ordering.
 * Selection order = top-of-library order: position 0 of `selected` ends up
 * drawn first. Used by Goblin Recruiter ("search for any number of Goblin
 * cards, put them on top in any order").
 */
const MultiTutorSelector: FC = () => {
  const { multiTutorSelectionState, completeMultiTutorSelection, cancelMultiTutorSelection } = usePuzzle();
  const [selected, setSelected] = useState<Card[]>([]);

  if (!multiTutorSelectionState) return null;

  const { candidates, reason } = multiTutorSelectionState;
  const selectedIds = new Set(selected.map(c => c.instance_id || String(c.card_id)));

  const cardKey = (c: Card) => c.instance_id || String(c.card_id);

  const addCard = (c: Card) => {
    if (selectedIds.has(cardKey(c))) return;
    setSelected(prev => [...prev, c]);
  };

  const removeAt = (idx: number) => {
    setSelected(prev => prev.filter((_, i) => i !== idx));
  };

  const confirm = () => {
    completeMultiTutorSelection(selected);
    setSelected([]);
  };

  const cancel = () => {
    cancelMultiTutorSelection();
    setSelected([]);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-red-500 rounded-lg p-6 shadow-2xl max-w-4xl w-full mx-4">
        <div className="text-white font-semibold mb-1 text-center text-lg">{reason}</div>
        <div className="text-red-300 text-xs text-center mb-4">
          Click cards in your library to add them. The first card you select goes on top (drawn first).
          Click "Confirm" with zero selected to put nothing on top.
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-gray-300 text-sm mb-2">Available in library ({candidates.length})</div>
            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
              {candidates.map((c) => {
                const isPicked = selectedIds.has(cardKey(c));
                return (
                  <button
                    key={cardKey(c)}
                    onClick={() => addCard(c)}
                    disabled={isPicked}
                    className={`text-left rounded p-2 border-2 transition ${
                      isPicked
                        ? 'bg-gray-800 border-gray-700 opacity-40 cursor-not-allowed'
                        : 'bg-gray-800 border-gray-600 hover:bg-gray-700 hover:border-red-400 cursor-pointer'
                    }`}
                  >
                    <div className={`text-xs font-bold truncate ${isPicked ? 'text-gray-500' : 'text-white'}`}>
                      {c.name}
                    </div>
                    <div className="text-gray-400 text-[10px] truncate">{c.mana_cost || ''}</div>
                    <div className="text-gray-500 text-[10px] truncate">
                      {c.type_line?.split(' - ')[0] || ''}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-gray-300 text-sm mb-2">
              Top of library ({selected.length}) — first → drawn first
            </div>
            <div className="max-h-72 overflow-y-auto pr-1 space-y-1">
              {selected.length === 0 && (
                <div className="text-gray-500 text-xs italic">No cards selected.</div>
              )}
              {selected.map((c, i) => (
                <div
                  key={`${cardKey(c)}-${i}`}
                  className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded px-2 py-1"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="text-red-300 text-xs font-bold w-5">{i + 1}.</div>
                    <div className="text-white text-xs font-semibold truncate">{c.name}</div>
                  </div>
                  <button
                    onClick={() => removeAt(i)}
                    className="text-red-400 hover:text-red-300 text-sm px-2"
                    title="Remove from order"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-5 justify-end">
          <button
            onClick={cancel}
            className="px-3 py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600 text-white"
          >
            Cancel (pick none)
          </button>
          <button
            onClick={confirm}
            className="px-4 py-1.5 text-sm rounded bg-red-600 hover:bg-red-500 text-white font-semibold"
          >
            Confirm ({selected.length})
          </button>
        </div>
      </div>
    </div>
  );
};

export default MultiTutorSelector;
