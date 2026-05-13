PUZZLE = {
    "title": "Inferno Titan Rampage",
    "description": "Your opponent has blockers, but your Inferno Titan has a powerful trigger. Find the lethal line!",
    "difficulty": "medium",
    "solution_text": "Attack with Inferno Titan. When it attacks, its trigger deals 3 damage divided as you choose. Deal 2 damage to the Wall of Omens and 1 damage to your opponent. The Wall dies, Inferno Titan is unblocked, dealing 6 damage. Total: 1 + 6 = 7 damage, which is exactly lethal!",
    "is_published": True,
    "game_state": {
        "players": {
            "you": {
                "life": 12,
                "mana_pool": {},
                "library_count": 20,
                "hand": [],
                "battlefield": [
                    {
                        "instance_id": "titan-1",
                        "card_id": 17,
                        "tapped": False,
                        "summoning_sick": False,
                        "counters": {}
                    },
                    {
                        "instance_id": "mountain-instance-1",
                        "card_id": 3,
                        "tapped": True,
                        "counters": {}
                    }
                ],
                "graveyard": [],
                "exile": []
            },
            "opponent": {
                "life": 7,
                "mana_pool": {},
                "library_count": 18,
                "hand_count": 4,
                "battlefield": [
                    {
                        "instance_id": "wall-1",
                        "card_id": 10,
                        "tapped": False,
                        "summoning_sick": False,
                        "counters": {}
                    }
                ],
                "graveyard": [],
                "exile": []
            }
        },
        "turn_phase": "main1",
        "active_player": "you"
    }
}
