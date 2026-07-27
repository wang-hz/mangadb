import { downloadIdentityKey, normalizeDownloadIdentity } from '@/downloads/identity'

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(),
}))

describe('download identity', () => {
  it('normalizes server URLs and trims the user UUID', () => {
    expect(normalizeDownloadIdentity('https://example.com/base/', ' user-1 ')).toEqual({
      serverUrl: 'https://example.com/base',
      userUuid: 'user-1',
    })
  })

  it('derives a validated lower-case digest without exposing identity values', async () => {
    const digest = jest.fn().mockResolvedValue('A'.repeat(64))
    const key = await downloadIdentityKey({
      serverUrl: 'https://example.com',
      userUuid: 'user-1',
    }, digest)

    expect(key).toBe('a'.repeat(64))
    expect(key).not.toContain('example.com')
    expect(key).not.toContain('user-1')
    expect(digest).toHaveBeenCalledWith('https://example.com\u0000user-1')
  })

  it('rejects empty users and invalid digest results', async () => {
    expect(() => normalizeDownloadIdentity('https://example.com', ' ')).toThrow(
      '下载身份缺少用户标识',
    )
    await expect(downloadIdentityKey(
      { serverUrl: 'https://example.com', userUuid: 'user-1' },
      async () => 'not-a-digest',
    )).rejects.toThrow('下载身份摘要无效')
  })
})
