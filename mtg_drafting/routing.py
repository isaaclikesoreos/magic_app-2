from django.urls import re_path
from drafting.consumers import LobbyConsumer

websocket_urlpatterns = [
    re_path(r'ws/lobbies/(?P<lobby_id>\d+)/$', LobbyConsumer.as_asgi()),
]
