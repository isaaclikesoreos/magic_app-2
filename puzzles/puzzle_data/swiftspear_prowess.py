PUZZLE = {
    "title": "Swiftspear Prowess",
    "description": "Your opponent is at 5 life. Can you push through with your Monastery Swiftspear and a burn spell?",
    "difficulty": "easy",
    "solution_text": "Cast Lightning Bolt targeting your opponent (3 damage, and Swiftspear becomes 2/3 with prowess). Then enter combat and attack with Swiftspear for 2 damage. Total: 3 + 2 = 5 damage, which is lethal!",
    "is_published": True,
    "game_state": {
        "players": {
            "you": {
                "life": 8,
                "mana_pool": {"R": 2},
                "library_count": 28,
                "hand": [
                    {"instance_id": "bolt-2", "card_id": 1, "is_token": False}
                ],
                "battlefield": [
                    {
                        "instance_id": "swift-1",
                        "card_id": 9,
                        "tapped": False,
                        "summoning_sick": False,
                        "counters": {}
                    }
                ],
                "graveyard": [],
                "exile": []
            },
            "opponent": {
                "life": 5,
                "mana_pool": {},
                "library_count": 22,
                "hand_count": 2,
                "battlefield": [],
                "graveyard": [],
                "exile": []
            }
        },
        "turn_phase": "main1",
        "active_player": "you"
    }
}
