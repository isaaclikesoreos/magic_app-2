import { FC } from 'react';
import PuzzleCard from './PuzzleCard';
import { Permanent, PlayerKey } from '@/types';

interface BattlefieldZoneProps {
  permanents?: Permanent[];
  owner?: PlayerKey;
}

const BattlefieldZone: FC<BattlefieldZoneProps> = ({ permanents = [], owner = 'you' }) => {
  // Separate creatures from non-creatures
  const creatures = permanents.filter(p =>
    p.type_line?.toLowerCase().includes('creature')
  );
  const nonCreatures = permanents.filter(p =>
    !p.type_line?.toLowerCase().includes('creature')
  );

  return (
    <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 min-h-[140px]">
      <div className="text-xs text-gray-400 mb-2">Battlefield</div>

      {/* Non-creatures row (lands, artifacts, enchantments) */}
      {nonCreatures.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 mb-1">Permanents</div>
          <div className="flex gap-2 flex-wrap">
            {nonCreatures.map((card, i) => (
              <PuzzleCard
                key={card.instance_id || i}
                card={card}
                location="battlefield"
                owner={owner}
              />
            ))}
          </div>
        </div>
      )}

      {/* Creatures row */}
      {creatures.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-1">Creatures</div>
          <div className="flex gap-2 flex-wrap">
            {creatures.map((card, i) => (
              <PuzzleCard
                key={card.instance_id || i}
                card={card}
                location="battlefield"
                owner={owner}
              />
            ))}
          </div>
        </div>
      )}

      {permanents.length === 0 && (
        <div className="text-gray-500 text-sm flex items-center justify-center h-20">
          No permanents
        </div>
      )}
    </div>
  );
};

export default BattlefieldZone;
