import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode, FC } from 'react';
import { applyEffect } from '../engine/effects';
import { calculatePower } from '../engine/utils/powerToughness';
import { getEffectiveActivatedAbilities } from '../engine/utils/grantedAbilities';
import { canActivateTapAbility } from '../engine/utils/summoningSickness';
import { isPlaneswalker, getLoyalty, addLoyalty } from '../engine/utils/loyalty';
import { parseManaCost, canAffordCost, spendMana, getTotalColoredNeeded, calculateCMC, calculateManaSpent } from '../engine/utils/manaCost';
import { getLandManaAbilities, ManaAbility } from '../engine/data/lands';
import { checkTriggersForEvent } from '../engine/triggers';
import { matchesTriggerEvent } from '../engine/triggers/helpers';
import { canPayExtortCost as canPayExtortCostFn } from '../engine/triggers/spellcast';
import { hasReplaceGraveyardWithExile, pushToGraveyardOrExile, performDiscard, getMadnessCost, getMiracleCost, getNinjutsuCost, removeAttachedAuras } from '../engine/replacement';
import { sourceHasKeyword, getWardCost } from '../engine/utils/keywords';
import { hydrateGameState } from '../engine/utils/cardHydration';
import { SacrificeFilter, matchesSacFilter, autoPickSacrifices } from '../engine/utils/sacFilter';
import { GameState, Card, Permanent, StackItem, TargetingData, PlayerKey, TurnPhase, Effect } from '@/types';
import { PHASES, PhaseInfo } from '../constants/phases';

// Types for context state
interface LogEntry {
  message: string;
  timestamp: number;
}

interface MousePosition {
  x: number;
  y: number;
}

interface MultiTargetingState {
  stackItemId: string;
  totalDamage: number;
  allowedTargetTypes: string[]; // e.g. ["creature", "planeswalker"] — controls what can be clicked
  assignments: Array<{
    target: { type: string; data: any; owner?: PlayerKey };
    damage: number;
    arrow?: { origin: any; destination: any };
  }>;
}

interface StormTargetingState {
  copies: StackItem[];
  currentCopyIndex: number;
  source: any;
  originalTarget: any;
}

interface CopyTargetingState {
  phase: 'targeting_spell' | 'retargeting_copy';
  sourceCard: Card | null;
  copiedStackItem: StackItem | null;
  originalTargeting: TargetingData | null;
  onlyYourSpells?: boolean;
  isActivatedAbility?: boolean;
  mode?: 'copy' | 'counter' | 'counter_return' | 'counter_unless_pay';
  // Snapshot for refunding if counter targeting is cancelled
  preCastHand?: Card[];
  preCastManaPool?: any;
}

interface CyclingState {
  card: Card;
  manaCost: string; // parsed cycling cost e.g. "{2}"
}

// Channel doesn't need persistent state — it's either instant (no target)
// or enters targeting mode via setSelectedCard + setIsTargeting

interface ManaColorSelectionState {
  sourceCard: Permanent;
  stackItemId: string;
  amount?: number;
  preActivationState?: GameState;       // Snapshot to restore on cancel
  preActivationStackLength?: number;    // Stack length to restore on cancel
}

interface PayToUntapState {
  sourceCard: Permanent;
  stackItemId: string;
  manaCost: number; // generic mana required
}

interface CounterUnlessPayState {
  counterStackItemId: string;       // Mana Leak / ward trigger's stack item
  targetedStackItemId: string;      // the spell being countered
  counterSourceName: string;        // "Mana Leak" or creature name for ward
  targetedSpellName: string;        // the spell being threatened
  manaCost: string;                 // "{3}" — cost to pay to prevent counter
  wardType?: 'mana' | 'discard';   // ward cost type (undefined = regular counter spell)
  discardCount?: number;            // number of cards to discard for ward-discard
}

interface ExtortState {
  stackItemId: string;       // The extort trigger's stack item ID
  sourceName: string;        // Name of the permanent with extort
  canPayWhite: boolean;      // Player has W available
  canPayBlack: boolean;      // Player has B available
}

interface EndurePromptState {
  sourceCard: Permanent;
  stackItemId: string;
  manaCost: string;       // display string e.g. "{1}{W}"
  value: number;          // endure N
  trigger: StackItem;     // original stack item (for modal follow-up)
}

interface LegendRuleSacrificeState {
  legendaryName: string;
  duplicates: Permanent[];
}

interface BallistaState {
  card: Permanent;
  countersToRemove: number;
}

interface AbilityMenuState {
  permanent: Permanent;
  abilities: any[];
}

interface OptionalTriggerPromptState {
  stackItemId: string;
  sourceName: string;
  description?: string;
}

interface LookTakeState {
  cards: Card[];
  filter?: { exclude_types?: string[] };
  reason: string;
  stackItemId: string;
  ownerKey: PlayerKey;
}

interface DiscardSelectionState {
  count: number;
  reason: string;
  targetPlayer?: PlayerKey;  // Which player is discarding (defaults to 'you')
}

interface TargetedDiscardState {
  targetPlayer: PlayerKey;
  cards: Card[];
  filter?: string;  // 'nonland' for Thoughtseize, undefined for any card
  reason: string;
  life_loss?: number;
}

interface TriggerTargetingState {
  stackItem: StackItem;
  validTargetType: string;
  maxCMC?: number;
}

interface ScrySelectionState {
  cards: Card[];           // Cards taken from top of library
  bottomCards: number[];   // Indices of cards chosen for bottom/graveyard (ordered by selection)
  reason: string;          // Source card name
  stackItemId: string;     // Stack item being resolved
  thenDraw?: number;       // Cards to draw after scry/surveil
  mode: 'scry' | 'surveil'; // Scry puts on bottom, surveil puts in graveyard
}

interface XCostState {
  card: Card;
  maxX: number;
  minX?: number;
  rect: DOMRect;
}

interface ActivatedAbilityTargetingState {
  permanent: Permanent;
  ability: any;
  abilityIndex: number;
  origin: MousePosition;
  pendingSacrifice?: Permanent;
}

interface ProtectionColorChoiceState {
  permanent: Permanent;
  ability: any;
  targetType: string;
  targetData: any;
}

interface ModalTriggerChoiceState {
  trigger: StackItem;
  modes: Array<{ description: string; effect: any }>;
}

// Unified sacrifice prompt. One state for activated-ability sacs, cast-time
// additional costs, flashback sacs, and Edicts. Each call site supplies the
// filter and follow-up as closures; the UI is shared.
//
// `actor` controls who picks: 'you' opens the click prompt; 'opponent' bypasses
// the UI and auto-picks via autoPickSacrifices (Edict-style heuristic) — see
// the auto-resolve effect below.
interface SacrificeMode {
  reason: string;                                // banner label ("Goblin Bombardment", "Village Rites flashback")
  filter: SacrificeFilter;                       // who/what is eligible
  count: number;                                 // 1 for most; 2+ for Dread Return / Priest of the Forgotten Gods
  selected: Permanent[];                         // accumulator while count>1
  actor?: 'you' | 'opponent';                    // default 'you'
  onComplete: (selected: Permanent[]) => void;   // run after the final selection — flow-specific (cast/ability/etc.)
  onCancel: () => void;                          // run on ESC or Cancel button — flow-specific cleanup
}

interface MultikickerState {
  card: Card;
  kickCostStr: string;
  kickCost: any; // ParsedManaCost
  maxKicks: number;
  mode: 'multikicker' | 'replicate' | 'squad';
}

interface AdditionalCostDiscardState {
  card: Card;
  rect: DOMRect;
  count: number;
  discardedSoFar: Card[];
}

interface CollectEvidenceState {
  card: Card;
  rect: DOMRect;
  evidenceValue: number;
  selectedCards: Card[];
}

interface DelveState {
  card: Card;
  rect: DOMRect;
  maxDelve: number; // max cards to exile (= generic mana in cost)
  selectedCards: Card[];
}

interface ConvokeState {
  card: Card;
  rect: DOMRect;
  tappedCreatures: Card[];
}

interface EmergeState {
  card: Card;
  rect: DOMRect;
  phase: 'selecting_creature';
}

interface PhyrexianManaState {
  card: Card;
  rect: DOMRect;
  phyrexianPips: string[]; // colors of each Phyrexian pip, e.g. ['G', 'G']
  pipsPayingLife: number;  // how many pips to pay with life
}

interface ModalSpellMode {
  description: string;
  effect: Effect;
  targetType: 'creature' | 'player' | 'artifact' | 'graveyard_creature' | 'creature_or_player' | 'none';
}

interface ModalSpellState {
  card: Card;
  rect: DOMRect;
  modes: ModalSpellMode[];
  chooseCount: number;
  chosenModes: number[];
  phase: 'choosing' | 'targeting';
  currentTargetingModeIdx: number;
  targetResults: Array<{ modeIndex: number; targetType: string; targetData: any } | null>;
}

interface TutorSelectionState {
  cards: Card[];
  allCards: Card[];
  filter?: { type?: string; maxCmc?: number; exactCmc?: number };
  reason: string;
  destination: string;
  stackItemId?: string;
  isSpellEffect?: boolean;
}

interface SelectedCard extends Card {
  rect: DOMRect;
}

interface PuzzleContextValue {
  gameState: GameState | null;
  selectedCard: SelectedCard | null;
  isTargeting: boolean;
  targetingOrigin: MousePosition | null;
  mousePosition: MousePosition;
  gameLog: LogEntry[];
  stack: StackItem[];
  declaredAttackers: string[];
  isDeclaringAttackers: boolean;
  holdingPriority: boolean;
  multiTargetingState: MultiTargetingState | null;
  stormTargetingState: StormTargetingState | null;
  cyclingState: CyclingState | null;
  channelActive: boolean;
  manaColorSelection: ManaColorSelectionState | null;
  ballistaState: BallistaState | null;
  xCostState: XCostState | null;
  spellsCastThisTurn: number;
  landsPlayedThisTurn: number;
  awaitingStackInput: string | null;
  activatedAbilityTargeting: ActivatedAbilityTargetingState | null;
  protectionColorChoice: ProtectionColorChoiceState | null;
  modalTriggerChoice: ModalTriggerChoiceState | null;
  sacrificeMode: SacrificeMode | null;
  selectSacrificeTarget: (permanent: Permanent) => void;
  cancelSacrificeMode: () => void;
  copyTargetingState: CopyTargetingState | null;
  abilityMenuState: AbilityMenuState | null;
  optionalTriggerPromptState: OptionalTriggerPromptState | null;
  acceptOptionalTrigger: () => void;
  declineOptionalTrigger: () => void;
  lookTakeState: LookTakeState | null;
  completeLookTake: (takenIndex: number | null) => void;
  discardSelectionState: DiscardSelectionState | null;
  payToUntapState: PayToUntapState | null;
  counterUnlessPayState: CounterUnlessPayState | null;
  extortState: ExtortState | null;
  triggerOrderingState: {
    triggers: StackItem[];
    reason?: string;
    onConfirm?: (orderedTriggers: StackItem[], autoOrder: boolean) => void;
  } | null;
  confirmTriggerOrder: (orderedTriggers: StackItem[], autoOrder: boolean) => void;
  endurePromptState: EndurePromptState | null;
  legendRuleState: LegendRuleSacrificeState | null;
  targetedDiscardState: TargetedDiscardState | null;
  triggerTargetingState: TriggerTargetingState | null;
  modalSpellState: ModalSpellState | null;
  tutorSelectionState: TutorSelectionState | null;
  scrySelectionState: ScrySelectionState | null;
  additionalCostDiscardState: AdditionalCostDiscardState | null;

  // Actions
  selectCardFromHand: (card: Card, rect: DOMRect) => void;
  castSpellOnTarget: (targetType: string, targetData: any) => void;
  cancelTargeting: () => void;
  updateMousePosition: (x: number, y: number) => void;
  isValidTarget: (targetType: string, targetData: any) => boolean;
  advancePhase: () => void;
  getCurrentPhase: () => PhaseInfo;
  canCastSorcerySpeed: () => boolean;
  toggleAttacker: (instanceId: string) => void;
  attackerTargets: Record<string, string>;
  setAttackerTarget: (attackerId: string, targetPwInstanceId: string | null) => void;
  confirmAttackers: () => void;
  addLog: (message: string) => void;
  tapLandForMana: (land: Permanent, manaColor: string, selfDamage?: number, manaProduced?: Record<string, number>, manaCost?: any) => void;
  getLandManaAbilities: (land: Permanent) => ManaAbility[];
  getNonbasicLandOverride: () => string | null;
  activateAbility: (permanent: Permanent, abilityIndex: number, sacrificedCreature?: Permanent) => void;
  completeActivatedAbilityWithTarget: (targetType: string, targetData: any) => void;
  cancelActivatedAbilityTargeting: () => void;
  completeProtectionWithColor: (color: string) => void;
  cancelProtectionColorChoice: () => void;
  completeModalTriggerChoice: (modeIndex: number) => void;
  calculateBattlefieldPower: () => number;
  castWithEvoke: (card: Card) => void;
  castWithDash: (card: Card) => void;
  castWithImpending: (card: Card) => void;
  castWithOverload: (card: Card, rect: DOMRect) => void;
  castWithKicker: (card: Card, rect: DOMRect) => void;
  castWithBuyback: (card: Card, rect: DOMRect) => void;
  castWithOffspring: (card: Card) => void;
  castWithSquad: (card: Card) => void;
  multikickerState: MultikickerState | null;
  startMultikicker: (card: Card) => void;
  startReplicate: (card: Card, rect: DOMRect) => void;
  confirmMultikicker: (kickCount: number) => void;
  cancelMultikicker: () => void;
  collectEvidenceState: CollectEvidenceState | null;
  startCollectEvidence: (card: Card, rect: DOMRect) => void;
  toggleEvidenceCard: (card: Card) => void;
  confirmEvidence: () => void;
  cancelEvidence: () => void;
  delveState: DelveState | null;
  startDelve: (card: Card, rect: DOMRect) => void;
  toggleDelveCard: (card: Card) => void;
  confirmDelve: () => void;
  cancelDelve: () => void;
  convokeState: ConvokeState | null;
  startConvoke: (card: Card, rect: DOMRect) => void;
  toggleConvokeCreature: (creature: Card) => void;
  confirmConvoke: () => void;
  cancelConvoke: () => void;
  improviseState: ConvokeState | null;
  startImprovise: (card: Card, rect: DOMRect) => void;
  emergeState: EmergeState | null;
  startEmerge: (card: Card, rect: DOMRect) => void;
  phyrexianManaState: PhyrexianManaState | null;
  startPhyrexianCast: (card: Card, rect: DOMRect) => void;
  setPhyrexianPipsPayingLife: (count: number) => void;
  confirmPhyrexianCast: () => void;
  cancelPhyrexianCast: () => void;
  completeEmerge: (creature: Card) => void;
  cancelEmerge: () => void;
  toggleImproviseArtifact: (artifact: Card) => void;
  confirmImprovise: () => void;
  cancelImprovise: () => void;
  startSuspend: (card: Card) => void;
  suspendCastPending: { card: Card } | null;
  acceptSuspendCast: () => void;
  declineSuspendCast: () => void;
  activateCycling: (card: Card) => void;
  activateChannel: (card: Card, rect: DOMRect) => void;
  activateTransmute: (card: Card) => void;
  madnessCastPending: Card | null;
  acceptMadnessCast: () => void;
  declineMadnessCast: () => void;
  miracleRevealPending: { card: Card; cost: string } | null;
  revealMiracle: () => void;
  declineMiracleReveal: () => void;
  miracleCastPending: { card: Card; cost: string } | null;
  acceptMiracleCast: () => void;
  declineMiracleCast: () => void;
  ninjutsuState: { card: Card; cost: string } | null;
  activateNinjutsu: (card: Card) => void;
  completeNinjutsu: (attacker: Permanent) => void;
  cancelNinjutsu: () => void;
  selectManaColor: (color: string) => void;
  cancelManaColorSelection: () => void;
  startBallistaAbility: (ballista: Permanent, countersToRemove: number) => void;
  completeBallistaAbility: (targetType: string, targetData: any) => void;
  cancelBallistaAbility: () => void;
  confirmXCost: (xValue: number) => void;
  cancelXCostSelection: () => void;
  resolveTopOfStack: () => void;
  resolveAllStack: () => void;
  toggleHoldPriority: () => void;
  addToStack: (stackItem: StackItem) => void;
  startMultiTargeting: (stackItemId: string) => void;
  addDamageTarget: (target: any, damage: number, destination: MousePosition) => void;
  adjustDamageAmount: (assignmentIndex: number, delta: number) => void;
  confirmMultiTargets: () => void;
  cancelMultiTargeting: () => void;
  assignStormCopyTarget: (targetType: string, targetData: any) => void;
  sendAllStormCopiesToOriginalTarget: () => void;
  cancelStormTargeting: () => void;
  useChannel: () => void;
  deactivateChannel: () => void;
  addCardToZone: (card: Card, player: PlayerKey, zone: 'hand' | 'battlefield' | 'graveyard' | 'library') => void;
  addMana: (color: string, amount: number) => void;
  selectStackSpellTarget: (stackItemId: string) => void;
  assignCopyNewTarget: (targetType: string, targetData: any) => void;
  keepCopyOriginalTarget: () => void;
  cancelCopyTargeting: () => void;
  acceptPayToUntap: () => void;
  declinePayToUntap: () => void;
  payToPreventCounter: () => void;
  declineToPayCounter: () => void;
  wardDiscardComplete: (card: Card) => void;
  payExtort: (color: 'W' | 'B') => void;
  declineExtort: () => void;
  acceptEndure: () => void;
  declineEndure: () => void;
  openAbilityMenu: (permanent: Permanent) => void;
  selectAbilityFromMenu: (abilityIndex: number) => void;
  cancelAbilityMenu: () => void;
  completeDiscard: (card: Card) => void;
  resolveLegendRule: (chosenToKeep: Permanent) => void;
  completeTargetedDiscard: (card: Card | null) => void;
  completeTriggerTarget: (targetType: string, targetData: any) => void;
  selectModalSpellMode: (modeIndex: number) => void;
  completeModalSpellTarget: (targetType: string, targetData: any) => void;
  cancelModalSpell: () => void;
  completeTutorSelection: (card: Card) => void;
  completeScrySelection: (bottomIndices: number[], topOrder: number[]) => void;
  completeAdditionalCostDiscard: (card: Card) => void;
  cancelAdditionalCostDiscard: () => void;
}

const PuzzleContext = createContext<PuzzleContextValue | null>(null);

export const usePuzzle = () => {
  const context = useContext(PuzzleContext);
  if (!context) {
    throw new Error('usePuzzle must be used within PuzzleProvider');
  }
  return context;
};

interface PuzzleProviderProps {
  children: ReactNode;
  initialGameState: GameState;
}

export const PuzzleProvider: FC<PuzzleProviderProps> = ({ children, initialGameState }) => {
  const [isHydrating, setIsHydrating] = useState<boolean>(true);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [selectedCard, setSelectedCard] = useState<SelectedCard | null>(null);
  const [isTargeting, setIsTargeting] = useState<boolean>(false);
  const [targetingOrigin, setTargetingOrigin] = useState<MousePosition | null>(null);
  const [mousePosition, setMousePosition] = useState<MousePosition>({ x: 0, y: 0 });
  const [gameLog, setGameLog] = useState<LogEntry[]>([]);

  // Combat state
  const [declaredAttackers, setDeclaredAttackers] = useState<string[]>([]);
  const [attackerTargets, setAttackerTargetsState] = useState<Record<string, string>>({});
  const [isDeclaringAttackers, setIsDeclaringAttackers] = useState<boolean>(false);

  // Stack and priority
  const [stack, setStack] = useState<StackItem[]>([]);
  const [holdingPriority, setHoldingPriority] = useState<boolean>(false);
  const [awaitingStackInput, setAwaitingStackInput] = useState<string | null>(null);

  // Special states
  const [multiTargetingState, setMultiTargetingState] = useState<MultiTargetingState | null>(null);
  const [stormTargetingState, setStormTargetingState] = useState<StormTargetingState | null>(null);
  const [suspendCastPending, setSuspendCastPending] = useState<{ card: Card } | null>(null);
  // Madness trigger queue. Each entry is tagged with its trigger context:
  //   - 'cost':  discard was an additional cost for a spell (e.g. Bitter Triumph).
  //              The spell is already on the stack; prompt as soon as the cost UI closes.
  //   - 'effect': discard happened during a spell's resolution (e.g. Faithless Looting).
  //               Wait for the multi-discard UI to close *and* give the stack a moment
  //               to keep resolving before prompting, so the source spell completes first.
  const [madnessCastQueue, setMadnessCastQueue] = useState<
    Array<{ card: Card; context: 'cost' | 'effect' }>
  >([]);
  const [madnessPromptReady, setMadnessPromptReady] = useState(false);
  const madnessCastPending = madnessPromptReady && madnessCastQueue.length > 0
    ? madnessCastQueue[0].card
    : null;
  // Miracle — two modals:
  //   - Reveal: shown immediately when the first-drawn card of the turn has miracle.
  //   - Cast:  shown when the miracle trigger reaches the top of the stack.
  const [miracleRevealPending, setMiracleRevealPending] = useState<{ card: Card; cost: string } | null>(null);
  const [miracleCastPending, setMiracleCastPending] = useState<{ card: Card; cost: string; stackItemId: string } | null>(null);
  // If the player accepts the cast but then cancels targeting, we want to re-open
  // the Cast/Keep prompt rather than silently consume the choice. This ref holds
  // the state needed to rewind: pre-spend mana pool + the original prompt payload.
  const miracleCastRetryRef = useRef<{ card: Card; cost: string; stackItemId: string; preManaPool: any } | null>(null);
  // Ninjutsu — activated from hand during combat_blockers. Once set, attacking
  // creatures become clickable targets; choosing one swaps it with this card.
  const [ninjutsuState, setNinjutsuState] = useState<{ card: Card; cost: string } | null>(null);
  // Cycling state is exposed for UI but cycling is a single action (no multi-step interaction)
  const [cyclingState] = useState<CyclingState | null>(null);
  const [channelActive, setChannelActive] = useState<boolean>(false);
  const [manaColorSelection, setManaColorSelection] = useState<ManaColorSelectionState | null>(null);
  const [ballistaState, setBallistaState] = useState<BallistaState | null>(null);
  const [xCostState, setXCostState] = useState<XCostState | null>(null);
  const [sacrificeMode, setSacrificeMode] = useState<SacrificeMode | null>(null);
  const [copyTargetingState, setCopyTargetingState] = useState<CopyTargetingState | null>(null);
  const [spellsCastThisTurn, setSpellsCastThisTurn] = useState<number>(0);
  const [landsPlayedThisTurn, setLandsPlayedThisTurn] = useState<number>(0);
  const [youCardsDrawnThisTurn, setYouCardsDrawnThisTurn] = useState<number>(0);
  const [opponentCardsDrawnThisTurn, setOpponentCardsDrawnThisTurn] = useState<number>(0);
  const [activatedAbilityTargeting, setActivatedAbilityTargeting] = useState<ActivatedAbilityTargetingState | null>(null);
  const [protectionColorChoice, setProtectionColorChoice] = useState<ProtectionColorChoiceState | null>(null);
  const [modalTriggerChoice, setModalTriggerChoice] = useState<ModalTriggerChoiceState | null>(null);
  const [abilityMenuState, setAbilityMenuState] = useState<AbilityMenuState | null>(null);
  const [optionalTriggerPromptState, setOptionalTriggerPromptState] = useState<OptionalTriggerPromptState | null>(null);
  const [lookTakeState, setLookTakeState] = useState<LookTakeState | null>(null);
  const [discardSelectionState, setDiscardSelectionState] = useState<DiscardSelectionState | null>(null);
  const [payToUntapState, setPayToUntapState] = useState<PayToUntapState | null>(null);
  const [counterUnlessPayState, setCounterUnlessPayState] = useState<CounterUnlessPayState | null>(null);
  const [extortState, setExtortState] = useState<ExtortState | null>(null);
  const [triggerOrderingState, setTriggerOrderingState] = useState<{
    triggers: StackItem[];
    reason?: string;
    onConfirm?: (orderedTriggers: StackItem[], autoOrder: boolean) => void;
  } | null>(null);
  const autoOrderMapRef = useRef<Map<string, number[]>>(new Map());
  // Holds triggers from cost-payment sacrifices (Village Rites, Shard Volley,
  // etc.) that fire when the additional cost is paid but should land on the
  // stack ABOVE the spell. The cast pipeline (castSpellWithoutTarget /
  // castSpellOnTarget) consumes and clears this immediately after addToStack.
  const pendingSacTriggersRef = useRef<StackItem[]>([]);
  const [endurePromptState, setEndurePromptState] = useState<EndurePromptState | null>(null);
  const [legendRuleState, setLegendRuleState] = useState<LegendRuleSacrificeState | null>(null);
  const [targetedDiscardState, setTargetedDiscardState] = useState<TargetedDiscardState | null>(null);
  const [triggerTargetingState, setTriggerTargetingState] = useState<TriggerTargetingState | null>(null);
  const triggerTargetLock = useRef(false);
  const altCastSnapshot = useRef<{ hand: Card[]; manaPool: any; cardName: string; fullState?: GameState } | null>(null);
  const [modalSpellState, setModalSpellState] = useState<ModalSpellState | null>(null);
  const [tutorSelectionState, setTutorSelectionState] = useState<TutorSelectionState | null>(null);
  const [scrySelectionState, setScrySelectionState] = useState<ScrySelectionState | null>(null);
  const [additionalCostDiscardState, setAdditionalCostDiscardState] = useState<AdditionalCostDiscardState | null>(null);
  const [collectEvidenceState, setCollectEvidenceState] = useState<CollectEvidenceState | null>(null);
  const [multikickerState, setMultikickerState] = useState<MultikickerState | null>(null);
  const [delveState, setDelveState] = useState<DelveState | null>(null);
  const [convokeState, setConvokeState] = useState<ConvokeState | null>(null);
  const [improviseState, setImproviseState] = useState<ConvokeState | null>(null);
  const [emergeState, setEmergeState] = useState<EmergeState | null>(null);
  const [phyrexianManaState, setPhyrexianManaState] = useState<PhyrexianManaState | null>(null);

  // Tracks whether the current madness batch has been shown to the ordering UI.
  // Resets to false when the queue empties so the next batch can re-prompt.
  const madnessBatchOrderedRef = useRef(false);
  // Always-fresh view of the madness queue for use inside setTimeout'd resolveStack
  // calls whose closures captured a stale queue value. Keeps resolveStack honest.
  const madnessCastQueueRef = useRef<typeof madnessCastQueue>([]);
  useEffect(() => {
    madnessCastQueueRef.current = madnessCastQueue;
  }, [madnessCastQueue]);

  // When the madness queue transitions from non-empty to empty, resume auto-resolve
  // for any spells/triggers that piled up on the stack during the batch. Earlier
  // setTimeout(resolveStack) calls would have no-op'd while prompts were pending,
  // and the creature madness path never schedules its own resolve.
  // resolveStack is captured via a ref because its declaration appears later in
  // this component body (putting it in the deps array at render time would TDZ).
  const resolveStackRef = useRef<() => void>(() => {});
  const prevMadnessQueueLenRef = useRef(0);
  useEffect(() => {
    const prev = prevMadnessQueueLenRef.current;
    prevMadnessQueueLenRef.current = madnessCastQueue.length;
    if (prev > 0 && madnessCastQueue.length === 0 && !holdingPriority && stack.length > 0) {
      const t = setTimeout(() => resolveStackRef.current(), 200);
      return () => clearTimeout(t);
    }
  }, [madnessCastQueue, holdingPriority, stack]);

  // Gate madness prompts:
  //   - 'cost' context: the cost UI has to close AND the player must finish picking
  //     a target for the source spell before we interrupt with the madness modal.
  //     Once targeting closes the spell is on the stack and the prompt opens.
  //   - 'effect' context: the discard happened mid-resolution. Wait for the
  //     multi-discard UI to close AND a short delay so resolveStack has time to
  //     pop the source spell before we interrupt the player with a modal.
  // Both contexts also wait on targeting so casting UIs aren't cut in half.
  // When 2+ triggers are ready at the same time, open the trigger ordering UI
  // first so the player can pick the order in which prompts appear.
  useEffect(() => {
    if (madnessCastQueue.length === 0) {
      if (madnessPromptReady) setMadnessPromptReady(false);
      madnessBatchOrderedRef.current = false;
      return;
    }
    const entry = madnessCastQueue[0];
    const blocked = entry.context === 'cost'
      ? !!additionalCostDiscardState || isTargeting
      : !!(discardSelectionState || targetedDiscardState) || isTargeting;
    if (blocked) {
      if (madnessPromptReady) setMadnessPromptReady(false);
      return;
    }
    const delay = entry.context === 'effect' ? 250 : 0;
    const handle = setTimeout(() => {
      // Only open the ordering UI once per batch. Single-entry queues bypass it.
      const uniqueSources = new Set(madnessCastQueue.map(e => e.card.card_id));
      const needsOrdering =
        madnessCastQueue.length >= 2 &&
        !madnessBatchOrderedRef.current &&
        uniqueSources.size >= 2; // if all the same card, skip ordering

      if (!needsOrdering) {
        setMadnessPromptReady(true);
        return;
      }

      // Build synthetic StackItems representing each madness trigger.
      const triggers: StackItem[] = madnessCastQueue.map((e, idx) => ({
        id: `madness-trigger-${(e.card as any).instance_id || e.card.card_id}-${idx}`,
        type: 'triggered_ability',
        source: { ...e.card, owner: 'you' } as any,
        effect: { type: 'madness_trigger', manaCost: (e.card as any)._madnessCost } as any,
        requires_input: false,
        targeting_data: null,
        resolved: false,
        timestamp: Date.now(),
      }) as StackItem);

      // Check for saved auto-order from a previous batch of the same set of cards.
      const key = makeTriggerOrderKey(triggers);
      const savedOrder = autoOrderMapRef.current.get(key);
      if (savedOrder && savedOrder.length === madnessCastQueue.length) {
        const reordered = savedOrder.map(i => madnessCastQueue[i]);
        madnessBatchOrderedRef.current = true;
        setMadnessCastQueue(reordered);
        return;
      }

      madnessBatchOrderedRef.current = true;
      setTriggerOrderingState({
        triggers,
        reason: 'Order Madness Triggers',
        onConfirm: (orderedTriggers, _autoOrder) => {
          // Re-order the madness queue to match the player's chosen order.
          setMadnessCastQueue(prevQueue => {
            const byInstanceId = new Map(
              prevQueue.map(e => [(e.card as any).instance_id || e.card.card_id, e])
            );
            const reordered: typeof prevQueue = [];
            for (const t of orderedTriggers) {
              const k = (t.source as any).instance_id || (t.source as any).card_id;
              const found = byInstanceId.get(k);
              if (found) reordered.push(found);
            }
            // Preserve any entries that weren't represented in the ordering UI
            // (shouldn't happen, but defensive).
            for (const e of prevQueue) {
              if (!reordered.includes(e)) reordered.push(e);
            }
            return reordered;
          });
        },
      });
    }, delay);
    return () => clearTimeout(handle);
  }, [madnessCastQueue, discardSelectionState, targetedDiscardState, additionalCostDiscardState, isTargeting, madnessPromptReady]);

  // Hydrate game state on mount
  useEffect(() => {
    const hydrate = async () => {
      const hydrated = await hydrateGameState(initialGameState);
      setGameState(hydrated);
      setIsHydrating(false);
    };
    hydrate();
  }, [initialGameState]);

  // Helper: Add log entry
  const addLog = useCallback((message: string) => {
    setGameLog(prev => [...prev, { message, timestamp: Date.now() }]);
  }, []);

  // Helper: Get current phase
  const getCurrentPhase = useCallback((): PhaseInfo => {
    if (!gameState) return PHASES[0];
    const phaseId = gameState.turn_phase || 'main1';
    return PHASES.find(p => p.id === phaseId) || PHASES[0];
  }, [gameState]);

  // Helper: Can sorcery-speed spells be cast right now? (empty stack + main phase)
  const canCastSorcerySpeed = useCallback((): boolean => {
    const phase = getCurrentPhase();
    return phase.canCastSorceries && stack.length === 0;
  }, [getCurrentPhase, stack]);

  // Helper: Calculate max land drops per turn (base 1 + Exploration-like effects)
  // Returns Infinity when Fastbond is on the battlefield.
  const getMaxLandDrops = useCallback((): number => {
    if (!gameState) return 1;
    const battlefield = gameState.players.you.battlefield || [];
    let maxDrops = 1;
    let unlimited = false;
    for (const perm of battlefield) {
      const statics = (perm as any).static_abilities || [];
      for (const sa of statics) {
        if (sa.type === 'additional_land_drop') {
          maxDrops += (sa.count || 1);
        }
        if (sa.type === 'unlimited_land_drops') {
          unlimited = true;
        }
      }
    }
    return unlimited ? Infinity : maxDrops;
  }, [gameState]);

  // Calculate total power on battlefield
  const calculateBattlefieldPower = useCallback((): number => {
    if (!gameState) return 0;
    const creatures = gameState.players.you.battlefield?.filter(c =>
      c.type_line?.toLowerCase().includes('creature')
    ) || [];
    return creatures.reduce((total, creature) => total + calculatePower(creature), 0);
  }, [gameState]);

  const getCostReduction = useCallback((card: Card): number => {
    const statics = (card as any).static_abilities || [];
    const hasReduction = statics.some((a: any) => a.type === 'cost_reduction' && a.reduction_type === 'total_power_of_creatures');
    if (hasReduction) {
      return calculateBattlefieldPower();
    }
    return 0;
  }, [calculateBattlefieldPower]);

  // God mode actions
  const addCardToZone = useCallback((card: Card, player: PlayerKey, zone: 'hand' | 'battlefield' | 'graveyard' | 'library') => {
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      const targetPlayer = newState.players[player];
      // Set cardOwner — the player who "owns" the card (determines which
      // graveyard/hand/library it returns to when changing zones).
      const ownedCard = { ...card, cardOwner: player } as any;
      if (zone === 'hand') {
        targetPlayer.hand.push(ownedCard);
      } else if (zone === 'battlefield') {
        targetPlayer.battlefield = targetPlayer.battlefield || [];
        targetPlayer.battlefield.push({ ...ownedCard, tapped: false, summoning_sick: false, counters: {} } as any);
      } else if (zone === 'graveyard') {
        targetPlayer.graveyard = targetPlayer.graveyard || [];
        targetPlayer.graveyard.push(ownedCard);
      } else if (zone === 'library') {
        targetPlayer.library = targetPlayer.library || [];
        targetPlayer.library.unshift(ownedCard);
        targetPlayer.library_count = targetPlayer.library.length;
      }
      return newState;
    });
    const playerLabel = player === 'you' ? 'your' : "opponent's";
    addLog(`Added ${card.name} to ${playerLabel} ${zone}.`);
  }, [addLog]);

  const addMana = useCallback((color: string, amount: number) => {
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      newState.players.you.mana_pool[color] = (newState.players.you.mana_pool[color] || 0) + amount;
      return newState;
    });
  }, []);

  // If the first card drawn this turn has miracle, show the reveal prompt.
  // Call this AFTER drawing but BEFORE incrementing youCardsDrawnThisTurn.
  const checkMiracleOnFirstDraw = useCallback((drawnCards: Card[]) => {
    if (youCardsDrawnThisTurn !== 0 || drawnCards.length === 0) return;
    const first = drawnCards[0];
    const cost = getMiracleCost(first);
    if (cost) {
      setMiracleRevealPending({ card: first, cost });
      addLog(`${first.name} has Miracle — may be revealed for ${cost}.`);
    }
  }, [youCardsDrawnThisTurn, addLog]);

  // Phase advancement
  const advancePhase = useCallback(() => {
    if (!gameState) return;
    const currentPhase = getCurrentPhase();
    const currentIndex = PHASES.findIndex(p => p.id === currentPhase.id);
    const nextIndex = (currentIndex + 1) % PHASES.length;
    const nextPhase = PHASES[nextIndex];

    // ── New turn: end → upkeep ──────────────────────────────────────────────
    // Untap step runs silently here before upkeep becomes visible.
    if (currentPhase.id === 'end' && nextPhase.id === 'upkeep') {
      setGameState(prev => {
        if (!prev) return prev;
        const newState = JSON.parse(JSON.stringify(prev)) as GameState;

        // Clear all "until end of turn" effects from every permanent on both sides
        const clearEOTEffects = (permanents: Permanent[], isYou: boolean): Permanent[] =>
          permanents.map(p => {
            const cleared: Permanent = {
              ...p,
              // Temporary buffs (Giant Growth, Monstrous Rage, Fires of Yavimaya, Prowess, etc.)
              buffPower: undefined,
              buffToughness: undefined,
              prowessBonus: undefined,
              // Marked damage and deathtouch flag clear at end of turn (MTG rule 514.2).
              damage: undefined,
              damaged_by_deathtouch: undefined,
              // Planeswalker once-per-turn loyalty activation flag.
              _loyaltyActivatedThisTurn: undefined,
            } as Permanent;
            // Untap / clear combat flags only for your permanents
            if (isYou) {
              // Check for "doesn't untap during untap step" static ability (Mana Vault, etc.)
              const doesntUntap = (p as any).static_abilities?.some(
                (a: any) => a.effect?.type === 'doesnt_untap'
              );
              if (!doesntUntap) {
                cleared.tapped = false;
              }
              cleared.summoning_sick = false;
              cleared.attacking = false;
            }
            // Clear temporary protection (Mother of Runes)
            if (p.protection_until_end_of_turn) {
              delete (cleared as any).protection;
              delete (cleared as any).protection_until_end_of_turn;
            }
            return cleared;
          });

        newState.players.you.battlefield = clearEOTEffects(newState.players.you.battlefield, true);
        newState.players.opponent.battlefield = clearEOTEffects(newState.players.opponent.battlefield, false);

        // Clear Yawgmoth's Will per-turn flags
        delete (newState.players.you as any).canPlayFromGraveyard;
        delete (newState.players.you as any).graveyardGoesToExile;

        // Increment turn counter
        newState.turnNumber = (newState.turnNumber || 1) + 1;

        // Expire impulse-drawn cards whose playability has ended
        if (newState.impulsedCards && newState.impulsedCards.length > 0) {
          const currentTurn = newState.turnNumber;
          const expired = newState.impulsedCards.filter(ic => ic.expiresAtTurnEnd < currentTurn);
          if (expired.length > 0) {
            // Remove exileReason tag from expired cards so they show as permanently exiled
            expired.forEach(ic => {
              const exileCard = newState.players[ic.owner].exile?.find(
                (c: any) => c.instance_id === ic.card.instance_id
              );
              if (exileCard) {
                delete (exileCard as any).exileReason;
              }
            });
          }
          newState.impulsedCards = newState.impulsedCards.filter(ic => ic.expiresAtTurnEnd >= currentTurn);
          if (newState.impulsedCards.length === 0) {
            delete newState.impulsedCards;
          }
        }

        // Reset per-turn running totals (limit_opponent_draws gate, etc.)
        newState._youCardsDrawnThisTurn = 0;
        newState._opponentCardsDrawnThisTurn = 0;
        // Reset revolt — Fatal Push reads this to upgrade its CMC limit.
        newState._yourPermanentLeftThisTurn = false;

        newState.turn_phase = 'upkeep';
        return newState;
      });

      // Reset per-turn counters
      setSpellsCastThisTurn(0);
      setLandsPlayedThisTurn(0);
      setYouCardsDrawnThisTurn(0);
      setOpponentCardsDrawnThisTurn(0);

      addLog('New turn — permanents untapped');
      addLog('Upkeep');

      // Fire upkeep triggers
      const upkeepTriggers = checkTriggersForEvent('upkeep', { player: 'you' }, gameState);
      upkeepTriggers.forEach(t => addToStack(t));

      // Process suspended cards: remove one time counter from each
      const suspended = gameState.suspendedCards?.filter(sc => sc.owner === 'you') || [];
      if (suspended.length > 0) {
        // Pre-compute which cards will reach 0 counters (before async state update)
        const cardsReachingZero = suspended.filter(sc => sc.timeCounters === 1);

        setGameState(prev => {
          if (!prev || !prev.suspendedCards) return prev;
          const newState = JSON.parse(JSON.stringify(prev)) as GameState;
          const remaining: typeof newState.suspendedCards = [];
          (newState.suspendedCards || []).forEach((sc: any) => {
            if (sc.owner !== 'you') {
              remaining!.push(sc);
              return;
            }
            sc.timeCounters -= 1;
            // Update the matching card on battlefield (suspended cards display there)
            const bfCard = newState.players.you.battlefield?.find(
              (c: any) => c.instance_id === sc.card.instance_id && c._suspended
            );
            if (bfCard && (bfCard as any).counters) {
              (bfCard as any).counters.time = sc.timeCounters;
            }
            // Also update the exile copy's counters
            const exileCard = newState.players.you.exile?.find(
              (c: any) => c.instance_id === sc.card.instance_id
            );
            if (exileCard && (exileCard as any).counters) {
              (exileCard as any).counters.time = sc.timeCounters;
            }
            if (sc.timeCounters > 0) {
              remaining!.push(sc);
            } else {
              // Remove from battlefield and exile (will be cast or moved to permanent exile)
              newState.players.you.battlefield = newState.players.you.battlefield.filter(
                (c: any) => c.instance_id !== sc.card.instance_id
              );
              newState.players.you.exile = (newState.players.you.exile || []).filter(
                (c: any) => c.instance_id !== sc.card.instance_id
              );
            }
          });
          newState.suspendedCards = remaining!.length > 0 ? remaining : undefined;
          return newState;
        });

        // Log after state update
        suspended.forEach(sc => {
          if (sc.timeCounters > 1) {
            addLog(`${sc.card.name} — removed a time counter (${sc.timeCounters - 1} remaining)`);
          } else {
            addLog(`${sc.card.name} — last time counter removed!`);
          }
        });

        // Prompt player to cast the first card that reached 0
        if (cardsReachingZero.length > 0) {
          const castCard = cardsReachingZero[0].card;
          setTimeout(() => setSuspendCastPending({ card: castCard }), 100);
        }
      }
      return;
    }

    // ── Upkeep → Draw: fire draw step triggers, then auto-draw one card ───
    if (nextPhase.id === 'draw') {
      // Fire draw step triggers before drawing (Mana Vault damage, etc.)
      const drawStepTriggers = checkTriggersForEvent('draw_step', { player: 'you' }, gameState);
      drawStepTriggers.forEach(t => addToStack(t));

      const libraryCount = gameState.players.you.library_count || 0;
      const libraryCards = gameState.players.you.library || [];

      if (libraryCount <= 0) {
        // Deck out
        setGameState(prev => {
          if (!prev) return prev;
          return { ...prev, turn_phase: 'draw' };
        });
        addLog('Draw step — library is empty. You have decked out!');
        return;
      }

      // Library has actual card objects — move the top card to hand
      if (libraryCards.length > 0) {
        const drawnCard = libraryCards[0];
        setGameState(prev => {
          if (!prev) return prev;
          const newState = JSON.parse(JSON.stringify(prev)) as GameState;
          newState.turn_phase = 'draw';
          const [drawn, ...rest] = newState.players.you.library!;
          newState.players.you.library = rest;
          newState.players.you.library_count = rest.length;
          newState.players.you.hand = [...(newState.players.you.hand || []), drawn];
          return newState;
        });
        addLog(`Draw step — drew ${drawnCard.name}`);
        checkMiracleOnFirstDraw([drawnCard as Card]);
        setYouCardsDrawnThisTurn(1);
        const drawTriggers = checkTriggersForEvent('card_drawn', {
          player: 'you', amountDrawn: 1, totalDrawnThisTurn: 1,
        }, gameState);
        drawTriggers.forEach(t => addToStack(t));
      } else {
        // Library is count-only (no card objects) — decrement the count
        setGameState(prev => {
          if (!prev) return prev;
          const newState = JSON.parse(JSON.stringify(prev)) as GameState;
          newState.turn_phase = 'draw';
          newState.players.you.library_count = libraryCount - 1;
          return newState;
        });
        addLog(`Draw step — drew a card (${libraryCount - 1} remaining)`);
        setYouCardsDrawnThisTurn(1);
        const drawTriggers = checkTriggersForEvent('card_drawn', {
          player: 'you', amountDrawn: 1, totalDrawnThisTurn: 1,
        }, gameState);
        drawTriggers.forEach(t => addToStack(t));
      }

      return;
    }

    // ── End step: fire end-step triggers + process delayed returns ─────────
    if (nextPhase.id === 'end') {
      // Process pending end-step returns (Flickerwisp, etc.)
      const pendingReturns = gameState.pendingEndStepReturns || [];
      const returnedCreatures: Array<{ permanent: Permanent; owner: PlayerKey }> = [];

      // Collect dashed creatures before state update
      const dashedCreatures = gameState.players.you.battlefield.filter(
        (c: any) => c._dashed
      );

      setGameState(prev => {
        if (!prev) return prev;
        const newState = JSON.parse(JSON.stringify(prev)) as GameState;
        newState.turn_phase = 'end';

        if (pendingReturns.length > 0) {
          const returns = newState.pendingEndStepReturns || [];
          newState.pendingEndStepReturns = [];

          returns.forEach(({ permanent, owner }: { permanent: Permanent; owner: PlayerKey }) => {
            // Remove from exile
            const ownerPlayer = newState.players[owner];
            ownerPlayer.exile = (ownerPlayer.exile || []).filter(c => c.instance_id !== permanent.instance_id);
            // Return to battlefield with fresh state — strip transient flags (_dashed, etc.)
            const isCreature = (permanent.type_line || '').toLowerCase().includes('creature');
            const { _dashed, ...cleanPerm } = permanent as any;
            const returned: Permanent = {
              ...cleanPerm,
              tapped: false,
              summoning_sick: isCreature,
              counters: {} as Record<string, number>,
              attacking: false,
            };
            ownerPlayer.battlefield.push(returned);
            returnedCreatures.push({ permanent: returned, owner });
          });
        }

        // Impending: remove one time counter from each impending permanent
        newState.players.you.battlefield.forEach((perm: any) => {
          if (perm._impending && perm.counters?.time > 0) {
            perm.counters.time -= 1;
            if (perm.counters.time <= 0) {
              // Restore creature type
              if (perm._originalTypeLine) {
                perm.type_line = perm._originalTypeLine;
                delete perm._originalTypeLine;
              }
              delete perm._impending;
              delete perm._impendingCounters;
              // Creature now — give summoning sickness
              perm.summoning_sick = true;
            }
          }
        });

        // Dash: return dashed creatures from battlefield to hand
        if (dashedCreatures.length > 0) {
          dashedCreatures.forEach((dashed: any) => {
            newState.players.you.battlefield = newState.players.you.battlefield.filter(
              (c: any) => c.instance_id !== dashed.instance_id
            );
            // Return to hand without the _dashed flag
            const { _dashed, tapped, summoning_sick, counters, attacking, prowessBonus, buffPower, buffToughness, ...cardData } = dashed;
            newState.players.you.hand.push(cardData as any);
          });
        }

        return newState;
      });

      addLog('End Step');
      if (pendingReturns.length > 0) {
        pendingReturns.forEach(({ permanent }: { permanent: Permanent }) => {
          addLog(`${permanent.name} returns to the battlefield from exile.`);
        });

        // Fire ETB triggers for returned creatures
        returnedCreatures.forEach(({ permanent }) => {
          const isCreature = (permanent.type_line || '').toLowerCase().includes('creature');
          if (isCreature) {
            const etbTriggers = checkTriggersForEvent('creature_entered', {
              creature: permanent, wasEvoked: false
            }, gameState);
            etbTriggers.forEach(t => addToStack(t));
          }
        });
      }

      // Log dashed creature returns
      dashedCreatures.forEach((dashed: any) => {
        addLog(`${dashed.name} returns to hand (dash).`);
      });

      // Log impending counter removals (pre-computed from current gameState)
      const impendingPerms = gameState.players.you.battlefield.filter(
        (c: any) => c._impending && c.counters?.time > 0
      );
      impendingPerms.forEach((perm: any) => {
        const remaining = perm.counters.time - 1;
        if (remaining > 0) {
          addLog(`${perm.name} — removed a time counter (${remaining} remaining)`);
        } else {
          addLog(`${perm.name} — last time counter removed! It is now a creature.`);
        }
      });

      const endTriggers = checkTriggersForEvent('end_step', { player: 'you' }, gameState);
      endTriggers.forEach(t => addToStack(t));
      return;
    }

    // ── Combat Damage ───────────────────────────────────────────────────────
    if (nextPhase.id === 'combat_damage') {
      // Must read attackers from inside the updater — confirmAttackers calls
      // setGameState (async) then immediately calls advancePhase, so the
      // gameState closure here is still the pre-attack snapshot.
      let totalDamage = 0;
      let lifelinkDamage = 0;
      const damageLines: string[] = [];
      let hadAttackers = false;

      setGameState(prev => {
        if (!prev) return prev;
        const newState = JSON.parse(JSON.stringify(prev)) as GameState;
        newState.turn_phase = 'combat_damage';

        const attackers = newState.players.you.battlefield.filter((c: Permanent) => c.attacking);
        if (attackers.length === 0) return newState;

        hadAttackers = true;
        totalDamage = 0;
        lifelinkDamage = 0;
        damageLines.length = 0;
        let damageToPlayer = 0;
        const damageToPW: Record<string, number> = {};

        attackers.forEach((attacker: Permanent) => {
          // Include aura bonuses (e.g. Giant Strength)
          const allBF = (newState.players.you.battlefield as any[]).concat(
            newState.players.opponent.battlefield as any[]
          );
          const auraPower = allBF
            .filter((bf: any) => bf.isAura && bf.attachedTo?.instance_id === attacker.instance_id)
            .reduce((sum: number, aura: any) => {
              return sum + (aura.static_abilities || []).reduce((s: number, sa: any) =>
                s + (sa.effect?.type === 'buff_enchanted' ? (sa.effect.power || 0) : 0), 0);
            }, 0);
          // Include equipment bonuses (e.g. Bonesplitter)
          const equipPower = allBF
            .filter((bf: any) => bf.equippedTo?.instance_id === attacker.instance_id)
            .reduce((sum: number, equip: any) => {
              return sum + (equip.static_abilities || []).reduce((s: number, sa: any) =>
                s + (sa.effect?.type === 'buff_equipped' ? (sa.effect.power || 0) : 0), 0);
            }, 0);
          const power = calculatePower(attacker) + auraPower + equipPower;
          totalDamage += power;
          const hasLifelink = attacker.keywords?.includes('lifelink') || (attacker as any).hasLifelink
            || allBF.some((eq: any) => eq.equippedTo?.instance_id === attacker.instance_id
              && (eq.static_abilities || []).some((sa: any) =>
                sa.effect?.type === 'grant_keywords_equipped' && sa.effect?.keywords?.includes('lifelink')
              ));
          if (hasLifelink) lifelinkDamage += power;

          const targetId = (attacker as any).attackTarget as string | undefined;
          if (targetId) {
            damageToPW[targetId] = (damageToPW[targetId] || 0) + power;
            damageLines.push(`${attacker.name} deals ${power} → planeswalker`);
          } else {
            damageToPlayer += power;
            damageLines.push(`${attacker.name} deals ${power}`);
          }
        });

        // Apply player damage and PW loyalty loss; route deaths to graveyard.
        newState.players.opponent.life = (newState.players.opponent.life || 0) - damageToPlayer;
        for (const [pwId, dmg] of Object.entries(damageToPW)) {
          const pw = newState.players.opponent.battlefield.find((c: any) => c.instance_id === pwId) as Permanent | undefined;
          if (!pw) continue;
          const newLoyalty = addLoyalty(pw, -dmg);
          if (newLoyalty <= 0) {
            newState.players.opponent.battlefield = newState.players.opponent.battlefield.filter(
              (c: any) => c.instance_id !== pwId
            );
            pushToGraveyardOrExile(newState, newState.players.opponent, pw);
            newState._dyingCreatures = newState._dyingCreatures || [];
            newState._dyingCreatures.push({ creature: pw, owner: 'opponent' as PlayerKey });
            newState._leavingPermanents = newState._leavingPermanents || [];
            newState._leavingPermanents.push({ permanent: pw, owner: 'opponent' as PlayerKey });
          }
        }
        if (lifelinkDamage > 0) {
          newState.players.you.life = (newState.players.you.life || 0) + lifelinkDamage;
        }
        return newState;
      });

      if (!hadAttackers) {
        addLog('Combat Damage — no attackers');
      } else {
        addLog(`Combat damage — ${damageLines.join(', ')} — ${totalDamage} total`);
        if (lifelinkDamage > 0) addLog(`Lifelink — you gain ${lifelinkDamage} life`);
        const opponentLifeAfter = (gameState.players.opponent.life || 0) - totalDamage;
        if (opponentLifeAfter <= 0) addLog('⚔️ Opponent is at 0 or less life — YOU WIN!');
      }
      return;
    }

    // ── Default phase advancement ───────────────────────────────────────────
    setGameState(prev => {
      if (!prev) return prev;
      return { ...prev, turn_phase: nextPhase.id as TurnPhase };
    });

    addLog(`Advanced to ${nextPhase.name}`);

    // Handle combat begin -> declare attackers
    if (nextPhase.id === 'combat_attackers') {
      setIsDeclaringAttackers(true);
      addLog('Declare attackers (or click No Attack to skip)');
    } else {
      setIsDeclaringAttackers(false);
      setDeclaredAttackers([]);
      setAttackerTargetsState({});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, getCurrentPhase, addLog]);

  // Update mouse position for targeting arrow
  const updateMousePosition = useCallback((x: number, y: number) => {
    setMousePosition({ x, y });
  }, []);

  // Add to stack
  const addToStack = useCallback((stackItem: StackItem) => {
    setStack(prev => [...prev, stackItem]);
    addLog(`Added to stack: ${stackItem.source.name}`);
  }, [addLog]);

  // Helper: Generate auto-order key from a set of triggers (sorted source card_ids)
  const makeTriggerOrderKey = (triggers: StackItem[]): string => {
    return triggers.map(t => t.source.card_id).filter(Boolean).sort((a, b) => a! - b!).join(',');
  };

  // Helper: Batch simultaneous triggers — if 2+, check auto-order or show ordering UI
  const batchAndOrderTriggers = useCallback((triggers: StackItem[]) => {
    if (triggers.length === 0) return;
    if (triggers.length === 1) {
      addToStack(triggers[0]);
      return;
    }

    // Check if all triggers come from unique sources (if all same card, no ordering needed)
    const uniqueSources = new Set(triggers.map(t => t.source.card_id));
    if (uniqueSources.size <= 1) {
      // All from same card — just push in current order
      for (let i = triggers.length - 1; i >= 0; i--) {
        addToStack(triggers[i]);
      }
      return;
    }

    // Check auto-order map
    const key = makeTriggerOrderKey(triggers);
    const savedOrder = autoOrderMapRef.current.get(key);

    if (savedOrder && savedOrder.length === triggers.length) {
      // Apply saved order — push in reverse so first-to-resolve ends up on top (LIFO)
      const ordered = savedOrder.map(idx => triggers[idx]);
      for (let i = ordered.length - 1; i >= 0; i--) {
        addToStack(ordered[i]);
      }
      return;
    }

    // Show ordering UI
    setTriggerOrderingState({ triggers });
  }, [addToStack]);

  // Callback: Player confirms trigger order from the UI.
  // If the ordering state carries an onConfirm callback, defer to it (used for
  // non-stack orderings like madness queues). Otherwise push to the stack LIFO.
  const confirmTriggerOrder = useCallback((orderedTriggers: StackItem[], autoOrder: boolean) => {
    if (!triggerOrderingState) return;

    if (autoOrder) {
      const key = makeTriggerOrderKey(triggerOrderingState.triggers);
      const orderMap = orderedTriggers.map(ot =>
        triggerOrderingState.triggers.findIndex(t => t.id === ot.id)
      );
      autoOrderMapRef.current.set(key, orderMap);
    }

    if (triggerOrderingState.onConfirm) {
      triggerOrderingState.onConfirm(orderedTriggers, autoOrder);
    } else {
      // Default: push in reverse so first-in-list resolves first (LIFO — add last ends up on top)
      for (let i = orderedTriggers.length - 1; i >= 0; i--) {
        addToStack(orderedTriggers[i]);
      }
    }

    setTriggerOrderingState(null);
  }, [triggerOrderingState, addToStack]);

  /**
   * Consolidated helper: fire all spell-cast triggers for a card.
   * Handles prowess, CMC, extort, magecraft, and spell count triggers.
   * Call this once after any spell is cast instead of duplicating 5 trigger checks.
   *
   * @returns true if a modal choice was triggered (caller should skip auto-resolve)
   */
  const fireSpellCastTriggers = useCallback((card: Card, newSpellCount: number, currentGameState: GameState, manaSpent?: number): boolean => {
    const typeLine = (card.type_line || '').toLowerCase();
    const isCreature = typeLine.includes('creature');

    // Collect all triggers into a batch
    const allTriggers: StackItem[] = [];

    // Noncreature spell triggers (prowess, Young Pyromancer, etc.)
    if (!isCreature) {
      allTriggers.push(...checkTriggersForEvent('noncreature_spell_cast', { spell: card }, currentGameState));
    }

    // CMC-based triggers (Eidolon of the Great Revel)
    allTriggers.push(...checkTriggersForEvent('spell_cast_cmc', { spellCard: card, casterIsYou: true }, currentGameState));

    // Extort triggers (any spell)
    allTriggers.push(...checkTriggersForEvent('any_spell_cast', { spell: card }, currentGameState));

    // Magecraft triggers (instant/sorcery cast — detector self-filters)
    allTriggers.push(...checkTriggersForEvent('instant_sorcery_cast_or_copy', { spell: card }, currentGameState));

    // Opus triggers (instant/sorcery cast only, needs mana spent info)
    allTriggers.push(...checkTriggersForEvent('instant_sorcery_cast', { spell: card, manaSpent }, currentGameState));

    // Spell count triggers (may include modals that need separate handling)
    const spellCountTriggers = checkTriggersForEvent('spell_cast_count', {
      castingPlayer: 'you' as PlayerKey,
      spellsCastThisTurn: newSpellCount
    }, currentGameState);

    let hasModal = false;
    spellCountTriggers.forEach(trigger => {
      if (trigger.effect?.type === 'modal_choice') {
        setModalTriggerChoice({ trigger, modes: trigger.effect.modes || [] });
        hasModal = true;
      } else {
        allTriggers.push(trigger);
      }
    });

    // Batch-and-order: if 2+ triggers from different sources, let player order them
    batchAndOrderTriggers(allTriggers);

    return hasModal;
  }, [batchAndOrderTriggers]);

  // Helper: Cast spell without target
  const castSpellWithoutTarget = useCallback((card: Card, _rect: DOMRect) => {
    if (!gameState) return;

    // Check if X cost
    if (card.mana_cost?.includes('{X}')) {
      const availableMana = Object.values(gameState.players.you.mana_pool).reduce((a, b) => a + b, 0);
      const parsedCost = parseManaCost(card.mana_cost);
      const coloredNeeded = getTotalColoredNeeded(parsedCost);
      const reduction = getCostReduction(card);
      const maxX = Math.floor((availableMana - coloredNeeded + reduction) / (parsedCost.xCount || 1));

      setXCostState({ card, maxX, rect: _rect });
      return;
    }

    // Check mana and cast
    const parsedCost = parseManaCost(card.mana_cost);
    const reduction = getCostReduction(card);
    if (!canAffordCost(parsedCost, gameState.players.you.mana_pool, 0, reduction)) {
      addLog(`Not enough mana to cast ${card.name}`);
      return;
    }

    // Spend mana
    const newManaPool = spendMana(gameState.players.you.mana_pool, parsedCost, 0, reduction);

    // Check if this is a permanent spell (creatures/artifacts/enchantments enter battlefield)
    const typeLine = card.type_line?.toLowerCase() || '';
    const isCreature = typeLine.includes('creature');
    const isPermanent = isCreature || typeLine.includes('artifact') || typeLine.includes('enchantment') || typeLine.includes('planeswalker');

    // Create stack item
    const stackItem: StackItem = {
      id: `spell-${card.card_id}-${Date.now()}`,
      type: isPermanent ? (isCreature ? 'creature_spell' : 'permanent_spell') : 'spell',
      source: { ...card, owner: 'you' } as any,
      effect: (isPermanent
        ? isCreature
          ? { type: 'enter_battlefield', creature: card, owner: 'you' }
          : { type: 'enter_battlefield_permanent', permanent: card, owner: 'you' }
        : (card.spell_effect || { type: 'unknown' })) as Effect,
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now()
    };

    // Remove from hand (or graveyard if cast via Yawgmoth's Will, or exile if impulse draw), update mana, add to stack
    setGameState(prev => {
      if (!prev) return prev;
      const newState = {
        ...prev,
        players: {
          ...prev.players,
          you: {
            ...prev.players.you,
            hand: prev.players.you.hand.filter(c => c.instance_id !== card.instance_id),
            graveyard: (prev.players.you.graveyard || []).filter(c => c.instance_id !== card.instance_id),
            exile: (prev.players.you.exile || []).filter(c => c.instance_id !== card.instance_id),
            mana_pool: newManaPool
          }
        }
      };
      // Remove from impulse tracking if cast from exile
      if (newState.impulsedCards) {
        newState.impulsedCards = newState.impulsedCards.filter(ic => ic.card.instance_id !== card.instance_id);
        if (newState.impulsedCards.length === 0) delete newState.impulsedCards;
      }
      return newState;
    });

    addToStack(stackItem);

    // Dispatch any stashed cost-payment sac triggers now that the spell is on
    // the stack — they go on top of it per MTG rules.
    if (pendingSacTriggersRef.current.length > 0) {
      const stashed = pendingSacTriggersRef.current;
      pendingSacTriggersRef.current = [];
      batchAndOrderTriggers(stashed);
    }

    // "When you cast" triggers — check for on_cast/when_cast triggered abilities on the card
    if (card.triggered_abilities) {
      (card.triggered_abilities as any[]).forEach((ability: any) => {
        const isOnCast = ability.trigger === 'on_cast' || ability.trigger === 'when_cast' ||
          ability.trigger?.event === 'on_cast' || ability.trigger?.event === 'when_cast';
        if (isOnCast) {
          addToStack({
            id: `cast-trigger-${card.card_id}-${Date.now()}-${Math.random()}`,
            type: 'triggered_ability',
            source: { instance_id: stackItem.id, card_id: card.card_id, name: card.name, owner: 'you' },
            effect: ability.effect,
            requires_input: ability.requires_input || false,
            targeting_data: null,
            resolved: false,
            timestamp: Date.now(),
          });
        }
      });
    }

    const newSpellCount = spellsCastThisTurn + 1;
    setSpellsCastThisTurn(newSpellCount);
    setSelectedCard(null);
    miracleCastRetryRef.current = null;
    addLog(`Cast ${card.name}`);

    // Ascend check — casting a spell with ascend keyword grants city's blessing if 10+ permanents
    if ((card as any).keywords?.includes('ascend') && gameState) {
      const permanentCount = gameState.players.you.battlefield.length;
      if (permanentCount >= 10 && !(gameState.players.you as any).hasCitysBlessing) {
        setGameState(prev => {
          if (!prev) return prev;
          const ns = { ...prev, players: { ...prev.players, you: { ...prev.players.you } } };
          (ns.players.you as any).hasCitysBlessing = true;
          return ns;
        });
        addLog("You have the city's blessing!");
      }
    }

    // Fire all spell-cast triggers (prowess, CMC, extort, magecraft, opus, spell count)
    const manaSpent = calculateManaSpent(card.mana_cost, 0, reduction);
    const hasModal = gameState ? fireSpellCastTriggers(card, newSpellCount, gameState, manaSpent) : false;

    // Auto-resolve if not holding priority and no modal choice pending
    if (!holdingPriority && !hasModal) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, spellsCastThisTurn, addLog, addToStack, batchAndOrderTriggers, holdingPriority, fireSpellCastTriggers]);

  // Card selection and targeting
  const selectCardFromHand = useCallback((card: Card, rect: DOMRect) => {
    if (!gameState) return;

    // Block cards with no mana cost that must be suspended (Lotus Bloom)
    // Skip this check for cards being cast from suspend (_suspendCast flag)
    if (!(card as any)._suspendCast && (!card.mana_cost || card.mana_cost.trim() === '') &&
        card.oracle_text?.match(/Suspend\s+\d+/i)) {
      addLog(`${card.name} has no mana cost — it must be suspended (right-click)`);
      return;
    }

    // Land play — lands don't use the stack, go directly to battlefield
    const cardTypeLine = (card.type_line || '').toLowerCase();
    if (cardTypeLine.includes('land') && !cardTypeLine.includes('creature')) {
      // Can only play lands during a main phase with empty stack
      if (!canCastSorcerySpeed()) {
        if (stack.length > 0) {
          addLog(`Cannot play ${card.name} — stack must be empty`);
        } else {
          addLog(`Cannot play ${card.name} — can only play lands during a main phase`);
        }
        return;
      }
      // Check land drop limit (base 1, modified by Exploration/Fastbond/etc.)
      const maxDrops = getMaxLandDrops();
      if (landsPlayedThisTurn >= maxDrops) {
        addLog(`Cannot play ${card.name} — already played ${landsPlayedThisTurn} land(s) this turn`);
        return;
      }

      // Fastbond damage: lands after the first cost 1 life each
      const hasFastbond = (gameState.players.you.battlefield || []).some(
        p => (p as any).static_abilities?.some((sa: any) => sa.type === 'unlimited_land_drops')
      );
      const fastbondDamage = hasFastbond && landsPlayedThisTurn >= 1 ? 1 : 0;

      // Move land from hand to battlefield
      const landPermanent: Permanent = {
        ...card,
        instance_id: card.instance_id || `land-${card.card_id}-${Date.now()}`,
        owner: 'you' as PlayerKey,
        tapped: false,
        summoning_sick: false,
      } as Permanent;
      setGameState(prev => {
        if (!prev) return prev;
        const newState = {
          ...prev,
          players: {
            ...prev.players,
            you: {
              ...prev.players.you,
              hand: prev.players.you.hand.filter(c => c.instance_id !== card.instance_id),
              exile: (prev.players.you.exile || []).filter(c => c.instance_id !== card.instance_id),
              battlefield: [...prev.players.you.battlefield, landPermanent],
              life: prev.players.you.life - fastbondDamage,
            }
          }
        };
        // Remove from impulse tracking if played from exile
        if (newState.impulsedCards) {
          newState.impulsedCards = newState.impulsedCards.filter(ic => ic.card.instance_id !== card.instance_id);
          if (newState.impulsedCards.length === 0) delete newState.impulsedCards;
        }
        return newState;
      });
      setLandsPlayedThisTurn(prev => prev + 1);
      addLog(`Played ${card.name}`);
      if (fastbondDamage > 0) {
        addLog(`Fastbond deals 1 damage to you. Life: ${gameState.players.you.life - fastbondDamage}`);
      }

      // Check for land ETB triggers (Landfall, etc.)
      const etbTriggers = checkTriggersForEvent('creature_entered', {
        creature: landPermanent,
        wasEvoked: false
      }, gameState);
      etbTriggers.forEach(trigger => addToStack(trigger));

      return;
    }

    // Sorcery-speed timing: non-instant, non-flash spells require empty stack + main phase.
    // Madness and miracle override normal timing — the trigger grants the player permission
    // to cast the card regardless of its type.
    const isInstantSpeed = cardTypeLine.includes('instant') ||
      (card as any).keywords?.includes('flash') ||
      card.oracle_text?.toLowerCase().includes('flash') ||
      !!(card as any)._madnessCast ||
      !!(card as any)._miracleCast;
    if (!isInstantSpeed && !canCastSorcerySpeed()) {
      if (stack.length > 0) {
        addLog(`Cannot cast ${card.name} — stack must be empty for sorcery-speed spells`);
      } else {
        addLog(`Cannot cast ${card.name} — can only cast during a main phase`);
      }
      return;
    }

    // Check for additional costs (e.g., Shard Volley: sacrifice a land)
    const additionalCost = (card as any).additional_cost;
    if (additionalCost?.type === 'sacrifice_land') {
      const hasLand = gameState.players.you.battlefield.some(
        (c: Permanent) => (c.type_line || '').toLowerCase().includes('land')
      );
      if (!hasLand) {
        addLog('Cannot cast — no land to sacrifice');
        return;
      }
      const parsedCost = parseManaCost(card.mana_cost || '');
      if (!canAffordCost(parsedCost, gameState.players.you.mana_pool)) {
        addLog('Not enough mana');
        return;
      }
      setSacrificeMode({
        reason: card.name,
        filter: { types: ['land'], controller: 'you' },
        count: 1,
        selected: [],
        onComplete: ([land]) => {
          setGameState(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              _yourPermanentLeftThisTurn: true,
              players: { ...prev.players, you: {
                ...prev.players.you,
                battlefield: prev.players.you.battlefield.filter(c => c.instance_id !== land.instance_id),
                ...graveyardZones(land, prev.players.you, prev)
              }}
            };
          });
          // Dispatch triggers using a snapshot of state at the time the click landed.
          const postState = JSON.parse(JSON.stringify(gameState)) as GameState;
          postState.players.you.battlefield = postState.players.you.battlefield.filter(
            (c: Permanent) => c.instance_id !== land.instance_id
          );
          pushToGraveyardOrExile(postState, postState.players.you, land);
          // Stash sac triggers; cast pipeline dispatches them after the spell
          // hits the stack so they land on top per MTG rules.
          const landBatch: StackItem[] = [
            ...checkTriggersForEvent('land_to_graveyard', { land, owner: 'you' as PlayerKey }, postState),
            ...checkTriggersForEvent('permanent_left', { permanent: land, owner: 'you' as PlayerKey }, postState),
          ];
          pendingSacTriggersRef.current = landBatch;
          addLog(`Sacrificed ${land.name} as additional cost`);
          // Proceed to normal targeting/casting
          const requiresTarget = card.spell_effect?.target ||
            card.spell_effect?.valid_targets ||
            card.spell_effect?.type === 'damage' ||
            card.spell_effect?.type === 'buff_creature' ||
            card.spell_effect?.type === 'destroy' ||
            card.spell_effect?.type === 'attach_aura' ||
            card.spell_effect?.type === 'exile_target_creature';
          setSelectedCard({ ...card, rect } as SelectedCard);
          if (requiresTarget) {
            setIsTargeting(true);
            setTargetingOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
            addLog(`Select a target for ${card.name}`);
          } else {
            castSpellWithoutTarget(card, rect);
          }
        },
        onCancel: () => addLog(`Cancelled — ${card.name} returned to hand`),
      });
      addLog(`Select a land to sacrifice for ${card.name}`);
      return;
    }

    // Check for sacrifice as additional cost (Culling the Weak, Village Rites,
    // Deadly Dispute, Shrapnel Blast). Filter `types` is a list — sacrifice ANY
    // matching permanent.
    if (additionalCost?.type === 'sacrifice') {
      const allowedTypes: string[] = additionalCost.types || ['creature'];
      const matchesAllowed = (perm: Permanent): boolean => {
        const tl = (perm.type_line || '').toLowerCase();
        return allowedTypes.some(t => tl.includes(t.toLowerCase()));
      };
      const candidates = (gameState.players.you.battlefield || []).filter(matchesAllowed);
      if (candidates.length === 0) {
        addLog(`Cannot cast ${card.name} — no matching permanent to sacrifice (${allowedTypes.join(' or ')})`);
        return;
      }
      const parsedCost = parseManaCost(card.mana_cost || '');
      const reduction = getCostReduction(card);
      if (!canAffordCost(parsedCost, gameState.players.you.mana_pool, 0, reduction)) {
        addLog('Not enough mana');
        return;
      }
      setSacrificeMode({
        reason: card.name,
        filter: { types: allowedTypes, controller: 'you' },
        count: 1,
        selected: [],
        onComplete: ([permanent]) => {
          setGameState(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              _yourPermanentLeftThisTurn: true,
              players: { ...prev.players, you: {
                ...prev.players.you,
                battlefield: prev.players.you.battlefield.filter(c => c.instance_id !== permanent.instance_id),
                ...graveyardZones(permanent, prev.players.you, prev)
              }}
            };
          });
          // Dispatch leave/die/sac triggers
          const postState = JSON.parse(JSON.stringify(gameState)) as GameState;
          postState.players.you.battlefield = postState.players.you.battlefield.filter(
            (c: Permanent) => c.instance_id !== permanent.instance_id
          );
          pushToGraveyardOrExile(postState, postState.players.you, permanent);
          const isCreature = (permanent.type_line || '').toLowerCase().includes('creature');
          const batch: StackItem[] = [];
          if (isCreature) {
            batch.push(...checkTriggersForEvent('creature_died', { creature: permanent, owner: 'you' as PlayerKey }, postState));
            batch.push(...checkTriggersForEvent('creature_sacrificed', { creature: permanent, owner: 'you' as PlayerKey }, postState));
          }
          batch.push(...checkTriggersForEvent('permanent_sacrificed', { permanent, owner: 'you' as PlayerKey }, postState));
          batch.push(...checkTriggersForEvent('permanent_left', { permanent, owner: 'you' as PlayerKey }, postState));
          // Stash for the cast pipeline to dispatch AFTER the spell hits the
          // stack — cost-payment triggers go on top of the spell per MTG rules.
          pendingSacTriggersRef.current = batch;
          addLog(`Sacrificed ${permanent.name} as additional cost for ${card.name}`);
          // Proceed to normal targeting/casting
          const requiresTarget = card.spell_effect?.target ||
            card.spell_effect?.valid_targets ||
            card.spell_effect?.type === 'damage' ||
            card.spell_effect?.type === 'buff_creature' ||
            card.spell_effect?.type === 'destroy' ||
            card.spell_effect?.type === 'attach_aura' ||
            card.spell_effect?.type === 'exile_target_creature';
          setSelectedCard({ ...card, rect } as SelectedCard);
          if (requiresTarget) {
            setIsTargeting(true);
            setTargetingOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
            addLog(`Select a target for ${card.name}`);
          } else {
            castSpellWithoutTarget(card, rect);
          }
        },
        onCancel: () => addLog(`Cancelled — ${card.name} returned to hand`),
      });
      addLog(`Select ${allowedTypes.join(' or ')} to sacrifice for ${card.name}`);
      return;
    }

    // Check for discard as additional cost (Thrill of Possibility, Faithless Looting)
    if (additionalCost?.type === 'discard') {
      const discardCount = additionalCost.count || 1;
      const otherCards = gameState.players.you.hand.filter(
        (c: Card) => c.instance_id !== card.instance_id
      );
      if (otherCards.length < discardCount) {
        addLog(`Cannot cast ${card.name} — need to discard ${discardCount} card(s)`);
        return;
      }
      const parsedCost = parseManaCost(card.mana_cost || '');
      const reduction = getCostReduction(card);
      if (!canAffordCost(parsedCost, gameState.players.you.mana_pool, 0, reduction)) {
        addLog('Not enough mana');
        return;
      }
      setAdditionalCostDiscardState({ card, rect, count: discardCount, discardedSoFar: [] });
      addLog(`Discard ${discardCount} card(s) as additional cost for ${card.name}`);
      return;
    }

    // Check for flashback sacrifice cost (Dread Return) — Phase 4: routed
    // through unified sacrificeMode. Sacrifices remain DEFERRED until the
    // spell goes on the stack (cancelling targeting refunds everything),
    // so onComplete attaches them to the card via _pendingFlashbackSacrifices
    // and proceeds to targeting/cast — matching the legacy timing exactly.
    if ((card as any)._flashbackSacrifice) {
      const sacReq = (card as any)._flashbackSacrifice;
      const creatures = gameState.players.you.battlefield.filter(
        (c: Permanent) => (c.type_line || '').toLowerCase().includes('creature')
      );
      if (creatures.length < sacReq.count) {
        addLog(`Cannot cast — need ${sacReq.count} creatures to sacrifice (have ${creatures.length})`);
        return;
      }
      setSacrificeMode({
        reason: `${card.name} flashback`,
        filter: { types: [sacReq.type || 'creature'], controller: 'you' },
        count: sacReq.count,
        selected: [],
        onComplete: (sacrifices) => {
          const cardWithPendingSacrifice = {
            ...card,
            _pendingFlashbackSacrifices: sacrifices,
          };
          const requiresTarget = card.spell_effect?.target ||
            card.spell_effect?.valid_targets ||
            card.spell_effect?.type === 'reanimate_creature';

          if (requiresTarget) {
            // For reanimate, validate there are graveyard targets after the sac
            if (card.spell_effect?.type === 'reanimate_creature') {
              const targetGY = card.spell_effect.target_graveyard || 'you';
              const currentGY = (gameState!.players[targetGY as PlayerKey]?.graveyard || []);
              const graveyardCreatures = currentGY.filter(
                (c: any) => (c.type_line || '').toLowerCase().includes('creature') &&
                  c.instance_id !== card.instance_id
              );
              if (graveyardCreatures.length === 0 && sacrifices.length === 0) {
                addLog(`No valid creature cards in graveyard to target with ${card.name}`);
                return;
              }
            }
            setSelectedCard({ ...cardWithPendingSacrifice, rect } as any);
            setIsTargeting(true);
            setTargetingOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
            addLog(`Select a target for ${card.name}`);
          } else {
            applyFlashbackSacrifices(sacrifices, cardWithPendingSacrifice);
          }
        },
        onCancel: () => addLog('Cancelled flashback'),
      });
      addLog(`Select ${sacReq.count} creatures to sacrifice for ${card.name} flashback`);
      return;
    }

    // Check for copy_spell effect (Twincast) — needs stack spell targeting
    if (card.spell_effect?.type === 'copy_spell') {
      const validStackTargets = stack.filter(item => item.type === 'spell' && !item.resolved);
      if (validStackTargets.length === 0) {
        addLog('No valid instant or sorcery spell on the stack to target');
        return;
      }
      const parsedCost = parseManaCost(card.mana_cost || '');
      const reduction = getCostReduction(card);
      if (!canAffordCost(parsedCost, gameState.players.you.mana_pool, 0, reduction)) {
        addLog(`Not enough mana to cast ${card.name}`);
        return;
      }
      const newManaPool = spendMana(gameState.players.you.mana_pool, parsedCost, 0, reduction);
      setGameState(prev => {
        if (!prev) return prev;
        const newState = {
          ...prev,
          players: {
            ...prev.players,
            you: {
              ...prev.players.you,
              hand: prev.players.you.hand.filter((c: Card) => c.instance_id !== card.instance_id),
              graveyard: (prev.players.you.graveyard || []).filter(c => c.instance_id !== card.instance_id),
              exile: (prev.players.you.exile || []).filter(c => c.instance_id !== card.instance_id),
              mana_pool: newManaPool
            }
          }
        };
        if (newState.impulsedCards) {
          newState.impulsedCards = newState.impulsedCards.filter(ic => ic.card.instance_id !== card.instance_id);
          if (newState.impulsedCards.length === 0) delete newState.impulsedCards;
        }
        return newState;
      });
      const newSpellCount = spellsCastThisTurn + 1;
      setSpellsCastThisTurn(newSpellCount);
      setCopyTargetingState({ phase: 'targeting_spell', sourceCard: card, copiedStackItem: null, originalTargeting: null });
      setSelectedCard(null);
      addLog(`Cast ${card.name} — select an instant or sorcery on the stack`);

      // Fire all spell-cast triggers
      const manaSpent = calculateManaSpent(card.mana_cost, 0, reduction);
      fireSpellCastTriggers(card, newSpellCount, gameState, manaSpent);
      return;
    }

    // Check for counter effects (Counterspell, Remand, etc.) — needs stack spell targeting
    if (card.spell_effect?.type === 'counter_spell' || card.spell_effect?.type === 'counter_return_to_hand' || card.spell_effect?.type === 'counter_unless_pay') {
      const isReturnType = card.spell_effect.type === 'counter_return_to_hand';
      const isUnlessPay = card.spell_effect.type === 'counter_unless_pay';
      const spellTypes = ['spell', 'creature_spell', 'permanent_spell', 'spell_copy'];
      const validStackTargets = stack.filter(item => spellTypes.includes(item.type) && !item.resolved);
      if (validStackTargets.length === 0) {
        addLog('No valid spell on the stack to target');
        return;
      }
      const parsedCost = parseManaCost(card.mana_cost || '');
      const reduction = getCostReduction(card);
      if (!canAffordCost(parsedCost, gameState.players.you.mana_pool, 0, reduction)) {
        addLog(`Not enough mana to cast ${card.name}`);
        return;
      }
      const newManaPool = spendMana(gameState.players.you.mana_pool, parsedCost, 0, reduction);
      setGameState(prev => {
        if (!prev) return prev;
        const newState = {
          ...prev,
          players: {
            ...prev.players,
            you: {
              ...prev.players.you,
              hand: prev.players.you.hand.filter((c: Card) => c.instance_id !== card.instance_id),
              graveyard: (prev.players.you.graveyard || []).filter(c => c.instance_id !== card.instance_id),
              exile: (prev.players.you.exile || []).filter(c => c.instance_id !== card.instance_id),
              mana_pool: newManaPool
            }
          }
        };
        if (newState.impulsedCards) {
          newState.impulsedCards = newState.impulsedCards.filter(ic => ic.card.instance_id !== card.instance_id);
          if (newState.impulsedCards.length === 0) delete newState.impulsedCards;
        }
        return newState;
      });
      const newSpellCount = spellsCastThisTurn + 1;
      setSpellsCastThisTurn(newSpellCount);
      setCopyTargetingState({
        phase: 'targeting_spell', sourceCard: card,
        copiedStackItem: null, originalTargeting: null,
        mode: isUnlessPay ? 'counter_unless_pay' : (isReturnType ? 'counter_return' : 'counter'),
        preCastHand: [...gameState.players.you.hand],
        preCastManaPool: { ...gameState.players.you.mana_pool }
      });
      setSelectedCard(null);
      addLog(`Cast ${card.name} — select a spell on the stack to counter`);

      // Fire all spell-cast triggers
      const manaSpent = calculateManaSpent(card.mana_cost, 0, reduction);
      fireSpellCastTriggers(card, newSpellCount, gameState, manaSpent);
      return;
    }

    // Reanimate — needs graveyard creature targeting
    // Resources are consumed by castSpellOnTarget when the target is selected
    if (card.spell_effect?.type === 'reanimate_creature') {
      const targetGY = card.spell_effect.target_graveyard || 'you';
      const cmcMax = card.spell_effect.cmc_restriction?.max;

      let graveyardCreatures: Card[] = [];
      if (targetGY === 'you' || targetGY === 'any') {
        graveyardCreatures.push(
          ...(gameState.players.you.graveyard || []).filter(
            c => (c.type_line || '').toLowerCase().includes('creature')
          )
        );
      }
      if (targetGY === 'opponent' || targetGY === 'any') {
        graveyardCreatures.push(
          ...(gameState.players.opponent.graveyard || []).filter(
            c => (c.type_line || '').toLowerCase().includes('creature')
          )
        );
      }

      // Apply CMC restriction (Unearth)
      if (cmcMax !== undefined) {
        graveyardCreatures = graveyardCreatures.filter(
          c => calculateCMC(c.mana_cost) <= cmcMax
        );
      }

      if (graveyardCreatures.length === 0) {
        addLog(`No valid creature cards in graveyard to target with ${card.name}`);
        return;
      }
      const parsedCost = parseManaCost(card.mana_cost || '');
      const reduction = getCostReduction(card);
      if (!canAffordCost(parsedCost, gameState.players.you.mana_pool, 0, reduction)) {
        addLog(`Not enough mana to cast ${card.name}`);
        return;
      }
      setSelectedCard({ ...card, rect } as SelectedCard);
      setIsTargeting(true);
      setTargetingOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      const logMsg = targetGY === 'any'
        ? `Cast ${card.name} — select a creature from any graveyard`
        : `Cast ${card.name} — select a creature from your graveyard`;
      addLog(logMsg);
      return;
    }

    // Modal spells — choose modes before targeting
    if (card.spell_effect?.type === 'modal_spell') {
      const parsedCost = parseManaCost(card.mana_cost || '');
      const reduction = getCostReduction(card);
      if (!canAffordCost(parsedCost, gameState.players.you.mana_pool, 0, reduction)) {
        addLog(`Not enough mana to cast ${card.name}`);
        return;
      }
      const modes = (card.spell_effect.modes || []) as ModalSpellMode[];
      setModalSpellState({
        card: { ...card, rect } as any,
        rect,
        modes,
        chooseCount: card.spell_effect.choose_count || 2,
        chosenModes: [],
        phase: 'choosing',
        currentTargetingModeIdx: 0,
        targetResults: [],
      });
      addLog(`Casting ${card.name} — choose ${card.spell_effect.choose_count || 2} modes`);
      return;
    }

    // X cost detection — must happen before targeting check
    // castSpellWithoutTarget also detects X, but targeted X spells (Devil's Play) skip it
    if (card.mana_cost?.includes('{X}')) {
      const availableMana = Object.values(gameState.players.you.mana_pool).reduce((a, b) => a + b, 0);
      const parsedCost = parseManaCost(card.mana_cost);
      const coloredNeeded = getTotalColoredNeeded(parsedCost);
      const reduction = getCostReduction(card);
      const maxX = Math.floor((availableMana - coloredNeeded + reduction) / (parsedCost.xCount || 1));

      setXCostState({ card, maxX, rect });
      return;
    }

    setSelectedCard({ ...card, rect } as SelectedCard);

    // Check if card requires targeting
    const requiresTarget = card.spell_effect?.target ||
      card.spell_effect?.valid_targets ||
      card.spell_effect?.type === 'damage' ||
      card.spell_effect?.type === 'buff_creature' ||
      card.spell_effect?.type === 'destroy' ||
      card.spell_effect?.type === 'attach_aura' ||
      card.spell_effect?.type === 'exile_target_creature';

    if (requiresTarget) {
      setIsTargeting(true);
      setTargetingOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      addLog(`Select a target for ${card.name}`);
    } else {
      // Cast without targeting
      castSpellWithoutTarget(card, rect);
    }
  }, [gameState, addLog, stack, spellsCastThisTurn, landsPlayedThisTurn, getMaxLandDrops, getCostReduction, addToStack, fireSpellCastTriggers]);

  const cancelTargeting = useCallback(() => {
    setIsTargeting(false);
    setSelectedCard(null);
    setTargetingOrigin(null);
    // If we were in modal spell targeting, cancel the whole modal spell
    if (modalSpellState) {
      setModalSpellState(null);
      addLog('Cancelled modal spell');
      return;
    }
    // If we were targeting for a triggered/ETB ability from the stack, clear that state
    // and reset the lock so "Resolve Top" can re-enter targeting mode.
    if (triggerTargetingState) {
      setTriggerTargetingState(null);
      triggerTargetLock.current = false;
      addLog('Cancelled targeting — click Resolve Top to re-target');
      setCopyTargetingState(null);
      return;
    }
    // Miracle: cancelling targeting rewinds mana and re-opens the Cast/Keep prompt.
    // The trigger is already popped from the stack; the prompt is re-shown against
    // the saved stackItemId so declineMiracleCast still cleanly no-ops.
    if (miracleCastRetryRef.current) {
      const { card, cost, stackItemId, preManaPool } = miracleCastRetryRef.current;
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: {
            ...prev.players,
            you: { ...prev.players.you, mana_pool: preManaPool }
          }
        };
      });
      setMiracleCastPending({ card, cost, stackItemId });
      addLog(`Cancelled — returning to miracle prompt for ${card.name}.`);
      miracleCastRetryRef.current = null;
      setCopyTargetingState(null);
      return;
    }
    // If we were in alternate cost targeting (kicker/buyback), restore hand and mana
    if (altCastSnapshot.current) {
      const { hand, manaPool, cardName } = altCastSnapshot.current;
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: {
            ...prev.players,
            you: { ...prev.players.you, hand, mana_pool: manaPool }
          }
        };
      });
      addLog(`Cancelled — ${cardName} returned to hand`);
      altCastSnapshot.current = null;
      setCopyTargetingState(null);
      return;
    }
    // If we were in counter targeting, the card was already removed from hand
    // and mana was already spent — restore both from the pre-cast snapshot.
    if (copyTargetingState?.preCastHand && copyTargetingState?.preCastManaPool) {
      const restoredHand = copyTargetingState.preCastHand;
      const restoredMana = copyTargetingState.preCastManaPool;
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: {
            ...prev.players,
            you: { ...prev.players.you, hand: restoredHand, mana_pool: restoredMana }
          }
        };
      });
      addLog(`Cancelled — ${copyTargetingState.sourceCard?.name} returned to hand`);
    } else {
      addLog('Cancelled targeting');
    }
    setCopyTargetingState(null);
  }, [addLog, copyTargetingState, setCopyTargetingState, modalSpellState, triggerTargetingState]);

  // Unified sacrifice-target click handler. Accumulates selections when
  // count>1; when the final pick lands, fires onComplete and clears state.
  // Re-clicking an already-selected permanent deselects it (matters only
  // for count>1 flows like Dread Return).
  const selectSacrificeTarget = useCallback((permanent: Permanent) => {
    setSacrificeMode(prev => {
      if (!prev) return prev;
      const alreadySelected = prev.selected.some(s => s.instance_id === permanent.instance_id);
      if (alreadySelected) {
        return { ...prev, selected: prev.selected.filter(s => s.instance_id !== permanent.instance_id) };
      }
      const newSelected = [...prev.selected, permanent];
      if (newSelected.length >= prev.count) {
        // Defer onComplete until after the state clears so callers see fresh context.
        queueMicrotask(() => prev.onComplete(newSelected));
        return null;
      }
      return { ...prev, selected: newSelected };
    });
  }, []);

  const cancelSacrificeMode = useCallback(() => {
    setSacrificeMode(prev => {
      if (!prev) return prev;
      queueMicrotask(() => prev.onCancel());
      return null;
    });
  }, []);

  // Auto-resolve sacrificeMode when actor='opponent' (Edicts). Skips the
  // click UI: pick by CMC → toughness → power → random heuristic, fire
  // onComplete with the picks, clear state. If opponent has no eligible
  // permanents, log + clear without firing onComplete (the caller's spell
  // typically has other clauses that still resolve via the stack).
  useEffect(() => {
    if (!sacrificeMode || sacrificeMode.actor !== 'opponent' || !gameState) return;
    const targetKey: PlayerKey = sacrificeMode.filter.controller === 'opponent' ? 'opponent' : 'you';
    const bf = gameState.players[targetKey]?.battlefield || [];
    const candidates = bf.filter(p => matchesSacFilter(p, targetKey, sacrificeMode.filter));
    if (candidates.length === 0) {
      addLog(`${sacrificeMode.reason}: no eligible permanents to sacrifice`);
      setSacrificeMode(null);
      return;
    }
    const picked = autoPickSacrifices(candidates, sacrificeMode.count);
    const ownerLabel = targetKey === 'opponent' ? 'Opponent sacrifices' : 'You sacrifice';
    addLog(`${ownerLabel} ${picked.map(c => c.name).join(', ')}`);
    const completion = sacrificeMode.onComplete;
    setSacrificeMode(null);
    queueMicrotask(() => completion(picked));
  }, [sacrificeMode, gameState, addLog]);

  const completeAdditionalCostDiscard = useCallback((cardToDiscard: Card) => {
    if (!gameState || !additionalCostDiscardState) return;
    const { card, rect, count, discardedSoFar } = additionalCostDiscardState;

    // Remove from hand; routes to exile with _madnessPending if madness, else graveyard.
    const madnessCost = getMadnessCost(cardToDiscard);
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      performDiscard(newState, newState.players.you, cardToDiscard);
      return newState;
    });
    if (madnessCost) {
      addLog(`Discarded ${cardToDiscard.name} as additional cost — madness ${madnessCost} triggers.`);
      setMadnessCastQueue(q => [...q, { card: { ...cardToDiscard, _madnessCost: madnessCost } as any, context: 'cost' }]);
    } else {
      addLog(`Discarded ${cardToDiscard.name} as additional cost`);
    }

    const remaining = count - 1;
    if (remaining > 0) {
      // More discards needed
      setAdditionalCostDiscardState({
        card, rect, count: remaining,
        discardedSoFar: [...discardedSoFar, cardToDiscard]
      });
    } else {
      // All discards done — clear state and resume casting
      setAdditionalCostDiscardState(null);

      const requiresTarget = card.spell_effect?.target ||
        card.spell_effect?.valid_targets ||
        card.spell_effect?.type === 'damage' ||
        card.spell_effect?.type === 'buff_creature' ||
        card.spell_effect?.type === 'destroy' ||
        card.spell_effect?.type === 'attach_aura';

      setSelectedCard({ ...card, rect } as SelectedCard);
      if (requiresTarget) {
        setIsTargeting(true);
        setTargetingOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        addLog(`Select a target for ${card.name}`);
      } else {
        castSpellWithoutTarget(card, rect);
      }
    }
  }, [gameState, additionalCostDiscardState, addLog, castSpellWithoutTarget]);

  const cancelAdditionalCostDiscard = useCallback(() => {
    setAdditionalCostDiscardState(null);
    addLog('Cancelled casting');
  }, [addLog]);

  const isValidTarget = useCallback((targetType: string, targetData: any): boolean => {
    // Helper to check if target has protection from source
    const hasProtectionFrom = (target: any, source: any): boolean => {
      if (targetType !== 'creature' || !target.protection) return false;

      // Get source color(s)
      const sourceColors = source.colors || [];

      // Check if target has protection from any of the source's colors
      return target.protection.some((protectionColor: string) =>
        sourceColors.includes(protectionColor)
      );
    };

    // Helper to check if target has hexproof (native or equipment-granted).
    // Hexproof prevents an opponent from targeting — the controller can still target their own hexproof creatures.
    const hasHexproof = (target: any): boolean => {
      if (targetType !== 'creature') return false;
      if (target.keywords?.includes('hexproof')) return true;
      if (gameState) {
        const allBF = [
          ...(gameState.players.you.battlefield || []),
          ...(gameState.players.opponent.battlefield || []),
        ];
        return sourceHasKeyword(target.instance_id, 'hexproof', allBF);
      }
      return false;
    };

    // Helper to check if target has shroud (native or equipment-granted).
    // Shroud prevents ALL players from targeting — even the controller.
    const hasShroud = (target: any): boolean => {
      if (targetType !== 'creature') return false;
      if (target.keywords?.includes('shroud')) return true;
      if (gameState) {
        const allBF = [
          ...(gameState.players.you.battlefield || []),
          ...(gameState.players.opponent.battlefield || []),
        ];
        return sourceHasKeyword(target.instance_id, 'shroud', allBF);
      }
      return false;
    };

    // Check if targeting for a trigger (e.g., Snapcaster Mage ETB, Myr Retriever / Scrap Trawler death)
    if (triggerTargetingState) {
      // creature_or_player: accept creature, player, or creature_or_player target types
      if (triggerTargetingState.validTargetType === 'creature_or_player') {
        if (targetType !== 'creature' && targetType !== 'player' && targetType !== 'creature_or_player') return false;
      } else if (targetType !== triggerTargetingState.validTargetType) return false;
      // opponent_nonland_permanent: must be opponent's and not a land
      if (targetType === 'opponent_nonland_permanent') {
        if (targetData?.owner !== 'opponent') return false;
        if ((targetData?.type_line || '').toLowerCase().includes('land')) return false;
        if (hasShroud(targetData)) return false;
        if (hasHexproof(targetData) && targetData.owner !== 'you') return false;
        return true;
      }
      // any_nonland_permanent: any nonland permanent (O-Ring targets both sides)
      if (targetType === 'any_nonland_permanent') {
        if ((targetData?.type_line || '').toLowerCase().includes('land')) return false;
        // Exclude the source permanent itself (O-Ring says "another")
        const excludeSelf = triggerTargetingState.stackItem.source?.instance_id;
        if (excludeSelf && targetData?.instance_id === excludeSelf) return false;
        if (hasShroud(targetData)) return false;
        if (hasHexproof(targetData) && targetData.owner !== 'you') return false;
        return true;
      }
      // Shroud: creatures with shroud can't be targeted by any player
      if (targetType === 'creature' && hasShroud(targetData)) return false;
      // Hexproof: opponent's creatures with hexproof can't be targeted by your triggers
      if (targetType === 'creature' && hasHexproof(targetData) && targetData.owner !== 'you') return false;
      // Exclude self if the trigger effect specifies it (Myr Retriever: "another target artifact")
      const excludeSelf = (triggerTargetingState.stackItem.effect as any)?.exclude_self;
      if (excludeSelf && targetData?.instance_id === triggerTargetingState.stackItem.source?.instance_id) return false;
      // CMC constraint (Scrap Trawler: "lesser mana value")
      if (triggerTargetingState.maxCMC !== undefined) {
        const targetCMC = calculateCMC(targetData?.mana_cost);
        if (targetCMC > triggerTargetingState.maxCMC) return false;
      }
      return true;
    }

    // Check if targeting for a modal spell mode
    if (modalSpellState?.phase === 'targeting') {
      const currentModeIdx = modalSpellState.chosenModes[modalSpellState.currentTargetingModeIdx];
      const currentMode = modalSpellState.modes[currentModeIdx];
      if (currentMode.targetType === 'creature_or_player') {
        return targetType === 'creature' || targetType === 'player';
      }
      if (currentMode.targetType === 'graveyard_creature') {
        return targetType === 'graveyard_creature' && targetData?.owner === 'you';
      }
      return targetType === currentMode.targetType;
    }

    // Check if targeting for an activated ability
    if (activatedAbilityTargeting) {
      const ability = activatedAbilityTargeting.ability;
      const effect = ability.effect;
      const validTargets = effect.valid_targets || [];
      const source = activatedAbilityTargeting.permanent;

      // Check protection
      if (hasProtectionFrom(targetData, source)) {
        return false; // Can't target creatures with protection from source's color
      }

      // Shroud: creatures with shroud can't be targeted by any player's abilities
      if (targetType === 'creature' && hasShroud(targetData)) {
        return false;
      }

      // Hexproof: opponent's creatures with hexproof can't be targeted by your abilities
      if (targetType === 'creature' && hasHexproof(targetData) && targetData.owner !== 'you') {
        return false;
      }

      // Check target restriction (e.g., "your_creatures")
      if (ability.target_restriction === 'your_creatures') {
        // Only allow targeting creatures you control
        return targetType === 'creature' && targetData.owner === 'you';
      }

      // For damage effects that say "any target", allow creature or player
      if ((effect.type === 'damage' || effect.type === 'damage_and_self_damage') && effect.target === 'creature_or_player') {
        return targetType === 'creature' || targetType === 'player';
      }

      // Fallback: if ability has requires_target and it's a damage effect, allow any target
      // Handles cards like Goblin Bombardment where effect has no explicit valid_targets
      if (ability.requires_target && (effect.type === 'damage' || effect.type === 'deal_damage' || effect.type === 'damage_and_self_damage')) {
        return targetType === 'creature' || targetType === 'player';
      }

      // Fallback: buff_creature targets creatures (Fires of Yavimaya, etc.)
      if (effect.type === 'buff_creature' || effect.type === 'buff_until_eot' || effect.type === 'grant_keyword_until_eot') {
        return targetType === 'creature';
      }

      // Equip targets creatures you control
      if (effect.type === 'equip') {
        return targetType === 'creature' && targetData.owner === 'you';
      }

      // Fallback: destroy_land targets nonbasic lands (Wasteland, etc.)
      if (effect.type === 'destroy_land') {
        return targetType === 'nonbasic_land';
      }

      return validTargets.includes(targetType);
    }

    // Check if targeting for a spell
    if (!selectedCard?.spell_effect) return false;
    const effect = selectedCard.spell_effect;
    const validTargets = effect.valid_targets || [];
    const source = selectedCard;

    // Check protection for spells too
    if (hasProtectionFrom(targetData, source)) {
      return false;
    }

    // Shroud: creatures with shroud can't be targeted by any player's spells
    if (targetType === 'creature' && hasShroud(targetData)) {
      return false;
    }

    // Hexproof: opponent's creatures with hexproof can't be targeted by your spells
    if (targetType === 'creature' && hasHexproof(targetData) && targetData.owner !== 'you') {
      return false;
    }

    // Player-target hexproof: targeting opponent with hexproof (e.g. Leyline of
    // Sanctity) is invalid. Your own player can always be targeted by your spells.
    if (targetType === 'player') {
      const targetKey = (targetData as 'you' | 'opponent') || 'opponent';
      if (targetKey === 'opponent' && gameState?.players.opponent.hexproof) return false;
      // target_restriction: 'opponent' enforces opponent-only player targeting (Cruel Edict)
      if (effect.target_restriction === 'opponent' && targetKey !== 'opponent') return false;
      if (effect.target_restriction === 'you' && targetKey !== 'you') return false;
    }

    // Reanimate spells target graveyard creatures
    if (effect.type === 'reanimate_creature') {
      if (targetType !== 'graveyard_creature') return false;

      // Check graveyard ownership
      const targetGY = effect.target_graveyard || 'you';
      const targetOwner = targetData?.owner || 'you';
      if (targetGY !== 'any' && targetGY !== targetOwner) return false;

      // Check CMC restriction (Unearth)
      if (effect.cmc_restriction?.max !== undefined) {
        const cardCMC = calculateCMC(targetData?.mana_cost);
        if (cardCMC > effect.cmc_restriction.max) return false;
      }

      return true;
    }

    // Aura spells target based on their 'target' field (e.g. 'creature', 'land')
    if (effect.type === 'attach_aura') {
      const auraTarget = effect.target || 'creature';
      return targetType === auraTarget;
    }

    // Damage spells with "any target" (creature_or_player) — e.g. Lightning Bolt, Devil's Play
    if ((effect.type === 'damage' || effect.type === 'damage_and_self_damage') && effect.target === 'creature_or_player') {
      return targetType === 'creature' || targetType === 'player';
    }

    // Spell target_restriction: "opponent" / "you" filtering. Only applies to
    // creature targets when the spell actually accepts creatures — otherwise
    // a player-only spell like Cruel Edict would falsely accept creature clicks.
    if (effect.target_restriction === 'opponent' && targetType === 'creature' && validTargets.includes('creature')) {
      return targetData?.owner === 'opponent';
    }
    if (effect.target_restriction === 'you' && targetType === 'creature' && validTargets.includes('creature')) {
      return targetData?.owner === 'you';
    }

    // Buff spells/channel abilities that target creatures
    if (effect.type === 'buff_creature' || effect.type === 'buff_until_eot' || effect.type === 'grant_keyword_until_eot') {
      return targetType === 'creature';
    }

    // Exile target creature (Swords to Plowshares, Path to Exile)
    if (effect.type === 'exile_target_creature') {
      return targetType === 'creature';
    }

    // CMC restriction on targeted spells (Overload: "artifact if its mana value is 2 or less")
    if (effect.cmc_restriction?.max !== undefined && validTargets.includes(targetType)) {
      const targetCMC = calculateCMC(targetData?.mana_cost);
      return targetCMC <= effect.cmc_restriction.max;
    }

    return validTargets.includes(targetType);
  }, [selectedCard, activatedAbilityTargeting, triggerTargetingState, modalSpellState, gameState]);

  const castSpellOnTarget = useCallback((targetType: string, targetData: any) => {
    if (!gameState || !selectedCard) return;

    const card = selectedCard;
    const isChannelCast = !!(card as any)._channelCast;

    // If X cost was already paid (targeted X spell flow), mana already spent in confirmXCost
    // Same for alternate costs (kicker/buyback) — mana already spent before entering targeting
    const xAlreadyPaid = (card as any)._xValue !== undefined;
    const altCostAlreadyPaid = !!(card as any)._kicked || !!(card as any)._buyback || !!(card as any)._altCostPaid;
    let newManaPool = gameState.players.you.mana_pool;

    if (!isChannelCast && !xAlreadyPaid && !altCostAlreadyPaid) {
      const parsedCost = parseManaCost(card.mana_cost);
      const reduction = getCostReduction(card);

      if (!canAffordCost(parsedCost, gameState.players.you.mana_pool, 0, reduction)) {
        addLog(`Not enough mana to cast ${card.name}`);
        return;
      }

      newManaPool = spendMana(gameState.players.you.mana_pool, parsedCost, 0, reduction);
    }

    // Check if this is a permanent spell (auras are NOT treated as permanents on the stack)
    const typeLine = card.type_line?.toLowerCase() || '';
    const isCreature = typeLine.includes('creature');
    const isAura = card.spell_effect?.type === 'attach_aura';
    const isPermanent = !isChannelCast && !isAura && (isCreature || typeLine.includes('artifact') || typeLine.includes('enchantment') || typeLine.includes('planeswalker'));

    // Build effect — attach xValue if present
    const baseEffect = (isPermanent
      ? isCreature
        ? { type: 'enter_battlefield', creature: card, owner: 'you' }
        : { type: 'enter_battlefield_permanent', permanent: card, owner: 'you' }
      : (card.spell_effect || { type: 'unknown' })) as Effect;
    const effect = xAlreadyPaid
      ? { ...baseEffect, xValue: (card as any)._xValue }
      : baseEffect;

    const wasKicked = !!(card as any)._kicked;
    const wasBuyback = !!(card as any)._buyback;
    const stackItem: StackItem = {
      id: isChannelCast ? `channel-${card.card_id}-${Date.now()}` : `spell-${card.card_id}-${Date.now()}`,
      type: isChannelCast ? 'activated_ability' : (isPermanent ? (isCreature ? 'creature_spell' : 'permanent_spell') : 'spell'),
      source: { ...card, owner: 'you' } as any,
      effect,
      requires_input: false,
      targeting_data: { targetType: targetType as any, targetData, targets: [targetData] },
      resolved: false,
      timestamp: Date.now(),
      ...(wasKicked ? { wasKicked: true } : {}),
      ...(wasBuyback ? { wasBuyback: true } : {}),
    } as StackItem;

    // Apply deferred flashback sacrifices if present (Dread Return flashback)
    const pendingSacrifices = (card as any)._pendingFlashbackSacrifices as Permanent[] | undefined;

    // Channel: card already discarded and mana already paid in activateChannel
    if (isChannelCast) {
      // No state changes needed — just add to stack
    } else {
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      // Remove card from hand/graveyard/exile and spend mana
      newState.players.you.hand = newState.players.you.hand.filter((c: any) => c.instance_id !== card.instance_id);
      newState.players.you.graveyard = (newState.players.you.graveyard || []).filter((c: any) => c.instance_id !== card.instance_id);
      newState.players.you.exile = (newState.players.you.exile || []).filter((c: any) => c.instance_id !== card.instance_id);
      newState.players.you.mana_pool = newManaPool;
      // Remove from impulse tracking if cast from exile
      if (newState.impulsedCards) {
        newState.impulsedCards = newState.impulsedCards.filter(ic => ic.card.instance_id !== card.instance_id);
        if (newState.impulsedCards.length === 0) delete newState.impulsedCards;
      }
      // Sacrifice creatures for flashback cost
      if (pendingSacrifices) {
        for (const sac of pendingSacrifices) {
          newState.players.you.battlefield = newState.players.you.battlefield.filter(
            (c: any) => c.instance_id !== sac.instance_id
          );
          pushToGraveyardOrExile(newState, newState.players.you, sac);
        }
      }
      return newState;
    });

    // Collect sacrifices triggers — stash for dispatch after addToStack so
    // cost-payment triggers land on top of the spell per MTG rules.
    if (pendingSacrifices) {
      const postState = JSON.parse(JSON.stringify(gameState)) as GameState;
      for (const sac of pendingSacrifices) {
        addLog(`Sacrificed ${sac.name} for ${card.name} flashback`);
        postState.players.you.battlefield = postState.players.you.battlefield.filter(
          (c: any) => c.instance_id !== sac.instance_id
        );
        pushToGraveyardOrExile(postState, postState.players.you, sac);
      }
      const flashBatch: StackItem[] = [];
      for (const sac of pendingSacrifices) {
        flashBatch.push(...checkTriggersForEvent('creature_died', { creature: sac, owner: 'you' as PlayerKey }, postState));
        flashBatch.push(...checkTriggersForEvent('creature_sacrificed', { creature: sac, owner: 'you' as PlayerKey }, postState));
        flashBatch.push(...checkTriggersForEvent('permanent_sacrificed', { permanent: sac, owner: 'you' as PlayerKey }, postState));
        flashBatch.push(...checkTriggersForEvent('permanent_left', { permanent: sac, owner: 'you' as PlayerKey }, postState));
      }
      pendingSacTriggersRef.current = [...pendingSacTriggersRef.current, ...flashBatch];
    }
    } // end of !isChannelCast block

    addToStack(stackItem);

    // Dispatch any stashed cost-payment sac triggers now that the spell is on
    // the stack — they go on top of it per MTG rules.
    if (pendingSacTriggersRef.current.length > 0) {
      const stashed = pendingSacTriggersRef.current;
      pendingSacTriggersRef.current = [];
      batchAndOrderTriggers(stashed);
    }

    // "When you cast" triggers — fire for spells with on_cast/when_cast abilities
    if (!isChannelCast && card.triggered_abilities) {
      (card.triggered_abilities as any[]).forEach((ability: any) => {
        const isOnCast = ability.trigger === 'on_cast' || ability.trigger === 'when_cast' ||
          ability.trigger?.event === 'on_cast' || ability.trigger?.event === 'when_cast';
        if (isOnCast) {
          addToStack({
            id: `cast-trigger-${card.card_id}-${Date.now()}-${Math.random()}`,
            type: 'triggered_ability',
            source: { instance_id: stackItem.id, card_id: card.card_id, name: card.name, owner: 'you' },
            effect: ability.effect,
            requires_input: ability.requires_input || false,
            targeting_data: null,
            resolved: false,
            timestamp: Date.now(),
          });
        }
      });
    }

    const newSpellCount = isChannelCast ? spellsCastThisTurn : spellsCastThisTurn + 1;
    if (!isChannelCast) setSpellsCastThisTurn(newSpellCount);
    setIsTargeting(false);
    setSelectedCard(null);
    setTargetingOrigin(null);
    setCopyTargetingState(null);
    altCastSnapshot.current = null;
    miracleCastRetryRef.current = null;

    if (isChannelCast) {
      addLog(`${card.name}'s channel ability targeting ${typeof targetData === 'string' ? targetData : targetData.name}`);
      if (!holdingPriority) {
        setTimeout(() => resolveStack(), 100);
      }
      return;
    }

    addLog(`Cast ${card.name} targeting ${typeof targetData === 'string' ? targetData : targetData.name}`);

    // Check ward on target — ward only triggers when targeting a creature you don't control
    let wardTriggered = false;
    if (targetType === 'creature' && targetData.owner !== 'you' && gameState) {
      const allBF = [...gameState.players.you.battlefield, ...gameState.players.opponent.battlefield];
      const wardCost = getWardCost(targetData.instance_id, allBF);
      if (wardCost) {
        wardTriggered = true;
        const wardDesc = wardCost.type === 'discard'
          ? `discard ${wardCost.count || 1} card(s)` : `pay ${wardCost.cost}`;
        const wardItem: StackItem = {
          id: `ward-${targetData.instance_id}-${Date.now()}`,
          type: 'triggered_ability',
          source: { ...targetData, owner: targetData.owner } as any,
          effect: {
            type: (wardCost.type === 'discard' ? 'ward_discard' : 'counter_unless_pay') as any,
            payCost: wardCost.cost,
            wardType: wardCost.type,
            discardCount: wardCost.count,
          },
          requires_input: false,
          targeting_data: {
            targetType: 'stack_spell' as any,
            targetData: { stackItemId: stackItem.id, targetSource: stackItem.source },
            targets: [{ stackItemId: stackItem.id, targetSource: stackItem.source }]
          },
          resolved: false,
          timestamp: Date.now()
        };
        addToStack(wardItem);
        addLog(`${targetData.name}'s ward triggers! ${wardDesc} or the spell is countered.`);
      }
    }

    // Fire all spell-cast triggers (prowess, CMC, extort, magecraft, opus, spell count)
    const castReduction = isChannelCast ? 0 : getCostReduction(card);
    const xVal = (card as any)._xValue ?? 0;
    const manaSpent = isChannelCast ? 0 : calculateManaSpent(card.mana_cost, xVal, castReduction);
    const hasModal = gameState ? fireSpellCastTriggers(card, newSpellCount, gameState, manaSpent) : false;

    // Check for Replicate — create copies with storm targeting UI
    const replicateCount = (card as any)._replicateCount as number | undefined;
    if (replicateCount && replicateCount > 0) {
      const replicateCopies: StackItem[] = [];
      for (let i = 0; i < replicateCount; i++) {
        const copy: StackItem = {
          id: `replicate-copy-${card.card_id}-${Date.now()}-${i}`,
          type: 'spell_copy',
          source: { ...card, owner: 'you' } as any,
          effect: (card.spell_effect || { type: 'unknown' }) as Effect,
          requires_input: true,
          targeting_data: null,
          resolved: false,
          timestamp: Date.now() + i
        };
        replicateCopies.push(copy);
      }

      addLog(`Replicate: Creating ${replicateCopies.length} ${replicateCopies.length === 1 ? 'copy' : 'copies'}`);

      setStormTargetingState({
        copies: replicateCopies,
        currentCopyIndex: 0,
        source: card,
        originalTarget: { targetType: targetType as any, targetData, targets: [targetData] }
      });
      setIsTargeting(true);
      addLog(`Select target for replicate copy 1 of ${replicateCopies.length}`);
    }
    // Check for Storm
    else if (card.hasStorm && spellsCastThisTurn > 0) {
      // Create storm copies
      const stormCopies: StackItem[] = [];
      for (let i = 0; i < spellsCastThisTurn; i++) {
        const copy: StackItem = {
          id: `storm-copy-${card.card_id}-${Date.now()}-${i}`,
          type: 'spell_copy',
          source: { ...card, owner: 'you' } as any,
          effect: (card.spell_effect || { type: 'unknown' }) as Effect,
          requires_input: true, // Needs targeting
          targeting_data: null,
          resolved: false,
          timestamp: Date.now() + i
        };
        stormCopies.push(copy);
      }

      addLog(`Storm: Creating ${stormCopies.length} ${stormCopies.length === 1 ? 'copy' : 'copies'}`);

      // Enter storm targeting mode
      setStormTargetingState({
        copies: stormCopies,
        currentCopyIndex: 0,
        source: card,
        originalTarget: { targetType: targetType as any, targetData, targets: [targetData] }
      });
      setIsTargeting(true);
      addLog(`Select target for storm copy 1 of ${stormCopies.length}`);
    } else if (!holdingPriority && !hasModal && !wardTriggered) {
      // Skip explicit resolve when ward triggered — auto-resolve useEffect handles it,
      // and a stale-closure setTimeout here would double-fire the counter_unless_pay prompt.
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, selectedCard, spellsCastThisTurn, addLog, addToStack, batchAndOrderTriggers, holdingPriority, fireSpellCastTriggers]);

  // Stack resolution helper
  const resolveStack = useCallback(() => {
    if (!gameState || stack.length === 0) return;
    // Pause while madness prompts are still pending. All casts (including their
    // triggers) must be put on the stack before any resolution happens.
    if (madnessCastQueueRef.current.length > 0) return;

    const topItem = stack[stack.length - 1];

    // Optional "you may" trigger gate — pause and prompt the player. The flag
    // _optionalAccepted (set by acceptOptionalTrigger) lets us proceed past the gate.
    if (
      topItem.type === 'triggered_ability' &&
      (topItem as any).optional === true &&
      !(topItem as any)._optionalAccepted &&
      !(topItem as any)._optionalDeclined
    ) {
      setOptionalTriggerPromptState({
        stackItemId: topItem.id,
        sourceName: topItem.source.name,
        description: (topItem as any).effect?.description || (topItem as any).description,
      });
      return;
    }

    // Ninjutsu effect resolution: put the hand-card onto the battlefield tapped
    // and attacking. Fizzles if the card isn't in hand any more.
    if (topItem.effect?.type === 'ninjutsu_enter') {
      const card = (topItem.effect as any).card as Card | undefined;
      if (!card) {
        setStack(prev => prev.slice(0, -1));
        return;
      }
      const matchId = (card as any).instance_id || card.card_id;
      const inHand = (gameState.players.you.hand || []).some(
        (c: any) => (c.instance_id || c.card_id) === matchId
      );
      if (!inHand) {
        addLog(`Ninjutsu fizzled — ${card.name} is no longer in your hand.`);
        setStack(prev => prev.slice(0, -1));
        return;
      }
      const newPermanent: Permanent = {
        ...card,
        instance_id: `ninjutsu-bf-${card.card_id}-${Date.now()}`,
        owner: 'you' as PlayerKey,
        tapped: true,
        attacking: true,
        summoning_sick: false,
      } as Permanent;
      const nextState = JSON.parse(JSON.stringify(gameState)) as GameState;
      nextState.players.you.hand = (nextState.players.you.hand || []).filter(
        (c: any) => (c.instance_id || c.card_id) !== matchId
      );
      nextState.players.you.battlefield = [...(nextState.players.you.battlefield || []), newPermanent];
      setGameState(nextState);
      setStack(prev => prev.slice(0, -1));
      addLog(`${card.name} enters the battlefield tapped and attacking.`);

      const etbTriggers = checkTriggersForEvent('creature_entered', {
        creature: newPermanent,
        wasEvoked: false,
      }, nextState);
      etbTriggers.forEach(t => addToStack(t));
      return;
    }

    // Miracle cast prompt: the revealed miracle trigger resolves into a Cast/Keep
    // choice — unless the card left the player's hand between reveal and resolution
    // (e.g. forced discard, another cast), in which case the trigger fizzles.
    if (topItem.effect?.type === 'miracle_cast') {
      const effect = topItem.effect as any;
      const card = effect.card as Card | undefined;
      if (!card || !effect.manaCost) {
        setStack(prev => prev.slice(0, -1));
        return;
      }
      const matchId = (card as any).instance_id || card.card_id;
      const stillInHand = (gameState.players.you.hand || []).some(
        (c: any) => (c.instance_id || c.card_id) === matchId
      );
      if (!stillInHand) {
        addLog(`Miracle trigger for ${card.name} fizzles — card is no longer in your hand.`);
        setStack(prev => prev.filter(item => item.id !== topItem.id));
        return;
      }
      setMiracleCastPending({ card, cost: effect.manaCost, stackItemId: topItem.id });
      return;
    }

    // target_player_sacrifice — when YOU are the target, the player must
    // choose which creature to sacrifice (auto-pick is opponent-only). Open
    // sacrificeMode with actor='you', stash the choice on the stack item via
    // _chosenSacs, then resume resolveStack so applyTargetPlayerSacrifice
    // can read the stash. Opponent-target falls through to auto-pick.
    if (topItem.effect?.type === 'target_player_sacrifice' && (topItem.effect as any)._chosenSacs === undefined) {
      const targetPlayer = (topItem.targeting_data?.targetData as 'you' | 'opponent') || 'opponent';
      if (targetPlayer === 'you') {
        const types = (topItem.effect.types as string[]) || ['creature'];
        const count = (topItem.effect.count as number) || 1;
        const candidates = (gameState.players.you.battlefield || []).filter(p =>
          matchesSacFilter(p, 'you', { types, controller: 'you' })
        );
        // No eligible permanents — mark resolved with empty array, handler logs and skips.
        if (candidates.length === 0) {
          setStack(prev => prev.map(item =>
            item.id === topItem.id
              ? { ...item, effect: { ...item.effect, _chosenSacs: [] } }
              : item
          ));
          if (!holdingPriority) setTimeout(() => resolveStackRef.current(), 100);
          return;
        }
        const stackItemId = topItem.id;
        const reopenPrompt = () => {
          // Forced sacrifice — can't cancel mid-resolution. Re-fire by tickling
          // resolveStack. Use resolveStackRef to dodge the stale-closure trap.
          if (!holdingPriority) setTimeout(() => resolveStackRef.current(), 100);
        };
        setSacrificeMode({
          reason: topItem.source.name,
          filter: { types, controller: 'you' },
          count,
          selected: [],
          actor: 'you',
          onComplete: (selected) => {
            setStack(prev => prev.map(item =>
              item.id === stackItemId
                ? { ...item, effect: { ...item.effect, _chosenSacs: selected } }
                : item
            ));
            // resolveStackRef points at the latest resolveStack — critical so
            // the next pass sees the _chosenSacs we just set instead of the
            // stale stack captured when this onComplete closure was created.
            if (!holdingPriority) setTimeout(() => resolveStackRef.current(), 100);
          },
          onCancel: reopenPrompt,
        });
        return;
      }
    }

    // Effects that need user color choice — pause resolution
    if (topItem.effect?.type === 'add_mana_any_color') {
      setManaColorSelection({
        sourceCard: topItem.source as unknown as Permanent,
        stackItemId: topItem.id,
        amount: topItem.effect.amount
      });
      return;
    }

    // Handle pay_to_untap_self (Mana Vault) — check affordability, prompt or auto-skip
    if (topItem.effect?.type === 'pay_to_untap_self') {
      const cost = topItem.effect.cost?.generic || 0;
      const costString = `{${cost}}`;
      const parsedCost = parseManaCost(costString);
      if (!canAffordCost(parsedCost, gameState.players.you.mana_pool)) {
        // Can't afford — auto-resolve by skipping
        setStack(prev => prev.slice(0, -1));
        addLog(`${topItem.source.name}: Can't pay {${cost}} — skipping.`);
        return;
      }
      // Can afford — pause and ask the player
      setPayToUntapState({
        sourceCard: topItem.source as unknown as Permanent,
        stackItemId: topItem.id,
        manaCost: cost
      });
      return;
    }

    // Handle endure (Descendant of Storms) — optional mana payment then modal choice
    if (topItem.effect?.type === 'endure') {
      const costObj = topItem.effect.cost;
      const costString = manaToString(costObj);
      const parsedCost = parseManaCost(costString);
      if (!canAffordCost(parsedCost, gameState.players.you.mana_pool)) {
        setStack(prev => prev.slice(0, -1));
        addLog(`${topItem.source.name}: Can't pay ${costString} to endure — skipping.`);
        return;
      }
      setEndurePromptState({
        sourceCard: topItem.source as unknown as Permanent,
        stackItemId: topItem.id,
        manaCost: costString,
        value: topItem.effect.value || 1,
        trigger: topItem,
      });
      return;
    }

    // Handle grant_flashback (Snapcaster Mage ETB) — needs graveyard spell targeting
    if (topItem.effect?.type === 'grant_flashback' && !topItem.targeting_data) {
      // Guard against double entry (two resolveStack timers racing)
      if (triggerTargetLock.current) return;
      triggerTargetLock.current = true;

      const gySpells = (gameState.players.you.graveyard || []).filter((c: any) => {
        const tl = (c.type_line || '').toLowerCase();
        return tl.includes('instant') || tl.includes('sorcery');
      });
      if (gySpells.length === 0) {
        addLog('No valid instant or sorcery in graveyard to target.');
        setStack(prev => prev.slice(0, -1));
        triggerTargetLock.current = false;
        if (!holdingPriority && stack.length > 1) {
          setTimeout(() => resolveStack(), 100);
        }
        return;
      }
      // Pause for targeting — player needs to select a graveyard instant/sorcery
      setTriggerTargetingState({ stackItem: topItem, validTargetType: 'graveyard_spell' });
      setIsTargeting(true);
      addLog(`${topItem.source.name}: Select an instant or sorcery in your graveyard`);
      return;
    }

    // Handle grant_flashback resolution (target already selected)
    if (topItem.effect?.type === 'grant_flashback' && topItem.targeting_data) {
      triggerTargetLock.current = false;
      const targetCard = topItem.targeting_data.targetData;
      const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
      if (targetCard) {
        const graveyardOwner = (targetCard.owner || 'you') as PlayerKey;
        const graveyard = newState.players[graveyardOwner].graveyard || [];
        const idx = graveyard.findIndex((c: any) => c.instance_id === targetCard.instance_id);
        if (idx >= 0) {
          (graveyard[idx] as any).flashback = { cost: graveyard[idx].mana_cost };
          addLog(`${targetCard.name} gains flashback (cost: ${targetCard.mana_cost}).`);
        }
      }
      setStack(prev => prev.slice(0, -1));
      setGameState(newState);
      if (!holdingPriority && stack.length > 1) {
        setTimeout(() => resolveStack(), 100);
      }
      return;
    }

    // Handle return_from_graveyard_to_hand trigger targeting (Myr Retriever / Scrap Trawler death trigger)
    if (topItem.effect?.type === 'return_from_graveyard_to_hand' && topItem.requires_input && !topItem.targeting_data) {
      if (triggerTargetLock.current) return;
      triggerTargetLock.current = true;

      const targetFilter = (topItem.effect as any).target as string | undefined; // 'artifact', 'creature', etc.
      const excludeSelf = (topItem.effect as any).exclude_self;
      const cmcLessThanDying = (topItem.effect as any).cmc_less_than_dying;
      const dyingCMC = (topItem as any).triggerContext?.dyingPermanentCMC as number | undefined;

      const gyCards = (gameState.players.you.graveyard || []).filter((c: any) => {
        if (excludeSelf && c.instance_id === topItem.source.instance_id) return false;
        if (targetFilter && !(c.type_line || '').toLowerCase().includes(targetFilter)) return false;
        if (cmcLessThanDying && dyingCMC !== undefined) {
          if (calculateCMC(c.mana_cost) >= dyingCMC) return false;
        }
        return true;
      });

      if (gyCards.length === 0) {
        addLog(`${topItem.source.name}: No valid targets in graveyard.`);
        setStack(prev => prev.slice(0, -1));
        triggerTargetLock.current = false;
        if (!holdingPriority && stack.length > 1) setTimeout(() => resolveStack(), 100);
        return;
      }

      const validType = targetFilter ? `graveyard_${targetFilter}` : 'graveyard_card';
      const maxCMC = (cmcLessThanDying && dyingCMC !== undefined) ? dyingCMC - 1 : undefined;
      setTriggerTargetingState({ stackItem: topItem, validTargetType: validType, maxCMC });
      setIsTargeting(true);
      const cmcNote = maxCMC !== undefined ? ` (CMC ≤ ${maxCMC})` : '';
      addLog(`${topItem.source.name}: Select a target ${targetFilter || 'card'} in your graveyard${cmcNote}`);
      return;
    }

    // Handle return_from_graveyard_to_hand resolution (target already selected) — clear lock, fall through to effect handler
    if (topItem.effect?.type === 'return_from_graveyard_to_hand' && topItem.targeting_data) {
      triggerTargetLock.current = false;
    }

    // Handle exile_until_end_step trigger targeting (Flickerwisp ETB — exile another permanent)
    if (topItem.effect?.type === 'exile_until_end_step' && topItem.requires_input && !topItem.targeting_data) {
      if (triggerTargetLock.current) return;
      triggerTargetLock.current = true;

      const excludeSelf = (topItem.effect as any).exclude_self;
      const allPermanents = [
        ...(gameState.players.you.battlefield || []).map((c: Permanent) => ({ ...c, owner: 'you' as PlayerKey })),
        ...(gameState.players.opponent.battlefield || []).map((c: Permanent) => ({ ...c, owner: 'opponent' as PlayerKey })),
      ].filter(c => {
        if (excludeSelf && c.instance_id === topItem.source.instance_id) return false;
        return true;
      });

      if (allPermanents.length === 0) {
        addLog(`${topItem.source.name}: No valid targets.`);
        setStack(prev => prev.slice(0, -1));
        triggerTargetLock.current = false;
        if (!holdingPriority && stack.length > 1) setTimeout(() => resolveStack(), 100);
        return;
      }

      setTriggerTargetingState({ stackItem: topItem, validTargetType: 'battlefield_permanent' });
      setIsTargeting(true);
      addLog(`${topItem.source.name}: Select a permanent to exile`);
      return;
    }

    // Handle exile_until_end_step resolution (target already selected) — clear lock, fall through
    if (topItem.effect?.type === 'exile_until_end_step' && topItem.targeting_data) {
      triggerTargetLock.current = false;
    }

    // Handle exile_until_leaves trigger targeting (Banishing Light ETB — exile opponent's nonland permanent)
    if (topItem.effect?.type === 'exile_until_leaves' && topItem.requires_input && !topItem.targeting_data) {
      if (triggerTargetLock.current) return;
      triggerTargetLock.current = true;

      // Banishing Light targets nonland permanents an opponent controls
      const opponentPermanents = (gameState.players.opponent.battlefield || [])
        .filter((c: Permanent) => !(c.type_line || '').toLowerCase().includes('land'))
        .map((c: Permanent) => ({ ...c, owner: 'opponent' as PlayerKey }));

      if (opponentPermanents.length === 0) {
        addLog(`${topItem.source.name}: No valid targets.`);
        setStack(prev => prev.slice(0, -1));
        triggerTargetLock.current = false;
        if (!holdingPriority && stack.length > 1) setTimeout(() => resolveStack(), 100);
        return;
      }

      setTriggerTargetingState({ stackItem: topItem, validTargetType: 'opponent_nonland_permanent' });
      setIsTargeting(true);
      addLog(`${topItem.source.name}: Select a nonland permanent an opponent controls to exile`);
      return;
    }

    // Handle exile_until_leaves resolution (target already selected) — clear lock, fall through
    if (topItem.effect?.type === 'exile_until_leaves' && topItem.targeting_data) {
      triggerTargetLock.current = false;
    }

    // Handle exile_under trigger targeting (Oblivion Ring ETB — exile another nonland permanent)
    if (topItem.effect?.type === 'exile_under' && topItem.requires_input && !topItem.targeting_data) {
      if (triggerTargetLock.current) return;
      triggerTargetLock.current = true;

      // O-Ring targets any nonland permanent except itself
      const allPermanents = [
        ...(gameState.players.you.battlefield || []).map((c: Permanent) => ({ ...c, owner: 'you' as PlayerKey })),
        ...(gameState.players.opponent.battlefield || []).map((c: Permanent) => ({ ...c, owner: 'opponent' as PlayerKey })),
      ].filter(c => {
        if (c.instance_id === topItem.source.instance_id) return false; // exclude self
        if ((c.type_line || '').toLowerCase().includes('land')) return false; // nonland only
        return true;
      });

      if (allPermanents.length === 0) {
        addLog(`${topItem.source.name}: No valid targets.`);
        setStack(prev => prev.slice(0, -1));
        triggerTargetLock.current = false;
        if (!holdingPriority && stack.length > 1) setTimeout(() => resolveStack(), 100);
        return;
      }

      setTriggerTargetingState({ stackItem: topItem, validTargetType: 'any_nonland_permanent' });
      setIsTargeting(true);
      addLog(`${topItem.source.name}: Select another nonland permanent to exile`);
      return;
    }

    // Handle exile_under resolution (target already selected) — clear lock, fall through
    if (topItem.effect?.type === 'exile_under' && topItem.targeting_data) {
      triggerTargetLock.current = false;
    }

    // Handle deal_damage triggered ability targeting (Overlord of the Boilerbilges, etc.)
    if ((topItem.effect?.type === 'deal_damage' || topItem.effect?.type === 'damage')
        && topItem.requires_input && !topItem.targeting_data) {
      if (triggerTargetLock.current) return;
      triggerTargetLock.current = true;

      const targetSpec = topItem.effect.target || 'creature_or_player';
      const validType = targetSpec === 'any' ? 'creature_or_player' : targetSpec;
      setTriggerTargetingState({ stackItem: topItem, validTargetType: validType });
      setIsTargeting(true);
      addLog(`${topItem.source.name}: Select a target for ${topItem.effect.amount} damage`);
      return;
    }

    // Handle deal_damage / damage trigger resolution (target selected) — clear lock, fall through.
    if ((topItem.effect?.type === 'deal_damage' || topItem.effect?.type === 'damage')
        && topItem.targeting_data) {
      triggerTargetLock.current = false;
    }

    // Handle drain_life triggered ability targeting (Abundant Maw cast trigger, etc.)
    if (topItem.effect?.type === 'drain_life' && topItem.requires_input && !topItem.targeting_data) {
      if (triggerTargetLock.current) return;
      triggerTargetLock.current = true;

      const targetSpec = topItem.effect.target || 'player';
      const validType = targetSpec === 'any' ? 'creature_or_player' : targetSpec;
      setTriggerTargetingState({ stackItem: topItem, validTargetType: validType });
      setIsTargeting(true);
      addLog(`${topItem.source.name}: Select a target to drain ${topItem.effect.amount} life`);
      return;
    }

    // Handle drain_life resolution (target selected) — clear lock, fall through
    if (topItem.effect?.type === 'drain_life' && topItem.targeting_data) {
      triggerTargetLock.current = false;
    }

    // Handle destroy triggered ability targeting (Tolarian Emissary kicked ETB, etc.)
    if (topItem.effect?.type === 'destroy' && topItem.requires_input && !topItem.targeting_data) {
      if (triggerTargetLock.current) return;
      triggerTargetLock.current = true;

      // Determine valid target type from the effect's valid_targets or target field
      const targetFilter = topItem.effect.valid_targets || ['creature'];
      const allPermanents = [
        ...(gameState.players.you.battlefield || []).map((c: Permanent) => ({ ...c, owner: 'you' as PlayerKey })),
        ...(gameState.players.opponent.battlefield || []).map((c: Permanent) => ({ ...c, owner: 'opponent' as PlayerKey })),
      ].filter(c => {
        const tl = (c.type_line || '').toLowerCase();
        return (targetFilter as string[]).some(f => tl.includes(f));
      });

      if (allPermanents.length === 0) {
        addLog(`${topItem.source.name}: No valid targets to destroy.`);
        setStack(prev => prev.slice(0, -1));
        triggerTargetLock.current = false;
        if (!holdingPriority && stack.length > 1) setTimeout(() => resolveStack(), 100);
        return;
      }

      // Map target filter to a valid target type for the targeting UI
      const validType = targetFilter.includes('enchantment') ? 'enchantment'
        : targetFilter.includes('artifact') ? 'artifact'
        : targetFilter.includes('creature') ? 'creature'
        : 'permanent';
      setTriggerTargetingState({ stackItem: topItem, validTargetType: validType });
      setIsTargeting(true);
      addLog(`${topItem.source.name}: Select a target ${targetFilter.join(' or ')} to destroy`);
      return;
    }

    // Handle destroy resolution (target selected) — clear lock, fall through to effect handler
    if (topItem.effect?.type === 'destroy' && topItem.targeting_data) {
      triggerTargetLock.current = false;
    }

    // Handle buff_creature triggered ability targeting (Vitu-Ghazi Inspector evidence ETB, etc.)
    if (topItem.effect?.type === 'buff_creature' && topItem.requires_input && !topItem.targeting_data) {
      if (triggerTargetLock.current) return;
      triggerTargetLock.current = true;

      const allCreatures = [
        ...(gameState.players.you.battlefield || []).filter((c: Permanent) =>
          (c.type_line || '').toLowerCase().includes('creature')
        ).map((c: Permanent) => ({ ...c, owner: 'you' as PlayerKey })),
        ...(gameState.players.opponent.battlefield || []).filter((c: Permanent) =>
          (c.type_line || '').toLowerCase().includes('creature')
        ).map((c: Permanent) => ({ ...c, owner: 'opponent' as PlayerKey })),
      ];

      if (allCreatures.length === 0) {
        addLog(`${topItem.source.name}: No valid creature targets.`);
        setStack(prev => prev.slice(0, -1));
        triggerTargetLock.current = false;
        if (!holdingPriority && stack.length > 1) setTimeout(() => resolveStack(), 100);
        return;
      }

      setTriggerTargetingState({ stackItem: topItem, validTargetType: 'creature' });
      setIsTargeting(true);
      const counterDesc = topItem.effect.counter ? `a ${topItem.effect.counter} counter` : `+${topItem.effect.power || 0}/+${topItem.effect.toughness || 0}`;
      addLog(`${topItem.source.name}: Select a creature to receive ${counterDesc}`);
      return;
    }

    // Handle buff_creature resolution (target selected) — clear lock, fall through
    if (topItem.effect?.type === 'buff_creature' && topItem.targeting_data) {
      triggerTargetLock.current = false;
    }

    // Handle copy_spell resolution (Twincast) — create copy, optionally retarget
    if (topItem.effect?.type === 'copy_spell') {
      const snapshot = topItem.targeting_data?.targetData?.snapshot;
      if (!snapshot) {
        addLog('Targeted spell no longer exists');
        setStack(prev => prev.slice(0, -1));
        return;
      }

      // Remove copy spell from stack and put it in graveyard if it's a real spell card
      setStack(prev => prev.slice(0, -1));
      if (topItem.type === 'spell') {
        const spellOwner = ((topItem.source as any).owner || 'you') as PlayerKey;
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            players: {
              ...prev.players,
              [spellOwner]: {
                ...prev.players[spellOwner],
                ...graveyardZones({ ...topItem.source }, prev.players[spellOwner], prev)
              }
            }
          };
        });
      }

      // Create the copy
      const copy: StackItem = {
        id: `spell-copy-${snapshot.source.name}-${Date.now()}`,
        type: 'spell_copy' as const,
        source: { ...snapshot.source },
        effect: { ...snapshot.effect },
        requires_input: false,
        targeting_data: null,
        resolved: false,
        timestamp: Date.now()
      };

      addLog(`${topItem.source.name} creates a copy of ${snapshot.source.name}`);

      if (snapshot.targeting_data) {
        // Original had targets → enter retargeting phase
        setCopyTargetingState({
          phase: 'retargeting_copy',
          sourceCard: null,
          copiedStackItem: copy,
          originalTargeting: snapshot.targeting_data
        });
        addLog('Choose new targets for the copy, or keep original target');
      } else {
        // No targets → add copy directly to stack
        addToStack(copy);
        // Magecraft triggers for copying an instant/sorcery
        if (gameState) {
          const mcTriggers = checkTriggersForEvent('instant_sorcery_cast_or_copy', { spell: copy.source as unknown as Card }, gameState);
          mcTriggers.forEach(trigger => addToStack(trigger));
        }
        if (!holdingPriority) {
          setTimeout(() => resolveStack(), 100);
        }
      }
      return;
    }

    // Handle counter_spell resolution — remove targeted spell from stack, put in graveyard
    if (topItem.effect?.type === 'counter_spell') {
      const targetStackItemId = topItem.targeting_data?.targetData?.stackItemId;
      const targetSource = topItem.targeting_data?.targetData?.targetSource;
      const targetName = targetSource?.name || 'spell';

      const targetedItem = stack.find(item => item.id === targetStackItemId);

      if (!targetedItem) {
        addLog(`${targetName} is no longer on the stack (fizzled)`);
        setStack(prev => prev.slice(0, -1));
        // Counterspell still goes to graveyard even when fizzled (only real spells, not copies)
        if (topItem.type === 'spell') {
          const fizzledOwner = ((topItem.source as any).owner || 'you') as PlayerKey;
          setGameState(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              players: {
                ...prev.players,
                [fizzledOwner]: {
                  ...prev.players[fizzledOwner],
                  ...graveyardZones({ ...topItem.source }, prev.players[fizzledOwner], prev)
                }
              }
            };
          });
        }
        return;
      }

      // Remove both counterspell (top) and countered spell from stack
      setStack(prev => prev.filter(item => item.id !== topItem.id && item.id !== targetStackItemId));

      // Put real spell cards in their owners' graveyards (spell_copy items are ephemeral, skip them)
      const counterOwner = ((topItem.source as any).owner || 'you') as PlayerKey;
      const counteredOwner = ((targetedItem.source as any).owner || 'you') as PlayerKey;
      const counteredIsReal = targetedItem.type !== 'spell_copy';
      const counterIsReal = topItem.type === 'spell';
      setGameState(prev => {
        if (!prev) return prev;
        const newState = JSON.parse(JSON.stringify(prev)) as GameState;
        if (counteredIsReal) {
          if ((targetedItem.source as any)?._flashbackCast) {
            // Flashback spells go to exile when countered
            const owner = newState.players[counteredOwner];
            owner.exile = owner.exile || [];
            owner.exile.push({ ...targetedItem.source } as unknown as Card);
          } else {
            pushToGraveyardOrExile(newState, newState.players[counteredOwner], { ...targetedItem.source } as unknown as Card);
          }
        }
        if (counterIsReal) {
          pushToGraveyardOrExile(newState, newState.players[counterOwner], { ...topItem.source });
        }
        return newState;
      });

      addLog(`${topItem.source.name} counters ${targetName}`);

      // Continue resolving remaining stack items
      if (!holdingPriority) {
        // We removed 2 items; check if there's still more
        const remainingCount = stack.length - 2;
        if (remainingCount > 0) {
          setTimeout(() => resolveStack(), 100);
        }
      }
      return;
    }

    // Handle counter_unless_pay (Mana Leak, Ward) — counter unless controller pays mana
    // Guard: if the pay prompt is already showing (stale closure race), bail out
    if (topItem.effect?.type === 'counter_unless_pay' && counterUnlessPayState) return;
    if (topItem.effect?.type === 'counter_unless_pay') {
      const targetStackItemId = topItem.targeting_data?.targetData?.stackItemId;
      const targetSource = topItem.targeting_data?.targetData?.targetSource;
      const targetName = targetSource?.name || 'spell';
      const payCost = topItem.effect.payCost || '{3}';

      const targetedItem = stack.find(item => item.id === targetStackItemId);

      if (!targetedItem) {
        addLog(`${targetName} is no longer on the stack (fizzled)`);
        setStack(prev => prev.slice(0, -1));
        if (topItem.type === 'spell') {
          const fizzledOwner = ((topItem.source as any).owner || 'you') as PlayerKey;
          setGameState(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              players: {
                ...prev.players,
                [fizzledOwner]: {
                  ...prev.players[fizzledOwner],
                  ...graveyardZones({ ...topItem.source }, prev.players[fizzledOwner], prev)
                }
              }
            };
          });
        }
        return;
      }

      const targetedSpellOwner = ((targetedItem.source as any).owner || 'you') as PlayerKey;

      if (targetedSpellOwner === 'you') {
        // Player's spell is being countered — give them the choice to pay
        const parsedCost = parseManaCost(payCost);
        const canPay = canAffordCost(parsedCost, gameState.players.you.mana_pool);
        setCounterUnlessPayState({
          counterStackItemId: topItem.id,
          targetedStackItemId: targetStackItemId,
          counterSourceName: topItem.source.name,
          targetedSpellName: targetName,
          manaCost: payCost,
        });
        if (!canPay) {
          addLog(`${topItem.source.name} — pay ${payCost} or ${targetName} is countered. (You can't afford it!)`);
        } else {
          addLog(`${topItem.source.name} — pay ${payCost} or ${targetName} is countered.`);
        }
        return; // Wait for player decision
      } else {
        // Opponent's spell — auto-counter (no AI to pay)
        setStack(prev => prev.filter(item => item.id !== topItem.id && item.id !== targetStackItemId));
        const counterOwner = ((topItem.source as any).owner || 'you') as PlayerKey;
        setGameState(prev => {
          if (!prev) return prev;
          const newState = JSON.parse(JSON.stringify(prev)) as GameState;
          pushToGraveyardOrExile(newState, newState.players[targetedSpellOwner], { ...targetedItem.source } as unknown as Card);
          if (topItem.type === 'spell') {
            pushToGraveyardOrExile(newState, newState.players[counterOwner], { ...topItem.source });
          }
          return newState;
        });
        addLog(`${topItem.source.name} counters ${targetName} (opponent couldn't pay ${payCost})`);
        if (!holdingPriority) {
          const remainingCount = stack.length - 2;
          if (remainingCount > 0) setTimeout(() => resolveStack(), 100);
        }
        return;
      }
    }

    // Handle ward_discard — ward that costs discarding a card
    if (topItem.effect?.type === 'ward_discard' && counterUnlessPayState) return;
    if (topItem.effect?.type === 'ward_discard') {
      const targetStackItemId = topItem.targeting_data?.targetData?.stackItemId;
      const targetSource = topItem.targeting_data?.targetData?.targetSource;
      const targetName = targetSource?.name || 'spell';
      const discardCount = topItem.effect.discardCount || 1;

      const targetedItem = stack.find(item => item.id === targetStackItemId);

      if (!targetedItem) {
        addLog(`${targetName} is no longer on the stack (fizzled)`);
        setStack(prev => prev.slice(0, -1));
        return;
      }

      const targetedSpellOwner = ((targetedItem.source as any).owner || 'you') as PlayerKey;

      if (targetedSpellOwner === 'you') {
        const handSize = gameState.players.you.hand.length;
        const canPay = handSize >= discardCount;
        setCounterUnlessPayState({
          counterStackItemId: topItem.id,
          targetedStackItemId: targetStackItemId,
          counterSourceName: topItem.source.name,
          targetedSpellName: targetName,
          manaCost: '',
          wardType: 'discard',
          discardCount,
        });
        if (!canPay) {
          addLog(`${topItem.source.name}'s ward — discard ${discardCount} card(s) or ${targetName} is countered. (Not enough cards!)`);
        } else {
          addLog(`${topItem.source.name}'s ward — discard ${discardCount} card(s) or ${targetName} is countered.`);
        }
        return;
      } else {
        // Opponent's spell — auto-counter
        setStack(prev => prev.filter(item => item.id !== topItem.id && item.id !== targetStackItemId));
        setGameState(prev => {
          if (!prev) return prev;
          const newState = JSON.parse(JSON.stringify(prev)) as GameState;
          pushToGraveyardOrExile(newState, newState.players[targetedSpellOwner], { ...targetedItem.source } as unknown as Card);
          return newState;
        });
        addLog(`${topItem.source.name}'s ward counters ${targetName} (opponent couldn't discard)`);
        return;
      }
    }

    // Handle extort — "you may pay {W/B}" optional drain
    if (topItem.effect?.type === 'extort' && extortState) return;
    if (topItem.effect?.type === 'extort') {
      const { canPayWhite, canPayBlack } = canPayExtortCostFn(gameState);
      if (!canPayWhite && !canPayBlack) {
        // Auto-skip — no way to pay
        addLog(`${topItem.source.name}'s extort — no {W} or {B} available, skipping.`);
        setStack(prev => prev.slice(0, -1));
        if (!holdingPriority) {
          const remaining = stack.length - 1;
          if (remaining > 0) setTimeout(() => resolveStack(), 100);
        }
        return;
      }
      setExtortState({
        stackItemId: topItem.id,
        sourceName: topItem.source.name,
        canPayWhite,
        canPayBlack,
      });
      addLog(`${topItem.source.name}'s extort — you may pay {W/B}.`);
      return;
    }

    // Handle counter_return_to_hand (Remand) — counter and return to owner's hand, then draw
    if (topItem.effect?.type === 'counter_return_to_hand') {
      const targetStackItemId = topItem.targeting_data?.targetData?.stackItemId;
      const targetSource = topItem.targeting_data?.targetData?.targetSource;
      const targetName = targetSource?.name || 'spell';

      const targetedItem = stack.find(item => item.id === targetStackItemId);

      // Remove Remand from stack (whether or not target is still there)
      setStack(prev => prev.filter(item =>
        item.id !== topItem.id && (targetedItem ? item.id !== targetStackItemId : true)
      ));

      if (!targetedItem) {
        addLog(`${targetName} is no longer on the stack — ${topItem.source.name} fizzles`);
      } else {
        const counteredOwner = ((targetedItem.source as any).owner || 'you') as PlayerKey;
        const counteredIsReal = targetedItem.type !== 'spell_copy';
        setGameState(prev => {
          if (!prev) return prev;
          const newState = JSON.parse(JSON.stringify(prev)) as GameState;
          // Remand goes to graveyard (subject to replacement effects)
          if (topItem.type === 'spell') {
            const remandOwner = ((topItem.source as any).owner || 'you') as PlayerKey;
            pushToGraveyardOrExile(newState, newState.players[remandOwner], { ...topItem.source });
          }
          // Countered spell returns to owner's hand (not graveyard)
          if (counteredIsReal) {
            const card = { ...targetedItem.source } as any;
            newState.players[counteredOwner].hand = [
              ...(newState.players[counteredOwner].hand || []),
              card
            ];
          }
          // Draw a card for Remand's caster
          const remandCaster = ((topItem.source as any).owner || 'you') as PlayerKey;
          const casterPlayer = newState.players[remandCaster];
          casterPlayer.library = casterPlayer.library || [];
          casterPlayer.hand = casterPlayer.hand || [];
          if (casterPlayer.library.length > 0) {
            const [drawn, ...rest] = casterPlayer.library;
            casterPlayer.hand.push(drawn);
            casterPlayer.library = rest;
            casterPlayer.library_count = rest.length;
            newState._youCardsDrawn = 1;
          } else if ((casterPlayer.library_count || 0) > 0) {
            // Count-only library (puzzle mode) — decrement count, no card object to add
            casterPlayer.library_count = (casterPlayer.library_count || 1) - 1;
            newState._youCardsDrawn = 1;
          } else {
            // Empty library — deckout
            casterPlayer.deckedOut = true;
            newState._youCardsDrawn = 0;
          }
          return newState;
        });
        addLog(`${topItem.source.name} counters ${targetName} — returned to ${counteredOwner === 'you' ? 'your' : "opponent's"} hand`);
        if ((gameState.players.you.library || []).length > 0 || (gameState.players.you.library_count || 0) > 0) {
          addLog(`${topItem.source.name} — you draw a card`);
        } else {
          addLog(`${topItem.source.name} — library is empty, you cannot draw`);
        }
      }

      if (!holdingPriority && stack.length > 2) {
        setTimeout(() => resolveStack(), 100);
      }
      return;
    }

    // Handle draw_then_discard (looting) — draw immediately, pause for discard selection
    if (topItem.effect?.type === 'draw_then_discard') {
      const drawAmount = topItem.effect.amount || 1;
      const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
      const player = newState.players.you;
      player.library = player.library || [];
      player.hand = player.hand || [];

      const actualDrawn = Math.min(drawAmount, player.library.length);
      const drawnCards = player.library.splice(0, actualDrawn);
      player.hand.push(...drawnCards);
      player.library_count = player.library.length;

      if (actualDrawn > 0) {
        addLog(`Drew ${actualDrawn} card(s): ${drawnCards.map((c: any) => c.name).join(', ')}`);
      }

      if (player.library.length === 0 && actualDrawn < drawAmount) {
        player.deckedOut = true;
        addLog('You decked out!');
      }

      // Remove from stack, update state
      setStack(prev => prev.slice(0, -1));

      // If this was a real spell card (not activated ability or ephemeral copy), put it in graveyard/exile
      if (topItem.type === 'spell') {
        const spellOwner = ((topItem.source as any).owner || 'you') as PlayerKey;
        if ((topItem.source as any)?._flashbackCast) {
          // Flashback spells go to exile when they resolve
          const owner = newState.players[spellOwner];
          owner.exile = owner.exile || [];
          owner.exile.push({ ...topItem.source } as unknown as Card);
        } else {
          pushToGraveyardOrExile(newState, newState.players[spellOwner], { ...topItem.source } as unknown as Card);
        }
      }

      setGameState(newState);

      // Fire draw triggers
      if (actualDrawn > 0) {
        newState._youCardsDrawn = actualDrawn;
        // Miracle check must happen before incrementing the turn counter.
        checkMiracleOnFirstDraw(drawnCards as Card[]);
        const newTotal = youCardsDrawnThisTurn + actualDrawn;
        setYouCardsDrawnThisTurn(newTotal);
        for (let i = youCardsDrawnThisTurn + 1; i <= newTotal; i++) {
          const drawTriggers = checkTriggersForEvent('card_drawn', {
            player: 'you' as const, amountDrawn: actualDrawn, totalDrawnThisTurn: i
          }, newState);
          drawTriggers.forEach((t: StackItem) => addToStack(t));
        }
      }

      // Enter discard selection (if drew successfully)
      if (actualDrawn > 0 && !player.deckedOut) {
        setDiscardSelectionState({ count: drawAmount, reason: topItem.source.name });
      }
      return;
    }

    // Handle opus — draw 1, then discard 1 unless 5+ mana was spent
    if (topItem.effect?.type === 'opus') {
      const manaSpent: number = topItem.effect.manaSpent ?? 0;
      const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
      const player = newState.players.you;
      player.library = player.library || [];
      player.hand = player.hand || [];

      // Draw 1 card
      if (player.library.length === 0) {
        player.deckedOut = true;
        addLog(`${topItem.source.name}'s opus: Tried to draw from an empty library. DEFEAT!`);
        setStack(prev => prev.slice(0, -1));
        setGameState(newState);
        return;
      }
      const drawnCard = player.library.splice(0, 1)[0];
      player.hand.push(drawnCard);
      player.library_count = player.library.length;

      // Remove from stack, update state
      setStack(prev => prev.slice(0, -1));
      setGameState(newState);

      // Fire draw triggers
      newState._youCardsDrawn = 1;
      checkMiracleOnFirstDraw([drawnCard as Card]);
      const newTotal = youCardsDrawnThisTurn + 1;
      setYouCardsDrawnThisTurn(newTotal);
      const drawTriggers = checkTriggersForEvent('card_drawn', {
        player: 'you' as const, amountDrawn: 1, totalDrawnThisTurn: newTotal
      }, newState);
      drawTriggers.forEach((t: StackItem) => addToStack(t));

      if (manaSpent >= 5) {
        addLog(`${topItem.source.name}'s opus: Drew ${drawnCard.name}. (${manaSpent} mana spent — no discard needed)`);
        if (!holdingPriority) {
          const remaining = stack.length - 1;
          if (remaining > 0) setTimeout(() => resolveStack(), 100);
        }
      } else {
        addLog(`${topItem.source.name}'s opus: Drew ${drawnCard.name}. (${manaSpent} mana spent — discard 1)`);
        setDiscardSelectionState({ count: 1, reason: `${topItem.source.name}'s opus` });
      }
      return;
    }

    // Handle modal_spell (Kolaghan's Command etc.) — execute each chosen mode's effect
    if (topItem.effect?.type === 'modal_spell') {
      let newState = JSON.parse(JSON.stringify(gameState)) as GameState;
      const resolvedModes = (topItem.effect as any).modes as Array<{ effect: Effect; targeting_data: any; description: string }>;

      for (const mode of resolvedModes) {
        // Create a temporary stack item per mode for the effect handler
        const tempItem: StackItem = {
          ...topItem,
          effect: mode.effect,
          targeting_data: mode.targeting_data || null,
        };

        // player_choice_discard needs special handling (opponent auto-discards in puzzles)
        if (mode.effect.type === 'player_choice_discard') {
          const targetOwner = (mode.targeting_data?.targetData?.owner || 'opponent') as PlayerKey;
          const count = mode.effect.count || 1;
          if (targetOwner === 'opponent') {
            const targetPlayer = newState.players[targetOwner];
            const hand = targetPlayer.hand || [];
            if (hand.length === 0) {
              addLog("Opponent's hand is empty — nothing to discard.");
            } else {
              const actualCount = Math.min(count, hand.length);
              const shuffled = [...hand].sort(() => Math.random() - 0.5);
              const discarded = shuffled.slice(0, actualCount);
              for (const card of discarded) {
                targetPlayer.hand = targetPlayer.hand.filter(
                  (c: any) => c.instance_id !== (card as any).instance_id
                );
                pushToGraveyardOrExile(newState, targetPlayer, card);
                addLog(`Opponent discards ${card.name}.`);
              }
            }
          } else {
            // You discard — handled by existing UI after resolution
            addLog(`${topItem.source.name}: You discard a card.`);
            // TODO: Open discard selection for modal sub-effect if targeting yourself
          }
          continue;
        }

        newState = applyEffect(tempItem, newState, { addLog });
      }

      // Pop stack, move spell to graveyard
      setStack(prev => prev.slice(0, -1));
      const spellOwner = ((topItem.source as any).owner || 'you') as PlayerKey;
      pushToGraveyardOrExile(newState, newState.players[spellOwner], { ...topItem.source });
      setGameState(newState);
      return;
    }

    // Handle tutor — search library for a card
    if (topItem.effect?.type === 'tutor' && !topItem.targeting_data) {
      const owner = ((topItem.source as any).owner || 'you') as PlayerKey;
      const library = gameState.players[owner].library || [];

      // Apply filter if present (e.g., Spellseeker: instant/sorcery CMC ≤ 2)
      const filter = topItem.effect.filter;
      const validCards = filter
        ? library.filter((card: any) => {
            const typeLine = (card.type_line || '').toLowerCase();
            if (filter.type === 'instant_or_sorcery') {
              if (!typeLine.includes('instant') && !typeLine.includes('sorcery')) return false;
            }
            if (filter.type === 'typed_cycling') {
              // Typed cycling: match land subtypes or card types
              // e.g., "island" matches "Basic Land — Island", "Land — Island Swamp"
              // "basic land" matches any "Basic Land — ..."
              // "creature" matches any creature card, "artifact" matches artifact, etc.
              const searchType = (filter.typedCyclingType || '').toLowerCase();
              if (searchType === 'basic land') {
                if (!typeLine.includes('basic') || !typeLine.includes('land')) return false;
              } else {
                // Check both type line and subtypes (after the dash)
                // "island" should match "Land — Island" or "Basic Land — Island"
                if (!typeLine.includes(searchType)) return false;
              }
            }
            if (filter.maxCmc !== undefined) {
              const cmc = calculateCMC(card.mana_cost || '');
              if (cmc > filter.maxCmc) return false;
            }
            if (filter.exactCmc !== undefined) {
              const cmc = calculateCMC(card.mana_cost || '');
              if (cmc !== filter.exactCmc) return false;
            }
            return true;
          })
        : [...library];

      if (validCards.length === 0) {
        addLog('No valid cards found in library.');
        setStack(prev => prev.slice(0, -1));
        if (topItem.type === 'spell') {
          const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
          const spellOwner = ((topItem.source as any).owner || 'you') as PlayerKey;
          pushToGraveyardOrExile(newState, newState.players[spellOwner], { ...topItem.source });
          setGameState(newState);
        }
        return;
      }

      setTutorSelectionState({
        cards: validCards,
        allCards: library,
        filter: filter,
        reason: topItem.source.name,
        destination: topItem.effect.destination || 'hand',
        stackItemId: topItem.id,
        isSpellEffect: topItem.type === 'spell',
      });
      return; // Wait for player selection
    }

    // Handle tutor resolution (card already selected)
    if (topItem.effect?.type === 'tutor' && topItem.targeting_data) {
      const newState = applyEffect(topItem, gameState, { addLog });
      setStack(prev => prev.slice(0, -1));
      if (topItem.type === 'spell') {
        const spellOwner = ((topItem.source as any).owner || 'you') as PlayerKey;
        pushToGraveyardOrExile(newState, newState.players[spellOwner], { ...topItem.source });
      }
      setGameState(newState);
      return;
    }

    // Handle scry/surveil — look at top cards, choose placement
    if ((topItem.effect?.type === 'scry' || topItem.effect?.type === 'surveil') && !topItem.targeting_data) {
      const isSurveil = topItem.effect.type === 'surveil';
      const mechName = isSurveil ? 'Surveil' : 'Scry';
      const owner = ((topItem.source as any).owner || 'you') as PlayerKey;
      const library = gameState.players[owner].library || [];
      const amount = topItem.effect.amount || 1;
      const cardsToLook = library.slice(0, amount);

      if (cardsToLook.length === 0) {
        addLog(`${topItem.source.name}: Library is empty, nothing to ${mechName.toLowerCase()}.`);
        setStack(prev => prev.slice(0, -1));
        // Still handle then_draw
        if (topItem.effect.then_draw) {
          const drawItem = { ...topItem, effect: { ...topItem.effect, type: 'draw_cards' as const, amount: topItem.effect.then_draw } };
          const newState = applyEffect(drawItem, gameState, { addLog });
          if (topItem.type === 'spell') {
            const spellOwner = ((topItem.source as any).owner || 'you') as PlayerKey;
            pushToGraveyardOrExile(newState, newState.players[spellOwner], { ...topItem.source });
          }
          setGameState(newState);
        } else if (topItem.type === 'spell') {
          const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
          const spellOwner = ((topItem.source as any).owner || 'you') as PlayerKey;
          pushToGraveyardOrExile(newState, newState.players[spellOwner], { ...topItem.source });
          setGameState(newState);
        }
        return;
      }

      // Remove cards from library temporarily (completeScrySelection will put them back)
      const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
      const ownerPlayer = newState.players[owner];
      ownerPlayer.library = ownerPlayer.library.slice(amount);
      ownerPlayer.library_count = ownerPlayer.library.length;
      setGameState(newState);

      setScrySelectionState({
        cards: cardsToLook,
        bottomCards: [],
        reason: topItem.source.name,
        stackItemId: topItem.id,
        thenDraw: topItem.effect.then_draw,
        mode: isSurveil ? 'surveil' : 'scry',
      });
      addLog(`${topItem.source.name}: ${mechName} ${cardsToLook.length} — look at top card${cardsToLook.length !== 1 ? 's' : ''} of your library.`);
      return; // Wait for player selection
    }

    // look_take_filtered_bottom (Narset, Parter of Veils -2): look at top N, may take
    // one matching filter to hand, rest to bottom in random order.
    if (topItem.effect?.type === 'look_take_filtered_bottom' && !(topItem as any)._lookTakeStarted) {
      const owner = ((topItem.source as any).owner || 'you') as PlayerKey;
      const lookCount = topItem.effect.look_count ?? 4;
      const filter = topItem.effect.filter as { exclude_types?: string[] } | undefined;
      const library = gameState.players[owner].library || [];
      const cardsToLook = library.slice(0, lookCount);

      if (cardsToLook.length === 0) {
        addLog(`${topItem.source.name}: Library is empty.`);
        setStack(prev => prev.slice(0, -1));
        return;
      }

      // Remove from library and mark stack item as started so we don't re-enter.
      const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
      newState.players[owner].library = newState.players[owner].library.slice(cardsToLook.length);
      newState.players[owner].library_count = newState.players[owner].library.length;
      setGameState(newState);
      setStack(prev => prev.map(it => it.id === topItem.id ? ({ ...it, _lookTakeStarted: true } as any) : it));

      setLookTakeState({
        cards: cardsToLook as Card[],
        filter,
        reason: topItem.source.name,
        stackItemId: topItem.id,
        ownerKey: owner,
      });
      addLog(`${topItem.source.name}: looking at top ${cardsToLook.length} card${cardsToLook.length !== 1 ? 's' : ''} of library.`);
      return;
    }

    // Handle targeted_discard (Thoughtseize/Duress) — reveal hand, caster picks a card
    if (topItem.effect?.type === 'targeted_discard') {
      const targetOwner = (topItem.targeting_data?.targetData?.owner || 'opponent') as PlayerKey;
      const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
      const targetHand = [...newState.players[targetOwner].hand];

      // Remove from stack
      setStack(prev => prev.slice(0, -1));

      // Put spell in graveyard
      if (topItem.type === 'spell') {
        const spellOwner = ((topItem.source as any).owner || 'you') as PlayerKey;
        pushToGraveyardOrExile(newState, newState.players[spellOwner], { ...topItem.source });
      }

      setGameState(newState);

      if (targetHand.length === 0) {
        addLog(`${targetOwner === 'you' ? 'Your' : "Opponent's"} hand is empty — nothing to discard.`);
        // Apply life loss even if hand is empty
        if (topItem.effect.life_loss) {
          setGameState(prev => {
            if (!prev) return prev;
            const s = JSON.parse(JSON.stringify(prev)) as GameState;
            s.players.you.life -= topItem.effect.life_loss;
            return s;
          });
          addLog(`You lose ${topItem.effect.life_loss} life. (Life: ${newState.players.you.life - topItem.effect.life_loss})`);
        }
        return;
      }

      addLog(`${topItem.source.name}: ${targetOwner === 'you' ? 'Your' : "Opponent's"} hand is revealed. Choose a card to discard.`);
      setTargetedDiscardState({
        targetPlayer: targetOwner,
        cards: targetHand,
        filter: topItem.effect.filter,
        reason: topItem.source.name,
        life_loss: topItem.effect.life_loss,
      });
      return;
    }

    // Handle player_choice_discard (Mind Rot) — target player chooses cards to discard
    if (topItem.effect?.type === 'player_choice_discard') {
      const targetOwner = (topItem.targeting_data?.targetData?.owner || 'opponent') as PlayerKey;
      const count = topItem.effect.count || 1;
      const newState = JSON.parse(JSON.stringify(gameState)) as GameState;

      // Remove from stack
      setStack(prev => prev.slice(0, -1));

      // Put spell in graveyard
      if (topItem.type === 'spell') {
        const spellOwner = ((topItem.source as any).owner || 'you') as PlayerKey;
        pushToGraveyardOrExile(newState, newState.players[spellOwner], { ...topItem.source });
      }

      setGameState(newState);

      if (targetOwner === 'you') {
        // Player chooses — reuse existing discard selection UI
        const handSize = newState.players.you.hand.length;
        if (handSize === 0) {
          addLog('Your hand is empty — nothing to discard.');
          return;
        }
        const actualCount = Math.min(count, handSize);
        setDiscardSelectionState({ count: actualCount, reason: topItem.source.name, targetPlayer: 'you' });
        addLog(`${topItem.source.name}: Choose ${actualCount} card(s) to discard.`);
      } else {
        // Opponent "chooses" — auto-discard randomly (AI doesn't make choices in puzzles)
        const targetPlayer = newState.players[targetOwner];
        const hand = targetPlayer.hand || [];
        if (hand.length === 0) {
          addLog("Opponent's hand is empty — nothing to discard.");
          return;
        }
        const actualCount = Math.min(count, hand.length);
        const shuffled = [...hand].sort(() => Math.random() - 0.5);
        const discarded = shuffled.slice(0, actualCount);
        setGameState(prev => {
          if (!prev) return prev;
          const s = JSON.parse(JSON.stringify(prev)) as GameState;
          const tp = s.players[targetOwner];
          for (const card of discarded) {
            tp.hand = tp.hand.filter((c: any) => c.instance_id !== (card as any).instance_id);
            pushToGraveyardOrExile(s, tp, card);
          }
          return s;
        });
        discarded.forEach((card: any) => {
          addLog(`Opponent discards ${card.name}.`);
        });
      }
      return;
    }

    // Handle attach_aura — check target validity (fizzle if gone), then attach to battlefield.
    // Auras do NOT go to graveyard on resolution — they stay on battlefield as permanents.
    if (topItem.effect?.type === 'attach_aura') {
      const targetData = topItem.targeting_data?.targetData;
      const targetOwner = ((targetData as any)?.owner || 'opponent') as PlayerKey;
      const targetInstanceId = (targetData as any)?.instance_id;
      const targetStillOnBattlefield = !!(gameState.players[targetOwner]?.battlefield || []).find(
        (c: any) => c.instance_id === targetInstanceId
      );

      setStack(prev => prev.slice(0, -1));

      if (!targetStillOnBattlefield) {
        // Fizzle — enchanted permanent left the battlefield, aura goes to graveyard
        const auraOwner = ((topItem.source as any).owner || 'you') as PlayerKey;
        setGameState(prev => {
          if (!prev) return prev;
          const s = JSON.parse(JSON.stringify(prev)) as GameState;
          pushToGraveyardOrExile(s, s.players[auraOwner], { ...topItem.source });
          return s;
        });
        addLog(`${(topItem.source as any).name} fizzles — enchanted permanent is no longer on the battlefield.`);
      } else {
        // Attach aura to battlefield — applyAttachAura logs the message
        const newState = applyEffect(topItem, gameState, { addLog });
        setGameState(newState);
      }

      // Only schedule further resolution if there are items below this one on the stack.
      // An unconditional setTimeout here causes a stale-closure loop when the aura is
      // the sole remaining item (the resolveStack closure captures a stale stack).
      if (!holdingPriority && stack.length > 1) {
        setTimeout(() => resolveStack(), 100);
      }
      return;
    }

    // Apply effect
    let newState = applyEffect(topItem, gameState, { addLog });

    // Process additional effects (e.g., Bake into a Pie: destroy + create token)
    if (topItem.effect?.additional_effects) {
      for (const addlEffect of topItem.effect.additional_effects) {
        const tempItem = { ...topItem, effect: addlEffect };
        newState = applyEffect(tempItem, newState, { addLog });
      }
    }

    // Banishing Light post-resolution check: if the source permanent that just exiled
    // something is no longer on the battlefield (destroyed in response), the "until"
    // clause is already met — return the exiled card immediately.
    if (topItem.effect?.type === 'exile_until_leaves') {
      const sourceId = topItem.source.instance_id;
      if (sourceId) {
        const allBF = [...newState.players.you.battlefield, ...newState.players.opponent.battlefield];
        const sourceStillOnBF = allBF.some(p => p.instance_id === sourceId);
        if (!sourceStillOnBF && newState.exiledUnder?.[sourceId]) {
          const exiledCards = newState.exiledUnder[sourceId];
          exiledCards.forEach(({ card, owner }: { card: any; owner: PlayerKey }) => {
            const ownerPlayer = newState.players[owner];
            ownerPlayer.exile = (ownerPlayer.exile || []).filter(
              (c: any) => c.instance_id !== card.instance_id
            );
            const isCreature = (card.type_line || '').toLowerCase().includes('creature');
            const { exileReason, exiledByInstanceId, _dashed, ...cleanCard } = card;
            const returned: Permanent = {
              ...cleanCard,
              tapped: false,
              summoning_sick: isCreature,
              counters: {} as Record<string, number>,
              attacking: false,
            };
            ownerPlayer.battlefield.push(returned);
            addLog(`${card.name} returns to the battlefield (${topItem.source.name} already left).`);
            const flickeredArr = newState._flickeredPermanents = newState._flickeredPermanents || [];
            flickeredArr.push({ permanent: returned, owner });
          });
          delete newState.exiledUnder[sourceId];
        }
      }
    }

    // Remove from stack
    setStack(prev => prev.slice(0, -1));

    // Put resolved instant/sorcery spells into their caster's graveyard
    // Note: spell_copy items are ephemeral copies (from Twincast/Storm) — not real cards, don't go to graveyard
    // Note: attach_self_as_aura spells (Animate Dead) stay on the battlefield as auras
    const isSpellCard = topItem.type === 'spell';
    const attachedSelfAsAura = topItem.effect?.attach_self_as_aura;
    if (isSpellCard && topItem.source && !attachedSelfAsAura) {
      const spellOwner = ((topItem.source as any).owner || 'you') as PlayerKey;
      const cardForGraveyard = { ...topItem.source } as unknown as Card;
      if ((topItem as any).wasBuyback && !newState._fizzled) {
        // Buyback spells return to hand when they resolve (not if fizzled)
        const ownerPlayer = newState.players[spellOwner];
        ownerPlayer.hand = ownerPlayer.hand || [];
        // Strip transient flags before returning to hand
        const { _kicked, _evidenceCollected, _buyback, ...cleanCard } = cardForGraveyard as any;
        ownerPlayer.hand.push(cleanCard as Card);
        addLog(`${cardForGraveyard.name} returns to hand (buyback).`);
        newState = { ...newState };
      } else if ((topItem.source as any)?._flashbackCast) {
        // Flashback spells go to exile when they resolve
        const ownerPlayer = newState.players[spellOwner];
        ownerPlayer.exile = ownerPlayer.exile || [];
        ownerPlayer.exile.push(cardForGraveyard);
        newState = { ...newState };
      } else {
        newState = {
          ...newState,
          players: {
            ...newState.players,
            [spellOwner]: {
              ...newState.players[spellOwner],
              ...graveyardZones(cardForGraveyard, newState.players[spellOwner], newState)
            }
          }
        };
      }
    }

    // Yawgmoth's Will timing: the spell itself goes to the graveyard first (above),
    // THEN the exile replacement activates for all subsequent cards.
    if (topItem.effect?.type === 'yawgmoths_will') {
      const ywOwner = ((topItem.source as any).owner || 'you') as PlayerKey;
      (newState.players[ywOwner] as any).graveyardGoesToExile = true;
    }

    setGameState(newState);

    // Check for triggers based on what happened
    let allTriggers: StackItem[] = [];

    // Check for specific event triggers based on effect type
    if (topItem.effect?.type === 'enter_battlefield') {
      // Creature entered the battlefield - check for ETB triggers
      const creature = topItem.effect.creature || topItem.source;
      const etbTriggers = checkTriggersForEvent('creature_entered', {
        creature,
        wasEvoked: topItem.wasEvoked || false,
        wasKicked: topItem.wasKicked || !!(creature as any)._kicked || false,
        wasEvidenceCollected: (topItem as any).wasEvidenceCollected || !!(creature as any)._evidenceCollected || false,
      }, newState);
      etbTriggers.forEach(trigger => {
        if (trigger.effect?.type === 'modal_choice') {
          setModalTriggerChoice({ trigger, modes: trigger.effect.modes || [] });
        } else {
          allTriggers.push(trigger);
        }
      });
    } else if (topItem.effect?.type === 'enter_battlefield_permanent') {
      // Non-creature permanent entered — check for ETB triggers on the permanent itself
      const permanent = topItem.effect.permanent || topItem.source;
      const etbTriggers = checkTriggersForEvent('creature_entered', {
        creature: permanent,
        wasEvoked: false
      }, newState);
      etbTriggers.forEach(trigger => allTriggers.push(trigger));

      // Animate Dead-style: enchantment with attach_self_as_aura creates an ETB reanimate trigger
      if ((permanent as any).spell_effect?.attach_self_as_aura && topItem.targeting_data) {
        allTriggers.push({
          id: `reanimate-aura-etb-${(permanent as any).instance_id}-${Date.now()}`,
          type: 'triggered_ability' as const,
          source: { ...(permanent as any), owner: 'you' } as any,
          effect: {
            type: 'reanimate_creature',
            attach_self_as_aura: true,
          } as any,
          requires_input: false,
          targeting_data: topItem.targeting_data,
          resolved: false,
          timestamp: Date.now(),
        } as StackItem);
      }
    } else if (topItem.effect?.type === 'reanimate_creature') {
      // Reanimated creature entered the battlefield — fire ETB triggers
      const creature = topItem.targeting_data?.targetData || topItem.effect.creature;
      if (creature) {
        const etbTriggers = checkTriggersForEvent('creature_entered', {
          creature,
          wasEvoked: false
        }, newState);
        etbTriggers.forEach(trigger => {
          if (trigger.effect?.type === 'modal_choice') {
            setModalTriggerChoice({ trigger, modes: trigger.effect.modes || [] });
          } else {
            allTriggers.push(trigger);
          }
        });
      }
    } else if (topItem.effect?.type === 'gain_life' || topItem.effect?.type === 'gain_life_equal_toughness') {
      // Life was gained - check for life gain triggers
      const lifeGainTriggers = checkTriggersForEvent('life_gained', {
        player: 'you',
        amount: newState._lifeGained || topItem.effect.amount || 0
      }, newState);
      allTriggers.push(...lifeGainTriggers);
    } else if (topItem.effect?.type === 'drain_life') {
      // Drain life also triggers life gain
      const lifeGainTriggers = checkTriggersForEvent('life_gained', {
        player: 'you',
        amount: topItem.effect.amount || 0
      }, newState);
      allTriggers.push(...lifeGainTriggers);
    } else if (topItem.effect?.type === 'opponent_loses_life' && (topItem.effect as any).youGain) {
      // Opponent loses life + you gain life (Falkenrath Noble) — check life gain triggers
      const lifeGainTriggers = checkTriggersForEvent('life_gained', {
        player: 'you',
        amount: newState._lifeGained || topItem.effect.amount || 0
      }, newState);
      allTriggers.push(...lifeGainTriggers);
    }

    // Check for creature token ETB triggers (Soul Warden, etc.)
    if (topItem.effect?.type === 'create_token') {
      const tokenDef = topItem.effect.token || {};
      const tokenCount = topItem.effect.count || 1;
      const tokenTriggers = checkTriggersForEvent('token_entered', {
        token: tokenDef,
        tokenCount
      }, newState);
      allTriggers.push(...tokenTriggers);
    }

    // Check for card draw triggers
    if (topItem.effect?.type === 'draw_cards' || topItem.effect?.type === 'each_player_draws') {
      const youDrawn = newState._youCardsDrawn || 0;
      const oppDrawn = newState._opponentCardsDrawn || 0;
      if (youDrawn > 0) {
        // Miracle: the first card drawn this turn may be cast for its miracle cost.
        // applyDrawCards pushes drawn cards to the end of hand, so inspect the tail.
        const drawnCards = (newState.players.you.hand || []).slice(-youDrawn) as Card[];
        checkMiracleOnFirstDraw(drawnCards);
        const newTotal = youCardsDrawnThisTurn + youDrawn;
        setYouCardsDrawnThisTurn(newTotal);
        for (let i = youCardsDrawnThisTurn + 1; i <= newTotal; i++) {
          allTriggers.push(...checkTriggersForEvent('card_drawn', {
            player: 'you' as const, amountDrawn: youDrawn, totalDrawnThisTurn: i
          }, newState));
        }
      }
      if (oppDrawn > 0) {
        const newTotal = opponentCardsDrawnThisTurn + oppDrawn;
        setOpponentCardsDrawnThisTurn(newTotal);
        for (let i = opponentCardsDrawnThisTurn + 1; i <= newTotal; i++) {
          allTriggers.push(...checkTriggersForEvent('card_drawn', {
            player: 'opponent' as const, amountDrawn: oppDrawn, totalDrawnThisTurn: i
          }, newState));
        }
      }
    }

    // Check for death triggers from effects that killed creatures
    if (newState._dyingCreatures && newState._dyingCreatures.length > 0) {
      newState._dyingCreatures.forEach((death: { creature: Permanent; owner: PlayerKey }) => {
        // Always dispatch death triggers (other permanents see this creature die)
        const deathTriggers = checkTriggersForEvent('creature_died', {
          creature: death.creature,
          owner: death.owner
        }, newState);
        allTriggers.push(...deathTriggers);

        // Check persist: return to battlefield with -1/-1 counter if no -1/-1 counters
        const hasPersist = death.creature.keywords?.includes('persist');
        const hasMinusCounters = (death.creature.counters?.['-1/-1'] || 0) > 0;
        if (hasPersist && !hasMinusCounters) {
          // Remove from owner's graveyard (where pushToGraveyardOrExile routed it)
          const ownerKey = ((death.creature as any).cardOwner || death.owner) as PlayerKey;
          const ownerPlayer = newState.players[ownerKey];
          ownerPlayer.graveyard = (ownerPlayer.graveyard || []).filter(c => c.instance_id !== death.creature.instance_id);
          const returned = {
            ...death.creature, tapped: false, summoning_sick: true,
            counters: { ...(death.creature.counters || {}), '-1/-1': 1 },
            attacking: false,
          };
          // Persist returns to the controller's battlefield (death.owner)
          const controllerPlayer = newState.players[death.owner];
          controllerPlayer.battlefield.push(returned);
          addLog(`${death.creature.name} returns to the battlefield with a -1/-1 counter (persist).`);
          const etbTriggers = checkTriggersForEvent('creature_entered', {
            creature: returned, wasEvoked: false
          }, newState);
          etbTriggers.forEach(trigger => {
            if (trigger.effect?.type === 'modal_choice') {
              setModalTriggerChoice({ trigger, modes: trigger.effect.modes || [] });
            } else {
              allTriggers.push(trigger);
            }
          });
        }
      });
    }

    // Check for permanent-leaves triggers (Super Shredder, etc.)
    if (newState._leavingPermanents && newState._leavingPermanents.length > 0) {
      newState._leavingPermanents.forEach((leaving: { permanent: Permanent; owner: PlayerKey }) => {
        // Revolt: any permanent leaving your battlefield arms it for the rest of the turn.
        if (leaving.owner === 'you') newState._yourPermanentLeftThisTurn = true;
        const leavesTriggers = checkTriggersForEvent('permanent_left', {
          permanent: leaving.permanent,
          owner: leaving.owner
        }, newState);
        allTriggers.push(...leavesTriggers);

        // Check the leaving permanent's OWN leaves_battlefield triggers (Animate Dead)
        const leavingAbilities = (leaving.permanent as any).triggered_abilities;
        if (leavingAbilities) {
          leavingAbilities.forEach((ability: any) => {
            if (matchesTriggerEvent(ability, 'leaves_battlefield')) {
              allTriggers.push({
                id: `perm-lbt-${leaving.permanent.instance_id}-${Date.now()}-${Math.random()}`,
                type: 'triggered_ability' as const,
                source: {
                  instance_id: leaving.permanent.instance_id,
                  card_id: leaving.permanent.card_id,
                  name: leaving.permanent.name,
                  owner: leaving.owner,
                  attachedTo: (leaving.permanent as any).attachedTo,
                } as any,
                effect: ability.effect,
                requires_input: false,
                targeting_data: null,
                resolved: false,
                timestamp: Date.now(),
              } as StackItem);
            }
          });
        }

        // If the leaving permanent is a land, also fire land_to_graveyard (Dingus Egg)
        if ((leaving.permanent.type_line || '').toLowerCase().includes('land')) {
          const landTriggers = checkTriggersForEvent('land_to_graveyard', {
            land: leaving.permanent,
            owner: leaving.owner
          }, newState);
          allTriggers.push(...landTriggers);
        }

        // Check if the leaving permanent had cards exiled under it.
        // Only immediately return cards with exileReason 'until_leaves' (Banishing Light).
        // Cards with exileReason 'under_permanent' (O-Ring) are returned by their own
        // LTB triggered ability (above), which goes on the stack.
        const exiledUnderMap = newState.exiledUnder || {};
        const exiledCards = exiledUnderMap[leaving.permanent.instance_id];
        if (exiledCards && exiledCards.length > 0) {
          const immediateReturns = exiledCards.filter(({ card }) => (card as any).exileReason === 'until_leaves');
          if (immediateReturns.length > 0) {
            immediateReturns.forEach(({ card, owner }) => {
              // Remove from exile
              const ownerPlayer = newState.players[owner];
              ownerPlayer.exile = (ownerPlayer.exile || []).filter(
                (c: any) => c.instance_id !== (card as any).instance_id
              );
              // Return to battlefield under owner's control with fresh state
              const isCreature = (card.type_line || '').toLowerCase().includes('creature');
              const { exileReason, exiledByInstanceId, _dashed, ...cleanCard } = card as any;
              const returned: Permanent = {
                ...cleanCard,
                tapped: false,
                summoning_sick: isCreature,
                counters: {} as Record<string, number>,
                attacking: false,
              };
              ownerPlayer.battlefield.push(returned);
              addLog(`${card.name} returns to the battlefield (${leaving.permanent.name} left).`);
              // Track for ETB triggers
              const flickeredArr = newState._flickeredPermanents = newState._flickeredPermanents || [];
              flickeredArr.push({ permanent: returned, owner });
            });
            // Remove returned cards from the exiledUnder list, keep O-Ring ones for LTB trigger
            const remaining = exiledCards.filter(({ card }) => (card as any).exileReason !== 'until_leaves');
            if (remaining.length === 0) {
              delete exiledUnderMap[leaving.permanent.instance_id];
            } else {
              exiledUnderMap[leaving.permanent.instance_id] = remaining;
            }
          }
        }
      });
    }

    // Sacrifice triggers — Mayhem Devil, Cruel Celebrant, Disciple of the
    // Vault, etc. Driven by _sacrificedPermanents (populated by effects like
    // opponent_sacrifice). Fires permanent_sacrificed + creature_sacrificed
    // (the latter only if the permanent was a creature).
    if (newState._sacrificedPermanents && newState._sacrificedPermanents.length > 0) {
      newState._sacrificedPermanents.forEach((sac: { permanent: Permanent; owner: PlayerKey }) => {
        const permSacTriggers = checkTriggersForEvent('permanent_sacrificed', {
          permanent: sac.permanent,
          owner: sac.owner,
        }, newState);
        allTriggers.push(...permSacTriggers);
        if ((sac.permanent.type_line || '').toLowerCase().includes('creature')) {
          const creatureSacTriggers = checkTriggersForEvent('creature_sacrificed', {
            creature: sac.permanent,
            owner: sac.owner,
          }, newState);
          allTriggers.push(...creatureSacTriggers);
        }
      });
    }

    // Check for ETB triggers from flickered permanents (Flicker, etc.)
    if (newState._flickeredPermanents && newState._flickeredPermanents.length > 0) {
      newState._flickeredPermanents.forEach(({ permanent }: { permanent: Permanent; owner: PlayerKey }) => {
        const isCreature = (permanent.type_line || '').toLowerCase().includes('creature');
        if (isCreature) {
          const etbTriggers = checkTriggersForEvent('creature_entered', {
            creature: permanent, wasEvoked: false
          }, newState);
          etbTriggers.forEach(trigger => {
            if (trigger.effect?.type === 'modal_choice') {
              setModalTriggerChoice({ trigger, modes: trigger.effect.modes || [] });
            } else {
              allTriggers.push(trigger);
            }
          });
        }
      });
    }

    // Clear tracking properties so they don't persist across resolutions
    delete newState._dyingCreatures;
    delete newState._leavingPermanents;
    delete newState._sacrificedPermanents;
    delete newState._flickeredPermanents;
    delete newState._fizzled;

    // Add all triggers to stack
    batchAndOrderTriggers(allTriggers);

    // Legend rule: check for duplicate legendary permanents after ETB
    if (topItem.effect?.type === 'enter_battlefield' || topItem.effect?.type === 'enter_battlefield_permanent') {
      const enteringCard = topItem.effect.permanent || topItem.effect.creature;
      if (enteringCard && (enteringCard.type_line || '').toLowerCase().includes('legendary')) {
        const legendName = enteringCard.name;
        const duplicates = newState.players.you.battlefield.filter(
          (c: any) => c.name === legendName
        );
        if (duplicates.length > 1) {
          addLog(`Legend rule: you control multiple copies of ${legendName}. Choose one to keep.`);
          setLegendRuleState({ legendaryName: legendName, duplicates: duplicates as Permanent[] });
          return;
        }
      }
    }
  }, [gameState, stack, addLog, addToStack, youCardsDrawnThisTurn, opponentCardsDrawnThisTurn]);

  // Keep the resolveStack ref fresh so the madness drain-resume effect can call
  // the latest version without creating a TDZ cycle in its deps array.
  useEffect(() => {
    resolveStackRef.current = resolveStack;
  }, [resolveStack]);

  // State-based action: tokens cease to exist in any zone other than the battlefield.
  // They do enter the graveyard (triggering death effects via _dyingCreatures), but are
  // immediately removed as a state-based action.
  useEffect(() => {
    if (!gameState) return;
    let needsCleanup = false;
    for (const playerKey of ['you', 'opponent'] as PlayerKey[]) {
      const player = gameState.players[playerKey];
      if ((player.graveyard || []).some((c: any) => c.isToken)) needsCleanup = true;
      if ((player.hand || []).some((c: any) => c.isToken)) needsCleanup = true;
      if ((player.exile || []).some((c: any) => c.isToken)) needsCleanup = true;
    }
    if (needsCleanup) {
      setGameState(prev => {
        if (!prev) return prev;
        const newState = JSON.parse(JSON.stringify(prev)) as GameState;
        for (const playerKey of ['you', 'opponent'] as PlayerKey[]) {
          const player = newState.players[playerKey];
          player.graveyard = (player.graveyard || []).filter((c: any) => !c.isToken);
          player.hand = (player.hand || []).filter((c: any) => !c.isToken);
          player.exile = (player.exile || []).filter((c: any) => !c.isToken);
        }
        return newState;
      });
    }
  }, [gameState]);

  // State-based action: Ascend — grant city's blessing when a permanent with ascend is on
  // the battlefield and you control 10+ permanents. Once granted, never lost.
  useEffect(() => {
    if (!gameState) return;
    const player = gameState.players.you;
    if ((player as any).hasCitysBlessing) return; // Already have it
    const hasAscendPermanent = (player.battlefield || []).some(
      (p: any) => p.keywords?.includes('ascend')
    );
    if (!hasAscendPermanent) return;
    if ((player.battlefield || []).length >= 10) {
      setGameState(prev => {
        if (!prev || (prev.players.you as any).hasCitysBlessing) return prev;
        const ns = JSON.parse(JSON.stringify(prev)) as GameState;
        (ns.players.you as any).hasCitysBlessing = true;
        return ns;
      });
      addLog("You have the city's blessing!");
    }
  }, [gameState, addLog]);

  // Auto-resolve effect: Continue resolving when in auto-resolve mode
  useEffect(() => {
    if (!holdingPriority && stack.length > 0 && !isTargeting && !xCostState && !multiTargetingState && !stormTargetingState && !copyTargetingState && !ballistaState && !modalTriggerChoice && !sacrificeMode && !manaColorSelection && !abilityMenuState && !optionalTriggerPromptState && !lookTakeState && !discardSelectionState && !payToUntapState && !counterUnlessPayState && !extortState && !triggerOrderingState && !endurePromptState && !legendRuleState && !targetedDiscardState && !triggerTargetingState && !modalSpellState && !tutorSelectionState && !scrySelectionState && !additionalCostDiscardState && !suspendCastPending) {
      // Check if the top item requires input
      const topItem = stack[stack.length - 1];
      // Effects that handle their own targeting pause inside resolveStack (e.g., grant_flashback, tutor)
      // should auto-resolve even if requires_input is true — resolveStack will set up targeting mode.
      const selfHandledInput = (topItem.effect?.type === 'grant_flashback' && !topItem.targeting_data)
        || (topItem.effect?.type === 'tutor' && !topItem.targeting_data)
        || (topItem.effect?.type === 'return_from_graveyard_to_hand' && !topItem.targeting_data)
        || (topItem.effect?.type === 'exile_until_end_step' && !topItem.targeting_data)
        || (topItem.effect?.type === 'exile_until_leaves' && !topItem.targeting_data)
        || (topItem.effect?.type === 'exile_under' && !topItem.targeting_data)
        || (topItem.effect?.type === 'deal_damage' && !topItem.targeting_data);
      if ((!topItem.requires_input || selfHandledInput) && !awaitingStackInput) {
        // Auto-resolve after a short delay
        const timer = setTimeout(() => {
          resolveStack();
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [stack, holdingPriority, isTargeting, xCostState, multiTargetingState, stormTargetingState, copyTargetingState, ballistaState, modalTriggerChoice, sacrificeMode, awaitingStackInput, resolveStack, abilityMenuState, optionalTriggerPromptState, lookTakeState, discardSelectionState, payToUntapState, counterUnlessPayState, extortState, triggerOrderingState, endurePromptState, legendRuleState, targetedDiscardState, triggerTargetingState, modalSpellState, tutorSelectionState, scrySelectionState, additionalCostDiscardState, suspendCastPending]);

  // Select a spell on the stack as the target for a copy or counter spell
  const selectStackSpellTarget = useCallback((stackItemId: string) => {
    if (!copyTargetingState || copyTargetingState.phase !== 'targeting_spell') return;

    const targetedItem = stack.find(item => item.id === stackItemId);
    const isCounter = copyTargetingState.mode === 'counter' || copyTargetingState.mode === 'counter_return' || copyTargetingState.mode === 'counter_unless_pay';

    // Validate target based on mode
    if (isCounter) {
      const spellTypes = ['spell', 'creature_spell', 'permanent_spell', 'spell_copy'];
      if (!targetedItem || !spellTypes.includes(targetedItem.type)) {
        addLog('Can only target spells');
        return;
      }
    } else {
      if (!targetedItem || targetedItem.type !== 'spell') {
        addLog('Can only target instant or sorcery spells');
        return;
      }
    }

    // Check "only your spells" restriction (Kitsa's copy ability)
    if (copyTargetingState.onlyYourSpells && (targetedItem.source as any).owner !== 'you') {
      addLog('Can only target spells you control');
      return;
    }

    const card = copyTargetingState.sourceCard!;
    const isFromActivatedAbility = copyTargetingState.isActivatedAbility;
    const effectType = isCounter
      ? (copyTargetingState.mode === 'counter_return' ? 'counter_return_to_hand'
        : copyTargetingState.mode === 'counter_unless_pay' ? 'counter_unless_pay'
        : 'counter_spell')
      : 'copy_spell';

    // Create stack item targeting the selected spell
    const stackActionItem: StackItem = {
      id: isFromActivatedAbility
        ? `ability-${effectType}-${card.card_id}-${Date.now()}`
        : `spell-${card.card_id}-${Date.now()}`,
      type: isFromActivatedAbility ? 'activated_ability' as any : 'spell' as const,
      source: { ...card, owner: 'you' } as any,
      effect: {
        type: effectType,
        ...(effectType === 'counter_unless_pay' ? { payCost: card.spell_effect?.pay_cost || '{3}' } : {})
      } as any,
      requires_input: false,
      targeting_data: {
        targetType: 'any' as const,
        targetData: {
          stackItemId,
          // Copy needs full snapshot; counter just needs source info
          ...(isCounter
            ? { targetSource: JSON.parse(JSON.stringify(targetedItem.source)) }
            : { snapshot: JSON.parse(JSON.stringify(targetedItem)) }
          )
        }
      },
      resolved: false,
      timestamp: Date.now()
    };

    addToStack(stackActionItem);
    setCopyTargetingState(null);
    addLog(`${card.name} targets ${targetedItem.source.name}`);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [copyTargetingState, stack, addLog, addToStack, holdingPriority, resolveStack]);

  // Mana management
  const tapLandForMana = useCallback((land: Permanent, manaColor: string, selfDamage?: number, manaProduced?: Record<string, number>, manaCost?: any) => {
    if (!gameState) return;

    // Check mana cost affordability
    if (manaCost) {
      const costString = manaToString(manaCost);
      const parsedCost = parseManaCost(costString);
      if (!canAffordCost(parsedCost, gameState.players.you.mana_pool)) {
        addLog(`Can't afford to activate ${land.name}`);
        return;
      }
    }

    setGameState(prev => {
      if (!prev) return prev;
      const newBattlefield = prev.players.you.battlefield.map(c =>
        c.instance_id === land.instance_id ? { ...c, tapped: true } : c
      );

      let manaPool = { ...prev.players.you.mana_pool };

      // Pay mana cost if required (Signets etc.)
      if (manaCost) {
        const costString = manaToString(manaCost);
        const parsedCost = parseManaCost(costString);
        manaPool = spendMana(manaPool, parsedCost);
      }

      // Add produced mana
      if (manaProduced) {
        Object.entries(manaProduced).forEach(([color, amount]) => {
          manaPool[color] = (manaPool[color] || 0) + (amount as number);
        });
      } else {
        manaPool[manaColor] = (manaPool[manaColor] || 0) + 1;
      }

      const newLife = selfDamage ? prev.players.you.life - selfDamage : prev.players.you.life;

      return {
        ...prev,
        players: {
          ...prev.players,
          you: {
            ...prev.players.you,
            battlefield: newBattlefield,
            mana_pool: manaPool,
            life: newLife
          }
        }
      };
    });

    const manaLabel = manaProduced
      ? Object.entries(manaProduced).map(([c, a]) => `{${c}}`.repeat(a as number)).join('')
      : `{${manaColor}}`;
    addLog(`Tapped ${land.name} for ${manaLabel}${selfDamage ? ` (${selfDamage} damage to you)` : ''}`);
  }, [gameState, addLog]);

  // Helper: check if a nonbasic-lands-become effect is active (Blood Moon, Harbinger).
  // Returns the land_type of the most recently played source, or null.
  // When multiple sources exist, the last one to enter the battlefield wins
  // (later entries in the battlefield array = more recently played).
  const getNonbasicLandOverride = useCallback((): string | null => {
    if (!gameState) return null;
    const allPerms = [
      ...(gameState.players.you.battlefield || []),
      ...(gameState.players.opponent.battlefield || []),
    ];
    let lastLandType: string | null = null;
    for (const perm of allPerms) {
      const statics = (perm as any).static_abilities || [];
      for (const sa of statics) {
        if (sa.effect?.type === 'nonbasic_lands_become') {
          lastLandType = sa.effect.land_type;
        }
      }
    }
    return lastLandType;
  }, [gameState]);

  const getLandManaAbilitiesWrapper = useCallback((land: Permanent): ManaAbility[] => {
    // Blood Moon / Harbinger of the Seas: nonbasic lands lose all abilities
    // and become Mountains (R) or Islands (U) respectively.
    const landIsNonbasic = !(land as any).isBasic &&
      !land.type_line?.toLowerCase().match(/\bbasic\b/);
    if (landIsNonbasic) {
      const override = getNonbasicLandOverride();
      if (override === 'mountain') return [{ mana: 'R', label: '{R}' }];
      if (override === 'island') return [{ mana: 'U', label: '{U}' }];
    }
    return getLandManaAbilities(land);
  }, [getNonbasicLandOverride]);

  // Combat
  const toggleAttacker = useCallback((instanceId: string) => {
    setDeclaredAttackers(prev => {
      const next = prev.includes(instanceId)
        ? prev.filter(id => id !== instanceId)
        : [...prev, instanceId];
      // Drop any saved target when removing an attacker.
      if (!next.includes(instanceId)) {
        setAttackerTargetsState(t => {
          const { [instanceId]: _drop, ...rest } = t;
          return rest;
        });
      }
      return next;
    });
  }, []);

  const setAttackerTarget = useCallback((attackerId: string, targetPwInstanceId: string | null) => {
    setAttackerTargetsState(prev => {
      if (!targetPwInstanceId) {
        const { [attackerId]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [attackerId]: targetPwInstanceId };
    });
  }, []);

  const confirmAttackers = useCallback(() => {
    if (!gameState) return;

    setGameState(prev => {
      if (!prev) return prev;
      const newBattlefield = prev.players.you.battlefield.map(c => {
        if (!declaredAttackers.includes(c.instance_id || '')) return c;
        const target = attackerTargets[c.instance_id || ''];
        return {
          ...c,
          attacking: true,
          tapped: !(c.hasVigilance || c.keywords?.includes('vigilance')),
          ...(target ? { attackTarget: target } : {}),
        };
      });

      return {
        ...prev,
        players: {
          ...prev.players,
          you: { ...prev.players.you, battlefield: newBattlefield }
        }
      };
    });

    addLog(`Declared ${declaredAttackers.length} attacker(s)`);

    // Dispatch attack triggers
    if (declaredAttackers.length > 0) {
      const postState = JSON.parse(JSON.stringify(gameState)) as GameState;
      postState.players.you.battlefield = postState.players.you.battlefield.map((c: Permanent) =>
        declaredAttackers.includes(c.instance_id || '')
          ? { ...c, attacking: true, tapped: !(c.hasVigilance || c.keywords?.includes('vigilance')) }
          : c
      );
      const attackTriggers = checkTriggersForEvent('creature_attacked', {
        attackerIds: declaredAttackers
      }, postState);
      attackTriggers.forEach(trigger => addToStack(trigger));
    }

    setIsDeclaringAttackers(false);
    advancePhase();
  }, [gameState, declaredAttackers, attackerTargets, addLog, addToStack, advancePhase]);

  // Stack management
  const resolveTopOfStack = useCallback(() => {
    resolveStack();
  }, [resolveStack]);

  const resolveAllStack = useCallback(() => {
    while (stack.length > 0) {
      resolveStack();
    }
  }, [stack, resolveStack]);

  const toggleHoldPriority = useCallback(() => {
    setHoldingPriority(prev => !prev);
    addLog(holdingPriority ? 'Auto-resolving enabled' : 'Holding priority');
  }, [holdingPriority, addLog]);

  // Evoke: cast creature for its evoke alt cost. Creature ETB's normally with
  // wasEvoked=true; detectETBTriggers (engine/triggers/etb.ts) appends a
  // sacrifice_self trigger so the creature dies after the ETB ability resolves.
  const castWithEvoke = useCallback((card: Card) => {
    if (!gameState) return;
    const evokeMatch = card.oracle_text?.match(/Evoke\s*(\{[^}]+\}(?:\{[^}]+\})*)/i);
    if (!evokeMatch) {
      addLog(`${card.name} has no evoke cost`);
      return;
    }
    const evokeCostStr = evokeMatch[1];
    const parsedCost = parseManaCost(evokeCostStr);
    if (!canAffordCost(parsedCost, gameState.players.you.mana_pool)) {
      addLog(`Not enough mana to evoke ${card.name} (${evokeCostStr})`);
      return;
    }
    const phase = gameState.turn_phase;
    const isCreatureSorceryTiming = phase === 'main1' || phase === 'main2';
    if (!isCreatureSorceryTiming && !card.keywords?.includes('flash')) {
      addLog(`Cannot evoke ${card.name} — main phase only`);
      return;
    }
    const newManaPool = spendMana(gameState.players.you.mana_pool, parsedCost);
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        players: {
          ...prev.players,
          you: {
            ...prev.players.you,
            hand: prev.players.you.hand.filter(c => c.instance_id !== card.instance_id),
            mana_pool: newManaPool
          }
        }
      };
    });
    const stackItem: StackItem = {
      id: `evoke-${card.card_id}-${Date.now()}`,
      type: 'creature_spell',
      source: { ...card, owner: 'you' } as any,
      effect: { type: 'enter_battlefield', creature: card, owner: 'you' },
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now(),
      wasEvoked: true
    };
    addToStack(stackItem);
    addLog(`Evoked ${card.name} for ${evokeCostStr}`);
    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, addLog, addToStack, holdingPriority, resolveStack]);

  // Dash: cast creature for its dash cost — gains haste, returns to hand at end step
  const castWithDash = useCallback((card: Card) => {
    if (!gameState) return;

    // Parse dash cost from oracle_text
    const dashMatch = card.oracle_text?.match(/Dash\s*(\{[^}]+\}(?:\{[^}]+\})*)/i);
    if (!dashMatch) {
      addLog(`${card.name} has no dash cost`);
      return;
    }
    const dashCostStr = dashMatch[1];
    const parsedCost = parseManaCost(dashCostStr);

    if (!canAffordCost(parsedCost, gameState.players.you.mana_pool)) {
      addLog(`Not enough mana to dash ${card.name} (${dashCostStr})`);
      return;
    }

    // Sorcery-speed check
    const phase = gameState.turn_phase;
    const isMainPhase = phase === 'main1' || phase === 'main2';
    if (!isMainPhase) {
      addLog('Can only dash during a main phase');
      return;
    }

    // Spend mana
    const newManaPool = spendMana(gameState.players.you.mana_pool, parsedCost);

    // Remove from hand, update mana
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        players: {
          ...prev.players,
          you: {
            ...prev.players.you,
            hand: prev.players.you.hand.filter(c => c.instance_id !== card.instance_id),
            mana_pool: newManaPool
          }
        }
      };
    });

    // Create stack item with wasDashed flag
    const stackItem: StackItem = {
      id: `dash-${card.card_id}-${Date.now()}`,
      type: 'creature_spell',
      source: { ...card, owner: 'you' } as any,
      effect: { type: 'enter_battlefield', creature: card, owner: 'you' },
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now(),
      wasDashed: true
    };

    addToStack(stackItem);
    addLog(`Dashed ${card.name} for ${dashCostStr}`);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, addLog, addToStack, holdingPriority, resolveStack]);

  // Impending: cast enchantment creature for its impending cost — enters as enchantment-only with time counters
  const castWithImpending = useCallback((card: Card) => {
    if (!gameState) return;

    // Parse impending cost and counter count from oracle_text
    const impendingMatch = card.oracle_text?.match(/Impending\s+(\d+)\s*[\u2014—-]\s*(\{[^}]+\}(?:\{[^}]+\})*)/i);
    if (!impendingMatch) {
      addLog(`${card.name} has no impending cost`);
      return;
    }
    const timeCounters = parseInt(impendingMatch[1], 10);
    const impendingCostStr = impendingMatch[2];
    const parsedCost = parseManaCost(impendingCostStr);

    if (!canAffordCost(parsedCost, gameState.players.you.mana_pool)) {
      addLog(`Not enough mana to cast ${card.name} with impending (${impendingCostStr})`);
      return;
    }

    // Sorcery-speed check
    const phase = gameState.turn_phase;
    const isMainPhase = phase === 'main1' || phase === 'main2';
    if (!isMainPhase) {
      addLog('Can only cast with impending during a main phase');
      return;
    }

    // Spend mana
    const newManaPool = spendMana(gameState.players.you.mana_pool, parsedCost);

    // Remove from hand, update mana
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        players: {
          ...prev.players,
          you: {
            ...prev.players.you,
            hand: prev.players.you.hand.filter(c => c.instance_id !== card.instance_id),
            mana_pool: newManaPool
          }
        }
      };
    });

    // Modify the card: strip "Creature" from type_line, add impending flag + counters
    const modifiedCard = {
      ...card,
      _impending: true,
      _originalTypeLine: card.type_line, // preserve for restoration
      type_line: (card.type_line || '').replace(/\bCreature\b\s*/i, '').replace(/\s+/g, ' ').trim(),
      _impendingCounters: timeCounters,
    };

    // Create stack item — enters as permanent (enchantment), not creature
    const stackItem: StackItem = {
      id: `impending-${card.card_id}-${Date.now()}`,
      type: 'permanent_spell',
      source: { ...modifiedCard, owner: 'you' } as any,
      effect: { type: 'enter_battlefield_permanent', permanent: modifiedCard, owner: 'you' },
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now(),
      wasImpending: true,
    } as StackItem;

    addToStack(stackItem);
    const newSpellCount = spellsCastThisTurn + 1;
    setSpellsCastThisTurn(newSpellCount);
    addLog(`Cast ${card.name} with impending for ${impendingCostStr} (enters as enchantment with ${timeCounters} time counters)`);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, addLog, addToStack, holdingPriority, resolveStack, spellsCastThisTurn]);

  // Overload: cast instant/sorcery for overload cost — replaces "target" with "each" in the spell's effect
  const castWithOverload = useCallback((card: Card, _rect: DOMRect) => {
    if (!gameState) return;

    // Parse overload cost from oracle_text
    const overloadMatch = card.oracle_text?.match(/Overload\s*(\{[^}]+\}(?:\{[^}]+\})*)/i);
    if (!overloadMatch) {
      addLog(`${card.name} has no overload cost`);
      return;
    }
    const overloadCostStr = overloadMatch[1];
    const parsedCost = parseManaCost(overloadCostStr);
    const reduction = getCostReduction(card);

    if (!canAffordCost(parsedCost, gameState.players.you.mana_pool, 0, reduction)) {
      addLog(`Not enough mana to overload ${card.name}`);
      return;
    }

    // Timing check — respect spell type (sorcery = main phase only)
    const typeLine = (card.type_line || '').toLowerCase();
    const isSorcery = typeLine.includes('sorcery');
    const phase = gameState.turn_phase;
    const isMainPhase = phase === 'main1' || phase === 'main2';
    if (isSorcery && !isMainPhase) {
      addLog('Can only cast sorceries during a main phase');
      return;
    }

    // Spend mana
    const newManaPool = spendMana(gameState.players.you.mana_pool, parsedCost, 0, reduction);

    // Remove from hand, update mana
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        players: {
          ...prev.players,
          you: {
            ...prev.players.you,
            hand: prev.players.you.hand.filter(c => c.instance_id !== card.instance_id),
            mana_pool: newManaPool
          }
        }
      };
    });

    // Build the effect from the card's spell_effect, marking it as overloaded
    const baseEffect = (card.spell_effect || { type: 'unknown' }) as Effect;

    // Create stack item — overloaded spells do NOT require targeting input
    const stackItem: StackItem = {
      id: `overload-${card.card_id}-${Date.now()}`,
      type: 'spell',
      source: { ...card, owner: 'you' } as any,
      effect: baseEffect,
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now(),
      wasOverloaded: true,
    } as StackItem;

    addToStack(stackItem);
    const newSpellCount = spellsCastThisTurn + 1;
    setSpellsCastThisTurn(newSpellCount);
    setSelectedCard(null);
    addLog(`Cast ${card.name} with overload for ${overloadCostStr}`);

    // Fire all spell-cast triggers — overload replaces the mana cost
    const manaSpent = calculateManaSpent(overloadCostStr, 0, reduction);
    fireSpellCastTriggers(card, newSpellCount, gameState, manaSpent);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, addLog, addToStack, holdingPriority, resolveStack, spellsCastThisTurn, getCostReduction, fireSpellCastTriggers]);

  // Kicker: cast a spell paying its normal cost plus the kicker cost for an enhanced effect
  const castWithKicker = useCallback((card: Card, rect: DOMRect) => {
    if (!gameState) return;

    // Parse kicker cost from oracle_text
    const kickerMatch = card.oracle_text?.match(/Kicker\s*(\{[^}]+\}(?:\{[^}]+\})*)/i);
    if (!kickerMatch) {
      addLog(`${card.name} has no kicker cost`);
      return;
    }
    const kickerCostStr = kickerMatch[1];
    const kickerCost = parseManaCost(kickerCostStr);
    const baseCost = parseManaCost(card.mana_cost || '');
    const reduction = getCostReduction(card);

    // Combine base + kicker costs
    const totalGeneric = (baseCost.generic || 0) + (kickerCost.generic || 0);
    const totalColored: Record<string, number> = { ...(baseCost.colored || {}) };
    for (const [color, amount] of Object.entries(kickerCost.colored || {})) {
      totalColored[color] = (totalColored[color] || 0) + (amount as number);
    }
    const totalCost = { generic: totalGeneric, colored: totalColored, xCount: 0 } as any;

    if (!canAffordCost(totalCost, gameState.players.you.mana_pool, 0, reduction)) {
      addLog(`Not enough mana to cast ${card.name} with kicker (${card.mana_cost} + ${kickerCostStr})`);
      return;
    }

    // Timing check
    const typeLine = (card.type_line || '').toLowerCase();
    const isSorcerySpeed = typeLine.includes('sorcery') || typeLine.includes('creature') ||
      typeLine.includes('enchantment') || typeLine.includes('artifact');
    const phase = gameState.turn_phase;
    const isMainPhase = phase === 'main1' || phase === 'main2';
    if (isSorcerySpeed && !isMainPhase) {
      addLog(`Can only cast ${card.name} during a main phase`);
      return;
    }

    // Spend mana
    const newManaPool = spendMana(gameState.players.you.mana_pool, totalCost, 0, reduction);

    const isCreature = typeLine.includes('creature');
    const isPermanent = isCreature || typeLine.includes('artifact') || typeLine.includes('enchantment') || typeLine.includes('planeswalker');

    // For spells with kicked_effect, use that instead of base spell_effect
    const spellEffect = card.spell_effect;
    const kickedEffect = spellEffect?.kicked_effect;
    const baseEffect = (isPermanent
      ? isCreature
        ? { type: 'enter_battlefield', creature: { ...card, _kicked: true }, owner: 'you' }
        : { type: 'enter_battlefield_permanent', permanent: { ...card, _kicked: true }, owner: 'you' }
      : (kickedEffect || spellEffect || { type: 'unknown' })) as Effect;

    // For spells: check if kicked_effect replaces targeting requirements
    const requiresTarget = !isPermanent && (
      baseEffect.target || baseEffect.valid_targets ||
      baseEffect.type === 'damage' || baseEffect.type === 'destroy' ||
      baseEffect.type === 'buff_creature' || baseEffect.type === 'attach_aura' ||
      baseEffect.type === 'exile_target_creature'
    );

    if (requiresTarget) {
      // Save pre-cast snapshot for cancel restoration
      const preCastHand = [...gameState.players.you.hand];
      const preCastManaPool = { ...gameState.players.you.mana_pool };

      // Remove from hand, spend mana, then enter targeting mode
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: { ...prev.players, you: {
            ...prev.players.you,
            hand: prev.players.you.hand.filter(c => c.instance_id !== card.instance_id),
            mana_pool: newManaPool
          }}
        };
      });

      // Set the card as selected with kicked flag so castSpellOnTarget picks it up
      const kickedCard = { ...card, _kicked: true, spell_effect: baseEffect, rect } as any;
      setSelectedCard(kickedCard);
      setIsTargeting(true);
      setTargetingOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      altCastSnapshot.current = { hand: preCastHand, manaPool: preCastManaPool, cardName: card.name };
      addLog(`Cast ${card.name} with kicker — select a target`);

      const newSpellCount = spellsCastThisTurn + 1;
      setSpellsCastThisTurn(newSpellCount);
      // Triggers fire in castSpellOnTarget when target is selected
      return;
    }

    // Non-targeted: remove from hand, spend mana, add to stack
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        players: { ...prev.players, you: {
          ...prev.players.you,
          hand: prev.players.you.hand.filter(c => c.instance_id !== card.instance_id),
          mana_pool: newManaPool
        }}
      };
    });

    const stackItem: StackItem = {
      id: `kicked-${card.card_id}-${Date.now()}`,
      type: isPermanent ? (isCreature ? 'creature_spell' : 'permanent_spell') : 'spell',
      source: { ...card, owner: 'you' } as any,
      effect: baseEffect,
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now(),
      wasKicked: true,
    } as StackItem;

    addToStack(stackItem);
    const newSpellCount = spellsCastThisTurn + 1;
    setSpellsCastThisTurn(newSpellCount);
    setSelectedCard(null);
    addLog(`Cast ${card.name} with kicker for ${card.mana_cost} + ${kickerCostStr}`);

    // Fire all spell-cast triggers — total includes base + kicker
    const manaSpent = calculateManaSpent(totalCost, 0, reduction);
    fireSpellCastTriggers(card, newSpellCount, gameState, manaSpent);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, addLog, addToStack, holdingPriority, resolveStack, spellsCastThisTurn, getCostReduction, fireSpellCastTriggers]);

  // Offspring: cast creature paying additional cost — creates a 1/1 token copy on ETB
  const castWithOffspring = useCallback((card: Card) => {
    if (!gameState) return;

    // Parse offspring cost from oracle_text
    const offspringMatch = card.oracle_text?.match(/Offspring\s*(\{[^}]+\}(?:\{[^}]+\})*)/i);
    if (!offspringMatch) {
      addLog(`${card.name} has no offspring cost`);
      return;
    }
    const offspringCostStr = offspringMatch[1];
    const offspringCost = parseManaCost(offspringCostStr);
    const baseCost = parseManaCost(card.mana_cost || '');
    const reduction = getCostReduction(card);

    // Combine base + offspring costs
    const totalColored: Record<string, number> = { ...(baseCost.colored || {}) };
    for (const [color, amount] of Object.entries(offspringCost.colored || {})) {
      totalColored[color] = (totalColored[color] || 0) + (amount as number);
    }
    const totalCost = {
      generic: (baseCost.generic || 0) + (offspringCost.generic || 0),
      colored: totalColored,
      xCount: 0,
    } as any;

    if (!canAffordCost(totalCost, gameState.players.you.mana_pool, 0, reduction)) {
      addLog(`Not enough mana to cast ${card.name} with offspring (${card.mana_cost} + ${offspringCostStr})`);
      return;
    }

    // Timing check
    const phase = gameState.turn_phase;
    const isMainPhase = phase === 'main1' || phase === 'main2';
    if (!isMainPhase) {
      addLog(`Can only cast creatures during a main phase`);
      return;
    }

    const newManaPool = spendMana(gameState.players.you.mana_pool, totalCost, 0, reduction);

    // Remove from hand, spend mana
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        players: { ...prev.players, you: {
          ...prev.players.you,
          hand: prev.players.you.hand.filter(c => c.instance_id !== card.instance_id),
          mana_pool: newManaPool
        }}
      };
    });

    // Create stack item — creature enters with _offspringPaid flag
    const stackItem: StackItem = {
      id: `offspring-${card.card_id}-${Date.now()}`,
      type: 'creature_spell',
      source: { ...card, owner: 'you' } as any,
      effect: {
        type: 'enter_battlefield',
        creature: { ...card, _offspringPaid: true },
        owner: 'you'
      } as Effect,
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now(),
      wasOffspring: true,
    } as StackItem;

    addToStack(stackItem);
    const newSpellCount = spellsCastThisTurn + 1;
    setSpellsCastThisTurn(newSpellCount);
    setSelectedCard(null);
    addLog(`Cast ${card.name} with offspring for ${card.mana_cost} + ${offspringCostStr}`);

    const manaSpent = calculateManaSpent(totalCost, 0, reduction);
    fireSpellCastTriggers(card, newSpellCount, gameState, manaSpent);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, addLog, addToStack, holdingPriority, resolveStack, spellsCastThisTurn, getCostReduction, fireSpellCastTriggers]);

  // Squad: open multikicker selector in squad mode
  const castWithSquad = useCallback((card: Card) => {
    if (!gameState) return;

    const squadMatch = card.oracle_text?.match(/Squad\s*(\{[^}]+\}(?:\{[^}]+\})*)/i);
    if (!squadMatch) {
      addLog(`${card.name} has no squad cost`);
      return;
    }
    const kickCostStr = squadMatch[1];
    const kickCost = parseManaCost(kickCostStr);
    const baseCost = parseManaCost(card.mana_cost || '');
    const reduction = getCostReduction(card);

    if (!canAffordCost(baseCost, gameState.players.you.mana_pool, 0, reduction)) {
      addLog(`Not enough mana to cast ${card.name}`);
      return;
    }

    const phase = gameState.turn_phase;
    const isMainPhase = phase === 'main1' || phase === 'main2';
    if (!isMainPhase) {
      addLog('Can only cast creatures during a main phase');
      return;
    }

    const availableMana = Object.values(gameState.players.you.mana_pool).reduce((a, b) => a + b, 0);
    const baseManaNeeded = (baseCost.generic || 0) + Object.values(baseCost.colored || {}).reduce((a: number, b: any) => a + b, 0) - reduction;
    const kickManaPerKick = (kickCost.generic || 0) + Object.values(kickCost.colored || {}).reduce((a: number, b: any) => a + b, 0);
    const maxKicks = kickManaPerKick > 0 ? Math.floor((availableMana - Math.max(0, baseManaNeeded)) / kickManaPerKick) : 0;

    setMultikickerState({ card, kickCostStr, kickCost, maxKicks, mode: 'squad' });
  }, [gameState, addLog, getCostReduction]);

  // Multikicker: open selector to choose how many times to kick
  const startMultikicker = useCallback((card: Card) => {
    if (!gameState) return;

    const mkMatch = card.oracle_text?.match(/Multikicker\s*(\{[^}]+\}(?:\{[^}]+\})*)/i);
    if (!mkMatch) {
      addLog(`${card.name} has no multikicker cost`);
      return;
    }
    const kickCostStr = mkMatch[1];
    const kickCost = parseManaCost(kickCostStr);
    const baseCost = parseManaCost(card.mana_cost || '');
    const reduction = getCostReduction(card);

    // Check base cost affordability
    if (!canAffordCost(baseCost, gameState.players.you.mana_pool, 0, reduction)) {
      addLog(`Not enough mana to cast ${card.name}`);
      return;
    }

    // Timing check
    const typeLine = (card.type_line || '').toLowerCase();
    const isSorcerySpeed = typeLine.includes('sorcery') || typeLine.includes('creature') ||
      typeLine.includes('enchantment') || typeLine.includes('artifact');
    const phase = gameState.turn_phase;
    const isMainPhase = phase === 'main1' || phase === 'main2';
    if (isSorcerySpeed && !isMainPhase) {
      addLog(`Can only cast ${card.name} during a main phase`);
      return;
    }

    // Calculate max kicks affordable
    const availableMana = Object.values(gameState.players.you.mana_pool).reduce((a, b) => a + b, 0);
    const baseManaNeeded = (baseCost.generic || 0) + Object.values(baseCost.colored || {}).reduce((a: number, b: any) => a + b, 0) - reduction;
    const kickManaPerKick = (kickCost.generic || 0) + Object.values(kickCost.colored || {}).reduce((a: number, b: any) => a + b, 0);
    const maxKicks = kickManaPerKick > 0 ? Math.floor((availableMana - Math.max(0, baseManaNeeded)) / kickManaPerKick) : 0;

    setMultikickerState({ card, kickCostStr, kickCost, maxKicks, mode: 'multikicker' });
  }, [gameState, addLog, getCostReduction]);

  // Replicate: open selector for replicate count (reuses multikicker selector)
  const startReplicate = useCallback((card: Card, rect: DOMRect) => {
    if (!gameState) return;

    const repMatch = card.oracle_text?.match(/Replicate\s*(\{[^}]+\}(?:\{[^}]+\})*)/i);
    if (!repMatch) {
      addLog(`${card.name} has no replicate cost`);
      return;
    }
    const kickCostStr = repMatch[1];
    const kickCost = parseManaCost(kickCostStr);
    const baseCost = parseManaCost(card.mana_cost || '');
    const reduction = getCostReduction(card);

    if (!canAffordCost(baseCost, gameState.players.you.mana_pool, 0, reduction)) {
      addLog(`Not enough mana to cast ${card.name}`);
      return;
    }

    const typeLine = (card.type_line || '').toLowerCase();
    const isSorcery = typeLine.includes('sorcery');
    const phase = gameState.turn_phase;
    const isMainPhase = phase === 'main1' || phase === 'main2';
    if (isSorcery && !isMainPhase) {
      addLog('Can only cast sorceries during a main phase');
      return;
    }

    const availableMana = Object.values(gameState.players.you.mana_pool).reduce((a, b) => a + b, 0);
    const baseManaNeeded = (baseCost.generic || 0) + Object.values(baseCost.colored || {}).reduce((a: number, b: any) => a + b, 0) - reduction;
    const kickManaPerKick = (kickCost.generic || 0) + Object.values(kickCost.colored || {}).reduce((a: number, b: any) => a + b, 0);
    const maxKicks = kickManaPerKick > 0 ? Math.floor((availableMana - Math.max(0, baseManaNeeded)) / kickManaPerKick) : 0;

    setMultikickerState({ card: { ...card, rect } as any, kickCostStr, kickCost, maxKicks, mode: 'replicate' });
  }, [gameState, addLog, getCostReduction]);

  // Confirm multikicker/replicate — spend mana and cast
  const confirmMultikicker = useCallback((kickCount: number) => {
    if (!gameState || !multikickerState) return;
    const { card, kickCostStr, kickCost, mode } = multikickerState;

    const baseCost = parseManaCost(card.mana_cost || '');
    const reduction = getCostReduction(card);

    // Combine base + (kickCount × kickCost)
    const totalColored: Record<string, number> = { ...(baseCost.colored || {}) };
    for (let i = 0; i < kickCount; i++) {
      for (const [color, amount] of Object.entries(kickCost.colored || {})) {
        totalColored[color] = (totalColored[color] || 0) + (amount as number);
      }
    }
    const totalCost = {
      generic: (baseCost.generic || 0) + (kickCost.generic || 0) * kickCount,
      colored: totalColored,
      xCount: 0,
    } as any;

    if (!canAffordCost(totalCost, gameState.players.you.mana_pool, 0, reduction)) {
      addLog(`Not enough mana for ${kickCount} ${mode === 'replicate' ? 'replicates' : 'kicks'}`);
      return;
    }

    const newManaPool = spendMana(gameState.players.you.mana_pool, totalCost, 0, reduction);

    // Remove from hand, spend mana
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        players: { ...prev.players, you: {
          ...prev.players.you,
          hand: prev.players.you.hand.filter(c => c.instance_id !== card.instance_id),
          mana_pool: newManaPool
        }}
      };
    });

    if (mode === 'replicate') {
      // Replicate: enter targeting mode for the original spell, copies created after target selected
      const replicateCard = { ...card, _replicateCount: kickCount, _altCostPaid: true } as any;
      const rect = (card as any).rect || { left: 400, top: 300, width: 80, height: 112 };
      setSelectedCard(replicateCard);
      setIsTargeting(true);
      setTargetingOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      altCastSnapshot.current = { hand: [...gameState.players.you.hand], manaPool: { ...gameState.players.you.mana_pool }, cardName: card.name };
      setMultikickerState(null);

      const repLabel = kickCount > 0 ? ` (replicated ${kickCount} time${kickCount !== 1 ? 's' : ''})` : '';
      addLog(`Cast ${card.name}${repLabel} — select a target`);

      const newSpellCount = spellsCastThisTurn + 1;
      setSpellsCastThisTurn(newSpellCount);
      // Triggers fire in castSpellOnTarget when target is selected
      return;
    }

    // Multikicker/Squad: creature enters with count flag
    const typeLine = (card.type_line || '').toLowerCase();
    const isCreature = typeLine.includes('creature');
    const isPermanent = isCreature || typeLine.includes('artifact') || typeLine.includes('enchantment') || typeLine.includes('planeswalker');

    const countFlag = mode === 'squad'
      ? { _squadCount: kickCount }
      : { _multikickCount: kickCount };
    const baseEffect = (isPermanent
      ? isCreature
        ? { type: 'enter_battlefield', creature: { ...card, ...countFlag }, owner: 'you' }
        : { type: 'enter_battlefield_permanent', permanent: { ...card, ...countFlag }, owner: 'you' }
      : (card.spell_effect || { type: 'unknown' })) as Effect;

    const stackItem: StackItem = {
      id: `multikick-${card.card_id}-${Date.now()}`,
      type: isPermanent ? (isCreature ? 'creature_spell' : 'permanent_spell') : 'spell',
      source: { ...card, owner: 'you' } as any,
      effect: baseEffect,
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now(),
      wasKicked: true,
      multikickCount: kickCount,
    } as StackItem;

    addToStack(stackItem);
    const newSpellCount = spellsCastThisTurn + 1;
    setSpellsCastThisTurn(newSpellCount);
    setMultikickerState(null);
    setSelectedCard(null);

    const kickLabel = kickCount > 0 ? ` (kicked ${kickCount} time${kickCount !== 1 ? 's' : ''})` : '';
    addLog(`Cast ${card.name}${kickLabel} for ${card.mana_cost}${kickCount > 0 ? ' + ' + kickCostStr + '×' + kickCount : ''}`);

    const manaSpent = calculateManaSpent(totalCost, 0, reduction);
    fireSpellCastTriggers(card, newSpellCount, gameState, manaSpent);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, multikickerState, addLog, addToStack, holdingPriority, resolveStack, spellsCastThisTurn, getCostReduction, fireSpellCastTriggers]);

  const cancelMultikicker = useCallback(() => {
    setMultikickerState(null);
  }, []);

  // Buyback: cast a spell paying its normal cost plus buyback cost — spell returns to hand on resolution
  const castWithBuyback = useCallback((card: Card, rect: DOMRect) => {
    if (!gameState) return;

    // Parse buyback cost from oracle_text
    const buybackMatch = card.oracle_text?.match(/Buyback\s*(\{[^}]+\}(?:\{[^}]+\})*)/i);
    if (!buybackMatch) {
      addLog(`${card.name} has no buyback cost`);
      return;
    }
    const buybackCostStr = buybackMatch[1];
    const buybackCost = parseManaCost(buybackCostStr);
    const baseCost = parseManaCost(card.mana_cost || '');
    const reduction = getCostReduction(card);

    // Combine base + buyback costs
    const totalColored: Record<string, number> = { ...(baseCost.colored || {}) };
    for (const [color, amount] of Object.entries(buybackCost.colored || {})) {
      totalColored[color] = (totalColored[color] || 0) + (amount as number);
    }
    const totalCost = {
      generic: (baseCost.generic || 0) + (buybackCost.generic || 0),
      colored: totalColored,
      xCount: 0,
    } as any;

    if (!canAffordCost(totalCost, gameState.players.you.mana_pool, 0, reduction)) {
      addLog(`Not enough mana to cast ${card.name} with buyback (${card.mana_cost} + ${buybackCostStr})`);
      return;
    }

    // Timing check
    const typeLine = (card.type_line || '').toLowerCase();
    const isSorcery = typeLine.includes('sorcery');
    const phase = gameState.turn_phase;
    const isMainPhase = phase === 'main1' || phase === 'main2';
    if (isSorcery && !isMainPhase) {
      addLog(`Can only cast sorceries during a main phase`);
      return;
    }

    const newManaPool = spendMana(gameState.players.you.mana_pool, totalCost, 0, reduction);

    // Check if spell requires targeting
    const spellEffect = card.spell_effect;
    const requiresTarget = spellEffect?.target || spellEffect?.valid_targets ||
      spellEffect?.type === 'damage' || spellEffect?.type === 'destroy' ||
      spellEffect?.type === 'buff_creature' || spellEffect?.type === 'exile_target_creature';

    if (requiresTarget) {
      // Save pre-cast snapshot for cancel restoration
      const preCastHand = [...gameState.players.you.hand];
      const preCastManaPool = { ...gameState.players.you.mana_pool };

      // Remove from hand, spend mana, enter targeting mode
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: { ...prev.players, you: {
            ...prev.players.you,
            hand: prev.players.you.hand.filter(c => c.instance_id !== card.instance_id),
            mana_pool: newManaPool
          }}
        };
      });

      const buybackCard = { ...card, _buyback: true, rect } as any;
      setSelectedCard(buybackCard);
      setIsTargeting(true);
      setTargetingOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      altCastSnapshot.current = { hand: preCastHand, manaPool: preCastManaPool, cardName: card.name };
      addLog(`Cast ${card.name} with buyback — select a target`);

      const newSpellCount = spellsCastThisTurn + 1;
      setSpellsCastThisTurn(newSpellCount);
      // Triggers fire in castSpellOnTarget when target is selected
      return;
    }

    // Non-targeted: remove from hand, spend mana, add to stack
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        players: { ...prev.players, you: {
          ...prev.players.you,
          hand: prev.players.you.hand.filter(c => c.instance_id !== card.instance_id),
          mana_pool: newManaPool
        }}
      };
    });

    const stackItem: StackItem = {
      id: `buyback-${card.card_id}-${Date.now()}`,
      type: 'spell',
      source: { ...card, owner: 'you' } as any,
      effect: (spellEffect || { type: 'unknown' }) as Effect,
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now(),
      wasBuyback: true,
    } as StackItem;

    addToStack(stackItem);
    const newSpellCount = spellsCastThisTurn + 1;
    setSpellsCastThisTurn(newSpellCount);
    setSelectedCard(null);
    addLog(`Cast ${card.name} with buyback for ${card.mana_cost} + ${buybackCostStr}`);

    const manaSpent = calculateManaSpent(totalCost, 0, reduction);
    fireSpellCastTriggers(card, newSpellCount, gameState, manaSpent);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, addLog, addToStack, holdingPriority, resolveStack, spellsCastThisTurn, getCostReduction, fireSpellCastTriggers]);

  // Collect Evidence: start graveyard card selection for evidence cost
  const startCollectEvidence = useCallback((card: Card, rect: DOMRect) => {
    if (!gameState) return;

    // Parse evidence value from oracle_text
    const evidenceMatch = card.oracle_text?.match(/collect evidence\s+(\d+)/i);
    if (!evidenceMatch) {
      addLog(`${card.name} has no collect evidence cost`);
      return;
    }
    const evidenceValue = parseInt(evidenceMatch[1], 10);

    // Check if graveyard has enough total CMC
    const graveyard = gameState.players.you.graveyard || [];
    const totalGYCMC = graveyard.reduce((sum, c) => sum + calculateCMC(c.mana_cost), 0);
    if (totalGYCMC < evidenceValue) {
      addLog(`Not enough mana value in graveyard to collect evidence ${evidenceValue} (total: ${totalGYCMC})`);
      return;
    }

    // Check base mana cost affordability
    const parsedCost = parseManaCost(card.mana_cost || '');
    const reduction = getCostReduction(card);
    if (!canAffordCost(parsedCost, gameState.players.you.mana_pool, 0, reduction)) {
      addLog(`Not enough mana to cast ${card.name}`);
      return;
    }

    // Timing check
    const typeLine = (card.type_line || '').toLowerCase();
    const isSorcerySpeed = typeLine.includes('sorcery') || typeLine.includes('creature') ||
      typeLine.includes('enchantment') || typeLine.includes('artifact');
    const phase = gameState.turn_phase;
    const isMainPhase = phase === 'main1' || phase === 'main2';
    if (isSorcerySpeed && !isMainPhase) {
      addLog(`Can only cast ${card.name} during a main phase`);
      return;
    }

    setCollectEvidenceState({ card, rect, evidenceValue, selectedCards: [] });
    addLog(`Collecting evidence for ${card.name} — select cards from graveyard (total mana value ≥ ${evidenceValue})`);
  }, [gameState, addLog, getCostReduction]);

  // Toggle a graveyard card in/out of evidence selection
  const toggleEvidenceCard = useCallback((card: Card) => {
    if (!collectEvidenceState) return;

    const isSelected = collectEvidenceState.selectedCards.some(
      c => c.instance_id === card.instance_id
    );

    if (isSelected) {
      setCollectEvidenceState(prev => prev ? {
        ...prev,
        selectedCards: prev.selectedCards.filter(c => c.instance_id !== card.instance_id)
      } : null);
    } else {
      setCollectEvidenceState(prev => prev ? {
        ...prev,
        selectedCards: [...prev.selectedCards, card]
      } : null);
    }
  }, [collectEvidenceState]);

  // Confirm evidence collection — exile selected cards and cast the spell
  const confirmEvidence = useCallback(() => {
    if (!gameState || !collectEvidenceState) return;
    const { card, selectedCards } = collectEvidenceState;

    // Spend mana
    const parsedCost = parseManaCost(card.mana_cost || '');
    const reduction = getCostReduction(card);
    const newManaPool = spendMana(gameState.players.you.mana_pool, parsedCost, 0, reduction);

    const typeLine = (card.type_line || '').toLowerCase();
    const isCreature = typeLine.includes('creature');
    const isPermanent = isCreature || typeLine.includes('artifact') || typeLine.includes('enchantment') || typeLine.includes('planeswalker');

    // Remove from hand, spend mana, exile evidence cards
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      newState.players.you.hand = newState.players.you.hand.filter(
        c => c.instance_id !== card.instance_id
      );
      newState.players.you.mana_pool = newManaPool;
      // Exile selected graveyard cards
      const exiledIds = new Set(selectedCards.map(c => c.instance_id));
      newState.players.you.graveyard = (newState.players.you.graveyard || []).filter(
        c => !exiledIds.has(c.instance_id)
      );
      newState.players.you.exile = [
        ...(newState.players.you.exile || []),
        ...selectedCards
      ];
      return newState;
    });

    const evidenceNames = selectedCards.map(c => c.name).join(', ');
    addLog(`Collected evidence: exiled ${evidenceNames}`);

    // Build stack item
    const baseEffect = (isPermanent
      ? isCreature
        ? { type: 'enter_battlefield', creature: { ...card, _evidenceCollected: true }, owner: 'you' }
        : { type: 'enter_battlefield_permanent', permanent: { ...card, _evidenceCollected: true }, owner: 'you' }
      : (card.spell_effect || { type: 'unknown' })) as Effect;

    const stackItem: StackItem = {
      id: `evidence-${card.card_id}-${Date.now()}`,
      type: isPermanent ? (isCreature ? 'creature_spell' : 'permanent_spell') : 'spell',
      source: { ...card, owner: 'you' } as any,
      effect: baseEffect,
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now(),
      wasEvidenceCollected: true,
    } as StackItem;

    addToStack(stackItem);
    const newSpellCount = spellsCastThisTurn + 1;
    setSpellsCastThisTurn(newSpellCount);
    setCollectEvidenceState(null);
    setSelectedCard(null);
    addLog(`Cast ${card.name} with evidence collected`);

    // Fire all spell-cast triggers
    const manaSpent = calculateManaSpent(card.mana_cost, 0, reduction);
    fireSpellCastTriggers(card, newSpellCount, gameState, manaSpent);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, collectEvidenceState, addLog, addToStack, holdingPriority, resolveStack, spellsCastThisTurn, getCostReduction, fireSpellCastTriggers]);

  const cancelEvidence = useCallback(() => {
    setCollectEvidenceState(null);
    addLog('Cancelled collecting evidence');
  }, [addLog]);

  // Delve: select graveyard cards to exile to reduce generic mana cost
  const startDelve = useCallback((card: Card, rect: DOMRect) => {
    if (!gameState) return;

    const baseCost = parseManaCost(card.mana_cost || '');
    const reduction = getCostReduction(card);
    const genericMana = Math.max(0, (baseCost.generic || 0) - reduction);

    // Timing check
    const typeLine = (card.type_line || '').toLowerCase();
    const isSorcerySpeed = typeLine.includes('sorcery') || typeLine.includes('creature') ||
      typeLine.includes('enchantment') || typeLine.includes('artifact');
    const phase = gameState.turn_phase;
    const isMainPhase = phase === 'main1' || phase === 'main2';
    if (isSorcerySpeed && !isMainPhase) {
      addLog(`Can only cast ${card.name} during a main phase`);
      return;
    }

    const graveyard = gameState.players.you.graveyard || [];
    const maxDelve = Math.min(genericMana, graveyard.length);

    if (maxDelve === 0 && graveyard.length === 0) {
      addLog(`No cards in graveyard to delve — casting normally`);
      // Fall through to normal cast if no graveyard
      return;
    }

    setDelveState({ card, rect, maxDelve, selectedCards: [] });
    addLog(`Delve for ${card.name} — select up to ${maxDelve} cards from graveyard to exile (each reduces cost by {1})`);
  }, [gameState, addLog, getCostReduction]);

  const toggleDelveCard = useCallback((card: Card) => {
    if (!delveState) return;

    const isSelected = delveState.selectedCards.some(
      c => c.instance_id === card.instance_id
    );

    if (isSelected) {
      setDelveState(prev => prev ? {
        ...prev,
        selectedCards: prev.selectedCards.filter(c => c.instance_id !== card.instance_id)
      } : null);
    } else if (delveState.selectedCards.length < delveState.maxDelve) {
      setDelveState(prev => prev ? {
        ...prev,
        selectedCards: [...prev.selectedCards, card]
      } : null);
    }
  }, [delveState]);

  const confirmDelve = useCallback(() => {
    if (!gameState || !delveState) return;
    const { card, rect, selectedCards } = delveState;

    // Calculate reduced cost
    const baseCost = parseManaCost(card.mana_cost || '');
    const reduction = getCostReduction(card);
    const delveReduction = selectedCards.length;
    const totalReduction = reduction + delveReduction;

    if (!canAffordCost(baseCost, gameState.players.you.mana_pool, 0, totalReduction)) {
      addLog(`Not enough mana to cast ${card.name} even with delve`);
      return;
    }

    const newManaPool = spendMana(gameState.players.you.mana_pool, baseCost, 0, totalReduction);

    // Exile selected graveyard cards, remove card from hand, spend mana
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      newState.players.you.hand = newState.players.you.hand.filter(
        c => c.instance_id !== card.instance_id
      );
      newState.players.you.mana_pool = newManaPool;
      const exiledIds = new Set(selectedCards.map(c => c.instance_id));
      newState.players.you.graveyard = (newState.players.you.graveyard || []).filter(
        c => !exiledIds.has(c.instance_id)
      );
      newState.players.you.exile = [
        ...(newState.players.you.exile || []),
        ...selectedCards
      ];
      return newState;
    });

    if (selectedCards.length > 0) {
      addLog(`Delved ${selectedCards.length} card${selectedCards.length !== 1 ? 's' : ''}: ${selectedCards.map(c => c.name).join(', ')}`);
    }

    // Check if spell requires targeting
    const spellEffect = card.spell_effect;
    const typeLine = (card.type_line || '').toLowerCase();
    const isCreature = typeLine.includes('creature');
    const isPermanent = isCreature || typeLine.includes('artifact') || typeLine.includes('enchantment') || typeLine.includes('planeswalker');

    const requiresTarget = !isPermanent && (
      spellEffect?.target || spellEffect?.valid_targets ||
      spellEffect?.type === 'damage' || spellEffect?.type === 'destroy' ||
      spellEffect?.type === 'buff_creature' || spellEffect?.type === 'exile_target_creature'
    );

    if (requiresTarget) {
      // Enter targeting mode — mana already spent
      const delveCard = { ...card, _altCostPaid: true, rect } as any;
      setSelectedCard(delveCard);
      setIsTargeting(true);
      setTargetingOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      altCastSnapshot.current = {
        hand: [...gameState.players.you.hand],
        manaPool: { ...gameState.players.you.mana_pool },
        cardName: card.name
      };
      setDelveState(null);

      const newSpellCount = spellsCastThisTurn + 1;
      setSpellsCastThisTurn(newSpellCount);
      addLog(`Cast ${card.name} with delve — select a target`);
      // Triggers fire in castSpellOnTarget when target is selected
      return;
    }

    // Non-targeted: put on stack
    const baseEffect = (isPermanent
      ? isCreature
        ? { type: 'enter_battlefield', creature: card, owner: 'you' }
        : { type: 'enter_battlefield_permanent', permanent: card, owner: 'you' }
      : (spellEffect || { type: 'unknown' })) as Effect;

    const stackItem: StackItem = {
      id: `delve-${card.card_id}-${Date.now()}`,
      type: isPermanent ? (isCreature ? 'creature_spell' : 'permanent_spell') : 'spell',
      source: { ...card, owner: 'you' } as any,
      effect: baseEffect,
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now(),
    };

    addToStack(stackItem);
    const newSpellCount = spellsCastThisTurn + 1;
    setSpellsCastThisTurn(newSpellCount);
    setDelveState(null);
    setSelectedCard(null);
    addLog(`Cast ${card.name} with delve`);

    // Delve exiles cards to pay generic — but total mana spent to cast is still the full cost
    const manaSpent = calculateManaSpent(card.mana_cost, 0, reduction);
    fireSpellCastTriggers(card, newSpellCount, gameState, manaSpent);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, delveState, addLog, addToStack, holdingPriority, resolveStack, spellsCastThisTurn, getCostReduction, fireSpellCastTriggers]);

  const cancelDelve = useCallback(() => {
    setDelveState(null);
    addLog('Cancelled delve');
  }, [addLog]);

  // Convoke: tap creatures to help pay for a spell
  const startConvoke = useCallback((card: Card, rect: DOMRect) => {
    if (!gameState) return;

    // Timing check
    const typeLine = (card.type_line || '').toLowerCase();
    const isSorcerySpeed = typeLine.includes('sorcery') || typeLine.includes('creature') ||
      typeLine.includes('enchantment') || typeLine.includes('artifact');
    const phase = gameState.turn_phase;
    const isMainPhase = phase === 'main1' || phase === 'main2';
    if (isSorcerySpeed && !isMainPhase) {
      addLog(`Can only cast ${card.name} during a main phase`);
      return;
    }

    // Check for untapped creatures
    const untappedCreatures = (gameState.players.you.battlefield || []).filter(
      (c: any) => (c.type_line || '').toLowerCase().includes('creature') && !c.tapped
    );

    if (untappedCreatures.length === 0) {
      addLog('No untapped creatures to convoke with');
      return;
    }

    setConvokeState({ card, rect, tappedCreatures: [] });
    addLog(`Convoke for ${card.name} — tap creatures to help pay the cost`);
  }, [gameState, addLog]);

  const toggleConvokeCreature = useCallback((creature: Card) => {
    if (!convokeState) return;

    const isSelected = convokeState.tappedCreatures.some(
      c => c.instance_id === creature.instance_id
    );

    if (isSelected) {
      setConvokeState(prev => prev ? {
        ...prev,
        tappedCreatures: prev.tappedCreatures.filter(c => c.instance_id !== creature.instance_id)
      } : null);
    } else {
      setConvokeState(prev => prev ? {
        ...prev,
        tappedCreatures: [...prev.tappedCreatures, creature]
      } : null);
    }
  }, [convokeState]);

  const confirmConvoke = useCallback(() => {
    if (!gameState || !convokeState) return;
    const { card, rect, tappedCreatures } = convokeState;

    // Calculate what each creature pays: match colors first, then generic
    const baseCost = parseManaCost(card.mana_cost || '');
    const reduction = getCostReduction(card);

    // Track remaining colored and generic costs
    const remainingColored: Record<string, number> = { ...(baseCost.colored || {}) };
    let remainingGeneric = Math.max(0, (baseCost.generic || 0) - reduction);
    const hasXCost = (card.mana_cost || '').includes('{X}');

    // Track how many creatures paid for generic/X (for X spells, these reduce mana needed)
    let genericConvoked = 0;

    for (const creature of tappedCreatures) {
      const creatureColors = (creature as any).colors || [];
      let matched = false;

      // Try to match a colored cost first
      for (const color of creatureColors) {
        if (remainingColored[color] && remainingColored[color] > 0) {
          remainingColored[color]--;
          matched = true;
          break;
        }
      }

      // If no color matched, reduce generic (or count toward X reduction)
      if (!matched) {
        if (remainingGeneric > 0) {
          remainingGeneric--;
        } else if (hasXCost) {
          // For X spells with no generic left, creature still helps by reducing the effective X cost
          genericConvoked++;
        }
      }
    }

    // Build the reduced cost — genericConvoked tracks creatures that paid toward X/generic beyond base
    const reducedCost = {
      generic: remainingGeneric,
      colored: remainingColored,
      xCount: hasXCost ? (baseCost.xCount || 1) : 0,
      convokedGeneric: genericConvoked,
    } as any;

    // For X cost spells, open X selector with reduced cost context
    if (hasXCost) {
      // Calculate max X with reduced cost — genericConvoked creatures effectively add to available mana for X
      const availableMana = Object.values(gameState.players.you.mana_pool).reduce((a: number, b: any) => a + b, 0);
      const coloredNeeded = Object.values(remainingColored).reduce((a: number, b: any) => a + b, 0);
      const maxX = Math.floor((availableMana + genericConvoked - coloredNeeded - remainingGeneric) / (baseCost.xCount || 1));

      // Save full game state snapshot before tapping creatures (for cancel restoration)
      altCastSnapshot.current = {
        hand: [...gameState.players.you.hand],
        manaPool: { ...gameState.players.you.mana_pool },
        cardName: card.name,
        fullState: JSON.parse(JSON.stringify(gameState)),
      };

      // Tap the creatures
      setGameState(prev => {
        if (!prev) return prev;
        const newState = JSON.parse(JSON.stringify(prev)) as GameState;
        const tappedIds = new Set(tappedCreatures.map(c => c.instance_id));
        newState.players.you.battlefield = newState.players.you.battlefield.map((c: any) =>
          tappedIds.has(c.instance_id) ? { ...c, tapped: true } : c
        );
        return newState;
      });

      if (tappedCreatures.length > 0) {
        addLog(`Convoked ${tappedCreatures.length} creature${tappedCreatures.length !== 1 ? 's' : ''}: ${tappedCreatures.map(c => c.name).join(', ')}`);
      }

      // Store convoke info on card so X selector and later cast can use it
      // minX = genericConvoked (those creatures must contribute to X)
      const convokedCard = { ...card, _convokeReduction: reducedCost, _convokeTapped: tappedCreatures };
      setXCostState({ card: convokedCard as Card, maxX: Math.max(0, maxX), minX: genericConvoked, rect });
      setConvokeState(null);
      return;
    }

    // Non-X: check affordability with reduced cost
    if (!canAffordCost(reducedCost, gameState.players.you.mana_pool)) {
      addLog(`Not enough mana to cast ${card.name} even with convoke`);
      return;
    }

    const newManaPool = spendMana(gameState.players.you.mana_pool, reducedCost);

    // Tap creatures, remove card from hand, spend mana
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      newState.players.you.hand = newState.players.you.hand.filter(
        c => c.instance_id !== card.instance_id
      );
      newState.players.you.mana_pool = newManaPool;
      const tappedIds = new Set(tappedCreatures.map(c => c.instance_id));
      newState.players.you.battlefield = newState.players.you.battlefield.map((c: any) =>
        tappedIds.has(c.instance_id) ? { ...c, tapped: true } : c
      );
      return newState;
    });

    if (tappedCreatures.length > 0) {
      addLog(`Convoked ${tappedCreatures.length} creature${tappedCreatures.length !== 1 ? 's' : ''}: ${tappedCreatures.map(c => c.name).join(', ')}`);
    }

    // Check if spell requires targeting
    const spellEffect = card.spell_effect;
    const typeLine = (card.type_line || '').toLowerCase();
    const isCreature = typeLine.includes('creature');
    const isPermanent = isCreature || typeLine.includes('artifact') || typeLine.includes('enchantment') || typeLine.includes('planeswalker');

    const requiresTarget = !isPermanent && (
      spellEffect?.target || spellEffect?.valid_targets ||
      spellEffect?.type === 'damage' || spellEffect?.type === 'destroy' ||
      spellEffect?.type === 'buff_creature' || spellEffect?.type === 'exile_target_creature'
    );

    if (requiresTarget) {
      const convokeCard = { ...card, _altCostPaid: true, rect } as any;
      setSelectedCard(convokeCard);
      setIsTargeting(true);
      setTargetingOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      altCastSnapshot.current = {
        hand: [...gameState.players.you.hand],
        manaPool: { ...gameState.players.you.mana_pool },
        cardName: card.name
      };
      setConvokeState(null);

      const newSpellCount = spellsCastThisTurn + 1;
      setSpellsCastThisTurn(newSpellCount);
      addLog(`Cast ${card.name} with convoke — select a target`);
      // Triggers fire in castSpellOnTarget when target is selected
      return;
    }

    // Non-targeted: put on stack
    const baseEffect = (isPermanent
      ? isCreature
        ? { type: 'enter_battlefield', creature: card, owner: 'you' }
        : { type: 'enter_battlefield_permanent', permanent: card, owner: 'you' }
      : (spellEffect || { type: 'unknown' })) as Effect;

    const stackItem: StackItem = {
      id: `convoke-${card.card_id}-${Date.now()}`,
      type: isPermanent ? (isCreature ? 'creature_spell' : 'permanent_spell') : 'spell',
      source: { ...card, owner: 'you' } as any,
      effect: baseEffect,
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now(),
    };

    addToStack(stackItem);
    const newSpellCount = spellsCastThisTurn + 1;
    setSpellsCastThisTurn(newSpellCount);
    setConvokeState(null);
    setSelectedCard(null);
    addLog(`Cast ${card.name} with convoke`);

    // Convoke taps creatures to pay — but total mana spent to cast is still the full cost
    const manaSpent = calculateManaSpent(card.mana_cost);
    fireSpellCastTriggers(card, newSpellCount, gameState, manaSpent);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, convokeState, addLog, addToStack, holdingPriority, resolveStack, spellsCastThisTurn, getCostReduction, fireSpellCastTriggers]);

  const cancelConvoke = useCallback(() => {
    setConvokeState(null);
    addLog('Cancelled convoke');
  }, [addLog]);

  // Improvise: tap artifacts to reduce generic mana cost
  const startImprovise = useCallback((card: Card, rect: DOMRect) => {
    if (!gameState) return;

    const typeLine = (card.type_line || '').toLowerCase();
    const isSorcerySpeed = typeLine.includes('sorcery') || typeLine.includes('creature') ||
      typeLine.includes('enchantment') || typeLine.includes('artifact');
    const phase = gameState.turn_phase;
    const isMainPhase = phase === 'main1' || phase === 'main2';
    if (isSorcerySpeed && !isMainPhase) {
      addLog(`Can only cast ${card.name} during a main phase`);
      return;
    }

    const untappedArtifacts = (gameState.players.you.battlefield || []).filter(
      (c: any) => (c.type_line || '').toLowerCase().includes('artifact') && !c.tapped
    );

    if (untappedArtifacts.length === 0) {
      addLog('No untapped artifacts to improvise with');
      return;
    }

    setImproviseState({ card, rect, tappedCreatures: [] });
    addLog(`Improvise for ${card.name} — tap artifacts to help pay the cost`);
  }, [gameState, addLog]);

  const toggleImproviseArtifact = useCallback((artifact: Card) => {
    if (!improviseState) return;

    const isSelected = improviseState.tappedCreatures.some(
      c => c.instance_id === artifact.instance_id
    );

    if (isSelected) {
      setImproviseState(prev => prev ? {
        ...prev,
        tappedCreatures: prev.tappedCreatures.filter(c => c.instance_id !== artifact.instance_id)
      } : null);
    } else {
      setImproviseState(prev => prev ? {
        ...prev,
        tappedCreatures: [...prev.tappedCreatures, artifact]
      } : null);
    }
  }, [improviseState]);

  const confirmImprovise = useCallback(() => {
    if (!gameState || !improviseState) return;
    const { card, rect, tappedCreatures: tappedArtifacts } = improviseState;

    const baseCost = parseManaCost(card.mana_cost || '');
    const reduction = getCostReduction(card);
    const genericReduction = tappedArtifacts.length;
    const totalReduction = reduction + genericReduction;

    if (!canAffordCost(baseCost, gameState.players.you.mana_pool, 0, totalReduction)) {
      addLog(`Not enough mana to cast ${card.name} even with improvise`);
      return;
    }

    const newManaPool = spendMana(gameState.players.you.mana_pool, baseCost, 0, totalReduction);

    // Tap artifacts, remove card from hand, spend mana
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      newState.players.you.hand = newState.players.you.hand.filter(
        c => c.instance_id !== card.instance_id
      );
      newState.players.you.mana_pool = newManaPool;
      const tappedIds = new Set(tappedArtifacts.map(c => c.instance_id));
      newState.players.you.battlefield = newState.players.you.battlefield.map((c: any) =>
        tappedIds.has(c.instance_id) ? { ...c, tapped: true } : c
      );
      return newState;
    });

    if (tappedArtifacts.length > 0) {
      addLog(`Improvised ${tappedArtifacts.length} artifact${tappedArtifacts.length !== 1 ? 's' : ''}: ${tappedArtifacts.map(c => c.name).join(', ')}`);
    }

    // Check if spell requires targeting
    const spellEffect = card.spell_effect;
    const typeLine = (card.type_line || '').toLowerCase();
    const isCreature = typeLine.includes('creature');
    const isPermanent = isCreature || typeLine.includes('artifact') || typeLine.includes('enchantment') || typeLine.includes('planeswalker');

    const requiresTarget = !isPermanent && (
      spellEffect?.target || spellEffect?.valid_targets ||
      spellEffect?.type === 'damage' || spellEffect?.type === 'destroy' ||
      spellEffect?.type === 'buff_creature' || spellEffect?.type === 'exile_target_creature'
    );

    if (requiresTarget) {
      const improvCard = { ...card, _altCostPaid: true, rect } as any;
      setSelectedCard(improvCard);
      setIsTargeting(true);
      setTargetingOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      altCastSnapshot.current = {
        hand: [...gameState.players.you.hand],
        manaPool: { ...gameState.players.you.mana_pool },
        cardName: card.name,
        fullState: JSON.parse(JSON.stringify(gameState)),
      };
      setImproviseState(null);

      const newSpellCount = spellsCastThisTurn + 1;
      setSpellsCastThisTurn(newSpellCount);
      addLog(`Cast ${card.name} with improvise — select a target`);
      // Triggers fire in castSpellOnTarget when target is selected
      return;
    }

    // Non-targeted: put on stack (creatures, etc.)
    const baseEffect = (isPermanent
      ? isCreature
        ? { type: 'enter_battlefield', creature: card, owner: 'you' }
        : { type: 'enter_battlefield_permanent', permanent: card, owner: 'you' }
      : (spellEffect || { type: 'unknown' })) as Effect;

    const stackItem: StackItem = {
      id: `improvise-${card.card_id}-${Date.now()}`,
      type: isPermanent ? (isCreature ? 'creature_spell' : 'permanent_spell') : 'spell',
      source: { ...card, owner: 'you' } as any,
      effect: baseEffect,
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now(),
    };

    addToStack(stackItem);
    const newSpellCount = spellsCastThisTurn + 1;
    setSpellsCastThisTurn(newSpellCount);
    setImproviseState(null);
    setSelectedCard(null);
    addLog(`Cast ${card.name} with improvise`);

    // Improvise taps artifacts to pay — but total mana spent to cast is still the full cost
    const manaSpent = calculateManaSpent(card.mana_cost, 0, reduction);
    fireSpellCastTriggers(card, newSpellCount, gameState, manaSpent);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, improviseState, addLog, addToStack, holdingPriority, resolveStack, spellsCastThisTurn, getCostReduction, fireSpellCastTriggers]);

  const cancelImprovise = useCallback(() => {
    setImproviseState(null);
    addLog('Cancelled improvise');
  }, [addLog]);

  // Emerge: sacrifice a creature to reduce emerge cost by its mana value (with color matching)
  const startEmerge = useCallback((card: Card, rect: DOMRect) => {
    if (!gameState) return;

    const phase = gameState.turn_phase;
    const isMainPhase = phase === 'main1' || phase === 'main2';
    if (!isMainPhase) {
      addLog('Can only cast creatures during a main phase');
      return;
    }

    const creatures = (gameState.players.you.battlefield || []).filter(
      (c: any) => (c.type_line || '').toLowerCase().includes('creature')
    );

    if (creatures.length === 0) {
      addLog('No creatures to sacrifice for emerge');
      return;
    }

    setEmergeState({ card, rect, phase: 'selecting_creature' });
    addLog(`Emerge for ${card.name} — select a creature to sacrifice`);
  }, [gameState, addLog]);

  const completeEmerge = useCallback((creature: Card) => {
    if (!gameState || !emergeState) return;
    const { card } = emergeState;

    // Parse emerge cost
    const emergeMatch = card.oracle_text?.match(/Emerge\s*(\{[^}]+\}(?:\{[^}]+\})*)/i);
    if (!emergeMatch) {
      addLog(`${card.name} has no emerge cost`);
      setEmergeState(null);
      return;
    }
    const emergeCost = parseManaCost(emergeMatch[1]);
    const creatureCMC = calculateCMC(creature.mana_cost);
    const creatureColors: string[] = (creature as any).colors || [];

    // Calculate reduced cost: subtract CMC from generic, then match colors
    const remainingColored: Record<string, number> = { ...(emergeCost.colored || {}) };
    let remainingGeneric = Math.max(0, (emergeCost.generic || 0) - creatureCMC);

    // Color matching: creature's colors can pay for matching colored costs in emerge
    for (const color of creatureColors) {
      if (remainingColored[color] && remainingColored[color] > 0) {
        remainingColored[color]--;
      }
    }

    const reducedCost = { generic: remainingGeneric, colored: remainingColored, xCount: 0 } as any;

    if (!canAffordCost(reducedCost, gameState.players.you.mana_pool)) {
      addLog(`Not enough mana to emerge ${card.name} (sacrificing ${creature.name})`);
      return;
    }

    const newManaPool = spendMana(gameState.players.you.mana_pool, reducedCost);

    // Sacrifice creature, remove card from hand, spend mana
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      newState.players.you.hand = newState.players.you.hand.filter(
        c => c.instance_id !== card.instance_id
      );
      newState.players.you.mana_pool = newManaPool;
      // Sacrifice the creature
      newState.players.you.battlefield = newState.players.you.battlefield.filter(
        (c: any) => c.instance_id !== creature.instance_id
      );
      // Put sacrificed creature in graveyard
      newState.players.you.graveyard = newState.players.you.graveyard || [];
      newState.players.you.graveyard.push(creature);
      return newState;
    });

    addLog(`Sacrificed ${creature.name} (CMC ${creatureCMC}) to emerge ${card.name}`);

    // Fire death/sacrifice triggers for the sacrificed creature
    const dieTriggers = checkTriggersForEvent('creature_died', {
      creature, owner: 'you' as PlayerKey
    }, gameState);
    dieTriggers.forEach(t => addToStack(t));
    const sacTriggers = checkTriggersForEvent('creature_sacrificed', {
      creature, owner: 'you' as PlayerKey
    }, gameState);
    sacTriggers.forEach(t => addToStack(t));
    const permSacTriggers = checkTriggersForEvent('permanent_sacrificed', {
      permanent: creature, owner: 'you' as PlayerKey
    }, gameState);
    permSacTriggers.forEach(t => addToStack(t));

    // Create the creature spell stack item
    const stackItem: StackItem = {
      id: `emerge-${card.card_id}-${Date.now()}`,
      type: 'creature_spell',
      source: { ...card, owner: 'you' } as any,
      effect: { type: 'enter_battlefield', creature: card, owner: 'you' } as Effect,
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now(),
    };

    addToStack(stackItem);
    const newSpellCount = spellsCastThisTurn + 1;
    setSpellsCastThisTurn(newSpellCount);

    // "When you cast" triggers — check for on_cast triggered abilities on the card itself
    // These go on the stack AFTER the spell (so they resolve first — on top)
    if (card.triggered_abilities) {
      (card.triggered_abilities as any[]).forEach((ability: any) => {
        const isOnCast = ability.trigger === 'on_cast' ||
          ability.trigger?.event === 'on_cast' ||
          ability.trigger?.event === 'when_cast';
        if (isOnCast) {
          addToStack({
            id: `cast-trigger-${card.card_id}-${Date.now()}-${Math.random()}`,
            type: 'triggered_ability',
            source: { instance_id: stackItem.id, card_id: card.card_id, name: card.name, owner: 'you' },
            effect: ability.effect,
            requires_input: ability.requires_input || false,
            targeting_data: null,
            resolved: false,
            timestamp: Date.now(),
          });
        }
      });
    }

    setEmergeState(null);
    setSelectedCard(null);
    addLog(`Cast ${card.name} with emerge`);

    const manaSpent = calculateManaSpent(reducedCost);
    fireSpellCastTriggers(card, newSpellCount, gameState, manaSpent);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, emergeState, addLog, addToStack, holdingPriority, resolveStack, spellsCastThisTurn, fireSpellCastTriggers]);

  const cancelEmerge = useCallback(() => {
    setEmergeState(null);
    addLog('Cancelled emerge');
  }, [addLog]);

  // Phyrexian Mana: choose how many Phyrexian pips to pay with life instead of mana
  const startPhyrexianCast = useCallback((card: Card, rect: DOMRect) => {
    if (!gameState) return;

    // Parse Phyrexian pips from mana cost: {G/P}, {W/P}, {U/P}, {B/P}, {R/P}
    const manaCost = card.mana_cost || '';
    const phyrexianRegex = /\{([WUBRG])\/P\}/gi;
    const pips: string[] = [];
    let match;
    while ((match = phyrexianRegex.exec(manaCost)) !== null) {
      pips.push(match[1].toUpperCase());
    }

    if (pips.length === 0) {
      addLog(`${card.name} has no Phyrexian mana symbols`);
      return;
    }

    // Timing check
    const typeLine = (card.type_line || '').toLowerCase();
    const isSorcerySpeed = typeLine.includes('sorcery') || typeLine.includes('creature') ||
      typeLine.includes('enchantment') || typeLine.includes('artifact');
    const phase = gameState.turn_phase;
    const isMainPhase = phase === 'main1' || phase === 'main2';
    if (isSorcerySpeed && !isMainPhase) {
      addLog(`Can only cast ${card.name} during a main phase`);
      return;
    }

    setPhyrexianManaState({ card, rect, phyrexianPips: pips, pipsPayingLife: 0 });
    addLog(`Phyrexian mana for ${card.name} — choose how many pips to pay with life (2 life each)`);
  }, [gameState, addLog]);

  const setPhyrexianPipsPayingLife = useCallback((count: number) => {
    setPhyrexianManaState(prev => prev ? { ...prev, pipsPayingLife: count } : null);
  }, []);

  const confirmPhyrexianCast = useCallback(() => {
    if (!gameState || !phyrexianManaState) return;
    const { card, rect, phyrexianPips, pipsPayingLife } = phyrexianManaState;

    // Build modified mana cost: replace Phyrexian pips with normal colored or remove them
    // Parse the base cost without Phyrexian symbols
    const manaCost = card.mana_cost || '';
    const baseCost = parseManaCost(manaCost.replace(/\{[WUBRG]\/P\}/gi, '')); // Remove Phyrexian pips

    // Add back colored pips that are NOT being paid with life
    const pipsPayingMana = phyrexianPips.slice(pipsPayingLife); // remaining pips paid with mana
    const totalColored: Record<string, number> = { ...(baseCost.colored || {}) };
    for (const color of pipsPayingMana) {
      totalColored[color] = (totalColored[color] || 0) + 1;
    }

    const totalCost = { generic: baseCost.generic || 0, colored: totalColored, xCount: 0 } as any;
    const reduction = getCostReduction(card);
    const lifeCost = pipsPayingLife * 2;

    if (!canAffordCost(totalCost, gameState.players.you.mana_pool, 0, reduction)) {
      addLog(`Not enough mana to cast ${card.name} (paying ${pipsPayingLife} pip${pipsPayingLife !== 1 ? 's' : ''} with life)`);
      return;
    }

    if (gameState.players.you.life <= lifeCost) {
      addLog(`Not enough life to pay ${lifeCost} for Phyrexian mana`);
      return;
    }

    const newManaPool = spendMana(gameState.players.you.mana_pool, totalCost, 0, reduction);

    // Remove from hand, spend mana, pay life
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        players: { ...prev.players, you: {
          ...prev.players.you,
          hand: prev.players.you.hand.filter(c => c.instance_id !== card.instance_id),
          mana_pool: newManaPool,
          life: prev.players.you.life - lifeCost,
        }}
      };
    });

    if (lifeCost > 0) {
      addLog(`Paid ${lifeCost} life for ${pipsPayingLife} Phyrexian pip${pipsPayingLife !== 1 ? 's' : ''}`);
    }

    // Build stack item
    const typeLine = (card.type_line || '').toLowerCase();
    const isCreature = typeLine.includes('creature');
    const isPermanent = isCreature || typeLine.includes('artifact') || typeLine.includes('enchantment') || typeLine.includes('planeswalker');

    const spellEffect = card.spell_effect;
    const requiresTarget = !isPermanent && (
      spellEffect?.target || spellEffect?.valid_targets ||
      spellEffect?.type === 'damage' || spellEffect?.type === 'destroy' ||
      spellEffect?.type === 'buff_creature' || spellEffect?.type === 'exile_target_creature'
    );

    if (requiresTarget) {
      const phyCard = { ...card, _altCostPaid: true, rect } as any;
      setSelectedCard(phyCard);
      setIsTargeting(true);
      setTargetingOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      altCastSnapshot.current = {
        hand: [...gameState.players.you.hand],
        manaPool: { ...gameState.players.you.mana_pool },
        cardName: card.name,
        fullState: JSON.parse(JSON.stringify(gameState)),
      };
      setPhyrexianManaState(null);

      const newSpellCount = spellsCastThisTurn + 1;
      setSpellsCastThisTurn(newSpellCount);
      addLog(`Cast ${card.name} — select a target`);
      return;
    }

    // Non-targeted
    const baseEffect = (isPermanent
      ? isCreature
        ? { type: 'enter_battlefield', creature: card, owner: 'you' }
        : { type: 'enter_battlefield_permanent', permanent: card, owner: 'you' }
      : (spellEffect || { type: 'unknown' })) as Effect;

    const stackItem: StackItem = {
      id: `phyrexian-${card.card_id}-${Date.now()}`,
      type: isPermanent ? (isCreature ? 'creature_spell' : 'permanent_spell') : 'spell',
      source: { ...card, owner: 'you' } as any,
      effect: baseEffect,
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now(),
    };

    addToStack(stackItem);

    // "When you cast" triggers
    if (card.triggered_abilities) {
      (card.triggered_abilities as any[]).forEach((ability: any) => {
        const isOnCast = ability.trigger === 'on_cast' || ability.trigger === 'when_cast' ||
          ability.trigger?.event === 'on_cast' || ability.trigger?.event === 'when_cast';
        if (isOnCast) {
          addToStack({
            id: `cast-trigger-${card.card_id}-${Date.now()}-${Math.random()}`,
            type: 'triggered_ability',
            source: { instance_id: stackItem.id, card_id: card.card_id, name: card.name, owner: 'you' },
            effect: ability.effect,
            requires_input: ability.requires_input || false,
            targeting_data: null,
            resolved: false,
            timestamp: Date.now(),
          });
        }
      });
    }

    const newSpellCount = spellsCastThisTurn + 1;
    setSpellsCastThisTurn(newSpellCount);
    setPhyrexianManaState(null);
    setSelectedCard(null);
    addLog(`Cast ${card.name}`);

    const manaSpent = calculateManaSpent(totalCost, 0, reduction);
    fireSpellCastTriggers(card, newSpellCount, gameState, manaSpent);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, phyrexianManaState, addLog, addToStack, holdingPriority, resolveStack, spellsCastThisTurn, getCostReduction, fireSpellCastTriggers]);

  const cancelPhyrexianCast = useCallback(() => {
    setPhyrexianManaState(null);
    addLog('Cancelled Phyrexian mana cast');
  }, [addLog]);

  // Suspend: exile from hand with time counters (special action, doesn't use the stack)
  const startSuspend = useCallback((card: Card) => {
    if (!gameState) return;

    // Parse suspend cost and counter count from oracle_text
    const suspendMatch = card.oracle_text?.match(/Suspend\s+(\d+)\s*[\u2014—-]\s*(\{[^}]+\}(?:\{[^}]+\})*)/i);
    if (!suspendMatch) {
      addLog(`${card.name} has no suspend cost`);
      return;
    }
    const timeCounters = parseInt(suspendMatch[1], 10);
    const suspendCostStr = suspendMatch[2];
    const parsedCost = parseManaCost(suspendCostStr);

    if (!canAffordCost(parsedCost, gameState.players.you.mana_pool)) {
      addLog(`Not enough mana to suspend ${card.name} (${suspendCostStr})`);
      return;
    }

    const newManaPool = spendMana(gameState.players.you.mana_pool, parsedCost);

    // Remove from hand, place on battlefield as suspended (face-up with counters), track in suspendedCards
    setGameState(prev => {
      if (!prev) return prev;
      const suspendedCard = {
        ...card,
        _suspended: true,
        counters: { time: timeCounters },
        tapped: false,
        summoning_sick: false,
        instance_id: card.instance_id || `suspend-${card.card_id}-${Date.now()}`,
      } as any;
      const newState = {
        ...prev,
        players: {
          ...prev.players,
          you: {
            ...prev.players.you,
            hand: prev.players.you.hand.filter(c => c.instance_id !== card.instance_id),
            battlefield: [...prev.players.you.battlefield, suspendedCard],
            exile: [...(prev.players.you.exile || []), { ...suspendedCard, exileReason: 'suspended' }],
            mana_pool: newManaPool
          }
        },
        suspendedCards: [
          ...(prev.suspendedCards || []),
          { card: suspendedCard, owner: 'you' as PlayerKey, timeCounters }
        ]
      };
      return newState;
    });

    addLog(`Suspended ${card.name} with ${timeCounters} time counter${timeCounters !== 1 ? 's' : ''} (${suspendCostStr})`);
  }, [gameState, addLog]);

  // Accept casting a card whose suspend counters have been fully removed
  const acceptSuspendCast = useCallback(() => {
    if (!suspendCastPending || !gameState) return;
    // Strip suspend-specific metadata from card
    const { exileReason, counters: _counters, ...cleanCard } = suspendCastPending.card as any;
    const card = cleanCard as Card;
    setSuspendCastPending(null);

    // Determine if it's a permanent or spell
    const typeLine = (card.type_line || '').toLowerCase();
    const isCreatureType = typeLine.includes('creature');
    const isArtifact = typeLine.includes('artifact');
    const isEnchantment = typeLine.includes('enchantment');
    const isPermanent = isCreatureType || isArtifact || isEnchantment || typeLine.includes('planeswalker');

    if (isPermanent) {
      // Permanent: create ETB stack item (cast without paying mana cost)
      const stackItem: StackItem = {
        id: `suspend-cast-${card.card_id}-${Date.now()}`,
        type: isCreatureType ? 'creature_spell' : 'permanent_spell',
        source: { ...card, owner: 'you' } as any,
        effect: isPermanent
          ? { type: isCreatureType ? 'enter_battlefield' : 'enter_battlefield_permanent', creature: card, permanent: card, owner: 'you' }
          : (card as any).spell_effect || { type: 'unknown' },
        requires_input: false,
        targeting_data: null,
        resolved: false,
        timestamp: Date.now(),
        wasSuspended: true,
      } as StackItem;
      addToStack(stackItem);
      const newSpellCount = spellsCastThisTurn + 1;
      setSpellsCastThisTurn(newSpellCount);
      addLog(`Cast ${card.name} from suspend (no mana cost)`);
    } else {
      // Instant/sorcery: route through selectCardFromHand with empty mana cost
      const freeCastCard = { ...card, mana_cost: '', _suspendCast: true };
      const fakeRect = { left: 400, top: 300, width: 80, height: 112 } as DOMRect;
      selectCardFromHand(freeCastCard as Card, fakeRect);
      addLog(`Cast ${card.name} from suspend (no mana cost)`);
    }
  }, [suspendCastPending, gameState, addToStack, addLog, spellsCastThisTurn, selectCardFromHand]);

  // Decline casting — card moves to true exile permanently
  const declineSuspendCast = useCallback(() => {
    if (!suspendCastPending) return;
    addLog(`Declined to cast ${suspendCastPending.card.name} — it remains in exile.`);
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      // Strip suspend metadata and move to exile
      const { _suspended, counters: _counters, ...cleanCard } = suspendCastPending.card as any;
      newState.players.you.exile = [...(newState.players.you.exile || []), cleanCard];
      return newState;
    });
    setSuspendCastPending(null);
  }, [suspendCastPending, addLog]);

  // Madness — cast the exiled card for its madness cost, bypassing normal sorcery-speed
  // timing. This mirrors acceptSuspendCast but pays the madness cost instead of free.
  const acceptMadnessCast = useCallback(() => {
    if (madnessCastQueue.length === 0 || !gameState) return;
    const card = madnessCastQueue[0].card;
    const cost: string | undefined = (card as any)._madnessCost || getMadnessCost(card) || undefined;
    if (!cost) {
      addLog(`${card.name} has no madness cost — cannot cast.`);
      return;
    }
    const parsedCost = parseManaCost(cost);
    if (!canAffordCost(parsedCost, gameState.players.you.mana_pool)) {
      addLog(`Not enough mana to cast ${card.name} for madness cost ${cost}.`);
      return;
    }

    // Strip madness metadata, spend mana, remove card from exile.
    const { _madnessPending, _madnessCost, ...cleanCard } = card as any;
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      const you = newState.players.you;
      you.exile = (you.exile || []).filter((c: any) => c.instance_id !== (card as any).instance_id);
      you.mana_pool = spendMana(you.mana_pool, parsedCost);
      return newState;
    });

    const typeLine = (card.type_line || '').toLowerCase();
    const isCreatureType = typeLine.includes('creature');
    const isArtifact = typeLine.includes('artifact');
    const isEnchantment = typeLine.includes('enchantment');
    const isPermanent = isCreatureType || isArtifact || isEnchantment || typeLine.includes('planeswalker');

    if (isPermanent) {
      const stackItem: StackItem = {
        id: `madness-cast-${card.card_id}-${Date.now()}`,
        type: isCreatureType ? 'creature_spell' : 'permanent_spell',
        source: { ...cleanCard, owner: 'you' } as any,
        effect: { type: isCreatureType ? 'enter_battlefield' : 'enter_battlefield_permanent', creature: cleanCard, permanent: cleanCard, owner: 'you' },
        requires_input: false,
        targeting_data: null,
        resolved: false,
        timestamp: Date.now(),
        wasMadness: true,
      } as StackItem;
      addToStack(stackItem);
      setSpellsCastThisTurn(prev => prev + 1);
      addLog(`Madness — cast ${card.name} for ${cost}`);
      setMadnessCastQueue(q => q.slice(1));
    } else {
      // Instant/sorcery: route through the standard targeting machinery so a spell
      // with `valid_targets` starts the targeting arrow UI just like a normal cast.
      // _altCostPaid + empty mana_cost prevents castSpellOnTarget/castSpellWithoutTarget
      // from double-charging mana. _madnessCast is a timing-override flag.
      const castCard = {
        ...cleanCard,
        mana_cost: '',
        _altCostPaid: true,
        _madnessCast: true,
      } as any;
      // Dequeue before handing off — selectCardFromHand may set UI state synchronously.
      setMadnessCastQueue(q => q.slice(1));
      const fakeRect = { left: 400, top: 300, width: 80, height: 112 } as DOMRect;
      selectCardFromHand(castCard as Card, fakeRect);
      addLog(`Madness — cast ${card.name} for ${cost}`);
    }
    setMadnessPromptReady(false);
  }, [madnessCastQueue, gameState, addLog, addToStack, selectCardFromHand]);

  // Decline the madness trigger — card goes from exile to graveyard.
  const declineMadnessCast = useCallback(() => {
    if (madnessCastQueue.length === 0) return;
    const card = madnessCastQueue[0].card;
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      const you = newState.players.you;
      const { _madnessPending, _madnessCost, ...cleanCard } = card as any;
      you.exile = (you.exile || []).filter((c: any) => c.instance_id !== (card as any).instance_id);
      pushToGraveyardOrExile(newState, you, cleanCard);
      return newState;
    });
    addLog(`Declined madness — ${card.name} goes to graveyard.`);
    setMadnessCastQueue(q => q.slice(1));
    setMadnessPromptReady(false);
  }, [madnessCastQueue, addLog]);

  // Miracle — reveal puts a triggered_ability stack item on the stack. The cast
  // decision happens when that trigger resolves (see miracle_cast branch in
  // resolveStack). Timing override is applied via the _miracleCast flag, mirroring
  // madness's _madnessCast.
  const revealMiracle = useCallback(() => {
    if (!miracleRevealPending) return;
    const { card, cost } = miracleRevealPending;
    const triggerStackItem: StackItem = {
      id: `miracle-${(card as any).instance_id || card.card_id}-${Date.now()}`,
      type: 'triggered_ability',
      source: { ...card, owner: 'you' } as any,
      effect: { type: 'miracle_cast', manaCost: cost, card } as any,
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now(),
    } as StackItem;
    addToStack(triggerStackItem);
    addLog(`${card.name} revealed — Miracle trigger goes on the stack.`);
    setMiracleRevealPending(null);
  }, [miracleRevealPending, addToStack, addLog]);

  const declineMiracleReveal = useCallback(() => {
    if (!miracleRevealPending) return;
    addLog(`${miracleRevealPending.card.name} — Miracle not revealed.`);
    setMiracleRevealPending(null);
  }, [miracleRevealPending, addLog]);

  // Accept/decline handlers for the cast prompt that opens when the miracle
  // trigger resolves. Defined below acceptMadnessCast so selectCardFromHand is
  // already available (via the same pattern).
  const acceptMiracleCast = useCallback(() => {
    if (!miracleCastPending || !gameState) return;
    const { card, cost, stackItemId } = miracleCastPending;
    const parsedCost = parseManaCost(cost);
    if (!canAffordCost(parsedCost, gameState.players.you.mana_pool)) {
      addLog(`Not enough mana to cast ${card.name} for miracle cost ${cost}.`);
      return;
    }

    // Snapshot pre-spend mana so cancelTargeting can rewind and re-open the prompt.
    miracleCastRetryRef.current = {
      card,
      cost,
      stackItemId,
      preManaPool: { ...gameState.players.you.mana_pool },
    };

    // Pay the miracle cost and pop the trigger off the stack.
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      newState.players.you.mana_pool = spendMana(newState.players.you.mana_pool, parsedCost);
      return newState;
    });
    setStack(prev => prev.filter(item => item.id !== stackItemId));

    // Route the card through the normal cast pipeline with the cost already paid.
    // _miracleCast lets the sorcery-speed guard wave non-instants through.
    const castCard = {
      ...card,
      mana_cost: '',
      _altCostPaid: true,
      _miracleCast: true,
    } as any;
    setMiracleCastPending(null);
    const fakeRect = { left: 400, top: 300, width: 80, height: 112 } as DOMRect;
    selectCardFromHand(castCard as Card, fakeRect);
    addLog(`Miracle — cast ${card.name} for ${cost}`);
  }, [miracleCastPending, gameState, addLog, selectCardFromHand]);

  const declineMiracleCast = useCallback(() => {
    if (!miracleCastPending) return;
    const { card, stackItemId } = miracleCastPending;
    setStack(prev => prev.filter(item => item.id !== stackItemId));
    addLog(`Declined miracle — ${card.name} stays in hand.`);
    setMiracleCastPending(null);
  }, [miracleCastPending, addLog]);

  // Ninjutsu — activated from hand during combat_blockers. Returns an unblocked
  // attacker you control to hand; the ninjutsu card enters tapped + attacking as
  // its replacement. Timing is enforced here; the swap UI is driven by ninjutsuState.
  const activateNinjutsu = useCallback((card: Card) => {
    if (!gameState) return;
    if (gameState.turn_phase !== 'combat_blockers') {
      addLog(`${card.name}: Ninjutsu can only be activated during the Declare Blockers step.`);
      return;
    }
    const cost = getNinjutsuCost(card);
    if (!cost) {
      addLog(`${card.name} has no ninjutsu ability.`);
      return;
    }
    const parsedCost = parseManaCost(cost);
    if (!canAffordCost(parsedCost, gameState.players.you.mana_pool)) {
      addLog(`Not enough mana to activate ninjutsu on ${card.name} (costs ${cost}).`);
      return;
    }
    const attackers = (gameState.players.you.battlefield || []).filter((c: Permanent) => c.attacking);
    if (attackers.length === 0) {
      addLog('Ninjutsu needs an unblocked attacker you control — none available.');
      return;
    }
    setNinjutsuState({ card, cost });
    addLog(`Ninjutsu — select an unblocked attacker to swap with ${card.name}.`);
  }, [gameState, addLog]);

  const cancelNinjutsu = useCallback(() => {
    if (!ninjutsuState) return;
    addLog(`Cancelled ninjutsu activation for ${ninjutsuState.card.name}.`);
    setNinjutsuState(null);
  }, [ninjutsuState, addLog]);

  const completeNinjutsu = useCallback((attacker: Permanent) => {
    if (!gameState || !ninjutsuState) return;
    const { card, cost } = ninjutsuState;
    const parsedCost = parseManaCost(cost);
    if (!canAffordCost(parsedCost, gameState.players.you.mana_pool)) {
      addLog(`Not enough mana to activate ninjutsu (costs ${cost}).`);
      return;
    }

    // Strip combat/permanent flags from the returned creature so it re-enters
    // hand as a plain card. Keep all card-data fields via spread.
    const {
      tapped: _t,
      attacking: _a,
      blocking: _b,
      summoning_sick: _s,
      counters: _c,
      damage: _d,
      buffPower: _bp,
      buffToughness: _bt,
      prowessBonus: _pb,
      attachedRoles: _ar,
      protection: _p,
      protection_until_end_of_turn: _peot,
      ...returningCard
    } = attacker as any;

    // Pay the activation cost: spend mana AND return the attacker to hand. The
    // ninjutsu card stays in hand while the ability is on the stack — that's why
    // a removal spell on the stack can't interrupt the swap.
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      const you = newState.players.you;
      you.mana_pool = spendMana(you.mana_pool, parsedCost);
      you.battlefield = (you.battlefield || []).filter((c: any) => c.instance_id !== attacker.instance_id);
      removeAttachedAuras(newState, attacker.instance_id || '');
      you.hand = [...(you.hand || []), returningCard];
      return newState;
    });

    addLog(`Ninjutsu — paid ${cost} and returned ${attacker.name} to hand. Put ${card.name} onto battlefield added to stack.`);

    // LTB triggers for the returned creature fire off the cost being paid.
    const postState = JSON.parse(JSON.stringify(gameState)) as GameState;
    postState.players.you.battlefield = postState.players.you.battlefield.filter(
      (c: any) => c.instance_id !== attacker.instance_id
    );
    const ltbTriggers = checkTriggersForEvent('permanent_left', {
      permanent: attacker,
      owner: 'you' as PlayerKey,
    }, postState);
    ltbTriggers.forEach(t => addToStack(t));

    // Put the ninjutsu ability on the stack. When it resolves, the hand-card
    // moves to the battlefield tapped and attacking (handled in resolveStack).
    const stackItem: StackItem = {
      id: `ninjutsu-${card.card_id}-${Date.now()}`,
      type: 'activated_ability',
      source: { ...card, owner: 'you' } as any,
      effect: { type: 'ninjutsu_enter', card } as any,
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now(),
    } as StackItem;
    addToStack(stackItem);

    setNinjutsuState(null);

    if (!holdingPriority) {
      setTimeout(() => resolveStackRef.current(), 100);
    }
  }, [gameState, ninjutsuState, addLog, addToStack, holdingPriority]);

  // Cycling: pay mana cost, discard card from hand, draw a card (or tutor for typed cycling)
  const activateCycling = useCallback((card: Card) => {
    if (!gameState) return;

    const oracleText = card.oracle_text || '';

    // Detect typed cycling first: "Islandcycling {1}", "Basic landcycling {1}", "Swampcycling {2}", etc.
    // Typed cycling searches library for a matching card instead of drawing
    const typedCyclingMatch = oracleText.match(
      /([A-Za-z]+(?: land)?cycling)\s+((?:\{[^}]+\})+)/i
    );

    // Then check for basic cycling: "Cycling {2}" (must be standalone "Cycling", not part of a typed word)
    const basicCyclingMatch = oracleText.match(
      /(?:^|[.\n])?\s*Cycling\s+((?:\{[^}]+\})+)/
    );

    const cyclingMatch = typedCyclingMatch || basicCyclingMatch;
    if (!cyclingMatch) {
      addLog(`${card.name} does not have cycling`);
      return;
    }

    const isTypedCycling = !!typedCyclingMatch;
    const cyclingLabel = isTypedCycling ? typedCyclingMatch![1] : 'Cycling';
    const manaCostStr = isTypedCycling ? typedCyclingMatch![2] : basicCyclingMatch![1];
    const parsedCost = parseManaCost(manaCostStr);

    // Check mana affordability
    if (!canAffordCost(parsedCost, gameState.players.you.mana_pool)) {
      addLog(`Not enough mana to activate ${cyclingLabel} on ${card.name} (costs ${manaCostStr})`);
      return;
    }

    // Pay mana
    const newManaPool = spendMana(gameState.players.you.mana_pool, parsedCost);

    // Move card from hand to graveyard and spend mana
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        players: {
          ...prev.players,
          you: {
            ...prev.players.you,
            hand: prev.players.you.hand.filter(c => c.instance_id !== card.instance_id),
            graveyard: [...(prev.players.you.graveyard || []), card],
            mana_pool: newManaPool,
          }
        }
      };
    });

    // Determine effect: basic cycling draws, typed cycling tutors
    let effect: any;
    if (isTypedCycling) {
      // Parse the type from the cycling label (e.g., "Island" from "Islandcycling", "Basic land" from "Basic landcycling")
      const typePrefix = cyclingLabel.replace(/cycling$/i, '').trim();
      effect = {
        type: 'tutor',
        destination: 'hand',
        filter: { type: 'typed_cycling', typedCyclingType: typePrefix.toLowerCase() },
      };
      addLog(`${cyclingLabel} — ${card.name} (paid ${manaCostStr}) — search your library`);
    } else {
      effect = { type: 'draw_cards', amount: 1 };
      addLog(`Cycled ${card.name} (paid ${manaCostStr}) — drawing a card`);
    }

    const stackItem: StackItem = {
      id: `cycling-${card.card_id}-${Date.now()}`,
      type: 'activated_ability',
      source: { ...card, owner: 'you' } as any,
      effect,
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now(),
    };

    addToStack(stackItem);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, addLog, addToStack, holdingPriority, resolveStack]);

  // Transmute: sorcery-speed only. Pay transmute cost + discard card, then tutor library for
  // a card with the same mana value as the discarded card (put it into hand, shuffle).
  const activateTransmute = useCallback((card: Card) => {
    if (!gameState) return;

    if (!canCastSorcerySpeed()) {
      addLog(`Transmute only as a sorcery — can't activate ${card.name} right now.`);
      return;
    }

    const oracleText = card.oracle_text || '';
    const transmuteMatch = oracleText.match(/Transmute\s+((?:\{[^}]+\})+)/i);
    if (!transmuteMatch) {
      addLog(`${card.name} does not have transmute`);
      return;
    }

    const manaCostStr = transmuteMatch[1];
    const parsedCost = parseManaCost(manaCostStr);

    if (!canAffordCost(parsedCost, gameState.players.you.mana_pool)) {
      addLog(`Not enough mana to transmute ${card.name} (costs ${manaCostStr})`);
      return;
    }

    const targetCmc = calculateCMC(card.mana_cost || '');
    const newManaPool = spendMana(gameState.players.you.mana_pool, parsedCost);

    // Pay mana and discard the card from hand to graveyard.
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        players: {
          ...prev.players,
          you: {
            ...prev.players.you,
            hand: prev.players.you.hand.filter(c => c.instance_id !== card.instance_id),
            graveyard: [...(prev.players.you.graveyard || []), card],
            mana_pool: newManaPool,
          }
        }
      };
    });

    addLog(`Transmute — discarded ${card.name} (paid ${manaCostStr}) — search your library for a card with mana value ${targetCmc}`);

    const stackItem: StackItem = {
      id: `transmute-${card.card_id}-${Date.now()}`,
      type: 'activated_ability',
      source: { ...card, owner: 'you' } as any,
      effect: {
        type: 'tutor',
        destination: 'hand',
        filter: { type: 'transmute', exactCmc: targetCmc },
      },
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now(),
    };

    addToStack(stackItem);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, addLog, addToStack, holdingPriority, resolveStack, canCastSorcerySpeed]);

  // Channel: pay mana cost + discard card from hand, then resolve channel effect (may require targeting)
  const activateChannel = useCallback((card: Card, rect: DOMRect) => {
    if (!gameState) return;

    // Get channel data from card_data
    const channelData = (card as any).channel;
    if (!channelData) {
      addLog(`${card.name} does not have channel`);
      return;
    }

    const manaCostStr = channelData.cost || '';
    const parsedCost = parseManaCost(manaCostStr);

    // Check mana affordability
    if (!canAffordCost(parsedCost, gameState.players.you.mana_pool)) {
      addLog(`Not enough mana to channel ${card.name} (costs ${manaCostStr})`);
      return;
    }

    // Pay mana and discard card to graveyard
    const newManaPool = spendMana(gameState.players.you.mana_pool, parsedCost);
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        players: {
          ...prev.players,
          you: {
            ...prev.players.you,
            hand: prev.players.you.hand.filter(c => c.instance_id !== card.instance_id),
            graveyard: [...(prev.players.you.graveyard || []), card],
            mana_pool: newManaPool,
          }
        }
      };
    });

    addLog(`Channel — discarded ${card.name} (paid ${manaCostStr})`);

    const channelEffect = channelData.effect;

    // Check if the channel effect requires targeting
    const requiresTarget = channelEffect.target ||
      channelEffect.valid_targets ||
      channelEffect.type === 'damage' ||
      channelEffect.type === 'buff_creature' ||
      channelEffect.type === 'buff_until_eot' ||
      channelEffect.type === 'destroy';

    if (requiresTarget) {
      // Create a pseudo-card with the channel effect as spell_effect so the
      // existing targeting + castSpellOnTarget pipeline handles it.
      // Mark _channelCast so castSpellOnTarget knows the card is already discarded.
      const channelCard = {
        ...card,
        spell_effect: channelEffect,
        mana_cost: '', // already paid
        _channelCast: true,
        rect,
      } as any;
      setSelectedCard(channelCard as SelectedCard);
      setIsTargeting(true);
      setTargetingOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      addLog(`Select a target for ${card.name}'s channel ability`);
    } else {
      // No targeting needed — put effect directly on stack
      const stackItem: StackItem = {
        id: `channel-${card.card_id}-${Date.now()}`,
        type: 'activated_ability',
        source: { ...card, owner: 'you' } as any,
        effect: channelEffect,
        requires_input: false,
        targeting_data: null,
        resolved: false,
        timestamp: Date.now(),
      };
      addToStack(stackItem);

      if (!holdingPriority) {
        setTimeout(() => resolveStack(), 100);
      }
    }
  }, [gameState, addLog, addToStack, holdingPriority, resolveStack]);

  // Returns { graveyard, exile } spreads for a player object, respecting replacement effects.
  const graveyardZones = (card: any, player: any, state: GameState) => {
    if (hasReplaceGraveyardWithExile(state) || (player as any).graveyardGoesToExile) {
      return { graveyard: player.graveyard || [], exile: [...(player.exile || []), card] };
    }
    return { graveyard: [...(player.graveyard || []), card], exile: player.exile || [] };
  };

  // Convert a ManaCost object or legacy string to a mana cost string like "{2}{R}"
  const manaToString = (mana: any): string => {
    if (!mana) return '';
    if (typeof mana === 'string') return mana;
    let s = '';
    if (mana.generic) s += `{${mana.generic}}`;
    if (mana.colored) {
      ['W', 'U', 'B', 'R', 'G', 'C'].forEach((c) => {
        for (let i = 0; i < (mana.colored[c] || 0); i++) s += `{${c}}`;
      });
    }
    return s;
  };

  // Activate ability on permanents
  // MTG activation sequence: validate → sacrifice → pay mana/tap → choose targets → stack
  const activateAbility = useCallback((permanent: Permanent, abilityIndex: number, _sacrificedCreature?: Permanent) => {
    if (!gameState) return;

    // Blood Moon / Harbinger: nonbasic lands lose all abilities
    const permTypeLine = (permanent.type_line || '').toLowerCase();
    const isNonbasicLand = permTypeLine.includes('land') &&
      !(permanent as any).isBasic && !permTypeLine.match(/\bbasic\b/);
    if (isNonbasicLand && getNonbasicLandOverride() !== null) {
      addLog(`${permanent.name} has lost its abilities`);
      return;
    }

    const allBF = [...gameState.players.you.battlefield, ...gameState.players.opponent.battlefield];
    const effectiveAbilities = getEffectiveActivatedAbilities(permanent, allBF);
    const ability = effectiveAbilities[abilityIndex];
    if (!ability) return;

    // Equip is sorcery-speed: requires main phase and empty stack
    if (ability.effect?.type === 'equip' && !canCastSorcerySpeed()) {
      if (stack.length > 0) {
        addLog(`Cannot equip ${permanent.name} — stack must be empty`);
      } else {
        addLog(`Cannot equip ${permanent.name} — can only equip during a main phase`);
      }
      return;
    }

    const cost = ability.cost;

    // 1. Check tap prerequisite (can't activate if tapped and requires tap)
    if (cost && typeof cost !== 'string' && cost.tap && permanent.tapped) {
      addLog(`${permanent.name} is already tapped`);
      return;
    }

    // 1b. Summoning sickness gate (MTG 302.1) — creatures without haste can't
    // pay tap costs on the turn they entered. Applies to native AND granted abilities.
    if (cost && typeof cost !== 'string' && cost.tap && !canActivateTapAbility(permanent, allBF)) {
      addLog(`${permanent.name} has summoning sickness — can't tap for abilities this turn`);
      return;
    }

    // 1c. Planeswalker loyalty cost & once-per-turn gate (MTG 606.5).
    // Loyalty costs are sorcery-speed and once per turn per planeswalker.
    const loyaltyCost = (cost && typeof cost !== 'string') ? (cost as any).loyalty as number | undefined : undefined;
    if (loyaltyCost !== undefined && isPlaneswalker(permanent)) {
      if (!canCastSorcerySpeed()) {
        addLog(`Cannot activate ${permanent.name}'s ability — planeswalker abilities are sorcery-speed`);
        return;
      }
      if ((permanent as any)._loyaltyActivatedThisTurn) {
        addLog(`${permanent.name} has already activated a loyalty ability this turn`);
        return;
      }
      const current = getLoyalty(permanent);
      if (loyaltyCost < 0 && current + loyaltyCost < 0) {
        addLog(`Not enough loyalty: ${permanent.name} has ${current}, needs ${-loyaltyCost}`);
        return;
      }
    }

    // 2. Check mana affordability early (fail fast, but don't spend yet)
    if (cost && typeof cost !== 'string' && cost.mana) {
      const manaString = manaToString(cost.mana);
      const parsedCost = parseManaCost(manaString);
      if (!canAffordCost(parsedCost, gameState.players.you.mana_pool)) {
        addLog(`Not enough mana to activate ${permanent.name}'s ability`);
        return;
      }
    }

    // 2b. Check activation condition (e.g., power >= 3)
    if (ability.condition?.type === 'power_gte') {
      const currentPower = calculatePower(permanent);
      if (currentPower < ability.condition.value) {
        addLog(`Cannot activate: ${permanent.name}'s power is ${currentPower} (need >= ${ability.condition.value})`);
        return;
      }
    }

    // 2b2. Check metalcraft condition (control 3+ artifacts)
    if (ability.condition?.type === 'control_artifacts_gte') {
      const artifactCount = gameState.players.you.battlefield.filter(
        (c: any) => (c.type_line || '').toLowerCase().includes('artifact')
      ).length;
      if (artifactCount < ability.condition.value) {
        addLog(`Cannot activate: you control ${artifactCount} artifact(s) (need >= ${ability.condition.value})`);
        return;
      }
    }

    // 2c. Handle copy_spell from activated ability — enter stack spell targeting
    if (ability.effect?.type === 'copy_spell') {
      const onlyYours = ability.effect.target === 'instant_or_sorcery_you_control';
      const validTargets = stack.filter(item =>
        item.type === 'spell' && !item.resolved && (!onlyYours || (item.source as any).owner === 'you')
      );
      if (validTargets.length === 0) {
        addLog('No valid spell on the stack to target');
        return;
      }
      // Pay mana cost
      if (cost && typeof cost !== 'string' && cost.mana) {
        const manaString = manaToString(cost.mana);
        const parsedCost = parseManaCost(manaString);
        const newManaPool = spendMana(gameState.players.you.mana_pool, parsedCost);
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            players: { ...prev.players, you: { ...prev.players.you, mana_pool: newManaPool } }
          };
        });
      }
      // Pay tap cost
      if (cost && typeof cost !== 'string' && cost.tap) {
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            players: {
              ...prev.players,
              you: {
                ...prev.players.you,
                battlefield: prev.players.you.battlefield.map(c =>
                  c.instance_id === permanent.instance_id ? { ...c, tapped: true } : c
                )
              }
            }
          };
        });
      }
      setCopyTargetingState({
        phase: 'targeting_spell',
        sourceCard: permanent as any,
        copiedStackItem: null,
        originalTargeting: null,
        onlyYourSpells: onlyYours,
        isActivatedAbility: true
      });
      addLog(`${permanent.name}'s ability — select an instant or sorcery${onlyYours ? ' you control' : ''} on the stack`);
      return;
    }

    // 3a. Handle self-sacrifice cost — permanent sacrifices itself (Wasteland, etc.)
    if (cost && typeof cost !== 'string' && cost.sacrifice?.self && !_sacrificedCreature) {
      if (ability.requires_target) {
        // Defer self-sacrifice until target is chosen
        const permanentElement = document.querySelector(`[data-instance-id="${permanent.instance_id}"]`);
        const rect = permanentElement?.getBoundingClientRect();
        const origin = rect
          ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
          : { x: 0, y: 0 };
        setActivatedAbilityTargeting({
          permanent, ability, abilityIndex, origin,
          pendingSacrifice: permanent
        });
        setIsTargeting(true);
        setTargetingOrigin(origin);
        addLog(`Select a target for ${permanent.name}'s ability`);
        return;
      }
      // No targeting — treat self as the sacrificed creature and continue
      _sacrificedCreature = permanent;
    }

    // 3b. Sacrifice cost — open sacrificeMode. For requires_target abilities,
    //     sacrifice is deferred via activatedAbilityTargeting.pendingSacrifice
    //     and finalized in completeActivatedAbilityWithTarget once a target lands.
    if (cost && typeof cost !== 'string' && cost.sacrifice && !_sacrificedCreature) {
      const sacType = cost.sacrifice.type || 'creature';
      const sacCount = cost.sacrifice.count || 1;
      // Snapshot for any-color mana cancel rewind (legacy behavior preserved)
      const isAnyColorMana = ability.effect?.type === 'add_mana_any_color';
      const preActivationSnapshot = isAnyColorMana && gameState
        ? JSON.parse(JSON.stringify(gameState)) as GameState : undefined;
      const preActivationStackLen = isAnyColorMana ? stack.length : undefined;

      setSacrificeMode({
        reason: `${permanent.name}'s ability`,
        filter: { types: [sacType], controller: 'you', excludeInstanceId: permanent.instance_id },
        count: sacCount,
        selected: [],
        onComplete: (selected) => {
          // Defer sacrifice when targeting is required. The pending-sacrifice
          // bridge today is singular (activatedAbilityTargeting.pendingSacrifice
          // + completeActivatedAbilityWithTarget). count>1 + requires_target
          // would need a wider bridge — no card needs that combo today.
          if (ability.requires_target) {
            if (selected.length > 1) {
              console.warn(
                `Activated ability with sacrifice count>1 + requires_target is not supported (${permanent.name}); using first sac only.`
              );
            }
            const creature = selected[0];
            const permanentElement = document.querySelector(`[data-instance-id="${permanent.instance_id}"]`);
            const rect = permanentElement?.getBoundingClientRect();
            const origin = rect
              ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
              : { x: 0, y: 0 };
            setActivatedAbilityTargeting({
              permanent, ability, abilityIndex, origin,
              pendingSacrifice: creature
            });
            setIsTargeting(true);
            setTargetingOrigin(origin);
            addLog(`Select a target for ${permanent.name}'s ability`);
            return;
          }

          // No targeting — execute sacrifice + costs inline. Iterate `selected`
          // for BF removal, graveyard push, and persist re-entry. Mana/tap costs
          // pay once.
          setGameState(prev => {
            if (!prev) return prev;
            const newState = JSON.parse(JSON.stringify(prev)) as GameState;
            newState._yourPermanentLeftThisTurn = true;
            for (const creature of selected) {
              newState.players.you.battlefield = newState.players.you.battlefield.filter(
                (c: Permanent) => c.instance_id !== creature.instance_id
              );
              pushToGraveyardOrExile(newState, newState.players.you, creature);
              const hasPersist = creature.keywords?.includes('persist');
              const hasMinusCounters = (creature.counters?.['-1/-1'] || 0) > 0;
              if (hasPersist && !hasMinusCounters) {
                const ownerKey = ((creature as any).cardOwner || 'you') as PlayerKey;
                newState.players[ownerKey].graveyard = (newState.players[ownerKey].graveyard || []).filter(
                  (c: any) => c.instance_id !== creature.instance_id
                );
                newState.players.you.battlefield.push(
                  { ...creature, tapped: false, summoning_sick: true,
                    counters: { ...(creature.counters || {}), '-1/-1': 1 }, attacking: false } as any
                );
              }
            }
            if (cost && typeof cost !== 'string' && cost.mana) {
              const manaString = manaToString(cost.mana);
              const parsedCost = parseManaCost(manaString);
              newState.players.you.mana_pool = spendMana(newState.players.you.mana_pool, parsedCost);
            }
            if (cost && typeof cost !== 'string' && cost.tap) {
              const found = newState.players.you.battlefield.find(
                (c: Permanent) => c.instance_id === permanent.instance_id
              );
              if (found) (found as any).tapped = true;
            }
            return newState;
          });

          // Triggers off a post-sacrifice snapshot. Build the snapshot by
          // applying every sac to a deep clone, then dispatch per-creature.
          const postState = JSON.parse(JSON.stringify(gameState)) as GameState;
          for (const creature of selected) {
            postState.players.you.battlefield = postState.players.you.battlefield.filter(
              (c: Permanent) => c.instance_id !== creature.instance_id
            );
            pushToGraveyardOrExile(postState, postState.players.you, creature);
          }
          const sacBatch2: StackItem[] = [];
          for (const creature of selected) {
            sacBatch2.push(...checkTriggersForEvent('creature_died', { creature, owner: 'you' as PlayerKey }, postState));
            sacBatch2.push(...checkTriggersForEvent('creature_sacrificed', { creature, owner: 'you' as PlayerKey }, postState));
            sacBatch2.push(...checkTriggersForEvent('permanent_sacrificed', { permanent: creature, owner: 'you' as PlayerKey }, postState));
            sacBatch2.push(...checkTriggersForEvent('permanent_left', { permanent: creature, owner: 'you' as PlayerKey }, postState));
            if ((creature.type_line || '').toLowerCase().includes('land')) {
              sacBatch2.push(...checkTriggersForEvent('land_to_graveyard', { land: creature, owner: 'you' as PlayerKey }, postState));
            }
            const hasPersist = creature.keywords?.includes('persist');
            const hasMinusCounters = (creature.counters?.['-1/-1'] || 0) > 0;
            if (hasPersist && !hasMinusCounters) {
              addLog(`${creature.name} returns to the battlefield with a -1/-1 counter (persist).`);
              const returned = {
                ...creature, tapped: false, summoning_sick: true,
                counters: { ...(creature.counters || {}), '-1/-1': 1 }, attacking: false
              };
              postState.players.you.graveyard = postState.players.you.graveyard.filter(
                (c: Permanent) => c.instance_id !== creature.instance_id
              );
              postState.players.you.battlefield.push(returned);
              sacBatch2.push(...checkTriggersForEvent('creature_entered', { creature: returned, wasEvoked: false }, postState));
            }
          }
          // sacBatch2 is dispatched LAST, after the ability is on the stack —
          // MTG rule: cost-payment triggers go on top of the activated ability.

          const sacNames = selected.map(c => c.name).join(', ');

          // Mana abilities resolve immediately (don't use the stack)
          const isManaAbility = ability.effect?.type === 'add_mana' || ability.effect?.type === 'add_mana_any_color';
          if (isManaAbility) {
            if (ability.effect.type === 'add_mana' && ability.effect.mana) {
              setGameState(prev => {
                if (!prev) return prev;
                const manaPool = { ...prev.players.you.mana_pool };
                Object.entries(ability.effect.mana).forEach(([color, amt]) => {
                  manaPool[color] = (manaPool[color] || 0) + (amt as number);
                });
                return { ...prev, players: { ...prev.players, you: { ...prev.players.you, mana_pool: manaPool } } };
              });
              const manaLabel = Object.entries(ability.effect.mana).map(([c, a]) => `{${c}}`.repeat(a as number)).join('');
              addLog(`Sacrificed ${sacNames}, ${permanent.name}: added ${manaLabel} to mana pool`);
            } else {
              setManaColorSelection({
                sourceCard: permanent,
                stackItemId: '',
                amount: ability.effect.amount || 1,
                preActivationState: preActivationSnapshot,
                preActivationStackLength: preActivationStackLen,
              });
              addLog(`Sacrificed ${sacNames}, ${permanent.name} — choose a color`);
            }
            // Mana ability resolves outside the stack; triggers go on the stack now.
            batchAndOrderTriggers(sacBatch2);
            return;
          }

          // Non-mana ability — push to stack FIRST, then sac triggers go on top.
          // Effects that read sacrificedCreature (singular) get selected[0];
          // new-style effects read sacrificedCreatures (array).
          const stackItem: StackItem = {
            id: `ability-${permanent.card_id}-${Date.now()}`,
            type: 'activated_ability',
            source: { ...permanent, owner: 'you' } as any,
            effect: { ...ability.effect, sacrificedCreature: selected[0], sacrificedCreatures: selected },
            requires_input: false,
            targeting_data: null,
            resolved: false,
            timestamp: Date.now()
          };
          addToStack(stackItem);
          batchAndOrderTriggers(sacBatch2);
          addLog(`Sacrificed ${sacNames}, activated ${permanent.name}'s ability`);
          if (!holdingPriority) {
            setTimeout(() => resolveStack(), 100);
          }
        },
        onCancel: () => addLog('Cancelled sacrifice'),
      });
      addLog(`Select a creature to sacrifice for ${permanent.name}'s ability`);
      return;
    }

    // 4. Handle targeting — enter targeting mode (costs deferred until target chosen)
    // Equip always requires targeting a creature, even if requires_target wasn't set explicitly
    if (ability.requires_target || ability.effect?.type === 'equip') {
      const permanentElement = document.querySelector(`[data-instance-id="${permanent.instance_id}"]`);
      const rect = permanentElement?.getBoundingClientRect();
      const origin = rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : { x: 0, y: 0 };

      setActivatedAbilityTargeting({
        permanent,
        ability,
        abilityIndex,
        origin
      });
      setIsTargeting(true);
      setTargetingOrigin(origin);
      addLog(`Select a target for ${permanent.name}'s ability`);
      return;
    }

    // 5. No targeting needed — pay costs and put directly on stack

    // Save pre-activation snapshot for any-color mana abilities so cancel can undo everything
    const isAnyColorMana = ability.effect?.type === 'add_mana_any_color';
    const preActivationSnapshot = isAnyColorMana && gameState
      ? JSON.parse(JSON.stringify(gameState)) as GameState : undefined;
    const preActivationStackLen = isAnyColorMana ? stack.length : undefined;

    // Execute self-sacrifice if applicable (no-targeting path)
    if (_sacrificedCreature) {
      const sacrificed = _sacrificedCreature;
      setGameState(prev => {
        if (!prev) return prev;
        const newState = JSON.parse(JSON.stringify(prev)) as GameState;
        // Remove from controller's battlefield
        newState.players.you.battlefield = newState.players.you.battlefield.filter(
          (c: Permanent) => c.instance_id !== sacrificed.instance_id
        );
        // Route to owner's graveyard (auto-routes via cardOwner)
        pushToGraveyardOrExile(newState, newState.players.you, sacrificed);
        // Persist: return to battlefield with -1/-1 counter
        const hasPersist = sacrificed.keywords?.includes('persist');
        const hasMinusCounters = (sacrificed.counters?.['-1/-1'] || 0) > 0;
        if (hasPersist && !hasMinusCounters) {
          const ownerKey = ((sacrificed as any).cardOwner || 'you') as PlayerKey;
          newState.players[ownerKey].graveyard = (newState.players[ownerKey].graveyard || []).filter(
            (c: any) => c.instance_id !== sacrificed.instance_id
          );
          newState.players.you.battlefield.push(
            { ...sacrificed, tapped: false, summoning_sick: true,
              counters: { ...(sacrificed.counters || {}), '-1/-1': 1 }, attacking: false } as any
          );
        }
        return newState;
      });
      // Dispatch death/leaves triggers
      const postState = JSON.parse(JSON.stringify(gameState)) as GameState;
      postState.players.you.battlefield = postState.players.you.battlefield.filter(
        (c: Permanent) => c.instance_id !== sacrificed.instance_id
      );
      pushToGraveyardOrExile(postState, postState.players.you, sacrificed);
      const sacBatch: StackItem[] = [];
      sacBatch.push(...checkTriggersForEvent('creature_died', {
        creature: sacrificed, owner: 'you' as PlayerKey
      }, postState));
      sacBatch.push(...checkTriggersForEvent('creature_sacrificed', {
        creature: sacrificed, owner: 'you' as PlayerKey
      }, postState));
      sacBatch.push(...checkTriggersForEvent('permanent_sacrificed', {
        permanent: sacrificed, owner: 'you' as PlayerKey
      }, postState));
      sacBatch.push(...checkTriggersForEvent('permanent_left', {
        permanent: sacrificed, owner: 'you' as PlayerKey
      }, postState));
      if ((sacrificed.type_line || '').toLowerCase().includes('land')) {
        sacBatch.push(...checkTriggersForEvent('land_to_graveyard', {
          land: sacrificed, owner: 'you' as PlayerKey
        }, postState));
      }
      // Persist: fire ETB triggers
      const hasPersist = sacrificed.keywords?.includes('persist');
      const hasMinusCounters = (sacrificed.counters?.['-1/-1'] || 0) > 0;
      if (hasPersist && !hasMinusCounters) {
        addLog(`${sacrificed.name} returns to the battlefield with a -1/-1 counter (persist).`);
        const returned = {
          ...sacrificed, tapped: false, summoning_sick: true,
          counters: { ...(sacrificed.counters || {}), '-1/-1': 1 }, attacking: false
        };
        postState.players.you.graveyard = postState.players.you.graveyard.filter(
          (c: Permanent) => c.instance_id !== sacrificed.instance_id
        );
        postState.players.you.battlefield.push(returned);
        sacBatch.push(...checkTriggersForEvent('creature_entered', {
          creature: returned, wasEvoked: false
        }, postState));
      }
      batchAndOrderTriggers(sacBatch);
    }

    if (cost && typeof cost !== 'string' && cost.mana) {
      const manaString = manaToString(cost.mana);
      const parsedCost = parseManaCost(manaString);
      const newManaPool = spendMana(gameState.players.you.mana_pool, parsedCost);
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: {
            ...prev.players,
            you: { ...prev.players.you, mana_pool: newManaPool }
          }
        };
      });
    }

    if (cost && typeof cost !== 'string' && cost.tap) {
      setGameState(prev => {
        if (!prev) return prev;
        const newBattlefield = prev.players.you.battlefield.map(c =>
          c.instance_id === permanent.instance_id ? { ...c, tapped: true } : c
        );
        return {
          ...prev,
          players: {
            ...prev.players,
            you: { ...prev.players.you, battlefield: newBattlefield }
          }
        };
      });
    }

    // Pay loyalty cost (planeswalkers): adjust loyalty, mark activated this turn,
    // and run 0-loyalty SBA. Routed through addLoyalty helper so future
    // proliferate / counter manipulation has a single point to special-case PWs.
    if (loyaltyCost !== undefined && isPlaneswalker(permanent)) {
      setGameState(prev => {
        if (!prev) return prev;
        const newState = JSON.parse(JSON.stringify(prev)) as GameState;
        const ownerKey: PlayerKey = newState.players.you.battlefield.some(
          (c: any) => c.instance_id === permanent.instance_id
        ) ? 'you' : 'opponent';
        const live = newState.players[ownerKey].battlefield.find(
          (c: any) => c.instance_id === permanent.instance_id
        ) as Permanent | undefined;
        if (!live) return newState;
        const newLoyalty = addLoyalty(live, loyaltyCost);
        (live as any)._loyaltyActivatedThisTurn = true;
        addLog(`${permanent.name}: ${loyaltyCost > 0 ? '+' : ''}${loyaltyCost} loyalty (now ${newLoyalty}).`);
        if (newLoyalty <= 0) {
          newState.players[ownerKey].battlefield = newState.players[ownerKey].battlefield.filter(
            (c: any) => c.instance_id !== permanent.instance_id
          );
          pushToGraveyardOrExile(newState, newState.players[ownerKey], live);
          newState._dyingCreatures = newState._dyingCreatures || [];
          newState._dyingCreatures.push({ creature: live, owner: ownerKey });
          newState._leavingPermanents = newState._leavingPermanents || [];
          newState._leavingPermanents.push({ permanent: live, owner: ownerKey });
          addLog(`${permanent.name} has 0 loyalty and is sent to the graveyard.`);
        }
        return newState;
      });
    }

    // Mana abilities don't use the stack — resolve immediately
    const isManaAbility = ability.effect?.type === 'add_mana' || ability.effect?.type === 'add_mana_any_color';
    if (isManaAbility) {
      // Discard entire hand if required (Lion's Eye Diamond)
      if (ability.effect.discard_hand) {
        setGameState(prev => {
          if (!prev) return prev;
          const newState = JSON.parse(JSON.stringify(prev)) as GameState;
          const hand = newState.players.you.hand || [];
          hand.forEach((card: any) => pushToGraveyardOrExile(newState, newState.players.you, card));
          newState.players.you.hand = [];
          return newState;
        });
        const handSize = gameState.players.you.hand?.length || 0;
        if (handSize > 0) {
          addLog(`Discarded entire hand (${handSize} card${handSize !== 1 ? 's' : ''})`);
        }
      }

      if (ability.effect.type === 'add_mana' && ability.effect.mana) {
        // Fixed-color mana: add directly to pool
        setGameState(prev => {
          if (!prev) return prev;
          const manaPool = { ...prev.players.you.mana_pool };
          Object.entries(ability.effect.mana).forEach(([color, amt]) => {
            manaPool[color] = (manaPool[color] || 0) + (amt as number);
          });
          return { ...prev, players: { ...prev.players, you: { ...prev.players.you, mana_pool: manaPool } } };
        });
        const manaLabel = Object.entries(ability.effect.mana).map(([c, a]) => `{${c}}`.repeat(a as number)).join('');
        addLog(`${permanent.name}: added ${manaLabel} to mana pool`);
      } else {
        // Any-color mana: show color picker (no stack item needed)
        setManaColorSelection({
          sourceCard: permanent,
          stackItemId: '',  // No stack item
          amount: ability.effect.amount || 1,
          preActivationState: preActivationSnapshot,
          preActivationStackLength: preActivationStackLen,
        });
        addLog(`Activated ${permanent.name}'s ability — choose a color`);
      }
      return;
    }

    const stackItem: StackItem = {
      id: `ability-${permanent.card_id}-${Date.now()}`,
      type: 'activated_ability',
      source: { ...permanent, owner: 'you' } as any,
      effect: ability.effect,
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now()
    };

    addToStack(stackItem);
    addLog(`Activated ${permanent.name}'s ability`);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, stack, addLog, addToStack, holdingPriority, resolveStack, getNonbasicLandOverride]);

  // Multi-ability menu: show menu or activate directly for single-ability cards.
  // Includes equipment-granted activated abilities (e.g. Thornbite Staff's {2},{T}: deal 1).
  const openAbilityMenu = useCallback((permanent: Permanent) => {
    const allBF = gameState
      ? [...gameState.players.you.battlefield, ...gameState.players.opponent.battlefield]
      : [];
    const abilities = getEffectiveActivatedAbilities(permanent, allBF);
    if (abilities.length <= 1) {
      activateAbility(permanent, 0);
      return;
    }
    setAbilityMenuState({ permanent, abilities });
  }, [activateAbility, gameState]);

  const selectAbilityFromMenu = useCallback((abilityIndex: number) => {
    if (!abilityMenuState) return;
    const perm = abilityMenuState.permanent;
    setAbilityMenuState(null);
    activateAbility(perm, abilityIndex);
  }, [abilityMenuState, activateAbility]);

  const cancelAbilityMenu = useCallback(() => {
    setAbilityMenuState(null);
  }, []);

  // Optional "you may" trigger — accept the trigger so it resolves normally.
  const acceptOptionalTrigger = useCallback(() => {
    if (!optionalTriggerPromptState) return;
    const id = optionalTriggerPromptState.stackItemId;
    setStack(prev => prev.map(it => it.id === id ? ({ ...it, _optionalAccepted: true } as any) : it));
    setOptionalTriggerPromptState(null);
    // Re-enter resolveStack on next tick so the gate sees the flag.
    setTimeout(() => resolveStackRef.current(), 0);
  }, [optionalTriggerPromptState]);

  // Optional trigger — decline. Pop the stack item without applying its effect.
  const declineOptionalTrigger = useCallback(() => {
    if (!optionalTriggerPromptState) return;
    const id = optionalTriggerPromptState.stackItemId;
    addLog(`${optionalTriggerPromptState.sourceName}: declined optional trigger.`);
    setStack(prev => prev.filter(it => it.id !== id));
    setOptionalTriggerPromptState(null);
    setTimeout(() => resolveStackRef.current(), 0);
  }, [optionalTriggerPromptState, addLog]);

  // Discard selection: complete the discard portion of a looting effect
  const completeDiscard = useCallback((cardToDiscard: Card) => {
    if (!gameState || !discardSelectionState) return;
    const targetPlayer = discardSelectionState.targetPlayer || 'you';
    const madnessCost = targetPlayer === 'you' ? getMadnessCost(cardToDiscard) : null;
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      const tp = newState.players[targetPlayer];
      performDiscard(newState, tp, cardToDiscard);
      return newState;
    });
    if (madnessCost) {
      addLog(`You discard ${cardToDiscard.name} — madness ${madnessCost} triggers.`);
      setMadnessCastQueue(q => [...q, { card: { ...cardToDiscard, _madnessCost: madnessCost } as any, context: 'effect' }]);
    } else {
      addLog(`${targetPlayer === 'you' ? 'You discard' : 'Opponent discards'} ${cardToDiscard.name}`);
    }
    const remaining = discardSelectionState.count - 1;
    if (remaining > 0) {
      // More discards needed — keep modal open with decremented count
      setDiscardSelectionState({ ...discardSelectionState, count: remaining });
    } else {
      // All discards done — close modal and resume stack
      setDiscardSelectionState(null);
      if (!holdingPriority && stack.length > 0) {
        setTimeout(() => resolveStack(), 100);
      }
    }
  }, [gameState, discardSelectionState, addLog, holdingPriority, stack, resolveStack]);

  // Targeted discard: caster picks a card from target's hand (Thoughtseize)
  const completeTargetedDiscard = useCallback((cardToDiscard: Card | null) => {
    if (!gameState || !targetedDiscardState) return;
    const { targetPlayer, life_loss, reason } = targetedDiscardState;

    if (cardToDiscard) {
      const madnessCost = targetPlayer === 'you' ? getMadnessCost(cardToDiscard) : null;
      setGameState(prev => {
        if (!prev) return prev;
        const newState = JSON.parse(JSON.stringify(prev)) as GameState;
        const tp = newState.players[targetPlayer];
        performDiscard(newState, tp, cardToDiscard);
        if (life_loss) {
          newState.players.you.life -= life_loss;
        }
        return newState;
      });
      if (madnessCost) {
        addLog(`${reason}: You discard ${cardToDiscard.name} — madness ${madnessCost} triggers.`);
        setMadnessCastQueue(q => [...q, { card: { ...cardToDiscard, _madnessCost: madnessCost } as any, context: 'effect' }]);
      } else {
        addLog(`${reason}: ${targetPlayer === 'you' ? 'You discard' : 'Opponent discards'} ${cardToDiscard.name}.`);
      }
    } else {
      // No valid targets — still apply life loss
      if (life_loss) {
        setGameState(prev => {
          if (!prev) return prev;
          const newState = JSON.parse(JSON.stringify(prev)) as GameState;
          newState.players.you.life -= life_loss;
          return newState;
        });
      }
      addLog(`${reason}: No valid card to choose.`);
    }
    if (life_loss) {
      addLog(`You lose ${life_loss} life.`);
    }
    setTargetedDiscardState(null);
    // Resume stack resolution
    if (!holdingPriority && stack.length > 0) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, targetedDiscardState, addLog, holdingPriority, stack, resolveStack]);

  // Helper: apply deferred flashback sacrifices when the spell is actually cast
  const applyFlashbackSacrifices = useCallback((sacrifices: Permanent[], card: any) => {
    // Sacrifice all selected creatures and remove card from graveyard
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      if (sacrifices.length > 0) newState._yourPermanentLeftThisTurn = true;
      for (const sac of sacrifices) {
        newState.players.you.battlefield = newState.players.you.battlefield.filter(
          (c: any) => c.instance_id !== sac.instance_id
        );
        pushToGraveyardOrExile(newState, newState.players.you, sac);
        addLog(`Sacrificed ${sac.name} for ${card.name} flashback`);
      }
      // Remove the spell card from graveyard (flashback cast)
      newState.players.you.graveyard = (newState.players.you.graveyard || []).filter(
        (c: any) => c.instance_id !== card.instance_id
      );
      return newState;
    });

    // Collect sacrifice/death triggers — dispatched AFTER the spell hits the
    // stack so cost-payment triggers land on top of the spell per MTG rules.
    const postState = JSON.parse(JSON.stringify(gameState)) as GameState;
    for (const sac of sacrifices) {
      postState.players.you.battlefield = postState.players.you.battlefield.filter(
        (c: any) => c.instance_id !== sac.instance_id
      );
      pushToGraveyardOrExile(postState, postState.players.you, sac);
    }
    const flashbackBatch: StackItem[] = [];
    for (const sac of sacrifices) {
      flashbackBatch.push(...checkTriggersForEvent('creature_died', { creature: sac, owner: 'you' as PlayerKey }, postState));
      flashbackBatch.push(...checkTriggersForEvent('creature_sacrificed', { creature: sac, owner: 'you' as PlayerKey }, postState));
      flashbackBatch.push(...checkTriggersForEvent('permanent_sacrificed', { permanent: sac, owner: 'you' as PlayerKey }, postState));
      flashbackBatch.push(...checkTriggersForEvent('permanent_left', { permanent: sac, owner: 'you' as PlayerKey }, postState));
    }

    // Push spell to stack first
    const stackItem: StackItem = {
      id: `spell-${card.card_id}-${Date.now()}`,
      type: 'spell',
      source: { ...card, owner: 'you' } as any,
      effect: card.spell_effect || { type: 'unknown' },
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now()
    };
    addToStack(stackItem);
    if (flashbackBatch.length > 0) batchAndOrderTriggers(flashbackBatch);
    const newSpellCount = spellsCastThisTurn + 1;
    setSpellsCastThisTurn(newSpellCount);
    setSelectedCard(null);
    addLog(`Cast ${card.name} (flashback)`);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, addLog, addToStack, batchAndOrderTriggers, spellsCastThisTurn, holdingPriority, resolveStack]);

  const completeTriggerTarget = useCallback((targetType: string, targetData: any) => {
    if (!triggerTargetingState) return;

    // Update the top stack item with targeting data
    const stackItem = triggerTargetingState.stackItem;
    setStack(prev => prev.map(item =>
      item.id === stackItem.id
        ? { ...item, targeting_data: { targetType: targetType as any, targetData, targets: [targetData] }, requires_input: false }
        : item
    ));

    setTriggerTargetingState(null);
    setIsTargeting(false);
    setSelectedCard(null);
    // Lock stays true — prevents stale resolveStack closures from re-entering targeting.
    // Auto-resolve useEffect will pick up the updated stack and call resolveStack with
    // the correct closure (where targeting_data is set). The lock resets when the
    // grant_flashback resolution branch runs.
  }, [triggerTargetingState]);

  // --- Modal Spell callbacks (Kolaghan's Command etc.) ---

  const castModalSpell = useCallback((state: ModalSpellState) => {
    if (!gameState) return;
    const card = state.card;
    const parsedCost = parseManaCost(card.mana_cost || '');
    const reduction = getCostReduction(card);

    if (!canAffordCost(parsedCost, gameState.players.you.mana_pool, 0, reduction)) {
      addLog(`Not enough mana to cast ${card.name}`);
      setModalSpellState(null);
      return;
    }

    const newManaPool = spendMana(gameState.players.you.mana_pool, parsedCost, 0, reduction);

    // Build the effect with resolved modes + targets
    const resolvedModes = state.chosenModes.map((modeIdx, i) => ({
      ...state.modes[modeIdx],
      targeting_data: state.targetResults[i] || null,
    }));

    const stackItem: StackItem = {
      id: `spell-${card.card_id}-${Date.now()}`,
      type: 'spell',
      source: { ...card, owner: 'you' } as any,
      effect: { type: 'modal_spell' as any, modes: resolvedModes },
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now(),
    };

    // Remove card from hand/graveyard and spend mana
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        players: {
          ...prev.players,
          you: {
            ...prev.players.you,
            hand: prev.players.you.hand.filter((c: any) => c.instance_id !== card.instance_id),
            graveyard: (prev.players.you.graveyard || []).filter((c: any) => c.instance_id !== card.instance_id),
            mana_pool: newManaPool,
          },
        },
      };
    });

    addToStack(stackItem);
    const newSpellCount = spellsCastThisTurn + 1;
    setSpellsCastThisTurn(newSpellCount);
    setModalSpellState(null);
    setIsTargeting(false);
    setSelectedCard(null);
    addLog(`Cast ${card.name}`);

    // Fire all spell-cast triggers
    if (gameState) {
      const manaSpent = calculateManaSpent(card.mana_cost, 0, reduction);
      fireSpellCastTriggers(card, newSpellCount, gameState, manaSpent);
    }

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, addLog, addToStack, spellsCastThisTurn, holdingPriority, resolveStack, getCostReduction, fireSpellCastTriggers]);

  const beginModalTargeting = useCallback((state: ModalSpellState) => {
    // Find the next mode that needs a target
    let idx = state.currentTargetingModeIdx;
    while (idx < state.chosenModes.length) {
      const mode = state.modes[state.chosenModes[idx]];
      if (mode.targetType !== 'none') break;
      // Mode doesn't need a target, store null and advance
      const newResults = [...state.targetResults];
      newResults[idx] = null;
      state = { ...state, targetResults: newResults, currentTargetingModeIdx: idx + 1 };
      idx++;
    }

    if (idx >= state.chosenModes.length) {
      // All modes handled — cast the spell
      castModalSpell(state);
      return;
    }

    const updatedState = { ...state, phase: 'targeting' as const, currentTargetingModeIdx: idx };
    setModalSpellState(updatedState);
    setSelectedCard({ ...state.card, rect: state.rect } as any);
    setIsTargeting(true);
    const currentMode = state.modes[state.chosenModes[idx]];
    addLog(`Select target: ${currentMode.description}`);
  }, [addLog, castModalSpell]);

  const selectModalSpellMode = useCallback((modeIndex: number) => {
    if (!modalSpellState || modalSpellState.phase !== 'choosing') return;
    if (modalSpellState.chosenModes.includes(modeIndex)) return;

    const newChosenModes = [...modalSpellState.chosenModes, modeIndex];
    const updatedState = { ...modalSpellState, chosenModes: newChosenModes };

    if (newChosenModes.length >= modalSpellState.chooseCount) {
      // All modes chosen — begin targeting
      beginModalTargeting(updatedState);
    } else {
      setModalSpellState(updatedState);
    }
  }, [modalSpellState, beginModalTargeting]);

  const completeModalSpellTarget = useCallback((targetType: string, targetData: any) => {
    if (!modalSpellState || modalSpellState.phase !== 'targeting') return;

    const idx = modalSpellState.currentTargetingModeIdx;
    const newResults = [...modalSpellState.targetResults];
    newResults[idx] = {
      modeIndex: modalSpellState.chosenModes[idx],
      targetType,
      targetData,
    };

    const nextIdx = idx + 1;
    const updatedState = { ...modalSpellState, targetResults: newResults, currentTargetingModeIdx: nextIdx };

    // Check if there are more modes to target
    if (nextIdx < modalSpellState.chosenModes.length) {
      // Find next mode needing a target
      beginModalTargeting(updatedState);
    } else {
      // All targets collected — cast the spell
      castModalSpell(updatedState);
    }
  }, [modalSpellState, beginModalTargeting, castModalSpell]);

  const cancelModalSpell = useCallback(() => {
    setModalSpellState(null);
    setIsTargeting(false);
    setSelectedCard(null);
    addLog('Cancelled modal spell');
  }, [addLog]);

  const completeTutorSelection = useCallback((card: Card) => {
    if (!tutorSelectionState) return;

    if (tutorSelectionState.stackItemId) {
      // Update stack item with targeting data so resolveStack can complete
      setStack(prev => prev.map(item =>
        item.id === tutorSelectionState.stackItemId
          ? { ...item, targeting_data: { targetType: 'library_card' as any, targetData: card }, requires_input: false }
          : item
      ));
    }

    setTutorSelectionState(null);
    // Auto-resolve useEffect will pick up the updated stack
  }, [tutorSelectionState]);

  const completeScrySelection = useCallback((bottomIndices: number[], topOrder: number[]) => {
    if (!scrySelectionState || !gameState) return;

    const { cards, thenDraw, stackItemId, mode } = scrySelectionState;
    const isSurveil = mode === 'surveil';
    const mechName = isSurveil ? 'Surveiled' : 'Scried';
    const destName = isSurveil ? 'graveyard' : 'bottom';

    // Log the result
    const bottomCount = bottomIndices.length;
    const topCount = topOrder.length;
    if (bottomCount > 0 && topCount > 0) {
      addLog(`${mechName} ${cards.length}: put ${bottomCount} in ${destName}, kept ${topCount} on top.`);
    } else if (bottomCount > 0) {
      addLog(`${mechName} ${cards.length}: put all in ${destName}.`);
    } else {
      addLog(`${mechName} ${cards.length}: kept all on top.`);
    }

    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      const player = newState.players.you;

      // Put top cards back on top of library in chosen order
      const topCards = topOrder.map(i => cards[i]);
      player.library.unshift(...topCards);

      // Put removed cards in destination (graveyard for surveil, bottom of library for scry)
      const removedCards = bottomIndices.map(i => cards[i]);
      if (isSurveil) {
        player.graveyard = player.graveyard || [];
        player.graveyard.push(...removedCards);
      } else {
        player.library.push(...removedCards);
      }

      player.library_count = player.library.length;

      // Handle then_draw (Preordain: draw after scry)
      if (thenDraw && thenDraw > 0) {
        const drawn = player.library.splice(0, thenDraw);
        player.hand.push(...drawn);
        player.library_count = player.library.length;
        if (drawn.length < thenDraw) {
          player.deckedOut = true;
        }
        addLog(`Drew ${drawn.length} card${drawn.length !== 1 ? 's' : ''}.`);
        newState._youCardsDrawn = (newState._youCardsDrawn || 0) + drawn.length;
      }

      // Move spell to graveyard
      const stackItem = stack.find(i => i.id === stackItemId);
      if (stackItem?.type === 'spell') {
        const spellOwner = ((stackItem.source as any).owner || 'you') as PlayerKey;
        pushToGraveyardOrExile(newState, newState.players[spellOwner], { ...stackItem.source });
      }

      return newState;
    });

    // Remove stack item
    setStack(prev => prev.filter(i => i.id !== stackItemId));
    setScrySelectionState(null);
  }, [scrySelectionState, gameState, addLog, stack]);

  // look_take_filtered_bottom: take an optional matching card to hand,
  // shuffle the rest to bottom of library in random order. (Narset -2.)
  const completeLookTake = useCallback((takenIndex: number | null) => {
    if (!lookTakeState) return;
    const { cards, filter, ownerKey, stackItemId, reason } = lookTakeState;

    // Validate takenIndex against filter (if any)
    let validTaken: number | null = null;
    if (takenIndex !== null) {
      const card = cards[takenIndex];
      const types = (card.type_line || '').toLowerCase();
      const excluded = (filter?.exclude_types || []).some(t => types.includes(t.toLowerCase()));
      if (!excluded) validTaken = takenIndex;
    }

    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      const owner = newState.players[ownerKey];
      const remaining = cards.filter((_, i) => i !== validTaken);

      // Shuffle remaining (Fisher–Yates) and push to bottom of library.
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      owner.library = [...(owner.library || []), ...remaining];
      owner.library_count = owner.library.length;

      if (validTaken !== null) {
        owner.hand = owner.hand || [];
        owner.hand.push(cards[validTaken]);
      }

      return newState;
    });

    if (validTaken !== null) {
      addLog(`${reason}: took ${cards[validTaken].name} to hand. Remaining ${cards.length - 1} card(s) shuffled to bottom of library.`);
    } else {
      addLog(`${reason}: took no card. ${cards.length} card(s) shuffled to bottom of library.`);
    }

    setStack(prev => prev.filter(i => i.id !== stackItemId));
    setLookTakeState(null);
  }, [lookTakeState, addLog]);

  const selectManaColor = useCallback((color: string) => {
    if (!gameState || !manaColorSelection) return;

    const amount = manaColorSelection.amount || 1;

    setGameState(prev => {
      if (!prev) return prev;
      const manaPool = { ...prev.players.you.mana_pool };
      manaPool[color] = (manaPool[color] || 0) + amount;

      return {
        ...prev,
        players: {
          ...prev.players,
          you: { ...prev.players.you, mana_pool: manaPool }
        }
      };
    });

    // Pop the stack item if one exists (stack-based path, e.g. Phyrexian Altar)
    if (manaColorSelection.stackItemId) {
      setStack(prev => prev.filter(item => item.id !== manaColorSelection.stackItemId));
    }
    setManaColorSelection(null);
    const manaLabel = amount > 1 ? `${amount}x {${color}}` : `{${color}}`;
    addLog(`Added ${manaLabel} to mana pool`);
  }, [gameState, manaColorSelection, addLog]);

  const cancelManaColorSelection = useCallback(() => {
    if (manaColorSelection?.preActivationState) {
      // Restore game state to before costs were paid (sacrifice, tap, mana)
      setGameState(manaColorSelection.preActivationState);
      // Trim any triggers that were added to the stack after activation
      if (manaColorSelection.preActivationStackLength !== undefined) {
        setStack(prev => prev.slice(0, manaColorSelection.preActivationStackLength));
      }
      addLog('Cancelled — permanent restored.');
    }
    setManaColorSelection(null);
  }, [manaColorSelection, addLog]);

  // Pay-to-untap: player accepts paying mana to untap (Mana Vault)
  const acceptPayToUntap = useCallback(() => {
    if (!gameState || !payToUntapState) return;

    const costString = `{${payToUntapState.manaCost}}`;
    const parsedCost = parseManaCost(costString);
    const newManaPool = spendMana(gameState.players.you.mana_pool, parsedCost);

    // Spend mana
    setGameState(prev => {
      if (!prev) return prev;
      return { ...prev, players: { ...prev.players, you: { ...prev.players.you, mana_pool: newManaPool } } };
    });

    // Apply the untap effect via normal stack resolution
    const stackItem = stack.find(item => item.id === payToUntapState.stackItemId);
    if (stackItem) {
      const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
      newState.players.you.mana_pool = newManaPool;
      const sourceId = (stackItem.source as any)?.instance_id;
      const permanent = newState.players.you.battlefield.find((c: any) => c.instance_id === sourceId);
      if (permanent) {
        (permanent as any).tapped = false;
        addLog(`Paid {${payToUntapState.manaCost}} to untap ${payToUntapState.sourceCard.name}.`);
      }
      setGameState(newState);
    }

    setStack(prev => prev.filter(item => item.id !== payToUntapState.stackItemId));
    setPayToUntapState(null);
  }, [gameState, payToUntapState, stack, addLog]);

  // Pay-to-untap: player declines
  const declinePayToUntap = useCallback(() => {
    if (!payToUntapState) return;
    setStack(prev => prev.filter(item => item.id !== payToUntapState.stackItemId));
    addLog(`Declined to pay {${payToUntapState.manaCost}} for ${payToUntapState.sourceCard.name}.`);
    setPayToUntapState(null);
  }, [payToUntapState, addLog]);

  // Counter-unless-pay: player pays mana to prevent their spell from being countered
  const payToPreventCounter = useCallback(() => {
    if (!gameState || !counterUnlessPayState) return;

    const { counterStackItemId, targetedSpellName, manaCost, counterSourceName, wardType } = counterUnlessPayState;

    if (wardType === 'discard') {
      // Ward-discard: handled via the discard selector — this function is called after discard completes
      // (see wardDiscardComplete below)
      return;
    }

    // Mana payment path (Mana Leak, mana-ward)
    const parsedCost = parseManaCost(manaCost);

    if (!canAffordCost(parsedCost, gameState.players.you.mana_pool)) {
      addLog(`Not enough mana to pay ${manaCost}`);
      return;
    }

    const newManaPool = spendMana(gameState.players.you.mana_pool, parsedCost);

    // Spend mana
    setGameState(prev => {
      if (!prev) return prev;
      return { ...prev, players: { ...prev.players, you: { ...prev.players.you, mana_pool: newManaPool } } };
    });

    // Remove only the counter spell from stack — the targeted spell survives
    setStack(prev => prev.filter(item => item.id !== counterStackItemId));

    // Put the counter spell in graveyard (only for actual spell cards, not ward triggers)
    const counterItem = stack.find(item => item.id === counterStackItemId);
    if (counterItem && counterItem.type === 'spell') {
      const counterOwner = ((counterItem.source as any).owner || 'you') as PlayerKey;
      setGameState(prev => {
        if (!prev) return prev;
        const newState = JSON.parse(JSON.stringify(prev)) as GameState;
        newState.players.you.mana_pool = newManaPool;
        pushToGraveyardOrExile(newState, newState.players[counterOwner], { ...counterItem.source });
        return newState;
      });
    }

    addLog(`Paid ${manaCost} — ${targetedSpellName} is not countered. ${counterSourceName} fizzles.`);
    setCounterUnlessPayState(null);
  }, [gameState, counterUnlessPayState, stack, addLog, holdingPriority, resolveStack]);

  // Ward-discard: player discards a card to pay ward cost
  const wardDiscardComplete = useCallback((cardToDiscard: Card) => {
    if (!gameState || !counterUnlessPayState) return;

    const { counterStackItemId, targetedSpellName, counterSourceName } = counterUnlessPayState;

    // Discard the card
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      newState.players.you.hand = newState.players.you.hand.filter(
        (c: any) => c.instance_id !== (cardToDiscard as any).instance_id
      );
      pushToGraveyardOrExile(newState, newState.players.you, cardToDiscard);
      return newState;
    });

    // Remove ward trigger from stack — the targeted spell survives
    setStack(prev => prev.filter(item => item.id !== counterStackItemId));

    addLog(`Discarded ${cardToDiscard.name} — ${targetedSpellName} is not countered. ${counterSourceName}'s ward paid.`);
    setCounterUnlessPayState(null);
  }, [gameState, counterUnlessPayState, addLog]);

  // Counter-unless-pay: player declines to pay — spell is countered
  const declineToPayCounter = useCallback(() => {
    if (!gameState || !counterUnlessPayState) return;

    const { counterStackItemId, targetedStackItemId, targetedSpellName, counterSourceName } = counterUnlessPayState;

    const counterItem = stack.find(item => item.id === counterStackItemId);
    const targetedItem = stack.find(item => item.id === targetedStackItemId);

    // Remove both from stack
    setStack(prev => prev.filter(item => item.id !== counterStackItemId && item.id !== targetedStackItemId));

    // Put both in graveyard
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      if (targetedItem) {
        const targetOwner = ((targetedItem.source as any).owner || 'you') as PlayerKey;
        if ((targetedItem.source as any)?._flashbackCast) {
          const owner = newState.players[targetOwner];
          owner.exile = owner.exile || [];
          owner.exile.push({ ...targetedItem.source } as unknown as Card);
        } else {
          pushToGraveyardOrExile(newState, newState.players[targetOwner], { ...targetedItem.source } as unknown as Card);
        }
      }
      if (counterItem && counterItem.type === 'spell') {
        const counterOwner = ((counterItem.source as any).owner || 'you') as PlayerKey;
        pushToGraveyardOrExile(newState, newState.players[counterOwner], { ...counterItem.source });
      }
      return newState;
    });

    addLog(`Declined to pay — ${counterSourceName} counters ${targetedSpellName}`);
    setCounterUnlessPayState(null);
    // No explicit setTimeout — auto-resolve useEffect handles continuation with a fresh
    // resolveStack closure. A setTimeout here would capture a stale stack/resolveStack.
  }, [gameState, counterUnlessPayState, stack, addLog, holdingPriority, resolveStack]);

  // Extort: player pays {W} or {B} — drain 1 life from opponent
  const payExtort = useCallback((color: 'W' | 'B') => {
    if (!gameState || !extortState) return;

    const { stackItemId, sourceName } = extortState;
    const pool = gameState.players.you.mana_pool;
    if ((pool[color] || 0) <= 0) return;

    // Spend mana and apply drain
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      newState.players.you.mana_pool[color] = (newState.players.you.mana_pool[color] || 0) - 1;
      newState.players.opponent.life -= 1;
      newState.players.you.life += 1;
      newState._lifeGained = (newState._lifeGained || 0) + 1;
      return newState;
    });

    // Remove extort trigger from stack
    setStack(prev => prev.filter(item => item.id !== stackItemId));

    const colorName = color === 'W' ? 'white' : 'black';
    addLog(`Paid {${color}} (${colorName}) for ${sourceName}'s extort — opponent loses 1 life, you gain 1 life.`);
    setExtortState(null);
  }, [gameState, extortState, addLog]);

  // Extort: player declines to pay
  const declineExtort = useCallback(() => {
    if (!extortState) return;

    const { stackItemId, sourceName } = extortState;
    setStack(prev => prev.filter(item => item.id !== stackItemId));
    addLog(`Declined to pay for ${sourceName}'s extort.`);
    setExtortState(null);
  }, [extortState, addLog]);

  // Endure: player accepts paying mana, then chooses counter or Spirit token
  const acceptEndure = useCallback(() => {
    if (!gameState || !endurePromptState) return;

    const { manaCost, value, trigger, stackItemId } = endurePromptState;
    const parsedCost = parseManaCost(manaCost);
    const newManaPool = spendMana(gameState.players.you.mana_pool, parsedCost);

    // Spend mana
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        players: {
          ...prev.players,
          you: { ...prev.players.you, mana_pool: newManaPool }
        }
      };
    });

    // Remove endure stack item
    setStack(prev => prev.filter(item => item.id !== stackItemId));

    // Show modal choice: counter vs Spirit token
    const sourceName = trigger.source?.name || 'this creature';
    setModalTriggerChoice({
      trigger,
      modes: [
        {
          description: `Put ${value} +1/+1 counter${value !== 1 ? 's' : ''} on ${sourceName}`,
          effect: { type: 'add_counter_to_self', amount: value }
        },
        {
          description: `Create a ${value}/${value} white Spirit creature token`,
          effect: {
            type: 'create_token',
            count: 1,
            token: { name: 'Spirit', type_line: 'Creature Token — Spirit', power: value, toughness: value }
          }
        }
      ]
    });

    addLog(`Paid ${manaCost} to endure ${value}. Choose an option.`);
    setEndurePromptState(null);
  }, [gameState, endurePromptState, addLog]);

  const declineEndure = useCallback(() => {
    if (!endurePromptState) return;
    setStack(prev => prev.filter(item => item.id !== endurePromptState.stackItemId));
    addLog(`Declined to pay ${endurePromptState.manaCost} for ${endurePromptState.sourceCard.name}.`);
    setEndurePromptState(null);
  }, [endurePromptState, addLog]);

  // Legend rule: player picks which legendary copy to keep
  const resolveLegendRule = useCallback((chosenToKeep: Permanent) => {
    if (!gameState || !legendRuleState) return;
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;
      const toSacrifice = legendRuleState.duplicates.filter(
        d => d.instance_id !== chosenToKeep.instance_id
      );
      for (const perm of toSacrifice) {
        newState.players.you.battlefield = newState.players.you.battlefield.filter(
          (c: any) => c.instance_id !== perm.instance_id
        );
        pushToGraveyardOrExile(newState, newState.players.you, perm);
      }
      return newState;
    });
    addLog(`Legend rule: kept ${chosenToKeep.name}, sacrificed duplicate.`);
    setLegendRuleState(null);
    // Resume stack resolution
    if (!holdingPriority && stack.length > 0) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, legendRuleState, addLog, holdingPriority, stack, resolveStack]);

  // Complete activated ability after target is selected.
  // All costs (mana, tap, sacrifice) are deferred until this point so cancel is free.
  const completeActivatedAbilityWithTarget = useCallback((targetType: string, targetData: any) => {
    if (!gameState || !activatedAbilityTargeting) return;

    const { permanent, ability, pendingSacrifice } = activatedAbilityTargeting;
    const cost = ability.cost;

    // Pay all deferred costs in a single state update
    setGameState(prev => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev)) as GameState;

      // Execute pending sacrifice
      if (pendingSacrifice) {
        newState._yourPermanentLeftThisTurn = true;
        newState.players.you.battlefield = newState.players.you.battlefield.filter(
          (c: Permanent) => c.instance_id !== pendingSacrifice.instance_id
        );
        // Route to owner's graveyard (auto-routes via cardOwner)
        pushToGraveyardOrExile(newState, newState.players.you, pendingSacrifice);
        // Persist: return to battlefield with -1/-1 counter
        const hasPersist = pendingSacrifice.keywords?.includes('persist');
        const hasMinusCounters = (pendingSacrifice.counters?.['-1/-1'] || 0) > 0;
        if (hasPersist && !hasMinusCounters) {
          const ownerKey = ((pendingSacrifice as any).cardOwner || 'you') as PlayerKey;
          newState.players[ownerKey].graveyard = (newState.players[ownerKey].graveyard || []).filter(
            (c: any) => c.instance_id !== pendingSacrifice.instance_id
          );
          newState.players.you.battlefield.push(
            { ...pendingSacrifice, tapped: false, summoning_sick: true,
              counters: { ...(pendingSacrifice.counters || {}), '-1/-1': 1 }, attacking: false } as any
          );
        }
      }

      // Pay mana cost
      if (cost && typeof cost !== 'string' && cost.mana) {
        const manaString = manaToString(cost.mana);
        const parsedCost = parseManaCost(manaString);
        newState.players.you.mana_pool = spendMana(newState.players.you.mana_pool, parsedCost);
      }

      // Pay tap cost
      if (cost && typeof cost !== 'string' && cost.tap) {
        const found = newState.players.you.battlefield.find(
          (c: Permanent) => c.instance_id === permanent.instance_id
        );
        if (found) (found as any).tapped = true;
      }

      return newState;
    });

    // Collect death triggers if a creature was sacrificed. Dispatched AFTER
    // addToStack(stackItem) below so cost-payment triggers land on top of the
    // activated ability per MTG rules.
    const sacBatch3: StackItem[] = [];
    if (pendingSacrifice) {
      const postState = JSON.parse(JSON.stringify(gameState)) as GameState;
      postState.players.you.battlefield = postState.players.you.battlefield.filter(
        (c: Permanent) => c.instance_id !== pendingSacrifice.instance_id
      );
      pushToGraveyardOrExile(postState, postState.players.you, pendingSacrifice);
      sacBatch3.push(...checkTriggersForEvent('creature_died', { creature: pendingSacrifice, owner: 'you' as PlayerKey }, postState));
      sacBatch3.push(...checkTriggersForEvent('creature_sacrificed', { creature: pendingSacrifice, owner: 'you' as PlayerKey }, postState));
      sacBatch3.push(...checkTriggersForEvent('permanent_sacrificed', { permanent: pendingSacrifice, owner: 'you' as PlayerKey }, postState));
      sacBatch3.push(...checkTriggersForEvent('permanent_left', { permanent: pendingSacrifice, owner: 'you' as PlayerKey }, postState));
      if ((pendingSacrifice.type_line || '').toLowerCase().includes('land')) {
        sacBatch3.push(...checkTriggersForEvent('land_to_graveyard', { land: pendingSacrifice, owner: 'you' as PlayerKey }, postState));
      }
      const hasPersist = pendingSacrifice.keywords?.includes('persist');
      const hasMinusCounters = (pendingSacrifice.counters?.['-1/-1'] || 0) > 0;
      if (hasPersist && !hasMinusCounters) {
        addLog(`${pendingSacrifice.name} returns to the battlefield with a -1/-1 counter (persist).`);
        const returned = {
          ...pendingSacrifice, tapped: false, summoning_sick: true,
          counters: { ...(pendingSacrifice.counters || {}), '-1/-1': 1 }, attacking: false
        };
        postState.players.you.graveyard = postState.players.you.graveyard.filter(
          (c: Permanent) => c.instance_id !== pendingSacrifice.instance_id
        );
        postState.players.you.battlefield.push(returned);
        sacBatch3.push(...checkTriggersForEvent('creature_entered', { creature: returned, wasEvoked: false }, postState));
      }
    }

    // Check if requires color choice (for protection abilities) — costs already paid above
    if (ability.effect.requires_color_choice) {
      setProtectionColorChoice({
        permanent,
        ability,
        targetType,
        targetData
      });
      setActivatedAbilityTargeting(null);
      setIsTargeting(false);
      setTargetingOrigin(null);
      addLog(`Choose a color for protection`);
      return;
    }

    // Create stack item with targeting data
    const stackItem: StackItem = {
      id: `ability-${permanent.card_id}-${Date.now()}`,
      type: 'activated_ability',
      source: { ...permanent, owner: 'you' } as any,
      effect: ability.effect,
      requires_input: false,
      targeting_data: { targetType: targetType as any, targetData, targetOwner: targetData.owner, targets: [targetData] },
      resolved: false,
      timestamp: Date.now()
    };

    addToStack(stackItem);
    if (sacBatch3.length > 0) batchAndOrderTriggers(sacBatch3);
    setActivatedAbilityTargeting(null);
    setIsTargeting(false);
    setTargetingOrigin(null);

    const sacrificeMsg = pendingSacrifice ? `Sacrificed ${pendingSacrifice.name}, a` : 'A';
    addLog(`${sacrificeMsg}ctivated ${permanent.name}'s ability targeting ${typeof targetData === 'string' ? targetData : targetData.name}`);

    // Check ward on target — only triggers when targeting opponent's creatures
    if (targetType === 'creature' && targetData.owner !== 'you' && gameState) {
      const allBF = [...gameState.players.you.battlefield, ...gameState.players.opponent.battlefield];
      const wardCost = getWardCost(targetData.instance_id, allBF);
      if (wardCost) {
        const wardDesc = wardCost.type === 'discard'
          ? `discard ${wardCost.count || 1} card(s)` : `pay ${wardCost.cost}`;
        const wardItem: StackItem = {
          id: `ward-${targetData.instance_id}-${Date.now()}`,
          type: 'triggered_ability',
          source: { ...targetData, owner: targetData.owner } as any,
          effect: {
            type: (wardCost.type === 'discard' ? 'ward_discard' : 'counter_unless_pay') as any,
            payCost: wardCost.cost,
            wardType: wardCost.type,
            discardCount: wardCost.count,
          },
          requires_input: false,
          targeting_data: {
            targetType: 'stack_spell' as any,
            targetData: { stackItemId: stackItem.id, targetSource: stackItem.source },
            targets: [{ stackItemId: stackItem.id, targetSource: stackItem.source }]
          },
          resolved: false,
          timestamp: Date.now()
        };
        addToStack(wardItem);
        addLog(`${targetData.name}'s ward triggers! ${wardDesc} or the ability is countered.`);
      }
    }

    // No explicit setTimeout — auto-resolve useEffect handles it
  }, [gameState, activatedAbilityTargeting, addLog, addToStack]);

  // Cancel activated ability targeting
  const cancelActivatedAbilityTargeting = useCallback(() => {
    setActivatedAbilityTargeting(null);
    setIsTargeting(false);
    setTargetingOrigin(null);
    addLog('Cancelled ability activation');
  }, [addLog]);

  // Complete protection ability after color is chosen
  const completeProtectionWithColor = useCallback((color: string) => {
    if (!gameState || !protectionColorChoice) return;

    const { permanent, ability, targetType, targetData } = protectionColorChoice;

    // Create stack item with protection effect and chosen color
    const stackItem: StackItem = {
      id: `ability-${permanent.card_id}-${Date.now()}`,
      type: 'activated_ability',
      source: { ...permanent, owner: 'you' } as any,
      effect: {
        ...ability.effect,
        protection_color: color
      },
      requires_input: false,
      targeting_data: { targetType: targetType as any, targetData, targets: [targetData] },
      resolved: false,
      timestamp: Date.now()
    };

    addToStack(stackItem);
    setProtectionColorChoice(null);
    addLog(`${permanent.name} grants protection from ${color} to ${targetData.name}`);

    // No explicit setTimeout — auto-resolve useEffect handles it
  }, [gameState, protectionColorChoice, addLog, addToStack]);

  // Cancel protection color choice
  const cancelProtectionColorChoice = useCallback(() => {
    setProtectionColorChoice(null);
    addLog('Cancelled protection ability');
  }, [addLog]);

  // Modal trigger choice (Cosmogrand Zenith "choose one" triggers)
  // Note: no explicit setTimeout here — the auto-resolve useEffect handles
  // resolution after React processes the state updates from addToStack and
  // setModalTriggerChoice. Using setTimeout here would capture a stale
  // resolveStack closure that sees the old stack (before the trigger was added),
  // causing the underlying spell to resolve incorrectly.
  const completeModalTriggerChoice = useCallback((modeIndex: number) => {
    if (!modalTriggerChoice) return;
    const { trigger, modes } = modalTriggerChoice;
    const chosenMode = modes[modeIndex];
    if (!chosenMode) return;

    const resolvedTrigger: StackItem = {
      ...trigger,
      effect: chosenMode.effect,
      requires_input: false,
    };

    addToStack(resolvedTrigger);
    setModalTriggerChoice(null);
    addLog(`Chose: ${chosenMode.description}`);
  }, [modalTriggerChoice, addLog, addToStack]);

  // Walking Ballista mechanics
  const startBallistaAbility = useCallback((ballista: Permanent, countersToRemove: number) => {
    setBallistaState({ card: ballista, countersToRemove });
    addLog(`Select a target for Walking Ballista (removing ${countersToRemove} counter${countersToRemove > 1 ? 's' : ''})`);
  }, [addLog]);

  const completeBallistaAbility = useCallback((targetType: string, targetData: any) => {
    if (!gameState || !ballistaState) return;

    const { card, countersToRemove } = ballistaState;

    // Remove counters from ballista
    setGameState(prev => {
      if (!prev) return prev;
      const newBattlefield = prev.players.you.battlefield.map(c => {
        if (c.instance_id === card.instance_id) {
          const currentCounters = (c.counters?.['+1/+1'] || 0) as number;
          const newCounters = Math.max(0, currentCounters - countersToRemove);

          // If counters reach 0, creature dies (state-based action)
          if (newCounters === 0) {
            return null; // Will be filtered out
          }

          return { ...c, counters: { ...c.counters, '+1/+1': newCounters } };
        }
        return c;
      }).filter(Boolean) as Permanent[];

      const ballista = prev.players.you.battlefield.find(c => c.instance_id === card.instance_id);
      const ballistaCounters = (ballista?.counters?.['+1/+1'] || 0) as number;
      const graveyard = ballista && ballistaCounters - countersToRemove <= 0
        ? [...prev.players.you.graveyard, ballista]
        : prev.players.you.graveyard;

      return {
        ...prev,
        players: {
          ...prev.players,
          you: {
            ...prev.players.you,
            battlefield: newBattlefield,
            graveyard
          }
        }
      };
    });

    // Create damage stack item
    const stackItem: StackItem = {
      id: `ballista-${card.card_id}-${Date.now()}`,
      type: 'activated_ability',
      source: { ...card, owner: 'you' } as any,
      effect: {
        type: 'damage',
        amount: countersToRemove,
        targetObj: { type: targetType as any, data: targetData }
      } as any,
      requires_input: false,
      targeting_data: { targetType: targetType as any, targetData, targets: [targetData] },
      resolved: false,
      timestamp: Date.now()
    };

    addToStack(stackItem);
    setBallistaState(null);
    addLog(`Walking Ballista deals ${countersToRemove} damage`);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, ballistaState, addLog, addToStack, holdingPriority, resolveStack]);

  const cancelBallistaAbility = useCallback(() => {
    setBallistaState(null);
    addLog('Cancelled Walking Ballista ability');
  }, [addLog]);

  // X-cost mechanics
  const confirmXCost = useCallback((xValue: number) => {
    if (!gameState || !xCostState) return;

    const card = xCostState.card;
    const rect = xCostState.rect;
    const convokeReduction = (card as any)._convokeReduction;

    let totalCost: any;
    let reduction: number;

    if (convokeReduction) {
      // Convoke already reduced colored costs and generic; add X then subtract creatures that paid toward generic/X
      totalCost = { ...convokeReduction };
      const convokedGeneric = convokeReduction.convokedGeneric || 0;
      totalCost.generic = Math.max(0, (totalCost.generic || 0) + (xValue * (convokeReduction.xCount || 1)) - convokedGeneric);
      delete totalCost.convokedGeneric;
      reduction = 0; // reduction already applied in convoke
    } else {
      const parsedCost = parseManaCost(card.mana_cost || '');
      totalCost = { ...parsedCost };
      totalCost.generic = (totalCost.generic || 0) + (xValue * (parsedCost.xCount || 1));
      reduction = getCostReduction(card);
    }

    if (!canAffordCost(totalCost, gameState.players.you.mana_pool, 0, reduction)) {
      addLog(`Not enough mana to cast ${card.name} with X=${xValue}`);
      return;
    }

    const newManaPool = spendMana(gameState.players.you.mana_pool, totalCost, 0, reduction);

    // Check if this is a permanent spell (like Hydra with X cost)
    const typeLine = card.type_line?.toLowerCase() || '';
    const isCreature = typeLine.includes('creature');
    const isPermanent = isCreature || typeLine.includes('artifact') || typeLine.includes('enchantment') || typeLine.includes('planeswalker');

    // Check if this non-permanent spell requires targeting (Devil's Play)
    const requiresTarget = !isPermanent && (
      card.spell_effect?.target ||
      card.spell_effect?.valid_targets ||
      card.spell_effect?.type === 'damage' ||
      card.spell_effect?.type === 'buff_creature' ||
      card.spell_effect?.type === 'destroy' ||
      card.spell_effect?.type === 'attach_aura'
    );

    if (requiresTarget) {
      // Spend mana and remove from hand now, then enter targeting mode
      // Store _xValue on card so castSpellOnTarget can pick it up
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: {
            ...prev.players,
            you: {
              ...prev.players.you,
              hand: prev.players.you.hand.filter(c => c.instance_id !== card.instance_id),
              graveyard: (prev.players.you.graveyard || []).filter(c => c.instance_id !== card.instance_id),
              mana_pool: newManaPool
            }
          }
        };
      });

      const cardWithX = { ...card, _xValue: xValue } as any;
      setSelectedCard({ ...cardWithX, rect } as SelectedCard);
      setIsTargeting(true);
      setTargetingOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      setXCostState(null);
      altCastSnapshot.current = null; // Clear convoke snapshot — spell is committed
      const newSpellCount = spellsCastThisTurn + 1;
      setSpellsCastThisTurn(newSpellCount);
      addLog(`Select a target for ${card.name} (X=${xValue})`);

      // Triggers fire in castSpellOnTarget when target is selected
      return;
    }

    // Non-targeted spell — put directly on stack
    const stackItem: StackItem = {
      id: `spell-${card.card_id}-${Date.now()}`,
      type: isPermanent ? (isCreature ? 'creature_spell' : 'permanent_spell') : 'spell',
      source: { ...card, owner: 'you' } as any,
      effect: (isPermanent
        ? isCreature
          ? { type: 'enter_battlefield', creature: { ...card, _xValue: xValue }, owner: 'you', enteringCounters: xValue }
          : { type: 'enter_battlefield_permanent', permanent: card, owner: 'you' }
        : { ...(card.spell_effect || { type: 'unknown' }), xValue }) as Effect,
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now()
    };

    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        players: {
          ...prev.players,
          you: {
            ...prev.players.you,
            hand: prev.players.you.hand.filter(c => c.instance_id !== card.instance_id),
            mana_pool: newManaPool
          }
        }
      };
    });

    addToStack(stackItem);

    // "When you cast" triggers
    if (card.triggered_abilities) {
      (card.triggered_abilities as any[]).forEach((ability: any) => {
        const isOnCast = ability.trigger === 'on_cast' || ability.trigger === 'when_cast' ||
          ability.trigger?.event === 'on_cast' || ability.trigger?.event === 'when_cast';
        if (isOnCast) {
          addToStack({
            id: `cast-trigger-${card.card_id}-${Date.now()}-${Math.random()}`,
            type: 'triggered_ability',
            source: { instance_id: stackItem.id, card_id: card.card_id, name: card.name, owner: 'you' },
            effect: ability.effect,
            requires_input: ability.requires_input || false,
            targeting_data: null,
            resolved: false,
            timestamp: Date.now(),
          });
        }
      });
    }

    setXCostState(null);
    altCastSnapshot.current = null; // Clear convoke snapshot — spell is committed
    const newSpellCount = spellsCastThisTurn + 1;
    setSpellsCastThisTurn(newSpellCount);
    addLog(`Cast ${card.name} with X=${xValue}`);

    // Fire all spell-cast triggers
    const manaSpent = calculateManaSpent(totalCost, 0, reduction);
    const hasModal = gameState ? fireSpellCastTriggers(card, newSpellCount, gameState, manaSpent) : false;

    if (!holdingPriority && !hasModal) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [gameState, xCostState, spellsCastThisTurn, addLog, addToStack, holdingPriority, resolveStack, fireSpellCastTriggers]);

  const cancelXCostSelection = useCallback(() => {
    // If convoke tapped creatures before opening X selector, restore full game state
    if (altCastSnapshot.current?.fullState) {
      setGameState(altCastSnapshot.current.fullState);
      addLog(`Cancelled — ${altCastSnapshot.current.cardName} returned to hand, creatures untapped`);
      altCastSnapshot.current = null;
    } else {
      addLog('Cancelled X-cost spell');
    }
    setXCostState(null);
  }, [addLog]);

  // Multi-targeting for divided damage
  const startMultiTargeting = useCallback((stackItemId: string) => {
    const stackItem = stack.find(item => item.id === stackItemId);
    if (!stackItem || !stackItem.effect) return;

    const totalDamage = stackItem.effect.amount || 0;
    // Use target_types from the effect if present; default to creatures+players for generic divided damage
    const allowedTargetTypes: string[] = (stackItem.effect as any).target_types || ['creature', 'player'];

    setMultiTargetingState({
      stackItemId,
      totalDamage,
      allowedTargetTypes,
      assignments: []
    });
    setAwaitingStackInput(stackItemId);
    // Use current mouse position as arrow origin so arrows draw from the click point
    setTargetingOrigin(mousePosition);
    addLog(`Divide ${totalDamage} damage among targets`);
  }, [stack, addLog, mousePosition]);

  const addDamageTarget = useCallback((target: any, damage: number, destination: MousePosition) => {
    if (!multiTargetingState) return;

    setMultiTargetingState(prev => {
      if (!prev) return prev;
      const currentTotal = prev.assignments.reduce((sum, a) => sum + a.damage, 0);
      const remaining = prev.totalDamage - currentTotal;
      const actualDamage = Math.min(damage, remaining);

      return {
        ...prev,
        assignments: [
          ...prev.assignments,
          {
            target,
            damage: actualDamage,
            arrow: { origin: targetingOrigin, destination }
          }
        ]
      };
    });
  }, [multiTargetingState, targetingOrigin]);

  const adjustDamageAmount = useCallback((assignmentIndex: number, delta: number) => {
    if (!multiTargetingState) return;

    setMultiTargetingState(prev => {
      if (!prev) return prev;

      const newAssignments = [...prev.assignments];
      const currentDamage = newAssignments[assignmentIndex].damage;
      const newDamage = Math.max(1, currentDamage + delta);

      // Check if we have enough total damage
      const otherTotal = newAssignments.reduce((sum, a, i) =>
        i === assignmentIndex ? sum : sum + a.damage, 0
      );

      if (otherTotal + newDamage > prev.totalDamage) {
        return prev; // Can't exceed total
      }

      newAssignments[assignmentIndex] = {
        ...newAssignments[assignmentIndex],
        damage: newDamage
      };

      return { ...prev, assignments: newAssignments };
    });
  }, [multiTargetingState]);

  const confirmMultiTargets = useCallback(() => {
    if (!multiTargetingState || !gameState) return;

    const stackItem = stack.find(item => item.id === multiTargetingState.stackItemId);
    if (!stackItem) return;

    const totalAssigned = multiTargetingState.assignments.reduce((sum, a) => sum + a.damage, 0);
    if (totalAssigned !== multiTargetingState.totalDamage) {
      addLog(`Must assign all ${multiTargetingState.totalDamage} damage`);
      return;
    }

    // Update stack item with targeting data
    setStack(prev => prev.map(item => {
      if (item.id === multiTargetingState.stackItemId) {
        return {
          ...item,
          targeting_data: {
            assignments: multiTargetingState.assignments.map(a => ({
              target: a.target,
              damage: a.damage
            }))
          } as any,
          requires_input: false
        };
      }
      return item;
    }));

    setMultiTargetingState(null);
    setAwaitingStackInput(null);
    setTargetingOrigin(null);
    addLog('Damage divided among targets');

    // Auto-resolve useEffect handles triggering resolution when holdingPriority is false.
    // Do NOT call resolveStack() here — the resolveStack captured in this closure is stale
    // (it references the old stack before setStack updated targeting_data), which causes
    // a double-resolution that silently pops the next stack item (e.g. evoke sacrifice)
    // without ever resolving it.
  }, [multiTargetingState, gameState, stack, addLog]);

  const cancelMultiTargeting = useCallback(() => {
    setMultiTargetingState(null);
    setAwaitingStackInput(null);
    setTargetingOrigin(null);
    addLog('Cancelled multi-targeting');
  }, [addLog]);

  // Storm mechanics
  const assignStormCopyTarget = useCallback((targetType: string, targetData: any) => {
    if (!stormTargetingState) return;

    const { copies, currentCopyIndex } = stormTargetingState;
    const currentCopy = copies[currentCopyIndex];

    // Update this copy with targeting
    const updatedCopy: StackItem = {
      ...currentCopy,
      targeting_data: { targetType: targetType as any, targetData, targets: [targetData] },
      requires_input: false
    };

    // Add to stack
    addToStack(updatedCopy);

    // Magecraft triggers for each copy of an instant/sorcery
    if (gameState) {
      const mcTriggers = checkTriggersForEvent('instant_sorcery_cast_or_copy', { spell: currentCopy.source as unknown as Card }, gameState);
      mcTriggers.forEach(trigger => addToStack(trigger));
    }

    // Move to next copy or finish
    if (currentCopyIndex < copies.length - 1) {
      setStormTargetingState(prev => prev ? { ...prev, currentCopyIndex: currentCopyIndex + 1 } : null);
      addLog(`Target for storm copy ${currentCopyIndex + 2} of ${copies.length}`);
    } else {
      setStormTargetingState(null);
      setIsTargeting(false);
      addLog('All copies targeted');

      // Auto-resolve useEffect handles triggering resolution when holdingPriority is false.
      // Do NOT call resolveStack() here — the resolveStack captured in this closure is stale
      // (it references the old stack before addToStack updated it), which causes
      // a double-resolution that resolves the original spell twice → duplicate graveyard entries.
    }
  }, [stormTargetingState, addLog, addToStack, gameState]);

  const sendAllStormCopiesToOriginalTarget = useCallback(() => {
    if (!stormTargetingState) return;

    const { copies, originalTarget } = stormTargetingState;

    copies.forEach(copy => {
      const updatedCopy = {
        ...copy,
        targeting_data: originalTarget,
        requires_input: false
      };
      addToStack(updatedCopy);

      // Magecraft triggers for each copy of an instant/sorcery
      if (gameState) {
        const mcTriggers = checkTriggersForEvent('instant_sorcery_cast_or_copy', { spell: copy.source as unknown as Card }, gameState);
        mcTriggers.forEach(trigger => addToStack(trigger));
      }
    });

    setStormTargetingState(null);
    setIsTargeting(false);
    addLog('All copies sent to original target');

    // Auto-resolve useEffect handles triggering resolution when holdingPriority is false.
    // Do NOT call resolveStack() here — the resolveStack captured in this closure is stale
    // (it references the old stack before addToStack updated it), which causes
    // a double-resolution that resolves the original spell twice → duplicate graveyard entries.
  }, [stormTargetingState, addLog, addToStack, gameState]);

  const cancelStormTargeting = useCallback(() => {
    setStormTargetingState(null);
    addLog('Cancelled storm targeting');
  }, [addLog]);

  // Copy spell retargeting functions (Twincast)
  const assignCopyNewTarget = useCallback((targetType: string, targetData: any) => {
    if (!copyTargetingState || copyTargetingState.phase !== 'retargeting_copy') return;

    const copy = copyTargetingState.copiedStackItem!;
    const updatedCopy: StackItem = {
      ...copy,
      targeting_data: { targetType: targetType as any, targetData, targets: [targetData] },
      requires_input: false
    };

    addToStack(updatedCopy);
    // Magecraft triggers for copying an instant/sorcery
    if (gameState) {
      const mcTriggers = checkTriggersForEvent('instant_sorcery_cast_or_copy', { spell: copy.source as unknown as Card }, gameState);
      mcTriggers.forEach(trigger => addToStack(trigger));
    }
    setCopyTargetingState(null);
    const targetName = typeof targetData === 'string' ? targetData : (targetData.name || 'target');
    addLog(`Copy of ${copy.source.name} targets ${targetName}`);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [copyTargetingState, addLog, addToStack, holdingPriority, resolveStack, gameState]);

  const keepCopyOriginalTarget = useCallback(() => {
    if (!copyTargetingState || copyTargetingState.phase !== 'retargeting_copy') return;

    const copy = copyTargetingState.copiedStackItem!;
    const updatedCopy: StackItem = {
      ...copy,
      targeting_data: copyTargetingState.originalTargeting,
      requires_input: false
    };

    addToStack(updatedCopy);
    // Magecraft triggers for copying an instant/sorcery
    if (gameState) {
      const mcTriggers = checkTriggersForEvent('instant_sorcery_cast_or_copy', { spell: copy.source as unknown as Card }, gameState);
      mcTriggers.forEach(trigger => addToStack(trigger));
    }
    setCopyTargetingState(null);
    addLog(`Copy of ${copy.source.name} keeps original target`);

    if (!holdingPriority) {
      setTimeout(() => resolveStack(), 100);
    }
  }, [copyTargetingState, addLog, addToStack, holdingPriority, resolveStack, gameState]);

  const cancelCopyTargeting = useCallback(() => {
    // If we were in counter targeting, the card was already consumed from hand
    // and mana was already spent — restore both from the pre-cast snapshot.
    if (copyTargetingState?.preCastHand && copyTargetingState?.preCastManaPool) {
      const restoredHand = copyTargetingState.preCastHand;
      const restoredMana = copyTargetingState.preCastManaPool;
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: {
            ...prev.players,
            you: { ...prev.players.you, hand: restoredHand, mana_pool: restoredMana }
          }
        };
      });
      addLog(`Cancelled — ${copyTargetingState.sourceCard?.name} returned to hand`);
    } else {
      addLog('Cancelled spell copy');
    }
    setCopyTargetingState(null);
  }, [addLog, copyTargetingState]);

  // Channel mechanics
  const useChannel = useCallback(() => {
    if (!selectedCard) return;

    const card = selectedCard;
    const channelCost = card.oracle_text?.match(/Channel.*\{(\d+)\}/)?.[1];

    if (!channelCost) return;

    const costAmount = parseInt(channelCost, 10);

    // Pay life
    setGameState(prev => {
      if (!prev) return prev;
      const newLife = prev.players.you.life - costAmount;

      if (newLife < 0) {
        addLog('Not enough life to channel');
        return prev;
      }

      return {
        ...prev,
        players: {
          ...prev.players,
          you: {
            ...prev.players.you,
            life: newLife,
            hand: prev.players.you.hand.filter(c => c.instance_id !== card.instance_id),
            ...graveyardZones(card, prev.players.you, prev)
          }
        }
      };
    });

    // Get mana from channel (usually adds specific mana)
    const manaMatch = card.oracle_text?.match(/add \{([WUBRGC])\}/i);
    if (manaMatch) {
      const manaColor = manaMatch[1];
      setGameState(prev => {
        if (!prev) return prev;
        const manaPool = { ...prev.players.you.mana_pool };
        manaPool[manaColor] = (manaPool[manaColor] || 0) + 1;
        return {
          ...prev,
          players: {
            ...prev.players,
            you: { ...prev.players.you, mana_pool: manaPool }
          }
        };
      });
      addLog(`Channeled ${card.name} for {${manaColor}}`);
    }

    setSelectedCard(null);
    setChannelActive(false);
  }, [selectedCard, gameState, addLog]);

  const deactivateChannel = useCallback(() => {
    setChannelActive(false);
  }, []);

  if (isHydrating || !gameState) {
    return <div>Loading puzzle...</div>;
  }

  const contextValue: PuzzleContextValue = {
    gameState,
    selectedCard,
    isTargeting,
    targetingOrigin,
    mousePosition,
    gameLog,
    stack,
    declaredAttackers,
    isDeclaringAttackers,
    holdingPriority,
    multiTargetingState,
    stormTargetingState,
    cyclingState,
    channelActive,
    manaColorSelection,
    ballistaState,
    xCostState,
    spellsCastThisTurn,
    landsPlayedThisTurn,
    awaitingStackInput,
    activatedAbilityTargeting,
    protectionColorChoice,
    modalTriggerChoice,

    selectCardFromHand,
    castSpellOnTarget,
    cancelTargeting,
    updateMousePosition,
    isValidTarget,
    advancePhase,
    getCurrentPhase,
    canCastSorcerySpeed,
    toggleAttacker,
    attackerTargets,
    setAttackerTarget,
    confirmAttackers,
    addLog,
    tapLandForMana,
    getLandManaAbilities: getLandManaAbilitiesWrapper,
    getNonbasicLandOverride,
    activateAbility,
    completeActivatedAbilityWithTarget,
    cancelActivatedAbilityTargeting,
    completeProtectionWithColor,
    cancelProtectionColorChoice,
    completeModalTriggerChoice,
    calculateBattlefieldPower,
    castWithEvoke,
    castWithDash,
    castWithImpending,
    castWithOverload,
    castWithKicker,
    castWithBuyback,
    castWithOffspring,
    castWithSquad,
    multikickerState,
    startMultikicker,
    startReplicate,
    confirmMultikicker,
    cancelMultikicker,
    collectEvidenceState,
    startCollectEvidence,
    toggleEvidenceCard,
    confirmEvidence,
    cancelEvidence,
    delveState,
    startDelve,
    toggleDelveCard,
    confirmDelve,
    cancelDelve,
    convokeState,
    startConvoke,
    toggleConvokeCreature,
    confirmConvoke,
    cancelConvoke,
    improviseState,
    startImprovise,
    toggleImproviseArtifact,
    confirmImprovise,
    cancelImprovise,
    emergeState,
    startEmerge,
    completeEmerge,
    cancelEmerge,
    phyrexianManaState,
    startPhyrexianCast,
    setPhyrexianPipsPayingLife,
    confirmPhyrexianCast,
    cancelPhyrexianCast,
    startSuspend,
    suspendCastPending,
    acceptSuspendCast,
    declineSuspendCast,
    activateCycling,
    activateChannel,
    activateTransmute,
    madnessCastPending,
    acceptMadnessCast,
    declineMadnessCast,
    miracleRevealPending,
    revealMiracle,
    declineMiracleReveal,
    miracleCastPending,
    acceptMiracleCast,
    declineMiracleCast,
    ninjutsuState,
    activateNinjutsu,
    completeNinjutsu,
    cancelNinjutsu,
    selectManaColor,
    cancelManaColorSelection,
    startBallistaAbility,
    completeBallistaAbility,
    cancelBallistaAbility,
    confirmXCost,
    cancelXCostSelection,
    resolveTopOfStack,
    resolveAllStack,
    toggleHoldPriority,
    addToStack,
    startMultiTargeting,
    addDamageTarget,
    adjustDamageAmount,
    confirmMultiTargets,
    cancelMultiTargeting,
    assignStormCopyTarget,
    sendAllStormCopiesToOriginalTarget,
    cancelStormTargeting,
    useChannel,
    deactivateChannel,
    addCardToZone,
    addMana,
    sacrificeMode,
    selectSacrificeTarget,
    cancelSacrificeMode,
    copyTargetingState,
    selectStackSpellTarget,
    assignCopyNewTarget,
    keepCopyOriginalTarget,
    cancelCopyTargeting,
    abilityMenuState,
    openAbilityMenu,
    selectAbilityFromMenu,
    cancelAbilityMenu,
    optionalTriggerPromptState,
    acceptOptionalTrigger,
    declineOptionalTrigger,
    lookTakeState,
    completeLookTake,
    discardSelectionState,
    completeDiscard,
    payToUntapState,
    acceptPayToUntap,
    declinePayToUntap,
    counterUnlessPayState,
    payToPreventCounter,
    declineToPayCounter,
    wardDiscardComplete,
    extortState,
    payExtort,
    declineExtort,
    triggerOrderingState,
    confirmTriggerOrder,
    endurePromptState,
    acceptEndure,
    declineEndure,
    legendRuleState,
    resolveLegendRule,
    targetedDiscardState,
    completeTargetedDiscard,
    triggerTargetingState,
    completeTriggerTarget,
    modalSpellState,
    selectModalSpellMode,
    completeModalSpellTarget,
    cancelModalSpell,
    tutorSelectionState,
    completeTutorSelection,
    scrySelectionState,
    completeScrySelection,
    additionalCostDiscardState,
    completeAdditionalCostDiscard,
    cancelAdditionalCostDiscard,
  };

  return (
    <PuzzleContext.Provider value={contextValue}>
      {children}
    </PuzzleContext.Provider>
  );
};
