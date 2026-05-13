import { FC, useState, useEffect } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';
import { getEffectDescription } from '../../engine/utils/effectDescription';
import { StackItem } from '@/types';

const TriggerOrderSelector: FC = () => {
  const { triggerOrderingState, confirmTriggerOrder } = usePuzzle();
  const [localOrder, setLocalOrder] = useState<StackItem[]>([]);
  const [autoOrder, setAutoOrder] = useState(false);

  useEffect(() => {
    if (triggerOrderingState) {
      setLocalOrder([...triggerOrderingState.triggers]);
      setAutoOrder(false);
    }
  }, [triggerOrderingState]);

  if (!triggerOrderingState) return null;

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...localOrder];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setLocalOrder(newOrder);
  };

  const moveDown = (index: number) => {
    if (index === localOrder.length - 1) return;
    const newOrder = [...localOrder];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setLocalOrder(newOrder);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-yellow-500 rounded-lg p-6 shadow-xl max-w-lg w-full">
        <div className="text-white font-semibold mb-1 text-center text-lg">
          {triggerOrderingState.reason || 'Order Simultaneous Triggers'}
        </div>
        <div className="text-gray-400 text-xs mb-4 text-center">
          Top resolves first. Use arrows to reorder.
        </div>

        <div className="space-y-2 mb-4">
          {localOrder.map((trigger, index) => (
            <div
              key={trigger.id}
              className="flex items-center gap-2 bg-gray-800 border border-gray-600 rounded-lg p-3"
            >
              {/* Order number */}
              <div className="text-yellow-400 font-bold text-sm w-6 text-center flex-shrink-0">
                {index + 1}
              </div>

              {/* Trigger info */}
              <div className="flex-grow min-w-0">
                <div className="text-white font-medium text-sm truncate">
                  {trigger.source.name}
                </div>
                <div className="text-gray-400 text-xs truncate">
                  {getEffectDescription(trigger.effect)}
                </div>
              </div>

              {/* Up/Down buttons */}
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center ${
                    index === 0
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-600 hover:bg-gray-500 text-white'
                  }`}
                >
                  ^
                </button>
                <button
                  onClick={() => moveDown(index)}
                  disabled={index === localOrder.length - 1}
                  className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center ${
                    index === localOrder.length - 1
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-600 hover:bg-gray-500 text-white'
                  }`}
                >
                  v
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Auto-order checkbox */}
        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={autoOrder}
            onChange={(e) => setAutoOrder(e.target.checked)}
            className="rounded border-gray-600 bg-gray-800 text-yellow-500 focus:ring-yellow-500"
          />
          <span className="text-gray-300 text-sm">Auto-order for this combination</span>
        </label>

        {/* Confirm button */}
        <button
          onClick={() => confirmTriggerOrder(localOrder, autoOrder)}
          className="w-full bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded font-semibold transition"
        >
          Confirm Order
        </button>
      </div>
    </div>
  );
};

export default TriggerOrderSelector;
