import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listJobs } from '../api/jobs';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import { JobSummary } from '../types';

function initialsFromEmail(email: string): string {
  const name = email.split('@')[0] ?? '';
  const parts = name.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || '?';
}

export default function ProfilePage() {
  const { user, token, logout } = useCustomerAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);

  useEffect(() => {
    if (!token) return;
    // Job stats are a nice-to-have on this page; ignore failures.
    listJobs(token)
      .then(setJobs)
      .catch(() => setJobs(null));
  }, [token]);

  if (!user) return null;

  const memberSince = new Date(user.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const activeJobs = jobs?.filter(
    (j) => j.status === 'gathering' || j.status === 'queued' || j.status === 'running',
  );

  return (
    <div className="page page-narrow">
      <div className="profile-header">
        <span className="avatar avatar-lg">{initialsFromEmail(user.email)}</span>
        <div>
          <h1>{user.email.split('@')[0]}</h1>
          <p>Customer account</p>
        </div>
      </div>

      <div className="card">
        <h3>Account details</h3>
        <div className="profile-field">
          <span className="profile-field-label">Email</span>
          <span>{user.email}</span>
        </div>
        <div className="profile-field">
          <span className="profile-field-label">Member since</span>
          <span>{memberSince}</span>
        </div>
        <div className="profile-field">
          <span className="profile-field-label">Jobs hired</span>
          <span>{jobs === null ? '—' : jobs.length}</span>
        </div>
        <div className="profile-field">
          <span className="profile-field-label">Active jobs</span>
          <span>{activeJobs === undefined ? '—' : activeJobs.length}</span>
        </div>
      </div>

      <div className="profile-actions">
        <Link to="/dashboard" className="btn-secondary">
          View my jobs
        </Link>
        <Link to="/agents" className="btn-secondary">
          Browse agents
        </Link>
        <button
          type="button"
          className="btn-danger"
          onClick={() => {
            logout();
            navigate('/');
          }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
