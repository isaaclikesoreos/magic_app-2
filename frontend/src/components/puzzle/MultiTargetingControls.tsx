import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

interface Target {
  type: string;
  data: any;
}

const getTargetName = (target: Target): string => {
  if (target.type === 'player') {
    return target.data === 'opponent' ? 'Opponent' : 'You';
  }
  if (target.type === 'creature') {
    return target.data.name;
  }
  return 'Unknown';
};

const MultiTargetingControls: FC = () => {
  const {
    multiTargetingState,
    adjustDamageAmount,
    confirmMultiTargets,
    cancelMultiTargeting
  } = usePuzzle();

  if (!multiTargetingState) return null;

  // Calculate remaining damage dynamically
  const assignedDamage = multiTargetingState.assignments.reduce((sum, a) => sum + a.damage, 0);
  const remainingDamage = multiTargetingState.totalDamage - assignedDamage;

  const canConfirm = remainingDamage === 0 &&
                     multiTargetingState.assignments.length > 0;

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 bg-gray-900 border-2 border-orange-500 rounded-lg p-4 shadow-2xl max-w-md">
      <div className="text-center mb-3">
        <div className="text-orange-400 font-semibold">
          Assigning {multiTargetingState.totalDamage} damage
        </div>
        <div className="text-white text-sm mt-1">
          Remaining: {remainingDamage}
        </div>
      </div>

      {/* Target list with damage controls */}
      <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
        {multiTargetingState.assignments.map((assignment, idx) => (
          <div key={idx} className="flex items-center gap-2 bg-gray-800 rounded p-2">
            <div className="flex-1 text-white text-sm">
              {getTargetName(assignment.target)}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => adjustDamageAmount(idx, -1)}
                disabled={assignment.damage <= 0}
                className="w-6 h-6 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded font-bold text-sm transition"
              >
                -
              </button>
              <div className="w-8 text-center text-orange-400 font-bold">
                {assignment.damage}
              </div>
              <button
                onClick={() => adjustDamageAmount(idx, 1)}
                disabled={remainingDamage <= 0}
                className="w-6 h-6 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded font-bold text-sm transition"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={cancelMultiTargeting}
          className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded font-medium transition"
        >
          Cancel
        </button>
        <button
          onClick={confirmMultiTargets}
          disabled={!canConfirm}
          className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 text-white py-2 px-4 rounded font-medium transition"
        >
          Confirm Targets
        </button>
      </div>
    </div>
  );
};

export default MultiTargetingControls;
