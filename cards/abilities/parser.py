"""
Ability parser and normalizer.
Converts legacy ability formats to standardized schema.
"""

from typing import Any, Dict, List, Optional
import copy


def parse_trigger(trigger: Any) -> Dict[str, Any]:
    """
    Parse and normalize a trigger definition.

    Args:
        trigger: Trigger data (string or dict)

    Returns:
        Normalized trigger dict
    """
    # If trigger is already a dict with 'event', return as-is
    if isinstance(trigger, dict) and 'event' in trigger:
        return trigger

    # If trigger is a string, convert to object format
    if isinstance(trigger, str):
        return {
            'event': trigger,
            'source': 'self'
        }

    # Legacy format: dict without 'event' field
    if isinstance(trigger, dict):
        # Try to infer event from trigger type
        trigger_copy = copy.deepcopy(trigger)
        if 'trigger' in trigger_copy:
            # Old format had 'trigger' field
            return {
                'event': trigger_copy['trigger'],
                'source': trigger_copy.get('source', 'self')
            }

    return trigger


def parse_effect(effect: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse and normalize an effect definition.

    Args:
        effect: Effect data dict

    Returns:
        Normalized effect dict
    """
    if not isinstance(effect, dict):
        return effect

    effect_copy = copy.deepcopy(effect)

    # Normalize counter_type vs counterType
    if 'counterType' in effect_copy and 'counter_type' not in effect_copy:
        effect_copy['counter_type'] = effect_copy['counterType']
        del effect_copy['counterType']

    return effect_copy


def parse_cost(cost: Any) -> Dict[str, Any]:
    """
    Parse and normalize an activated ability cost.

    Args:
        cost: Cost data (string or dict)

    Returns:
        Normalized cost dict
    """
    # If cost is already a dict, return normalized version
    if isinstance(cost, dict):
        return copy.deepcopy(cost)

    # If cost is a string (legacy format like "{2}{R}"), parse it
    if isinstance(cost, str):
        return parse_mana_cost_string(cost)

    return {}


def parse_mana_cost_string(cost_str: str) -> Dict[str, Any]:
    """
    Parse a mana cost string like "{2}{R}{G}" into structured format.

    Args:
        cost_str: Mana cost string

    Returns:
        Normalized cost dict with mana field
    """
    import re

    cost_dict = {
        'mana': {
            'generic': 0,
            'colored': {}
        }
    }

    # Extract all mana symbols
    symbols = re.findall(r'\{([^}]+)\}', cost_str)

    for symbol in symbols:
        # Check if it's a number (generic mana)
        if symbol.isdigit():
            cost_dict['mana']['generic'] += int(symbol)
        # Check if it's a colored mana symbol
        elif symbol in ['W', 'U', 'B', 'R', 'G', 'C']:
            if symbol not in cost_dict['mana']['colored']:
                cost_dict['mana']['colored'][symbol] = 0
            cost_dict['mana']['colored'][symbol] += 1
        # Check if it's tap symbol
        elif symbol == 'T':
            cost_dict['tap'] = True

    # Clean up empty colored dict
    if not cost_dict['mana']['colored']:
        del cost_dict['mana']['colored']

    return cost_dict


def parse_triggered_ability(ability: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse and normalize a triggered ability.

    Args:
        ability: Triggered ability dict

    Returns:
        Normalized triggered ability
    """
    normalized = {
        'type': 'triggered'
    }

    # Parse trigger
    if 'trigger' in ability:
        normalized['trigger'] = parse_trigger(ability['trigger'])
    else:
        # Missing trigger - return as-is for validator to catch
        return ability

    # Parse effect
    if 'effect' in ability:
        normalized['effect'] = parse_effect(ability['effect'])

    # Copy optional fields
    for field in ['requires_input', 'optional', 'condition']:
        if field in ability:
            normalized[field] = ability[field]

    return normalized


def parse_activated_ability(ability: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse and normalize an activated ability.

    Args:
        ability: Activated ability dict

    Returns:
        Normalized activated ability
    """
    normalized = {
        'type': 'activated'
    }

    # Parse cost
    if 'cost' in ability:
        normalized['cost'] = parse_cost(ability['cost'])

    # Parse effect
    if 'effect' in ability:
        normalized['effect'] = parse_effect(ability['effect'])

    # Copy optional fields
    for field in ['timing', 'requires_target', 'usable_while_tapped', 'description']:
        if field in ability:
            normalized[field] = ability[field]

    return normalized


def parse_static_ability(ability: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse and normalize a static ability.

    Args:
        ability: Static ability dict

    Returns:
        Normalized static ability
    """
    normalized = {
        'type': 'static'
    }

    # Parse effect
    if 'effect' in ability:
        normalized['effect'] = parse_effect(ability['effect'])

    # Copy optional fields
    for field in ['condition', 'duration', 'layer']:
        if field in ability:
            normalized[field] = ability[field]

    return normalized


def convert_legacy_keywords(card_data: Dict[str, Any]) -> List[str]:
    """
    Convert legacy hasKeyword fields to keywords array.

    Args:
        card_data: Card data dict

    Returns:
        List of keyword strings
    """
    keywords = []

    # Map of legacy fields to keyword names
    legacy_map = {
        'hasHaste': 'haste',
        'hasFlying': 'flying',
        'hasTrample': 'trample',
        'hasVigilance': 'vigilance',
        'hasLifelink': 'lifelink',
        'hasDeathtouch': 'deathtouch',
        'hasFirstStrike': 'first_strike',
        'hasDoubleStrike': 'double_strike',
        'hasHexproof': 'hexproof',
        'hasIndestructible': 'indestructible',
    }

    for field, keyword in legacy_map.items():
        if card_data.get(field):
            keywords.append(keyword)

    return keywords


def convert_legacy_prowess(card_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Convert legacy hasProwess field to triggered ability.

    Args:
        card_data: Card data dict

    Returns:
        Prowess triggered ability or None
    """
    if not card_data.get('hasProwess'):
        return None

    return {
        'type': 'triggered',
        'trigger': {
            'event': 'noncreature_spell_cast',
            'source': 'controller'
        },
        'effect': {
            'type': 'buff_until_eot',
            'target': 'self',
            'power': 1,
            'toughness': 1
        }
    }


def normalize_card_abilities(card_data: Dict[str, Any], convert_legacy: bool = True) -> Dict[str, Any]:
    """
    Normalize all abilities on a card to standard format.

    Args:
        card_data: Card data dictionary
        convert_legacy: Whether to convert legacy formats (default True)

    Returns:
        Normalized card data with standardized abilities
    """
    normalized = copy.deepcopy(card_data)

    # Get abilities object (supports both nested and flat structure)
    if 'abilities' not in normalized:
        normalized['abilities'] = {}

    abilities = normalized['abilities']

    # Convert legacy keywords
    if convert_legacy:
        legacy_keywords = convert_legacy_keywords(card_data)
        if legacy_keywords:
            if 'keywords' not in abilities:
                abilities['keywords'] = []
            # Add legacy keywords without duplicates
            for kw in legacy_keywords:
                if kw not in abilities['keywords']:
                    abilities['keywords'].append(kw)

    # Normalize triggered abilities
    triggered = abilities.get('triggered', abilities.get('triggered_abilities', []))
    if triggered:
        normalized_triggered = []
        for ability in triggered:
            if isinstance(ability, dict):
                normalized_triggered.append(parse_triggered_ability(ability))
        abilities['triggered'] = normalized_triggered
        # Remove old key if present
        if 'triggered_abilities' in abilities:
            del abilities['triggered_abilities']
    else:
        abilities['triggered'] = []

    # Convert legacy prowess
    if convert_legacy:
        prowess_ability = convert_legacy_prowess(card_data)
        if prowess_ability:
            abilities['triggered'].append(prowess_ability)

    # Normalize activated abilities
    activated = abilities.get('activated', abilities.get('activated_abilities', []))
    if activated:
        normalized_activated = []
        for ability in activated:
            if isinstance(ability, dict):
                normalized_activated.append(parse_activated_ability(ability))
        abilities['activated'] = normalized_activated
        # Remove old key if present
        if 'activated_abilities' in abilities:
            del abilities['activated_abilities']
    else:
        abilities['activated'] = []

    # Normalize static abilities
    static = abilities.get('static', abilities.get('static_abilities', []))
    if static:
        normalized_static = []
        for ability in static:
            if isinstance(ability, dict):
                normalized_static.append(parse_static_ability(ability))
        abilities['static'] = normalized_static
        # Remove old key if present
        if 'static_abilities' in abilities:
            del abilities['static_abilities']
    else:
        abilities['static'] = []

    return normalized


def get_ability_summary(card_data: Dict[str, Any]) -> str:
    """
    Generate a human-readable summary of a card's abilities.

    Args:
        card_data: Card data dict

    Returns:
        Summary string
    """
    abilities = card_data.get('abilities', card_data)
    parts = []

    # Keywords
    keywords = abilities.get('keywords', [])
    if keywords:
        parts.append(f"Keywords: {', '.join(keywords)}")

    # Triggered abilities
    triggered = abilities.get('triggered', abilities.get('triggered_abilities', []))
    if triggered:
        parts.append(f"{len(triggered)} triggered ability(ies)")

    # Activated abilities
    activated = abilities.get('activated', abilities.get('activated_abilities', []))
    if activated:
        parts.append(f"{len(activated)} activated ability(ies)")

    # Static abilities
    static = abilities.get('static', abilities.get('static_abilities', []))
    if static:
        parts.append(f"{len(static)} static ability(ies)")

    return '; '.join(parts) if parts else 'No abilities'
