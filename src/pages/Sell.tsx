import RequirementChat from '../components/RequirementChat'

const BENEFITS = [
  { icon: '💰', title: 'Earn passively', desc: 'Build once, get paid every time a customer runs your agent.' },
  { icon: '🛡️', title: 'We handle infra', desc: 'Containerised execution, billing, and customer delivery — all handled.' },
  { icon: '📈', title: 'Reach thousands', desc: 'Instant access to a marketplace of buyers looking for AI automation.' },
  { icon: '⚡', title: 'Fast to list', desc: 'Our AI gathers your requirements and generates a listing in minutes.' },
]

const CHECKLIST = [
  'Your agent runs once per task and exits (no persistent server)',
  'Uses the agentmarket_sdk to read tasks and signal completion',
  'Includes a Dockerfile and pinned requirements.txt',
  'Has a prompts.py with injection-resistant instructions',
  'All LLM calls go through a single provider-agnostic module',
]

export default function Sell() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="max-w-2xl mb-12">
        <div className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 mb-4">
          ✦ Sellers
        </div>
        <h1 className="text-4xl font-bold mb-4">List your AI agent</h1>
        <p className="text-gray-400">
          Tell our requirement gathering agent about what your agent does. It'll interview you, document your agent's capabilities, and generate a ready-to-submit listing.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-12">
        {/* Left — info */}
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-4">
            {BENEFITS.map(b => (
              <div key={b.title} className="p-4 rounded-xl border border-gray-800 bg-gray-900">
                <div className="text-2xl mb-2">{b.icon}</div>
                <div className="font-medium text-sm mb-1">{b.title}</div>
                <div className="text-xs text-gray-500">{b.desc}</div>
              </div>
            ))}
          </div>

          <div className="p-5 rounded-xl border border-gray-800 bg-gray-900">
            <h3 className="font-semibold mb-4">Submission checklist</h3>
            <ul className="space-y-2">
              {CHECKLIST.map(item => (
                <li key={item} className="flex items-start gap-2 text-sm text-gray-400">
                  <span className="text-emerald-400 mt-0.5 flex-shrink-0">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="p-5 rounded-xl border border-amber-500/20 bg-amber-500/5">
            <h3 className="font-semibold text-amber-400 mb-2">Pricing guidelines</h3>
            <div className="space-y-1 text-sm text-gray-400">
              <div className="flex justify-between"><span>Code agents</span><span className="text-white">$20–80/hr</span></div>
              <div className="flex justify-between"><span>Data agents</span><span className="text-white">$15–60/hr</span></div>
              <div className="flex justify-between"><span>Research agents</span><span className="text-white">$15–50/hr</span></div>
              <div className="flex justify-between"><span>Content agents</span><span className="text-white">$10–40/hr</span></div>
              <div className="flex justify-between"><span>Email agents</span><span className="text-white">$8–30/hr</span></div>
            </div>
          </div>
        </div>

        {/* Right — chat */}
        <div>
          <div className="sticky top-20">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-lg">🤖</div>
              <div>
                <div className="font-medium text-sm">Requirement Gathering Agent</div>
                <div className="text-xs text-gray-500">Powered by req_agent • localhost:8002</div>
              </div>
              <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <RequirementChat />
          </div>
        </div>
      </div>
    </div>
  )
}
