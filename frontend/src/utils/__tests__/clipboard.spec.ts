import { afterEach, describe, expect, it, vi } from 'vitest'

import { copyText } from '../clipboard'

const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand')

function mockLegacyCopy(implementation: () => boolean = () => true) {
  const copy = vi.fn(implementation)
  Object.defineProperty(document, 'execCommand', { configurable: true, value: copy })
  return copy
}

describe('copyText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalExecCommand) {
      Object.defineProperty(document, 'execCommand', originalExecCommand)
    } else {
      Reflect.deleteProperty(document, 'execCommand')
    }
    document.body.replaceChildren()
  })

  it('prefers the modern clipboard without creating a temporary textarea', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const legacyCopy = mockLegacyCopy()

    await copyText('账号\n192.0.2.1:1234:example:password')

    expect(writeText).toHaveBeenCalledWith('账号\n192.0.2.1:1234:example:password')
    expect(legacyCopy).not.toHaveBeenCalled()
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('falls back when the modern API rejects access', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Permission denied')) },
    })
    const legacyCopy = mockLegacyCopy()

    await copyText('fallback')

    expect(legacyCopy).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('copies exact multiline text synchronously when the modern API is missing on HTTP', async () => {
    vi.stubGlobal('navigator', { clipboard: undefined })
    const value = '国家：美国\n192.0.2.0/24\n  keep spaces  '
    const legacyCopy = mockLegacyCopy(() => {
      const textarea = document.activeElement as HTMLTextAreaElement
      expect(textarea.value).toBe(value)
      expect(textarea.selectionStart).toBe(0)
      expect(textarea.selectionEnd).toBe(value.length)
      return true
    })

    const copying = copyText(value)
    expect(legacyCopy).toHaveBeenCalledOnce()
    await copying
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('keeps the temporary textarea inside the dialog and restores focus and selection', async () => {
    vi.stubGlobal('navigator', { clipboard: undefined })
    const dialog = document.createElement('section')
    dialog.setAttribute('role', 'dialog')
    const input = document.createElement('input')
    input.value = 'original value'
    dialog.appendChild(input)
    document.body.appendChild(dialog)
    input.focus()
    input.setSelectionRange(2, 5, 'backward')
    mockLegacyCopy(() => {
      expect(document.activeElement?.parentElement).toBe(dialog)
      return true
    })

    await copyText('credentials')

    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('original value')
    expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
      2,
      5,
      'backward',
    ])
    expect(dialog.querySelector('textarea')).toBeNull()
  })

  it.each(['returns false', 'throws', 'is missing'])(
    'rejects and cleans up when the legacy API %s',
    async (failure) => {
      vi.stubGlobal('navigator', { clipboard: undefined })
      mockLegacyCopy(() => {
        if (failure === 'throws') throw new Error('Blocked')
        return false
      })
      if (failure === 'is missing') Reflect.deleteProperty(document, 'execCommand')

      await expect(copyText('temporary secret')).rejects.toThrow()

      expect(document.querySelector('textarea')).toBeNull()
      expect(document.body.textContent).not.toContain('temporary secret')
    },
  )
})
