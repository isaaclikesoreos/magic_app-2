import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const ProtectionColorSelector: FC = () => {
  let puzzle = null;
  try {
    puzzle = usePuzzle();
  } catch {
    return null;
  }

  const { protectionColorChoice, completeProtectionWithColor, cancelProtectionColorChoice } = puzzle;

  if (!protectionColorChoice) return null;

  const colors = [
    { name: 'White', code: 'W', bg: 'bg-yellow-100', hover: 'hover:bg-yellow-200', text: 'text-yellow-900' },
    { name: 'Blue', code: 'U', bg: 'bg-blue-400', hover: 'hover:bg-blue-500', text: 'text-white' },
    { name: 'Black', code: 'B', bg: 'bg-gray-800', hover: 'hover:bg-gray-900', text: 'text-white' },
    { name: 'Red', code: 'R', bg: 'bg-red-500', hover: 'hover:bg-red-600', text: 'text-white' },
    { name: 'Green', code: 'G', bg: 'bg-green-500', hover: 'hover:bg-green-600', text: 'text-white' },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg border-2 border-purple-500 p-6 max-w-md">
        <h3 className="text-xl font-bold text-white mb-4">Choose Protection Color</h3>
        <p className="text-gray-300 mb-4">
          {protectionColorChoice.targetData.name} will gain protection from the chosen color.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {colors.map(color => (
            <button
              key={color.code}
              onClick={() => completeProtectionWithColor && completeProtectionWithColor(color.code)}
              className={`${color.bg} ${color.hover} ${color.text} py-3 px-4 rounded font-bold text-lg transition-colors`}
            >
              {color.name}
            </button>
          ))}
        </div>

        <button
          onClick={() => cancelProtectionColorChoice && cancelProtectionColorChoice()}
          className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default ProtectionColorSelector;
