import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AuthUser } from '../types';
import { api, saveAuthTokens, clearAuthTokens, isAuthenticated } from '../lib/api-client';

interface UserContextType {
  currentUser: AuthUser | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (personId: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

interface UserProviderProps {
  children: ReactNode;
}

const USER_STORAGE_KEY = 'capacinator_current_user';

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUserState] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Clear user state and tokens
  const clearUserState = useCallback(() => {
    setCurrentUserState(null);
    localStorage.removeItem(USER_STORAGE_KEY);
    clearAuthTokens();
  }, []);

  // Load user from localStorage and validate token on mount
  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoading(true);

      // Check if we have an auth token
      if (!isAuthenticated()) {
        // No token, try loading from legacy storage
        const storedUser = localStorage.getItem(USER_STORAGE_KEY);
        if (storedUser) {
          try {
            const user = JSON.parse(storedUser);
            // Try to login with the stored user to get tokens
            await login(user.id);
          } catch {
            // Login failed, clear storage
            localStorage.removeItem(USER_STORAGE_KEY);
          }
        }
        setIsLoading(false);
        return;
      }

      // We have a token, try to get current user
      try {
        const response = await api.auth.me();
        const user = response.data.user;
        setCurrentUserState(user);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      } catch {
        // Token invalid or expired, clear everything
        clearUserState();
      }

      setIsLoading(false);
    };

    initializeAuth();
  // Run only on mount - login and clearUserState are stable callbacks
  }, []);

  // Listen for auth:logout events (triggered by 401 responses)
  useEffect(() => {
    const handleLogout = () => {
      clearUserState();
    };

    window.addEventListener('auth:logout', handleLogout);
    return () => {
      window.removeEventListener('auth:logout', handleLogout);
    };
  }, [clearUserState]);

  // Login function - calls the auth API and stores tokens
  const login = async (personId: string): Promise<void> => {
    setIsLoading(true);
    try {
      const response = await api.auth.login(personId);
      const { user, accessToken, refreshToken } = response.data;

      // Save tokens
      saveAuthTokens(accessToken, refreshToken);

      // Save user
      setCurrentUserState(user);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } finally {
      setIsLoading(false);
    }
  };

  // Logout function - calls the auth API and clears tokens
  const logout = async (): Promise<void> => {
    try {
      await api.auth.logout();
    } catch {
      // Ignore logout errors
    } finally {
      clearUserState();
    }
  };

  // Refresh user data from the server
  const refreshUser = async (): Promise<void> => {
    if (!isAuthenticated()) {
      return;
    }

    try {
      const response = await api.auth.me();
      const user = response.data.user;
      setCurrentUserState(user);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } catch {
      // Token invalid, clear state
      clearUserState();
    }
  };

  const isLoggedIn = currentUser !== null;

  return (
    <UserContext.Provider
      value={{
        currentUser,
        isLoggedIn,
        isLoading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
