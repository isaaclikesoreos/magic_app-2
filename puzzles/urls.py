from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PuzzleViewSet

router = DefaultRouter()
router.register(r'puzzles', PuzzleViewSet, basename='puzzle')

urlpatterns = [
    path('', include(router.urls)),
]
