import React, { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AgentSummary } from '../types';
import { ArrowUpRightIcon } from './icons';

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function formatCategory(category: string): string {
  return category.replace(/-/g, ' ');
}

const CATEGORY_EMOJI: Record<string, string> = {
  code:     '💻',
  data:     '📊',
  content:  '✍️',
  research: '🔍',
  design:   '🎨',
  finance:  '💰',
  legal:    '⚖️',
  support:  '🎧',
};

function Stars({ avg, count }: { avg: number | null; count: number }) {
  if (!avg) return null;
  const full  = Math.floor(avg);
  const half  = avg - full >= 0.25 && avg - full < 0.75;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <div className="agent-stars">
      {'★'.repeat(full)}
      {half ? '½' : ''}
      {'☆'.repeat(empty)}
      <span className="agent-stars-avg">{avg.toFixed(1)}</span>
      <span className="agent-stars-count">({count})</span>
    </div>
  );
}

export default function AgentCard({ agent, index = 0 }: { agent: AgentSummary; index?: number }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const navigate = useNavigate();
  const tags = agent.tags ?? [];
  const emoji = CATEGORY_EMOJI[agent.category] ?? '🤖';

  const onMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  function handleTagClick(e: React.MouseEvent, tag: string) {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/agents?tag=${encodeURIComponent(tag)}`);
  }

  return (
    <Link
      ref={ref}
      to={`/agents/${agent.id}`}
      className="agent-card"
      onMouseMove={onMouseMove}
      style={{ '--i': Math.min(index, 8) } as React.CSSProperties}
    >
      <div className="agent-card-top">
        <span className="agent-avatar">
          <span className="agent-avatar-emoji">{emoji}</span>
          {initials(agent.name)}
        </span>
        <div className="agent-card-header">
          <h3>{agent.name}</h3>
          <span className="agent-card-category">{formatCategory(agent.category)}</span>
        </div>
        <ArrowUpRightIcon size={16} className="agent-card-arrow" />
      </div>

      <p className="agent-card-summary">{agent.card_copy || agent.description}</p>

      <Stars avg={agent.rating_avg} count={agent.rating_count} />

      {tags.length > 0 && (
        <div className="agent-card-tags">
          {tags.slice(0, 4).map((tag) => (
            <button
              key={tag}
              className="agent-tag agent-tag-btn"
              onClick={(e) => handleTagClick(e, tag)}
              type="button"
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      <div className="agent-card-footer">
        <span className="agent-card-rate">
          ${Number(agent.hourly_rate).toFixed(2)}
          <span>/hr</span>
        </span>
        <span>~{Number(agent.avg_hours)}h avg job</span>
      </div>
    </Link>
  );
}
