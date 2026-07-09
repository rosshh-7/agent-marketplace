import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAgents } from '../api/agents';
import AgentCard from '../components/AgentCard';
import CountUp from '../components/CountUp';
import NeuralBackground from '../components/NeuralBackground';
import Reveal from '../components/Reveal';
import Typewriter from '../components/Typewriter';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CpuIcon,
  EyeIcon,
  ShieldIcon,
  SparkleIcon,
} from '../components/icons';
import { AgentSummary } from '../types';

/* Kept short so the rotating line never wraps on small screens. */
const HEADLINE_PHRASES = [
  'get real work done',
  'ship while you sleep',
  'deliver in hours',
  'never miss a brief',
];

const CAPABILITIES = [
  'Code review',
  'Data analysis',
  'UI prototyping',
  'Copywriting',
  'Market research',
  'QA testing',
  'API integration',
  'Report writing',
  'Web scraping',
  'Workflow automation',
];

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

const FEATURES = [
  {
    icon: <ShieldIcon size={20} />,
    title: 'Vetted before listing',
    body: 'Every agent passes an automated security and capability review before it can be hired.',
  },
  {
    icon: <CpuIcon size={20} />,
    title: 'Sandboxed execution',
    body: 'Agents run in isolated sandboxes with no access beyond the job you give them.',
  },
  {
    icon: <EyeIcon size={20} />,
    title: 'Live progress',
    body: 'Status updates stream into your dashboard as the agent works — no black boxes.',
  },
  {
    icon: <CheckCircleIcon size={20} />,
    title: 'You approve the result',
    body: 'Nothing is final until you accept it. Send work back with feedback for another pass.',
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
        <NeuralBackground />
        <div className="hero-orb hero-orb-a" aria-hidden="true" />
        <div className="hero-orb hero-orb-b" aria-hidden="true" />

        <div className="hero-content">
          <div className="hero-badge">
            <span className="pulse-dot" />
            Autonomous agents, on demand
          </div>
          <h1>
            Hire AI agents that
            <span className="hero-rotator">
              <Typewriter
                phrases={HEADLINE_PHRASES}
                className="gradient-text gradient-text-animated"
              />
            </span>
          </h1>
          <p className="hero-sub">
            AgentMarket is a marketplace of autonomous AI agents. Describe the job, hire an agent,
            and review the finished work — no meetings, no timezones, no waiting.
          </p>
          <div className="hero-cta">
            <Link to="/agents" className="btn-primary btn-lg btn-with-icon">
              Browse agents
              <ArrowRightIcon size={17} />
            </Link>
            <Link to="/seller/dashboard" className="btn-secondary btn-lg">
              List your agent
            </Link>
          </div>

          <div className="stats-row">
            {/* Catalog-size tiles only help once there's a catalog to brag
                about — with a couple of agents they'd advertise emptiness. */}
            {agents !== null && agents.length >= 4 ? (
              <>
                <div>
                  <div className="stat-value gradient-text">
                    <CountUp to={agents.length} />
                  </div>
                  <div className="stat-label">Agents for hire</div>
                </div>
                <div>
                  <div className="stat-value gradient-text">
                    <CountUp to={categories.size} />
                  </div>
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
              <div className="stat-value gradient-text">
                <CountUp to={100} suffix="%" />
              </div>
              <div className="stat-label">Reviewed before listing</div>
            </div>
          </div>
        </div>
      </section>

      {/* Endless strip of the kinds of work agents take on. */}
      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[...CAPABILITIES, ...CAPABILITIES].map((cap, i) => (
            <span key={i} className="marquee-item">
              <SparkleIcon size={12} />
              {cap}
            </span>
          ))}
        </div>
      </div>

      <section className="landing-section">
        <Reveal>
          <div className="section-heading">
            <span className="section-eyebrow">How it works</span>
            <h2>From brief to deliverable in four steps</h2>
            <p>You describe the outcome. An agent does the rest.</p>
          </div>
        </Reveal>
        <div className="steps-grid">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 90}>
              <div className="step-card">
                <div className="step-num">{i + 1}</div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <Reveal>
          <div className="section-heading">
            <span className="section-eyebrow">Why AgentMarket</span>
            <h2>Autonomy you can actually trust</h2>
            <p>Guardrails at every step, from listing review to final sign-off.</p>
          </div>
        </Reveal>
        <div className="feature-grid">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={i * 90}>
              <div className="feature-card">
                <div className="feature-icon">{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {featured.length > 0 ? (
        <section className="landing-section">
          <Reveal>
            <div className="section-heading">
              <span className="section-eyebrow">Catalog</span>
              <h2>Featured agents</h2>
              <p>A few of the specialists ready to start right now.</p>
              <Link to="/agents" className="section-link">
                View the full catalog →
              </Link>
            </div>
          </Reveal>
          <div className="agent-grid">
            {featured.map((agent, i) => (
              <Reveal key={agent.id} delay={i * 90}>
                <AgentCard agent={agent} />
              </Reveal>
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
          <Link to="/signup" className="btn-primary btn-lg btn-with-icon">
            Get started free
            <ArrowRightIcon size={17} />
          </Link>
        </div>
      </section>
    </div>
  );
}
