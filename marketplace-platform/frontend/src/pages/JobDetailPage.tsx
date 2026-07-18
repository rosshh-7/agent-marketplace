import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  acceptJob,
  downloadRequirements,
  downloadUrl,
  finalizeJob,
  getJob,
  getJobMessages,
  hireJob,
  previewUrl,
  rejectJob,
  sendChatMessage,
} from '../api/jobs';
import ChatWindow, { ChatDisplayMessage } from '../components/ChatWindow';
import ErrorBanner from '../components/ErrorBanner';
import ProgressBar from '../components/ProgressBar';
import StatusChip from '../components/StatusChip';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import { usePoll } from '../hooks/usePoll';
import { JobDetail, JobFinalizeResponse, JobHireResponse } from '../types';

const IN_PROGRESS_STATUSES = new Set(['queued', 'running']);

type GatheringUiPhase = 'chatting' | 'reviewing' | 'pm_result';

// ---- Sub-components ----

function CompletenessBar({ score }: { score: number }) {
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="completeness-bar-wrap">
      <div className="completeness-bar-header">
        <span className="completeness-bar-label">Requirements completeness</span>
        <span className="completeness-bar-pct" style={{ color }}>{score}%</span>
      </div>
      <div className="completeness-bar-track">
        <div className="completeness-bar-fill" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}

function DownloadButtons({ token, jobId }: { token: string; jobId: string }) {
  return (
    <div className="req-download-row">
      <span className="req-field-label" style={{ alignSelf: 'center' }}>Download</span>
      <a
        className="btn-secondary btn-sm"
        href={downloadRequirements(token, jobId, 'md')}
        download
      >
        Markdown (.md)
      </a>
      <a
        className="btn-secondary btn-sm"
        href={downloadRequirements(token, jobId, 'json')}
        download
      >
        JSON (.json)
      </a>
    </div>
  );
}

function RequirementsPreview({
  data,
  jobId,
  token,
  onConfirm,
  isConfirming,
}: {
  data: JobFinalizeResponse;
  jobId: string;
  token: string;
  onConfirm: () => void;
  isConfirming: boolean;
}) {
  const req = data.requirements as Record<string, unknown>;
  const projectName = req.project_name as string | undefined;
  const overview = req.project_overview as string | undefined;
  const goals = (req.goals as string[] | undefined) ?? [];
  const frs = (req.functional_requirements as Array<{ id: string; title: string; priority: string }> | undefined) ?? [];
  const nfrs = (req.non_functional_requirements as Array<{ id: string; category: string; description: string }> | undefined) ?? [];
  const timeline = req.timeline as string | null | undefined;
  const constraints = (req.constraints as string[] | undefined) ?? [];
  const stakeholders = (req.stakeholders as string[] | undefined) ?? [];
  const outOfScope = (req.out_of_scope as string[] | undefined) ?? [];
  const openQuestions = (req.open_questions as string[] | undefined) ?? [];

  return (
    <div className="req-preview">
      <div className="req-preview-header">
        <h3>Extracted requirements</h3>
        <CompletenessBar score={data.completeness_score} />
      </div>

      {projectName && (
        <div className="req-preview-field">
          <span className="req-field-label">Project</span>
          <span className="req-field-value">{projectName}</span>
        </div>
      )}
      {overview && (
        <div className="req-preview-field">
          <span className="req-field-label">Overview</span>
          <span className="req-field-value">{overview}</span>
        </div>
      )}
      {goals.length > 0 && (
        <div className="req-preview-field">
          <span className="req-field-label">Goals</span>
          <ul className="req-list">{goals.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </div>
      )}
      {frs.length > 0 && (
        <div className="req-preview-field">
          <span className="req-field-label">Features ({frs.length})</span>
          <ul className="req-list">
            {frs.map((fr) => (
              <li key={fr.id}>
                <span className={`req-priority req-priority-${fr.priority}`}>{fr.priority}</span>
                {' '}{fr.title}
              </li>
            ))}
          </ul>
        </div>
      )}
      {nfrs.length > 0 && (
        <div className="req-preview-field">
          <span className="req-field-label">Non-functional</span>
          <ul className="req-list">
            {nfrs.map((nfr) => <li key={nfr.id}><strong>{nfr.category}</strong> — {nfr.description}</li>)}
          </ul>
        </div>
      )}
      {stakeholders.length > 0 && (
        <div className="req-preview-field">
          <span className="req-field-label">Stakeholders</span>
          <ul className="req-list">{stakeholders.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {timeline && (
        <div className="req-preview-field">
          <span className="req-field-label">Timeline</span>
          <span className="req-field-value">{timeline}</span>
        </div>
      )}
      {constraints.length > 0 && (
        <div className="req-preview-field">
          <span className="req-field-label">Constraints</span>
          <ul className="req-list">{constraints.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}
      {outOfScope.length > 0 && (
        <div className="req-preview-field">
          <span className="req-field-label">Out of scope</span>
          <ul className="req-list">{outOfScope.map((o, i) => <li key={i}>{o}</li>)}</ul>
        </div>
      )}
      {openQuestions.length > 0 && (
        <div className="req-preview-field">
          <span className="req-field-label">Open questions</span>
          <ul className="req-list req-list-warn">{openQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
        </div>
      )}

      {data.vague_areas.length > 0 && (
        <div className="req-vague-areas">
          <span className="req-field-label">Areas to strengthen</span>
          <ul className="req-list req-list-warn">
            {data.vague_areas.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}

      <DownloadButtons token={token} jobId={jobId} />

      <button
        type="button"
        className="btn-primary"
        onClick={onConfirm}
        disabled={isConfirming}
        style={{ marginTop: '1.25rem' }}
      >
        {isConfirming ? 'Running PM review…' : 'Confirm with Supervisor Mike'}
      </button>
    </div>
  );
}

function PMReviewPanel({
  data,
  jobId,
  token,
  onAddressGaps,
  onForceStart,
  isForcing,
}: {
  data: JobHireResponse;
  jobId: string;
  token: string;
  onAddressGaps: () => void;
  onForceStart: () => void;
  isForcing: boolean;
}) {
  const approved = data.review_status === 'approved';
  const needsClarification = data.review_status === 'needs_clarification';

  return (
    <div className={`pm-review pm-review-${approved ? 'approved' : 'flagged'}`}>
      <div className="pm-review-header">
        <div>
          <span className="pm-review-title">PM Review — Supervisor Mike</span>
          <span className={`pm-review-badge ${approved ? 'badge-approved' : 'badge-flagged'}`}>
            {approved ? 'Approved' : 'Needs Clarification'}
          </span>
        </div>
        {data.feasibility_score > 0 && (
          <div className="pm-feasibility">
            <span className="pm-feasibility-label">Feasibility</span>
            <span className="pm-feasibility-score">{data.feasibility_score}/100</span>
          </div>
        )}
      </div>

      {data.review_feedback && (
        <p className="pm-review-feedback">{data.review_feedback}</p>
      )}

      {data.review_strengths.length > 0 && (
        <div className="pm-review-section">
          <span className="pm-section-label">Strengths</span>
          <ul className="pm-list pm-list-strengths">
            {data.review_strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {data.review_gaps.length > 0 && (
        <div className="pm-review-section">
          <span className="pm-section-label">Open questions</span>
          <ul className="pm-list pm-list-gaps">
            {data.review_gaps.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        </div>
      )}

      {data.review_recommendations.length > 0 && (
        <div className="pm-review-section">
          <span className="pm-section-label">Recommendations</span>
          <ul className="pm-list pm-list-recs">
            {data.review_recommendations.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      <DownloadButtons token={token} jobId={jobId} />

      {approved && (
        <p className="hint-text" style={{ marginTop: '1rem' }}>
          Your job is now queued. The agent is picking it up — check back shortly.
        </p>
      )}

      {needsClarification && (
        <div className="pm-gap-actions">
          <p className="pm-gap-notice">
            Address the open questions above to get a stronger result, or start work as-is.
          </p>
          <div className="pm-gap-buttons">
            <button type="button" className="btn-secondary" onClick={onAddressGaps}>
              ← Address gaps with Jerry
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={onForceStart}
              disabled={isForcing}
            >
              {isForcing ? 'Starting…' : 'Start work anyway'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Main page ----

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { token } = useCustomerAuth();

  const [messages, setMessages] = useState<ChatDisplayMessage[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  const [gatheringPhase, setGatheringPhase] = useState<GatheringUiPhase>('chatting');
  const [completenessScore, setCompletenessScore] = useState(0);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isHiring, setIsHiring] = useState(false);
  const [isForcing, setIsForcing] = useState(false);
  const [finalizeData, setFinalizeData] = useState<JobFinalizeResponse | null>(null);
  const [hireData, setHireData] = useState<JobHireResponse | null>(null);

  const fetcher = useCallback(
    (_signal: AbortSignal) => {
      if (!token || !jobId) return Promise.reject(new Error('Not ready'));
      return getJob(token, jobId);
    },
    [token, jobId],
  );

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
      .catch(() => { setMessagesLoaded(true); });
  }, [token, jobId, job, messagesLoaded]);

  async function handleSendChat(text: string) {
    if (!token || !jobId) return;
    const userMsg: ChatDisplayMessage = { id: `local-${Date.now()}-u`, role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    try {
      const res = await sendChatMessage(token, jobId, text);
      setMessages((prev) => [...prev, { id: `local-${Date.now()}-a`, role: 'assistant', content: res.message }]);
      if (res.completeness_score > 0) setCompletenessScore(res.completeness_score);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to send message.');
    }
  }

  async function handleFinalize() {
    if (!token || !jobId) return;
    setActionError(null);
    setIsFinalizing(true);
    try {
      const result = await finalizeJob(token, jobId);
      setFinalizeData(result);
      setCompletenessScore(result.completeness_score);
      setGatheringPhase('reviewing');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to extract requirements.');
    } finally {
      setIsFinalizing(false);
    }
  }

  async function handleHire(force = false) {
    if (!token || !jobId) return;
    setActionError(null);
    force ? setIsForcing(true) : setIsHiring(true);
    try {
      const result = await hireJob(token, jobId, force);
      setHireData(result);
      setGatheringPhase('pm_result');
      if (result.worker_launched) refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to start job.');
    } finally {
      force ? setIsForcing(false) : setIsHiring(false);
    }
  }

  function handleAddressGaps() {
    // Send the user back to chat — the req-agent session stays in "confirming" mode
    // so Jerry will help address the PM's open questions
    setGatheringPhase('chatting');
    setHireData(null);
  }

  async function handleAccept() {
    if (!token || !jobId) return;
    setIsAccepting(true);
    try {
      await acceptJob(token, jobId);
      triggerDownload(jobId, token ?? '');
      refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to accept job.');
    } finally {
      setIsAccepting(false);
    }
  }

  async function handleReject() {
    if (!token || !jobId) return;
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
  if (!job) return <div className="page"><div className="page-loading">Loading job…</div></div>;

  const hasResult = ['ready_for_review', 'accepted', 'rejected'].includes(job.status);
  const hasAgentReply = messages.some((m) => m.role === 'assistant');

  return (
    <div className="page">
      <Link to="/dashboard" className="back-link">← My jobs</Link>
      <div className="page-header">
        <h1>{job.agent?.name ?? 'Job'}</h1>
        <StatusChip status={job.status} />
      </div>
      <p className="page-subtitle">{job.initial_brief}</p>
      <p className="hint-text" style={{ marginTop: '-1rem', marginBottom: '1.5rem' }}>
        Job #{job.id.slice(0, 8)} · started {new Date(job.created_at).toLocaleString()}
      </p>

      <ErrorBanner message={actionError} />

      {/* ---- Gathering phase ---- */}
      {job.status === 'gathering' && (
        <>
          {gatheringPhase === 'chatting' && (
            <div className="card">
              <div className="gather-header">
                <h2>Tell Jerry what you need</h2>
                {completenessScore > 0 && <CompletenessBar score={completenessScore} />}
              </div>
              {hireData?.review_gaps && hireData.review_gaps.length > 0 && (
                <div className="pm-gap-hint">
                  <strong>PM open questions to address:</strong>
                  <ul className="req-list req-list-warn" style={{ marginTop: '0.4rem' }}>
                    {hireData.review_gaps.map((g, i) => <li key={i}>{g}</li>)}
                  </ul>
                </div>
              )}
              <ChatWindow messages={messages} onSend={handleSendChat} disabled={isFinalizing} />
              <div className="gather-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleFinalize}
                  disabled={isFinalizing || !hasAgentReply}
                >
                  {isFinalizing ? 'Extracting requirements…' : 'Finalize requirements'}
                </button>
                {!hasAgentReply && (
                  <p className="hint-text">Chat with Jerry first so she can scope your task.</p>
                )}
              </div>
            </div>
          )}

          {gatheringPhase === 'reviewing' && finalizeData && (
            <div className="card">
              <h2>Review your requirements</h2>
              <p className="hint-text" style={{ marginBottom: '1rem' }}>
                Jerry extracted these from your conversation. Go back to chat to adjust anything, or confirm to run the PM review.
              </p>
              <RequirementsPreview
                data={finalizeData}
                jobId={jobId!}
                token={token ?? ''}
                onConfirm={() => handleHire(false)}
                isConfirming={isHiring}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setGatheringPhase('chatting')}
                style={{ marginTop: '0.75rem' }}
                disabled={isHiring}
              >
                ← Back to chat
              </button>
            </div>
          )}

          {gatheringPhase === 'pm_result' && hireData && (
            <div className="card">
              <h2>PM review complete</h2>
              <PMReviewPanel
                data={hireData}
                jobId={jobId!}
                token={token ?? ''}
                onAddressGaps={handleAddressGaps}
                onForceStart={() => handleHire(true)}
                isForcing={isForcing}
              />
            </div>
          )}
        </>
      )}

      {/* ---- In-progress ---- */}
      {IN_PROGRESS_STATUSES.has(job.status) && (
        <div className="card">
          <h2>{job.status === 'queued' ? 'Queued' : 'Working on it'}</h2>
          <ProgressBar pct={Number(job.progress_pct) || 0} message={job.progress_msg} />
        </div>
      )}

      {/* ---- Failed ---- */}
      {job.status === 'failed' && (
        <div className="card">
          <h2>This job didn't complete</h2>
          <p className="agent-detail-description">
            {job.progress_msg || 'The agent hit an unrecoverable error while working.'}
          </p>
          <div className="job-actions">
            {job.agent_id && <Link to={`/agents/${job.agent_id}`} className="btn-secondary">Hire this agent again</Link>}
            <Link to="/agents" className="btn-secondary">Browse other agents</Link>
          </div>
        </div>
      )}

      {/* ---- Result ---- */}
      {hasResult && (
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
            <a className="btn-secondary" href={downloadUrl(job.id, token ?? '')} download>Download .zip</a>
            {job.status === 'ready_for_review' && (
              <>
                <button type="button" className="btn-primary" onClick={handleAccept} disabled={isAccepting}>
                  {isAccepting ? 'Accepting…' : 'Accept'}
                </button>
                <button type="button" className="btn-danger" onClick={() => setShowRejectForm((v) => !v)} disabled={isRejecting}>
                  Reject
                </button>
              </>
            )}
          </div>
          {showRejectForm && (
            <div className="reject-form">
              <textarea rows={3} placeholder="Optional reason…" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              <button type="button" className="btn-danger" onClick={handleReject} disabled={isRejecting}>
                {isRejecting ? 'Submitting…' : 'Confirm reject'}
              </button>
            </div>
          )}
          {job.status === 'accepted' && <p className="hint-text">You accepted this result.</p>}
          {job.status === 'rejected' && (
            <p className="hint-text">You rejected this result{job.rejection_reason ? `: ${job.rejection_reason}` : '.'}</p>
          )}
        </div>
      )}
    </div>
  );
}
