import { flushSync } from 'react-dom'

let active: ViewTransition | undefined

// Capture only committed UI changes. Fetches keep the current content on screen.
export function transition(update: () => void) {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update()
    return Promise.resolve()
  }
  active?.skipTransition()
  active = document.startViewTransition(() => flushSync(update))
  void active.finished.catch(() => {})
  return active.updateCallbackDone
}
