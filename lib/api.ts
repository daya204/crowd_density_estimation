/**
 * lib/api.ts
 * ----------
 * Thin fetch wrappers for the CrowdSense FastAPI backend.
 * All calls go through the Next.js proxy at /api/* so CORS is never an issue.
 */

const BASE = '/api'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AppSettings {
  capacity:   number
  warning:    number
  critical:   number
  updated_at?: string
}

export interface HistoryRow {
  id:            number
  filename:      string
  count:         number
  occupancy_pct: number
  status:        string
  mode:          string
  processing_ms: number
  capacity:      number
  analysed_at:   string
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch(`${BASE}/settings`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Could not load settings')
  return res.json()
}

export async function saveSettings(s: Omit<AppSettings, 'updated_at'>): Promise<void> {
  const res = await fetch(`${BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.detail ?? 'Could not save settings')
  }
}

// ── History ───────────────────────────────────────────────────────────────────

export async function fetchHistory(limit = 100): Promise<HistoryRow[]> {
  const res = await fetch(`${BASE}/history?limit=${limit}`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Could not load history')
  const json = await res.json()
  return json.history as HistoryRow[]
}

export async function saveHistoryRow(row: {
  filename:      string
  count:         number
  occupancy_pct: number
  status:        string
  mode:          string
  processing_ms: number
  capacity:      number
}): Promise<void> {
  const body = new FormData()
  Object.entries(row).forEach(([k, v]) => body.append(k, String(v)))
  const res = await fetch(`${BASE}/history`, { method: 'POST', body })
  if (!res.ok) throw new Error('Could not save history row')
}

export async function clearHistory(): Promise<void> {
  const res = await fetch(`${BASE}/history`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Could not clear history')
}
