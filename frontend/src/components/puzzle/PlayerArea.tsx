import { FC } from 'react';
import LifeTotal from './LifeTotal';
import ManaPool from './ManaPool';
import BattlefieldZone from './BattlefieldZone';
import HandZone from './HandZone';
import GraveyardZone from './GraveyardZone';
import ExileZone from './ExileZone';
import LibraryZone from './LibraryZone';
import { Player, PlayerKey } from '@/types';
import { usePuzzle } from '../../context/PuzzleContext';

interface PlayerAreaProps {
  player: Player;
  isOpponent?: boolean;
  label: string;
}

const PlayerArea: FC<PlayerAreaProps> = ({ player, isOpponent = false, label }) => {
  const owner: PlayerKey = isOpponent ? 'opponent' : 'you';

  let puzzle = null;
  try {
    puzzle = usePuzzle();
  } catch {
    // Not in puzzle context
  }

  const { isTargeting, isValidTarget, castSpellOnTarget, triggerTargetingState, completeTriggerTarget } = puzzle || {};

  // Check if this player can be targeted by a spell or trigger
  const canBePlayerTargeted = isTargeting && isValidTarget?.('player', { owner });
  const canBeTriggerPlayerTargeted = isTargeting &&
    triggerTargetingState?.validTargetType === 'creature_or_player' &&
    isValidTarget?.('creature_or_player', { owner });
  const isPlayerTargetable = canBePlayerTargeted || canBeTriggerPlayerTargeted;

  const handlePlayerClick = () => {
    if (canBeTriggerPlayerTargeted && completeTriggerTarget) {
      completeTriggerTarget('player', owner as any);
      return;
    }
    if (canBePlayerTargeted && castSpellOnTarget) {
      castSpellOnTarget('player', { owner });
    }
  };

  const targetingClass = isPlayerTargetable
    ? 'ring-2 ring-red-500 animate-pulse cursor-pointer'
    : '';

  return (
    <div
      className={`rounded-lg p-4 ${isOpponent ? 'bg-red-950/30' : 'bg-green-950/30'} ${targetingClass}`}
      onClick={isPlayerTargetable ? handlePlayerClick : undefined}
    >
      {/* Player targeting indicator */}
      {isPlayerTargetable && (
        <div className="text-red-400 text-xs font-bold text-center mb-2 animate-pulse">
          Click to target {isOpponent ? 'opponent' : 'yourself'}
        </div>
      )}

      {/* Player info header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4">
          <span className="text-lg font-semibold text-white">{label}</span>
          <LifeTotal life={player.life} isOpponent={isOpponent} />
          {(player as any).hasCitysBlessing && (
            <span className="text-xs bg-amber-700/50 text-amber-300 px-2 py-0.5 rounded">
              City&apos;s Blessing
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Mana:</span>
          <ManaPool mana={player.mana_pool} />
        </div>
      </div>

      {/* Battlefield */}
      <BattlefieldZone permanents={player.battlefield || []} owner={owner} />

      {/* Hand and Graveyard row */}
      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <HandZone
            cards={player.hand}
            cardCount={player.hand_count}
            isOpponent={isOpponent}
          />
        </div>
        <div className="flex flex-col gap-2">
          <GraveyardZone cards={player.graveyard || []} owner={owner} />
          <ExileZone cards={player.exile || []} owner={owner} />
          <LibraryZone
            cards={player.library}
            cardCount={player.library_count}
            owner={owner}
          />
        </div>
      </div>
    </div>
  );
};

export default PlayerArea;
