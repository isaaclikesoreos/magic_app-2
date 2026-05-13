import { createContext, useContext, useState, useEffect, useCallback, ReactNode, FC } from 'react';
import { login as apiLogin, getCurrentUser, refreshToken as apiRefreshToken } from '../services/api';

interface User {
  id: number;
  email: string;
  display_name?: string;
}

interface AuthContextValue {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  loading: boolean;
  refreshAccessToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Helper to decode JWT and get expiration time
const getTokenExpiration = (token: string): number | null => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000; // Convert to milliseconds
  } catch {
    return null;
  }
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Refresh the access token
  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    const refresh = localStorage.getItem('refresh');
    if (!refresh) return false;

    try {
      const res = await apiRefreshToken(refresh);
      localStorage.setItem('token', res.data.access);
      if (res.data.refresh) {
        localStorage.setItem('refresh', res.data.refresh);
      }
      return true;
    } catch (err) {
      console.error('Token refresh failed:', err);
      return false;
    }
  }, []);

  // Check token and refresh if needed
  const checkAndRefreshToken = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const expiration = getTokenExpiration(token);
    if (!expiration) return;

    // Refresh if token expires in less than 5 minutes
    const fiveMinutes = 5 * 60 * 1000;
    if (expiration - Date.now() < fiveMinutes) {
      console.log('Token expiring soon, refreshing...');
      await refreshAccessToken();
    }
  }, [refreshAccessToken]);

  // Initial load
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        // Check if token needs refresh first
        await checkAndRefreshToken();

        try {
          const res = await getCurrentUser();
          setUser(res.data);
        } catch (err) {
          console.error('Failed to get current user:', err);
          // Try to refresh and retry
          const refreshed = await refreshAccessToken();
          if (refreshed) {
            try {
              const res = await getCurrentUser();
              setUser(res.data);
            } catch {
              localStorage.removeItem('token');
              localStorage.removeItem('refresh');
            }
          } else {
            localStorage.removeItem('token');
            localStorage.removeItem('refresh');
          }
        }
      }
      setLoading(false);
    };

    initAuth();
  }, [checkAndRefreshToken, refreshAccessToken]);

  // Periodically check and refresh token (every 5 minutes)
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      checkAndRefreshToken();
    }, 5 * 60 * 1000); // Check every 5 minutes

    return () => clearInterval(interval);
  }, [user, checkAndRefreshToken]);

  // Also refresh on window focus (user comes back to tab)
  useEffect(() => {
    const handleFocus = () => {
      if (user) {
        checkAndRefreshToken();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, checkAndRefreshToken]);

  const login = async (email: string, password: string): Promise<User> => {
    const res = await apiLogin(email, password);
    localStorage.setItem('token', res.data.access);
    localStorage.setItem('refresh', res.data.refresh);
    const userRes = await getCurrentUser();
    setUser(userRes.data);
    return userRes.data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, refreshAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
};
