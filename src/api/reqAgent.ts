const API = 'http://localhost:8002'

export interface DynamicAgent {
  listing_id: string
  name: string
  seller: string
  category: string
  description: string
  use_cases: string[]
  requirements: string[]
  tags: string[]
  hourly_rate: number
  avg_hours: number
  status: string
}

export async function getApprovedListings(): Promise<DynamicAgent[]> {
  const res = await fetch(`${API}/listings`)
  if (!res.ok) return []
  const data = await res.json()
  return (data.listings as DynamicAgent[]).filter(l => l.status === 'approved')
}

export async function getListing(id: string): Promise<DynamicAgent | null> {
  const res = await fetch(`${API}/listings/${id}`)
  if (!res.ok) return null
  return res.json()
}

export async function createSession(topic: string, mode: string) {
  const res = await fetch(`${API}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, mode }),
  })
  if (!res.ok) throw new Error('Failed to create session')
  return res.json() as Promise<{ session_id: string; message: string; topic: string; mode: string }>
}

export async function sendMessage(sessionId: string, message: string) {
  const res = await fetch(`${API}/sessions/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  if (!res.ok) throw new Error('Failed to send message')
  return res.json() as Promise<{ message: string; phase: string; completeness_score: number }>
}

export interface FinalizeResult {
  requirements: Record<string, unknown>
  json_path: string
  markdown_path: string
  transcript_path: string
  completeness_score: number
  vague_areas: string[]
  phase: string
  confirm_message: string
}

export interface ConfirmResult {
  requirements: Record<string, unknown>
  json_path: string
  markdown_path: string
  transcript_path: string
  review_status: string
  review_feedback: string
  review_gaps: string[]
  review_strengths: string[]
  feasibility_score: number
}

export async function finalizeSession(sessionId: string): Promise<FinalizeResult> {
  const res = await fetch(`${API}/sessions/${sessionId}/finalize`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to finalize session')
  return res.json()
}

export async function confirmSession(sessionId: string): Promise<ConfirmResult> {
  const res = await fetch(`${API}/sessions/${sessionId}/confirm`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to confirm session')
  return res.json()
}

export interface FeedbackPayload {
  rating: number
  liked?: string
  disliked?: string
  suggestions?: string
}

export async function submitFeedback(sessionId: string, payload: FeedbackPayload): Promise<void> {
  const res = await fetch(`${API}/sessions/${sessionId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to submit feedback')
}

export interface ListingPayload {
  name: string
  seller: string
  category: string
  description: string
  use_cases: string[]
  requirements: string[]
  tags: string[]
  hourly_rate: number
  avg_hours: number
}

export async function uploadArchive(listingId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API}/listings/${listingId}/upload`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Upload failed' }))
    throw new Error(err.detail || 'Upload failed')
  }
  return res.json() as Promise<{ listing_id: string; filename: string; size_bytes: number; status: string }>
}

export async function createListing(payload: ListingPayload) {
  const res = await fetch(`${API}/listings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to create listing')
  return res.json() as Promise<{ listing_id: string; name: string; status: string }>
}

export async function submitTask(agentId: string, agentName: string, agentCategory: string, requirements: Record<string, unknown>) {
  const res = await fetch(`${API}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: agentId, agent_name: agentName, agent_category: agentCategory, requirements }),
  })
  if (!res.ok) throw new Error('Failed to submit task')
  return res.json() as Promise<{ task_id: string; agent_name: string; status: string; output: string }>
}
