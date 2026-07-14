import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { agents } from '../data/agents'
import CategoryBadge from '../components/CategoryBadge'
import RequirementChat from '../components/RequirementChat'
import { submitTask, getListing } from '../api/reqAgent'
import type { ConfirmResult } from '../api/reqAgent'
import type { Agent, Category } from '../types'

function AgentOutput({ text }: { text: string }) {
  const [copied, setCopied] = useState<number | null>(null)

  function copyCode(code: string, idx: number) {
    navigator.clipboard.writeText(code)
    setCopied(idx)
    setTimeout(() => setCopied(null), 1500)
  }

  // Split on fenced code blocks: ```lang\n...\n```
  const parts = text.split(/(```[\w]*\n[\s\S]*?```)/g)

  return (
    <div className="space-y-4 text-sm">
      {parts.map((part, idx) => {
        const fenceMatch = part.match(/^```([\w]*)\n([\s\S]*?)```$/)
        if (fenceMatch) {
          const lang = fenceMatch[1] || 'code'
          const code = fenceMatch[2].trimEnd()
          return (
            <div key={idx} className="rounded-lg border border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700">
                <span className="text-xs text-gray-400 font-mono">{lang}</span>
                <button
                  onClick={() => copyCode(code, idx)}
                  className="text-xs text-gray-500 hover:text-white transition-colors"
                >
                  {copied === idx ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <pre className="p-4 overflow-x-auto text-xs text-gray-200 font-mono leading-relaxed bg-gray-900">{code}</pre>
            </div>
          )
        }
        // Plain text — split on newlines and render paragraphs
        return part.trim() ? (
          <div key={idx} className="text-gray-300 leading-relaxed whitespace-pre-wrap">{part.trim()}</div>
        ) : null
      })}
    </div>
  )
}

const CATEGORY_TOPIC: Record<Category, string> = {
  code:     'api',
  data:     'general',
  content:  'general',
  research: 'general',
  email:    'general',
}

type Phase = 'info' | 'chat' | 'running' | 'result'

interface ExtendedAgent extends Agent {
  use_cases?: string[]
  buyer_requirements?: string[]
  is_listed?: boolean
}

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>()
  const [agent, setAgent] = useState<ExtendedAgent | null>(null)
  const [loading, setLoading] = useState(true)

  const [phase, setPhase] = useState<Phase>('info')
  const [taskResult, setTaskResult] = useState<{ task_id: string; output: string } | null>(null)
  const [taskError, setTaskError] = useState('')

  useEffect(() => {
    // Try static agents first
    const staticAgent = agents.find(a => a.id === id)
    if (staticAgent) {
      setAgent(staticAgent)
      setLoading(false)
      return
    }
    // Fall back to API listing
    getListing(id!).then(listing => {
      if (!listing || listing.status !== 'approved') {
        setAgent(null)
      } else {
        setAgent({
          id: listing.listing_id,
          name: listing.name,
          seller: listing.seller,
          category: listing.category as Category,
          description: listing.description,
          hourly_rate: listing.hourly_rate,
          avg_hours: listing.avg_hours,
          tags: listing.tags,
          rating: 0,
          reviews: 0,
          use_cases: listing.use_cases,
          buyer_requirements: listing.requirements,
          is_listed: true,
        })
      }
      setLoading(false)
    }).catch(() => { setAgent(null); setLoading(false) })
  }, [id])

  async function handleFinalize(result: ConfirmResult) {
    setPhase('running')
    setTaskError('')
    try {
      const data = await submitTask(agent!.id, agent!.name, agent!.category, result.requirements)
      setTaskResult({ task_id: data.task_id, output: data.output })
      setPhase('result')
    } catch {
      setTaskError('Failed to run the agent. Please try again.')
      setPhase('chat')
    }
  }

  if (loading) return (
    <div className="max-w-7xl mx-auto px-6 py-20 text-center text-gray-500 animate-pulse">Loading…</div>
  )

  if (!agent) return (
    <div className="max-w-7xl mx-auto px-6 py-20 text-center">
      <div className="text-4xl mb-4">🤖</div>
      <h2 className="text-xl font-semibold mb-2">Agent not found</h2>
      <Link to="/marketplace" className="text-indigo-400 hover:text-indigo-300">← Back to marketplace</Link>
    </div>
  )

  const totalCost = (agent.hourly_rate * agent.avg_hours).toFixed(2)

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <Link to="/marketplace" className="text-sm text-gray-500 hover:text-gray-300 transition-colors mb-8 inline-block">
        ← Back to marketplace
      </Link>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-3xl flex-shrink-0">
              🤖
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{agent.name}</h1>
                <CategoryBadge category={agent.category} />
                {agent.is_listed && (
                  <span className="text-xs px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                    Community listed
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                {agent.rating > 0 && <span className="text-yellow-400">★ {agent.rating}</span>}
                {agent.reviews > 0 && <span>({agent.reviews} reviews)</span>}
                <span>by <span className="text-indigo-400">@{agent.seller}</span></span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-xl border border-gray-800 bg-gray-900">
            <h2 className="font-semibold mb-3">About this agent</h2>
            <p className="text-gray-400 text-sm leading-relaxed">{agent.description}</p>
          </div>

          {/* Use cases (dynamic listings) */}
          {agent.use_cases && agent.use_cases.length > 0 && (
            <div className="p-5 rounded-xl border border-gray-800 bg-gray-900">
              <h2 className="font-semibold mb-3">Use cases</h2>
              <ul className="space-y-2">
                {agent.use_cases.map((uc, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                    <span className="text-indigo-400 mt-0.5 flex-shrink-0">→</span>{uc}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="p-5 rounded-xl border border-gray-800 bg-gray-900">
            <h2 className="font-semibold mb-3">What you get</h2>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-center gap-2">✓ <span>Structured output in your requested format</span></li>
              <li className="flex items-center gap-2">✓ <span>Runs in an isolated container — no data leakage</span></li>
              <li className="flex items-center gap-2">✓ <span>Results delivered in under {Math.ceil(agent.avg_hours * 60)} minutes</span></li>
              <li className="flex items-center gap-2">✓ <span>Full task transcript and logs included</span></li>
            </ul>
          </div>

          {/* Buyer requirements (dynamic listings) */}
          {agent.buyer_requirements && agent.buyer_requirements.length > 0 && (
            <div className="p-5 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <h2 className="font-semibold text-amber-400 mb-3">What to prepare</h2>
              <ul className="space-y-2">
                {agent.buyer_requirements.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                    <span className="text-emerald-400 mt-0.5 flex-shrink-0">✓</span>{r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="p-5 rounded-xl border border-gray-800 bg-gray-900">
            <h2 className="font-semibold mb-3">Tags</h2>
            <div className="flex flex-wrap gap-2">
              {agent.tags.map(tag => (
                <span key={tag} className="text-xs px-3 py-1 rounded-full bg-gray-800 border border-gray-700 text-gray-400">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Task pipeline */}
          {phase === 'chat' && (
            <div className="rounded-xl border border-indigo-500/30 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-indigo-500/10 border-b border-indigo-500/20">
                <span className="text-lg">🤖</span>
                <div>
                  <div className="text-sm font-medium">Describe your task</div>
                  <div className="text-xs text-gray-400">Our agent will gather your requirements, then run {agent.name}</div>
                </div>
                <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              {taskError && (
                <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-sm text-red-400">{taskError}</div>
              )}
              <div className="p-4 bg-gray-900">
                <RequirementChat
                  presetTopic={CATEGORY_TOPIC[agent.category]}
                  presetMode="conversation"
                  onFinalize={handleFinalize}
                  agentName={agent.name}
                />
              </div>
            </div>
          )}

          {phase === 'running' && (
            <div className="p-8 rounded-xl border border-indigo-500/20 bg-indigo-500/5 flex flex-col items-center gap-4">
              <div className="text-3xl animate-pulse">⚙️</div>
              <div className="font-medium text-indigo-300">Running {agent.name}…</div>
              <div className="text-sm text-gray-400">Processing your requirements and generating output</div>
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
            </div>
          )}

          {phase === 'result' && taskResult && (
            <div className="rounded-xl border border-emerald-500/30 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-emerald-500/10 border-b border-emerald-500/20">
                <span className="text-lg">✅</span>
                <div>
                  <div className="text-sm font-medium text-emerald-400">Task completed</div>
                  <div className="text-xs text-gray-400">Task ID: {taskResult.task_id} · {agent.name}</div>
                </div>
                <button
                  onClick={() => { setPhase('chat'); setTaskResult(null) }}
                  className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Run again
                </button>
              </div>
              <div className="p-5 bg-gray-900">
                <AgentOutput text={taskResult.output} />
              </div>
            </div>
          )}
        </div>

        {/* Pricing card */}
        <div className="space-y-4">
          <div className="p-6 rounded-xl border border-gray-800 bg-gray-900 sticky top-20">
            <div className="text-3xl font-bold text-white">
              ${agent.hourly_rate}<span className="text-lg text-gray-500 font-normal">/hr</span>
            </div>
            <div className="text-sm text-gray-400 mt-1">
              Average task: ~{agent.avg_hours}h = <span className="text-white font-medium">${totalCost}</span>
            </div>

            <div className="border-t border-gray-800 my-5" />

            <div className="space-y-2 text-sm mb-6">
              <div className="flex justify-between text-gray-400">
                <span>Rate</span><span className="text-white">${agent.hourly_rate}/hr</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Avg. hours</span><span className="text-white">{agent.avg_hours}h</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-gray-300">Estimated cost</span><span className="text-white">${totalCost}</span>
              </div>
            </div>

            {phase === 'info' && (
              <button
                onClick={() => setPhase('chat')}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 transition-colors font-medium text-sm"
              >
                Submit a task →
              </button>
            )}
            {phase === 'chat' && (
              <button
                onClick={() => setPhase('info')}
                className="w-full py-3 rounded-xl border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white transition-colors text-sm"
              >
                Cancel
              </button>
            )}
            {phase === 'running' && (
              <button disabled className="w-full py-3 rounded-xl bg-indigo-600 opacity-50 text-sm font-medium">
                Running…
              </button>
            )}
            {phase === 'result' && (
              <button
                onClick={() => setPhase('chat')}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 transition-colors font-medium text-sm"
              >
                Run again →
              </button>
            )}

            <p className="text-xs text-gray-500 text-center mt-3">Billed only for actual usage</p>

            <div className="border-t border-gray-800 mt-5 pt-4 space-y-2 text-xs text-gray-500">
              <div className="flex items-center gap-2">🔒 Secure containerised execution</div>
              <div className="flex items-center gap-2">⚡ Results in minutes</div>
              <div className="flex items-center gap-2">💬 Task support included</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
