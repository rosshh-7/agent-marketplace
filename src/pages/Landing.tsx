import { Link } from 'react-router-dom'
import { agents, categoryMeta } from '../data/agents'
import AgentCard from '../components/AgentCard'

const STATS = [
  { value: '120+', label: 'AI Agents' },
  { value: '40+',  label: 'Verified Sellers' },
  { value: '5',    label: 'Categories' },
  { value: '98%',  label: 'Task Success Rate' },
]

const HOW_IT_WORKS = [
  { step: '01', title: 'Browse agents', desc: 'Filter by category, price, and rating to find the right agent for your task.' },
  { step: '02', title: 'Submit a task', desc: 'Describe your deliverable. The agent runs in a container and returns results in minutes.' },
  { step: '03', title: 'Get results', desc: 'Receive structured output — markdown, JSON, code, or files — ready to use.' },
]

export default function Landing() {
  const featured = agents.filter(a => a.featured)

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-gray-800">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-gray-950 to-gray-950" />
        <div className="relative max-w-7xl mx-auto px-6 py-28 text-center">
          <div className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 mb-6">
            ✦ AI-powered task automation marketplace
          </div>
          <h1 className="text-5xl md:text-6xl font-bold leading-tight tracking-tight mb-6">
            Buy & Sell{' '}
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
              AI Agents
            </span>
            <br />that do real work
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-10">
            A marketplace for specialised AI agents. Submit a task, get professional-grade output.
            Build once, sell to thousands.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link to="/marketplace" className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-medium transition-colors">
              Browse agents →
            </Link>
            <Link to="/sell" className="px-6 py-3 rounded-xl border border-gray-700 hover:border-gray-500 text-gray-300 transition-colors">
              List your agent
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-6">
          {STATS.map(s => (
            <div key={s.label} className="text-center">
              <div className="text-3xl font-bold text-white">{s.value}</div>
              <div className="text-sm text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold mb-2">Browse by category</h2>
        <p className="text-gray-400 mb-8">Agents for every kind of knowledge work.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.entries(categoryMeta).map(([key, meta]) => (
            <Link
              key={key}
              to={`/marketplace?category=${key}`}
              className="flex flex-col items-center gap-2 p-5 rounded-xl border border-gray-800 bg-gray-900 hover:border-indigo-500/50 transition-all group"
            >
              <span className="text-3xl">{meta.icon}</span>
              <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">{meta.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured agents */}
      <section className="max-w-7xl mx-auto px-6 pb-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold">Featured agents</h2>
            <p className="text-gray-400 mt-1">Top-rated agents trusted by thousands of users.</p>
          </div>
          <Link to="/marketplace" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
            View all →
          </Link>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {featured.map(agent => <AgentCard key={agent.id} agent={agent} />)}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-gray-800 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold mb-2 text-center">How it works</h2>
          <p className="text-gray-400 text-center mb-12">From task to output in minutes.</p>
          <div className="grid md:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map(h => (
              <div key={h.step} className="flex gap-4">
                <div className="text-4xl font-bold text-gray-800 select-none">{h.step}</div>
                <div>
                  <h3 className="font-semibold text-white mb-1">{h.title}</h3>
                  <p className="text-sm text-gray-400">{h.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to list your agent?</h2>
          <p className="text-gray-400 mb-8 max-w-xl mx-auto">
            Our AI requirement gathering agent helps you document and list your agent in minutes.
          </p>
          <Link to="/sell" className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-medium transition-colors">
            Start listing →
          </Link>
        </div>
      </section>
    </div>
  )
}
