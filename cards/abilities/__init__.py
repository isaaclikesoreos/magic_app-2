"""
MTG Ability Parser, Validator, and Builder

This package provides tools for working with Magic: The Gathering card abilities:
- Validation: Check abilities against schema
- Parsing: Convert legacy formats to standard format
- Building: Construct well-formed abilities programmatically

Usage:
    from cards.abilities import validate_card_abilities, normalize_card_abilities
    from cards.abilities.builders import etb_gain_life, prowess

    # Validate a card
    result = validate_card_abilities(card_data)
    if not result.is_valid:
        print(result.errors)

    # Normalize abilities
    normalized = normalize_card_abilities(card_data)

    # Build abilities
    abilities = {
        'triggered': [etb_gain_life(1), prowess()],
        'keywords': ['haste']
    }
"""

from .validator import (
    validate_card_abilities,
    validate_keywords,
    validate_effect,
    validate_trigger,
    validate_cost,
    ValidationResult,
    ValidationError,
)

from .parser import (
    normalize_card_abilities,
    parse_triggered_ability,
    parse_activated_ability,
    parse_static_ability,
    parse_trigger,
    parse_effect,
    parse_cost,
    get_ability_summary,
)

from .builders import (
    # Builders
    TriggerBuilder,
    EffectBuilder,
    CostBuilder,
    # High-level constructors
    triggered_ability,
    activated_ability,
    static_ability,
    # Common templates
    etb_gain_life,
    etb_damage,
    life_gain_counter,
    prowess,
    death_trigger_token,
    sacrifice_altar_mana,
    tap_for_mana,
    # Condition builders
    condition_controller_owns,
    condition_spell_is_noncreature,
    condition_has_card_type,
    condition_power_greater_than,
    # Complete card examples
    build_soul_warden,
    build_ajani_pridemate,
    build_monastery_swiftspear,
    build_phyrexian_altar,
)

__all__ = [
    # Validation
    'validate_card_abilities',
    'validate_keywords',
    'validate_effect',
    'validate_trigger',
    'validate_cost',
    'ValidationResult',
    'ValidationError',
    # Parsing
    'normalize_card_abilities',
    'parse_triggered_ability',
    'parse_activated_ability',
    'parse_static_ability',
    'parse_trigger',
    'parse_effect',
    'parse_cost',
    'get_ability_summary',
    # Builders
    'TriggerBuilder',
    'EffectBuilder',
    'CostBuilder',
    'triggered_ability',
    'activated_ability',
    'static_ability',
    'etb_gain_life',
    'etb_damage',
    'life_gain_counter',
    'prowess',
    'death_trigger_token',
    'sacrifice_altar_mana',
    'tap_for_mana',
    'condition_controller_owns',
    'condition_spell_is_noncreature',
    'condition_has_card_type',
    'condition_power_greater_than',
    'build_soul_warden',
    'build_ajani_pridemate',
    'build_monastery_swiftspear',
    'build_phyrexian_altar',
]

__version__ = '1.0.0'
