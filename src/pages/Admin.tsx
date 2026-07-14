import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import CategoryBadge from '../components/CategoryBadge'
import { useAdminAuth } from '../context/AdminAuth'
import type { Category } from '../types'

interface FeedbackEntry {
  id: number
  session_id: string
  rating: number
  liked: string
  disliked: string
  suggestions: string
  created_at: string
}

interface Listing {
  listing_id: string
  created_at: string
  name: string
  seller: string
  category: Category
  description: string
  use_cases: string[]
  requirements: string[]
  tags: string[]
  hourly_rate: number
  avg_hours: number
  status: 'pending_review' | 'approved' | 'rejected'
  archive_filename?: string
}

const STATUS_STYLES = {
  pending_review: { pill: 'text-amber-400 bg-amber-400/10 border-amber-400/30', label: 'Pending review' },
  approved:       { pill: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30', label: 'Approved' },
  rejected:       { pill: 'text-red-400 bg-red-400/10 border-red-400/30', label: 'Rejected' },
}

const FILTERS = ['all', 'pending_review', 'approved', 'rejected'] as const
type Filter = typeof FILTERS[number]

export default function Admin() {
  const { token, logout } = useAdminAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'listings' | 'feedback'>('listings')
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [updating, setUpdating] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch('http://localhost:8002/listings')
      .then(r => r.json())
      .then(d => { setListings(d.listings); setLoading(false) })
      .catch(() => { setError('Could not connect to server.'); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  const loadFeedback = useCallback(() => {
    setFeedbackLoading(true)
    fetch('http://localhost:8002/admin/feedback', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { setFeedback(d.feedback); setFeedbackLoading(false) })
      .catch(() => setFeedbackLoading(false))
  }, [token])

  useEffect(() => {
    if (tab === 'feedback' && feedback.length === 0) loadFeedback()
  }, [tab, feedback.length, loadFeedback])

  async function handleLogout() {
    await logout()
    navigate('/admin/login')
  }

  async function updateStatus(id: string, status: Listing['status']) {
    setUpdating(id)
    try {
      const r = await fetch(`http://localhost:8002/listings/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      })
      if (!r.ok) throw new Error()
      setListings(prev => prev.map(l => l.listing_id === id ? { ...l, status } : l))
    } catch {
      setError('Failed to update status.')
    } finally {
      setUpdating(null)
    }
  }

  const counts = {
    all: listings.length,
    pending_review: listings.filter(l => l.status === 'pending_review').length,
    approved: listings.filter(l => l.status === 'approved').length,
    rejected: listings.filter(l => l.status === 'rejected').length,
  }

  const visible = filter === 'all' ? listings : listings.filter(l => l.status === filter)

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full border border-red-500/30 bg-red-500/10 text-red-400 mb-3">
            🔐 Admin panel
          </div>
          <h1 className="text-2xl font-bold">Listing Review</h1>
          <p className="text-gray-400 text-sm mt-1">Approve or reject agent submissions before they go live.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={tab === 'listings' ? load : loadFeedback} className="text-xs text-gray-500 hover:text-gray-300 border border-gray-800 px-3 py-1.5 rounded-lg transition-colors">
            ↻ Refresh
          </button>
          <button onClick={handleLogout} className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 px-3 py-1.5 rounded-lg transition-colors">
            Sign out
          </button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-8 border-b border-gray-800">
        {(['listings', 'feedback'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-indigo-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}>
            {t === 'listings' ? 'Listings' : 'Alex Feedback'}
            {t === 'feedback' && feedback.length > 0 && (
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400">{feedback.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Feedback tab ── */}
      {tab === 'feedback' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-400">{feedback.length} response{feedback.length !== 1 ? 's' : ''} collected</p>
            <a
              href="http://localhost:8002/admin/feedback/export"
              className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-lg transition-colors"
            >
              ↓ Export CSV
            </a>
          </div>

          {feedbackLoading ? (
            <div className="text-center py-20 text-gray-500 animate-pulse">Loading feedback…</div>
          ) : feedback.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <div className="text-3xl mb-2">💬</div>
              <p>No feedback yet. Feedback appears here after users complete a session.</p>
            </div>
          ) : (
            <>
              {/* Summary bar */}
              <div className="grid grid-cols-5 gap-2 mb-6">
                {[1,2,3,4,5].map(star => {
                  const count = feedback.filter(f => f.rating === star).length
                  const pct = feedback.length ? Math.round((count / feedback.length) * 100) : 0
                  return (
                    <div key={star} className="p-3 rounded-xl border border-gray-800 bg-gray-900 text-center">
                      <div className="text-lg text-yellow-400 mb-1">{'★'.repeat(star)}</div>
                      <div className="text-xl font-bold text-white">{count}</div>
                      <div className="text-xs text-gray-500">{pct}%</div>
                    </div>
                  )
                })}
              </div>

              <div className="space-y-3">
                {feedback.map(f => (
                  <div key={f.id} className="p-4 rounded-xl border border-gray-800 bg-gray-900 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-yellow-400 text-sm">{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</span>
                        <span className="text-xs font-bold text-white">{f.rating}/5</span>
                      </div>
                      <div className="text-xs text-gray-500">{new Date(f.created_at).toLocaleString()}</div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {f.liked && (
                        <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                          <p className="text-xs text-emerald-400 font-medium mb-1">What worked well</p>
                          <p className="text-xs text-gray-300">{f.liked}</p>
                        </div>
                      )}
                      {f.disliked && (
                        <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                          <p className="text-xs text-amber-400 font-medium mb-1">Could be better</p>
                          <p className="text-xs text-gray-300">{f.disliked}</p>
                        </div>
                      )}
                    </div>
                    {f.suggestions && (
                      <div className="p-2.5 rounded-lg bg-gray-800 border border-gray-700">
                        <p className="text-xs text-gray-400 font-medium mb-1">Suggestions</p>
                        <p className="text-xs text-gray-300">{f.suggestions}</p>
                      </div>
                    )}
                    <p className="text-xs text-gray-600 font-mono">session: {f.session_id}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Listings tab ── */}
      {tab === 'listings' && <>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`p-4 rounded-xl border text-left transition-all ${
              filter === f
                ? f === 'approved'   ? 'border-emerald-500/50 bg-emerald-500/10'
                : f === 'rejected'   ? 'border-red-500/50 bg-red-500/10'
                : f === 'pending_review' ? 'border-amber-500/50 bg-amber-500/10'
                : 'border-indigo-500/50 bg-indigo-500/10'
                : 'border-gray-800 bg-gray-900 hover:border-gray-700'
            }`}
          >
            <div className={`text-2xl font-bold ${
              filter === f
                ? f === 'approved' ? 'text-emerald-400'
                : f === 'rejected' ? 'text-red-400'
                : f === 'pending_review' ? 'text-amber-400'
                : 'text-white'
                : 'text-white'
            }`}>{counts[f]}</div>
            <div className="text-xs text-gray-500 mt-0.5 capitalize">{f.replace('_', ' ')}</div>
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {loading ? (
        <div className="text-center py-20 text-gray-500 animate-pulse">Loading listings…</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <div className="text-3xl mb-2">📭</div>
          No {filter !== 'all' ? filter.replace('_', ' ') : ''} listings.
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map(l => {
            const s = STATUS_STYLES[l.status]
            const busy = updating === l.listing_id
            return (
              <div key={l.listing_id} className={`rounded-xl border bg-gray-900 overflow-hidden transition-all ${
                l.status === 'approved' ? 'border-emerald-500/20' :
                l.status === 'rejected' ? 'border-red-500/20 opacity-60' :
                'border-gray-800'
              }`}>
                {/* Top bar */}
                <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800 bg-gray-900/50">
                  <span className={`text-xs px-2.5 py-0.5 rounded-full border ${s.pill}`}>{s.label}</span>
                  <span className="text-xs text-gray-500 font-mono">{l.listing_id}</span>
                  {l.archive_filename && (
                    <span className="text-xs text-indigo-400 bg-indigo-400/10 border border-indigo-400/20 px-2 py-0.5 rounded-full">
                      📦 {l.archive_filename}
                    </span>
                  )}
                  <span className="text-xs text-gray-600">·</span>
                  <span className="text-xs text-gray-500">{new Date(l.created_at).toLocaleString()}</span>
                  <div className="ml-auto flex gap-2">
                    {l.status !== 'approved' && (
                      <button
                        onClick={() => updateStatus(l.listing_id, 'approved')}
                        disabled={busy}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 transition-colors text-xs font-medium"
                      >
                        {busy ? '…' : '✓'} Approve
                      </button>
                    )}
                    {l.status !== 'rejected' && (
                      <button
                        onClick={() => updateStatus(l.listing_id, 'rejected')}
                        disabled={busy}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors text-xs font-medium"
                      >
                        {busy ? '…' : '✕'} Reject
                      </button>
                    )}
                    {l.status !== 'pending_review' && (
                      <button
                        onClick={() => updateStatus(l.listing_id, 'pending_review')}
                        disabled={busy}
                        className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xl flex-shrink-0">🤖</div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="font-semibold text-white">{l.name}</h2>
                          <CategoryBadge category={l.category} />
                        </div>
                        <div className="text-sm text-gray-500 mt-0.5">by @{l.seller}</div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-bold text-white">${l.hourly_rate}<span className="text-sm text-gray-500 font-normal">/hr</span></div>
                      <div className="text-xs text-gray-500">~${(l.hourly_rate * l.avg_hours).toFixed(2)} avg task</div>
                    </div>
                  </div>

                  <p className="text-sm text-gray-400 leading-relaxed">{l.description}</p>

                  <div className="grid sm:grid-cols-2 gap-3">
                    {l.use_cases.length > 0 && (
                      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Use cases</p>
                        <ul className="space-y-1">
                          {l.use_cases.map((uc, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                              <span className="text-indigo-400 flex-shrink-0">→</span>{uc}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {l.requirements.length > 0 && (
                      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Requirements</p>
                        <ul className="space-y-1">
                          {l.requirements.map((r, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                              <span className="text-emerald-400 flex-shrink-0">✓</span>{r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {l.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {l.tags.map(tag => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-500">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      </>}
    </div>
  )
}
