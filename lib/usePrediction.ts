/**
 * usePrediction
 * =============
 * React hook that submits an image file to POST /api/predict and
 * returns the live PET model result (or the demo estimate when no
 * checkpoint is loaded).
 *
 * Usage:
 *   const { predict, result, loading, error, reset } = usePrediction()
 *   await predict(file, zoneCapacity, zoneName)
 */

import { useState, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PredictPoint {
  x: number // 0–1 relative to image width
  y: number // 0–1 relative to image height
}

export interface PredictResult {
  count: number
  occupancy_pct: number
  processing_time_ms: number
  points: PredictPoint[]
  mode: 'live' | 'demo'
  model: string
  filename: string | null
  zone: string | null
  capacity: number
  image_size: [number, number]
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePrediction() {
  const [result, setResult] = useState<PredictResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
    setLoading(false)
  }, [])

  const predict = useCallback(
    async (file: File, capacity: number, zone?: string) => {
      setLoading(true)
      setError(null)
      setResult(null)

      try {
        const body = new FormData()
        body.append('file', file)
        body.append('capacity', String(capacity))
        if (zone) body.append('zone', zone)

        const res = await fetch('/api/predict', { method: 'POST', body })
        const json = await res.json()

        if (!res.ok) {
          throw new Error(json?.detail ?? `Server error ${res.status}`)
        }

        setResult(json as PredictResult)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setError(msg)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  return { predict, result, loading, error, reset }
}

// ── Backend health check ──────────────────────────────────────────────────────

export async function checkBackendHealth(): Promise<{
  online: boolean
  mode: 'live' | 'demo' | null
}> {
  try {
    const res = await fetch('/api/predict', { cache: 'no-store' })
    if (!res.ok) return { online: false, mode: null }
    const json = await res.json()
    return { online: json.status === 'ok', mode: json.mode ?? null }
  } catch {
    return { online: false, mode: null }
  }
}
