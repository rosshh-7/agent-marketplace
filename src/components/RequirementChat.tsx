import { useState, useRef, useEffect } from 'react'
import { createSession, sendMessage, finalizeSession, confirmSession, submitFeedback } from '../api/reqAgent'
import type { FinalizeResult, ConfirmResult } from '../api/reqAgent'
import type { ChatMessage } from '../types'

const TOPICS = [
  { value: 'general',    label: 'General',         icon: '🎯' },
  { value: 'mobile_app', label: 'Mobile App',       icon: '📱' },
  { value: 'web_app',    label: 'Web Application',  icon: '🌐' },
  { value: 'api',        label: 'API / Backend',    icon: '⚙️' },
]

const MODES = [
  { value: 'conversation', label: 'Conversation', desc: 'Natural dialogue' },
  { value: 'form',         label: 'Form',         desc: 'Structured fields' },
]

interface Props {
  presetTopic?: string
  presetMode?: string
  onFinalize?: (result: ConfirmResult) => void
  agentName?: string
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500'
  const label = score >= 80 ? 'Comprehensive' : score >= 50 ? 'Partially covered' : 'Needs more detail'
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">Completeness</span>
        <span className={`text-xs font-medium ${score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
          {score}% — {label}
        </span>
      </div>
      <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  )
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(star)}
          className="text-2xl transition-transform hover:scale-110"
        >
          <span className={(hovered || value) >= star ? 'text-yellow-400' : 'text-gray-700'}>★</span>
        </button>
      ))}
    </div>
  )
}

function FeedbackForm({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const [rating, setRating] = useState(0)
  const [liked, setLiked] = useState('')
  const [disliked, setDisliked] = useState('')
  const [suggestions, setSuggestions] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!rating) { setError('Please select a star rating.'); return }
    setSubmitting(true)
    setError('')
    try {
      await submitFeedback(sessionId, { rating, liked, disliked, suggestions })
      setSubmitted(true)
    } catch {
      setError('Could not save feedback. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-center">
        <div className="text-2xl mb-1">🙏</div>
        <p className="text-sm text-emerald-400 font-medium">Thank you for the feedback!</p>
        <p className="text-xs text-gray-500 mt-0.5">It helps us make Alex better for everyone.</p>
      </div>
    )
  }

  return (
    <div className="p-4 rounded-xl border border-gray-800 bg-gray-900 space-y-4">
      <div>
        <p className="text-sm font-medium text-white mb-0.5">How was your experience with Alex?</p>
        <p className="text-xs text-gray-500 mb-3">Your feedback is used to improve the chatbot</p>
        <StarRating value={rating} onChange={setRating} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">What worked well?</label>
          <textarea
            value={liked}
            onChange={e => setLiked(e.target.value)}
            placeholder="e.g. Questions felt natural, moved at a good pace…"
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">What could be better?</label>
          <textarea
            value={disliked}
            onChange={e => setDisliked(e.target.value)}
            placeholder="e.g. Asked about something already covered…"
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Any other suggestions? <span className="text-gray-600">(optional)</span></label>
        <textarea
          value={suggestions}
          onChange={e => setSuggestions(e.target.value)}
          placeholder="Anything else that would make this more useful…"
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button onClick={handleSubmit} disabled={submitting}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors text-xs font-medium">
          {submitting ? 'Saving…' : 'Submit feedback'}
        </button>
        <button onClick={onDone} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
          Skip
        </button>
      </div>
    </div>
  )
}

export default function RequirementChat({ presetTopic, presetMode, onFinalize, agentName }: Props = {}) {
  const [step, setStep] = useState<'config' | 'chat' | 'confirming' | 'done'>(presetTopic ? 'chat' : 'config')
  const [topic, setTopic] = useState(presetTopic ?? 'general')
  const [mode, setMode] = useState(presetMode ?? 'conversation')
  const [sessionId, setSessionId] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [finalizeData, setFinalizeData] = useState<FinalizeResult | null>(null)
  const [confirmData, setConfirmData] = useState<ConfirmResult | null>(null)
  const [showFeedback, setShowFeedback] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (presetTopic) startSession()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function startSession() {
    setLoading(true)
    setError('')
    try {
      const data = await createSession(topic, mode)
      setSessionId(data.session_id)
      setMessages([{ role: 'assistant', content: data.message }])
      setStep('chat')
    } catch {
      setError('Could not connect to the server. Make sure it is running on localhost:8002.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSend() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)
    try {
      const data = await sendMessage(sessionId, userMsg)
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
    } catch {
      setError('Failed to send message.')
    } finally {
      setLoading(false)
    }
  }

  async function handleFinalize() {
    setLoading(true)
    setError('')
    try {
      const data = await finalizeSession(sessionId)
      setFinalizeData(data)
      if (data.confirm_message) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.confirm_message }])
      }
      setStep('confirming')
    } catch {
      setError('Failed to generate requirements summary.')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    setLoading(true)
    setError('')
    try {
      const data = await confirmSession(sessionId)
      setConfirmData(data)
      setStep('done')
      // onFinalize is NOT called here — user clicks "Run agent" explicitly after seeing feedback form
    } catch {
      setError('Failed to run PM review.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSendInConfirming() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)
    try {
      const data = await sendMessage(sessionId, userMsg)
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
    } catch {
      setError('Failed to send message.')
    } finally {
      setLoading(false)
    }
  }

  function resetAll() {
    setStep('config')
    setMessages([])
    setSessionId('')
    setFinalizeData(null)
    setConfirmData(null)
    setShowFeedback(true)
    setError('')
  }

  /* ── Alex avatar ── */
  const AlexAvatar = ({ size = 'md' }: { size?: 'sm' | 'md' }) => (
    <div className={`rounded-full flex-shrink-0 flex items-center justify-center font-bold text-white bg-gradient-to-br from-indigo-500 to-violet-600 ${size === 'sm' ? 'w-6 h-6 text-xs' : 'w-7 h-7 text-xs'}`}>
      A
    </div>
  )

  /* ── Config screen ── */
  if (step === 'config') {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm text-gray-400 mb-3">Select agent topic</p>
          <div className="grid grid-cols-2 gap-2">
            {TOPICS.map(t => (
              <button key={t.value} onClick={() => setTopic(t.value)}
                className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-all ${
                  topic === t.value ? 'border-indigo-500 bg-indigo-500/10 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-600'
                }`}>
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm text-gray-400 mb-3">Select gathering mode</p>
          <div className="grid grid-cols-2 gap-2">
            {MODES.map(m => (
              <button key={m.value} onClick={() => setMode(m.value)}
                className={`p-3 rounded-lg border text-sm transition-all text-left ${
                  mode === m.value ? 'border-indigo-500 bg-indigo-500/10 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-600'
                }`}>
                <div className="font-medium">{m.label}</div>
                <div className="text-xs text-gray-500">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button onClick={startSession} disabled={loading}
          className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors font-medium">
          {loading ? 'Connecting...' : 'Start Session →'}
        </button>
      </div>
    )
  }

  /* ── Confirming screen ── */
  if (step === 'confirming' && finalizeData) {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-xl border border-gray-800 bg-gray-900">
          <ScoreBar score={finalizeData.completeness_score} />
          {finalizeData.vague_areas.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              <p className="text-xs text-amber-400 font-medium mb-1.5">Areas that could use more detail:</p>
              <ul className="space-y-0.5">
                {finalizeData.vague_areas.map((a, i) => (
                  <li key={i} className="text-xs text-gray-400 flex gap-1.5">
                    <span className="text-amber-400 flex-shrink-0">•</span>{a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col h-[280px]">
          <div className="flex-1 overflow-y-auto space-y-3 p-3 rounded-t-xl bg-gray-900 border border-b-0 border-gray-800">
            {messages.slice(-6).map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {m.role === 'assistant'
                  ? <AlexAvatar size="sm" />
                  : <div className="w-6 h-6 rounded-full flex-shrink-0 bg-gray-700 flex items-center justify-center text-xs">👤</div>
                }
                <div className={`max-w-[85%] text-xs px-3 py-2 rounded-xl whitespace-pre-wrap ${
                  m.role === 'assistant' ? 'bg-gray-800 text-gray-200' : 'bg-indigo-600 text-white'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <AlexAvatar size="sm" />
                <div className="px-3 py-2 rounded-xl bg-gray-800 text-gray-400 text-xs animate-pulse">Alex is thinking…</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="flex gap-2 p-2 rounded-b-xl bg-gray-900 border border-t border-gray-800">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendInConfirming()}
              placeholder="Make a correction…"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
            <button onClick={handleSendInConfirming} disabled={loading || !input.trim()}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 transition-colors text-xs">↑</button>
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button onClick={() => setStep('chat')}
            className="flex-1 py-2.5 rounded-lg border border-gray-700 text-sm text-gray-400 hover:border-gray-600 hover:text-white transition-colors">
            ← Keep refining
          </button>
          <button onClick={handleConfirm} disabled={loading}
            className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors text-sm font-medium">
            {loading ? 'Running PM review…' : 'Confirm & PM Review →'}
          </button>
        </div>
      </div>
    )
  }

  /* ── Done screen ── */
  if (step === 'done' && confirmData) {
    const approved = confirmData.review_status === 'approved'
    return (
      <div className="space-y-4">
        <div className={`p-4 rounded-xl border ${approved ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">{approved ? '✅' : '⚠️'}</span>
            <div>
              <div className={`font-semibold ${approved ? 'text-emerald-400' : 'text-amber-400'}`}>
                PM Review — {approved ? 'Approved' : 'Needs Clarification'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">Feasibility score: {confirmData.feasibility_score}/100</div>
            </div>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">{confirmData.review_feedback}</p>
        </div>

        {confirmData.review_strengths.length > 0 && (
          <div className="p-3 rounded-lg bg-gray-900 border border-gray-800">
            <p className="text-xs text-emerald-400 font-medium uppercase tracking-wider mb-2">Strengths</p>
            <ul className="space-y-1">
              {confirmData.review_strengths.map((s, i) => (
                <li key={i} className="text-xs text-gray-400 flex gap-1.5"><span className="text-emerald-400">✓</span>{s}</li>
              ))}
            </ul>
          </div>
        )}

        {confirmData.review_gaps.length > 0 && (
          <div className="p-3 rounded-lg bg-gray-900 border border-amber-500/20">
            <p className="text-xs text-amber-400 font-medium uppercase tracking-wider mb-2">Open Questions</p>
            <ul className="space-y-1">
              {confirmData.review_gaps.map((g, i) => (
                <li key={i} className="text-xs text-gray-400 flex gap-1.5"><span className="text-amber-400">→</span>{g}</li>
              ))}
            </ul>
          </div>
        )}

        {confirmData.json_path && (
          <div className="space-y-1.5 text-xs text-gray-400">
            <div className="p-2.5 rounded-lg bg-gray-800 border border-gray-700 font-mono break-all">📄 {confirmData.markdown_path}</div>
            <div className="p-2.5 rounded-lg bg-gray-800 border border-gray-700 font-mono break-all">🔧 {confirmData.json_path}</div>
          </div>
        )}

        {/* Feedback */}
        {showFeedback
          ? <FeedbackForm sessionId={sessionId} onDone={() => setShowFeedback(false)} />
          : null
        }

        {/* Run agent CTA — only shown when embedded inside AgentDetail */}
        {onFinalize && confirmData && (
          <button
            onClick={() => onFinalize(confirmData)}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 transition-colors font-medium text-sm"
          >
            {agentName ? `Run ${agentName} with these requirements →` : 'Run agent with these requirements →'}
          </button>
        )}

        <button onClick={resetAll}
          className="w-full py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:border-gray-600 hover:text-white transition-colors">
          Start another session
        </button>
      </div>
    )
  }

  /* ── Chat screen ── */
  return (
    <div className="flex flex-col h-[500px]">
      {/* Alex header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-t-xl bg-gray-900 border border-b border-gray-800">
        <AlexAvatar />
        <div>
          <div className="text-xs font-semibold text-white leading-tight">Alex</div>
          <div className="text-xs text-gray-500 leading-tight">Business Analyst</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-gray-500">Online</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 p-4 bg-gray-900 border-x border-gray-800">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {m.role === 'assistant'
              ? <AlexAvatar />
              : <div className="w-7 h-7 rounded-full flex-shrink-0 bg-gray-700 flex items-center justify-center text-sm">👤</div>
            }
            <div className={`max-w-[80%] text-sm px-3 py-2 rounded-xl whitespace-pre-wrap ${
              m.role === 'assistant' ? 'bg-gray-800 text-gray-200' : 'bg-indigo-600 text-white'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <AlexAvatar />
            <div className="px-3 py-2 rounded-xl bg-gray-800 text-gray-400 text-sm">
              <span className="animate-pulse">Alex is thinking…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="text-xs text-red-400 px-4 py-2 bg-gray-900 border-x border-gray-800">{error}</p>}

      <div className="flex gap-2 p-3 rounded-b-xl bg-gray-900 border border-t border-gray-800">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Message Alex…"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        <button onClick={handleSend} disabled={loading || !input.trim()}
          className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 transition-colors text-sm">↑</button>
        <button onClick={handleFinalize} disabled={loading}
          className="px-3 py-2 rounded-lg border border-emerald-600 text-emerald-400 hover:bg-emerald-600/10 disabled:opacity-40 transition-colors text-xs">
          Finalize
        </button>
      </div>
    </div>
  )
}
