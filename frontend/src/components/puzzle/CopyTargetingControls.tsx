import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const getTargetDescription = (targeting: any): string => {
  if (!targeting) return 'unknown';
  if (targeting.targetType === 'player') {
    return targeting.targetData === 'opponent' ? 'Opponent' : 'You';
  }
  if (targeting.targetType === 'creature') {
    return targeting.targetData?.name || 'creature';
  }
  return 'target';
};

const CopyTargetingControls: FC = () => {
  const {
    copyTargetingState,
    keepCopyOriginalTarget,
    cancelCopyTargeting,
  } = usePuzzle();

  if (!copyTargetingState) return null;

  if (copyTargetingState.phase === 'targeting_spell') {
    const isCounter = copyTargetingState.mode === 'counter' || copyTargetingState.mode === 'counter_return';
    const borderColor = isCounter ? 'border-red-500' : 'border-blue-500';
    const accentColor = isCounter ? 'text-red-400' : 'text-blue-400';

    const getDescription = () => {
      const cardName = copyTargetingState.sourceCard?.name || 'Spell';
      if (isCounter) {
        return `${cardName} — Select a spell on the stack to counter`;
      }
      const restriction = copyTargetingState.onlyYourSpells ? ' you control' : '';
      return `${cardName} — Select an instant or sorcery${restriction} spell on the stack`;
    };

    return (
      <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-gray-900 border-2 ${borderColor} rounded-lg p-4 shadow-2xl max-w-lg`}>
        <div className="text-center mb-3">
          <div className={`${accentColor} font-bold text-lg`}>
            {isCounter ? 'COUNTER SPELL' : 'COPY SPELL'}
          </div>
          <div className="text-white mt-1">
            {getDescription()}
          </div>
        </div>
        <div className="text-sm text-gray-400 mb-3">
          Click on a spell on the stack to target it.
        </div>
        <button
          onClick={cancelCopyTargeting}
          className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded font-medium transition"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (copyTargetingState.phase === 'retargeting_copy') {
    const targetDesc = getTargetDescription(copyTargetingState.originalTargeting);

    return (
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-gray-900 border-2 border-blue-500 rounded-lg p-4 shadow-2xl max-w-lg">
        <div className="text-center mb-3">
          <div className="text-blue-400 font-bold text-lg">CHOOSE NEW TARGETS</div>
          <div className="text-white mt-1">
            Copy of {copyTargetingState.copiedStackItem?.source.name}
          </div>
        </div>
        <div className="text-sm text-gray-400 mb-3">
          Click a valid target to redirect the copy, or keep the original target.
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={keepCopyOriginalTarget}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded font-medium transition"
          >
            Keep Original Target ({targetDesc})
          </button>
          <button
            onClick={cancelCopyTargeting}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded font-medium transition"
          >
            Cancel Copy
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default CopyTargetingControls;
