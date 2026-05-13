PUZZLE = {
    "title": "Alpha Strike",
    "description": "You have two creatures and your opponent has no blockers. Attack for lethal!",
    "difficulty": "easy",
    "solution_text": "Enter combat, declare both Grizzly Bears (2/2) and Runeclaw Bear (2/2) as attackers. They deal 4 total damage, which is exactly lethal!",
    "is_published": True,
    "game_state": {
        "players": {
            "you": {
                "life": 10,
                "mana_pool": {},
                "library_count": 25,
                "hand": [],
                "battlefield": [
                    {
                        "instance_id": "bears-1",
                        "card_id": 7,
                        "tapped": False,
                        "summoning_sick": False,
                        "counters": {}
                    },
                    {
                        "instance_id": "bears-2",
                        "card_id": 8,
                        "tapped": False,
                        "summoning_sick": False,
                        "counters": {}
                    }
                ],
                "graveyard": [],
                "exile": []
            },
            "opponent": {
                "life": 4,
                "mana_pool": {},
                "library_count": 22,
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
