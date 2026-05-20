import { FC, useState, useRef, MouseEvent } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';
import { getEffectiveActivatedAbilities } from '../../engine/utils/grantedAbilities';
import { canActivateTapAbility } from '../../engine/utils/summoningSickness';
import { Card, Permanent, PlayerKey, Cost } from '@/types';
import { matchesSacFilter } from '../../engine/utils/sacFilter';
import CachedCardImage from '../CachedCardImage';

// Helper to format activated ability costs
const formatActivatedCost = (cost: Cost | string | undefined): string => {
  if (!cost) return 'Activate';
  if (typeof cost === 'string') return cost;

  const parts: string[] = [];
  if (cost.mana) parts.push(String(cost.mana));
  if (cost.tap) parts.push('{T}');
  if (cost.sacrifice) parts.push(`Sacrifice ${cost.sacrifice}`);
  if (cost.remove_counters) {
    const counterType = Object.keys(cost.remove_counters)[0];
    const amount = cost.remove_counters[counterType];
    parts.push(`Remove ${amount} ${counterType} counter${amount > 1 ? 's' : ''}`);
  }

  return parts.length > 0 ? parts.join(', ') : 'Activate';
};

interface PuzzleCardProps {
  card: Card | Permanent;
  showBack?: boolean;
  location?: 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'library';
  owner?: PlayerKey;
}

const PuzzleCard: FC<PuzzleCardProps> = ({
  card,
  showBack = false,
  location = 'battlefield',
  owner = 'you'
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [showManaOptions, setShowManaOptions] = useState(false);
  const [showBallistaOptions, setShowBallistaOptions] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  let puzzle = null;
  try {
    puzzle = usePuzzle();
  } catch {
    // Not in puzzle context, that's okay for static display
  }

  const {
    selectCardFromHand,
    isTargeting,
    selectedCard,
    isValidTarget,
    castSpellOnTarget,
    isDeclaringAttackers,
    declaredAttackers,
    toggleAttacker,
    multiTargetingState,
    addDamageTarget,
    stormTargetingState,
    assignStormCopyTarget,
    castWithEvoke,
    activateCycling,
    activateChannel,
    activateTransmute,
    activateNinjutsu,
    ninjutsuState,
    completeNinjutsu,
    castWithDash,
    castWithImpending,
    castWithOverload,
    castWithKicker,
    castWithBuyback,
    castWithOffspring,
    castWithSquad,
    startMultikicker,
    startReplicate,
    startCollectEvidence,
    startDelve,
    startConvoke,
    startImprovise,
    startEmerge,
    startPhyrexianCast,
    startSuspend,
    startPlot,
    activateAbility,
    tapLandForMana,
    getLandManaAbilities,
    getNonbasicLandOverride,
    // Walking Ballista
    ballistaState,
    startBallistaAbility,
    // Activated ability targeting
    activatedAbilityTargeting,
    completeActivatedAbilityWithTarget,
    // Cost calculation
    calculateBattlefieldPower,
    // Unified sacrifice prompt (Phase 0+)
    sacrificeMode,
    selectSacrificeTarget,
    cancelSacrificeMode,
    // Copy spell retargeting
    copyTargetingState,
    assignCopyNewTarget,
    // Game state for static abilities
    gameState,
    // Multi-ability menu
    openAbilityMenu,
    // Legend rule
    legendRuleState,
    resolveLegendRule,
    // Trigger targeting
    triggerTargetingState,
    completeTriggerTarget,
    // Timing
    canCastSorcerySpeed,
    canCastFromLibraryTop,
    // Modal spell
    modalSpellState,
    completeModalSpellTarget,
  } = puzzle || {};

  if (showBack) {
    return (
      <div className="w-20 h-28 bg-gradient-to-br from-purple-900 to-purple-700 rounded-lg border-2 border-purple-500 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-purple-600 border-2 border-purple-400" />
      </div>
    );
  }

  const isCreature = card.type_line?.toLowerCase().includes('creature');
  const isPlaneswalkerCard = card.type_line?.toLowerCase().includes('planeswalker');
  const loyaltyValue = (card as any).loyalty as number | undefined;
  const isLand = card.type_line?.toLowerCase().includes('land') || (card as Permanent).isLand;
  const isNonbasicLand = isLand && !(card as Permanent).isBasic && !card.type_line?.toLowerCase().match(/\bbasic\b/);
  const isTapped = (card as Permanent).tapped;
  const isInHand = location === 'hand';
  const isOnBattlefield = location === 'battlefield';
  const isInGraveyard = location === 'graveyard';
  const isSuspended = !!(card as any)._suspended;

  // Check if this creature is declared as attacker
  const isAttacking = declaredAttackers?.includes((card as any).card_id) || (card as Permanent).attacking;

  // Check if this card is a valid target when in targeting mode (suspended cards can't be targeted)
  const canBeTargeted = isTargeting && isOnBattlefield && !isSuspended && isCreature && isValidTarget?.('creature', { ...card, owner });
  const canBeGraveyardTargeted = isTargeting && isInGraveyard && isCreature &&
    isValidTarget?.('graveyard_creature', { ...card, owner });
  // Yawgmoth's Will: can cast spells from graveyard
  const canCastFromGraveyard = isInGraveyard && owner === 'you' && !isTargeting &&
    !!(gameState?.players.you as any)?.canPlayFromGraveyard;
  // Flashback / Jump-start: can cast instants/sorceries from graveyard for an
  // alt cost. flashback.cost = mana cost; flashback.sacrifice = additional
  // creature-sac cost (Dread Return); flashback.discard = additional discard
  // cost (Jump-start — Chemister's Insight).
  const canCastFlashback = isInGraveyard && owner === 'you' && !isTargeting &&
    !canCastFromGraveyard && !!((card as any).flashback?.cost || (card as any).flashback?.sacrifice || (card as any).flashback?.discard);
  // Impulse draw / Plot: can play cards exiled face-up.
  // Plotted cards add a turn gate — they're only castable on a turn AFTER the
  // one they were plotted on (and only at sorcery speed, which the cast path
  // already enforces).
  const isInExile = location === 'exile';
  const isInLibrary = location === 'library';
  // Vizier of the Menagerie / Future Sight / Conspicuous Snoop top-of-library cast
  const canCastFromLibrary = isInLibrary && owner === 'you' && !isTargeting &&
    !!(canCastFromLibraryTop?.(card as Card));
  const _impulseEntry = gameState?.impulsedCards?.find(ic => ic.card.instance_id === card.instance_id);
  const _plotReady = !_impulseEntry?.plotted || (_impulseEntry.castableFromTurn ?? 0) <= (gameState?.turnNumber ?? 0);
  const canPlayFromExile = isInExile && owner === 'you' && !isTargeting && !!_impulseEntry && _plotReady;
  // Snapcaster Mage targeting: instant/sorcery in graveyard
  const isInstantOrSorcery = ((card.type_line || '').toLowerCase().includes('instant') ||
    (card.type_line || '').toLowerCase().includes('sorcery'));
  const canBeGraveyardSpellTargeted = isTargeting && isInGraveyard && owner === 'you' &&
    isInstantOrSorcery && isValidTarget?.('graveyard_spell', { ...card, owner });

  // Sorcery-speed timing: dim cards in hand that can't be cast right now
  const isInstantSpeed = isInstantOrSorcery && (card.type_line || '').toLowerCase().includes('instant')
    || (card as any).keywords?.includes('flash');
  const blockedByTiming = isInHand && owner === 'you' && !isInstantSpeed &&
    canCastSorcerySpeed && !canCastSorcerySpeed();

  const canLandBeTargeted = isTargeting && isOnBattlefield && !isSuspended && isLand && (
    isValidTarget?.('land', { ...card, owner }) ||
    (isNonbasicLand && isValidTarget?.('nonbasic_land', { ...card, owner }))
  );
  const isArtifact = (card.type_line || '').toLowerCase().includes('artifact');
  const isEnchantment = (card.type_line || '').toLowerCase().includes('enchantment');
  const canArtifactBeTargeted = isTargeting && isOnBattlefield && !isSuspended && isArtifact &&
    isValidTarget?.('artifact', { ...card, owner });
  const canEnchantmentBeTargeted = isTargeting && isOnBattlefield && !isSuspended && isEnchantment &&
    isValidTarget?.('enchantment', { ...card, owner });
  // Any permanent targeting (Flicker spell)
  const canPermanentBeTargeted = isTargeting && isOnBattlefield && !isSuspended &&
    isValidTarget?.('permanent', { ...card, owner });
  // Trigger-based permanent targeting (Flickerwisp ETB, Banishing Light ETB, Oblivion Ring ETB)
  const canBeTriggerPermanentTargeted = isTargeting && isOnBattlefield &&
    (triggerTargetingState?.validTargetType === 'battlefield_permanent' ||
     triggerTargetingState?.validTargetType === 'opponent_nonland_permanent' ||
     triggerTargetingState?.validTargetType === 'any_nonland_permanent' ||
     (triggerTargetingState?.validTargetType === 'creature_or_player' && isCreature) ||
     (triggerTargetingState?.validTargetType === 'enchantment' && isEnchantment) ||
     (triggerTargetingState?.validTargetType === 'artifact' && isArtifact)) &&
    isValidTarget?.(triggerTargetingState!.validTargetType, { ...card, owner });
  // Myr Retriever death trigger: target artifact in graveyard
  const canBeGraveyardArtifactTargeted = isTargeting && isInGraveyard && owner === 'you' &&
    isArtifact && isValidTarget?.('graveyard_artifact', { ...card, owner });
  const isSelected = selectedCard?.instance_id === card.instance_id;

  // Check if this creature has haste (own keyword OR granted by a static ability on the battlefield)
  const hasHaste = (() => {
    if ((card as any)._dashed) return true; // Dash grants haste
    // Check oracle_text for haste keyword, but strip reminder text (parentheses) first
    // so "Dash {1}{R} (...it gains haste...)" doesn't false-positive
    const oracleNoReminder = (card.oracle_text || '').replace(/\([^)]*\)/g, '').toLowerCase();
    if (oracleNoReminder.includes('haste')) return true;
    if ((card as any).keywords?.includes('haste')) return true;
    // Check if any permanent on our battlefield grants haste to our creatures
    if (isCreature && owner === 'you' && gameState) {
      const allBF = [
        ...(gameState.players.you.battlefield || []),
        ...(gameState.players.opponent.battlefield || []),
      ];
      // Check equipment-granted haste (e.g. Swiftfoot Boots)
      if (allBF.some((eq: any) =>
        eq.equippedTo?.instance_id === card.instance_id &&
        (eq.static_abilities || []).some((sa: any) =>
          sa.effect?.type === 'grant_keywords_equipped' &&
          sa.effect?.keywords?.includes('haste')
        )
      )) return true;
      // Check global static abilities granting haste
      return gameState.players.you.battlefield?.some((perm: any) =>
        perm.static_abilities?.some((sa: any) =>
          sa.effect?.type === 'grant_keyword' &&
          sa.effect?.keyword === 'haste' &&
          sa.effect?.target === 'creatures_you_control'
        )
      ) || false;
    }
    return false;
  })();

  // Check if creature can be declared as attacker (suspended cards can't attack)
  const canDeclareAsAttacker = isDeclaringAttackers && isOnBattlefield && !isSuspended && isCreature && owner === 'you' &&
    !(card as Permanent).tapped && (!(card as Permanent).summoning_sick || hasHaste);

  // Parse power/toughness with counters, prowess bonus, buff effects, and roles
  let displayPower = parseInt(card.power || '0');
  let displayToughness = parseInt(card.toughness || '0');
  const perm = card as Permanent;
  if (perm.counters && perm.counters['+1/+1']) {
    displayPower += perm.counters['+1/+1'];
    displayToughness += perm.counters['+1/+1'];
  }
  if (perm.counters && perm.counters['-1/-1']) {
    displayPower -= perm.counters['-1/-1'];
    displayToughness -= perm.counters['-1/-1'];
  }
  if (perm.prowessBonus) {
    displayPower += perm.prowessBonus;
    displayToughness += perm.prowessBonus;
  }
  if (perm.buffPower) {
    displayPower += perm.buffPower;
  }
  if (perm.buffToughness) {
    displayToughness += perm.buffToughness;
  }
  // Add role bonuses
  if (perm.attachedRoles) {
    perm.attachedRoles.forEach(role => {
      if (role.power) displayPower += role.power;
      if (role.toughness) displayToughness += role.toughness;
    });
  }
  // Add bonuses from attached Aura enchantments and Equipment
  let auraBonusPower = 0;
  let auraBonusToughness = 0;
  let equipBonusPower = 0;
  let equipBonusToughness = 0;
  const attachedEquipmentNames: string[] = [];
  const equipmentGrantedKeywords: string[] = [];
  if (isOnBattlefield && gameState) {
    const allBF: any[] = [
      ...(gameState.players.you.battlefield || []),
      ...(gameState.players.opponent.battlefield || []),
    ];
    allBF.filter(bf => bf.isAura && bf.attachedTo?.instance_id === card.instance_id)
      .forEach(aura => {
        (aura.static_abilities || []).forEach((sa: any) => {
          if (sa.effect?.type === 'buff_enchanted') {
            auraBonusPower += sa.effect.power || 0;
            auraBonusToughness += sa.effect.toughness || 0;
          }
        });
      });
    // Equipment bonuses
    allBF.filter(bf => bf.equippedTo?.instance_id === card.instance_id)
      .forEach(equip => {
        attachedEquipmentNames.push(equip.name);
        (equip.static_abilities || []).forEach((sa: any) => {
          if (sa.effect?.type === 'buff_equipped') {
            equipBonusPower += sa.effect.power || 0;
            equipBonusToughness += sa.effect.toughness || 0;
          }
          if (sa.effect?.type === 'grant_keywords_equipped' && sa.effect?.keywords) {
            for (const kw of sa.effect.keywords) {
              if (!equipmentGrantedKeywords.includes(kw)) {
                equipmentGrantedKeywords.push(kw);
              }
            }
            // Collect ward from equipment
            if (sa.effect.ward) {
              const wardVal = typeof sa.effect.ward === 'string' ? sa.effect.ward : sa.effect.ward.cost;
              if (wardVal && !equipmentGrantedKeywords.includes(`ward ${wardVal}`)) {
                equipmentGrantedKeywords.push(`ward ${wardVal}`);
              }
            }
          }
        });
      });
    displayPower += auraBonusPower + equipBonusPower;
    displayToughness += auraBonusToughness + equipBonusToughness;
  }
  const hasBuffs = perm.prowessBonus || perm.buffPower || perm.buffToughness || (perm.attachedRoles?.length ?? 0) > 0 || (perm.counters?.['-1/-1'] ?? 0) > 0 || auraBonusPower > 0 || auraBonusToughness > 0 || equipBonusPower > 0 || equipBonusToughness > 0;
  const hasRoles = (perm.attachedRoles?.length ?? 0) > 0;

  // Check if card has evoke
  const hasEvoke = card.oracle_text?.toLowerCase().includes('evoke');

  // Check if card has dash
  const hasDash = card.oracle_text?.toLowerCase().includes('dash');

  // Check if card has cycling
  const hasCycling = card.oracle_text?.toLowerCase().includes('cycling');

  // Check if card has transmute
  const hasTransmute = !!card.oracle_text?.match(/Transmute\s+\{/i);

  // Check if card has ninjutsu
  const hasNinjutsu = !!card.oracle_text?.match(/Ninjutsu\s+\{/i);

  // Check if card has suspend
  const hasSuspend = !!card.oracle_text?.match(/Suspend\s+\d+/i);
  const hasPlot = !!card.oracle_text?.match(/Plot\s+\{/i);

  // Check if card has impending
  const hasImpending = !!card.oracle_text?.match(/Impending\s+\d+/i);
  const isImpending = !!(card as any)._impending;

  // Check if card has overload
  const hasOverload = !!card.oracle_text?.match(/Overload\s+\{/i);

  // Check if card has kicker (but not multikicker)
  const hasKicker = !!card.oracle_text?.match(/(?<!Multi)Kicker\s+\{/i);

  // Check if card has collect evidence
  const hasCollectEvidence = !!card.oracle_text?.match(/collect evidence\s+\d+/i);

  // Check if card has buyback
  const hasBuyback = !!card.oracle_text?.match(/Buyback\s+\{/i);

  // Check if card has offspring
  const hasOffspring = !!card.oracle_text?.match(/Offspring\s+\{/i);

  // Check if card has multikicker
  const hasMultikicker = !!card.oracle_text?.match(/Multikicker\s+\{/i);

  // Check if card has replicate
  const hasReplicate = !!card.oracle_text?.match(/Replicate\s+\{/i);

  // Check if card has squad
  const hasSquad = !!card.oracle_text?.match(/Squad\s+\{/i);

  // Check if card has delve
  const hasDelve = card.oracle_text?.toLowerCase().includes('delve');

  // Check if card has convoke
  const hasConvoke = card.oracle_text?.toLowerCase().includes('convoke');

  // Check if card has improvise
  const hasImprovise = card.oracle_text?.toLowerCase().includes('improvise');

  // Check if card has emerge
  const hasEmerge = !!card.oracle_text?.match(/Emerge\s+\{/i);

  // Check if card has Phyrexian mana
  const hasPhyrexianMana = !!(card.mana_cost || '').match(/\{[WUBRG]\/P\}/i);

  // Check if card has channel (from card_data)
  const hasChannel = !!(card as any).channel;

  // Check if card has activated abilities (native + equipment-granted)
  // Blood Moon / Harbinger: nonbasic lands lose all abilities
  const landAbilitiesSuppressed = isNonbasicLand && isOnBattlefield && getNonbasicLandOverride?.() !== null;
  const effectiveActivated = (isOnBattlefield && gameState)
    ? getEffectiveActivatedAbilities(
        card as Permanent,
        [...(gameState.players.you.battlefield || []), ...(gameState.players.opponent.battlefield || [])],
        gameState.players[owner === 'opponent' ? 'opponent' : 'you'].library?.[0] || null,
        owner === 'opponent' ? 'opponent' : 'you',
        gameState,
      )
    : (card.activated_abilities || []);
  const hasActivatedAbility = effectiveActivated.length > 0 && !landAbilitiesSuppressed;

  // Check for special cards (Phyrexian Altar, Walking Ballista)
  const isWalkingBallista = card.name?.toLowerCase() === 'walking ballista';
  const ballistaCounters = perm.counters?.['+1/+1'] || 0;

  // Check for cost reduction abilities (Ghalta, etc.)
  const oracleText = (card.oracle_text || '').toLowerCase();
  const hasPowerCostReduction = oracleText.includes('costs {x} less') ||
    oracleText.includes('cost {x} less') ||
    oracleText.includes('costs x less') ||
    (card as any).cost_reduction_type === 'power';

  // Calculate reduced mana cost for display
  let reducedManaCost = card.mana_cost;
  let costReduction = 0;
  if (hasPowerCostReduction && isInHand && owner === 'you' && calculateBattlefieldPower) {
    costReduction = calculateBattlefieldPower();
    const manaCost = card.mana_cost || '';
    const baseGeneric = parseInt(manaCost.match(/{(\d+)}/)?.[1] || '0');
    const newGeneric = Math.max(0, baseGeneric - costReduction);
    // Replace the generic cost in the mana cost string
    if (baseGeneric > 0) {
      reducedManaCost = manaCost.replace(/{(\d+)}/, `{${newGeneric}}`);
    }
  }

  // Noncreature cost-increase tax from opponent's statics (Thalia, Guardian
  // of Thraben). Display only — the actual math is folded into getCostReduction.
  let noncreatureTax = 0;
  if (isInHand && owner === 'you' && gameState) {
    const tl = (card.type_line || '').toLowerCase();
    if (!tl.includes('creature')) {
      const oppBf = gameState.players.opponent?.battlefield || [];
      for (const perm of oppBf) {
        for (const sa of ((perm as any).static_abilities || [])) {
          if (sa?.effect?.type === 'noncreature_spell_cost_more') {
            noncreatureTax += sa.effect.amount ?? 1;
          }
        }
      }
    }
  }
  let taxedManaCost = card.mana_cost;
  if (noncreatureTax > 0) {
    const manaCost = card.mana_cost || '';
    const baseGenericMatch = manaCost.match(/{(\d+)}/);
    const baseGeneric = baseGenericMatch ? parseInt(baseGenericMatch[1]) : 0;
    const newGeneric = baseGeneric + noncreatureTax;
    if (baseGenericMatch) {
      taxedManaCost = manaCost.replace(/{(\d+)}/, `{${newGeneric}}`);
    } else {
      // No printed generic — prepend the tax (e.g., {R} → {1}{R}).
      taxedManaCost = `{${noncreatureTax}}${manaCost}`;
    }
  }

  // Get land mana abilities
  const landManaAbilities = (isLand && isOnBattlefield && owner === 'you' && getLandManaAbilities)
    ? getLandManaAbilities(card as Permanent)
    : [];

  // Get artifact/permanent mana abilities (tap cost with add_mana effect)
  const artifactManaAbilities = (() => {
    if (isLand || !isOnBattlefield || owner !== 'you' || effectiveActivated.length === 0) return [];
    const abilities: Array<{ mana: string; label: string; selfDamage?: number; manaProduced?: Record<string, number>; manaCost?: any }> = [];
    for (const ab of effectiveActivated) {
      const cost = ab.cost;
      if (typeof cost === 'string' || !cost?.tap || cost.sacrifice || cost.pay_life) continue;

      // Handle add_mana_any_color (Mox Opal)
      if (ab.effect?.type === 'add_mana_any_color') {
        // Check metalcraft condition
        if (ab.condition?.type === 'control_artifacts_gte' && gameState) {
          const artifactCount = gameState.players.you.battlefield.filter(
            (c: any) => (c.type_line || '').toLowerCase().includes('artifact')
          ).length;
          if (artifactCount < ab.condition.value) continue;
        }
        const manaCost = cost.mana || undefined;
        abilities.push({ mana: 'any', label: '{Any}', selfDamage: 0, manaCost });
        continue;
      }

      if (ab.effect?.type !== 'add_mana' || !ab.effect.mana) continue;

      const selfDamage = ab.effect.self_damage || 0;
      const manaCost = cost.mana || undefined;
      const manaEntries = Object.entries(ab.effect.mana);

      if (manaEntries.length === 1) {
        // Single color production (Mox, Sol Ring, Mana Vault)
        const [color, amount] = manaEntries[0];
        const amt = amount as number;
        const label = amt > 1 ? `{${color}}`.repeat(amt) : `{${color}}`;
        abilities.push({ mana: color, label, selfDamage, manaCost, manaProduced: amt > 1 ? ab.effect.mana : undefined });
      } else {
        // Multi color production (Signet)
        const label = manaEntries.map(([c]) => `{${c}}`).join('');
        const key = manaEntries.map(([c]) => c).join('');
        abilities.push({ mana: key, label, selfDamage, manaProduced: ab.effect.mana, manaCost });
      }
    }
    return abilities;
  })();

  const allManaAbilities = [...landManaAbilities, ...artifactManaAbilities];
  // Summoning sickness applies to creatures using tap abilities (MTG 302.1).
  // Check via helper so equipment-granted activated abilities also gate correctly.
  const allBFForTapCheck = gameState
    ? [...(gameState.players.you.battlefield || []), ...(gameState.players.opponent.battlefield || [])]
    : [];
  const canPayTapCost = isOnBattlefield ? canActivateTapAbility(card as Permanent, allBFForTapCheck) : true;

  const canTapForMana = allManaAbilities.length > 0 && !isTapped && !isSuspended && !isTargeting &&
    !isDeclaringAttackers && !stormTargetingState && !multiTargetingState && !sacrificeMode &&
    canPayTapCost;

  // Check if can activate ability (on battlefield, owned by you, not in special modes)
  // If ALL abilities require tap and card is tapped, block activation.
  // If any ability doesn't require tap, allow (the ability menu / activateAbility handles per-ability validation).
  const allAbilitiesRequireTap = hasActivatedAbility && effectiveActivated.every(
    ab => ab.cost && typeof ab.cost !== 'string' && ab.cost.tap
  );
  const canActivateAbility = hasActivatedAbility && isOnBattlefield && !isSuspended && owner === 'you' &&
    !isTargeting && !isDeclaringAttackers && !stormTargetingState && !multiTargetingState &&
    !(allAbilitiesRequireTap && isTapped) &&
    !(allAbilitiesRequireTap && !canPayTapCost);

  // Check if this card is a valid evoke exile target

  // Check if this card is a legend rule duplicate that must be chosen
  const isLegendRuleCandidate = legendRuleState && isOnBattlefield && owner === 'you' &&
    card.name === legendRuleState.legendaryName;

  // Unified sacrifice mode candidate (Phase 0+). Includes already-selected
  // permanents so re-clicking deselects them (Dread Return-style toggle).
  // Styling differentiates selected vs unselected via isSacrificeModeSelected.
  // actor='opponent' (Edicts) auto-resolves — no clicks expected, no highlight.
  const isSacrificeModeCandidate = !!(
    sacrificeMode && sacrificeMode.actor !== 'opponent' && isOnBattlefield &&
    matchesSacFilter(card as Permanent, owner, sacrificeMode.filter, gameState ?? undefined)
  );
  const isSacrificeModeSelected = !!(
    sacrificeMode?.selected.some(s => s.instance_id === card.instance_id)
  );

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();

    if (!puzzle) return;

    // Ninjutsu target selection — highest priority so combat-time swap beats
    // other battlefield click handlers.
    if (isNinjutsuTarget && completeNinjutsu) {
      completeNinjutsu(card as Permanent);
      return;
    }

    // If targeting for trigger (Snapcaster) and this is a valid graveyard spell
    if (canBeGraveyardSpellTargeted && completeTriggerTarget) {
      completeTriggerTarget('graveyard_spell', { ...card, owner });
      return;
    }

    // If targeting for trigger (Myr Retriever) and this is a valid graveyard artifact
    if (canBeGraveyardArtifactTargeted && completeTriggerTarget) {
      completeTriggerTarget('graveyard_artifact', { ...card, owner });
      return;
    }

    // If targeting for reanimate or modal spell and this is a valid graveyard creature
    if (canBeGraveyardTargeted) {
      if (modalSpellState?.phase === 'targeting' && completeModalSpellTarget) {
        completeModalSpellTarget('graveyard_creature', { ...card, owner });
      } else if (castSpellOnTarget) {
        castSpellOnTarget('graveyard_creature', { ...card, owner });
      }
      return;
    }

    // Unified sacrifice mode (Phase 0+) — covers cast-time additional costs,
    // Shard Volley land-sac, and migrating activated/flashback flows.
    if (sacrificeMode && isSacrificeModeCandidate && selectSacrificeTarget) {
      selectSacrificeTarget(card as Permanent);
      return;
    }

    // While sacrificeMode is active (player-actor only), any click on a
    // non-candidate is treated as an implicit cancel: returns the in-flight
    // spell (if any) to hand via onCancel and stops here. Player must click
    // again to take a new action.
    if (sacrificeMode && sacrificeMode.actor !== 'opponent' && cancelSacrificeMode) {
      cancelSacrificeMode();
      return;
    }

    // If in legend rule state, select which legendary copy to keep
    if (isLegendRuleCandidate && resolveLegendRule) {
      resolveLegendRule(card as Permanent);
      return;
    }

    // If in copy retargeting mode, assign as copy target
    if (copyTargetingState?.phase === 'retargeting_copy' && isOnBattlefield && isCreature && assignCopyNewTarget) {
      assignCopyNewTarget('creature', { ...card, owner });
      return;
    }

    // If in storm targeting mode and this is a creature, assign as storm copy target
    if (stormTargetingState && isOnBattlefield && isCreature && assignStormCopyTarget) {
      assignStormCopyTarget('creature', { ...card, owner });
      return;
    }

    // If in multi-targeting mode and this is a valid target, add to targets
    if (multiTargetingState && isOnBattlefield && isCreature && addDamageTarget) {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        addDamageTarget(
          { type: 'creature', data: { ...card }, owner },
          0, // Initial damage, user will adjust
          {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
          }
        );
      }
      return;
    }

    // If declaring attackers and this is a valid attacker, toggle it
    if (canDeclareAsAttacker && toggleAttacker) {
      toggleAttacker(card.instance_id);
      return;
    }

    // Yawgmoth's Will: cast a card from graveyard
    if (canCastFromGraveyard && !isDeclaringAttackers && !stormTargetingState && !copyTargetingState && !sacrificeMode && selectCardFromHand) {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        selectCardFromHand(card as Card, rect);
      }
      return;
    }

    // Flashback: cast from graveyard with alternate cost
    if (canCastFlashback && !isDeclaringAttackers && !stormTargetingState && !copyTargetingState && !sacrificeMode && selectCardFromHand) {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        const fb = (card as any).flashback;
        // Jump-start (Chemister's Insight) uses the card's PRINTED mana cost
        // as the cost — fall back to the original mana_cost when fb.cost is
        // absent. Flashback (Faithless Looting) sets a distinct fb.cost.
        const flashbackCard = {
          ...card,
          mana_cost: fb.cost || card.mana_cost || '',
          _flashbackCast: true,
          ...(fb.sacrifice ? { _flashbackSacrifice: fb.sacrifice } : {}),
          ...(fb.discard ? { _flashbackDiscard: fb.discard } : {}),
        };
        selectCardFromHand(flashbackCard as Card, rect);
      }
      return;
    }

    // Cast from top of library (Vizier of the Menagerie / Future Sight /
    // Conspicuous Snoop). Normal mana cost — the cast pipeline splices the
    // card out of library (and decrements library_count) automatically.
    if (canCastFromLibrary && !isDeclaringAttackers && !stormTargetingState && !copyTargetingState && !sacrificeMode && selectCardFromHand) {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        selectCardFromHand(card as Card, rect);
      }
      return;
    }

    // Impulse draw / Plot: play a card from exile.
    // Plotted cards are cast without paying their mana cost — mark with
    // _altCostPaid so the cast pipeline skips the mana spend.
    if (canPlayFromExile && !isDeclaringAttackers && !stormTargetingState && !copyTargetingState && !sacrificeMode && selectCardFromHand) {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        const cardToCast = _impulseEntry?.plotted
          ? ({ ...card, _altCostPaid: true } as Card)
          : (card as Card);
        selectCardFromHand(cardToCast, rect);
      }
      return;
    }

    // If in hand and owned by player, select to cast
    if (isInHand && owner === 'you' && !isTargeting && !isDeclaringAttackers && !stormTargetingState && !copyTargetingState && !sacrificeMode && selectCardFromHand) {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        selectCardFromHand(card as Card, rect);
      }
      return;
    }

    // If targeting and this is a valid creature target
    if (isTargeting && canBeTargeted) {
      // Check if targeting for activated ability
      if (activatedAbilityTargeting && completeActivatedAbilityWithTarget) {
        completeActivatedAbilityWithTarget('creature', { ...card, owner });
      } else if (modalSpellState?.phase === 'targeting' && completeModalSpellTarget) {
        completeModalSpellTarget('creature', { ...card, owner });
      } else if (triggerTargetingState && completeTriggerTarget) {
        completeTriggerTarget('creature', { ...card, owner });
      } else if (castSpellOnTarget) {
        // Targeting for a spell
        castSpellOnTarget('creature', { ...card, owner });
      }
      return;
    }

    // If targeting and this is a valid land target
    if (isTargeting && canLandBeTargeted) {
      const targetType = isNonbasicLand ? 'nonbasic_land' : 'land';
      // Check if targeting for activated ability
      if (activatedAbilityTargeting && completeActivatedAbilityWithTarget) {
        completeActivatedAbilityWithTarget(targetType, { ...card, owner });
      } else if (modalSpellState?.phase === 'targeting' && completeModalSpellTarget) {
        completeModalSpellTarget(targetType, { ...card, owner });
      } else if (castSpellOnTarget) {
        // Targeting for a spell
        castSpellOnTarget(targetType, { ...card, owner });
      }
      return;
    }

    // If targeting and this is a valid artifact/enchantment target
    if (isTargeting && (canArtifactBeTargeted || canEnchantmentBeTargeted)) {
      const targetType = canArtifactBeTargeted ? 'artifact' : 'enchantment';
      if (activatedAbilityTargeting && completeActivatedAbilityWithTarget) {
        completeActivatedAbilityWithTarget(targetType, { ...card, owner });
      } else if (modalSpellState?.phase === 'targeting' && completeModalSpellTarget) {
        completeModalSpellTarget(targetType, { ...card, owner });
      } else if (triggerTargetingState && completeTriggerTarget) {
        completeTriggerTarget(targetType, { ...card, owner });
      } else if (castSpellOnTarget) {
        castSpellOnTarget(targetType, { ...card, owner });
      }
      return;
    }

    // If targeting and this is a valid permanent target (Flicker spell)
    if (isTargeting && canPermanentBeTargeted) {
      if (activatedAbilityTargeting && completeActivatedAbilityWithTarget) {
        completeActivatedAbilityWithTarget('permanent', { ...card, owner });
      } else if (modalSpellState?.phase === 'targeting' && completeModalSpellTarget) {
        completeModalSpellTarget('permanent', { ...card, owner });
      } else if (castSpellOnTarget) {
        castSpellOnTarget('permanent', { ...card, owner });
      }
      return;
    }

    // If targeting and this is a valid trigger permanent target (Flickerwisp ETB, Banishing Light ETB, Overlord damage)
    if (canBeTriggerPermanentTargeted && completeTriggerTarget) {
      // For creature_or_player targeting, pass 'creature' since this is a card click
      const triggerTargetType = triggerTargetingState!.validTargetType === 'creature_or_player'
        ? 'creature' : triggerTargetingState!.validTargetType;
      completeTriggerTarget(triggerTargetType, { ...card, owner });
      return;
    }

    // Special handling for Walking Ballista
    if (isWalkingBallista && isOnBattlefield && owner === 'you' && ballistaCounters > 0 && !ballistaState && startBallistaAbility) {
      if (ballistaCounters === 1) {
        // Only 1 counter, go straight to targeting
        startBallistaAbility(card as Permanent, 1);
      } else {
        // Multiple counters, show options
        setShowBallistaOptions(true);
      }
      return;
    }

    // If on battlefield with activated ability, activate it (shows menu if multiple)
    if (canActivateAbility && !canTapForMana && !isWalkingBallista) {
      if (openAbilityMenu) {
        openAbilityMenu(card as Permanent);
      } else if (activateAbility) {
        activateAbility(card as Permanent, 0);
      }
      return;
    }

    // If this is a land that can tap for mana
    if (canTapForMana && allManaAbilities.length > 0 && tapLandForMana) {
      // Check if permanent has multiple mana options OR has non-mana activated abilities
      const nonManaActivatedAbilities = hasActivatedAbility && artifactManaAbilities.length === 0;
      const hasMultipleOptions = allManaAbilities.length > 1 || nonManaActivatedAbilities;
      if (!hasMultipleOptions) {
        // Single mana ability, no other abilities - just tap
        const ab = allManaAbilities[0] as any;
        if (ab.mana === 'any' && activateAbility) {
          const abilityIndex = effectiveActivated.findIndex(
            (a: any) => a.effect?.type === 'add_mana_any_color'
          ) ?? 0;
          activateAbility(card as Permanent, abilityIndex);
        } else {
          tapLandForMana(card as Permanent, ab.mana, ab.selfDamage, ab.manaProduced, ab.manaCost);
        }
      } else {
        // Multiple options - show option buttons (handled by mana option buttons)
        setShowManaOptions(true);
      }
      return;
    }
  };

  // Right-click to evoke (for creatures with evoke in hand)
  const handleRightClick = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!puzzle) return;

    // While sacrificeMode is active (player-actor only), treat any right-click
    // as implicit cancel — matches the left-click behavior so cast-variants
    // don't sneak past the modal. Opponent-actor auto-resolves, so don't
    // intercept here.
    if (sacrificeMode && sacrificeMode.actor !== 'opponent' && cancelSacrificeMode) {
      cancelSacrificeMode();
      return;
    }

    // Only allow evoke on creatures with evoke in your hand
    if (isInHand && owner === 'you' && isCreature && hasEvoke && castWithEvoke) {
      castWithEvoke(card as Card);
      return;
    }

    // Dash: cast creature for its dash cost
    if (isInHand && owner === 'you' && isCreature && hasDash && castWithDash) {
      castWithDash(card as Card);
      return;
    }

    // Impending: cast enchantment creature for its impending cost
    if (isInHand && owner === 'you' && hasImpending && castWithImpending) {
      castWithImpending(card as Card);
      return;
    }

    // Suspend: exile from hand with time counters
    if (isInHand && owner === 'you' && hasSuspend && startSuspend) {
      startSuspend(card as Card);
      return;
    }

    // Plot: exile from hand, castable for free on a later turn
    if (isInHand && owner === 'you' && hasPlot && startPlot) {
      startPlot(card as Card);
      return;
    }

    // Overload: cast instant/sorcery for overload cost (replaces "target" with "each")
    if (isInHand && owner === 'you' && hasOverload && castWithOverload) {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        castWithOverload(card as Card, rect);
      }
      return;
    }

    // Kicker: cast spell paying additional kicker cost
    if (isInHand && owner === 'you' && hasKicker && !hasCollectEvidence && castWithKicker) {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        castWithKicker(card as Card, rect);
      }
      return;
    }

    // Squad: open selector for squad count
    if (isInHand && owner === 'you' && hasSquad && castWithSquad) {
      castWithSquad(card as Card);
      return;
    }

    // Replicate: open selector for replicate count
    if (isInHand && owner === 'you' && hasReplicate && startReplicate) {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        startReplicate(card as Card, rect);
      }
      return;
    }

    // Multikicker: open selector for variable kick count
    if (isInHand && owner === 'you' && hasMultikicker && startMultikicker) {
      startMultikicker(card as Card);
      return;
    }

    // Offspring: cast creature paying additional offspring cost
    if (isInHand && owner === 'you' && hasOffspring && castWithOffspring) {
      castWithOffspring(card as Card);
      return;
    }

    // Buyback: cast spell paying additional buyback cost
    if (isInHand && owner === 'you' && hasBuyback && castWithBuyback) {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        castWithBuyback(card as Card, rect);
      }
      return;
    }

    // Collect Evidence: exile graveyard cards as additional cost
    if (isInHand && owner === 'you' && hasCollectEvidence && startCollectEvidence) {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        startCollectEvidence(card as Card, rect);
      }
      return;
    }

    // Phyrexian Mana: choose pips to pay with life
    if (isInHand && owner === 'you' && hasPhyrexianMana && startPhyrexianCast) {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        startPhyrexianCast(card as Card, rect);
      }
      return;
    }

    // Emerge: sacrifice creature to reduce emerge cost
    if (isInHand && owner === 'you' && hasEmerge && startEmerge) {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        startEmerge(card as Card, rect);
      }
      return;
    }

    // Improvise: tap artifacts to reduce generic mana cost
    if (isInHand && owner === 'you' && hasImprovise && startImprovise) {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        startImprovise(card as Card, rect);
      }
      return;
    }

    // Convoke: tap creatures to help pay mana cost
    if (isInHand && owner === 'you' && hasConvoke && startConvoke) {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        startConvoke(card as Card, rect);
      }
      return;
    }

    // Delve: exile graveyard cards to reduce generic mana cost
    if (isInHand && owner === 'you' && hasDelve && startDelve) {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        startDelve(card as Card, rect);
      }
      return;
    }

    // Ninjutsu: activated from hand during declare blockers — only if a valid
    // attacker you control exists. Phase + affordability checks live in the handler.
    if (isInHand && owner === 'you' && hasNinjutsu && activateNinjutsu) {
      activateNinjutsu(card as Card);
      return;
    }

    // Cycling: discard from hand, pay cost, draw a card
    if (isInHand && owner === 'you' && hasCycling && activateCycling) {
      activateCycling(card as Card);
      return;
    }

    // Transmute: sorcery-speed tutor for a card of the same mana value
    if (isInHand && owner === 'you' && hasTransmute && activateTransmute) {
      activateTransmute(card as Card);
      return;
    }

    // Channel: discard from hand, pay cost, resolve channel effect
    if (isInHand && owner === 'you' && hasChannel && activateChannel) {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        activateChannel(card as Card, rect);
      }
    }
  };

  // Check if in copy retargeting mode
  const isCopyRetargetCandidate = copyTargetingState?.phase === 'retargeting_copy' && isOnBattlefield && isCreature;
  // Check if in storm targeting mode
  const isStormTargetCandidate = stormTargetingState && isOnBattlefield && isCreature;
  // Check if in multi-targeting mode
  const isMultiTargetCandidate = multiTargetingState && isOnBattlefield && isCreature;
  const isAlreadyTargeted = multiTargetingState?.assignments?.some(
    a => a.target.type === 'creature' && a.target.data.instance_id === card.instance_id
  );
  // Ninjutsu target: an attacking creature you control, while the ninjutsu
  // selection state is active.
  const isNinjutsuTarget = !!ninjutsuState && isOnBattlefield && owner === 'you' && !!(card as Permanent).attacking;

  // Determine border color based on state
  let borderClass = 'border-gray-600';
  if (perm.summoning_sick && !hasHaste) {
    borderClass = 'border-yellow-500';
  }
  if (isSelected) {
    borderClass = 'border-purple-500 ring-2 ring-purple-400';
  }
  if (canBeTargeted) {
    borderClass = 'border-red-500 ring-2 ring-red-400';
  }
  if (canBeGraveyardTargeted) {
    borderClass = 'border-green-500 ring-2 ring-green-400 cursor-crosshair animate-pulse';
  }
  if (canLandBeTargeted) {
    borderClass = 'border-orange-500 ring-2 ring-orange-400 cursor-crosshair';
  }
  if (canArtifactBeTargeted || canEnchantmentBeTargeted || canPermanentBeTargeted || canBeTriggerPermanentTargeted) {
    borderClass = 'border-red-500 ring-2 ring-red-400 cursor-crosshair animate-pulse';
  }
  if (isCopyRetargetCandidate) {
    borderClass = 'border-blue-500 ring-2 ring-blue-400 cursor-crosshair animate-pulse';
  }
  if (isStormTargetCandidate) {
    borderClass = 'border-yellow-500 ring-2 ring-yellow-400 cursor-crosshair animate-pulse';
  }
  if (isMultiTargetCandidate && !isAlreadyTargeted) {
    borderClass = 'border-orange-500 ring-2 ring-orange-400 cursor-pointer hover:border-orange-300';
  }
  if (isAlreadyTargeted) {
    borderClass = 'border-yellow-500 ring-2 ring-yellow-400';
  }
  if (isAttacking) {
    borderClass = 'border-red-600 ring-2 ring-red-500';
  }
  if (isNinjutsuTarget) {
    borderClass = 'border-slate-300 ring-2 ring-slate-200 cursor-crosshair animate-pulse';
  }
  if (canDeclareAsAttacker && !isAttacking) {
    borderClass = 'border-gray-600 hover:border-orange-400 hover:ring-2 hover:ring-orange-400';
  }
  if (isLegendRuleCandidate) {
    borderClass = 'border-yellow-500 ring-2 ring-yellow-400 cursor-pointer animate-pulse';
  }
  if (isSacrificeModeCandidate) {
    borderClass = 'border-red-500 ring-2 ring-red-400 cursor-pointer animate-pulse';
  }
  if (isSacrificeModeSelected) {
    borderClass = 'border-red-400 ring-2 ring-red-300 bg-red-900/30 cursor-pointer';
  }
  // Per-card guard: don't let mana/activated styling clobber a sac highlight
  // on this card. Without this, e.g. Grim Monolith (tappable for mana) loses
  // its red sac ring under sacrificeMode.
  const isAnySacCandidate = isSacrificeModeCandidate;
  if (canActivateAbility && !sacrificeMode && !canTapForMana && !isWalkingBallista && !isAnySacCandidate) {
    borderClass = 'border-cyan-500 hover:border-cyan-400 hover:ring-2 hover:ring-cyan-400 cursor-pointer';
  }
  // Walking Ballista special styling (only if it has counters)
  if (isWalkingBallista && isOnBattlefield && owner === 'you' && ballistaCounters > 0 && !ballistaState) {
    borderClass = 'border-cyan-500 hover:border-cyan-400 hover:ring-2 hover:ring-cyan-400 cursor-pointer';
  }
  if (canTapForMana && !isAnySacCandidate) {
    borderClass = 'border-amber-500 hover:border-amber-400 hover:ring-2 hover:ring-amber-400 cursor-pointer';
  }
  if (isInHand && owner === 'you' && !isTargeting && !isDeclaringAttackers && !sacrificeMode) {
    borderClass = 'border-gray-600 hover:border-green-400 hover:ring-2 hover:ring-green-400';
  }
  if (canCastFromGraveyard) {
    borderClass = 'border-yellow-400 ring-2 ring-yellow-300 cursor-pointer animate-pulse';
  }
  if (canCastFlashback) {
    borderClass = 'border-orange-400 ring-2 ring-orange-300 cursor-pointer animate-pulse';
  }
  if (canBeGraveyardSpellTargeted || canBeGraveyardArtifactTargeted) {
    borderClass = 'border-purple-400 ring-2 ring-purple-300 cursor-pointer animate-pulse';
  }

  // Handle mana option click
  const handleManaOptionClick = (e: MouseEvent<HTMLButtonElement>, ability: any) => {
    e.stopPropagation();
    if (ability.mana === 'any' && activateAbility) {
      const abilityIndex = effectiveActivated.findIndex(
        (a: any) => a.effect?.type === 'add_mana_any_color'
      ) ?? 0;
      activateAbility(card as Permanent, abilityIndex);
    } else if (tapLandForMana) {
      tapLandForMana(card as Permanent, ability.mana, ability.selfDamage, ability.manaProduced, ability.manaCost);
    }
    setShowManaOptions(false);
  };

  return (
    <div
      ref={cardRef}
      data-instance-id={card.instance_id}
      className={`relative ${isTapped ? 'rotate-90 origin-center mx-4' : ''} transition-transform duration-200`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => { setShowTooltip(false); setShowManaOptions(false); setShowBallistaOptions(false); }}
      onClick={handleClick}
      onContextMenu={handleRightClick}
    >
      <div
        className={`w-20 h-28 bg-gray-800 rounded-lg border-2 ${borderClass} flex flex-col overflow-hidden transition-all cursor-pointer relative ${blockedByTiming ? 'opacity-40' : ''}`}
      >
        {/* Card art (background) */}
        <CachedCardImage
          card={card as any}
          className="absolute inset-0 w-full h-full"
        />

        {/* Top label: card name + mana cost (only if cost was reduced, otherwise the printed cost on the art suffices) */}
        <div className="relative z-[1] px-1 pt-0.5 bg-gradient-to-b from-black/80 to-transparent">
          <div className="text-[10px] font-semibold text-white truncate leading-tight">{card.name}</div>
          {hasPowerCostReduction && costReduction > 0 && isInHand && (
            <div className="text-[10px] truncate text-green-400 leading-tight">
              {reducedManaCost} <span className="line-through text-gray-500">{card.mana_cost}</span>
            </div>
          )}
          {noncreatureTax > 0 && (
            <div className="text-[10px] truncate text-amber-400 leading-tight">
              {taxedManaCost} <span className="line-through text-gray-500">{card.mana_cost}</span>
            </div>
          )}
        </div>

        {/* Bottom right: P/T (creatures) or loyalty handled by the existing badge below */}
        {isCreature && (
          <div className={`absolute bottom-0.5 right-1 z-[1] text-xs font-bold px-1 rounded bg-black/70 ${hasBuffs ? 'text-green-400' : 'text-white'}`}>
            {displayPower}/{displayToughness}
          </div>
        )}

        {/* Loyalty for planeswalkers */}
        {isPlaneswalkerCard && isOnBattlefield && loyaltyValue !== undefined && (
          <div className="text-xs font-bold text-right text-amber-300">
            ◆ {loyaltyValue}
          </div>
        )}

        {/* Counters indicator */}
        {perm.counters && perm.counters['+1/+1'] > 0 && (
          <div className="absolute top-0 right-0 w-5 h-5 bg-green-600 rounded-full text-xs flex items-center justify-center font-bold text-white transform translate-x-1 -translate-y-1">
            +{perm.counters['+1/+1']}
          </div>
        )}

        {/* Loyalty counter badge — prominent corner indicator (planeswalkers) */}
        {isPlaneswalkerCard && isOnBattlefield && loyaltyValue !== undefined && (
          <div className="absolute top-0 right-0 w-7 h-7 bg-amber-500 rounded-full text-xs flex items-center justify-center font-bold text-black transform translate-x-1 -translate-y-1 ring-2 ring-amber-700 shadow-lg">
            {loyaltyValue}
          </div>
        )}
        {perm.counters && perm.counters['-1/-1'] > 0 && (
          <div className="absolute top-0 left-0 w-5 h-5 bg-red-600 rounded-full text-xs flex items-center justify-center font-bold text-white transform -translate-x-1 -translate-y-1">
            -{perm.counters['-1/-1']}
          </div>
        )}

        {/* Prowess indicator */}
        {(perm.prowessBonus ?? 0) > 0 && (
          <div className="absolute bottom-0 right-0 w-5 h-5 bg-blue-600 rounded-full text-xs flex items-center justify-center font-bold text-white transform translate-x-1 translate-y-1">
            P
          </div>
        )}

        {/* Role token indicator */}
        {hasRoles && perm.attachedRoles && (
          <div className="absolute bottom-0 left-0 w-5 h-5 bg-purple-600 rounded-full text-xs flex items-center justify-center font-bold text-white transform -translate-x-1 translate-y-1" title={perm.attachedRoles.map(r => r.type + ' Role').join(', ')}>
            R
          </div>
        )}

        {/* Evoke indicator */}
        {hasEvoke && isInHand && owner === 'you' && (
          <div className="absolute top-0 left-0 w-4 h-4 bg-pink-500 rounded-full text-xs flex items-center justify-center font-bold text-white transform -translate-x-1 -translate-y-1">
            E
          </div>
        )}

        {/* Dash indicator */}
        {hasDash && isInHand && owner === 'you' && !hasEvoke && (
          <div className="absolute top-0 left-0 w-4 h-4 bg-orange-500 rounded-full text-xs flex items-center justify-center font-bold text-white transform -translate-x-1 -translate-y-1">
            D
          </div>
        )}

        {/* Impending indicator */}
        {hasImpending && isInHand && owner === 'you' && (
          <div className="absolute top-0 left-0 w-4 h-4 bg-amber-500 rounded-full text-xs flex items-center justify-center font-bold text-white transform -translate-x-1 -translate-y-1">
            I
          </div>
        )}

        {/* Impending time counter badge + overlay on impending permanents */}
        {isImpending && (card as any).counters?.time > 0 && (
          <>
            <div className="absolute inset-0 bg-amber-500/20 rounded-lg border-2 border-amber-400/60" />
            <div className="absolute top-0 right-0 w-6 h-6 bg-amber-600 rounded-full text-xs flex items-center justify-center font-bold text-white transform translate-x-1 -translate-y-1 z-10">
              {(card as any).counters.time}
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-amber-900/80 text-amber-200 text-xs text-center py-0.5 rounded-b-lg">
              Impending
            </div>
          </>
        )}

        {/* Suspend indicator */}
        {hasSuspend && isInHand && owner === 'you' && !hasEvoke && !hasDash && (
          <div className="absolute top-0 left-0 w-4 h-4 bg-blue-500 rounded-full text-xs flex items-center justify-center font-bold text-white transform -translate-x-1 -translate-y-1">
            S
          </div>
        )}

        {/* Plot indicator (in hand) */}
        {hasPlot && isInHand && owner === 'you' && !hasEvoke && !hasDash && !hasSuspend && (
          <div className="absolute top-0 left-0 w-4 h-4 bg-purple-500 rounded-full text-xs flex items-center justify-center font-bold text-white transform -translate-x-1 -translate-y-1" title="Right-click to plot">
            P
          </div>
        )}

        {/* Suspend time counter badge + overlay on suspended cards */}
        {isSuspended && (card as any).counters?.time > 0 && (
          <>
            <div className="absolute inset-0 bg-blue-500/20 rounded-lg border-2 border-blue-400/60" />
            <div className="absolute top-0 right-0 w-6 h-6 bg-blue-600 rounded-full text-xs flex items-center justify-center font-bold text-white transform translate-x-1 -translate-y-1 z-10">
              {(card as any).counters.time}
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-blue-900/80 text-blue-200 text-xs text-center py-0.5 rounded-b-lg">
              Suspended
            </div>
          </>
        )}

        {/* Overload indicator */}
        {hasOverload && isInHand && owner === 'you' && (
          <div className="absolute top-0 left-0 w-4 h-4 bg-red-600 rounded-full text-xs flex items-center justify-center font-bold text-white transform -translate-x-1 -translate-y-1">
            O
          </div>
        )}

        {/* Kicker indicator */}
        {hasKicker && !hasOverload && !hasCollectEvidence && isInHand && owner === 'you' && (
          <div className="absolute top-0 left-0 w-4 h-4 bg-yellow-500 rounded-full text-xs flex items-center justify-center font-bold text-white transform -translate-x-1 -translate-y-1">
            K
          </div>
        )}

        {/* Squad indicator */}
        {hasSquad && isInHand && owner === 'you' && (
          <div className="absolute top-0 left-0 w-4 h-4 bg-sky-500 rounded-full text-xs flex items-center justify-center font-bold text-white transform -translate-x-1 -translate-y-1">
            S
          </div>
        )}

        {/* Replicate indicator */}
        {hasReplicate && !hasSquad && isInHand && owner === 'you' && (
          <div className="absolute top-0 left-0 w-4 h-4 bg-violet-500 rounded-full text-xs flex items-center justify-center font-bold text-white transform -translate-x-1 -translate-y-1">
            R
          </div>
        )}

        {/* Multikicker indicator */}
        {hasMultikicker && !hasReplicate && isInHand && owner === 'you' && (
          <div className="absolute top-0 left-0 w-4 h-4 bg-yellow-600 rounded-full text-xs flex items-center justify-center font-bold text-white transform -translate-x-1 -translate-y-1">
            M
          </div>
        )}

        {/* Offspring indicator */}
        {hasOffspring && !hasMultikicker && isInHand && owner === 'you' && (
          <div className="absolute top-0 left-0 w-4 h-4 bg-lime-500 rounded-full text-xs flex items-center justify-center font-bold text-white transform -translate-x-1 -translate-y-1">
            O
          </div>
        )}

        {/* Buyback indicator */}
        {hasBuyback && !hasOffspring && isInHand && owner === 'you' && (
          <div className="absolute top-0 left-0 w-4 h-4 bg-teal-500 rounded-full text-xs flex items-center justify-center font-bold text-white transform -translate-x-1 -translate-y-1">
            B
          </div>
        )}

        {/* Phyrexian Mana indicator */}
        {hasPhyrexianMana && isInHand && owner === 'you' && (
          <div className="absolute top-0 left-0 w-4 h-4 bg-fuchsia-500 rounded-full text-xs flex items-center justify-center font-bold text-white transform -translate-x-1 -translate-y-1">
            P
          </div>
        )}

        {/* Emerge indicator */}
        {hasEmerge && !hasPhyrexianMana && isInHand && owner === 'you' && (
          <div className="absolute top-0 left-0 w-4 h-4 bg-purple-600 rounded-full text-xs flex items-center justify-center font-bold text-white transform -translate-x-1 -translate-y-1">
            E
          </div>
        )}

        {/* Improvise indicator */}
        {hasImprovise && !hasEmerge && isInHand && owner === 'you' && (
          <div className="absolute top-0 left-0 w-4 h-4 bg-slate-400 rounded-full text-xs flex items-center justify-center font-bold text-gray-900 transform -translate-x-1 -translate-y-1">
            I
          </div>
        )}

        {/* Convoke indicator */}
        {hasConvoke && !hasImprovise && isInHand && owner === 'you' && (
          <div className="absolute top-0 left-0 w-4 h-4 bg-amber-500 rounded-full text-xs flex items-center justify-center font-bold text-white transform -translate-x-1 -translate-y-1">
            C
          </div>
        )}

        {/* Delve indicator */}
        {hasDelve && !hasConvoke && isInHand && owner === 'you' && (
          <div className="absolute top-0 left-0 w-4 h-4 bg-indigo-500 rounded-full text-xs flex items-center justify-center font-bold text-white transform -translate-x-1 -translate-y-1">
            D
          </div>
        )}

        {/* Collect Evidence indicator */}
        {hasCollectEvidence && !hasDelve && isInHand && owner === 'you' && (
          <div className="absolute top-0 left-0 w-4 h-4 bg-green-600 rounded-full text-xs flex items-center justify-center font-bold text-white transform -translate-x-1 -translate-y-1">
            E
          </div>
        )}

        {/* Cycling indicator */}
        {hasCycling && isInHand && owner === 'you' && (
          <div className="absolute top-0 right-0 w-4 h-4 bg-cyan-500 rounded-full text-xs flex items-center justify-center font-bold text-white transform translate-x-1 -translate-y-1">
            C
          </div>
        )}

        {/* Channel indicator */}
        {hasChannel && isInHand && owner === 'you' && !hasCycling && (
          <div className="absolute top-0 right-0 w-4 h-4 bg-emerald-500 rounded-full text-xs flex items-center justify-center font-bold text-white transform translate-x-1 -translate-y-1">
            Ch
          </div>
        )}

        {/* Transmute indicator */}
        {hasTransmute && isInHand && owner === 'you' && !hasCycling && !hasChannel && (
          <div className="absolute top-0 right-0 w-4 h-4 bg-indigo-500 rounded-full text-xs flex items-center justify-center font-bold text-white transform translate-x-1 -translate-y-1">
            T
          </div>
        )}

        {/* Ninjutsu indicator */}
        {hasNinjutsu && isInHand && owner === 'you' && !hasCycling && !hasChannel && !hasTransmute && (
          <div className="absolute top-0 right-0 w-4 h-4 bg-slate-700 rounded-full text-xs flex items-center justify-center font-bold text-white transform translate-x-1 -translate-y-1">
            N
          </div>
        )}

        {/* Legend rule candidate indicator */}
        {isLegendRuleCandidate && (
          <div className="absolute inset-0 bg-yellow-500/30 rounded-lg flex items-center justify-center">
            <div className="text-yellow-300 text-xs font-bold">KEEP</div>
          </div>
        )}

        {/* Unified sacrifice mode candidate indicator */}
        {(isSacrificeModeCandidate || isSacrificeModeSelected) && (
          <div className="absolute inset-0 bg-red-500/30 rounded-lg flex items-center justify-center">
            <div className="text-red-300 text-xs font-bold">SAC</div>
          </div>
        )}

        {/* Mana ability options for lands with multiple abilities */}
        {canTapForMana && (allManaAbilities.length > 1 || (hasActivatedAbility && artifactManaAbilities.length === 0)) && (showManaOptions || showTooltip) && (
          <div className="absolute inset-0 flex flex-col rounded-lg overflow-hidden">
            {allManaAbilities.map((ability) => {
              const manaColors: Record<string, string> = {
                W: 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800',
                U: 'bg-blue-400 hover:bg-blue-500 text-white',
                B: 'bg-gray-800 hover:bg-gray-900 text-white border-t border-gray-600',
                R: 'bg-red-500 hover:bg-red-600 text-white',
                G: 'bg-green-500 hover:bg-green-600 text-white',
                C: 'bg-gray-400 hover:bg-gray-500 text-gray-800'
              };
              return (
                <button
                  key={ability.mana}
                  onClick={(e) => handleManaOptionClick(e, ability)}
                  className={`flex-1 flex items-center justify-center font-bold text-sm transition-colors ${manaColors[ability.mana] || 'bg-gray-500'}`}
                >
                  {ability.label}
                </button>
              );
            })}
            {/* Show activated ability as additional option if land/permanent has non-mana abilities */}
            {hasActivatedAbility && artifactManaAbilities.length === 0 && effectiveActivated.length > 0 && activateAbility && (
              <button
                onClick={(e) => { e.stopPropagation(); activateAbility(card as Permanent, 0); setShowManaOptions(false); }}
                className="flex-1 flex items-center justify-center font-bold text-xs bg-cyan-600 hover:bg-cyan-700 text-white transition-colors"
              >
                {formatActivatedCost(effectiveActivated[0]?.cost)}
              </button>
            )}
          </div>
        )}

        {/* Walking Ballista counter selection options - only 1 or ALL */}
        {showBallistaOptions && isWalkingBallista && ballistaCounters > 0 && startBallistaAbility && (
          <div className="absolute inset-0 flex flex-col rounded-lg overflow-hidden bg-cyan-900/95 border-2 border-cyan-400">
            <div className="text-xs text-cyan-300 text-center py-1 border-b border-cyan-600">
              Remove counters:
            </div>
            <div className="flex-1 flex flex-col">
              {/* Remove 1 counter */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowBallistaOptions(false);
                  startBallistaAbility(card as Permanent, 1);
                }}
                className="flex-1 flex items-center justify-center text-white font-bold text-sm bg-cyan-700 hover:bg-cyan-600 border-b border-cyan-800 transition-colors"
              >
                1 (1 dmg)
              </button>
              {/* Remove ALL counters (only show if more than 1) */}
              {ballistaCounters > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowBallistaOptions(false);
                    startBallistaAbility(card as Permanent, ballistaCounters);
                  }}
                  className="flex-1 flex items-center justify-center text-white font-bold text-sm bg-red-600 hover:bg-red-500 transition-colors"
                >
                  ALL ({ballistaCounters} dmg)
                </button>
              )}
            </div>
          </div>
        )}

        {/* Attacking indicator */}
        {isAttacking && (
          <div className="absolute inset-0 bg-red-500/30 rounded-lg flex items-center justify-center">
            <div className="text-red-400 text-2xl font-bold">⚔</div>
          </div>
        )}

        {/* Target indicator */}
        {canBeTargeted && (
          <div className="absolute inset-0 bg-red-500/20 rounded-lg flex items-center justify-center">
            <div className="text-red-400 text-2xl">⎯</div>
          </div>
        )}

        {/* Graveyard reanimate target indicator */}
        {canBeGraveyardTargeted && (
          <div className="absolute inset-0 bg-green-500/30 rounded-lg flex items-center justify-center">
            <div className="text-green-300 text-xs font-bold">TARGET</div>
          </div>
        )}

        {/* Yawgmoth's Will: cast from graveyard indicator */}
        {canCastFromGraveyard && (
          <div className="absolute inset-0 bg-yellow-500/30 rounded-lg flex items-center justify-center">
            <div className="text-yellow-200 text-xs font-bold">CAST</div>
          </div>
        )}

        {/* Flashback: cast from graveyard indicator */}
        {canCastFlashback && (
          <div className="absolute inset-0 bg-orange-500/30 rounded-lg flex items-center justify-center">
            <div className="text-orange-200 text-xs font-bold">FLASH<br/>BACK</div>
          </div>
        )}

        {/* Impulse draw: play from exile indicator */}
        {canPlayFromExile && (
          <div className="absolute inset-0 bg-red-500/30 rounded-lg flex items-center justify-center cursor-pointer">
            <div className="text-red-200 text-xs font-bold">PLAY</div>
          </div>
        )}

        {/* Graveyard spell/artifact target (Snapcaster Mage, Myr Retriever) */}
        {(canBeGraveyardSpellTargeted || canBeGraveyardArtifactTargeted) && (
          <div className="absolute inset-0 bg-purple-500/30 rounded-lg flex items-center justify-center">
            <div className="text-purple-200 text-xs font-bold">TARGET</div>
          </div>
        )}

        {/* Aura attachment indicator */}
        {(perm as any).isAura && isOnBattlefield && (
          <div className="absolute bottom-0 right-0 w-4 h-4 bg-purple-500 rounded-full text-xs flex items-center justify-center font-bold text-white transform translate-x-1 translate-y-1" title={`Enchanting ${(perm as any).attachedTo?.owner === 'you' ? 'your' : "opponent's"} creature`}>
            ✦
          </div>
        )}

        {/* Equipment attached indicator (on the equipment card) */}
        {(perm as any).equippedTo && isOnBattlefield && (
          <div className="absolute bottom-0 right-0 w-4 h-4 bg-amber-500 rounded-full text-xs flex items-center justify-center font-bold text-white transform translate-x-1 translate-y-1" title="Equipped">
            ⚔
          </div>
        )}

        {/* Equipment bonus indicator (on the creature) */}
        {attachedEquipmentNames.length > 0 && isOnBattlefield && (
          <div className="absolute top-0 right-0 bg-amber-600 rounded px-1 text-xs font-bold text-white transform translate-x-1 -translate-y-1" title={`Equipped: ${attachedEquipmentNames.join(', ')}`}>
            ⚔
          </div>
        )}

        {/* Can attack indicator */}
        {canDeclareAsAttacker && !isAttacking && (
          <div className="absolute top-0 left-0 w-4 h-4 bg-orange-500 rounded-full text-xs flex items-center justify-center transform -translate-x-1 -translate-y-1">
            !
          </div>
        )}

        {/* Activated ability indicator (hide for pure mana artifacts) */}
        {hasActivatedAbility && isOnBattlefield && owner === 'you' && artifactManaAbilities.length === 0 && (
          <div className="absolute bottom-0 left-0 w-4 h-4 bg-cyan-500 rounded-full text-xs flex items-center justify-center font-bold text-white transform -translate-x-1 translate-y-1">
            A
          </div>
        )}

        {/* Protection indicator */}
        {perm.protection && perm.protection.length > 0 && isOnBattlefield && (
          <div className="absolute top-1 right-1 bg-white bg-opacity-90 rounded px-1 text-xs font-bold flex gap-0.5" title={`Protection from ${perm.protection.join(', ')}`}>
            {perm.protection.map((color, idx) => {
              const colorMap: Record<string, string> = {
                W: 'text-yellow-600',
                U: 'text-blue-600',
                B: 'text-gray-900',
                R: 'text-red-600',
                G: 'text-green-600'
              };
              return <span key={idx} className={colorMap[color] || 'text-gray-600'}>{color}</span>;
            })}
          </div>
        )}
      </div>

      {/* Cards exiled under this permanent (Banishing Light, etc.) */}
      {isOnBattlefield && (gameState?.exiledUnder?.[card.instance_id]?.length ?? 0) > 0 && (
        <div className="mt-0.5">
          {(gameState!.exiledUnder![card.instance_id] || []).map((entry: any) => (
            <div
              key={entry.card.instance_id}
              className="w-20 h-7 bg-gray-900 rounded border border-purple-500/60 px-1 flex items-center -mt-1"
              title={`Exiled: ${entry.card.name} (${entry.card.type_line})`}
            >
              <span className="text-xs text-purple-300 truncate">{entry.card.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tooltip with full card info */}
      {showTooltip && !isTargeting && !isDeclaringAttackers && (
        <div className="absolute z-50 left-full ml-2 top-0 w-64 bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl">
          <div className="font-bold text-white">{card.name}</div>
          {hasPowerCostReduction && costReduction > 0 && isInHand ? (
            <div className="text-sm">
              <span className="text-gray-500 line-through">{card.mana_cost}</span>
              <span className="text-green-400 ml-2">{reducedManaCost}</span>
              <span className="text-green-500 text-xs ml-1">(-{costReduction} from power)</span>
            </div>
          ) : noncreatureTax > 0 ? (
            <div className="text-sm">
              <span className="text-gray-500 line-through">{card.mana_cost}</span>
              <span className="text-amber-400 ml-2">{taxedManaCost}</span>
              <span className="text-amber-500 text-xs ml-1">(+{noncreatureTax} Thalia tax)</span>
            </div>
          ) : (
            <div className="text-sm text-gray-400">{card.mana_cost}</div>
          )}
          <div className="text-sm text-gray-300 mt-1">{card.type_line}</div>
          {card.oracle_text && (
            <div className="text-sm text-gray-400 mt-2 whitespace-pre-wrap">{card.oracle_text}</div>
          )}
          {/* Conditional keywords (e.g., Skymarcher Aspirant flying with city's blessing) */}
          {isOnBattlefield && (card as any).conditional_keywords?.length > 0 && (() => {
            const activeKeywords = ((card as any).conditional_keywords as Array<{keyword: string; condition: string}>)
              .filter(ck => {
                if (ck.condition === 'citys_blessing') return (gameState?.players.you as any)?.hasCitysBlessing;
                return false;
              })
              .map(ck => ck.keyword);
            return activeKeywords.length > 0 ? (
              <div className="flex gap-1 mt-1">
                {activeKeywords.map(kw => (
                  <span key={kw} className="text-xs bg-blue-700/50 text-blue-300 px-1.5 py-0.5 rounded capitalize">
                    {kw}
                  </span>
                ))}
              </div>
            ) : null;
          })()}
          {/* Native ward badge */}
          {isOnBattlefield && (card as any).ward && (
            <div className="flex gap-1 mt-1">
              <span className="text-xs bg-purple-700/50 text-purple-300 px-1.5 py-0.5 rounded capitalize">
                ward—{typeof (card as any).ward === 'string'
                  ? (card as any).ward
                  : (card as any).ward.type === 'discard'
                    ? `discard ${(card as any).ward.count || 1}`
                    : (card as any).ward.cost || '{1}'}
              </span>
            </div>
          )}
          {/* Keywords granted by equipment (e.g., Basilisk Collar granting deathtouch + lifelink) */}
          {isOnBattlefield && equipmentGrantedKeywords.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {equipmentGrantedKeywords.map(kw => (
                <span key={kw} className="text-xs bg-green-700/50 text-green-300 px-1.5 py-0.5 rounded capitalize">
                  {kw}
                </span>
              ))}
            </div>
          )}
          {isCreature && (
            <div className="text-sm font-bold text-white mt-2">
              {displayPower}/{displayToughness}
            </div>
          )}
          {isPlaneswalkerCard && isOnBattlefield && loyaltyValue !== undefined && (
            <div className="text-sm font-bold text-amber-300 mt-2">
              Loyalty: {loyaltyValue}
            </div>
          )}
          {perm.summoning_sick && !hasHaste && (
            <div className="text-xs text-yellow-500 mt-1">Summoning Sick</div>
          )}
          {auraBonusPower > 0 || auraBonusToughness > 0 ? (
            <div className="text-xs text-purple-400 mt-1">
              Enchanted: +{auraBonusPower}/+{auraBonusToughness}
            </div>
          ) : null}
          {isTapped && (
            <div className="text-xs text-gray-500 mt-1">Tapped</div>
          )}
          {(card as any).hasTrample && (
            <div className="text-xs text-orange-400 mt-1">Trample</div>
          )}
          {hasRoles && perm.attachedRoles && (
            <div className="text-xs text-purple-400 mt-1">
              Roles: {perm.attachedRoles.map(r => r.type).join(', ')}
            </div>
          )}
          {isOnBattlefield && (gameState?.exiledUnder?.[card.instance_id]?.length ?? 0) > 0 && (
            <div className="text-xs text-purple-400 mt-1">
              Exiling: {(gameState!.exiledUnder![card.instance_id] || []).map((e: any) => e.card.name).join(', ')}
            </div>
          )}
          {isInHand && owner === 'you' && (
            <div className="text-xs text-green-400 mt-2">Click to cast</div>
          )}
          {canCastFromGraveyard && (
            <div className="text-xs text-yellow-400 mt-2">Click to cast (Yawgmoth's Will)</div>
          )}
          {canCastFlashback && (
            <div className="text-xs text-orange-400 mt-2">
              {(card as any).flashback.discard
                ? `Click to cast (Jump-start: pay ${(card as any).flashback.cost || card.mana_cost || ''} + discard ${(card as any).flashback.discard} card${(card as any).flashback.discard > 1 ? 's' : ''})`
                : `Click to cast (Flashback${(card as any).flashback.cost
                    ? ` ${(card as any).flashback.cost}`
                    : (card as any).flashback.sacrifice
                      ? ` — Sacrifice ${(card as any).flashback.sacrifice.count} ${(card as any).flashback.sacrifice.type}${(card as any).flashback.sacrifice.count > 1 ? 's' : ''}`
                      : ''})`}
            </div>
          )}
          {canPlayFromExile && (
            <div className="text-xs text-red-400 mt-2">Click to play from exile</div>
          )}
          {canCastFromLibrary && (
            <div className="text-xs text-purple-300 mt-2">Click to cast from top of library</div>
          )}
          {isInHand && owner === 'you' && hasEvoke && (
            <div className="text-xs text-pink-400">Right-click to evoke</div>
          )}
          {isInHand && owner === 'you' && hasDash && (
            <div className="text-xs text-orange-400">Right-click to dash</div>
          )}
          {isInHand && owner === 'you' && hasImpending && (
            <div className="text-xs text-amber-400">Right-click to cast with impending</div>
          )}
          {isInHand && owner === 'you' && hasSuspend && (
            <div className="text-xs text-blue-400">Right-click to suspend</div>
          )}
          {isInHand && owner === 'you' && hasPlot && !hasSuspend && (
            <div className="text-xs text-purple-400">Right-click to plot</div>
          )}
          {isInHand && owner === 'you' && hasOverload && (
            <div className="text-xs text-red-400">Right-click to overload</div>
          )}
          {isInHand && owner === 'you' && hasKicker && !hasCollectEvidence && (
            <div className="text-xs text-yellow-400">Right-click to kick</div>
          )}
          {isInHand && owner === 'you' && hasSquad && (
            <div className="text-xs text-sky-400">Right-click for squad</div>
          )}
          {isInHand && owner === 'you' && hasReplicate && (
            <div className="text-xs text-violet-400">Right-click to replicate</div>
          )}
          {isInHand && owner === 'you' && hasMultikicker && (
            <div className="text-xs text-yellow-400">Right-click to multikick</div>
          )}
          {isInHand && owner === 'you' && hasOffspring && (
            <div className="text-xs text-lime-400">Right-click for offspring</div>
          )}
          {isInHand && owner === 'you' && hasBuyback && (
            <div className="text-xs text-teal-400">Right-click for buyback</div>
          )}
          {isInHand && owner === 'you' && hasCollectEvidence && (
            <div className="text-xs text-green-400">Right-click to collect evidence</div>
          )}
          {isInHand && owner === 'you' && hasPhyrexianMana && (
            <div className="text-xs text-fuchsia-400">Right-click for Phyrexian mana</div>
          )}
          {isInHand && owner === 'you' && hasEmerge && (
            <div className="text-xs text-purple-400">Right-click to emerge</div>
          )}
          {isInHand && owner === 'you' && hasImprovise && (
            <div className="text-xs text-slate-400">Right-click to improvise</div>
          )}
          {isInHand && owner === 'you' && hasConvoke && (
            <div className="text-xs text-amber-400">Right-click to convoke</div>
          )}
          {isInHand && owner === 'you' && hasDelve && (
            <div className="text-xs text-indigo-400">Right-click to delve</div>
          )}
          {isInHand && owner === 'you' && hasCycling && (
            <div className="text-xs text-cyan-400">Right-click to cycle</div>
          )}
          {isInHand && owner === 'you' && hasChannel && (
            <div className="text-xs text-emerald-400">Right-click to channel</div>
          )}
          {isInHand && owner === 'you' && hasTransmute && (
            <div className="text-xs text-indigo-400">Right-click to transmute (sorcery)</div>
          )}
          {isInHand && owner === 'you' && hasNinjutsu && (
            <div className="text-xs text-slate-300">Right-click to activate ninjutsu (declare blockers)</div>
          )}
          {canActivateAbility && !canTapForMana && !isWalkingBallista && effectiveActivated.length > 0 && (
            <div className="text-xs text-cyan-400 mt-2">
              Click to activate: {formatActivatedCost(effectiveActivated[0]?.cost)} - {effectiveActivated[0]?.description}
            </div>
          )}
          {isWalkingBallista && isOnBattlefield && owner === 'you' && ballistaCounters > 0 && (
            <div className="text-xs text-cyan-400 mt-2">
              Click to remove counters and deal damage ({ballistaCounters} counters)
            </div>
          )}
          {canTapForMana && allManaAbilities.length > 0 && (
            <div className="text-xs text-amber-400 mt-2">
              {allManaAbilities.length === 1
                ? `Click to tap for ${allManaAbilities[0].label}`
                : `Tap for: ${allManaAbilities.map(a => a.label).join(' or ')}`}
            </div>
          )}
          {canTapForMana && hasActivatedAbility && artifactManaAbilities.length === 0 && effectiveActivated.length > 0 && (
            <div className="text-xs text-cyan-400">
              Or: {formatActivatedCost(effectiveActivated[0]?.cost)} - {effectiveActivated[0]?.description}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PuzzleCard;
