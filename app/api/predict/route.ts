/**
 * /api/predict  – Next.js proxy to the FastAPI inference server
 *
 * Accepts the same multipart/form-data the frontend sends
 * (file, capacity, zone) and forwards it verbatim to FastAPI running
 * on port 8000.  This keeps the browser free of CORS issues and lets
 * us add auth / rate-limiting here later without touching the client.
 */

import { NextRequest, NextResponse } from 'next/server'

const FASTAPI_URL = process.env.FASTAPI_URL ?? 'http://127.0.0.1:8000'

export async function GET() {
  try {
    const res = await fetch(`${FASTAPI_URL}/health`, { cache: 'no-store' })
    const json = await res.json()
    return NextResponse.json(json, { status: res.status })
  } catch {
    return NextResponse.json(
      { status: 'unreachable', detail: 'FastAPI server is not running.' },
      { status: 503 },
    )
  }
}

export async function POST(req: NextRequest) {
  // Pull the raw multipart body the browser sent us
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ detail: 'Invalid multipart body.' }, { status: 400 })
  }

  // Forward to FastAPI – stream the body straight through
  let upstream: Response
  try {
    upstream = await fetch(`${FASTAPI_URL}/predict`, {
      method: 'POST',
      body: formData,
      // Do NOT set Content-Type – fetch sets it + boundary automatically
    })
  } catch {
    return NextResponse.json(
      {
        detail:
          'FastAPI inference server is not reachable. ' +
          'Run: .venv\\Scripts\\uvicorn api.server:app --reload --port 8000',
      },
      { status: 503 },
    )
  }

  const json = await upstream.json()
  return NextResponse.json(json, { status: upstream.status })
}
