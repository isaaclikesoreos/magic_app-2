import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';

interface QueueItem {
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
}

const api: AxiosInstance = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Track if we're currently refreshing to prevent multiple refresh calls
let isRefreshing = false;
let failedQueue: QueueItem[] = [];

const processQueue = (error: any, token: string | null = null): void => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Add auth token to requests
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses with automatic token refresh
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // If error is 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't try to refresh for login/register/refresh endpoints
      if (originalRequest.url?.includes('/token/') || originalRequest.url?.includes('/users/')) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        }).catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh');

      if (!refreshToken) {
        // No refresh token, need to login
        isRefreshing = false;
        localStorage.removeItem('token');
        localStorage.removeItem('refresh');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        // Try to refresh the token
        const response = await axios.post('/api/token/refresh/', {
          refresh: refreshToken
        });

        const newAccessToken = response.data.access;
        const newRefreshToken = response.data.refresh || refreshToken;

        localStorage.setItem('token', newAccessToken);
        localStorage.setItem('refresh', newRefreshToken);

        // Update the authorization header
        api.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

        processQueue(null, newAccessToken);

        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, need to login again
        processQueue(refreshError, null);
        localStorage.removeItem('token');
        localStorage.removeItem('refresh');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// Auth
export const login = (email: string, password: string) =>
  api.post('/token/', { email, password });

export const refreshToken = (refresh: string) =>
  api.post('/token/refresh/', { refresh });

export const register = (email: string, password: string) =>
  api.post('/users/', { email, password });

export const getCurrentUser = () =>
  api.get('/current-user/');

// Cubes
export const getCubes = () =>
  api.get('/cubes-list/');

export const getPopularCubes = () =>
  api.get('/cubes-list/popular/');

export const getCube = (id: number | string) =>
  api.get(`/cubes-list/${id}/`);

export const uploadCube = (data: any) =>
  api.post('/cubes/upload/', data);

export const setCubeCoverImage = (cubeId: number | string, imageUrl: string) =>
  api.post(`/cubes-list/${cubeId}/set-cover-image/`, { image_url: imageUrl });

// Cards
export const getCards = () =>
  api.get('/cards-list/');

export const updateCardDatabase = () =>
  api.post('/cards/update/');

// Drafts
export const getDrafts = () =>
  api.get('/drafts/');

export const getActiveLobbies = () =>
  api.get('/drafts/active-lobbies/');

export const createLobby = (data: any) =>
  api.post('/drafts/create-lobby/', data);

export const getDraft = (id: number | string) =>
  api.get(`/drafts/${id}/`);

export const joinDraft = (id: number | string) =>
  api.post(`/drafts/${id}/join/`);

export const leaveDraft = (id: number | string) =>
  api.post(`/drafts/${id}/leave/`);

export const startDraft = (id: number | string) =>
  api.post(`/drafts/${id}/start/`);

export const getMyPack = (id: number | string) =>
  api.get(`/drafts/${id}/my-pack/`);

export const pickCard = (draftId: number | string, cardId: number | string) =>
  api.post(`/drafts/${draftId}/pick/`, { card_id: cardId });

export const getMyPicks = (id: number | string) =>
  api.get(`/drafts/${id}/my-picks/`);

// Deck Lists
export const getDeckList = (draftId: number | string) =>
  api.get(`/decklist/?draft=${draftId}`);

// Puzzles
export const getPuzzles = (difficulty: string | null = null) => {
  const params = difficulty ? `?difficulty=${difficulty}` : '';
  return api.get(`/puzzles/${params}`);
};

export const getPuzzle = (id: number | string) =>
  api.get(`/puzzles/${id}/`);

export const getPuzzleSolution = (id: number | string) =>
  api.get(`/puzzles/${id}/reveal_solution/`);

export default api;
