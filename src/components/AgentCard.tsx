import { Link } from 'react-router-dom'
import type { Agent } from '../types'
import CategoryBadge from './CategoryBadge'

export function AgentCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-5 rounded-xl border border-gray-800 bg-gray-900 animate-pulse">
      <div className="flex items-start justify-between gap-2">
        <div className="w-10 h-10 rounded-lg bg-gray-800" />
        <div className="h-5 w-16 rounded-full bg-gray-800" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-3/4 rounded bg-gray-800" />
        <div className="h-3 w-full rounded bg-gray-800" />
        <div className="h-3 w-5/6 rounded bg-gray-800" />
      </div>
      <div className="flex gap-1 mt-auto">
        <div className="h-5 w-14 rounded bg-gray-800" />
        <div className="h-5 w-14 rounded bg-gray-800" />
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-gray-800">
        <div className="h-4 w-16 rounded bg-gray-800" />
        <div className="h-4 w-20 rounded bg-gray-800" />
      </div>
    </div>
  )
}

export default function AgentCard({ agent }: { agent: Agent }) {
  const total = (agent.hourly_rate * agent.avg_hours).toFixed(2)

  return (
    <Link
      to={`/marketplace/${agent.id}`}
      className="group relative flex flex-col gap-3 p-5 rounded-xl border border-gray-800 bg-gray-900 hover:border-indigo-500/50 hover:bg-gray-900/80 transition-all duration-200"
    >
      {agent.featured && (
        <div className="absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full bg-indigo-600 text-white font-medium">
          Featured
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xl">
          🤖
        </div>
        {!agent.featured && <CategoryBadge category={agent.category} />}
      </div>

      <div>
        <h3 className="font-semibold text-white group-hover:text-indigo-300 transition-colors line-clamp-1">
          {agent.name}
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">by @{agent.seller}</p>
        <p className="text-sm text-gray-400 mt-1.5 line-clamp-2">{agent.description}</p>
      </div>

      <div className="flex flex-wrap gap-1 mt-auto">
        {agent.tags.slice(0, 3).map(tag => (
          <span key={tag} className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-500">
            {tag}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-gray-800">
        <div className="flex items-center gap-1 text-sm text-yellow-400">
          {agent.rating > 0 ? (
            <>★ <span className="text-white font-medium">{agent.rating}</span>
            <span className="text-gray-500">({agent.reviews})</span></>
          ) : (
            <span className="text-gray-600 text-xs">No reviews yet</span>
          )}
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-white">${agent.hourly_rate}/hr</div>
          <div className="text-xs text-gray-500">~${total} avg</div>
        </div>
      </div>
    </Link>
  )
}
