import { FC } from 'react';
import PuzzleCard from './PuzzleCard';
import BundledCard from './BundledCard';
import { groupByBundleKey, Bundle } from '../../engine/utils/bundleKey';
import { Permanent, PlayerKey } from '@/types';

interface BattlefieldZoneProps {
  permanents?: Permanent[];
  owner?: PlayerKey;
}

const BUNDLE_THRESHOLD = 5;

const renderBundles = (permanents: Permanent[], owner: PlayerKey) => {
  const bundles: Bundle[] = groupByBundleKey(permanents);
  return bundles.flatMap((b, bi) => {
    if (b.permanents.length >= BUNDLE_THRESHOLD) {
      return [
        <BundledCard
          key={`bundle-${bi}-${b.permanents[0].instance_id}`}
          bundle={b}
          owner={owner}
          location="battlefield"
        />,
      ];
    }
    return b.permanents.map((card, i) => (
      <PuzzleCard
        key={card.instance_id || `${bi}-${i}`}
        card={card}
        location="battlefield"
        owner={owner}
      />
    ));
  });
};

const BattlefieldZone: FC<BattlefieldZoneProps> = ({ permanents = [], owner = 'you' }) => {
  const creatures = permanents.filter(p =>
    p.type_line?.toLowerCase().includes('creature')
  );
  const nonCreatures = permanents.filter(p =>
    !p.type_line?.toLowerCase().includes('creature')
  );

  return (
    <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 min-h-[140px]">
      <div className="text-xs text-gray-400 mb-2">Battlefield</div>

      {nonCreatures.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 mb-1">Permanents</div>
          <div className="flex gap-2 flex-wrap">{renderBundles(nonCreatures, owner)}</div>
        </div>
      )}

      {creatures.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-1">Creatures</div>
          <div className="flex gap-2 flex-wrap">{renderBundles(creatures, owner)}</div>
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
