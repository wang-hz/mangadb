export interface ImportSessionItem {
  id: string
  status: string
  uploadId?: string
}

export async function acknowledgeCompletedImport(
  uploadId: string,
  removeSession: (uploadId: string) => Promise<void>,
): Promise<boolean> {
  try {
    await removeSession(uploadId)
    return true
  } catch {
    return false
  }
}

export async function removeCompletedImportSessions<T extends ImportSessionItem>(
  items: T[],
  removeSession: (uploadId: string) => Promise<void>,
): Promise<{ removedIds: string[]; failedIds: string[] }> {
  const completed = items.filter(item => item.status === 'done')
  const outcomes = await Promise.all(completed.map(async item => {
    if (!item.uploadId) return { id: item.id, removed: true }
    try {
      await removeSession(item.uploadId)
      return { id: item.id, removed: true }
    } catch {
      return { id: item.id, removed: false }
    }
  }))
  return {
    removedIds: outcomes.filter(outcome => outcome.removed).map(outcome => outcome.id),
    failedIds: outcomes.filter(outcome => !outcome.removed).map(outcome => outcome.id),
  }
}
