import { webcrypto } from 'node:crypto'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../data/api-client'
import BackupView from '../BackupView.vue'

const mocks = vi.hoisted(() => ({
  countAll: vi.fn(),
  restoreBackup: vi.fn(),
  restoreReceipt: vi.fn(),
  confirm: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('../../../auth/auth-service', () => ({
  useAuth: () => ({ canWrite: { value: true } }),
}))
vi.mock('../../../data/data-service', () => ({ dataService: mocks }))
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn() }))
vi.mock('element-plus', () => ({
  ElMessage: { error: mocks.error, success: mocks.success, warning: mocks.warning },
  ElMessageBox: { confirm: mocks.confirm },
}))

enableAutoUnmount(afterEach)
afterEach(() => vi.unstubAllGlobals())
beforeEach(() => {
  vi.resetAllMocks()
  mocks.countAll.mockResolvedValue({ accounts: 0, modules: 0, steps: 0, records: 0, images: 0 })
  mocks.restoreBackup.mockResolvedValue(undefined)
  mocks.confirm.mockResolvedValue('confirm')
  // Ordinary HTTP has getRandomValues but does not expose randomUUID.
  vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) })
})

const validBackup = JSON.stringify({
  format: 'platform-appeal-manager-backup',
  version: 1,
  exportedAt: '2026-10-21T00:00:00.000Z',
  data: { accounts: [], appealModules: [], appealSteps: [], appealRecords: [] },
})

function render() {
  return mount(BackupView, {
    global: {
      stubs: {
        'el-alert': true,
        'el-button': {
          props: { disabled: Boolean, loading: Boolean },
          emits: ['click'],
          template:
            '<button :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>',
        },
      },
    },
  })
}

async function selectFile(
  wrapper: ReturnType<typeof render>,
  name = 'backup.json',
  text = Promise.resolve(validBackup),
) {
  const input = wrapper.get('input[type="file"]')
  const file = new File([validBackup], name, { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: () => text })
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
  await flushPromises()
  return file
}

async function clickRestore(wrapper: ReturnType<typeof render>) {
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '替换并恢复')!
    .trigger('click')
  await flushPromises()
}

describe('backup restore preparation', () => {
  it('submits a backend-valid operation ID on HTTP without randomUUID', async () => {
    const wrapper = render()
    const file = await selectFile(wrapper)
    await clickRestore(wrapper)

    expect(mocks.restoreBackup).toHaveBeenCalledExactlyOnceWith(
      file,
      expect.stringMatching(/^[A-Za-z0-9_-]{1,128}$/),
    )
    expect(mocks.error).not.toHaveBeenCalled()
    expect(mocks.success).toHaveBeenCalledWith('备份恢复完成')
  })

  it('does not offer a partially prepared restore when random generation fails', async () => {
    vi.stubGlobal('crypto', {
      getRandomValues: () => {
        throw new Error('random source unavailable')
      },
    })
    const wrapper = render()
    await selectFile(wrapper)

    expect(wrapper.find('.preview-panel').exists()).toBe(false)
    expect(mocks.error).toHaveBeenCalled()
    expect(mocks.restoreBackup).not.toHaveBeenCalled()
  })

  it('retains the same file and operation ID when explicitly retrying an uncertain restore', async () => {
    mocks.restoreBackup.mockRejectedValueOnce(new ApiError('connection lost'))
    const wrapper = render()
    const file = await selectFile(wrapper)
    await clickRestore(wrapper)
    expect(wrapper.findAll('button').some((button) => button.text() === '查询恢复结果')).toBe(true)
    await clickRestore(wrapper)

    expect(mocks.restoreBackup).toHaveBeenCalledTimes(2)
    const id = mocks.restoreBackup.mock.calls[0]![1]
    expect(id).toMatch(/^[A-Za-z0-9_-]{1,128}$/)
    expect(mocks.restoreBackup.mock.calls[1]).toEqual([file, id])
    expect(mocks.success).toHaveBeenCalledWith('备份恢复完成')
  })

  it('does not expose an older valid file after selecting an invalid file', async () => {
    const wrapper = render()
    await selectFile(wrapper)
    expect(wrapper.find('.preview-panel').exists()).toBe(true)
    await selectFile(wrapper, 'invalid.json', Promise.resolve('{'))

    expect(wrapper.find('.preview-panel').exists()).toBe(false)
    expect(mocks.restoreBackup).not.toHaveBeenCalled()
  })

  it('ignores a slow earlier selection after a newer file has been prepared', async () => {
    let finish!: (text: string) => void
    const slow = new Promise<string>((resolve) => {
      finish = resolve
    })
    const wrapper = render()
    await selectFile(wrapper, 'slow.json', slow)
    const file = await selectFile(wrapper, 'current.json')
    finish(validBackup)
    await flushPromises()
    expect(wrapper.get('.preview-panel').text()).toContain('current.json')
    await clickRestore(wrapper)

    expect(mocks.restoreBackup).toHaveBeenCalledWith(
      file,
      expect.stringMatching(/^[A-Za-z0-9_-]{1,128}$/),
    )
  })
})
