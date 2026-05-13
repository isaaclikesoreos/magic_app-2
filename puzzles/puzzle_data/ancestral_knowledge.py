PUZZLE = {
    "title": "Ancestral Knowledge",
    "description": "Your opponent's library is almost empty. Use the power of Ancestral Recall to deck them out!",
    "difficulty": "medium",
    "solution_text": "Cast Ancestral Recall targeting yourself to draw 3 cards (including 2 more Recalls). Then cast both Recalls targeting your opponent. They will try to draw 6 cards but only have 5 in library - deck out!",
    "is_published": True,
    "game_state": {
        "players": {
            "you": {
                "life": 20,
                "mana_pool": {"U": 3},
                "library_count": 10,
                "library": [
                    {"instance_id": "recall-2", "card_id": 30, "is_token": False},
                    {"instance_id": "recall-3", "card_id": 30, "is_token": False},
                    {"instance_id": "island-1", "card_id": 4, "is_token": False},
                    {"instance_id": "island-2", "card_id": 4, "is_token": False},
                    {"instance_id": "island-3", "card_id": 4, "is_token": False},
                    {"instance_id": "island-4", "card_id": 4, "is_token": False},
                    {"instance_id": "island-5", "card_id": 4, "is_token": False},
                    {"instance_id": "island-6", "card_id": 4, "is_token": False},
                    {"instance_id": "island-7", "card_id": 4, "is_token": False},
                    {"instance_id": "island-8", "card_id": 4, "is_token": False}
                ],
                "hand": [
                    {"instance_id": "recall-1", "card_id": 30, "is_token": False}
                ],
                "battlefield": [],
                "graveyard": [],
                "exile": []
            },
            "opponent": {
                "life": 20,
                "mana_pool": {},
                "library_count": 5,
                "library": [
                    {"instance_id": "opp-card-1", "card_id": 5, "is_token": False},
                    {"instance_id": "opp-card-2", "card_id": 5, "is_token": False},
                    {"instance_id": "opp-card-3", "card_id": 5, "is_token": False},
                    {"instance_id": "opp-card-4", "card_id": 5, "is_token": False},
                    {"instance_id": "opp-card-5", "card_id": 5, "is_token": False}
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
