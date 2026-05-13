import { FC, MouseEvent } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';
import { PlayerKey } from '@/types';

interface LifeTotalProps {
  life: number;
  isOpponent?: boolean;
}

const LifeTotal: FC<LifeTotalProps> = ({ life, isOpponent = false }) => {
  let puzzle = null;
  try {
    puzzle = usePuzzle();
  } catch {
    // Not in puzzle context
  }

  const {
    isTargeting,
    isValidTarget,
    castSpellOnTarget,
    multiTargetingState,
    addDamageTarget,
    stormTargetingState,
    assignStormCopyTarget,
    copyTargetingState,
    assignCopyNewTarget,
    activatedAbilityTargeting,
    completeActivatedAbilityWithTarget,
    modalSpellState,
    completeModalSpellTarget,
    triggerTargetingState,
    completeTriggerTarget,
  } = puzzle || {};

  const playerTarget: PlayerKey = isOpponent ? 'opponent' : 'you';
  const canBeTargeted = isTargeting && isValidTarget?.('player', playerTarget);
  const isMultiTargetCandidate = multiTargetingState != null &&
    (multiTargetingState.allowedTargetTypes?.includes('player') ?? true);
  const isCopyRetargetCandidate = copyTargetingState?.phase === 'retargeting_copy';
  const isStormTargetCandidate = stormTargetingState !== null;
  const isAlreadyTargeted = multiTargetingState?.assignments?.some(
    a => a.target.type === 'player' && a.target.data === playerTarget
  );

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();

    // If in copy retargeting mode, assign as copy target
    if (copyTargetingState?.phase === 'retargeting_copy' && assignCopyNewTarget) {
      assignCopyNewTarget('player', playerTarget);
      return;
    }

    // If in storm targeting mode, assign this as the storm copy target
    if (isStormTargetCandidate && assignStormCopyTarget) {
      assignStormCopyTarget('player', playerTarget);
      return;
    }

    // If in multi-targeting mode, add as damage target
    if (isMultiTargetCandidate && !isAlreadyTargeted && addDamageTarget) {
      const rect = e.currentTarget.getBoundingClientRect();
      addDamageTarget(
        { type: 'player', data: playerTarget },
        0, // Initial damage, user will adjust
        {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        }
      );
      return;
    }

    if (canBeTargeted) {
      // Check if targeting for activated ability
      if (activatedAbilityTargeting && completeActivatedAbilityWithTarget) {
        completeActivatedAbilityWithTarget('player', playerTarget);
      } else if (modalSpellState?.phase === 'targeting' && completeModalSpellTarget) {
        completeModalSpellTarget('player', playerTarget);
      } else if (triggerTargetingState && completeTriggerTarget) {
        completeTriggerTarget('player', playerTarget);
      } else if (castSpellOnTarget) {
        // Targeting for a spell
        castSpellOnTarget('player', playerTarget);
      }
    }
  };

  const bgColor = isOpponent ? 'bg-red-900' : 'bg-green-900';
  const borderColor = isOpponent ? 'border-red-700' : 'border-green-700';

  // Add target styling when can be targeted
  let targetStyle = '';
  if (isCopyRetargetCandidate) {
    targetStyle = 'ring-4 ring-blue-500 animate-pulse cursor-crosshair';
  } else if (canBeTargeted || isStormTargetCandidate) {
    targetStyle = 'ring-4 ring-red-500 animate-pulse cursor-crosshair';
  } else if (isMultiTargetCandidate && !isAlreadyTargeted) {
    targetStyle = 'ring-4 ring-orange-500 cursor-pointer hover:ring-orange-400';
  } else if (isAlreadyTargeted) {
    targetStyle = 'ring-4 ring-yellow-500';
  }

  return (
    <div
      onClick={handleClick}
      className={`${bgColor} ${borderColor} ${targetStyle} border-2 rounded-lg px-4 py-2 flex items-center justify-center transition-all ${canBeTargeted ? 'hover:ring-red-400' : ''}`}
    >
      <span className="text-2xl font-bold text-white">{life}</span>
      <span className="text-xs text-gray-300 ml-2">life</span>
      {canBeTargeted && (
        <span className="ml-2 text-red-400 text-lg">⎯</span>
      )}
    </div>
  );
};

export default LifeTotal;
