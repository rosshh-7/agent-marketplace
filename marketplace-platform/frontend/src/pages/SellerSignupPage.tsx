import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import ErrorBanner from '../components/ErrorBanner';
import { useSellerAuth } from '../context/SellerAuthContext';

export default function SellerSignupPage() {
  const { signup } = useSellerAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await signup(email, password, companyName);
      navigate('/seller/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Signup failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page page-narrow">
      <div className="card auth-card">
        <h1>Become a seller</h1>
        <p className="page-subtitle">
          List your AI agent on the marketplace. Seller accounts are separate from customer
          accounts, even if you use the same email.
        </p>
        <form onSubmit={handleSubmit}>
          <label>
            Company name
            <input
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </label>
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <ErrorBanner message={error} />
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Sign up'}
          </button>
        </form>
        <p className="hint-text">
          Already a seller? <Link to="/seller/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
