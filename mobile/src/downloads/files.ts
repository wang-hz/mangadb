import { Directory, File, Paths } from 'expo-file-system'

export interface DownloadFileStore {
  ensureDirectory: (uri: string) => Promise<void>
  readText: (uri: string) => Promise<string | null>
  writeTextAtomic: (uri: string, value: string) => Promise<void>
  deleteDirectory: (uri: string) => Promise<void>
  listDirectoryNames: (uri: string) => Promise<string[]>
  fileSize: (uri: string) => Promise<number | null>
}

export interface DownloadPageFileStore {
  writePageAtomic: (
    partialUri: string,
    completedUri: string,
    bytes: Uint8Array,
  ) => Promise<void>
}

export function defaultDownloadRootUri(): string {
  return new Directory(Paths.document, 'mangadb-downloads', 'v1').uri
}

export class ExpoDownloadFileStore implements DownloadFileStore, DownloadPageFileStore {
  async ensureDirectory(uri: string): Promise<void> {
    new Directory(uri).create({ idempotent: true, intermediates: true })
  }

  async readText(uri: string): Promise<string | null> {
    const file = new File(uri)
    if (!file.exists) {
      const backup = new File(`${uri}.bak`)
      const temporary = new File(`${uri}.tmp`)
      if (backup.exists) backup.move(file)
      else if (temporary.exists) temporary.move(file)
    }
    return file.exists ? file.text() : null
  }

  async writeTextAtomic(uri: string, value: string): Promise<void> {
    const destination = new File(uri)
    destination.parentDirectory.create({ idempotent: true, intermediates: true })
    const temporary = new File(`${uri}.tmp`)
    const backup = new File(`${uri}.bak`)
    temporary.create({ intermediates: true, overwrite: true })
    temporary.write(value)
    if (backup.exists) backup.delete()
    if (destination.exists) {
      destination.copy(backup)
      destination.delete()
    }
    try {
      temporary.move(destination)
      if (backup.exists) backup.delete()
    } catch (error) {
      if (!destination.exists && backup.exists) backup.move(destination)
      throw error
    }
  }

  async deleteDirectory(uri: string): Promise<void> {
    const directory = new Directory(uri)
    if (directory.exists) directory.delete()
  }

  async listDirectoryNames(uri: string): Promise<string[]> {
    const directory = new Directory(uri)
    if (!directory.exists) return []
    return directory.list()
      .filter((entry): entry is Directory => entry instanceof Directory)
      .map(entry => entry.name)
      .sort()
  }

  async fileSize(uri: string): Promise<number | null> {
    const file = new File(uri)
    return file.exists ? file.size : null
  }

  async writePageAtomic(
    partialUri: string,
    completedUri: string,
    bytes: Uint8Array,
  ): Promise<void> {
    const partial = new File(partialUri)
    partial.parentDirectory.create({ idempotent: true, intermediates: true })
    partial.create({ intermediates: true, overwrite: true })
    partial.write(bytes)
    if (partial.size !== bytes.byteLength) {
      partial.delete()
      throw new Error('页面临时文件长度不匹配')
    }
    const completed = new File(completedUri)
    completed.parentDirectory.create({ idempotent: true, intermediates: true })
    if (completed.exists) completed.delete()
    partial.move(completed)
  }
}
