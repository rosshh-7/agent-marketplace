import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listSubmissions } from '../api/seller';
import { ApiError } from '../api/client';
import ErrorBanner from '../components/ErrorBanner';
import StatusChip from '../components/StatusChip';
import { useSellerAuth } from '../context/SellerAuthContext';
import { SellerSubmissionSummary } from '../types';

export default function SellerDashboardPage() {
  const { token } = useSellerAuth();
  const [submissions, setSubmissions] = useState<SellerSubmissionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    listSubmissions(token)
      .then(setSubmissions)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load submissions.'));
  }, [token]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>My submissions</h1>
        <Link to="/seller/agents/new" className="btn-primary">
          Upload a new agent
        </Link>
      </div>

      <ErrorBanner message={error} />

      {submissions === null && !error ? <div className="page-loading">Loading submissions…</div> : null}
      {submissions !== null && submissions.length === 0 ? (
        <p>You haven&apos;t submitted an agent yet.</p>
      ) : null}

      <div className="job-list">
        {submissions?.map((s) => (
          <Link key={s.id} to={`/seller/agents/${s.id}`} className="job-list-row">
            <div className="job-list-brief">
              <strong>{s.name}</strong>
              <span className="agent-card-category">{s.category}</span>
            </div>
            <div className="job-list-meta">
              <span>{new Date(s.created_at).toLocaleString()}</span>
              <StatusChip status={s.status} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
