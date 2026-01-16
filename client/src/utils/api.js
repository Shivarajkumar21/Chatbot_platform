import axios from 'axios';
import { getAuthToken, removeAuthToken } from './auth';

const api = axios.create({
  // Default to the known Vercel backend if Env Var is missing
  baseURL: import.meta.env.VITE_API_URL || 'https://chatbot-server-coral.vercel.app/api',
});

// Add token to all requests
api.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle 401/403 errors - redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      // Token is invalid or expired
      removeAuthToken();
      // Redirect to login page
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

