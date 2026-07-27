type StoppableDownloadQueue = {
  stop: () => Promise<void>
}

let activeQueue: StoppableDownloadQueue | null = null

export function registerActiveDownloadQueue(queue: StoppableDownloadQueue): () => void {
  activeQueue = queue
  return () => {
    if (activeQueue === queue) activeQueue = null
  }
}

export async function stopActiveDownloadQueue(): Promise<void> {
  const queue = activeQueue
  if (!queue) return
  await queue.stop()
  if (activeQueue === queue) activeQueue = null
}
