import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const ModalTriggerChoice: FC = () => {
  const { modalTriggerChoice, completeModalTriggerChoice } = usePuzzle();

  if (!modalTriggerChoice) return null;

  const { trigger, modes } = modalTriggerChoice;
  const sourceName = trigger.source?.name || 'Unknown';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-amber-500 rounded-lg p-6 shadow-xl max-w-md">
        <h3 className="text-lg font-bold text-white mb-1">Choose One</h3>
        <p className="text-gray-400 text-sm mb-4">{sourceName}&apos;s triggered ability</p>

        <div className="space-y-3">
          {modes.map((mode, i) => (
            <button
              key={i}
              onClick={() => completeModalTriggerChoice(i)}
              className="w-full bg-gray-700 hover:bg-gray-600 border border-gray-500
                         hover:border-amber-400 text-white py-3 px-4 rounded
                         text-left transition-colors"
            >
              {mode.description}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ModalTriggerChoice;
