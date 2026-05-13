PUZZLE = {
    "title": "Wasteland Combo",
    "description": "A complex puzzle involving land destruction, triggered abilities, and precise damage calculation. Can you find the path to exactly 40 damage?",
    "difficulty": "hard",
    "solution_text": "1. Tap 2 Badlands for RR, then activate both Wastelands targeting those Badlands. Super Shredder gets 4 +1/+1 counters from permanents leaving. Take 8 from Dingus Egg (4 lands to graveyard). 2. Cast Price of Progress - Eidolons deal 8 to you, Price deals 14 to you and 12 to opponent. 3. Cast Wildfire - both players sacrifice 4 lands (triggering Dingus Egg for 8 each, Super Shredder gets more counters). Eidolons die to 4 damage (more counters). Kitsa survives with prowess. 4. Attack with massive Super Shredder and Kitsa for lethal!",
    "is_published": True,
    "game_state": {
        "players": {
            "you": {
                "life": 40,
                "mana_pool": {},
                "library_count": 20,
                "library": [],
                "hand": [
                    {"instance_id": "pop-1", "card_id": 39},
                    {"instance_id": "pop-2", "card_id": 39},
                    {"instance_id": "wildfire-1", "card_id": 28},
                    {"instance_id": "rage-1", "card_id": 21},
                    {"instance_id": "rage-2", "card_id": 21},
                    {"instance_id": "rage-3", "card_id": 21},
                    {"instance_id": "strike-1", "card_id": 14},
                    {"instance_id": "strike-2", "card_id": 14},
                    {"instance_id": "strike-3", "card_id": 14}
                ],
                "battlefield": [
                    {"instance_id": "shredder-1", "card_id": 45, "summoning_sick": False, "tapped": False, "counters": {}},
                    {"instance_id": "kitsa-1", "card_id": 42, "summoning_sick": False, "tapped": False, "counters": {}},
                    {"instance_id": "badlands-instance-1", "card_id": 23, "tapped": False},
                    {"instance_id": "badlands-instance-2", "card_id": 23, "tapped": False},
                    {"instance_id": "badlands-instance-3", "card_id": 23, "tapped": False},
                    {"instance_id": "badlands-instance-4", "card_id": 23, "tapped": False},
                    {"instance_id": "badlands-instance-5", "card_id": 23, "tapped": False},
                    {"instance_id": "badlands-instance-6", "card_id": 23, "tapped": False},
                    {"instance_id": "badlands-instance-7", "card_id": 23, "tapped": False},
                    {"instance_id": "badlands-instance-8", "card_id": 23, "tapped": False},
                    {"instance_id": "badlands-instance-9", "card_id": 23, "tapped": False},
                    {"instance_id": "wasteland-instance-1", "card_id": 22, "tapped": False},
                    {"instance_id": "wasteland-instance-2", "card_id": 22, "tapped": False}
                ],
                "graveyard": [],
                "exile": []
            },
            "opponent": {
                "life": 40,
                "mana_pool": {},
                "library_count": 20,
                "hand_count": 0,
                "battlefield": [
                    {"instance_id": "dingus-1", "card_id": 38, "tapped": False},
                    {"instance_id": "eidolon-1", "card_id": 31, "summoning_sick": False, "tapped": False, "counters": {}},
                    {"instance_id": "eidolon-2", "card_id": 31, "summoning_sick": False, "tapped": False, "counters": {}},
                    {"instance_id": "eidolon-3", "card_id": 31, "summoning_sick": False, "tapped": False, "counters": {}},
                    {"instance_id": "eidolon-4", "card_id": 31, "summoning_sick": False, "tapped": False, "counters": {}},
                    {"instance_id": "tropical-instance-1", "card_id": 24, "tapped": False},
                    {"instance_id": "tropical-instance-2", "card_id": 24, "tapped": False},
                    {"instance_id": "tropical-instance-3", "card_id": 24, "tapped": False},
                    {"instance_id": "tropical-instance-4", "card_id": 24, "tapped": False},
                    {"instance_id": "tropical-instance-5", "card_id": 24, "tapped": False},
                    {"instance_id": "tropical-instance-6", "card_id": 24, "tapped": False}
                ],
                "graveyard": [],
                "exile": []
            }
        },
        "turn_phase": "main1",
        "active_player": "you"
    }
}
