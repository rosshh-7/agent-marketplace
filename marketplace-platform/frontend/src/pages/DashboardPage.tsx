import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listJobs } from '../api/jobs';
import { ApiError } from '../api/client';
import ErrorBanner from '../components/ErrorBanner';
import StatusChip from '../components/StatusChip';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import { JobSummary } from '../types';

export default function DashboardPage() {
  const { token } = useCustomerAuth();
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    listJobs(token)
      .then(setJobs)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load jobs.'));
  }, [token]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>My jobs</h1>
        <Link to="/agents" className="btn-secondary">
          Hire another agent
        </Link>
      </div>

      <ErrorBanner message={error} />

      {jobs === null && !error ? (
        <div className="job-list" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton-row" />
          ))}
        </div>
      ) : null}
      {jobs !== null && jobs.length === 0 ? (
        <div className="empty-state">
          <p>You haven&apos;t hired an agent yet.</p>
          <Link to="/agents" className="btn-secondary">
            Browse agents
          </Link>
        </div>
      ) : null}

      <div className="job-list">
        {jobs?.map((job) => (
          <Link key={job.id} to={`/dashboard/jobs/${job.id}`} className="job-list-row">
            <div className="job-list-brief">{job.initial_brief}</div>
            <div className="job-list-meta">
              <span>{new Date(job.created_at).toLocaleString()}</span>
              <StatusChip status={job.status} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
