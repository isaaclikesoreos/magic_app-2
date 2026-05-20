"""
Ability schema validator.
Validates MTG card abilities against the standardized schema.
"""

from typing import Any, Dict, List, Tuple, Optional


# Valid values for various ability fields
VALID_TRIGGER_EVENTS = {
    # Zone changes
    'enters_battlefield', 'etb', 'leaves_battlefield', 'dies', 'permanent_dies',
    # Combat
    'on_attack', 'on_block', 'deals_combat_damage', 'attacks_or_blocks',
    # Spells
    'spell_cast', 'noncreature_spell_cast', 'second_spell_this_turn',
    # Counters
    'counter_added', 'counter_removed',
    # Life
    'life_gained', 'life_lost', 'damage_dealt',
    # Sacrifice
    'creature_sacrificed', 'permanent_sacrificed',
    # Phases
    'upkeep', 'end_step', 'beginning_of_combat',
    # Legacy support
    'creature_enters_battlefield', 'another_creature_dies', 'sacrifice_creature',
}

VALID_EFFECT_TYPES = {
    # Damage
    'damage', 'damage_all', 'damage_divided', 'damage_per_nonbasic_lands',
    'deal_damage_to_controller', 'damage_to_caster',
    # Life
    'gain_life', 'gain_life_equal_toughness', 'drain_life',
    'gain_life_and_scry', 'opponent_loses_life',
    # Card draw
    'draw_cards', 'each_player_draws', 'scry',
    # Buffs
    'buff_until_eot', 'buff_creature', 'buff_self', 'prowess_trigger',
    'grant_keyword_until_eot',
    # Counters
    'add_counter', 'add_counter_to_self', 'add_counter_to_source',
    'remove_counter',
    # Mana
    'add_mana', 'add_mana_any_color', 'altar_add_mana', 'channel_activate',
    # Battlefield
    'enter_battlefield', 'enter_battlefield_permanent', 'create_token',
    'create_token_copy',
    'destroy', 'sacrifice', 'sacrifice_self', 'return_to_hand',
    'destroy_land', 'wildfire', 'target_player_sacrifice',
    # Roles
    'attach_role', 'create_role',
    # Equipment
    'grant_keywords_equipped',
    # Counter spells
    'counter_spell', 'counter_return_to_hand', 'counter_unless_pay',
    # Cast from graveyard
    'grant_flashback', 'cast_from_graveyard_free',
    # Library search / reorder
    'library_multi_tutor_top',
    # Top of library awareness
    'look_at_top_of_library', 'cast_from_top_of_library', 'grant_activated_from_top_library',
    # Graveyard-resident effects
    'exile_self_from_graveyard',
    # Planeswalker / wish
    'animate_artifact_as_creature', 'wish_from_sideboard',
    # Type-system statics
    'every_creature_type',
    # Cost modifiers
    'noncreature_spell_cost_more',
    # Untap / equipment
    'untap_self', 'attach_self_to_triggering_creature', 'equip', 'doesnt_untap',
    # Granted abilities (equipment)
    'grant_triggered_equipped', 'grant_activated_equipped',
    # Planeswalker effects
    'limit_opponent_draws', 'look_take_filtered_bottom',
    # ETB / counter management
    'enters_with_counters',
}

VALID_KEYWORDS = {
    # Evasion
    'flying', 'menace', 'unblockable',
    # Combat
    'first_strike', 'double_strike', 'trample', 'vigilance', 'reach',
    # Damage
    'lifelink', 'deathtouch',
    # Protection
    'hexproof', 'ward', 'indestructible', 'shroud',
    # Speed
    'haste', 'flash',
    # Blocking
    'defender',
    # Other
    'prowess', 'toxic', 'changeling',
}

VALID_CONDITION_TYPES = {
    'has_card_type', 'controller_owns', 'power_greater_than',
    'base_power_2_or_less', 'permanent_count', 'spell_is_noncreature',
    'creature_type_filter',
}

VALID_CREATURE_TYPE_CONTROLLERS = {'you', 'opponent', 'any'}

VALID_MANA_COLORS = {'W', 'U', 'B', 'R', 'G', 'C'}


class ValidationError:
    """Represents a validation error."""
    def __init__(self, path: str, message: str, severity: str = 'error'):
        self.path = path
        self.message = message
        self.severity = severity  # 'error', 'warning', 'info'

    def __str__(self):
        return f"[{self.severity.upper()}] {self.path}: {self.message}"

    def to_dict(self):
        return {
            'path': self.path,
            'message': self.message,
            'severity': self.severity
        }


class ValidationResult:
    """Result of validation."""
    def __init__(self):
        self.errors: List[ValidationError] = []
        self.warnings: List[ValidationError] = []

    def add_error(self, path: str, message: str):
        self.errors.append(ValidationError(path, message, 'error'))

    def add_warning(self, path: str, message: str):
        self.warnings.append(ValidationError(path, message, 'warning'))

    @property
    def is_valid(self) -> bool:
        return len(self.errors) == 0

    @property
    def has_warnings(self) -> bool:
        return len(self.warnings) > 0

    def to_dict(self):
        return {
            'valid': self.is_valid,
            'errors': [e.to_dict() for e in self.errors],
            'warnings': [w.to_dict() for w in self.warnings]
        }


def validate_keywords(keywords: Any, path: str = 'keywords') -> ValidationResult:
    """Validate keyword abilities."""
    result = ValidationResult()

    if not isinstance(keywords, list):
        result.add_error(path, f"Must be a list, got {type(keywords).__name__}")
        return result

    for i, keyword in enumerate(keywords):
        kw_path = f"{path}[{i}]"

        if not isinstance(keyword, str):
            result.add_error(kw_path, f"Must be a string, got {type(keyword).__name__}")
            continue

        # Normalize to lowercase for comparison
        kw_lower = keyword.lower()
        if kw_lower not in VALID_KEYWORDS:
            result.add_warning(kw_path, f"Unknown keyword '{keyword}'")

    return result


def validate_effect(effect: Any, path: str = 'effect') -> ValidationResult:
    """Validate an effect object."""
    result = ValidationResult()

    if not isinstance(effect, dict):
        result.add_error(path, f"Must be an object, got {type(effect).__name__}")
        return result

    # Check required field: type
    if 'type' not in effect:
        result.add_error(path, "Missing required field 'type'")
        return result

    effect_type = effect['type']
    if not isinstance(effect_type, str):
        result.add_error(f"{path}.type", f"Must be a string, got {type(effect_type).__name__}")
        return result

    # Check if effect type is known
    if effect_type not in VALID_EFFECT_TYPES:
        result.add_warning(f"{path}.type", f"Unknown effect type '{effect_type}'")

    # Validate type-specific fields
    if effect_type in ('damage', 'damage_divided'):
        if 'amount' not in effect and 'amount_from' not in effect:
            result.add_error(path, "Damage effect missing 'amount' or 'amount_from' field")
        elif 'amount' in effect and not isinstance(effect.get('amount'), (int, float)):
            result.add_error(f"{path}.amount", "Must be a number")

    if effect_type == 'damage_all':
        if 'amount' not in effect and 'amount_from' not in effect:
            result.add_error(path, "damage_all effect missing 'amount' or 'amount_from' field")
        targets = effect.get('targets')
        if targets is not None:
            if not isinstance(targets, dict):
                result.add_error(f"{path}.targets", "Must be an object")
            else:
                players = targets.get('players')
                if players is not None and players not in ('each', 'each_opponent', 'you', 'none'):
                    result.add_warning(f"{path}.targets.players", f"Unknown players filter '{players}'")
                perms = targets.get('permanents')
                if perms is not None:
                    if not isinstance(perms, dict):
                        result.add_error(f"{path}.targets.permanents", "Must be an object")
                    else:
                        controller = perms.get('controller')
                        if controller is not None and controller not in ('any', 'opponents', 'you'):
                            result.add_warning(f"{path}.targets.permanents.controller",
                                               f"Unknown controller filter '{controller}'")
                        types = perms.get('types')
                        if types is not None and not isinstance(types, list):
                            result.add_error(f"{path}.targets.permanents.types", "Must be a list of strings")

    if effect_type in ('gain_life', 'draw_cards'):
        if 'amount' not in effect:
            result.add_error(path, f"{effect_type} effect missing 'amount' field")

    if effect_type in ('add_counter', 'add_counter_to_self'):
        if 'counter_type' not in effect and 'counterType' not in effect:
            result.add_warning(path, "Counter effect should have 'counter_type' field")
        if 'amount' not in effect:
            result.add_warning(path, "Counter effect should have 'amount' field")

    if effect_type == 'create_token':
        if 'token' not in effect:
            result.add_error(path, "create_token effect missing 'token' field")

    if effect_type == 'limit_opponent_draws':
        max_per_turn = effect.get('max_per_turn')
        if max_per_turn is not None and not isinstance(max_per_turn, int):
            result.add_error(f"{path}.max_per_turn", "Must be an integer")

    if effect_type == 'look_take_filtered_bottom':
        if 'look_count' not in effect:
            result.add_warning(path, "look_take_filtered_bottom should have 'look_count'")
        f = effect.get('filter')
        if f is not None and not isinstance(f, dict):
            result.add_error(f"{path}.filter", "Must be an object")
        elif isinstance(f, dict):
            ex = f.get('exclude_types')
            if ex is not None and not isinstance(ex, list):
                result.add_error(f"{path}.filter.exclude_types", "Must be a list of strings")

    if effect_type in ('grant_triggered_equipped', 'grant_activated_equipped'):
        ability = effect.get('ability')
        if not isinstance(ability, dict):
            result.add_error(f"{path}.ability", "Must be an object describing the granted ability")
        else:
            if effect_type == 'grant_triggered_equipped':
                sub = validate_triggered_ability(ability, 0)
            else:
                sub = validate_activated_ability(ability, 0)
            for e in sub.errors:
                result.errors.append(type(e)(f"{path}.ability.{e.path.split('[0]', 1)[-1].lstrip('.')}", e.message))
            for w in sub.warnings:
                result.warnings.append(type(w)(f"{path}.ability.{w.path.split('[0]', 1)[-1].lstrip('.')}", w.message))

    if effect_type == 'add_mana':
        per_count = effect.get('mana_per_count')
        if per_count is not None:
            if not isinstance(per_count, list):
                result.add_error(f"{path}.mana_per_count", "Must be a list")
            else:
                for i, entry in enumerate(per_count):
                    entry_path = f"{path}.mana_per_count[{i}]"
                    if not isinstance(entry, dict):
                        result.add_error(entry_path, "Must be an object")
                        continue
                    if 'color' not in entry or entry['color'] not in VALID_MANA_COLORS:
                        result.add_error(f"{entry_path}.color",
                                         f"Must be one of {sorted(VALID_MANA_COLORS)}")
                    if 'count' not in entry:
                        result.add_error(entry_path, "Missing 'count' selector")
                    else:
                        sel_result = validate_count_selector(entry['count'], f"{entry_path}.count")
                        result.errors.extend(sel_result.errors)
                        result.warnings.extend(sel_result.warnings)

    return result


VALID_ZONES = {'hand', 'battlefield', 'graveyard', 'exile', 'library'}
VALID_COUNT_CONTROLLERS = {'all', 'you', 'opponents'}
VALID_COUNT_TYPES = {'cards_with_name'}  # Add new selector types here as needed.


def validate_count_selector(selector: Any, path: str = 'count') -> 'ValidationResult':
    """Validate a count selector used by effects with dynamic amounts."""
    result = ValidationResult()
    if not isinstance(selector, dict):
        result.add_error(path, f"Must be an object, got {type(selector).__name__}")
        return result
    sel_type = selector.get('type')
    if sel_type not in VALID_COUNT_TYPES:
        result.add_warning(f"{path}.type", f"Unknown count selector type '{sel_type}'")
        return result

    if sel_type == 'cards_with_name':
        name = selector.get('name')
        if not isinstance(name, str) or not name:
            result.add_error(f"{path}.name", "Must be a non-empty string")
        zones = selector.get('zones')
        if not isinstance(zones, list) or not zones:
            result.add_error(f"{path}.zones", "Must be a non-empty list of zone names")
        else:
            for z in zones:
                if z not in VALID_ZONES:
                    result.add_warning(f"{path}.zones", f"Unknown zone '{z}'")
        controllers = selector.get('controllers')
        if controllers not in VALID_COUNT_CONTROLLERS:
            result.add_warning(f"{path}.controllers",
                               f"Must be one of {sorted(VALID_COUNT_CONTROLLERS)}")

    return result


def validate_trigger(trigger: Any, path: str = 'trigger') -> ValidationResult:
    """Validate a trigger definition."""
    result = ValidationResult()

    # Support legacy format: just a string
    if isinstance(trigger, str):
        if trigger not in VALID_TRIGGER_EVENTS:
            result.add_warning(path, f"Unknown trigger event '{trigger}'")
        return result

    # New format: object with event field
    if not isinstance(trigger, dict):
        result.add_error(path, f"Must be a string or object, got {type(trigger).__name__}")
        return result

    # Check required field: event
    if 'event' not in trigger:
        result.add_error(path, "Missing required field 'event'")
        return result

    event = trigger['event']
    if not isinstance(event, str):
        result.add_error(f"{path}.event", f"Must be a string, got {type(event).__name__}")
    elif event not in VALID_TRIGGER_EVENTS:
        result.add_warning(f"{path}.event", f"Unknown trigger event '{event}'")

    # Validate optional condition
    if 'condition' in trigger:
        cond_result = validate_condition(trigger['condition'], f"{path}.condition")
        result.errors.extend(cond_result.errors)
        result.warnings.extend(cond_result.warnings)

    return result


def validate_condition(condition: Any, path: str = 'condition') -> ValidationResult:
    """Validate a condition object."""
    result = ValidationResult()

    if not isinstance(condition, dict):
        result.add_error(path, f"Must be an object, got {type(condition).__name__}")
        return result

    if 'type' not in condition:
        result.add_error(path, "Missing required field 'type'")
        return result

    cond_type = condition['type']
    if not isinstance(cond_type, str):
        result.add_error(f"{path}.type", f"Must be a string, got {type(cond_type).__name__}")
    elif cond_type not in VALID_CONDITION_TYPES:
        result.add_warning(f"{path}.type", f"Unknown condition type '{cond_type}'")

    if cond_type == 'creature_type_filter':
        subtypes = condition.get('subtypes')
        if not isinstance(subtypes, list) or not subtypes:
            result.add_error(f"{path}.subtypes", "Must be a non-empty list of subtype strings")
        else:
            for s in subtypes:
                if not isinstance(s, str) or not s:
                    result.add_error(f"{path}.subtypes", "Each subtype must be a non-empty string")
                    break
        controller = condition.get('controller')
        if controller is not None and controller not in VALID_CREATURE_TYPE_CONTROLLERS:
            result.add_warning(f"{path}.controller",
                               f"Must be one of {sorted(VALID_CREATURE_TYPE_CONTROLLERS)}")

    return result


def validate_cost(cost: Any, path: str = 'cost') -> ValidationResult:
    """Validate an activated ability cost."""
    result = ValidationResult()

    if not isinstance(cost, dict):
        result.add_error(path, f"Must be an object, got {type(cost).__name__}")
        return result

    # Loyalty cost (planeswalkers): integer; positive = gain, negative = pay.
    if 'loyalty' in cost:
        if not isinstance(cost['loyalty'], int):
            result.add_error(f"{path}.loyalty", "Must be an integer (positive = gain, negative = pay)")

    # Validate mana cost if present
    if 'mana' in cost:
        mana = cost['mana']
        if not isinstance(mana, dict):
            result.add_error(f"{path}.mana", f"Must be an object, got {type(mana).__name__}")
        else:
            # Validate colored mana
            if 'colored' in mana:
                colored = mana['colored']
                if not isinstance(colored, dict):
                    result.add_error(f"{path}.mana.colored", "Must be an object")
                else:
                    for color, amount in colored.items():
                        if color not in VALID_MANA_COLORS:
                            result.add_warning(f"{path}.mana.colored.{color}", f"Unknown mana color '{color}'")
                        if not isinstance(amount, int):
                            result.add_error(f"{path}.mana.colored.{color}", "Must be an integer")

    # Validate sacrifice cost if present
    if 'sacrifice' in cost:
        sac = cost['sacrifice']
        if not isinstance(sac, dict):
            result.add_error(f"{path}.sacrifice", "Must be an object")
        elif 'type' not in sac and not sac.get('self'):
            # Accept either {type: 'creature'} (sacrifice another) or {self: true} (sacrifice this).
            result.add_error(f"{path}.sacrifice", "Must have 'type' or 'self: true'")

    # Validate boolean costs
    for bool_cost in ['tap', 'untap']:
        if bool_cost in cost and not isinstance(cost[bool_cost], bool):
            result.add_error(f"{path}.{bool_cost}", "Must be a boolean")

    return result


def validate_triggered_ability(ability: Any, index: int, path: str = 'triggered_abilities') -> ValidationResult:
    """Validate a single triggered ability."""
    result = ValidationResult()
    ability_path = f"{path}[{index}]"

    if not isinstance(ability, dict):
        result.add_error(ability_path, f"Must be an object, got {type(ability).__name__}")
        return result

    # Validate trigger
    if 'trigger' not in ability:
        result.add_error(ability_path, "Missing required field 'trigger'")
    else:
        trigger_result = validate_trigger(ability['trigger'], f"{ability_path}.trigger")
        result.errors.extend(trigger_result.errors)
        result.warnings.extend(trigger_result.warnings)

    # Validate effect
    if 'effect' not in ability:
        result.add_error(ability_path, "Missing required field 'effect'")
    else:
        effect_result = validate_effect(ability['effect'], f"{ability_path}.effect")
        result.errors.extend(effect_result.errors)
        result.warnings.extend(effect_result.warnings)

    # Validate optional type field
    if 'type' in ability and ability['type'] != 'triggered':
        result.add_warning(f"{ability_path}.type", f"Expected 'triggered', got '{ability['type']}'")

    return result


def validate_activated_ability(ability: Any, index: int, path: str = 'activated_abilities') -> ValidationResult:
    """Validate a single activated ability."""
    result = ValidationResult()
    ability_path = f"{path}[{index}]"

    if not isinstance(ability, dict):
        result.add_error(ability_path, f"Must be an object, got {type(ability).__name__}")
        return result

    # Validate cost
    if 'cost' not in ability:
        result.add_error(ability_path, "Missing required field 'cost'")
    else:
        cost_result = validate_cost(ability['cost'], f"{ability_path}.cost")
        result.errors.extend(cost_result.errors)
        result.warnings.extend(cost_result.warnings)

    # Validate effect
    if 'effect' not in ability:
        result.add_error(ability_path, "Missing required field 'effect'")
    else:
        effect_result = validate_effect(ability['effect'], f"{ability_path}.effect")
        result.errors.extend(effect_result.errors)
        result.warnings.extend(effect_result.warnings)

    # Validate timing
    if 'timing' in ability:
        timing = ability['timing']
        if timing not in ('instant', 'sorcery', 'any'):
            result.add_warning(f"{ability_path}.timing", f"Unknown timing '{timing}'")

    return result


def validate_static_ability(ability: Any, index: int, path: str = 'static_abilities') -> ValidationResult:
    """Validate a single static ability."""
    result = ValidationResult()
    ability_path = f"{path}[{index}]"

    if not isinstance(ability, dict):
        result.add_error(ability_path, f"Must be an object, got {type(ability).__name__}")
        return result

    # Validate effect
    if 'effect' not in ability:
        result.add_error(ability_path, "Missing required field 'effect'")
    else:
        effect_result = validate_effect(ability['effect'], f"{ability_path}.effect")
        result.errors.extend(effect_result.errors)
        result.warnings.extend(effect_result.warnings)

    return result


def validate_card_abilities(card_data: Dict[str, Any]) -> ValidationResult:
    """
    Validate all abilities on a card.

    Args:
        card_data: Card data dictionary (card_data field from Card model)

    Returns:
        ValidationResult with any errors or warnings
    """
    result = ValidationResult()

    # Check for legacy format fields
    legacy_fields = ['hasHaste', 'hasProwess', 'hasFlying', 'hasTrample']
    for field in legacy_fields:
        if field in card_data:
            result.add_warning('root', f"Legacy field '{field}' detected - consider migrating to 'keywords' array")

    # Get abilities object (supports both nested and flat structure)
    abilities = card_data.get('abilities', card_data)

    # Validate keywords
    if 'keywords' in abilities:
        kw_result = validate_keywords(abilities['keywords'])
        result.errors.extend(kw_result.errors)
        result.warnings.extend(kw_result.warnings)

    # Validate triggered abilities
    triggered = abilities.get('triggered', abilities.get('triggered_abilities', []))
    if triggered:
        if not isinstance(triggered, list):
            result.add_error('triggered_abilities', "Must be a list")
        else:
            for i, ability in enumerate(triggered):
                ability_result = validate_triggered_ability(ability, i)
                result.errors.extend(ability_result.errors)
                result.warnings.extend(ability_result.warnings)

    # Validate activated abilities
    activated = abilities.get('activated', abilities.get('activated_abilities', []))
    if activated:
        if not isinstance(activated, list):
            result.add_error('activated_abilities', "Must be a list")
        else:
            for i, ability in enumerate(activated):
                ability_result = validate_activated_ability(ability, i)
                result.errors.extend(ability_result.errors)
                result.warnings.extend(ability_result.warnings)

    # Validate static abilities
    static = abilities.get('static', abilities.get('static_abilities', []))
    if static:
        if not isinstance(static, list):
            result.add_error('static_abilities', "Must be a list")
        else:
            for i, ability in enumerate(static):
                ability_result = validate_static_ability(ability, i)
                result.errors.extend(ability_result.errors)
                result.warnings.extend(ability_result.warnings)

    # Validate spell_effect (instants and sorceries)
    spell_effect = abilities.get('spell_effect')
    if spell_effect:
        eff_result = validate_effect(spell_effect, 'spell_effect')
        result.errors.extend(eff_result.errors)
        result.warnings.extend(eff_result.warnings)

    return result
