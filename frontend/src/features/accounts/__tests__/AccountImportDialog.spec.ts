import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AccountImportDialog from '../AccountImportDialog.vue'

const { importAccountsMock } = vi.hoisted(() => ({ importAccountsMock: vi.fn() }))

vi.mock('../../../data/data-service', () => ({
  dataService: { importAccounts: importAccountsMock },
}))

vi.mock('element-plus', () => ({
  ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
}))

const DialogStub = {
  props: {
    modelValue: Boolean,
    beforeClose: { type: Function, default: undefined },
    closeOnClickModal: Boolean,
    closeOnPressEscape: Boolean,
    showClose: Boolean,
  },
  template: '<section><slot /><footer><slot name="footer" /></footer></section>',
}

const ButtonStub = {
  props: { disabled: Boolean, loading: Boolean },
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
}

const InputStub = {
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  template:
    '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
}

const SlotStub = { template: '<div><slot /></div>' }

describe('AccountImportDialog', () => {
  beforeEach(() => {
    importAccountsMock.mockReset()
  })

  it('blocks every dialog close path while an import is pending', async () => {
    let resolveImport!: () => void
    importAccountsMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveImport = resolve
      }),
    )

    const wrapper = mount(AccountImportDialog, {
      props: { modelValue: true, platformId: 'ins', platformLabel: 'INS' },
      global: {
        stubs: {
          'el-dialog': DialogStub,
          'el-button': ButtonStub,
          'el-input': InputStub,
          'el-alert': true,
          'el-form': SlotStub,
          'el-form-item': SlotStub,
          'el-table': true,
          'el-table-column': true,
          'el-tag': SlotStub,
        },
      },
    })

    await wrapper.find('textarea').setValue(`|国家|账号|密码|邮箱账号|邮箱密码|2fa|
|---|---|---|---|---|---|
|美国|demo-user|password|demo@example.com|mail-password|ABC123|`)

    const buttons = wrapper.findAll('button')
    const confirm = buttons.find((button) => button.text().includes('确认导入'))!
    await confirm.trigger('click')
    await nextTick()

    const cancel = buttons.find((button) => button.text() === '取消')!
    const dialog = wrapper.findComponent(DialogStub)
    const done = vi.fn()
    ;(dialog.props('beforeClose') as (callback: () => void) => void)(done)

    expect(importAccountsMock).toHaveBeenCalledOnce()
    expect(cancel.attributes('disabled')).toBeDefined()
    expect(confirm.attributes('disabled')).toBeDefined()
    expect(dialog.props('closeOnClickModal')).toBe(false)
    expect(dialog.props('closeOnPressEscape')).toBe(false)
    expect(dialog.props('showClose')).toBe(false)
    expect(done).not.toHaveBeenCalled()

    resolveImport()
    await flushPromises()

    expect(wrapper.emitted('imported')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})
