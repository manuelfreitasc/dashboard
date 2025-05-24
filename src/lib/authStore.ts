import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User } from '@/types'; // Assuming User type is defined in src/types

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: { username?: string; email?: string; password?: string }) => Promise<boolean>;
  signup: (credentials: { username?: string; email?: string; password?: string }) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
  // Method to rehydrate token for socket connection or other services
  getAuthToken: () => string | null; 
}

const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:3001/auth';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      clearError: () => set({ error: null }),
      getAuthToken: () => get().token,

      login: async (credentials) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${AUTH_API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Login failed');
          }

          set({
            user: { id: data.userId, username: data.username }, // Adjust based on actual response
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          console.log("Login successful:", data);
          return true;
        } catch (error: any) {
          const errorMessage = error.message || 'An unexpected error occurred during login.';
          set({ isLoading: false, error: errorMessage, isAuthenticated: false, user: null, token: null });
          console.error("Login error:", errorMessage);
          return false;
        }
      },

      signup: async (credentials) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${AUTH_API_URL}/register`, { // Corrected to /register
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Signup failed');
          }
          
          // Backend's /register endpoint logs in the user and returns token + user info
          set({
            user: { id: data.userId, username: data.username }, // Adjust based on actual response
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          console.log("Signup successful:", data);
          return true;
        } catch (error: any) {
          const errorMessage = error.message || 'An unexpected error occurred during signup.';
          set({ isLoading: false, error: errorMessage, isAuthenticated: false, user: null, token: null });
          console.error("Signup error:", errorMessage);
          return false;
        }
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false, isLoading: false, error: null });
        // Optionally, call a backend logout endpoint if it exists
        console.log("User logged out");
      },
    }),
    {
      name: 'auth-storage', // Name for localStorage key
      storage: createJSONStorage(() => localStorage), // Use localStorage
      // Only persist token and user. Other state like isLoading, error should be transient.
      partialize: (state) => ({ token: state.token, user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);

// Helper to use outside of React components if needed, e.g., for socket connection
export const getStoredAuthToken = (): string | null => {
  return useAuthStore.getState().token;
};
