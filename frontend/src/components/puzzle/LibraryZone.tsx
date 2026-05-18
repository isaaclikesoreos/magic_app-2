import { FC, useState } from 'react';
import { Card, PlayerKey } from '@/types';
import { usePuzzle } from '../../context/PuzzleContext';
import PuzzleCard from './PuzzleCard';

interface LibraryZoneProps {
  cards?: Card[];
  cardCount?: number;
  owner?: PlayerKey;
}

const LibraryZone: FC<LibraryZoneProps> = ({ cards = [], cardCount, owner = 'you' }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { canRevealLibraryTop, canCastFromLibraryTop } = usePuzzle();

  const hasCardData = cards && cards.length > 0;
  const displayCount = hasCardData ? cards.length : (cardCount || 0);

  // Show the top card face-up when a permanent like Vizier of the Menagerie /
  // Oracle of Mul Daya / Conspicuous Snoop grants look-at-top.
  const revealTop = owner === 'you' && hasCardData && canRevealLibraryTop();
  const topCard = revealTop ? cards[0] : null;
  const topIsCastable = topCard ? canCastFromLibraryTop(topCard) : false;

  return (
    <div className="bg-gray-800 rounded p-2 border border-gray-700">
      <div
        className="flex items-center justify-between cursor-pointer hover:bg-gray-700 rounded p-1 -m-1"
        onClick={() => hasCardData && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Library</span>
          <span className="text-xs font-semibold text-white">({displayCount})</span>
        </div>
        {hasCardData && (
          <span className="text-xs text-gray-500">{isExpanded ? '▼' : '▶'}</span>
        )}
      </div>

      {/* Revealed top card (Vizier / Oracle / Snoop / Future Sight) */}
      {topCard && (
        <div className="mt-2 border-t border-purple-700/50 pt-2">
          <div className="text-[10px] text-purple-300 mb-1">
            Top of library{topIsCastable ? ' — castable' : ''}
          </div>
          <PuzzleCard card={topCard} location="library" owner={owner} />
        </div>
      )}

      {/* Expanded view (debug / inspection) */}
      {isExpanded && hasCardData && (
        <div className="mt-2 max-h-48 overflow-y-auto border-t border-gray-700 pt-2">
          <div className="text-xs text-gray-500 mb-1">Top of library:</div>
          <div className="space-y-1">
            {cards.map((card, index) => (
              <div
                key={card.instance_id || index}
                className="flex items-center gap-2 text-xs bg-gray-900 rounded px-2 py-1"
              >
                <span className="text-gray-500 w-4">{index + 1}.</span>
                <span className="text-white flex-1 truncate">{card.name}</span>
                {card.mana_cost && (
                  <span className="text-gray-400">{card.mana_cost}</span>
                )}
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-500 mt-1">Bottom of library</div>
        </div>
      )}

      {displayCount === 0 && (
        <div className="text-xs text-red-400 mt-1">Empty!</div>
      )}
    </div>
  );
};

export default LibraryZone;
