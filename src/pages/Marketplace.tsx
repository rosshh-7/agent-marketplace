import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { agents, categoryMeta } from '../data/agents'
import AgentCard, { AgentCardSkeleton } from '../components/AgentCard'
import { getApprovedListings } from '../api/reqAgent'
import type { Agent, Category } from '../types'

const SORT_OPTIONS = [
  { value: 'rating',   label: 'Top rated' },
  { value: 'price_lo', label: 'Price: low to high' },
  { value: 'price_hi', label: 'Price: high to low' },
  { value: 'reviews',  label: 'Most reviewed' },
]

export default function Marketplace() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('rating')
  const [listedAgents, setListedAgents] = useState<Agent[]>([])
  const [loadingListings, setLoadingListings] = useState(true)

  const activeCategory = searchParams.get('category') as Category | null

  useEffect(() => {
    getApprovedListings().then(listings => {
      setListedAgents(listings.map(l => ({
        id: l.listing_id,
        name: l.name,
        seller: l.seller,
        category: l.category as Category,
        description: l.description,
        hourly_rate: l.hourly_rate,
        avg_hours: l.avg_hours,
        tags: l.tags,
        rating: 0,
        reviews: 0,
        featured: false,
      })))
    }).catch(() => {}).finally(() => setLoadingListings(false))
  }, [])

  const allAgents = useMemo(() => [...agents, ...listedAgents], [listedAgents])

  const setCategory = (cat: Category | null) => {
    if (cat) setSearchParams({ category: cat })
    else setSearchParams({})
  }

  const filtered = useMemo(() => {
    let list = [...allAgents]
    if (activeCategory) list = list.filter(a => a.category === activeCategory)
    if (search) list = list.filter(a =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase()) ||
      a.tags.some(t => t.includes(search.toLowerCase()))
    )
    if (sort === 'rating')   list.sort((a, b) => b.rating - a.rating)
    if (sort === 'reviews')  list.sort((a, b) => b.reviews - a.reviews)
    if (sort === 'price_lo') list.sort((a, b) => a.hourly_rate - b.hourly_rate)
    if (sort === 'price_hi') list.sort((a, b) => b.hourly_rate - a.hourly_rate)
    return list
  }, [allAgents, activeCategory, search, sort])

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-1">Agent Marketplace</h1>
      <p className="text-gray-400 mb-8">
        Browse {allAgents.length} AI agents across {Object.keys(categoryMeta).length} categories.
        {listedAgents.length > 0 && (
          <span className="ml-2 text-xs px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            +{listedAgents.length} new
          </span>
        )}
      </p>

      {/* Filters bar */}
      <div className="flex flex-wrap gap-3 mb-8">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search agents..."
          className="flex-1 min-w-48 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-indigo-500"
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-8">
        <button
          onClick={() => setCategory(null)}
          className={`px-4 py-1.5 rounded-full text-sm border transition-all ${
            !activeCategory ? 'border-indigo-500 bg-indigo-500/10 text-white' : 'border-gray-800 text-gray-400 hover:border-gray-600'
          }`}
        >
          All
        </button>
        {Object.entries(categoryMeta).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => setCategory(key as Category)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm border transition-all ${
              activeCategory === key ? 'border-indigo-500 bg-indigo-500/10 text-white' : 'border-gray-800 text-gray-400 hover:border-gray-600'
            }`}
          >
            {meta.icon} {meta.label}
          </button>
        ))}
      </div>

      {/* Active filters summary + clear */}
      {(search || activeCategory) && (
        <div className="flex items-center gap-3 mb-4 text-sm">
          <span className="text-gray-500">Filtering by:</span>
          {activeCategory && <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300">{activeCategory}</span>}
          {search && <span className="px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-300">"{search}"</span>}
          <button
            onClick={() => { setSearch(''); setSearchParams({}) }}
            className="ml-auto text-xs text-gray-500 hover:text-white transition-colors underline underline-offset-2"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Results */}
      {loadingListings ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <AgentCardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <div className="text-4xl mb-3">🔍</div>
          <p>No agents match your search.</p>
          <button onClick={() => { setSearch(''); setSearchParams({}) }} className="mt-4 text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-4">{filtered.length} agent{filtered.length !== 1 ? 's' : ''} found</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(agent => (
              <div key={agent.id} className="relative">
                {listedAgents.some(l => l.id === agent.id) && (
                  <div className="absolute -top-2 -right-2 z-10 text-xs px-2 py-0.5 rounded-full bg-emerald-500 text-white font-medium shadow">
                    New
                  </div>
                )}
                <AgentCard agent={agent} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
