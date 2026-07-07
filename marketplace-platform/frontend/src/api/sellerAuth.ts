// Seller auth — a separate realm from customer auth (PLATFORM_CONTRACT.md
// §4): POST /api/seller/auth/signup, /api/seller/auth/login,
// GET /api/seller/auth/me. A seller token must never be sent to the
// customer /api/auth/* or /api/jobs/* routes and vice versa — enforced by
// keeping these two API modules, and their auth contexts, entirely separate.

import { apiFetch } from './client';
import { Seller, SellerAuthResponse } from '../types';

export function signup(email: string, password: string, companyName: string): Promise<SellerAuthResponse> {
  return apiFetch<SellerAuthResponse>('/api/seller/auth/signup', {
    method: 'POST',
    json: { email, password, company_name: companyName },
  });
}

export function login(email: string, password: string): Promise<SellerAuthResponse> {
  return apiFetch<SellerAuthResponse>('/api/seller/auth/login', {
    method: 'POST',
    json: { email, password },
  });
}

export function me(token: string): Promise<Seller> {
  return apiFetch<Seller>('/api/seller/auth/me', { token });
}
