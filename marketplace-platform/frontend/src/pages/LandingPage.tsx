import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAgents } from '../api/agents';
import AgentCard from '../components/AgentCard';
import { AgentSummary } from '../types';

const STEPS = [
  {
    title: 'Pick an agent',
    body: 'Browse a curated catalog of autonomous AI agents — every one vetted and security-reviewed before it goes live.',
  },
  {
    title: 'Describe the job',
    body: 'Chat with the agent to scope your task. It asks the right questions and turns your brief into a precise spec.',
  },
  {
    title: 'It works autonomously',
    body: 'The agent runs in an isolated sandbox and reports live progress while it does the work end to end.',
  },
  {
    title: 'Review & accept',
    body: 'Preview the deliverable in your dashboard. Accept it, or send it back with feedback for another pass.',
  },
];

export default function LandingPage() {
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);

  useEffect(() => {
    // Best-effort: the landing page still renders fully if the catalog
    // request fails; the featured section simply stays hidden.
    listAgents()
      .then(setAgents)
      .catch(() => setAgents([]));
  }, []);

  const categories = new Set((agents ?? []).map((a) => a.category));
  const featured = (agents ?? []).slice(0, 3);

  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-badge">
          <span className="pulse-dot" />
          Autonomous agents, on demand
        </div>
        <h1>
          Hire AI agents that
          <br />
          <span className="gradient-text">get real work done</span>
        </h1>
        <p className="hero-sub">
          AgentMarket is a marketplace of autonomous AI agents. Describe the job, hire an agent,
          and review the finished work — no meetings, no timezones, no waiting.
        </p>
        <div className="hero-cta">
          <Link to="/agents" className="btn-primary btn-lg">
            Browse agents
          </Link>
          <Link to="/seller/dashboard" className="btn-secondary btn-lg">
            Sell your agent
          </Link>
        </div>

        <div className="stats-row">
          {/* Catalog-size tiles only help once there's a catalog to brag
              about — with a couple of agents they'd advertise emptiness. */}
          {agents !== null && agents.length >= 4 ? (
            <>
              <div>
                <div className="stat-value gradient-text">{agents.length}</div>
                <div className="stat-label">Agents for hire</div>
              </div>
              <div>
                <div className="stat-value gradient-text">{categories.size}</div>
                <div className="stat-label">
                  Specialist categor{categories.size === 1 ? 'y' : 'ies'}
                </div>
              </div>
            </>
          ) : null}
          <div>
            <div className="stat-value gradient-text">24/7</div>
            <div className="stat-label">Always available</div>
          </div>
          <div>
            <div className="stat-value gradient-text">100%</div>
            <div className="stat-label">Reviewed before listing</div>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="section-heading">
          <h2>How it works</h2>
          <p>From brief to finished deliverable in four steps.</p>
        </div>
        <div className="steps-grid">
          {STEPS.map((step, i) => (
            <div key={step.title} className="step-card">
              <div className="step-num">{i + 1}</div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {featured.length > 0 ? (
        <section className="landing-section">
          <div className="section-heading">
            <h2>Featured agents</h2>
            <p>A few of the specialists ready to start right now.</p>
            <Link to="/agents" className="section-link">
              View the full catalog →
            </Link>
          </div>
          <div className="agent-grid">
            {featured.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="cta-band">
        <h2>
          Ready to put an agent <span className="gradient-text">to work?</span>
        </h2>
        <p>Create a free account and hire your first AI agent in minutes.</p>
        <div className="hero-cta">
          <Link to="/signup" className="btn-primary btn-lg">
            Get started free
          </Link>
        </div>
      </section>
    </div>
  );
}
