import { create } from 'zustand';
import { login as apiLogin } from '../api/client';

const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('access_token'),

  login: async (username, password) => {
    const res = await apiLogin(username, password);
    localStorage.setItem('access_token', res.data.access);
    localStorage.setItem('refresh_token', res.data.refresh);
    set({ user: res.data.user, isAuthenticated: true });
    return res.data;
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    set({ user: null, isAuthenticated: false });
  },

  setUser: (user) => set({ user }),
}));

export default useAuthStore;
