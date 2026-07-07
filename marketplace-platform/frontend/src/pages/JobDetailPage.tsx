import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { acceptJob, downloadUrl, getJob, getJobMessages, hireJob, previewUrl, rejectJob, sendChatMessage } from '../api/jobs';
import ChatWindow, { ChatDisplayMessage } from '../components/ChatWindow';
import ErrorBanner from '../components/ErrorBanner';
import ProgressBar from '../components/ProgressBar';
import StatusChip from '../components/StatusChip';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import { usePoll } from '../hooks/usePoll';
import { JobDetail } from '../types';

const IN_PROGRESS_STATUSES = new Set(['queued', 'running']);

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { token } = useCustomerAuth();

  const [messages, setMessages] = useState<ChatDisplayMessage[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isHiring, setIsHiring] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  const fetcher = useCallback(
    (signal: AbortSignal) => {
      if (!token || !jobId) return Promise.reject(new Error('Not ready'));
      return getJob(token, jobId);
    },
    [token, jobId],
  );

  // Poll only while the job is actively being worked on (queued/running).
  // For "gathering" the chat is interactive (no polling needed) and for
  // terminal states there's nothing left to change — in both cases this
  // fetches once and stops, per PLATFORM_CONTRACT.md §9.
  const { data: job, error: jobError, refetch } = usePoll<JobDetail>({
    fetcher,
    isTerminal: (j) => !IN_PROGRESS_STATUSES.has(j.status),
    enabled: Boolean(token && jobId),
  });

  useEffect(() => {
    if (!token || !jobId || messagesLoaded) return;
    if (!job || job.status !== 'gathering') return;
    getJobMessages(token, jobId)
      .then((msgs) => {
        setMessages(msgs.map((m) => ({ id: m.id, role: m.role, content: m.content })));
        setMessagesLoaded(true);
      })
      .catch(() => {
        // Non-fatal — the chat still works even if the audit-trail fetch fails.
        setMessagesLoaded(true);
      });
  }, [token, jobId, job, messagesLoaded]);

  async function handleSendChat(text: string) {
    if (!token || !jobId) return;
    const userMsg: ChatDisplayMessage = { id: `local-${Date.now()}-u`, role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    try {
      const res = await sendChatMessage(token, jobId, text);
      const assistantMsg: ChatDisplayMessage = {
        id: `local-${Date.now()}-a`,
        role: 'assistant',
        content: res.message,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to send message.');
    }
  }

  async function handleHire() {
    if (!token || !jobId) return;
    setActionError(null);
    setIsHiring(true);
    try {
      await hireJob(token, jobId);
      refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to hire agent.');
    } finally {
      setIsHiring(false);
    }
  }

  async function handleAccept() {
    if (!token || !jobId) return;
    setActionError(null);
    setIsAccepting(true);
    try {
      await acceptJob(token, jobId);
      // Contract §2: accepting triggers an automatic download of the same
      // result .zip that the Download button serves.
      triggerDownload(jobId, token);
      refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to accept job.');
    } finally {
      setIsAccepting(false);
    }
  }

  async function handleReject() {
    if (!token || !jobId) return;
    setActionError(null);
    setIsRejecting(true);
    try {
      await rejectJob(token, jobId, rejectReason.trim() || undefined);
      setShowRejectForm(false);
      refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to reject job.');
    } finally {
      setIsRejecting(false);
    }
  }

  function triggerDownload(id: string, authToken: string) {
    const link = document.createElement('a');
    link.href = downloadUrl(id, authToken);
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (jobError && !job) {
    return (
      <div className="page">
        <ErrorBanner message={jobError instanceof ApiError ? jobError.message : 'Failed to load job.'} />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="page">
        <div className="page-loading">Loading job…</div>
      </div>
    );
  }

  const hasResult = job.status === 'ready_for_review' || job.status === 'accepted' || job.status === 'rejected';
  const hasAgentReply = messages.some((m) => m.role === 'assistant');

  return (
    <div className="page">
      <Link to="/dashboard" className="back-link">
        ← My jobs
      </Link>
      <div className="page-header">
        {/* Title with something a human recognizes — the raw UUID is metadata. */}
        <h1>{job.agent?.name ?? 'Job'}</h1>
        <StatusChip status={job.status} />
      </div>
      <p className="page-subtitle">{job.initial_brief}</p>
      <p className="hint-text" style={{ marginTop: '-1rem', marginBottom: '1.5rem' }}>
        Job #{job.id.slice(0, 8)} · started {new Date(job.created_at).toLocaleString()}
      </p>

      <ErrorBanner message={actionError} />

      {job.status === 'gathering' ? (
        <div className="card">
          <h2>Tell the agent what you need</h2>
          <ChatWindow messages={messages} onSend={handleSendChat} />
          <button
            type="button"
            className="btn-primary"
            onClick={handleHire}
            disabled={isHiring || !hasAgentReply}
          >
            {isHiring ? 'Starting job…' : "I'm done — hire the agent"}
          </button>
          {!hasAgentReply ? (
            <p className="hint-text">Chat with the agent first so it can scope your task.</p>
          ) : null}
        </div>
      ) : null}

      {IN_PROGRESS_STATUSES.has(job.status) ? (
        <div className="card">
          <h2>{job.status === 'queued' ? 'Queued' : 'Working on it'}</h2>
          <ProgressBar pct={Number(job.progress_pct) || 0} message={job.progress_msg} />
        </div>
      ) : null}

      {job.status === 'failed' ? (
        <div className="card">
          <h2>This job didn't complete</h2>
          <p className="agent-detail-description">
            {job.progress_msg || 'The agent hit an unrecoverable error while working.'}
          </p>
          <div className="job-actions">
            {job.agent_id ? (
              <Link to={`/agents/${job.agent_id}`} className="btn-secondary">
                Hire this agent again
              </Link>
            ) : null}
            <Link to="/agents" className="btn-secondary">
              Browse other agents
            </Link>
          </div>
        </div>
      ) : null}

      {hasResult ? (
        <div className="card">
          <h2>Result preview</h2>
          <div className="preview-frame-wrap">
            <iframe
              title="Result preview"
              src={previewUrl(job.id, token ?? '')}
              className="preview-frame"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
          <div className="job-actions">
            <a className="btn-secondary" href={downloadUrl(job.id, token ?? '')} download>
              Download .zip
            </a>
            {job.status === 'ready_for_review' ? (
              <>
                <button type="button" className="btn-primary" onClick={handleAccept} disabled={isAccepting}>
                  {isAccepting ? 'Accepting…' : 'Accept'}
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => setShowRejectForm((v) => !v)}
                  disabled={isRejecting}
                >
                  Reject
                </button>
              </>
            ) : null}
          </div>
          {showRejectForm ? (
            <div className="reject-form">
              <textarea
                rows={3}
                placeholder="Optional reason for rejecting…"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
              <button type="button" className="btn-danger" onClick={handleReject} disabled={isRejecting}>
                {isRejecting ? 'Submitting…' : 'Confirm reject'}
              </button>
            </div>
          ) : null}
          {job.status === 'accepted' ? <p className="hint-text">You accepted this result.</p> : null}
          {job.status === 'rejected' ? (
            <p className="hint-text">
              You rejected this result{job.rejection_reason ? `: ${job.rejection_reason}` : '.'}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
