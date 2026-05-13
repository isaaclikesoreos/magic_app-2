import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const ManaColorSelector: FC = () => {
  const { manaColorSelection, selectManaColor, cancelManaColorSelection } = usePuzzle();

  if (!manaColorSelection) return null;

  const amount = manaColorSelection.amount || 1;

  const manaColors = [
    { color: 'W', bgClass: 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800' },
    { color: 'U', bgClass: 'bg-blue-500 hover:bg-blue-600 text-white' },
    { color: 'B', bgClass: 'bg-gray-800 hover:bg-gray-900 text-white' },
    { color: 'R', bgClass: 'bg-red-500 hover:bg-red-600 text-white' },
    { color: 'G', bgClass: 'bg-green-500 hover:bg-green-600 text-white' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-purple-500 rounded-lg p-6 shadow-xl">
        <div className="text-white font-semibold mb-4 text-center">
          {manaColorSelection.sourceCard?.name} - Select Mana Color
        </div>
        <div className="flex gap-3">
          {manaColors.map(({ color, bgClass }) => (
            <button
              key={color}
              onClick={() => selectManaColor(color)}
              className={`w-16 h-16 rounded-lg font-bold text-2xl transition ${bgClass} flex items-center justify-center`}
            >
              {amount > 1 ? `${amount}x{${color}}` : `{${color}}`}
            </button>
          ))}
        </div>
        <div className="text-gray-400 text-xs text-center mt-3">
          {amount > 1
            ? `Click to add ${amount} mana of that color to your pool`
            : 'Click to add one mana of that color to your pool'}
        </div>
        <button
          onClick={cancelManaColorSelection}
          className="mt-4 w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default ManaColorSelector;
