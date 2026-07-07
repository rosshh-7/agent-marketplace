import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import ErrorBanner from '../components/ErrorBanner';
import { useCustomerAuth } from '../context/CustomerAuthContext';

export default function SignupPage() {
  const { signup } = useCustomerAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await signup(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Signup failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page page-narrow">
      <div className="card auth-card">
        <h1>Create your account</h1>
        <p className="page-subtitle">Hire your first AI agent in minutes — it's free to join.</p>
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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="hint-text">At least 8 characters.</span>
          </label>
          <ErrorBanner message={error} />
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Sign up'}
          </button>
        </form>
        <p className="hint-text">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
