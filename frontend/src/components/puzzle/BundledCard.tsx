import { FC, useState, useRef, useEffect, MouseEvent } from 'react';
import PuzzleCard from './PuzzleCard';
import { Bundle } from '../../engine/utils/bundleKey';
import { usePuzzle } from '../../context/PuzzleContext';
import { PlayerKey } from '@/types';

interface BundledCardProps {
  bundle: Bundle;
  owner?: PlayerKey;
  location?: 'hand' | 'battlefield' | 'graveyard' | 'exile';
}

const BundledCard: FC<BundledCardProps> = ({ bundle, owner = 'you', location = 'battlefield' }) => {
  const representative = bundle.permanents[0];
  const count = bundle.permanents.length;

  const { isDeclaringAttackers, declaredAttackers, toggleAttacker } = usePuzzle();

  const memberIds = bundle.permanents.map(p => p.instance_id || '').filter(Boolean);
  const declaredInBundle = memberIds.filter(id => declaredAttackers.includes(id));
  const declaredCount = declaredInBundle.length;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerValue, setPickerValue] = useState(count);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    const onDocClick = (e: globalThis.MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [pickerOpen]);

  const declareN = (n: number) => {
    const undeclared = memberIds.filter(id => !declaredAttackers.includes(id));
    for (let i = 0; i < n && i < undeclared.length; i++) toggleAttacker(undeclared[i]);
  };
  const undeclareAll = () => {
    declaredInBundle.forEach(id => toggleAttacker(id));
  };

  const handleCaptureClick = (e: MouseEvent) => {
    if (!isDeclaringAttackers || owner !== 'you') return;
    e.stopPropagation();
    e.preventDefault();
    if (e.shiftKey) {
      setPickerValue(count);
      setPickerOpen(true);
      return;
    }
    if (declaredCount === count) {
      undeclareAll();
    } else {
      declareN(count - declaredCount);
    }
  };

  const applyPicker = () => {
    const target = Math.max(0, Math.min(count, pickerValue));
    const delta = target - declaredCount;
    if (delta > 0) declareN(delta);
    else if (delta < 0) {
      // un-declare the most recently declared until we hit target
      const toRemove = declaredInBundle.slice(target);
      toRemove.forEach(id => toggleAttacker(id));
    }
    setPickerOpen(false);
  };

  return (
    <div className="relative">
      {/* Card + attack-capture wrapper. The picker lives OUTSIDE this wrapper
          so clicks on its buttons aren't intercepted by handleCaptureClick. */}
      <div onClickCapture={handleCaptureClick}>
        <PuzzleCard card={representative} owner={owner} location={location} />

        {/* Count badge */}
        <div
          className="absolute bottom-1 left-1/2 -translate-x-1/2 z-[2] px-1.5 py-0.5 rounded-full bg-amber-500 text-black text-xs font-bold shadow-md ring-1 ring-amber-700 pointer-events-none"
          title={`${count} identical permanents`}
        >
          ×{count}
        </div>

        {/* "Declared N of M" indicator during attacker declaration */}
        {isDeclaringAttackers && owner === 'you' && declaredCount > 0 && (
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-[3] px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold shadow ring-1 ring-red-800 pointer-events-none whitespace-nowrap">
            ⚔ {declaredCount}/{count}
          </div>
        )}
      </div>

      {/* Shift-click N picker — outside the capture wrapper */}
      {pickerOpen && (
        <div
          ref={pickerRef}
          className="absolute z-[20] top-full left-1/2 -translate-x-1/2 mt-1 bg-gray-900 border border-amber-500 rounded-lg p-2 shadow-2xl min-w-[180px]"
        >
          <div className="text-xs text-amber-300 mb-1 font-semibold">Attack with how many?</div>
          <div className="flex gap-1 mb-2">
            <button
              type="button"
              className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-white"
              onClick={() => setPickerValue(1)}
            >1</button>
            <button
              type="button"
              className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-white"
              onClick={() => setPickerValue(Math.ceil(count / 2))}
            >½ ({Math.ceil(count / 2)})</button>
            <button
              type="button"
              className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-white"
              onClick={() => setPickerValue(count)}
            >All ({count})</button>
          </div>
          <input
            type="number"
            min={0}
            max={count}
            value={pickerValue}
            onChange={(e) => setPickerValue(Number(e.target.value))}
            className="w-full px-2 py-1 text-sm rounded bg-gray-800 text-white border border-gray-600 mb-2"
          />
          <div className="flex gap-1">
            <button
              type="button"
              className="flex-1 px-2 py-1 text-xs rounded bg-amber-600 hover:bg-amber-500 text-black font-semibold"
              onClick={applyPicker}
            >Apply</button>
            <button
              type="button"
              className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-white"
              onClick={() => setPickerOpen(false)}
            >Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BundledCard;
