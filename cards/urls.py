from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CardViewSet, TokenViewSet

router = DefaultRouter()
router.register(r'cards', CardViewSet)
router.register(r'tokens', TokenViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
