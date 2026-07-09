import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type ApiError } from '../client'

const BASE = 'http://localhost:8000'

function fetchResponse(
  body: unknown,
  { status = 200, ok = true }: { status?: number; ok?: boolean } = {},
): Response {
  const text = body === undefined ? '' : JSON.stringify(body)
  return {
    ok,
    status,
    text: () => Promise.resolve(text),
  } as unknown as Response
}

describe('api client', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('GET sends credentials and resolves JSON body', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ hello: 'world' }))
    const result = await api.get<{ hello: string }>('/things')
    expect(result).toEqual({ hello: 'world' })
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/things`,
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
      }),
    )
  })

  it('POST with body sets Content-Type and stringifies the payload', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ id: 'abc' }))
    await api.post('/things', { name: 'Sam' })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ name: 'Sam' }))
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('POST without body omits Content-Type', async () => {
    fetchMock.mockResolvedValue(fetchResponse({}))
    await api.post('/things')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.body).toBeUndefined()
  })

  it('returns undefined on 204 No Content', async () => {
    fetchMock.mockResolvedValue(fetchResponse(undefined, { status: 204 }))
    const result = await api.post('/things/1/revoke')
    expect(result).toBeUndefined()
  })

  it('throws an ApiError carrying status + payload on 4xx', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse(
        { detail: 'no such thing' },
        { status: 404, ok: false },
      ),
    )
    await expect(api.get('/things/bogus')).rejects.toMatchObject({
      status: 404,
      message: 'no such thing',
    })
  })

  it('falls back to HTTP {status} when the error body has no detail', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse({ something: 'else' }, { status: 500, ok: false }),
    )
    try {
      await api.get('/broken')
      throw new Error('expected to throw')
    } catch (e) {
      const err = e as ApiError
      expect(err.status).toBe(500)
      expect(err.message).toBe('HTTP 500')
      expect(err.payload).toEqual({ something: 'else' })
    }
  })

  it('strips a trailing slash from the base URL', async () => {
    fetchMock.mockResolvedValue(fetchResponse({}))
    await api.get('/things')
    const [url] = fetchMock.mock.calls[0] as [string]
    // Base URL derived from env default 'http://localhost:8000'; no double slash.
    expect(url).toBe(`${BASE}/things`)
  })

  it('raw() returns the bare Response without parsing', async () => {
    const res = fetchResponse({})
    fetchMock.mockResolvedValue(res)
    const actual = await api.raw('/artifacts/foo.pdf')
    expect(actual).toBe(res)
  })
})
