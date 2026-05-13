PUZZLE = {
    "title": "Fury's Wrath",
    "description": "Use Fury's ETB ability to clear the opponent's board and attack for lethal! You can cast Fury normally or evoke it by exiling a red card.",
    "difficulty": "medium",
    "solution_text": "Right-click Fury to evoke it, then exile Lightning Bolt. Fury enters and triggers its ETB - deal 4 damage divided among the opponent's creatures (2 to each Grizzly Bears). Then Fury is sacrificed due to evoke. Cast the remaining Lightning Bolt at the opponent for 3 damage, winning the game!",
    "is_published": True,
    "game_state": {
        "players": {
            "you": {
                "life": 3,
                "mana_pool": {"R": 1},
                "library_count": 20,
                "library": [],
                "hand": [
                    {"instance_id": "fury-1", "card_id": 35},
                    {"instance_id": "bolt-fury-1", "card_id": 1},
                    {"instance_id": "bolt-fury-2", "card_id": 1}
                ],
                "battlefield": [],
                "graveyard": [],
                "exile": []
            },
            "opponent": {
                "life": 3,
                "mana_pool": {},
                "library_count": 20,
                "library": [],
                "hand": [],
                "hand_count": 2,
                "battlefield": [
                    {
                        "instance_id": "opp-bears-1",
                        "card_id": 7,
                        "summoning_sick": False,
                        "tapped": False,
                        "counters": {}
                    },
                    {
                        "instance_id": "opp-bears-2",
                        "card_id": 7,
                        "summoning_sick": False,
                        "tapped": False,
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
