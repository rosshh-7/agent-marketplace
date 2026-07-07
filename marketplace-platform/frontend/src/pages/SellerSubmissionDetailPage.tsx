import React, { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getSubmission } from '../api/seller';
import { ApiError } from '../api/client';
import ErrorBanner from '../components/ErrorBanner';
import StatusChip from '../components/StatusChip';
import { useSellerAuth } from '../context/SellerAuthContext';
import { usePoll } from '../hooks/usePoll';
import { SellerSubmissionDetail } from '../types';

export default function SellerSubmissionDetailPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const { token } = useSellerAuth();

  const fetcher = useCallback(
    (signal: AbortSignal) => {
      if (!token || !submissionId) return Promise.reject(new Error('Not ready'));
      return getSubmission(token, submissionId);
    },
    [token, submissionId],
  );

  const { data: submission, error } = usePoll<SellerSubmissionDetail>({
    fetcher,
    isTerminal: (s) => s.status !== 'pending',
    enabled: Boolean(token && submissionId),
  });

  if (error && !submission) {
    return (
      <div className="page">
        <ErrorBanner message={error instanceof ApiError ? error.message : 'Failed to load submission.'} />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="page">
        <div className="page-loading">Loading submission…</div>
      </div>
    );
  }

  const review = submission.review_result;

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <h1>{submission.name}</h1>
        <StatusChip status={submission.status} />
      </div>
      <p className="agent-detail-description">{submission.description}</p>
      <div className="agent-detail-meta">
        <span>{submission.category}</span>
        <span>${Number(submission.hourly_rate).toFixed(2)}/hr</span>
        <span>~{Number(submission.avg_hours)}h avg</span>
      </div>

      {submission.status === 'pending' ? (
        <div className="card">
          <p>
            Your submission is being reviewed (static analysis, sandboxed test runs, and an LLM
            judge). This page updates automatically — no need to refresh.
          </p>
        </div>
      ) : null}

      {review ? (
        <div className="card">
          <h2>Review findings</h2>
          <p>
            <strong>Verdict:</strong> {review.verdict}
          </p>
          {typeof review.quality_avg === 'number' ? (
            <p>
              <strong>Quality score:</strong> {review.quality_avg.toFixed(2)}
            </p>
          ) : null}
          {review.reasoning?.length ? (
            <>
              <h3>Reasoning</h3>
              <ul>
                {review.reasoning.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </>
          ) : null}
          {review.findings?.length ? (
            <>
              <h3>Findings</h3>
              <pre className="code-block">{JSON.stringify(review.findings, null, 2)}</pre>
            </>
          ) : null}
          {review.test_results?.length ? (
            <>
              <h3>Test results</h3>
              <pre className="code-block">{JSON.stringify(review.test_results, null, 2)}</pre>
            </>
          ) : null}
          {review.card_copy ? (
            <>
              <h3>Listing copy (on approval)</h3>
              <p>{review.card_copy}</p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
