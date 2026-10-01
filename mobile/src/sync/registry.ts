import type { ProgressSynchronizer } from './protocol'

let active: { identity: string; sync: ProgressSynchronizer } | null = null
export function registerProgressSync(serverUrl: string, userUuid: string, sync: ProgressSynchronizer): () => void {
  const registration = { identity: `${serverUrl}\u0000${userUuid}`, sync }
  active = registration
  return () => {
    sync.stop()
    if (active === registration) active = null
  }
}
export function synchronizeProgress(serverUrl: string, userUuid: string, force = false): Promise<void> {
  if (active?.identity !== `${serverUrl}\u0000${userUuid}`) return Promise.resolve()
  return active.sync.sync(force)
}
export async function prepareReaderProgress(serverUrl: string, userUuid: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      synchronizeProgress(serverUrl, userUuid, true).catch(() => {}),
      new Promise<void>(resolve => { timer = setTimeout(resolve, 1200) }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
