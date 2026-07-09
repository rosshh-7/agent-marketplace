import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { AgentSummary } from '../types';
import { ArrowUpRightIcon } from './icons';

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Category slugs are machine identifiers ("customer-support") — always
 *  display them as words. Casing is handled by `text-transform` in CSS. */
export function formatCategory(category: string): string {
  return category.replace(/-/g, ' ');
}

export default function AgentCard({ agent, index = 0 }: { agent: AgentSummary; index?: number }) {
  const ref = useRef<HTMLAnchorElement>(null);

  // Spotlight hover: track the cursor so the card's radial glow follows it.
  const onMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  return (
    <Link
      ref={ref}
      to={`/agents/${agent.id}`}
      className="agent-card"
      onMouseMove={onMouseMove}
      // Stagger the entrance animation; capped so long grids don't feel slow.
      style={{ '--i': Math.min(index, 8) } as React.CSSProperties}
    >
      <div className="agent-card-top">
        <span className="agent-avatar">{initials(agent.name)}</span>
        <div className="agent-card-header">
          <h3>{agent.name}</h3>
          <span className="agent-card-category">{formatCategory(agent.category)}</span>
        </div>
        <ArrowUpRightIcon size={16} className="agent-card-arrow" />
      </div>
      <p className="agent-card-summary">{agent.card_copy || agent.description}</p>
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
