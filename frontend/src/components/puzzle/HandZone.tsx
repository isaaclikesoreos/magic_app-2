import { FC } from 'react';
import PuzzleCard from './PuzzleCard';
import { Card } from '@/types';

interface HandZoneProps {
  cards?: Card[];
  cardCount?: number;
  isOpponent?: boolean;
}

const HandZone: FC<HandZoneProps> = ({ cards = [], cardCount = 0, isOpponent = false }) => {
  const owner = isOpponent ? 'opponent' : 'you';
  const displayCards = cards.length > 0 ? cards : [];
  const count = displayCards.length || cardCount;

  return (
    <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
      <div className="text-xs text-gray-400 mb-2">
        {isOpponent ? "Opponent's Hand" : 'Hand'} ({count} cards)
      </div>
      <div className="flex gap-2 flex-wrap">
        {displayCards.map((card, i) => (
          <PuzzleCard
            key={card.instance_id || i}
            card={card}
            location="hand"
            owner={owner}
          />
        ))}
        {displayCards.length === 0 && (
          <div className="text-gray-500 text-sm">Empty</div>
        )}
      </div>
    </div>
  );
};

export default HandZone;
