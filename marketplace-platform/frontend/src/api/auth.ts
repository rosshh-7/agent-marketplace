// Customer auth — POST /api/auth/signup, /api/auth/login, GET /api/auth/me
// (PLATFORM_CONTRACT.md §4).

import { apiFetch } from './client';
import { AuthResponse, User } from '../types';

export function signup(email: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/api/auth/signup', {
    method: 'POST',
    json: { email, password },
  });
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    json: { email, password },
  });
}

export function me(token: string): Promise<User> {
  return apiFetch<User>('/api/auth/me', { token });
}
