import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getAgent } from '../api/agents';
import { ApiError } from '../api/client';
import { startJob } from '../api/jobs';
import ErrorBanner from '../components/ErrorBanner';
import { formatCategory } from '../components/AgentCard';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import { AgentDetail } from '../types';

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// The hire flow bounces anonymous users through /login — keep their typed
// brief in sessionStorage so it survives the round trip instead of being
// wiped at the exact moment of conversion.
const draftKey = (agentId: string) => `agentmarket.draftBrief.${agentId}`;

export default function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { token, isAuthenticated } = useCustomerAuth();

  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [brief, setBrief] = useState(() =>
    agentId ? sessionStorage.getItem(draftKey(agentId)) ?? '' : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [isHiring, setIsHiring] = useState(false);

  useEffect(() => {
    if (!agentId) return;
    setError(null);
    getAgent(agentId)
      .then(setAgent)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load agent.'));
  }, [agentId]);

  async function handleHire(e: React.FormEvent) {
    e.preventDefault();
    if (!agentId) return;
    if (!isAuthenticated || !token) {
      navigate('/login', { state: { from: { pathname: `/agents/${agentId}` } } });
      return;
    }
    if (!brief.trim()) {
      setError('Describe the task before hiring.');
      return;
    }
    setError(null);
    setIsHiring(true);
    try {
      const res = await startJob(token, agentId, brief.trim());
      sessionStorage.removeItem(draftKey(agentId));
      navigate(`/dashboard/jobs/${res.job_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to start job.');
    } finally {
      setIsHiring(false);
    }
  }

  if (error && !agent) {
    return (
      <div className="page">
        <ErrorBanner message={error} />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="page">
        <div className="page-loading">Loading agent…</div>
      </div>
    );
  }

  const rate = Number(agent.hourly_rate);
  const hours = Number(agent.avg_hours);

  return (
    <div className="page page-narrow">
      <Link to="/agents" className="back-link">
        ← All agents
      </Link>

      <div className="agent-hero">
        <div className="agent-hero-head">
          <span className="agent-avatar agent-avatar-xl">{initials(agent.name)}</span>
          <div>
            <h1>{agent.name}</h1>
            <span className="agent-card-category">{formatCategory(agent.category)}</span>
          </div>
        </div>
        <p className="agent-detail-description">{agent.description}</p>
        <div className="agent-hero-stats">
          <div className="stat-tile">
            <div className="stat-tile-value gradient-text">${rate.toFixed(2)}</div>
            <div className="stat-tile-label">per hour</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value gradient-text">~{hours}h</div>
            <div className="stat-tile-label">average job</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value gradient-text">${(rate * hours).toFixed(0)}</div>
            <div className="stat-tile-label">est. typical cost</div>
          </div>
        </div>
        <p className="agent-hero-note">
          Estimate based on this agent's average job length — actual cost depends on the hours
          your job takes.
        </p>
      </div>

      <div className="card hire-card">
        <h2>Describe your task</h2>
        <p className="page-subtitle">
          Tell the agent what you need in a sentence or two. A requirements-gathering agent
          will ask follow-up questions before work starts.
        </p>
        <form onSubmit={handleHire}>
          <textarea
            rows={5}
            value={brief}
            onChange={(e) => {
              setBrief(e.target.value);
              if (agentId) sessionStorage.setItem(draftKey(agentId), e.target.value);
            }}
            placeholder="e.g. I need a one-page landing site for my bakery, with a menu section and a contact form."
          />
          <ErrorBanner message={error} />
          <button type="submit" className="btn-primary" disabled={isHiring}>
            {isHiring ? 'Starting…' : 'Hire this agent'}
          </button>
          {!isAuthenticated ? (
            <p className="hint-text">You&apos;ll be asked to log in or sign up first.</p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
