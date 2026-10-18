import axios from 'axios';

// En producción: https://api.xhcdmx.org/api  (Cloudflare tunnel)
// En desarrollo: http://localhost:8001/api
const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8001/api';

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: false,   // JWT via header, no cookies
});

// Adjunta el token JWT en cada petición
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Refresca el token automáticamente si expira
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      const refresh = localStorage.getItem('refresh_token');
      if (refresh) {
        try {
          const res = await axios.post(`${BASE_URL}/auth/refresh/`, { refresh });
          localStorage.setItem('access_token', res.data.access);
          error.config.headers.Authorization = `Bearer ${res.data.access}`;
          return api(error.config);
        } catch {
          localStorage.clear();
          window.location.href = '/login';
        }
      } else {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// ─── Auth ────────────────────────────────────────────────────────────────────
export const login = (username, password) =>
  api.post('/auth/login/', { username, password });
export const getMe = () => api.get('/auth/me/');

// ─── Tracks ──────────────────────────────────────────────────────────────────
export const getTracks = (params) => api.get('/tracks/', { params });
export const uploadTrack = (formData) =>
  api.post('/tracks/', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteTrack = (id) => api.delete(`/tracks/${id}/`);
export const moveTrack = (id, folder_id) =>
  api.patch(`/tracks/${id}/move/`, { folder_id });

// Batch upload: sube múltiples archivos en una sola petición
export const batchUploadTracks = (formData) =>
  api.post('/tracks/batch_upload/', formData);

// ─── Track Folders ───────────────────────────────────────────────────────────
export const getFolders = () => api.get('/track-folders/');
export const createFolder = (name) => api.post('/track-folders/', { name });
export const deleteFolder = (id) => api.delete(`/track-folders/${id}/`);
export const renameFolder = (id, name) => api.patch(`/track-folders/${id}/`, { name });

// ─── Playlists ───────────────────────────────────────────────────────────────
export const getPlaylists = () => api.get('/playlists/');
export const createPlaylist = (data) => api.post('/playlists/', data);
export const updatePlaylist = (id, data) => api.patch(`/playlists/${id}/`, data);
export const deletePlaylist = (id) => api.delete(`/playlists/${id}/`);
export const addTrackToPlaylist = (id, track_id) =>
  api.post(`/playlists/${id}/add_track/`, { track_id });
export const removeTrackFromPlaylist = (id, item_id) =>
  api.post(`/playlists/${id}/remove_track/`, { item_id });

// ─── Shows ───────────────────────────────────────────────────────────────────
export const getShows = (params) => api.get('/shows/', { params });
export const createShow = (data) => api.post('/shows/', data);
export const updateShow = (id, data) => api.patch(`/shows/${id}/`, data);
export const deleteShow = (id, scope = 'one') => api.delete(`/shows/${id}/`, { params: { scope } });
export const addItemToShow = (id, data) => api.post(`/shows/${id}/add_item/`, data);
export const removeItemFromShow = (id, item_id) =>
  api.post(`/shows/${id}/remove_item/`, { item_id });
export const goLive = (id) => api.post(`/shows/${id}/go_live/`);
export const getCurrentLive = () => api.get('/shows/current_live/');

// ─── Settings ────────────────────────────────────────────────────────────────
export const getSettings = () => api.get('/settings/');
export const saveSettings = (data) => api.post('/settings/', data);

// ─── Analytics ───────────────────────────────────────────────────────────────
export const getAnalytics = () => api.get('/analytics/');

// ─── Radio Status ────────────────────────────────────────────────
export const getRadioStatus = () => api.get('/radio/status/');

// ─── Broadcast (transmisión en vivo desde el estudio) ─────────────
export const getBroadcastToken = () => api.get('/radio/broadcast-token/');
