import { FC } from 'react';
import PlayerArea from './PlayerArea';
import TargetingArrow from './TargetingArrow';
import PhaseIndicator from './PhaseIndicator';
import MultiTargetingArrows from './MultiTargetingArrows';
import MultiTargetingControls from './MultiTargetingControls';
import StormTargetingControls from './StormTargetingControls';
import CopyTargetingControls from './CopyTargetingControls';
import ChannelControl from './ChannelControl';
import ManaColorSelector from './ManaColorSelector';
import BallistaControls from './BallistaControls';
import XCostSelector from './XCostSelector';
import ModalTriggerChoice from './ModalTriggerChoice';
import AbilityMenu from './AbilityMenu';
import OptionalTriggerPrompt from './OptionalTriggerPrompt';
import LookTakeSelector from './LookTakeSelector';
import DiscardSelector from './DiscardSelector';
import PayToUntapPrompt from './PayToUntapPrompt';
import CounterUnlessPayPrompt from './CounterUnlessPayPrompt';
import EndurePrompt from './EndurePrompt';
import TargetedDiscardSelector from './TargetedDiscardSelector';
import SpellModalChoice from './SpellModalChoice';
import TutorSelector from './TutorSelector';
import ScrySelector from './ScrySelector';
import SuspendCastPrompt from './SuspendCastPrompt';
import CollectEvidenceSelector from './CollectEvidenceSelector';
import MultikickerSelector from './MultikickerSelector';
import DelveSelector from './DelveSelector';
import ConvokeSelector from './ConvokeSelector';
import ImproviseSelector from './ImproviseSelector';
import EmergeSelector from './EmergeSelector';
import PhyrexianManaSelector from './PhyrexianManaSelector';
import ExtortPrompt from './ExtortPrompt';
import MadnessCastPrompt from './MadnessCastPrompt';
import MiracleRevealPrompt from './MiracleRevealPrompt';
import MiracleCastPrompt from './MiracleCastPrompt';
import TriggerOrderSelector from './TriggerOrderSelector';
import SacrificeBanner from './SacrificeBanner';
import { usePuzzle } from '../../context/PuzzleContext';

const GameBoard: FC = () => {
  let puzzle = null;
  try {
    puzzle = usePuzzle();
  } catch {
    // Not in puzzle context
  }

  const {
    gameState,
    isTargeting,
    selectedCard,
    cancelTargeting,
    gameLog,
    isDeclaringAttackers,
    declaredAttackers,
    spellsCastThisTurn,
    legendRuleState,
    additionalCostDiscardState,
    cancelAdditionalCostDiscard,
    ninjutsuState,
    cancelNinjutsu
  } = puzzle || {};

  if (!gameState || !gameState.players) {
    return (
      <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
        No game state available
      </div>
    );
  }

  const { players } = gameState;

  // Check for victory/defeat conditions
  const opponentDead = players.opponent.life <= 0;
  const opponentDecked = players.opponent.deckedOut;
  const playerDead = players.you.life <= 0;
  const playerDecked = players.you.deckedOut;

  const victory = opponentDead || opponentDecked;
  const defeat = playerDead || playerDecked;

  return (
    <div className="flex gap-4">
      {/* Phase indicator sidebar */}
      <div className="flex-shrink-0">
        <PhaseIndicator />
      </div>

      {/* Main game area */}
      <div className="flex-grow space-y-4">
        {/* Targeting arrow overlay */}
        <TargetingArrow />
        <MultiTargetingArrows />
        <MultiTargetingControls />
        <StormTargetingControls />
        <CopyTargetingControls />
        <ChannelControl />
        <ManaColorSelector />
        <BallistaControls />
        <XCostSelector />
        <ModalTriggerChoice />
        <AbilityMenu />
        <OptionalTriggerPrompt />
        <LookTakeSelector />
        <DiscardSelector />
        <PayToUntapPrompt />
        <CounterUnlessPayPrompt />
        <EndurePrompt />
        <TargetedDiscardSelector />
        <SpellModalChoice />
        <TutorSelector />
        <ScrySelector />
        <SuspendCastPrompt />
        <CollectEvidenceSelector />
        <MultikickerSelector />
        <DelveSelector />
        <ConvokeSelector />
        <ImproviseSelector />
        <EmergeSelector />
        <PhyrexianManaSelector />
        <ExtortPrompt />
        <MadnessCastPrompt />
        <MiracleRevealPrompt />
        <MiracleCastPrompt />
        <TriggerOrderSelector />

        {/* Unified sacrifice prompt — banner + cancel for sacrificeMode state */}
        <SacrificeBanner />

        {/* Legend rule indicator */}
        {legendRuleState && (
          <div className="bg-yellow-900 border border-yellow-500 rounded-lg p-3 flex items-center">
            <div className="flex items-center gap-2">
              <span className="text-yellow-300">Legend Rule:</span>
              <span className="text-white font-semibold">{legendRuleState.legendaryName}</span>
              <span className="text-yellow-400">- Click the copy you want to keep</span>
            </div>
          </div>
        )}

        {/* Ninjutsu target selection */}
        {ninjutsuState && (
          <div className="bg-slate-800 border border-slate-300 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-slate-300">Ninjutsu:</span>
              <span className="text-white font-semibold">{ninjutsuState.card.name}</span>
              <span className="text-slate-300">— click an unblocked attacker to swap (costs {ninjutsuState.cost})</span>
            </div>
            <button
              onClick={cancelNinjutsu}
              className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Additional cost discard indicator */}
        {additionalCostDiscardState && (
          <div className="bg-orange-900 border border-orange-500 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-orange-300">Additional cost for:</span>
              <span className="text-white font-semibold">{additionalCostDiscardState.card.name}</span>
              <span className="text-orange-400">- Discard a card</span>
            </div>
            <button
              onClick={cancelAdditionalCostDiscard}
              className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Storm count indicator */}
        {(spellsCastThisTurn ?? 0) > 0 && (
          <div className="bg-yellow-900/50 border border-yellow-600 rounded-lg px-3 py-1 inline-block">
            <span className="text-yellow-400 text-sm">
              ⚡ Storm count: {spellsCastThisTurn}
            </span>
          </div>
        )}

        {/* Victory/Defeat banner */}
        {victory && (
          <div className="bg-green-600 text-white text-center py-4 rounded-lg text-2xl font-bold animate-pulse">
            VICTORY! {opponentDecked ? 'Opponent decked out!' : 'You found lethal!'}
          </div>
        )}
        {defeat && (
          <div className="bg-red-600 text-white text-center py-4 rounded-lg text-2xl font-bold">
            Defeat - {playerDecked ? 'You decked out!' : 'You lost!'}
          </div>
        )}

        {/* Targeting mode indicator */}
        {isTargeting && selectedCard && (
          <div className="bg-purple-900 border border-purple-500 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-purple-300">Casting:</span>
              <span className="text-white font-semibold">{selectedCard.name}</span>
              <span className="text-purple-400">- Select a target</span>
            </div>
            <button
              onClick={cancelTargeting}
              className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
            >
              Cancel (Right-click or Esc)
            </button>
          </div>
        )}

        {/* Declare attackers mode indicator */}
        {isDeclaringAttackers && (
          <div className="bg-orange-900 border border-orange-500 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <span className="text-orange-300 font-semibold">Declare Attackers:</span>
              <span className="text-white">Click creatures to toggle attacking</span>
              {(declaredAttackers?.length ?? 0) > 0 && (
                <span className="text-orange-400">({declaredAttackers?.length} attacking)</span>
              )}
            </div>
            <div className="text-xs text-orange-400 mt-1">
              Creatures with orange ! can attack. Use the Confirm Attack button when ready.
            </div>
          </div>
        )}

        {/* Opponent area (top) */}
        <PlayerArea
          player={players.opponent}
          isOpponent={true}
          label="Opponent"
        />

        {/* Combat zone - shows when creatures are attacking */}
        {((declaredAttackers?.length ?? 0) > 0 || players.you.battlefield?.some(c => c.attacking)) && (
          <div className="bg-red-950/50 border-2 border-red-700 rounded-lg p-3 text-center">
            <div className="text-red-400 font-semibold flex items-center justify-center gap-2">
              <span className="text-2xl">⚔</span>
              <span>COMBAT</span>
              <span className="text-2xl">⚔</span>
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="border-t-2 border-gray-600 my-2" />

        {/* Player area (bottom) */}
        <PlayerArea
          player={players.you}
          isOpponent={false}
          label="You"
        />

        {/* Game Log */}
        {gameLog && gameLog.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 max-h-32 overflow-y-auto">
            <div className="text-xs text-gray-400 mb-2">Game Log</div>
            <div className="space-y-1">
              {gameLog.slice(-10).map((entry, i) => (
                <div key={i} className="text-sm text-gray-300">
                  {entry.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GameBoard;
