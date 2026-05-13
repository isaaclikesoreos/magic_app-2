import { FC, useState } from 'react';
import PuzzleCard from './PuzzleCard';
import { Card, PlayerKey } from '@/types';
import { usePuzzle } from '../../context/PuzzleContext';

interface GraveyardZoneProps {
  cards?: Card[];
  owner?: PlayerKey;
}

const GraveyardZone: FC<GraveyardZoneProps> = ({ cards = [], owner = 'you' }) => {
  const [expanded, setExpanded] = useState(false);

  let puzzle = null;
  try {
    puzzle = usePuzzle();
  } catch {
    // Not in puzzle context
  }
  const { isTargeting, selectedCard, gameState, modalSpellState, triggerTargetingState } = puzzle || {};
  const isReanimateTargeting = (() => {
    if (!isTargeting) return false;
    const spellEffect = (selectedCard as any)?.spell_effect;
    if (spellEffect?.type !== 'reanimate_creature') return false;
    const targetGY = spellEffect.target_graveyard || 'you';
    if (targetGY === 'any') return true;
    return targetGY === owner;
  })();
  const isYawgmothsWillActive = owner === 'you' &&
    !!(gameState?.players.you as any)?.canPlayFromGraveyard;
  const hasFlashbackCards = owner === 'you' &&
    cards.some(c => !!(c as any).flashback?.cost);

  const isModalGraveyardTargeting = owner === 'you' && modalSpellState?.phase === 'targeting' && (() => {
    const currentModeIdx = modalSpellState.chosenModes[modalSpellState.currentTargetingModeIdx];
    return modalSpellState.modes[currentModeIdx]?.targetType === 'graveyard_creature';
  })();

  // Trigger targeting graveyard cards (Myr Retriever, Snapcaster Mage)
  const isTriggerGraveyardTargeting = owner === 'you' && isTargeting &&
    triggerTargetingState?.validTargetType?.startsWith('graveyard_');

  const isExpanded = expanded || isReanimateTargeting || isYawgmothsWillActive || hasFlashbackCards || isModalGraveyardTargeting || isTriggerGraveyardTargeting;

  return (
    <div className={`rounded-lg p-2 border ${isYawgmothsWillActive ? 'bg-yellow-950 border-yellow-600' : hasFlashbackCards ? 'bg-orange-950 border-orange-600' : 'bg-gray-800 border-gray-700'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left text-xs text-gray-400 hover:text-gray-300 flex items-center justify-between"
      >
        <span>
          Graveyard ({cards.length})
          {isReanimateTargeting ? ' — select target' : ''}
          {isYawgmothsWillActive ? ' — Yawgmoth\'s Will active' : ''}
          {hasFlashbackCards && !isYawgmothsWillActive ? ' — flashback available' : ''}
        </span>
        <span>{isExpanded ? '▼' : '▶'}</span>
      </button>

      {isExpanded && cards.length > 0 && (
        <div className="mt-2 flex gap-1 flex-wrap max-h-40 overflow-y-auto">
          {cards.map((card, i) => (
            <PuzzleCard
              key={card.instance_id || i}
              card={card}
              location="graveyard"
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

export default GraveyardZone;
