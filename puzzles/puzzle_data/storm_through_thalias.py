PUZZLE = {
    "title": "Storm Through Thalias",
    "description": (
        "Opponent has 4 Thalia, Guardian of Thraben on the battlefield. "
        "Each Thalia taxes your noncreature spells by {1}, so every noncreature "
        "you cast costs {4} more generic. You start with 17 blue and 14 red mana "
        "and a stacked deck. Sequence rituals, Lotus Petals, and Lion's Eye Diamonds "
        "to fuel the chain — use End the Festivities to clear the Thalias when the "
        "tax becomes too steep — finish with a lethal Tendrils of Agony."
    ),
    "difficulty": "expert",
    "solution_text": (
        "Storm puzzle — the player must chain low-cost rituals, cracking LEDs in "
        "response to a cast to dump mana past the discard, then use End the Festivities "
        "(1 damage to each creature) to wipe the Thalia board. Once Thalias are gone, "
        "the rest of the chain has no tax — Faithless Looting + flashback, Chemister's "
        "Insight + jump-start, and Manamorphose for color fixing all add storm count "
        "cheaply. Manamorphose converts mana into black to pay Tendrils' {B}{B}. "
        "Finish: Tendrils of Agony with high storm = lethal drain."
    ),
    "is_published": True,
    "game_state": {
        "players": {
            "you": {
                "life": 20,
                # 17 U + 14 R already floating — storm puzzles start mid-turn with
                # a primed pool. Engine treats this as the active player's main phase.
                "mana_pool": {"W": 0, "U": 17, "B": 0, "R": 14, "G": 0, "C": 0},
                "library_count": 7,
                "library": [
                    # Top → bottom: cards are drawn from index 0.
                    {"instance_id": "led-lib-1",    "card_id": 93,  "is_token": False},
                    {"instance_id": "led-lib-2",    "card_id": 93,  "is_token": False},
                    {"instance_id": "led-lib-3",    "card_id": 93,  "is_token": False},
                    {"instance_id": "etf-lib",      "card_id": 180, "is_token": False},
                    {"instance_id": "tendrils-lib", "card_id": 40,  "is_token": False},
                    {"instance_id": "rof-lib-1",    "card_id": 181, "is_token": False},
                    {"instance_id": "rof-lib-2",    "card_id": 181, "is_token": False},
                ],
                "hand": [
                    {"instance_id": "petal-1",      "card_id": 92,  "is_token": False},
                    {"instance_id": "petal-2",      "card_id": 92,  "is_token": False},
                    {"instance_id": "petal-3",      "card_id": 92,  "is_token": False},
                    {"instance_id": "remand-1",     "card_id": 56,  "is_token": False},
                    {"instance_id": "insight-1",    "card_id": 223, "is_token": False},
                    {"instance_id": "remand-2",     "card_id": 56,  "is_token": False},
                    {"instance_id": "morph-1",      "card_id": 203, "is_token": False},
                    {"instance_id": "looting-1",    "card_id": 65,  "is_token": False},
                    {"instance_id": "slickshot-1",  "card_id": 207, "is_token": False},
                    {"instance_id": "rof-hand-1",   "card_id": 181, "is_token": False},
                    {"instance_id": "led-hand-1",   "card_id": 93,  "is_token": False},
                ],
                "battlefield": [],
                "graveyard": [],
                "exile": [],
            },
            "opponent": {
                "life": 20,
                "mana_pool": {},
                "library_count": 40,
                "library": [],
                "hand": [],
                "hand_count": 0,
                "battlefield": [
                    {"instance_id": "thalia-opp-1", "card_id": 224, "is_token": False, "tapped": False, "summoning_sick": False},
                    {"instance_id": "thalia-opp-2", "card_id": 224, "is_token": False, "tapped": False, "summoning_sick": False},
                    {"instance_id": "thalia-opp-3", "card_id": 224, "is_token": False, "tapped": False, "summoning_sick": False},
                    {"instance_id": "thalia-opp-4", "card_id": 224, "is_token": False, "tapped": False, "summoning_sick": False},
                ],
                "graveyard": [],
                "exile": [],
            },
        },
        "turn_phase": "main1",
        "active_player": "you",
    },
}
