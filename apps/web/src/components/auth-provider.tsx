"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearTokens,
  getStoredToken,
  getStoredUser,
  storeUser,
  type StoredUser,
} from "@/lib/api";
import { identifyUser } from "@/lib/clarity-telemetry";

interface AuthContextValue {
  user: StoredUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setUser: (user: StoredUser | null) => void;
  refreshUser: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<StoredUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(() => {
    const token = getStoredToken();
    if (!token) {
      setUserState(null);
      return;
    }
    const current = getStoredUser();
    setUserState(current);
    if (current) {
      identifyUser(current);
    }
  }, []);

  useEffect(() => {
    refreshUser();
    setIsLoading(false);
  }, [refreshUser]);

  const setUser = useCallback((next: StoredUser | null) => {
    if (next) {
      storeUser(next);
      identifyUser(next);
    } else {
      clearTokens();
    }
    setUserState(next);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUserState(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user && getStoredToken()),
      setUser,
      refreshUser,
      logout,
    }),
    [user, isLoading, setUser, refreshUser, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext must be used within AuthProvider");
  }
  return ctx;
}
