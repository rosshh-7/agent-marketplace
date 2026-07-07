// Customer (user) auth context. Deliberately separate from
// SellerAuthContext — the contract (§4) treats customer and seller JWTs as
// two distinct realms, and a customer token must never be attached to a
// seller-facing request. Keeping two contexts/token stores makes that
// impossible to mix up by construction (there is no single "current token"
// to accidentally reuse).

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/auth';
import { User } from '../types';

const TOKEN_KEY = 'agentmarket.customer.token';
const USER_KEY = 'agentmarket.customer.user';

interface CustomerAuthContextValue {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const CustomerAuthContext = createContext<CustomerAuthContextValue | undefined>(undefined);

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Re-validate the stored token against GET /api/auth/me on load so a
    // stale/expired token doesn't silently pretend to be a valid session.
    let cancelled = false;
    if (!token) {
      setIsLoading(false);
      return;
    }
    authApi
      .me(token)
      .then((freshUser) => {
        if (cancelled) return;
        setUser(freshUser);
        localStorage.setItem(USER_KEY, JSON.stringify(freshUser));
      })
      .catch(() => {
        if (cancelled) return;
        setToken(null);
        setUser(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySession = useCallback((newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login(email, password);
      applySession(res.token, res.user);
    },
    [applySession],
  );

  const signup = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.signup(email, password);
      applySession(res.token, res.user);
    },
    [applySession],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  const value = useMemo<CustomerAuthContextValue>(
    () => ({ token, user, isLoading, isAuthenticated: Boolean(token), login, signup, logout }),
    [token, user, isLoading, login, signup, logout],
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth(): CustomerAuthContextValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth must be used within a CustomerAuthProvider');
  return ctx;
}
