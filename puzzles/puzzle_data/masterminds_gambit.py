PUZZLE = {
    "title": "Mastermind's Gambit",
    "description": "Your Faerie Mastermind has an activated ability that makes both players draw a card. Use it to deck your opponent!",
    "difficulty": "easy",
    "solution_text": "Activate Faerie Mastermind's ability 3 times ({2}{U} each). Each activation makes both players draw a card. Your opponent has only 3 cards left in their library, so they will deck out!",
    "is_published": True,
    "game_state": {
        "players": {
            "you": {
                "life": 5,
                "mana_pool": {"U": 9},
                "library_count": 20,
                "library": [
                    {"instance_id": "island-lib-1", "card_id": 4},
                    {"instance_id": "island-lib-2", "card_id": 4},
                    {"instance_id": "island-lib-3", "card_id": 4},
                    {"instance_id": "island-lib-4", "card_id": 4},
                    {"instance_id": "island-lib-5", "card_id": 4},
                    {"instance_id": "island-lib-6", "card_id": 4},
                    {"instance_id": "island-lib-7", "card_id": 4},
                    {"instance_id": "island-lib-8", "card_id": 4},
                    {"instance_id": "island-lib-9", "card_id": 4},
                    {"instance_id": "island-lib-10", "card_id": 4}
                ],
                "hand": [],
                "battlefield": [
                    {
                        "instance_id": "mastermind-1",
                        "card_id": 34,
                        "summoning_sick": False,
                        "tapped": False,
                        "counters": {}
                    }
                ],
                "graveyard": [],
                "exile": []
            },
            "opponent": {
                "life": 20,
                "mana_pool": {},
                "library_count": 3,
                "library": [
                    {"instance_id": "opp-lib-1", "card_id": 5},
                    {"instance_id": "opp-lib-2", "card_id": 5},
                    {"instance_id": "opp-lib-3", "card_id": 5}
                ],
                "hand": [],
                "hand_count": 0,
                "battlefield": [],
                "graveyard": [],
                "exile": []
            }
        },
        "turn_phase": "main1",
        "active_player": "you"
    }
}
