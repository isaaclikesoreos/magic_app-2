import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

interface TargetInfo {
  targetType: string;
  targetData: any;
}

const getTargetDescription = (target: TargetInfo | null | undefined): string => {
  if (!target) return 'unknown';
  if (target.targetType === 'player') {
    return target.targetData === 'opponent' ? 'Opponent' : 'You';
  }
  if (target.targetType === 'creature') {
    return target.targetData?.name || 'creature';
  }
  return 'target';
};

const StormTargetingControls: FC = () => {
  const {
    stormTargetingState,
    sendAllStormCopiesToOriginalTarget,
    cancelStormTargeting
  } = usePuzzle();

  if (!stormTargetingState) return null;

  const { copies, currentCopyIndex, source, originalTarget } = stormTargetingState;
  const remainingCopies = copies.length - currentCopyIndex;
  const currentCopy = copies[currentCopyIndex];

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-gray-900 border-2 border-yellow-500 rounded-lg p-4 shadow-2xl max-w-lg">
      <div className="text-center mb-3">
        <div className="text-yellow-400 font-bold text-lg flex items-center justify-center gap-2">
          <span className="text-2xl">⚡</span>
          STORM
          <span className="text-2xl">⚡</span>
        </div>
        <div className="text-white mt-1">
          {source.name} - {remainingCopies} cop{remainingCopies === 1 ? 'y' : 'ies'} remaining
        </div>
      </div>

      {/* Current copy info */}
      <div className="bg-gray-800 rounded p-3 mb-3">
        <div className="text-sm text-gray-400">Targeting copy {currentCopyIndex + 1} of {copies.length}:</div>
        <div className="text-white font-medium">{currentCopy?.source.name}</div>
        <div className="text-yellow-400 text-sm mt-1">
          Click a valid target (player or creature) to assign this copy
        </div>
      </div>

      {/* Original target info */}
      {originalTarget && (
        <div className="text-sm text-gray-400 mb-3">
          Original spell targeted: <span className="text-white">{getTargetDescription(originalTarget)}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        <button
          onClick={sendAllStormCopiesToOriginalTarget}
          className="w-full bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded font-medium transition flex items-center justify-center gap-2"
        >
          <span>Send All {remainingCopies} to Same Target</span>
          <span className="text-yellow-200">({getTargetDescription(originalTarget)})</span>
        </button>
        <button
          onClick={cancelStormTargeting}
          className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded font-medium transition"
        >
          Cancel (Don't Add Copies)
        </button>
      </div>

      {/* Instructions */}
      <div className="mt-3 text-xs text-gray-500 text-center">
        Or click targets individually to send copies to different targets
      </div>
    </div>
  );
};

export default StormTargetingControls;
