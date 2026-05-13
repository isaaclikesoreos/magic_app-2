PUZZLE = {
    "title": "Pyromancer Pings",
    "description": "Use your Prodigal Pyromancers' activated abilities to ping your opponent for lethal!",
    "difficulty": "easy",
    "solution_text": "Tap the first Prodigal Pyromancer targeting the opponent's Grizzly Bears (dealing 1 damage, killing it). Tap the second Prodigal Pyromancer targeting the opponent (dealing 1 damage). Then advance to combat and attack with both Pyromancers for 2 more damage. Total: 3 damage, exactly lethal!",
    "is_published": True,
    "game_state": {
        "players": {
            "you": {
                "life": 10,
                "mana_pool": {},
                "library_count": 20,
                "hand": [],
                "battlefield": [
                    {
                        "instance_id": "pyro-instance-1",
                        "card_id": 48,
                        "tapped": False,
                        "summoning_sick": False,
                        "counters": {}
                    },
                    {
                        "instance_id": "pyro-instance-2",
                        "card_id": 48,
                        "tapped": False,
                        "summoning_sick": False,
                        "counters": {}
                    },
                    {
                        "instance_id": "fireslinger-instance-1",
                        "card_id": 49,
                        "tapped": False,
                        "summoning_sick": False,
                        "counters": {}
                    },
                    {
                        "instance_id": "mother-instance-1",
                        "card_id": 50,
                        "tapped": False,
                        "summoning_sick": False,
                        "counters": {}
                    }
                ],
                "graveyard": [],
                "exile": []
            },
            "opponent": {
                "life": 3,
                "mana_pool": {},
                "library_count": 20,
                "hand_count": 2,
                "battlefield": [
                    {
                        "instance_id": "opp-bear-instance-1",
                        "card_id": 7,
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
