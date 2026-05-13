PUZZLE = {
    "title": "Bolt the Bird",
    "description": "Your opponent is at 3 life with no blockers. Find lethal!",
    "difficulty": "easy",
    "solution_text": "Cast Lightning Bolt targeting your opponent for 3 damage.",
    "is_published": True,
    "game_state": {
        "players": {
            "you": {
                "life": 5,
                "mana_pool": {"R": 1},
                "library_count": 30,
                "hand": [
                    {"instance_id": "bolt-1", "card_id": 1, "is_token": False}
                ],
                "battlefield": [],
                "graveyard": [],
                "exile": []
            },
            "opponent": {
                "life": 3,
                "mana_pool": {},
                "library_count": 25,
                "hand_count": 3,
                "battlefield": [],
                "graveyard": [],
                "exile": []
            }
        },
        "turn_phase": "main1",
        "active_player": "you"
    }
}
