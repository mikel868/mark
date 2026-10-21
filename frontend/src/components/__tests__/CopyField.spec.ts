import { flushPromises, mount } from '@vue/test-utils'
import { ElMessage } from 'element-plus'
import { afterEach, describe, expect, it, vi } from 'vitest'

import CopyField from '../CopyField.vue'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
}))

describe('CopyField', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('copies through the legacy API when HTTP makes navigator.clipboard unavailable', async () => {
    vi.stubGlobal('navigator', { clipboard: undefined })
    const copy = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: copy })

    const wrapper = mount(CopyField, {
      props: { value: 'example text', label: '账号' },
      global: {
        stubs: {
          'el-button': {
            template: '<button @click="$emit(\'click\')"><slot /></button>',
          },
        },
      },
    })

    try {
      await wrapper.get('button').trigger('click')
      await flushPromises()

      expect(copy).toHaveBeenCalledWith('copy')
      expect(ElMessage.success).toHaveBeenCalledWith('账号已复制')
      expect(ElMessage.error).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
      Reflect.deleteProperty(document, 'execCommand')
    }
  })
})
