import { NextRequest, NextResponse } from 'next/server'

const FASTAPI = process.env.FASTAPI_URL ?? 'http://127.0.0.1:8000'

export async function GET(req: NextRequest) {
  try {
    const limit = req.nextUrl.searchParams.get('limit') ?? '100'
    const res = await fetch(`${FASTAPI}/history?limit=${limit}`, { cache: 'no-store' })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch {
    return NextResponse.json({ detail: 'Backend not reachable' }, { status: 503 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const res = await fetch(`${FASTAPI}/history`, { method: 'POST', body: formData })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch {
    return NextResponse.json({ detail: 'Backend not reachable' }, { status: 503 })
  }
}

export async function DELETE() {
  try {
    const res = await fetch(`${FASTAPI}/history`, { method: 'DELETE' })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch {
    return NextResponse.json({ detail: 'Backend not reachable' }, { status: 503 })
  }
}
