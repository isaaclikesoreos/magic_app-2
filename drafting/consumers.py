from channels.generic.websocket import AsyncWebsocketConsumer
import json
import logging
import asyncio

logger = logging.getLogger(__name__)

# Global dictionary to track players in each lobby
lobby_players = {}

class LobbyConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.lobby_id = self.scope['url_route']['kwargs']['lobby_id']  # Retrieve lobby_id from the URL
        self.lobby_group_name = f"lobbies_{self.lobby_id}"
        self.user = self.scope["user"]  # Assuming user authentication is set up

        logger.info(f"WebSocket connection attempt for lobby {self.lobby_id}")

        # Initialize the lobby in the players dictionary if not already present
        if self.lobby_id not in lobby_players:
            lobby_players[self.lobby_id] = []

        # Check if the user is already in the room
        if any(player['id'] == self.user.id for player in lobby_players[self.lobby_id]):
            logger.warning(f"User {self.user.display_name} is already in lobby {self.lobby_id}.")
            await self.close()  # Close connection for duplicate
            return

        # Add the user to the lobby's player list
        lobby_players[self.lobby_id].append({
            "id": self.user.id,
            "display_name": self.user.display_name
        })

        # Join the lobby group
        await self.channel_layer.group_add(
            self.lobby_group_name,
            self.channel_name
        )

        await self.accept()
        logger.info(f"WebSocket connection established for lobby {self.lobby_id}")

        # Notify the group about the new participant
        await self.channel_layer.group_send(
            self.lobby_group_name,
            {
                "type": "lobby.update",
                "event": "join",
                "user": {
                    "id": self.user.id,
                    "display_name": self.user.display_name,
                },
                "players": lobby_players[self.lobby_id],
                "message": f"{self.user.display_name} has joined the lobby."
            }
        )

        self.ping_task = asyncio.create_task(self.ping_loop())

    async def disconnect(self, close_code):
        # Remove the user from the lobby's player list
        if self.lobby_id in lobby_players:
            lobby_players[self.lobby_id] = [
                player for player in lobby_players[self.lobby_id]
                if player['id'] != self.user.id
            ]

            # Clean up empty lobbies
            if not lobby_players[self.lobby_id]:
                del lobby_players[self.lobby_id]

        # Notify the group about the disconnection
        await self.channel_layer.group_send(
            self.lobby_group_name,
            {
                "type": "lobby.update",
                "event": "leave",
                "user": {
                    "id": self.user.id,
                    "display_name": self.user.display_name,
                },
                "players": lobby_players.get(self.lobby_id, []),
                "message": f"{self.user.display_name} has left the lobby."
            }
        )

        # Leave the lobby group
        await self.channel_layer.group_discard(
            self.lobby_group_name,
            self.channel_name
        )

        if hasattr(self, 'ping_task'):
            self.ping_task.cancel()

    # Ping loop for keeping the connection alive
    async def ping_loop(self):
        try:
            while True:
                await self.send(text_data=json.dumps({"type": "ping"}))
                await asyncio.sleep(30)  # Ping every 30 seconds
        except asyncio.CancelledError:
            pass  # Task was cancelled on disconnect

    # Broadcast lobby updates to the group
    async def lobby_update(self, event):
        await self.send(text_data=json.dumps(event))
