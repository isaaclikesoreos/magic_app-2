import { FC, useEffect } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const formatTypeList = (types: string[]): string => {
  if (!types || types.length === 0) return 'permanent';
  if (types.length === 1) return types[0];
  if (types.length === 2) return `${types[0]} or ${types[1]}`;
  return types.slice(0, -1).join(', ') + ', or ' + types[types.length - 1];
};

const SacrificeBanner: FC = () => {
  let puzzle = null;
  try { puzzle = usePuzzle(); } catch { /* not in context */ }
  if (!puzzle) return null;
  const { sacrificeMode, cancelSacrificeMode } = puzzle;

  // ESC and banner only apply when the player is the actor. Opponent-actor
  // sacrifices auto-resolve in PuzzleContext without UI.
  const visible = !!sacrificeMode && sacrificeMode.actor !== 'opponent';

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelSacrificeMode();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, cancelSacrificeMode]);

  if (!visible || !sacrificeMode) return null;

  const { reason, filter, count, selected } = sacrificeMode;
  const typeLabel = formatTypeList(filter.types);
  const ownerLabel =
    filter.controller === 'opponent' ? "opponent's " :
    filter.controller === 'any'      ? '' :
                                       '';
  const countSuffix = count > 1 ? ` (${selected.length}/${count})` : '';

  return (
    <div className="bg-red-900 border border-red-500 rounded-lg p-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-red-300">Sacrificing for:</span>
        <span className="text-white font-semibold">{reason}</span>
        <span className="text-red-400">
          - Select {count > 1 ? `${count} ` : 'a '}{ownerLabel}{typeLabel}
          {count > 1 ? 's' : ''} to sacrifice{countSuffix}
        </span>
      </div>
      <button
        onClick={cancelSacrificeMode}
        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
      >
        Cancel
      </button>
    </div>
  );
};

export default SacrificeBanner;
