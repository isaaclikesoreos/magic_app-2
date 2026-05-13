import { FC, useState } from 'react';
import PuzzleCard from './PuzzleCard';
import { Card, PlayerKey } from '@/types';
import { usePuzzle } from '../../context/PuzzleContext';

interface ExileZoneProps {
  cards?: Card[];
  owner?: PlayerKey;
}

const ExileZone: FC<ExileZoneProps> = ({ cards = [], owner = 'you' }) => {
  let puzzleCtx: any = null;
  try { puzzleCtx = usePuzzle(); } catch { /* not in puzzle context */ }
  const gameState = puzzleCtx?.gameState;
  const impulsedIds = new Set(
    (gameState?.impulsedCards || [])
      .filter((ic: any) => ic.owner === owner)
      .map((ic: any) => ic.card.instance_id)
  );
  const suspendedIds = new Set(
    (gameState?.suspendedCards || [])
      .filter((sc: any) => sc.owner === owner)
      .map((sc: any) => sc.card.instance_id)
  );
  const playableCount = cards.filter(c => impulsedIds.has(c.instance_id)).length;
  const suspendedCount = cards.filter(c => suspendedIds.has(c.instance_id)).length;
  const hasSpecialCards = playableCount > 0 || suspendedCount > 0;

  // Auto-expand when there are playable or suspended cards
  const [expanded, setExpanded] = useState(false);
  const isExpanded = expanded || hasSpecialCards;

  const borderClass = playableCount > 0 ? 'border-red-500/60'
    : suspendedCount > 0 ? 'border-blue-500/60'
    : 'border-purple-900/50';

  return (
    <div className={`bg-gray-800 rounded-lg p-2 border ${borderClass}`}>
      <button
        onClick={() => setExpanded(!isExpanded)}
        className="w-full text-left text-xs text-purple-400 hover:text-purple-300 flex items-center justify-between"
      >
        <span>
          Exile ({cards.length})
          {playableCount > 0 && (
            <span className="text-red-400 ml-1">— {playableCount} playable</span>
          )}
          {suspendedCount > 0 && (
            <span className="text-blue-400 ml-1">— {suspendedCount} suspended</span>
          )}
        </span>
        <span>{isExpanded ? '▼' : '▶'}</span>
      </button>

      {isExpanded && cards.length > 0 && (
        <div className="mt-2 flex gap-1 flex-wrap max-h-40 overflow-y-auto">
          {cards.map((card, i) => (
            <PuzzleCard
              key={card.instance_id || i}
              card={card}
              location="exile"
              owner={owner}
            />
          ))}
        </div>
      )}

      {isExpanded && cards.length === 0 && (
        <div className="mt-2 text-gray-500 text-sm">Empty</div>
      )}
    </div>
  );
};

export default ExileZone;
