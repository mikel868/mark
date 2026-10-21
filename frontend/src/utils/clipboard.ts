/** Copy on HTTPS/localhost, with a legacy fallback for plain HTTP and denied permissions. */
export async function copyText(text: string): Promise<void> {
  try {
    if (typeof navigator.clipboard?.writeText === 'function') {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    // A browser can expose the modern API but deny clipboard access.
  }

  const focusedElement = document.activeElement
  const inputSelection =
    focusedElement instanceof HTMLInputElement || focusedElement instanceof HTMLTextAreaElement
      ? {
          start: focusedElement.selectionStart,
          end: focusedElement.selectionEnd,
          direction: focusedElement.selectionDirection,
        }
      : undefined
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.readOnly = true
  textarea.tabIndex = -1
  textarea.style.cssText = 'position:fixed;left:-9999px;top:0;'

  // Stay inside an open dialog's focus trap when copying verification credentials.
  const container = focusedElement?.closest('dialog, [role="dialog"]') ?? document.body
  container.appendChild(textarea)

  try {
    textarea.focus({ preventScroll: true })
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    if (typeof document.execCommand !== 'function' || !document.execCommand('copy')) {
      throw new Error('Clipboard copy failed')
    }
  } finally {
    textarea.remove()
    if (focusedElement instanceof HTMLElement) {
      focusedElement.focus({ preventScroll: true })
      if (
        inputSelection?.start != null &&
        inputSelection.end != null &&
        (focusedElement instanceof HTMLInputElement ||
          focusedElement instanceof HTMLTextAreaElement)
      ) {
        focusedElement.setSelectionRange(
          inputSelection.start,
          inputSelection.end,
          inputSelection.direction ?? undefined,
        )
      }
    }
  }
}
