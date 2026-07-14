import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import CategoryBadge from '../components/CategoryBadge'
import { uploadArchive } from '../api/reqAgent'
import type { Category } from '../types'

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
  status: string
  archive_filename?: string
}

const STATUS_COLOR: Record<string, string> = {
  pending_review: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  approved:       'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  rejected:       'text-red-400 bg-red-400/10 border-red-400/20',
}

function UploadBox({ listing, onUploaded }: { listing: Listing; onUploaded: (filename: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const data = await uploadArchive(listing.listing_id, file)
      onUploaded(data.filename)
      setFile(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-800">
      <input
        ref={inputRef}
        type="file"
        accept=".tar,.tar.gz,.tgz"
        className="hidden"
        onChange={e => { setFile(e.target.files?.[0] ?? null); setError('') }}
      />

      {listing.archive_filename ? (
        /* Already has an archive */
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg flex-shrink-0">📦</span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-white truncate">{listing.archive_filename}</div>
              <div className="text-xs text-gray-500">Agent archive uploaded</div>
            </div>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            className="text-xs text-gray-500 hover:text-indigo-400 border border-gray-700 hover:border-indigo-500/50 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
          >
            Replace
          </button>
        </div>
      ) : (
        /* No archive yet */
        <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-gray-700 hover:border-indigo-500/50 transition-colors">
          <span className="text-xl flex-shrink-0">📦</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-400">
              {file ? (
                <span className="text-white font-medium">{file.name} <span className="text-gray-500 font-normal">({(file.size / 1024 / 1024).toFixed(2)} MB)</span></span>
              ) : (
                'No agent archive uploaded'
              )}
            </div>
            <div className="text-xs text-gray-600">.tar · .tar.gz · .tgz</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {file ? (
              <>
                <button
                  onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = '' }}
                  className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors font-medium"
                >
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
              </>
            ) : (
              <button
                onClick={() => inputRef.current?.click()}
                className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 hover:border-indigo-500 px-3 py-1.5 rounded-lg transition-colors"
              >
                + Select file
              </button>
            )}
          </div>
        </div>
      )}

      {/* Replace flow — show upload button when a replacement file is selected */}
      {listing.archive_filename && file && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-gray-400 flex-1 truncate">Replace with: {file.name}</span>
          <button onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = '' }} className="text-xs text-gray-500 hover:text-red-400 transition-colors">✕</button>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            {uploading ? 'Uploading…' : 'Confirm replace'}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  )
}

export default function MyListings() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('http://localhost:8002/listings')
      .then(r => r.json())
      .then(d => { setListings(d.listings); setLoading(false) })
      .catch(() => { setError('Could not load listings. Make sure the server is running.'); setLoading(false) })
  }, [])

  function handleUploaded(listingId: string, filename: string) {
    setListings(prev => prev.map(l =>
      l.listing_id === listingId ? { ...l, archive_filename: filename } : l
    ))
  }

  if (loading) return (
    <div className="max-w-5xl mx-auto px-6 py-20 text-center text-gray-500">
      <div className="animate-pulse text-3xl mb-3">⏳</div>
      Loading listings…
    </div>
  )

  if (error) return (
    <div className="max-w-5xl mx-auto px-6 py-20 text-center text-red-400">{error}</div>
  )

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-1">My Listings</h1>
          <p className="text-gray-400 text-sm">{listings.length} agent{listings.length !== 1 ? 's' : ''} submitted</p>
        </div>
        <Link
          to="/list"
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors text-sm font-medium"
        >
          + List new agent
        </Link>
      </div>

      {listings.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <div className="text-4xl mb-3">📭</div>
          <p className="mb-4">You haven't listed any agents yet.</p>
          <Link to="/list" className="text-indigo-400 hover:text-indigo-300">List your first agent →</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {listings.map(l => (
            <div key={l.listing_id} className="p-5 rounded-xl border border-gray-800 bg-gray-900 space-y-4">
              {/* Header row */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xl flex-shrink-0">🤖</div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-semibold text-white">{l.name}</h2>
                      <CategoryBadge category={l.category} />
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLOR[l.status] ?? STATUS_COLOR.pending_review}`}>
                        {l.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      by @{l.seller} · ID: <span className="font-mono">{l.listing_id}</span> · {new Date(l.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-lg font-bold text-white">${l.hourly_rate}<span className="text-sm text-gray-500 font-normal">/hr</span></div>
                  <div className="text-xs text-gray-500">~${(l.hourly_rate * l.avg_hours).toFixed(2)} avg task</div>
                </div>
              </div>

              <p className="text-sm text-gray-400 leading-relaxed">{l.description}</p>

              <div className="grid sm:grid-cols-2 gap-4">
                {l.use_cases.length > 0 && (
                  <div className="p-3 rounded-lg bg-gray-800/60 border border-gray-700">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Use cases</p>
                    <ul className="space-y-1">
                      {l.use_cases.map((uc, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                          <span className="text-indigo-400 mt-0.5 flex-shrink-0">→</span>{uc}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {l.requirements.length > 0 && (
                  <div className="p-3 rounded-lg bg-gray-800/60 border border-gray-700">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Buyer requirements</p>
                    <ul className="space-y-1">
                      {l.requirements.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                          <span className="text-emerald-400 mt-0.5 flex-shrink-0">✓</span>{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {l.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {l.tags.map(tag => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-400">{tag}</span>
                  ))}
                </div>
              )}

              {/* Archive upload — always visible */}
              <UploadBox
                listing={l}
                onUploaded={(filename) => handleUploaded(l.listing_id, filename)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
