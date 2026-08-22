import { request } from './request'

export interface ImportResult {
  uuid: string
  displayTitle: string
  pageCount: number
}

export interface PendingTagInput {
  name: string
  tagTypeName: string
}

export interface UploadMetadata {
  fullname: string
  displayTitle: string
  originalTitle: string
  publishDate: string | null
  tagUuids: string[]
  pendingTags: PendingTagInput[]
}

export interface UploadFileDescriptor {
  index: number
  clientKey: string
  name: string
  relativePath?: string
  size: number
  lastModified: number
}

export interface UploadSessionSummary {
  uploadId: string
  mangaUuid: string
  mode: 'zip' | 'images'
  state: 'registering' | 'uploading' | 'queued' | 'processing' | 'completed' | 'failed'
  metadata: UploadMetadata
  expectedFileCount: number
  totalBytes: number
  manifestSha256: string
  chunkSize: number
  files: UploadFileDescriptor[]
  receivedBytes: number
  receivedChunks: number
  expiresAt: string
  error?: { code: string; message: string }
  result?: ImportResult
}

interface ReceivedFileChunks {
  index: number
  receivedChunks: number[]
  hashes?: Record<number, string>
}

interface UploadStatus extends UploadSessionSummary {
  received: ReceivedFileChunks[]
}

const MAX_MANIFEST_BATCH_BYTES = 512 * 1024
const MAX_CONCURRENCY = 4
const MAX_RETRIES = 3

function canonicalManifest(files: UploadFileDescriptor[]): string {
  return [...files]
    .sort((a, b) => a.index - b.index)
    .map(file => [file.index, file.clientKey, file.name, file.relativePath ?? '', file.size, file.lastModified].join('\u0000'))
    .join('\n')
}

export async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
}

export async function manifestHash(files: UploadFileDescriptor[]): Promise<string> {
  return sha256Hex(canonicalManifest(files))
}

export function buildZipDescriptor(file: File): UploadFileDescriptor[] {
  return [{ index: 0, clientKey: file.name, name: file.name, size: file.size, lastModified: file.lastModified }]
}

export function buildImageDescriptors(files: File[]): UploadFileDescriptor[] {
  return [...files]
    .map(file => ({ file, relativePath: file.webkitRelativePath || file.name }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: 'base' }))
    .map(({ file, relativePath }, index) => ({
      index,
      clientKey: relativePath,
      name: file.name,
      relativePath,
      size: file.size,
      lastModified: file.lastModified,
    }))
}

export function splitManifestBatches(files: UploadFileDescriptor[]): UploadFileDescriptor[][] {
  const batches: UploadFileDescriptor[][] = []
  let current: UploadFileDescriptor[] = []
  for (const file of files) {
    const candidate = [...current, file]
    const size = new TextEncoder().encode(JSON.stringify(candidate)).byteLength
    if (current.length > 0 && size > MAX_MANIFEST_BATCH_BYTES) {
      batches.push(current)
      current = [file]
      continue
    }
    if (size > MAX_MANIFEST_BATCH_BYTES) throw new Error('A file manifest entry is too large')
    current = candidate
  }
  if (current.length > 0) batches.push(current)
  return batches
}

async function uploadJson<T>(url: string, body?: unknown, method = 'POST'): Promise<T> {
  return request<T>(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

function isRetryable(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500
}

function sendChunk(
  url: string,
  body: ArrayBuffer,
  hash: string,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    let settled = false
    const abort = () => { xhr.abort(); finish(new Error('Upload paused')) }
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abort)
      error ? reject(error) : resolve()
    }
    signal?.addEventListener('abort', abort, { once: true })
    xhr.open('PUT', url)
    xhr.withCredentials = true
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.setRequestHeader('X-Chunk-SHA256', hash)
    xhr.upload.addEventListener('progress', event => { if (event.lengthComputable) onProgress(event.loaded) })
    xhr.addEventListener('load', () => {
      if (xhr.status === 401) { window.location.href = '/login'; finish(new Error('Unauthorized')); return }
      if (xhr.status >= 200 && xhr.status < 300) { finish(); return }
      finish(Object.assign(new Error(`Upload failed (${xhr.status})`), { status: xhr.status }))
    })
    xhr.addEventListener('error', () => finish(Object.assign(new Error('Network error'), { status: 0 })))
    xhr.addEventListener('abort', () => finish(new Error('Upload paused')))
    xhr.send(body)
  })
}

async function sendChunkWithRetry(
  url: string,
  body: ArrayBuffer,
  hash: string,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await sendChunk(url, body, hash, onProgress, signal)
      return
    } catch (error: any) {
      if (signal?.aborted || !isRetryable(error.status ?? 0) || attempt >= MAX_RETRIES) throw error
      await wait(500 * (2 ** attempt) + Math.round(Math.random() * 200))
    }
  }
}

async function pollImport(uploadId: string, signal?: AbortSignal): Promise<ImportResult> {
  for (;;) {
    if (signal?.aborted) throw new Error('Upload paused')
    const status = await uploadJson<UploadStatus>(`/api/admin/import/uploads/${uploadId}`, undefined, 'GET')
    if (status.state === 'completed' && status.result) return status.result
    if (status.state === 'failed') throw new Error(status.error?.message ?? 'Import failed')
    await wait(1000)
  }
}

export async function listUploadSessions(): Promise<UploadSessionSummary[]> {
  return request<UploadSessionSummary[]>('/api/admin/import/uploads', { method: 'GET' })
}

export async function getUploadSession(uploadId: string): Promise<UploadSessionSummary> {
  return request<UploadSessionSummary>(`/api/admin/import/uploads/${uploadId}`, { method: 'GET' })
}

export async function cancelUpload(uploadId: string): Promise<void> {
  await uploadJson(`/api/admin/import/uploads/${uploadId}`, undefined, 'DELETE')
}

function sourceFilesForDescriptors(mode: 'zip' | 'images', files: File[], descriptors: UploadFileDescriptor[]): File[] {
  if (mode === 'zip') return files
  const byKey = new Map(files.map(file => [file.webkitRelativePath || file.name, file]))
  return descriptors.map(descriptor => {
    const file = byKey.get(descriptor.clientKey)
    if (!file || file.size !== descriptor.size || file.lastModified !== descriptor.lastModified) throw new Error('Selected files do not match the upload session')
    return file
  })
}

async function uploadChunks(
  uploadId: string,
  chunkSize: number,
  descriptors: UploadFileDescriptor[],
  files: File[],
  received: Map<string, string>,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const sourceFiles = sourceFilesForDescriptors(descriptors.length === 1 ? 'zip' : 'images', files, descriptors)
  const totalBytes = descriptors.reduce((sum, file) => sum + file.size, 0)
  const tasks: Array<{ fileIndex: number; chunkIndex: number; file: File; start: number; end: number; key: string }> = []
  let confirmed = 0
  for (const descriptor of descriptors) {
    const file = sourceFiles[descriptor.index]
    for (let chunkIndex = 0, start = 0; start < file.size; chunkIndex++, start += chunkSize) {
      const end = Math.min(start + chunkSize, file.size)
      const key = `${descriptor.index}:${chunkIndex}`
      if (received.has(key)) { confirmed += end - start; continue }
      tasks.push({ fileIndex: descriptor.index, chunkIndex, file, start, end, key })
    }
  }
  const inFlight = new Map<string, number>()
  let cursor = 0
  const updateProgress = () => {
    const active = [...inFlight.values()].reduce((sum, value) => sum + value, 0)
    onProgress(totalBytes === 0 ? 0 : Math.min(100, Math.round(((confirmed + active) / totalBytes) * 100)))
  }
  updateProgress()
  const worker = async () => {
    for (;;) {
      const task = tasks[cursor++]
      if (!task) return
      const body = await task.file.slice(task.start, task.end).arrayBuffer()
      const hash = await sha256Hex(body)
      await sendChunkWithRetry(
        `/api/admin/import/uploads/${uploadId}/files/${task.fileIndex}/chunks/${task.chunkIndex}`,
        body,
        hash,
        loaded => { inFlight.set(task.key, loaded); updateProgress() },
        signal,
      )
      inFlight.delete(task.key)
      confirmed += task.end - task.start
      updateProgress()
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, Math.max(1, tasks.length)) }, () => worker()))
}

export async function uploadImport(
  mode: 'zip' | 'images',
  files: File[],
  metadata: UploadMetadata,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
  onSession?: (uploadId: string) => void,
): Promise<ImportResult> {
  const descriptors = mode === 'zip' ? buildZipDescriptor(files[0]) : buildImageDescriptors(files)
  const totalBytes = descriptors.reduce((sum, file) => sum + file.size, 0)
  const manifestSha256 = await manifestHash(descriptors)
  const created = await uploadJson<{ uploadId: string; chunkSize: number }>(
    '/api/admin/import/uploads',
    { mode, metadata, expectedFileCount: descriptors.length, totalBytes, manifestSha256 },
  )
  onSession?.(created.uploadId)

  for (const [batchIndex, batch] of splitManifestBatches(descriptors).entries()) {
    await uploadJson(`/api/admin/import/uploads/${created.uploadId}/manifest/${batchIndex}`, batch, 'PUT')
  }
  await uploadJson(`/api/admin/import/uploads/${created.uploadId}/manifest/complete`)
  await uploadChunks(created.uploadId, created.chunkSize, descriptors, files, new Map(), onProgress, signal)
  await uploadJson(`/api/admin/import/uploads/${created.uploadId}/complete`)
  return pollImport(created.uploadId, signal)
}

export async function resumeUpload(
  session: UploadSessionSummary,
  files: File[],
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<ImportResult> {
  const descriptors = session.mode === 'zip' ? buildZipDescriptor(files[0]) : buildImageDescriptors(files)
  if (await manifestHash(descriptors) !== session.manifestSha256) throw new Error('Selected files do not match the upload session')
  const status = await uploadJson<UploadStatus>(`/api/admin/import/uploads/${session.uploadId}?includeHashes=1`, undefined, 'GET')
  const received = new Map<string, string>()
  for (const file of status.received) {
    for (const chunkIndex of file.receivedChunks) {
      const hash = file.hashes?.[chunkIndex]
      if (!hash) continue
      received.set(`${file.index}:${chunkIndex}`, hash)
    }
  }
  const sourceFiles = sourceFilesForDescriptors(session.mode, files, descriptors)
  for (const [key, expectedHash] of received) {
    const [fileIndexRaw, chunkIndexRaw] = key.split(':')
    const fileIndex = Number(fileIndexRaw)
    const chunkIndex = Number(chunkIndexRaw)
    const file = sourceFiles[fileIndex]
    const body = await file.slice(chunkIndex * session.chunkSize, Math.min((chunkIndex + 1) * session.chunkSize, file.size)).arrayBuffer()
    if (await sha256Hex(body) !== expectedHash) throw new Error('Selected files do not match the uploaded chunks')
  }
  await uploadChunks(session.uploadId, session.chunkSize, descriptors, files, received, onProgress, signal)
  await uploadJson(`/api/admin/import/uploads/${session.uploadId}/complete`)
  return pollImport(session.uploadId, signal)
}

// Kept for callers outside the web import page that still need the legacy endpoint.
export function uploadViaLegacyEndpoint(formData: FormData, onProgress: (percent: number) => void): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/admin/import/upload')
    xhr.withCredentials = true
    xhr.upload.addEventListener('progress', event => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)) })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) { resolve(JSON.parse(xhr.responseText) as ImportResult); return }
      reject(new Error(`${xhr.status}: ${xhr.responseText}`))
    })
    xhr.addEventListener('error', () => reject(new Error('Network error')))
    xhr.send(formData)
  })
}

function legacyFormData(
  mode: 'zip' | 'images',
  files: File | File[],
  fullname: string,
  displayTitle: string,
  originalTitle: string,
  publishDate: string | null,
  tagUuids: string[],
  pendingTags: PendingTagInput[],
): FormData {
  const formData = new FormData()
  formData.append('mode', mode)
  formData.append('fullname', fullname)
  formData.append('displayTitle', displayTitle)
  formData.append('originalTitle', originalTitle)
  if (publishDate) formData.append('publishDate', publishDate)
  for (const uuid of tagUuids) formData.append('tagUuids', uuid)
  if (pendingTags.length > 0) formData.append('pendingTags', JSON.stringify(pendingTags))
  if (Array.isArray(files)) files.forEach(file => formData.append('files', file))
  else formData.append('file', files)
  return formData
}

export function uploadZip(file: File, fullname: string, displayTitle: string, originalTitle: string, publishDate: string | null, tagUuids: string[], pendingTags: PendingTagInput[], onProgress: (percent: number) => void): Promise<ImportResult> {
  return uploadViaLegacyEndpoint(legacyFormData('zip', file, fullname, displayTitle, originalTitle, publishDate, tagUuids, pendingTags), onProgress)
}

export function uploadImages(files: File[], fullname: string, displayTitle: string, originalTitle: string, publishDate: string | null, tagUuids: string[], pendingTags: PendingTagInput[], onProgress: (percent: number) => void): Promise<ImportResult> {
  return uploadViaLegacyEndpoint(legacyFormData('images', files, fullname, displayTitle, originalTitle, publishDate, tagUuids, pendingTags), onProgress)
}
