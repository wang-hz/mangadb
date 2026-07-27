import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto'
import type { DownloadIdentity } from '@/downloads/types'
import { validateServerUrl } from '@/server/serverUrl'

type Digest = (value: string) => Promise<string>

export function normalizeDownloadIdentity(
  serverUrl: string,
  userUuid: string,
): DownloadIdentity {
  const normalizedUserUuid = userUuid.trim()
  if (!normalizedUserUuid) throw new Error('下载身份缺少用户标识')
  return {
    serverUrl: validateServerUrl(serverUrl).url,
    userUuid: normalizedUserUuid,
  }
}

export async function downloadIdentityKey(
  identity: DownloadIdentity,
  digest: Digest = sha256,
): Promise<string> {
  const result = await digest(`${identity.serverUrl}\u0000${identity.userUuid}`)
  if (!/^[a-f0-9]{64}$/i.test(result)) throw new Error('下载身份摘要无效')
  return result.toLowerCase()
}

async function sha256(value: string): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, value)
}
