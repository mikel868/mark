import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, resetCsrf, ApiError } from '../api-client'

afterEach(() => {
  vi.unstubAllGlobals()
  resetCsrf()
})
describe('same-origin API transport', () => {
  it('attaches Cookie credentials and CSRF to writes, not business data to storage', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ token: 'csrf-test', headerName: 'X-CSRF-TOKEN' }))
      .mockResolvedValueOnce(Response.json({ id: 'new' }))
    vi.stubGlobal('fetch', fetcher)
    expect(await api('/test', { method: 'POST', body: { note: 'hello' } })).toEqual({ id: 'new' })
    const [url, init] = fetcher.mock.calls[1]!
    expect(url).toBe('/api/v1/test')
    expect(init.credentials).toBe('same-origin')
    expect(init.headers.get('X-CSRF-TOKEN')).toBe('csrf-test')
    expect(JSON.parse(init.body)).toEqual({ note: 'hello' })
  })
  it('never retries a failed write with unknown outcome', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ token: 't', headerName: 'X-CSRF-TOKEN' }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetcher)
    await expect(api('/test', { method: 'POST', body: {} })).rejects.toThrow('结果可能尚未确认')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('preserves server error status and request id', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { code: 'CONFLICT', message: '记录已删除', requestId: 'r1' },
            { status: 409 },
          ),
        ),
    )
    await expect(api('/test')).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      requestId: 'r1',
    })
  })
  it('rejects a SPA HTML response instead of treating it as valid data', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('<html/>', { headers: { 'Content-Type': 'text/html' } })),
    )
    await expect(api('/test')).rejects.toBeInstanceOf(ApiError)
    await expect(api('/test', { response: 'blob' })).rejects.toBeInstanceOf(ApiError)
  })
})
