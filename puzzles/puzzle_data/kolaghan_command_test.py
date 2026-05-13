PUZZLE = {
    "title": "Kolaghan's Command Test",
    "description": "Test all modes of Kolaghan's Command. Opponent is at 2 life with an artifact on the battlefield. You have a creature in your graveyard.",
    "difficulty": "easy",
    "solution_text": "Cast Kolaghan's Command choosing 'Deal 2 damage to any target' and any other mode.",
    "is_published": True,
    "game_state": {
        "players": {
            "you": {
                "life": 20,
                "mana_pool": {"B": 2, "R": 2, "generic": 2},
                "library_count": 30,
                "hand": [
                    {"instance_id": "kcmd-1", "card_id": 108, "is_token": False}
                ],
                "battlefield": [
                    {"instance_id": "swamp-1", "card_id": 6, "is_token": False, "tapped": False},
                    {"instance_id": "mountain-1", "card_id": 3, "is_token": False, "tapped": False},
                    {"instance_id": "fireslinger-1", "card_id": 49, "is_token": False, "tapped": False, "summoning_sick": False}
                ],
                "graveyard": [
                    {"instance_id": "pridemate-gy", "card_id": 12, "is_token": False},
                    {"instance_id": "essence-gy", "card_id": 2, "is_token": False}
                ],
                "exile": []
            },
            "opponent": {
                "life": 2,
                "mana_pool": {},
                "library_count": 25,
                "hand_count": 3,
                "hand": [
                    {"instance_id": "opp-hand-1", "card_id": 1, "is_token": False},
                    {"instance_id": "opp-hand-2", "card_id": 34, "is_token": False},
                    {"instance_id": "opp-hand-3", "card_id": 31, "is_token": False}
                ],
                "battlefield": [
                    {"instance_id": "opp-signet-1", "card_id": 81, "is_token": False, "tapped": False}
                ],
                "graveyard": [],
                "exile": []
            }
        },
        "turn_phase": "main1",
        "active_player": "you"
    }
}
