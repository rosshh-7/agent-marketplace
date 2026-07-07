// Seller auth context — mirror of CustomerAuthContext but for the seller
// realm (§4). Kept as an entirely separate module/store (own localStorage
// keys, own React context) so seller and customer sessions can coexist in
// the same browser (e.g. someone testing both journeys) without either
// token leaking into the other's requests.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as sellerAuthApi from '../api/sellerAuth';
import { Seller } from '../types';

const TOKEN_KEY = 'agentmarket.seller.token';
const SELLER_KEY = 'agentmarket.seller.seller';

interface SellerAuthContextValue {
  token: string | null;
  seller: Seller | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, companyName: string) => Promise<void>;
  logout: () => void;
}

const SellerAuthContext = createContext<SellerAuthContextValue | undefined>(undefined);

export function SellerAuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [seller, setSeller] = useState<Seller | null>(() => {
    const raw = localStorage.getItem(SELLER_KEY);
    return raw ? (JSON.parse(raw) as Seller) : null;
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setIsLoading(false);
      return;
    }
    sellerAuthApi
      .me(token)
      .then((freshSeller) => {
        if (cancelled) return;
        setSeller(freshSeller);
        localStorage.setItem(SELLER_KEY, JSON.stringify(freshSeller));
      })
      .catch(() => {
        if (cancelled) return;
        setToken(null);
        setSeller(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(SELLER_KEY);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySession = useCallback((newToken: string, newSeller: Seller) => {
    setToken(newToken);
    setSeller(newSeller);
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(SELLER_KEY, JSON.stringify(newSeller));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await sellerAuthApi.login(email, password);
      applySession(res.token, res.seller);
    },
    [applySession],
  );

  const signup = useCallback(
    async (email: string, password: string, companyName: string) => {
      const res = await sellerAuthApi.signup(email, password, companyName);
      applySession(res.token, res.seller);
    },
    [applySession],
  );

  const logout = useCallback(() => {
    setToken(null);
    setSeller(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SELLER_KEY);
  }, []);

  const value = useMemo<SellerAuthContextValue>(
    () => ({ token, seller, isLoading, isAuthenticated: Boolean(token), login, signup, logout }),
    [token, seller, isLoading, login, signup, logout],
  );

  return <SellerAuthContext.Provider value={value}>{children}</SellerAuthContext.Provider>;
}

export function useSellerAuth(): SellerAuthContextValue {
  const ctx = useContext(SellerAuthContext);
  if (!ctx) throw new Error('useSellerAuth must be used within a SellerAuthProvider');
  return ctx;
}
