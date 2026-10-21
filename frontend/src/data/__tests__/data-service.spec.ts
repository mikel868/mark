import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dataService } from '../data-service'
import { resetCsrf } from '../api-client'
import type { AppealRecord, Account, EntityInput } from '../../domain/entities'

const requests: { url: string; init: RequestInit }[] = []
beforeEach(() => {
  requests.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string, init: RequestInit) => {
      if (url.endsWith('/auth/csrf'))
        return Promise.resolve(Response.json({ token: 't', headerName: 'X-CSRF-TOKEN' }))
      requests.push({ url, init })
      return Promise.resolve(Response.json({ id: 'r1', count: 2 }))
    }),
  )
})
afterEach(() => {
  resetCsrf()
  vi.unstubAllGlobals()
})
const body = () => JSON.parse(requests[0]!.init.body as string)
describe('API business contracts', () => {
  it('patches only changed fields and never sends stale IP state', async () => {
    const record = {
      id: 'r1',
      platformId: 'ins',
      country: 'US',
      status: '准备中',
      note: 'old',
      ip: '203.0.113.0/24',
      completedIps: [],
      verificationIps: [],
    } as unknown as AppealRecord
    await dataService.saveRecord({ ...record, note: 'new' }, record)
    expect(body()).toEqual({ note: 'new' })
    expect(requests[0]?.init.method).toBe('PATCH')
  })
  it('sends explicit null to unlink and preserves empty partial credentials', async () => {
    const record = { id: 'r1', platformId: 'ins', accountId: 'old' } as AppealRecord
    await dataService.saveRecord({ ...record, accountId: undefined }, record)
    expect(body()).toEqual({ accountId: null })
  })
  it('rejects an edit without its opening snapshot', () => {
    expect(() =>
      dataService.saveAccount({ id: 'a', platformId: 'ins' } as EntityInput<Account>),
    ).toThrow('快照')
    expect(requests).toHaveLength(0)
  })
  it('uses the dedicated used-state API even for incomplete imported accounts', async () => {
    await dataService.setAccountUsed('google', 'a', true)
    expect(requests[0]?.url).toBe('/api/v1/platforms/google/accounts/a/used')
    expect(body()).toEqual({ used: true })
  })
  it('imports incomplete rows in one request without client-generated identities', async () => {
    await dataService.importAccounts([
      { platformId: 'tiktok', account: 'demo' } as EntityInput<Account>,
    ])
    expect(body()).toEqual({ rows: [{ account: 'demo' }] })
  })
  it('sends batch status in one atomic request, never one call per record', async () => {
    expect(await dataService.updateRecordStatuses('ins', ['a', 'b'], '已提交')).toMatchObject({
      count: 2,
    })
    expect(requests).toHaveLength(1)
    expect(body()).toEqual({ ids: ['a', 'b'], status: '已提交' })
  })
  it('uses a single IP id without sending the whole record', async () => {
    const record = {
      id: 'r',
      ipItems: [{ id: 'ip-1', network: '203.0.113.0/24', completed: false }],
    } as AppealRecord
    await dataService.setIpCompleted('ins', record, '203.0.113.0/24', true)
    expect(requests[0]?.url).toContain('/r/ips/ip-1/completed')
    expect(body()).toEqual({ completed: true })
  })
  it('edits only changed credential slots including an explicit clear', async () => {
    const record = {
      id: 'r',
      ipItems: [
        { id: 'ip-1', network: 'n1' },
        { id: 'ip-2', network: 'n2' },
      ],
    } as AppealRecord
    const before = [
      { network: 'n1', content: 'abc', ip: '', account: '', password: '' },
      { network: 'n2', content: 'xyz', ip: '', account: '', password: '' },
    ]
    await dataService.saveVerificationIps('ins', record, before, [before[1]!])
    expect(body()).toEqual({ edits: [{ ipId: 'ip-1', content: '' }] })
  })
  it('imports raw credential text with platform scope rather than page-scoped updates', async () => {
    await dataService.importVerificationIps('ins', '203.0.113.1:80:u:p')
    expect(body()).toEqual({ scope: 'platform', text: '203.0.113.1:80:u:p' })
  })
  it('fetches all pages when building an entire-platform import preview', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
          Response.json({
            items: url.includes('page=1&') ? [{ id: 'one' }] : [{ id: 'two' }],
            total: 2,
          }),
        ),
      ),
    )
    expect(await dataService.listRecords('ins')).toEqual([{ id: 'one' }, { id: 'two' }])
  })
  it('restores the original file with the same operation id on an explicit retry', async () => {
    const file = new File(['{"version":1}'], 'backup.json')
    await dataService.restoreBackup(file, 'op-1')
    await dataService.restoreBackup(file, 'op-1')
    for (const request of requests) {
      const form = request.init.body as FormData
      expect(form.get('file')).toBe(file)
      expect(form.get('operationId')).toBe('op-1')
      expect(form.get('confirmation')).toBe('REPLACE_ALL_PLATFORMS')
    }
  })
})
