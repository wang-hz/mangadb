export interface ImportResult {
  uuid: string
  displayTitle: string
  pageCount: number
}

function uploadViaXhr(
  formData: FormData,
  onProgress: (percent: number) => void,
): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/admin/import/upload')
    xhr.withCredentials = true

    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })

    xhr.addEventListener('load', () => {
      if (xhr.status === 401) {
        window.location.href = '/login'
        reject(new Error('Unauthorized'))
        return
      }
      if (xhr.status >= 400) {
        reject(new Error(`${xhr.status}: ${xhr.responseText}`))
        return
      }
      try {
        resolve(JSON.parse(xhr.responseText))
      } catch {
        reject(new Error('Invalid response'))
      }
    })

    xhr.addEventListener('error', () => reject(new Error('Network error')))
    xhr.send(formData)
  })
}

export interface PendingTagInput {
  name: string
  tagTypeName: string
}

function buildFormData(
  mode: string,
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
  return formData
}

export function uploadZip(
  file: File,
  fullname: string,
  displayTitle: string,
  originalTitle: string,
  publishDate: string | null,
  tagUuids: string[],
  pendingTags: PendingTagInput[],
  onProgress: (percent: number) => void,
): Promise<ImportResult> {
  const formData = buildFormData('zip', fullname, displayTitle, originalTitle, publishDate, tagUuids, pendingTags)
  formData.append('file', file)
  return uploadViaXhr(formData, onProgress)
}

export function uploadImages(
  files: File[],
  fullname: string,
  displayTitle: string,
  originalTitle: string,
  publishDate: string | null,
  tagUuids: string[],
  pendingTags: PendingTagInput[],
  onProgress: (percent: number) => void,
): Promise<ImportResult> {
  const formData = buildFormData('images', fullname, displayTitle, originalTitle, publishDate, tagUuids, pendingTags)
  for (const file of files) formData.append('files', file)
  return uploadViaXhr(formData, onProgress)
}