import { Directory, File, Paths } from 'expo-file-system'

export interface DownloadFileStore {
  ensureDirectory: (uri: string) => Promise<void>
  readText: (uri: string) => Promise<string | null>
  writeTextAtomic: (uri: string, value: string) => Promise<void>
  deleteDirectory: (uri: string) => Promise<void>
  listDirectoryNames: (uri: string) => Promise<string[]>
  fileSize: (uri: string) => Promise<number | null>
  replaceDirectoryAtomic: (
    sourceUri: string,
    destinationUri: string,
    backupUri: string,
  ) => Promise<void>
  recoverDirectoryReplacement: (
    destinationUri: string,
    backupUri: string,
    preferBackup: boolean,
  ) => Promise<void>
}

export interface DownloadPageFileStore {
  preparePagePartial: (partialUri: string) => Promise<void>
  pageFileSize: (uri: string) => Promise<number | null>
  promotePagePartial: (partialUri: string, completedUri: string) => Promise<void>
  deletePagePartial: (partialUri: string) => Promise<void>
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

  async replaceDirectoryAtomic(
    sourceUri: string,
    destinationUri: string,
    backupUri: string,
  ): Promise<void> {
    const source = new Directory(sourceUri)
    const destination = new Directory(destinationUri)
    const backup = new Directory(backupUri)
    if (!source.exists) throw new Error('替换下载目录不存在')
    if (backup.exists) backup.delete()
    if (destination.exists) destination.move(backup)
    try {
      source.move(destination)
      if (backup.exists) backup.delete()
    } catch (error) {
      if (!destination.exists && backup.exists) backup.move(destination)
      throw error
    }
  }

  async recoverDirectoryReplacement(
    destinationUri: string,
    backupUri: string,
    preferBackup: boolean,
  ): Promise<void> {
    const destination = new Directory(destinationUri)
    const backup = new Directory(backupUri)
    if (!backup.exists) return
    if (destination.exists && !preferBackup) {
      backup.delete()
      return
    }
    if (destination.exists) destination.delete()
    backup.move(destination)
  }

  async preparePagePartial(partialUri: string): Promise<void> {
    const partial = new File(partialUri)
    partial.parentDirectory.create({ idempotent: true, intermediates: true })
    if (partial.exists) partial.delete()
  }

  async pageFileSize(uri: string): Promise<number | null> {
    const file = new File(uri)
    return file.exists ? file.size : null
  }

  async promotePagePartial(partialUri: string, completedUri: string): Promise<void> {
    const partial = new File(partialUri)
    if (!partial.exists) throw new Error('页面临时文件不存在')
    const completed = new File(completedUri)
    completed.parentDirectory.create({ idempotent: true, intermediates: true })
    if (completed.exists) completed.delete()
    partial.move(completed)
  }

  async deletePagePartial(partialUri: string): Promise<void> {
    const partial = new File(partialUri)
    if (partial.exists) partial.delete()
  }
}
