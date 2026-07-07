// Public agent catalog — GET /api/agents, GET /api/agents/:id
// (PLATFORM_CONTRACT.md §4). No auth required to browse.

import { apiFetch } from './client';
import { AgentDetail, AgentSummary } from '../types';

export interface ListAgentsParams {
  category?: string;
  q?: string;
}

export function listAgents(params: ListAgentsParams = {}): Promise<AgentSummary[]> {
  const query = new URLSearchParams();
  if (params.category) query.set('category', params.category);
  if (params.q) query.set('q', params.q);
  const qs = query.toString();
  return apiFetch<AgentSummary[]>(`/api/agents${qs ? `?${qs}` : ''}`);
}

export function getAgent(agentId: string): Promise<AgentDetail> {
  return apiFetch<AgentDetail>(`/api/agents/${agentId}`);
}
