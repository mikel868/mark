import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAuthManager } from '../auth-service'
import { resetCsrf } from '../../data/api-client'

afterEach(() => {
  vi.unstubAllGlobals()
  resetCsrf()
  localStorage.clear()
})
describe('server session authentication', () => {
  it('does not trust legacy localStorage and restores role from the server', async () => {
    localStorage.setItem(
      'platform-appeal-manager:auth-session',
      JSON.stringify({ username: 'admin', role: 'admin' }),
    )
    const manager = createAuthManager()
    expect(manager.isAuthenticated.value).toBe(false)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ username: 'reader', role: 'READONLY' })),
    )
    await manager.initialize()
    expect(manager.isAuthenticated.value).toBe(true)
    expect(manager.canWrite.value).toBe(false)
    expect(() => manager.assertCanWrite()).toThrow('只读')
  })
  it('refreshes the rotated CSRF token after login and logs out on the server', async () => {
    const request = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/csrf'))
        return Promise.resolve(Response.json({ token: 't', headerName: 'X-CSRF-TOKEN' }))
      if (url.endsWith('/logout')) return Promise.resolve(new Response(null, { status: 204 }))
      return Promise.resolve(Response.json({ username: 'admin', role: 'ADMIN' }))
    })
    vi.stubGlobal('fetch', request)
    const manager = createAuthManager()
    expect(await manager.login('admin', 'test-only')).toEqual({ success: true })
    expect(manager.canWrite.value).toBe(true)
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/auth/csrf',
      '/api/v1/auth/login',
      '/api/v1/auth/csrf',
    ])
    expect(localStorage.length).toBe(0)
    await manager.logout()
    expect(manager.isAuthenticated.value).toBe(false)
  })
  it('distinguishes backend unavailability from a logged-out session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
    const manager = createAuthManager()
    await manager.initialize()
    expect(manager.initializationError.value).toContain('无法连接后端')
    expect(manager.ready.value).toBe(true)
  })
})
