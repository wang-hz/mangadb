import { Directory, File, Paths } from 'expo-file-system'

export interface DownloadFileStore {
  ensureDirectory: (uri: string) => Promise<void>
  readText: (uri: string) => Promise<string | null>
  writeTextAtomic: (uri: string, value: string) => Promise<void>
  deleteDirectory: (uri: string) => Promise<void>
}

export function defaultDownloadRootUri(): string {
  return new Directory(Paths.document, 'mangadb-downloads', 'v1').uri
}

export class ExpoDownloadFileStore implements DownloadFileStore {
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
}
