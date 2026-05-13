PUZZLE = {
    "title": "Storm Off",
    "description": "Use rituals to build up your storm count, then finish with a lethal Tendrils of Agony!",
    "difficulty": "hard",
    "solution_text": "Cast Dark Ritual 3 times (building storm count to 3), then cast Tendrils of Agony. The original Tendrils drains 2 life, plus 3 storm copies each drain 2 more. Total: 4 spells x 2 life drain = 8 life drained from opponent (and gained by you). Opponent goes from 8 to 0!",
    "is_published": True,
    "game_state": {
        "players": {
            "you": {
                "life": 5,
                "mana_pool": {"B": 3},
                "library_count": 20,
                "library": [],
                "hand": [
                    {"instance_id": "ritual-1", "card_id": 29, "is_token": False},
                    {"instance_id": "ritual-2", "card_id": 29, "is_token": False},
                    {"instance_id": "ritual-3", "card_id": 29, "is_token": False},
                    {"instance_id": "tendrils-1", "card_id": 40, "is_token": False}
                ],
                "battlefield": [],
                "graveyard": [],
                "exile": []
            },
            "opponent": {
                "life": 8,
                "mana_pool": {},
                "library_count": 20,
                "library": [],
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
