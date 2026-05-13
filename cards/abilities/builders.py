"""
Ability builder utilities.
Provides helper functions to construct well-formed ability objects.
"""

from typing import Any, Dict, List, Optional, Union


class TriggerBuilder:
    """Builder for triggered ability triggers."""

    def __init__(self, event: str):
        self.trigger = {
            'event': event,
            'source': 'self'
        }

    def source(self, source: str):
        """Set the trigger source (self, other, any, controller)."""
        self.trigger['source'] = source
        return self

    def condition(self, condition: Dict[str, Any]):
        """Add a condition to the trigger."""
        self.trigger['condition'] = condition
        return self

    def build(self) -> Dict[str, Any]:
        """Build the trigger object."""
        return self.trigger


class EffectBuilder:
    """Builder for effects."""

    def __init__(self, effect_type: str):
        self.effect = {
            'type': effect_type
        }

    def amount(self, amount: int):
        """Set the effect amount."""
        self.effect['amount'] = amount
        return self

    def target(self, target: str):
        """Set the effect target."""
        self.effect['target'] = target
        return self

    def counter_type(self, counter_type: str):
        """Set the counter type (for counter effects)."""
        self.effect['counter_type'] = counter_type
        return self

    def valid_targets(self, targets: List[str]):
        """Set valid targets (for targeted effects)."""
        self.effect['valid_targets'] = targets
        return self

    def param(self, key: str, value: Any):
        """Add a custom parameter to the effect."""
        self.effect[key] = value
        return self

    def build(self) -> Dict[str, Any]:
        """Build the effect object."""
        return self.effect


class CostBuilder:
    """Builder for activated ability costs."""

    def __init__(self):
        self.cost = {}

    def mana(self, generic: int = 0, **colored):
        """
        Add mana cost.

        Example:
            CostBuilder().mana(generic=2, R=1, G=1)
        """
        self.cost['mana'] = {
            'generic': generic
        }
        if colored:
            self.cost['mana']['colored'] = colored
        return self

    def tap(self):
        """Add tap cost."""
        self.cost['tap'] = True
        return self

    def untap(self):
        """Add untap cost."""
        self.cost['untap'] = True
        return self

    def sacrifice(self, card_type: str, count: int = 1, self_sacrifice: bool = False):
        """
        Add sacrifice cost.

        Args:
            card_type: Type of permanent to sacrifice (creature, artifact, etc.)
            count: How many to sacrifice
            self_sacrifice: Whether to sacrifice this permanent itself
        """
        self.cost['sacrifice'] = {
            'type': card_type,
            'count': count
        }
        if self_sacrifice:
            self.cost['sacrifice']['self'] = True
        return self

    def discard(self, count: int = 1):
        """Add discard cost."""
        self.cost['discard'] = {
            'count': count
        }
        return self

    def pay_life(self, amount: int):
        """Add life payment cost."""
        self.cost['pay_life'] = amount
        return self

    def remove_counters(self, counter_type: str, amount: int):
        """Add counter removal cost."""
        self.cost['remove_counters'] = {
            counter_type: amount
        }
        return self

    def build(self) -> Dict[str, Any]:
        """Build the cost object."""
        return self.cost


# High-level ability builders

def triggered_ability(
    event: str,
    effect: Dict[str, Any],
    source: str = 'self',
    requires_input: bool = False,
    optional: bool = False,
    condition: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Build a triggered ability.

    Args:
        event: Trigger event type
        effect: Effect dict (use EffectBuilder)
        source: Trigger source (self, other, any, controller)
        requires_input: Whether ability needs player input
        optional: Whether ability is optional
        condition: Optional condition dict

    Returns:
        Complete triggered ability dict
    """
    ability = {
        'type': 'triggered',
        'trigger': {
            'event': event,
            'source': source
        },
        'effect': effect
    }

    if requires_input:
        ability['requires_input'] = True
    if optional:
        ability['optional'] = True
    if condition:
        ability['trigger']['condition'] = condition

    return ability


def activated_ability(
    cost: Dict[str, Any],
    effect: Dict[str, Any],
    timing: str = 'instant',
    requires_target: bool = False
) -> Dict[str, Any]:
    """
    Build an activated ability.

    Args:
        cost: Cost dict (use CostBuilder)
        effect: Effect dict (use EffectBuilder)
        timing: When it can be activated (instant, sorcery, any)
        requires_target: Whether it needs a target

    Returns:
        Complete activated ability dict
    """
    ability = {
        'type': 'activated',
        'cost': cost,
        'effect': effect,
        'timing': timing
    }

    if requires_target:
        ability['requires_target'] = True

    return ability


def static_ability(
    effect: Dict[str, Any],
    condition: Optional[Dict[str, Any]] = None,
    duration: str = 'while_on_battlefield'
) -> Dict[str, Any]:
    """
    Build a static ability.

    Args:
        effect: Effect dict (use EffectBuilder)
        condition: Optional condition for when ability is active
        duration: How long the ability lasts

    Returns:
        Complete static ability dict
    """
    ability = {
        'type': 'static',
        'effect': effect,
        'duration': duration
    }

    if condition:
        ability['condition'] = condition

    return ability


# Common ability templates

def etb_gain_life(amount: int) -> Dict[str, Any]:
    """Create an ETB trigger that gains life (Soul Warden, Essence Warden)."""
    return triggered_ability(
        event='creature_enters_battlefield',
        effect=EffectBuilder('gain_life').amount(amount).build(),
        source='other'
    )


def etb_damage(amount: int, targets: List[str]) -> Dict[str, Any]:
    """Create an ETB trigger that deals damage with targeting."""
    return triggered_ability(
        event='enters_battlefield',
        effect=EffectBuilder('damage').amount(amount).valid_targets(targets).build(),
        requires_input=True
    )


def life_gain_counter(counter_type: str = '+1/+1', amount: int = 1) -> Dict[str, Any]:
    """Create a life gain trigger that adds counters (Ajani's Pridemate)."""
    return triggered_ability(
        event='life_gained',
        effect=EffectBuilder('add_counter').counter_type(counter_type).amount(amount).build()
    )


def prowess() -> Dict[str, Any]:
    """Create a Prowess triggered ability."""
    return triggered_ability(
        event='noncreature_spell_cast',
        effect=EffectBuilder('buff_until_eot').target('self').param('power', 1).param('toughness', 1).build()
    )


def death_trigger_token(token_data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a death/leaves-battlefield trigger that creates a token (Thragtusk)."""
    return triggered_ability(
        event='leaves_battlefield',
        effect=EffectBuilder('create_token').param('token', token_data).param('count', 1).build()
    )


def sacrifice_altar_mana() -> Dict[str, Any]:
    """Create a sacrifice creature for any mana ability (Phyrexian Altar)."""
    return activated_ability(
        cost=CostBuilder().sacrifice('creature', 1).build(),
        effect=EffectBuilder('altar_add_mana').build(),
        timing='instant'
    )


def tap_for_mana(color: str) -> Dict[str, Any]:
    """Create a tap for mana ability (basic land)."""
    return activated_ability(
        cost=CostBuilder().tap().build(),
        effect=EffectBuilder('add_mana').param('color', color).amount(1).build(),
        timing='instant'
    )


# Condition builders

def condition_controller_owns() -> Dict[str, Any]:
    """Condition: controller owns the permanent."""
    return {
        'type': 'controller_owns',
        'value': True
    }


def condition_spell_is_noncreature() -> Dict[str, Any]:
    """Condition: spell is noncreature."""
    return {
        'type': 'spell_is_noncreature',
        'caster': 'controller'
    }


def condition_has_card_type(card_type: str, zone: str = 'battlefield') -> Dict[str, Any]:
    """Condition: has specific card type in zone."""
    return {
        'type': 'has_card_type',
        'card_type': card_type,
        'zone': zone
    }


def condition_power_greater_than(value: int) -> Dict[str, Any]:
    """Condition: power greater than value."""
    return {
        'type': 'power_greater_than',
        'value': value
    }


# Complete card examples using builders

def build_soul_warden() -> Dict[str, Any]:
    """Build Soul Warden's abilities."""
    return {
        'keywords': [],
        'triggered': [
            etb_gain_life(1)
        ],
        'activated': [],
        'static': []
    }


def build_ajani_pridemate() -> Dict[str, Any]:
    """Build Ajani's Pridemate's abilities."""
    return {
        'keywords': [],
        'triggered': [
            life_gain_counter('+1/+1', 1)
        ],
        'activated': [],
        'static': []
    }


def build_monastery_swiftspear() -> Dict[str, Any]:
    """Build Monastery Swiftspear's abilities."""
    return {
        'keywords': ['haste'],
        'triggered': [
            prowess()
        ],
        'activated': [],
        'static': []
    }


def build_phyrexian_altar() -> Dict[str, Any]:
    """Build Phyrexian Altar's abilities."""
    return {
        'keywords': [],
        'triggered': [],
        'activated': [
            sacrifice_altar_mana()
        ],
        'static': []
    }
