// Seller agent-submission flow — all routes require a seller bearer token
// (PLATFORM_CONTRACT.md §4).

import { apiFetch } from './client';
import { SellerSubmissionDetail, SellerSubmissionSummary, SellerUploadResponse } from '../types';

export interface UploadAgentParams {
  name: string;
  description: string;
  category: string;
  hourlyRate: number;
  avgHours: number;
  file: File;
}

export function uploadAgent(token: string, params: UploadAgentParams): Promise<SellerUploadResponse> {
  const form = new FormData();
  form.set('name', params.name);
  form.set('description', params.description);
  form.set('category', params.category);
  form.set('hourly_rate', String(params.hourlyRate));
  form.set('avg_hours', String(params.avgHours));
  form.set('file', params.file);

  return apiFetch<SellerUploadResponse>('/api/seller/agents/upload', {
    method: 'POST',
    token,
    form,
  });
}

export function listSubmissions(token: string): Promise<SellerSubmissionSummary[]> {
  return apiFetch<SellerSubmissionSummary[]>('/api/seller/agents', { token });
}

export function getSubmission(token: string, submissionId: string): Promise<SellerSubmissionDetail> {
  return apiFetch<SellerSubmissionDetail>(`/api/seller/agents/${submissionId}`, { token });
}
