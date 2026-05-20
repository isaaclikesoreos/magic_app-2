PUZZLE = {
    "title": "Aristocrats Karn Combo",
    "description": (
        "You control a sacrifice-engine board with Phyrexian Plaguelord, 2 Adanto "
        "Vanguards, 2 Soldier tokens, Goblin Boom Keg, and a Treasure token. Your "
        "hand has Karn the Great Creator, Plaguecrafter, Mayhem Devil, Goblin "
        "Bombardment, Carrion Feeder, and Raise the Alarm. Opponent has only "
        "Baneslayer Angel on the battlefield. Combine sacrifice triggers, "
        "Karn's +1 animation, and Boom Keg's death damage to defeat them."
    ),
    "difficulty": "expert",
    "solution_text": (
        "Aristocrats puzzle — chain sacrifices through Mayhem Devil (1 dmg per "
        "sac) + Goblin Bombardment (1 dmg per sac) + Goblin Boom Keg death "
        "trigger (3 dmg). Plaguecrafter forces opponent to sacrifice the angel. "
        "Karn's +1 animates Boom Keg into a 4/4 creature so it can be sac'd to "
        "Carrion Feeder / Goblin Bombardment, triggering its 3-damage death effect. "
        "Plaguelord's tap-sac-self ability puts -4/-4 on the angel (killing it "
        "outright since Baneslayer has 5 toughness). Raise the Alarm produces "
        "two more sac fodder tokens, each fueling more damage triggers."
    ),
    "is_published": True,
    "game_state": {
        "players": {
            "you": {
                "life": 20,
                # Empty pool to start — the Treasure token (sac for any color)
                # and Adanto Vanguard's pay-life are the main resource levers
                # at game start. Karn (4 CMC) costs more than starting mana
                # implies, so the puzzle has its own pre-requirements.
                "mana_pool": {"W": 0, "U": 0, "B": 0, "R": 0, "G": 0, "C": 0},
                "library_count": 30,
                "library": [],
                "hand": [
                    {"instance_id": "karn-hand",        "card_id": 220, "is_token": False},
                    {"instance_id": "plaguecrafter-h",  "card_id": 206, "is_token": False},
                    {"instance_id": "mayhem-devil-h",   "card_id": 185, "is_token": False},
                    {"instance_id": "goblin-bomb-h",    "card_id": 27,  "is_token": False},
                    {"instance_id": "carrion-feeder-h", "card_id": 188, "is_token": False},
                    {"instance_id": "raise-alarm-h",    "card_id": 204, "is_token": False},
                ],
                "battlefield": [
                    {"instance_id": "plaguelord-bf",     "card_id": 209, "is_token": False, "tapped": False, "summoning_sick": False},
                    {"instance_id": "vanguard-bf-1",     "card_id": 217, "is_token": False, "tapped": False, "summoning_sick": False},
                    {"instance_id": "vanguard-bf-2",     "card_id": 217, "is_token": False, "tapped": False, "summoning_sick": False},
                    # Two Human Soldier tokens (from prior Raise the Alarm).
                    {"instance_id": "soldier-token-1",   "card_id": 4,   "is_token": True,  "tapped": False, "summoning_sick": False},
                    {"instance_id": "soldier-token-2",   "card_id": 4,   "is_token": True,  "tapped": False, "summoning_sick": False},
                    {"instance_id": "boom-keg-bf",       "card_id": 219, "is_token": False, "tapped": False, "summoning_sick": False},
                    # One Treasure token: {T}, sac → add 1 mana of any color.
                    {"instance_id": "treasure-token-1",  "card_id": 6,   "is_token": True,  "tapped": False, "summoning_sick": False},
                ],
                "graveyard": [],
                "exile": [],
            },
            "opponent": {
                "life": 20,
                "mana_pool": {},
                "library_count": 30,
                "library": [],
                "hand": [],
                "hand_count": 0,
                "battlefield": [
                    {"instance_id": "baneslayer-opp",    "card_id": 216, "is_token": False, "tapped": False, "summoning_sick": False},
                ],
                "graveyard": [],
                "exile": [],
            },
        },
        "turn_phase": "main1",
        "active_player": "you",
    },
}
