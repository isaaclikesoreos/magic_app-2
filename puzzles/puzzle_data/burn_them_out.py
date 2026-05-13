PUZZLE = {
    "title": "Burn Them Out",
    "description": "You have a grip full of burn spells. Your opponent is at 10 life with no blockers. Calculate the exact damage!",
    "difficulty": "hard",
    "solution_text": "Cast Rift Bolt (suspended, but we'll say it resolves) for 3 damage. Cast Lightning Bolt for 3 damage. Cast Lava Spike for 3 damage. Cast Shard Volley (sacrifice Mountain) for 3 damage. Total: 3 + 3 + 3 + 3 = 12 damage. That's lethal against 10 life!",
    "is_published": True,
    "game_state": {
        "players": {
            "you": {
                "life": 3,
                "mana_pool": {"R": 4},
                "library_count": 15,
                "hand": [
                    {"instance_id": "rift-1", "card_id": 16, "is_token": False},
                    {"instance_id": "bolt-3", "card_id": 1, "is_token": False},
                    {"instance_id": "spike-1", "card_id": 13, "is_token": False},
                    {"instance_id": "shard-1", "card_id": 20, "is_token": False}
                ],
                "battlefield": [
                    {"instance_id": "mountain-instance-2", "card_id": 3, "tapped": True, "counters": {}},
                    {"instance_id": "mountain-instance-3", "card_id": 3, "tapped": True, "counters": {}},
                    {"instance_id": "mountain-instance-4", "card_id": 3, "tapped": True, "counters": {}},
                    {"instance_id": "mountain-instance-5", "card_id": 3, "tapped": True, "counters": {}}
                ],
                "graveyard": [],
                "exile": []
            },
            "opponent": {
                "life": 10,
                "mana_pool": {},
                "library_count": 20,
                "hand_count": 5,
                "battlefield": [],
                "graveyard": [],
                "exile": []
            }
        },
        "turn_phase": "main1",
        "active_player": "you"
    }
}
