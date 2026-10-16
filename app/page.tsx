'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePrediction, checkBackendHealth } from '@/lib/usePrediction'
import { fetchSettings, saveSettings, fetchHistory, saveHistoryRow, clearHistory, type HistoryRow as DBHistoryRow, type AppSettings } from '@/lib/api'
import {
  Activity, Brain, Camera, ChevronLeft,
  Download, FileImage, LayoutDashboard, Menu, RefreshCw,
  Settings, Shield, Trash2, Upload, Users, Video, Zap
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
type Status = 'Normal' | 'Crowded' | 'Critical'
type Zone = { id: number; name: string; capacity: number; warning: number; critical: number }

const initialZones: Zone[] = [
  { id: 1, name: 'Main Entrance',  capacity: 200, warning: 70, critical: 90 },
  { id: 2, name: 'Auditorium',     capacity: 500, warning: 60, critical: 90 },
  { id: 3, name: 'Food Court',     capacity: 200, warning: 60, critical: 90 },
  { id: 4, name: 'Exit Corridor',  capacity: 150, warning: 70, critical: 90 },
]

function getStatus(count: number, capacity: number, warning = 70, critical = 90): Status {
  if (!capacity || count < 0) return 'Normal'
  const pct = (count / capacity) * 100
  if (pct >= critical || count >= capacity) return 'Critical'
  if (pct >= warning) return 'Crowded'
  return 'Normal'
}

function statusStyle(s: Status) {
  return s === 'Critical' ? 'bg-red-50 text-red-700 border-red-200'
       : s === 'Crowded'  ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold', statusStyle(status))}>
      <span className="size-1.5 rounded-full bg-current" />{status}
    </span>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ page, setPage, collapsed, setCollapsed }: {
  page: string; setPage: (p: string) => void
  collapsed: boolean; setCollapsed: (v: boolean) => void
}) {
  const items = [
    { label: 'Dashboard',      icon: LayoutDashboard },
    { label: 'Crowd Analysis', icon: Activity },
    { label: 'Settings',       icon: Settings },
  ]
  return (
    <aside className={cn('fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-slate-200 bg-white transition-all lg:flex', collapsed ? 'w-[76px]' : 'w-[240px]')}>
      {/* Logo */}
      <div className={cn('flex h-[72px] items-center border-b border-slate-100 px-5', collapsed ? 'justify-center px-0' : 'gap-3')}>
        <div className="flex size-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
          <Users className="size-5" />
        </div>
        {!collapsed && (
          <div>
            <div className="text-[17px] font-bold tracking-tight text-slate-900">Crowd<span className="text-blue-600">Sense</span></div>
            <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400">AI Crowd Monitoring</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 px-3 py-6">
        {items.map(({ label, icon: Icon }) => (
          <button
            key={label}
            onClick={() => setPage(label)}
            title={collapsed ? label : undefined}
            className={cn(
              'flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              collapsed ? 'justify-center' : 'gap-3',
              page === label ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            )}
          >
            <Icon className="size-[18px]" />
            {!collapsed && <span>{label}</span>}
          </button>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="m-3 flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-400 hover:bg-slate-50"
      >
        <ChevronLeft className={cn('size-4 transition-transform', collapsed && 'rotate-180')} />
      </button>
    </aside>
  )
}

// ── Topbar ────────────────────────────────────────────────────────────────────
function Topbar({ page, setMobileOpen }: { page: string; setMobileOpen: (v: boolean) => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur lg:px-8">
      <div className="flex items-center gap-3">
        <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden">
          <Menu className="size-5" />
        </button>
        <div>
          <div className="text-[11px] font-medium text-slate-400">CrowdSense / <span className="text-slate-600">{page}</span></div>
          <h1 className="text-lg font-bold text-slate-900">{page}</h1>
        </div>
      </div>
    </header>
  )
}

// ── Dashboard (About page) ────────────────────────────────────────────────────
function Dashboard({ setPage }: { setPage: (p: string) => void }) {
  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 p-8 text-white">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium">
          <span className="size-1.5 rounded-full bg-emerald-400" /> AI-Powered Crowd Intelligence
        </div>
        <h2 className="text-3xl font-bold tracking-tight">CrowdSense</h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-blue-100">
          An AI crowd monitoring system that uses computer vision to count people in images and assess crowd density in real time.
          Upload any crowd photo to instantly get a head count, occupancy percentage, and crowd status.
        </p>
        <button
          onClick={() => setPage('Crowd Analysis')}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 shadow hover:bg-blue-50 transition"
        >
          <Activity className="size-4" /> Start analysing
        </button>
      </div>

      {/* How it works */}
      <section>
        <h2 className="mb-1 text-lg font-bold text-slate-900">How it works</h2>
        <p className="mb-5 text-sm text-slate-500">Three simple steps from image to crowd insight.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              step: '01',
              icon: Upload,
              title: 'Upload an image',
              desc: 'Drag and drop or browse any crowd photo — JPG, PNG, or WebP up to 50 MB.',
              color: 'bg-blue-50 text-blue-600',
            },
            {
              step: '02',
              icon: Brain,
              title: 'AI analyses heads',
              desc: 'The PET (Point Query Transformer) model detects every person in the image using a quadtree-based point query approach.',
              color: 'bg-violet-50 text-violet-600',
            },
            {
              step: '03',
              icon: Shield,
              title: 'Get crowd status',
              desc: 'Instantly see the head count, occupancy percentage, and whether the zone is Normal, Crowded, or Critical.',
              color: 'bg-emerald-50 text-emerald-600',
            },
          ].map(({ step, icon: Icon, title, desc, color }) => (
            <div key={step} className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.03)]">
              <div className="mb-4 flex items-center gap-3">
                <div className={cn('flex size-10 items-center justify-center rounded-lg', color)}>
                  <Icon className="size-5" />
                </div>
                <span className="text-[11px] font-bold tracking-widest text-slate-300">{step}</span>
              </div>
              <h3 className="text-sm font-bold text-slate-900">{title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tech stack */}
      <section>
        <h2 className="mb-1 text-lg font-bold text-slate-900">Technology</h2>
        <p className="mb-5 text-sm text-slate-500">What powers CrowdSense under the hood.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { label: 'AI Model',   value: 'PET — Point Query Transformer (VGG-16 BN backbone)',    icon: Brain  },
            { label: 'Dataset',    value: 'ShanghaiTech — trained 100 epochs, MAE 64.7',            icon: Camera },
            { label: 'Backend',    value: 'Python · FastAPI · Uvicorn — port 8000',              icon: Zap    },
            { label: 'Frontend',   value: 'Next.js 16 · React 19 · Tailwind CSS — port 3000',   icon: Activity },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <Icon className="size-4" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
                <div className="mt-0.5 text-sm text-slate-700">{value}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick start */}
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-900">Quick start</h2>
        <ol className="flex flex-col gap-2 text-sm text-slate-600">
          <li className="flex items-start gap-2"><span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">1</span>Start the backend: <code className="rounded bg-white px-1.5 py-0.5 text-xs border border-slate-200">.\start-backend.ps1</code></li>
          <li className="flex items-start gap-2"><span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">2</span>Start the frontend: <code className="rounded bg-white px-1.5 py-0.5 text-xs border border-slate-200">npm run dev</code></li>
          <li className="flex items-start gap-2"><span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">3</span>Go to <button onClick={() => setPage('Crowd Analysis')} className="text-blue-600 underline underline-offset-2">Crowd Analysis</button> and upload an image.</li>
        </ol>
      </section>
    </div>
  )
}

// ── Image preview with aligned dot overlays ──────────────────────────────────
function ImagePreview({ preview, points, loading, done }: {
  preview: string | null
  points: { x: number; y: number }[]
  loading: boolean
  done: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef       = useRef<HTMLImageElement>(null)
  const [imgRect, setImgRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  // Measure the actual rendered image bounds inside the container
  const measureImage = useCallback(() => {
    const container = containerRef.current
    const img       = imgRef.current
    if (!container || !img || !img.complete || img.naturalWidth === 0) return

    const cW = container.clientWidth
    const cH = container.clientHeight
    const nW = img.naturalWidth
    const nH = img.naturalHeight

    // object-contain scales to fit while preserving aspect ratio
    const scale  = Math.min(cW / nW, cH / nH)
    const rW     = nW * scale
    const rH     = nH * scale
    const left   = (cW - rW) / 2
    const top    = (cH - rH) / 2

    setImgRect({ left, top, width: rW, height: rH })
  }, [])

  useEffect(() => {
    if (!preview) { setImgRect(null); return }
    // Re-measure on load, resize, and whenever preview changes
    measureImage()
    window.addEventListener('resize', measureImage)
    return () => window.removeEventListener('resize', measureImage)
  }, [preview, measureImage])

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center overflow-hidden rounded-xl bg-slate-900"
      style={{ minHeight: '240px' }}
    >
      {/* subtle grid */}
      <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(rgba(96,165,250,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(96,165,250,.1) 1px,transparent 1px)', backgroundSize: '28px 28px' }} />

      {preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={preview}
            alt="crowd preview"
            className="max-h-[480px] w-full object-contain"
            onLoad={measureImage}
          />

          {/* Dots — positioned relative to the actual rendered image area */}
          {done && imgRect && points.map((p, i) => (
            <span
              key={i}
              className="absolute size-2 rounded-full bg-cyan-300 shadow-[0_0_8px_3px_rgba(103,232,249,.7)] pointer-events-none"
              style={{
                left:      imgRect.left  + p.x * imgRect.width,
                top:       imgRect.top   + p.y * imgRect.height,
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60">
              <RefreshCw className="size-8 animate-spin text-blue-400" />
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center py-16 text-slate-500">
          <FileImage className="mb-2 size-8" />
          <span className="text-xs">No image selected</span>
        </div>
      )}

      {done && (
        <span className="absolute bottom-3 left-3 rounded-md bg-slate-950/70 px-2 py-1 text-[10px] font-medium text-cyan-200">
          {points.length} heads detected
        </span>
      )}
    </div>
  )
}

// ── Crowd Analysis ────────────────────────────────────────────────────────────
type HistoryRow = { id?: number; filename: string; count: number; occupancy_pct: number; status: Status; mode: string; processing_ms: number; capacity: number; analysed_at: string }

function Analysis({ zones }: { zones: Zone[] }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [backendMode, setBackendMode] = useState<'live' | 'demo' | 'offline'>('offline')
  const { predict, result, loading, error, reset } = usePrediction()
  const defaultZone = zones[0]
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load history from DB on mount
  useEffect(() => {
    fetchHistory().then(rows => {
      setHistory(rows as unknown as HistoryRow[])
    }).catch(() => {}).finally(() => setHistoryLoading(false))
  }, [])

  useEffect(() => {
    checkBackendHealth().then(({ online, mode }) => setBackendMode(online ? (mode ?? 'demo') : 'offline'))
  }, [])

  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null; setFile(f); reset()
  }, [reset])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0] ?? null
    if (f?.type.startsWith('image/')) { setFile(f); reset() }
  }, [reset])

  const run = useCallback(async () => {
    if (!file) return
    await predict(file, defaultZone.capacity, defaultZone.name)
  }, [file, predict, defaultZone])

  // When a result arrives — save to DB then prepend to local list
  useEffect(() => {
    if (!result) return
    const status = getStatus(result.count, result.capacity)
    const row: HistoryRow = {
      filename:      result.filename ?? file?.name ?? 'unknown',
      count:         result.count,
      occupancy_pct: result.occupancy_pct,
      status,
      mode:          result.mode,
      processing_ms: result.processing_time_ms,
      capacity:      result.capacity,
      analysed_at:   new Date().toISOString(),
    }
    // Fire-and-forget save to backend
    saveHistoryRow({
      filename:      row.filename,
      count:         row.count,
      occupancy_pct: row.occupancy_pct,
      status:        row.status,
      mode:          row.mode,
      processing_ms: row.processing_ms,
      capacity:      row.capacity,
    }).then(async () => {
      // Reload from DB so IDs are correct
      const fresh = await fetchHistory()
      setHistory(fresh as unknown as HistoryRow[])
    }).catch(() => {
      // If backend is unreachable, still show in local list
      setHistory(prev => [row, ...prev.slice(0, 99)])
    })
  }, [result]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClearHistory = async () => {
    await clearHistory().catch(() => {})
    setHistory([])
  }

  const exportHistory = () => {
    const csv = [
      'filename,count,occupancy,status,mode,processing_ms,capacity,analysed_at',
      ...history.map(r => `${r.filename},${r.count},${r.occupancy_pct}%,${r.status},${r.mode},${r.processing_ms},${r.capacity},${r.analysed_at}`)
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'crowdsense-history.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const modeBadge =
    backendMode === 'live'  ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">LIVE • PET MODEL</span>
  : backendMode === 'demo' ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">DEMO MODE</span>
                           : <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-500">BACKEND OFFLINE</span>

  const done = !!result && !loading

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Crowd Analysis</h2>
        <p className="mt-1 text-sm text-slate-500">Upload an image to count people and assess crowd density.</p>
      </div>

      {backendMode === 'offline' && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          <Zap className="mt-0.5 size-3.5 shrink-0" />
          <span>Backend is not running. Start it with: <code className="rounded bg-red-100 px-1">.\start-backend.ps1</code></span>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        {/* Input */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Upload image</h3>
              <p className="mt-1 text-xs text-slate-400">JPG, PNG, WebP · Max 50 MB</p>
            </div>
            {modeBadge}
          </div>

          <label
            className="group flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-6 text-center transition hover:border-blue-300 hover:bg-blue-50/30"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
          >
            {file
              ? <><FileImage className="mb-3 size-9 text-blue-500" /><p className="text-sm font-semibold text-slate-700">{file.name}</p><p className="mt-1 text-xs text-slate-400">Ready to analyse</p></>
              : <><div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Upload className="size-5" /></div><p className="text-sm font-semibold text-slate-700">Drop your image here</p><p className="mt-1 text-xs text-slate-400">or click to browse</p></>}
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={handleFileChange} />
          </label>

          <button
            onClick={run}
            disabled={!file || loading || backendMode === 'offline'}
            className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading
              ? <><RefreshCw className="size-4 animate-spin" /> Analysing with PET…</>
              : <><Activity className="size-4" /> Analyse crowd</>}
          </button>

          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</p>}
        </section>

        {/* Preview */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Preview</h3>
              <p className="mt-1 text-xs text-slate-400">{file ? file.name : 'Upload an image to see results'}</p>
            </div>
            <Video className="size-4 text-slate-300" />
          </div>

          <ImagePreview
            preview={preview}
            points={done && result ? result.points : []}
            loading={loading}
            done={done}
          />

          {done && result && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><div className="text-xl font-bold text-slate-900">{result.count}</div><div className="text-[10px] text-slate-400">People counted</div></div>
              <div><div className="text-xl font-bold text-slate-900">{result.occupancy_pct}%</div><div className="text-[10px] text-slate-400">Occupancy</div></div>
              <div><StatusBadge status={getStatus(result.count, result.capacity)} /><div className="mt-1 text-[10px] text-slate-400">Crowd status</div></div>
              <div><div className="text-xl font-bold text-slate-900">{(result.processing_time_ms / 1000).toFixed(2)}s</div><div className="text-[10px] text-slate-400">Processing</div></div>
            </div>
          )}
        </section>
      </div>

      {/* History */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Analysis history</h3>
            <p className="mt-1 text-xs text-slate-400">
              {historyLoading ? 'Loading…' : `${history.length} result${history.length !== 1 ? 's' : ''} saved`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {history.length > 0 && <>
              <button onClick={exportHistory} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50">
                <Download className="size-3.5" /> Export
              </button>
              <button onClick={handleClearHistory} className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50">
                <Trash2 className="size-3.5" /> Clear
              </button>
            </>}
          </div>
        </div>

        {historyLoading ? (
          <div className="flex items-center justify-center py-10 text-xs text-slate-400"><RefreshCw className="mr-2 size-3.5 animate-spin" /> Loading history…</div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <FileImage className="mb-2 size-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-400">No analyses yet</p>
            <p className="mt-1 text-xs text-slate-400">Upload an image above to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[580px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="pb-3 font-semibold">File</th>
                  <th className="pb-3 font-semibold">Count</th>
                  <th className="pb-3 font-semibold">Occupancy</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Mode</th>
                  <th className="pb-3 font-semibold">Analysed</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r, i) => (
                  <tr key={r.id ?? i} className="border-b border-slate-50 last:border-0">
                    <td className="py-3 font-medium text-slate-700 max-w-[180px] truncate"><FileImage className="mr-2 inline size-3.5 text-slate-400" />{r.filename}</td>
                    <td className="py-3 font-semibold text-slate-700">{r.count}</td>
                    <td className="py-3 text-slate-500">{r.occupancy_pct}%</td>
                    <td className="py-3"><StatusBadge status={r.status as Status} /></td>
                    <td className="py-3 text-slate-400 capitalize">{r.mode}</td>
                    <td className="py-3 text-slate-400">{new Date(r.analysed_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

// ── Settings ──────────────────────────────────────────────────────────────────
function SettingsPage({ zones, setZones }: { zones: Zone[]; setZones: (z: Zone[]) => void }) {
  const [capacity, setCapacity] = useState(200)
  const [warning, setWarning]   = useState(70)
  const [critical, setCritical] = useState(90)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [loadError, setLoadError] = useState(false)

  // Load persisted settings on mount
  useEffect(() => {
    fetchSettings().then(s => {
      setCapacity(s.capacity)
      setWarning(s.warning)
      setCritical(s.critical)
      // Sync zones to match saved settings
      setZones(zones.map(z => ({ ...z, capacity: s.capacity, warning: s.warning, critical: s.critical })))
    }).catch(() => setLoadError(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const valid = warning > 0 && critical > warning && critical <= 100 && capacity > 0

  const save = async () => {
    if (!valid) return
    setSaving(true)
    try {
      await saveSettings({ capacity, warning, critical })
      setZones(zones.map(z => ({ ...z, capacity, warning, critical })))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      alert('Could not save — make sure the backend is running.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Settings</h2>
        <p className="mt-1 text-sm text-slate-500">Global crowd thresholds — saved to the database and applied to all analyses.</p>
      </div>

      {loadError && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <Zap className="mt-0.5 size-3.5 shrink-0" />
          <span>Could not load saved settings — showing defaults. Start the backend to enable persistence.</span>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="mb-1 text-sm font-bold text-slate-900">Crowd thresholds</h3>
        <p className="mb-5 text-xs text-slate-400">These values are saved to the database and persist across sessions.</p>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-700">Default capacity</span>
            <input type="number" value={capacity} min={1}
              onChange={e => setCapacity(Number(e.target.value))}
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            <span className="text-[11px] text-slate-400">Maximum number of people allowed.</span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-700">Warning threshold (%)</span>
            <input type="number" value={warning} min={1} max={99}
              onChange={e => setWarning(Number(e.target.value))}
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            <span className="text-[11px] text-slate-400">Zone shows <strong>Crowded</strong> at this occupancy level.</span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-700">Critical threshold (%)</span>
            <input type="number" value={critical} min={1} max={100}
              onChange={e => setCritical(Number(e.target.value))}
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            <span className="text-[11px] text-slate-400">Zone shows <strong>Critical</strong> at this occupancy level.</span>
          </label>

          {!valid && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              Warning must be less than Critical, and both must be between 1–100.
            </p>
          )}
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-xs text-emerald-600">✓ Saved to database</span>}
        <button onClick={save} disabled={!valid || saving}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function Page() {
  const [page, setPage] = useState('Dashboard')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [zones, setZones] = useState<Zone[]>(initialZones)

  const content =
    page === 'Dashboard'      ? <Dashboard setPage={setPage} /> :
    page === 'Crowd Analysis' ? <Analysis zones={zones} /> :
                                <SettingsPage zones={zones} setZones={setZones} />

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-slate-900">
      <Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} />

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="h-full w-[240px] bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-blue-600 text-white"><Users className="size-4" /></div>
              <span className="font-bold text-slate-900">Crowd<span className="text-blue-600">Sense</span></span>
            </div>
            {['Dashboard', 'Crowd Analysis', 'Settings'].map(p => (
              <button key={p} onClick={() => { setPage(p); setMobileOpen(false) }}
                className={cn('mb-1 flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm font-medium', page === p ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50')}>
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={cn('transition-[padding] duration-300', collapsed ? 'lg:pl-[76px]' : 'lg:pl-[240px]')}>
        <Topbar page={page} setMobileOpen={setMobileOpen} />
        <main className="mx-auto max-w-[1400px] p-5 lg:p-8">{content}</main>
      </div>
    </div>
  )
}
