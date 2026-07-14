import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { createListing, uploadArchive } from '../api/reqAgent'
import CategoryBadge from '../components/CategoryBadge'
import type { Category } from '../types'

const CATEGORIES: { value: Category; label: string; icon: string }[] = [
  { value: 'code',     label: 'Code',     icon: '⚙️' },
  { value: 'data',     label: 'Data',     icon: '📊' },
  { value: 'content',  label: 'Content',  icon: '✍️' },
  { value: 'research', label: 'Research', icon: '🔬' },
  { value: 'email',    label: 'Email',    icon: '📧' },
]

const STEPS = ['Basic Info', 'Functionality', 'Requirements', 'Upload', 'Pricing']

interface Form {
  name: string
  seller: string
  category: Category
  description: string
  use_cases: string[]
  requirements: string[]
  tags: string[]
  hourly_rate: string
  avg_hours: string
}

const EMPTY: Form = {
  name: '', seller: '', category: 'code',
  description: '', use_cases: [''], requirements: [''],
  tags: [''], hourly_rate: '', avg_hours: '',
}

function addItem(arr: string[]) { return [...arr, ''] }
function updateItem(arr: string[], i: number, v: string) { return arr.map((x, j) => j === i ? v : x) }
function removeItem(arr: string[], i: number) { return arr.filter((_, j) => j !== i) }
function clean(arr: string[]) { return arr.map(s => s.trim()).filter(Boolean) }

export default function ListAgent() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<Form>(EMPTY)
  const [archiveFile, setArchiveFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState('')
  const [result, setResult] = useState<{ listing_id: string; name: string } | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const set = (field: keyof Form, value: unknown) => setForm(f => ({ ...f, [field]: value }))

  function canAdvance() {
    if (step === 0) return form.name.trim() && form.seller.trim()
    if (step === 1) return form.description.trim() && clean(form.use_cases).length > 0
    if (step === 2) return clean(form.requirements).length > 0
    if (step === 3) return true           // upload is optional
    if (step === 4) return Number(form.hourly_rate) > 0 && Number(form.avg_hours) > 0
    return true
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      setSubmitStatus('Creating listing…')
      const data = await createListing({
        name: form.name.trim(),
        seller: form.seller.trim(),
        category: form.category,
        description: form.description.trim(),
        use_cases: clean(form.use_cases),
        requirements: clean(form.requirements),
        tags: clean(form.tags),
        hourly_rate: Number(form.hourly_rate),
        avg_hours: Number(form.avg_hours),
      })
      if (archiveFile) {
        setSubmitStatus('Uploading archive…')
        await uploadArchive(data.listing_id, archiveFile)
      }
      setResult({ listing_id: data.listing_id, name: data.name })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit listing.')
    } finally {
      setSubmitting(false)
      setSubmitStatus('')
    }
  }

  if (result) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold mb-2">Listing submitted!</h1>
        <p className="text-gray-400 mb-2">Your agent <span className="text-white font-medium">{result.name}</span> is pending review.</p>
        {archiveFile && <p className="text-xs text-emerald-400 mb-1">📦 Archive uploaded: {archiveFile.name}</p>}
        <p className="text-xs text-gray-500 mb-8">Listing ID: <span className="font-mono text-gray-400">{result.listing_id}</span></p>
        <div className="flex gap-3 justify-center">
          <Link to="/my-listings" className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 transition-colors text-sm font-medium">
            View my listings →
          </Link>
          <button
            onClick={() => { setForm(EMPTY); setStep(0); setResult(null) }}
            className="px-5 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white transition-colors text-sm"
          >
            List another agent
          </button>
        </div>
      </div>
    )
  }

  const previewRate = Number(form.hourly_rate) || 0
  const previewHours = Number(form.avg_hours) || 0
  const previewTotal = (previewRate * previewHours).toFixed(2)

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 mb-4">
          ✦ List your agent
        </div>
        <h1 className="text-3xl font-bold mb-2">Create a listing</h1>
        <p className="text-gray-400">Fill in your agent's details and we'll publish it to the marketplace.</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-10">
        {/* Form — 3 cols */}
        <div className="lg:col-span-3 space-y-8">

          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <button
                  onClick={() => i < step && setStep(i)}
                  className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border transition-all ${
                    i === step
                      ? 'border-indigo-500 bg-indigo-500/10 text-white'
                      : i < step
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 cursor-pointer hover:bg-emerald-500/20'
                      : 'border-gray-800 text-gray-600'
                  }`}
                >
                  {i < step ? '��' : i + 1} {label}
                </button>
                {i < STEPS.length - 1 && <div className={`h-px w-4 ${i < step ? 'bg-emerald-500/40' : 'bg-gray-800'}`} />}
              </div>
            ))}
          </div>

          {/* Step 0 — Basic Info */}
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold">Basic information</h2>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Agent name <span className="text-red-400">*</span></label>
                <input
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="e.g. Sales CSV Analyser"
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Your seller handle <span className="text-red-400">*</span></label>
                <div className="flex">
                  <span className="flex items-center px-3 rounded-l-lg bg-gray-800 border border-r-0 border-gray-700 text-gray-500 text-sm">@</span>
                  <input
                    value={form.seller}
                    onChange={e => set('seller', e.target.value)}
                    placeholder="yourhandle"
                    className="flex-1 bg-gray-900 border border-gray-800 rounded-r-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Category <span className="text-red-400">*</span></label>
                <div className="grid grid-cols-5 gap-2">
                  {CATEGORIES.map(c => (
                    <button
                      key={c.value}
                      onClick={() => set('category', c.value)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs transition-all ${
                        form.category === c.value
                          ? 'border-indigo-500 bg-indigo-500/10 text-white'
                          : 'border-gray-800 text-gray-400 hover:border-gray-700'
                      }`}
                    >
                      <span className="text-xl">{c.icon}</span>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 1 — Functionality */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold">Functionality & use cases</h2>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">What does your agent do? <span className="text-red-400">*</span></label>
                <textarea
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  rows={4}
                  placeholder="Describe what your agent does, what problem it solves, and what kind of output it produces..."
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Use cases <span className="text-red-400">*</span></label>
                <p className="text-xs text-gray-500 mb-2">List specific tasks or scenarios your agent handles well.</p>
                <div className="space-y-2">
                  {form.use_cases.map((uc, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="flex items-center text-xs text-gray-600 w-5 flex-shrink-0">{i + 1}.</span>
                      <input
                        value={uc}
                        onChange={e => set('use_cases', updateItem(form.use_cases, i, e.target.value))}
                        placeholder={`Use case ${i + 1}`}
                        className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                      />
                      {form.use_cases.length > 1 && (
                        <button onClick={() => set('use_cases', removeItem(form.use_cases, i))} className="text-gray-600 hover:text-red-400 text-sm px-1">✕</button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => set('use_cases', addItem(form.use_cases))}
                  className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  + Add use case
                </button>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Tags</label>
                <p className="text-xs text-gray-500 mb-2">Keywords buyers use to find agents like yours.</p>
                <div className="space-y-2">
                  {form.tags.map((tag, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        value={tag}
                        onChange={e => set('tags', updateItem(form.tags, i, e.target.value))}
                        placeholder={`e.g. csv, python, reports`}
                        className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                      />
                      {form.tags.length > 1 && (
                        <button onClick={() => set('tags', removeItem(form.tags, i))} className="text-gray-600 hover:text-red-400 text-sm px-1">✕</button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => set('tags', addItem(form.tags))}
                  className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  + Add tag
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — Requirements */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold">Requirements for best outcome</h2>
              <p className="text-sm text-gray-400">Tell buyers exactly what they need to provide so your agent delivers great results.</p>

              <div className="space-y-2">
                {form.requirements.map((req, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="flex items-center text-xs text-emerald-500 w-5 flex-shrink-0">✓</span>
                    <input
                      value={req}
                      onChange={e => set('requirements', updateItem(form.requirements, i, e.target.value))}
                      placeholder={`e.g. CSV file with headers on row 1`}
                      className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                    />
                    {form.requirements.length > 1 && (
                      <button onClick={() => set('requirements', removeItem(form.requirements, i))} className="text-gray-600 hover:text-red-400 text-sm px-1">✕</button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => set('requirements', addItem(form.requirements))}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                + Add requirement
              </button>

              <div className="p-4 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs text-gray-400 space-y-1">
                <div className="text-amber-400 font-medium mb-2">Tips for good requirements</div>
                <div>• Be specific — "a CSV with columns: date, amount, category"</div>
                <div>• Mention file formats — JSON, CSV, PDF, URL</div>
                <div>• State any API keys the buyer must supply</div>
                <div>• Call out edge cases your agent doesn't handle</div>
              </div>
            </div>
          )}

          {/* Step 3 — Upload */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold">Upload agent archive</h2>
              <p className="text-sm text-gray-400">
                Upload a <code className="text-indigo-400 bg-indigo-400/10 px-1.5 py-0.5 rounded">.tar.gz</code> or <code className="text-indigo-400 bg-indigo-400/10 px-1.5 py-0.5 rounded">.tgz</code> of your agent. This step is optional — you can upload later.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".tar,.tar.gz,.tgz"
                className="hidden"
                onChange={e => setArchiveFile(e.target.files?.[0] ?? null)}
              />

              {!archiveFile ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-dashed border-gray-700 hover:border-indigo-500 hover:bg-indigo-500/5 transition-all group"
                >
                  <span className="text-3xl">📦</span>
                  <div className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
                    Click to select your agent archive
                  </div>
                  <div className="text-xs text-gray-600">.tar · .tar.gz · .tgz</div>
                </button>
              ) : (
                <div className="flex items-center gap-4 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                  <span className="text-2xl">📦</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{archiveFile.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {(archiveFile.size / 1024 / 1024).toFixed(2)} MB · ready to upload
                    </div>
                  </div>
                  <button
                    onClick={() => { setArchiveFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    className="text-gray-500 hover:text-red-400 transition-colors text-sm flex-shrink-0"
                  >
                    ✕ Remove
                  </button>
                </div>
              )}

              <div className="p-4 rounded-lg border border-gray-800 bg-gray-900 text-xs text-gray-500 space-y-1.5">
                <div className="text-gray-400 font-medium mb-1">What to include in your archive</div>
                <div className="flex items-start gap-2"><span className="text-emerald-400">✓</span> <span><code>agent.py</code> — main entry point</span></div>
                <div className="flex items-start gap-2"><span className="text-emerald-400">✓</span> <span><code>Dockerfile</code> with pinned base image</span></div>
                <div className="flex items-start gap-2"><span className="text-emerald-400">✓</span> <span><code>requirements.txt</code> with pinned versions</span></div>
                <div className="flex items-start gap-2"><span className="text-emerald-400">✓</span> <span><code>prompts.py</code> with injection-resistant instructions</span></div>
                <div className="flex items-start gap-2"><span className="text-gray-600">–</span> <span>No <code>.env</code>, no secrets, no <code>.git</code> folder</span></div>
              </div>
            </div>
          )}

          {/* Step 4 — Pricing */}
          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold">Pricing</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Hourly rate (USD) <span className="text-red-400">*</span></label>
                  <div className="flex">
                    <span className="flex items-center px-3 rounded-l-lg bg-gray-800 border border-r-0 border-gray-700 text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      min="1"
                      value={form.hourly_rate}
                      onChange={e => set('hourly_rate', e.target.value)}
                      placeholder="25"
                      className="flex-1 bg-gray-900 border border-gray-800 rounded-r-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Avg. task hours <span className="text-red-400">*</span></label>
                  <div className="flex">
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={form.avg_hours}
                      onChange={e => set('avg_hours', e.target.value)}
                      placeholder="0.5"
                      className="flex-1 bg-gray-900 border border-gray-800 rounded-l-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                    />
                    <span className="flex items-center px-3 rounded-r-lg bg-gray-800 border border-l-0 border-gray-700 text-gray-500 text-sm">hr</span>
                  </div>
                </div>
              </div>

              {previewRate > 0 && previewHours > 0 && (
                <div className="p-4 rounded-lg border border-indigo-500/20 bg-indigo-500/5 text-sm">
                  <div className="text-gray-400">Buyers see: <span className="text-white font-semibold">${previewRate}/hr</span> · avg task ≈ <span className="text-white font-semibold">${previewTotal}</span></div>
                </div>
              )}

              <div className="p-4 rounded-lg border border-gray-800 bg-gray-900 text-xs text-gray-500 space-y-1">
                <div className="text-gray-400 font-medium mb-2">Pricing guidelines</div>
                <div className="flex justify-between"><span>Code / API agents</span><span className="text-gray-300">$20–80/hr</span></div>
                <div className="flex justify-between"><span>Data agents</span><span className="text-gray-300">$15–60/hr</span></div>
                <div className="flex justify-between"><span>Research agents</span><span className="text-gray-300">$15–50/hr</span></div>
                <div className="flex justify-between"><span>Content agents</span><span className="text-gray-300">$10–40/hr</span></div>
                <div className="flex justify-between"><span>Email agents</span><span className="text-gray-300">$8–30/hr</span></div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 pt-2">
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="px-5 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white transition-colors text-sm"
              >
                ← Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canAdvance()}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canAdvance() || submitting}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {submitting ? (submitStatus || 'Submitting…') : 'Submit listing →'}
              </button>
            )}
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        {/* Live preview — 2 cols */}
        <div className="lg:col-span-2">
          <div className="sticky top-20 space-y-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Live preview</p>

            {/* Card preview */}
            <div className="p-5 rounded-xl border border-gray-800 bg-gray-900 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xl flex-shrink-0">🤖</div>
                <CategoryBadge category={form.category} />
              </div>
              <div>
                <h3 className="font-semibold text-white">{form.name || <span className="text-gray-600">Agent name</span>}</h3>
                <p className="text-sm text-gray-400 mt-1 line-clamp-2">{form.description || <span className="text-gray-600">Description will appear here…</span>}</p>
              </div>
              {clean(form.tags).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {clean(form.tags).slice(0, 3).map(tag => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-500">{tag}</span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                <div className="text-sm text-gray-500">by <span className="text-indigo-400">@{form.seller || 'yourhandle'}</span></div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-white">{previewRate ? `$${previewRate}/hr` : '—'}</div>
                  {previewTotal !== '0.00' && <div className="text-xs text-gray-500">~${previewTotal} avg</div>}
                </div>
              </div>
            </div>

            {/* Use cases preview */}
            {clean(form.use_cases).length > 0 && (
              <div className="p-4 rounded-xl border border-gray-800 bg-gray-900">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Use cases</p>
                <ul className="space-y-1.5">
                  {clean(form.use_cases).map((uc, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                      <span className="text-indigo-400 mt-0.5 flex-shrink-0">→</span>{uc}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Requirements preview */}
            {clean(form.requirements).length > 0 && (
              <div className="p-4 rounded-xl border border-gray-800 bg-gray-900">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Buyer requirements</p>
                <ul className="space-y-1.5">
                  {clean(form.requirements).map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                      <span className="text-emerald-400 mt-0.5 flex-shrink-0">✓</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
