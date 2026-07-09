import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboard, listSubmissions } from '../api/seller';
import { ApiError } from '../api/client';
import CountUp from '../components/CountUp';
import ErrorBanner from '../components/ErrorBanner';
import StatusChip from '../components/StatusChip';
import {
  BellIcon,
  BoltIcon,
  BriefcaseIcon,
  CheckCircleIcon,
  CpuIcon,
  DollarIcon,
  EyeIcon,
} from '../components/icons';
import { useSellerAuth } from '../context/SellerAuthContext';
import {
  SellerDashboard,
  SellerNotification,
  SellerSubmissionSummary,
} from '../types';

function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "3m ago" / "2h ago" / "5d ago" — dashboards read better relative. */
function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = hours / 24;
  if (days < 30) return `${Math.floor(days)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const NOTIF_STYLE: Record<SellerNotification['kind'], { icon: React.ReactNode; tone: string }> = {
  submission_approved: { icon: <CheckCircleIcon size={15} />, tone: 'success' },
  submission_flagged: { icon: <EyeIcon size={15} />, tone: 'warning' },
  submission_rejected: { icon: <EyeIcon size={15} />, tone: 'danger' },
  job_hired: { icon: <BoltIcon size={15} />, tone: 'info' },
  job_accepted: { icon: <DollarIcon size={15} />, tone: 'success' },
  job_rejected: { icon: <BriefcaseIcon size={15} />, tone: 'warning' },
};

export default function SellerDashboardPage() {
  const { token } = useSellerAuth();
  const [dashboard, setDashboard] = useState<SellerDashboard | null>(null);
  const [submissions, setSubmissions] = useState<SellerSubmissionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const onError = (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Failed to load your dashboard.');
    getDashboard(token).then(setDashboard).catch(onError);
    listSubmissions(token).then(setSubmissions).catch(onError);
  }, [token]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Seller dashboard</h1>
        <Link to="/seller/agents/new" className="btn-primary">
          Upload a new agent
        </Link>
      </div>
      <p className="page-subtitle">Usage, earnings, and activity across your listed agents.</p>

      <ErrorBanner message={error} />

      {dashboard === null && !error ? (
        <div className="dash-stats" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-row" />
          ))}
        </div>
      ) : null}

      {dashboard !== null ? (
        <>
          <div className="dash-stats">
            <div className="dash-stat-card dash-stat-primary">
              <div className="dash-stat-icon">
                <DollarIcon size={18} />
              </div>
              <div>
                <div className="dash-stat-value gradient-text">
                  $<CountUp to={dashboard.total_earnings} decimals={2} />
                </div>
                <div className="dash-stat-label">Total earned</div>
              </div>
            </div>
            <div className="dash-stat-card">
              <div className="dash-stat-icon">
                <EyeIcon size={18} />
              </div>
              <div>
                <div className="dash-stat-value">
                  $<CountUp to={dashboard.pending_earnings} decimals={2} />
                </div>
                <div className="dash-stat-label">Pending customer review</div>
              </div>
            </div>
            <div className="dash-stat-card">
              <div className="dash-stat-icon">
                <BriefcaseIcon size={18} />
              </div>
              <div>
                <div className="dash-stat-value">
                  <CountUp to={dashboard.total_jobs} />
                </div>
                <div className="dash-stat-label">Jobs all-time</div>
              </div>
            </div>
            <div className="dash-stat-card">
              <div className="dash-stat-icon">
                <CpuIcon size={18} />
              </div>
              <div>
                <div className="dash-stat-value">
                  <CountUp to={dashboard.active_agents} />
                </div>
                <div className="dash-stat-label">Live listings</div>
              </div>
            </div>
          </div>

          <div className="dash-grid">
            <section className="dash-main">
              <h2 className="dash-section-title">Your agents</h2>
              {dashboard.agents.length === 0 ? (
                <div className="empty-state">
                  <p>No listed agents yet — upload one and it will appear here once approved.</p>
                  <Link to="/seller/agents/new" className="btn-secondary">
                    Upload an agent
                  </Link>
                </div>
              ) : (
                <div className="agent-usage-list">
                  {dashboard.agents.map((agent) => (
                    <div key={agent.agent_id} className="agent-usage-card">
                      <div className="agent-usage-head">
                        <div>
                          <strong>{agent.name}</strong>
                          {agent.category ? (
                            <span className="agent-card-category">
                              {agent.category.replace(/-/g, ' ')}
                            </span>
                          ) : null}
                        </div>
                        <span className="agent-usage-earnings">${money(agent.earnings)}</span>
                      </div>
                      <div className="agent-usage-stats">
                        <span>
                          <strong>{agent.jobs_total}</strong> jobs
                        </span>
                        <span>
                          <strong>{agent.jobs_active}</strong> in progress
                        </span>
                        <span>
                          <strong>{agent.jobs_awaiting_review}</strong> awaiting review
                        </span>
                        <span>
                          <strong>{agent.jobs_accepted}</strong> accepted
                        </span>
                        <span>
                          <strong>{agent.jobs_rejected}</strong> sent back
                        </span>
                      </div>
                      <div className="agent-usage-foot">
                        <span>
                          ${money(agent.hourly_rate ?? 0)}/hr · ~{agent.avg_hours ?? 0}h avg
                        </span>
                        <span>
                          {agent.last_job_at
                            ? `Last hired ${timeAgo(agent.last_job_at)}`
                            : 'Not hired yet'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <aside className="dash-side">
              <h2 className="dash-section-title">
                <BellIcon size={16} /> Notifications
              </h2>
              <div className="notif-panel">
                {dashboard.notifications.length === 0 ? (
                  <p className="notif-empty">
                    Nothing yet — you&apos;ll see review results, new hires, and payouts here.
                  </p>
                ) : (
                  dashboard.notifications.map((n) => {
                    const style = NOTIF_STYLE[n.kind] ?? NOTIF_STYLE.job_hired;
                    return (
                      <div key={n.id} className={`notif-item notif-${style.tone}`}>
                        <span className="notif-icon">{style.icon}</span>
                        <div className="notif-content">
                          <div className="notif-title">{n.title}</div>
                          {n.body ? <div className="notif-body">{n.body}</div> : null}
                          <div className="notif-time">{timeAgo(n.at)}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </aside>
          </div>
        </>
      ) : null}

      <section className="dash-submissions">
        <h2 className="dash-section-title">Submissions</h2>
        {submissions === null && !error ? (
          <div className="page-loading">Loading submissions…</div>
        ) : null}
        {submissions !== null && submissions.length === 0 ? (
          <p className="hint-text">You haven&apos;t submitted an agent yet.</p>
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
      </section>
    </div>
  );
}
