import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listAgents } from '../api/agents';
import { ApiError } from '../api/client';
import AgentCard, { formatCategory } from '../components/AgentCard';
import ErrorBanner from '../components/ErrorBanner';
import { SearchIcon } from '../components/icons';
import { AgentSummary } from '../types';

type SortKey = 'featured' | 'rate_asc' | 'rate_desc' | 'rating' | 'name';

const SORTERS: Record<SortKey, (a: AgentSummary, b: AgentSummary) => number> = {
  featured:  () => 0,
  rate_asc:  (a, b) => Number(a.hourly_rate) - Number(b.hourly_rate),
  rate_desc: (a, b) => Number(b.hourly_rate) - Number(a.hourly_rate),
  rating:    (a, b) => (b.rating_avg ?? 0) - (a.rating_avg ?? 0),
  name:      (a, b) => a.name.localeCompare(b.name),
};

export default function BrowseAgentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<SortKey>('featured');

  // Tag comes from the URL so card tag-clicks work cross-page
  const activeTag = searchParams.get('tag') ?? '';

  function clearTag() {
    setSearchParams({});
  }

  useEffect(() => {
    listAgents()
      .then(setAgents)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load agents.'));
  }, []);

  const categories = useMemo(
    () => Array.from(new Set((agents ?? []).map((a) => a.category))).sort(),
    [agents],
  );

  const visible = useMemo(() => {
    if (!agents) return null;
    const needle = q.trim().toLowerCase();
    const filtered = agents.filter((a) => {
      if (category && a.category !== category) return false;
      if (activeTag && !(a.tags ?? []).includes(activeTag)) return false;
      if (!needle) return true;
      const haystack = `${a.name} ${a.description} ${a.card_copy ?? ''} ${a.category} ${(a.tags ?? []).join(' ')}`.toLowerCase();
      return haystack.includes(needle);
    });
    return sort === 'featured' ? filtered : [...filtered].sort(SORTERS[sort]);
  }, [agents, q, category, activeTag, sort]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Browse agents</h1>
      </div>
      <p className="page-subtitle">
        Hire an autonomous AI agent to do a job for you. Every agent is reviewed before listing.
      </p>

      <div className="filter-bar">
        <div className="filter-bar-row">
          <div className="search-wrap">
            <SearchIcon size={16} />
            <input
              type="search"
              placeholder="Search agents by name, skill, or task…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search agents"
            />
          </div>
          <select
            className="filter-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort agents"
          >
            <option value="featured">Sort: Featured</option>
            <option value="rating">Top rated</option>
            <option value="rate_asc">Rate: low to high</option>
            <option value="rate_desc">Rate: high to low</option>
            <option value="name">Name: A–Z</option>
          </select>
        </div>
        {activeTag && (
          <div className="active-tag-bar">
            <span>Filtered by tag:</span>
            <span className="agent-tag"># {activeTag}</span>
            <button type="button" className="pill" onClick={clearTag}>✕ Clear</button>
          </div>
        )}
        <div className="category-pills">
          <button
            type="button"
            className={category === '' ? 'pill active' : 'pill'}
            onClick={() => setCategory('')}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={category === c ? 'pill active' : 'pill'}
              onClick={() => setCategory(category === c ? '' : c)}
            >
              {formatCategory(c)}
            </button>
          ))}
        </div>
      </div>

      <ErrorBanner message={error} />

      {visible === null && !error ? (
        <div className="agent-grid" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-card" />
          ))}
        </div>
      ) : null}

      {visible !== null ? (
        <p className=”results-count”>
          {visible.length} agent{visible.length === 1 ? '' : 's'}
          {category ? ` in ${formatCategory(category)}` : ''}
          {activeTag ? ` tagged #${activeTag}` : ''}
          {q.trim() ? ` matching “${q.trim()}”` : ''}
        </p>
      ) : null}

      {visible !== null && visible.length === 0 ? (
        <div className="empty-state">
          <p>No agents match your search.</p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setQ('');
              setCategory('');
            }}
          >
            Clear filters
          </button>
        </div>
      ) : null}

      <div className="agent-grid">
        {visible?.map((agent, i) => (
          <AgentCard key={agent.id} agent={agent} index={i} />
        ))}
      </div>
    </div>
  );
}
