import React from 'react';

const LABELS: Record<string, string> = {
  gathering: 'Gathering requirements',
  queued: 'Queued',
  running: 'Running',
  ready_for_review: 'Ready for review',
  failed: 'Failed',
  accepted: 'Accepted',
  rejected: 'Rejected',
  pending: 'Pending review',
  approved: 'Approved',
  flagged: 'Flagged',
  active: 'Active',
  pending_review: 'Pending review',
  suspended: 'Suspended',
};

const TONES: Record<string, string> = {
  gathering: 'chip-info',
  queued: 'chip-info',
  running: 'chip-info',
  pending: 'chip-info',
  pending_review: 'chip-info',
  ready_for_review: 'chip-warning',
  flagged: 'chip-warning',
  accepted: 'chip-success',
  approved: 'chip-success',
  active: 'chip-success',
  rejected: 'chip-danger',
  failed: 'chip-danger',
  suspended: 'chip-danger',
};

export default function StatusChip({ status }: { status: string }) {
  const tone = TONES[status] ?? 'chip-neutral';
  const label = LABELS[status] ?? status;
  return <span className={`chip ${tone}`}>{label}</span>;
}
