import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';
import { StackItem as StackItemType } from '@/types';
import { getEffectDescription } from '../../engine/utils/effectDescription';

const StackDisplay: FC = () => {
  const {
    stack,
    holdingPriority,
    toggleHoldPriority,
    resolveTopOfStack,
    resolveAllStack,
    awaitingStackInput,
    startMultiTargeting,
    copyTargetingState,
    selectStackSpellTarget,
    cancelTargeting
  } = usePuzzle();

  // Disable resolve buttons when the top item needs player input (targeting) and
  // hasn't received it yet — prevents accidentally resolving without choosing targets.
  const topItem = stack.length > 0 ? stack[stack.length - 1] : null;
  // Effects that handle their own targeting inside resolveStack don't block the resolve buttons
  const selfHandledTypes = new Set(['grant_flashback', 'tutor', 'return_from_graveyard_to_hand', 'exile_until_end_step', 'exile_until_leaves', 'exile_under', 'damage', 'deal_damage', 'drain_life', 'destroy', 'buff_creature']);
  const topNeedsInput = topItem !== null && topItem.requires_input && !topItem.targeting_data
    && !selfHandledTypes.has(topItem.effect?.type || '');
  const resolveDisabled = awaitingStackInput !== null || topNeedsInput || !!copyTargetingState;

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mt-4">
      {/* Priority Toggle - Always visible */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-400">Priority</h3>
        <button
          onClick={toggleHoldPriority}
          className={`px-3 py-1 rounded text-sm font-medium transition ${
            holdingPriority
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {holdingPriority ? 'Holding Priority' : 'Auto-Resolve'}
        </button>
      </div>

      {/* Stack items - only shown when there are items */}
      {stack.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-gray-400 mb-2">
            Stack ({stack.length} item{stack.length !== 1 ? 's' : ''})
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {[...stack].reverse().map((item, index) => (
              <StackItemDisplay
                key={item.id}
                item={item}
                isTop={index === 0}
                awaitingInput={awaitingStackInput === item.id}
                onClickForTargeting={startMultiTargeting}
                isValidCopyTarget={
                  copyTargetingState?.phase === 'targeting_spell' && (
                    (copyTargetingState.mode === 'counter' || copyTargetingState.mode === 'counter_return' || copyTargetingState.mode === 'counter_unless_pay')
                      ? ['spell', 'creature_spell', 'permanent_spell', 'spell_copy'].includes(item.type)
                      : (item.type === 'spell' && (!copyTargetingState.onlyYourSpells || (item.source as any).owner === 'you'))
                  )
                }
                onSelectAsCopyTarget={selectStackSpellTarget}
              />
            ))}
          </div>

          {/* Resolve buttons */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={resolveTopOfStack}
              disabled={resolveDisabled}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white py-2 px-3 rounded text-sm font-medium transition"
            >
              Resolve Top
            </button>
            <button
              onClick={resolveAllStack}
              disabled={resolveDisabled}
              className="flex-1 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 text-white py-2 px-3 rounded text-sm font-medium transition"
            >
              Resolve All
            </button>
          </div>
        </div>
      )}

      {/* Counter targeting banner — shown when waiting for a spell target */}
      {copyTargetingState?.phase === 'targeting_spell' &&
        (copyTargetingState.mode === 'counter' || copyTargetingState.mode === 'counter_return' || copyTargetingState.mode === 'counter_unless_pay') && (
        <div className="mt-3 bg-blue-900/40 border border-blue-600 rounded p-2 flex items-center justify-between">
          <span className="text-blue-300 text-xs">
            Select a spell on the stack to counter
          </span>
          <button
            onClick={cancelTargeting}
            className="text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded transition"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Empty stack message when holding priority */}
      {stack.length === 0 && holdingPriority && (
        <div className="mt-3 text-xs text-gray-500 text-center py-2">
          Stack is empty. Cast a spell to add it to the stack.
        </div>
      )}
    </div>
  );
};

interface StackItemProps {
  item: StackItemType;
  isTop: boolean;
  awaitingInput: boolean;
  onClickForTargeting: (stackItemId: string) => void;
  isValidCopyTarget?: boolean;
  onSelectAsCopyTarget?: (stackItemId: string) => void;
}

const StackItemDisplay: FC<StackItemProps> = ({ item, isTop, awaitingInput, onClickForTargeting, isValidCopyTarget, onSelectAsCopyTarget }) => {
  // Effects that handle their own targeting inside resolveStack — don't route to startMultiTargeting
  const selfHandledTypes = new Set(['grant_flashback', 'tutor', 'return_from_graveyard_to_hand', 'exile_until_end_step', 'exile_until_leaves', 'exile_under', 'damage', 'deal_damage', 'drain_life', 'destroy', 'buff_creature']);

  // Clickable when the item needs targeting input — whether or not startMultiTargeting
  // has been called yet. awaitingInput means it's actively open; requires_input && isTop
  // means it's waiting for the player to click to begin target selection.
  const needsTargeting = awaitingInput || (item.requires_input && isTop && !item.targeting_data
    && !selfHandledTypes.has(item.effect?.type || ''));

  const handleClick = () => {
    if (isValidCopyTarget && onSelectAsCopyTarget) {
      onSelectAsCopyTarget(item.id);
      return;
    }
    if (item.requires_input && !selfHandledTypes.has(item.effect?.type || '')) {
      onClickForTargeting(item.id);
    }
  };

  const getBorderColor = () => {
    if (isValidCopyTarget) return 'border-blue-500 ring-2 ring-blue-400 animate-pulse';
    if (needsTargeting) return 'border-yellow-500 ring-2 ring-yellow-400';
    if (isTop) return 'border-purple-500';
    return 'border-gray-600';
  };

  const getTypeIcon = () => {
    switch (item.type) {
      case 'spell': return '✨';
      case 'spell_copy': return '📋';
      case 'triggered_ability': return '⚡';
      case 'activated_ability': return '🎯';
      default: return '•';
    }
  };

  return (
    <div
      className={`bg-gray-900 rounded p-2 border-2 ${getBorderColor()} ${
        needsTargeting || isValidCopyTarget ? 'cursor-pointer hover:bg-gray-800' : ''
      } transition`}
      onClick={handleClick}
    >
      <div className="flex items-start gap-2">
        <div className="text-lg">{getTypeIcon()}</div>
        <div className="flex-1">
          <div className="text-white text-sm font-medium">
            {item.type === 'spell_copy' ? `Copy of ${item.source.name}` : item.source.name}
          </div>
          <div className="text-gray-400 text-xs mt-1">
            {(item as any).wasOverloaded ? `(Overloaded) ${getEffectDescription(item.effect)}` : getEffectDescription(item.effect)}
          </div>
          {needsTargeting && (
            <div className="text-yellow-400 text-xs mt-1 font-medium">
              Click to select targets
            </div>
          )}
          {isValidCopyTarget && (
            <div className="text-blue-400 text-xs mt-1 font-medium">
              Click to target this spell
            </div>
          )}
        </div>
        {isTop && (
          <div className="text-xs text-purple-400 font-medium">TOP</div>
        )}
      </div>
    </div>
  );
};

export default StackDisplay;
