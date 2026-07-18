// Customer job/hire flow — all routes require a customer bearer token
// (PLATFORM_CONTRACT.md §4). Every function takes `token` explicitly rather
// than reaching into context, so this module stays a plain, testable client.

import { apiFetch, apiUrl } from './client';
import { ChatMessage, JobChatResponse, JobDetail, JobFinalizeResponse, JobHireResponse, JobStartResponse, JobSummary } from '../types';

export function startJob(token: string, agentId: string, brief: string): Promise<JobStartResponse> {
  return apiFetch<JobStartResponse>('/api/jobs/start', {
    method: 'POST',
    token,
    json: { agent_id: agentId, brief },
  });
}

export function sendChatMessage(token: string, jobId: string, message: string): Promise<JobChatResponse> {
  return apiFetch<JobChatResponse>(`/api/jobs/${jobId}/chat`, {
    method: 'POST',
    token,
    json: { message },
  });
}

export function finalizeJob(token: string, jobId: string): Promise<JobFinalizeResponse> {
  return apiFetch<JobFinalizeResponse>(`/api/jobs/${jobId}/finalize`, {
    method: 'POST',
    token,
  });
}

export function hireJob(token: string, jobId: string, force = false): Promise<JobHireResponse> {
  return apiFetch<JobHireResponse>(`/api/jobs/${jobId}/hire${force ? '?force=true' : ''}`, {
    method: 'POST',
    token,
  });
}

export function downloadRequirements(token: string, jobId: string, format: 'md' | 'json'): string {
  return apiUrl(`/api/jobs/${jobId}/requirements/download?format=${format}&token=${encodeURIComponent(token)}`);
}

export function listJobs(token: string): Promise<JobSummary[]> {
  return apiFetch<JobSummary[]>('/api/jobs', { token });
}

export function getJob(token: string, jobId: string): Promise<JobDetail> {
  return apiFetch<JobDetail>(`/api/jobs/${jobId}`, { token });
}

export function getJobMessages(token: string, jobId: string): Promise<ChatMessage[]> {
  return apiFetch<ChatMessage[]>(`/api/jobs/${jobId}/messages`, { token });
}

export function acceptJob(token: string, jobId: string): Promise<JobDetail> {
  return apiFetch<JobDetail>(`/api/jobs/${jobId}/accept`, { method: 'POST', token });
}

export function rejectJob(token: string, jobId: string, reason?: string): Promise<JobDetail> {
  return apiFetch<JobDetail>(`/api/jobs/${jobId}/reject`, {
    method: 'POST',
    token,
    json: reason ? { reason } : {},
  });
}

/**
 * Preview index URL for the iframe on the job review page. Rendered
 * same-origin (via the dev-server proxy in dev, same origin in prod) so
 * relative links inside the static site resolve correctly, per contract §8.
 *
 * The backend's actual implementation accepts the bearer JWT as a `?token=`
 * query param on this route (in addition to the Authorization header) since
 * an <iframe src> can't set custom headers — confirmed against the built
 * backend, not just assumed. Pass the current customer token through here.
 */
export function submitReview(
  token: string,
  jobId: string,
  rating: number,
  feedback?: string,
): Promise<{ message: string; new_rating_avg: number; new_rating_count: number }> {
  return apiFetch(`/api/jobs/${jobId}/review`, {
    method: 'POST',
    token,
    json: { rating, feedback: feedback || null },
  });
}

export function previewUrl(jobId: string, token: string): string {
  return apiUrl(`/api/jobs/${jobId}/preview/index.html?token=${encodeURIComponent(token)}`);
}

/**
 * Download link for the result .zip. Never gated on accept/reject (§2) —
 * available any time the job is ready_for_review or later. Same `?token=`
 * query-param mechanism as previewUrl above, for the same reason (a plain
 * anchor click/navigation can't attach an Authorization header).
 */
export function downloadUrl(jobId: string, token: string): string {
  return apiUrl(`/api/jobs/${jobId}/download?token=${encodeURIComponent(token)}`);
}
