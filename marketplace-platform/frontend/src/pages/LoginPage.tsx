import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import ErrorBanner from '../components/ErrorBanner';
import { useCustomerAuth } from '../context/CustomerAuthContext';

interface LocationState {
  from?: { pathname: string };
}

export default function LoginPage() {
  const { login } = useCustomerAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      const state = location.state as LocationState | null;
      navigate(state?.from?.pathname ?? '/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page page-narrow">
      <div className="card auth-card">
        <h1>Log in</h1>
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <ErrorBanner message={error} />
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>
        <p className="hint-text">
          No account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
