PUZZLE = {
    "title": "Sacrifice Combo",
    "description": "Use Cosmogrand Zenith to create tokens, Goblin Bombardment to sacrifice them, and Marionette Apprentice to drain the opponent!",
    "difficulty": "medium",
    "solution_text": "Cast Lightning Bolt targeting opponent (1st spell). Cast Shock targeting opponent (2nd spell - Cosmogrand Zenith triggers, creating a 1/1 token). Now use Goblin Bombardment to sacrifice the token (Marionette Apprentice triggers for 1 life loss). Sac the Elemental token with Bombardment for 1 more damage. Total: 3 + 2 + 1 (Marionette) + 1 (Bombardment) = 7 damage!",
    "is_published": True,
    "game_state": {
        "players": {
            "you": {
                "life": 5,
                "mana_pool": {"R": 3},
                "library_count": 20,
                "library": [],
                "hand": [
                    {"instance_id": "bolt-combo-1", "card_id": 1},
                    {"instance_id": "shock-combo-1", "card_id": 15}
                ],
                "battlefield": [
                    {
                        "instance_id": "cosmogrand-1",
                        "card_id": 44,
                        "summoning_sick": False,
                        "tapped": False,
                        "counters": {}
                    },
                    {
                        "instance_id": "marionette-1",
                        "card_id": 43,
                        "summoning_sick": False,
                        "tapped": False,
                        "counters": {}
                    },
                    {
                        "instance_id": "bombardment-1",
                        "card_id": 27,
                        "summoning_sick": False,
                        "tapped": False,
                        "counters": {}
                    }
                ],
                "graveyard": [],
                "exile": []
            },
            "opponent": {
                "life": 7,
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
