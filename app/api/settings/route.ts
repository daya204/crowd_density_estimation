import { NextRequest, NextResponse } from 'next/server'

const FASTAPI = process.env.FASTAPI_URL ?? 'http://127.0.0.1:8000'

export async function GET() {
  try {
    const res = await fetch(`${FASTAPI}/settings`, { cache: 'no-store' })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch {
    return NextResponse.json({ detail: 'Backend not reachable' }, { status: 503 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const res = await fetch(`${FASTAPI}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch {
    return NextResponse.json({ detail: 'Backend not reachable' }, { status: 503 })
  }
}
