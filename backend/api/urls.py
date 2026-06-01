from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

router = DefaultRouter()
router.register(r'tracks', views.TrackViewSet)
router.register(r'playlists', views.PlaylistViewSet)
router.register(r'shows', views.ShowViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('auth/login/', views.login_view, name='login'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/me/', views.me_view, name='me'),
    path('settings/', views.settings_view, name='settings'),
    path('analytics/', views.analytics_view, name='analytics'),
]
