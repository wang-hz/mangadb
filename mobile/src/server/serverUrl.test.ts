import { validateServerUrl } from './serverUrl'

describe('validateServerUrl', () => {
  it('normalizes trusted HTTPS servers and preserves a reverse-proxy path', () => {
    expect(validateServerUrl(' https://Example.COM:8443/mangadb/ ')).toEqual({
      url: 'https://example.com:8443/mangadb',
      isCleartext: false,
      requiresCleartextConfirmation: false,
    })
  })

  it.each([
    'http://10.0.0.8:3000',
    'http://172.20.1.2',
    'http://192.168.50.3',
    'http://169.254.2.3',
    'http://library.local:3000',
    'http://[fd00::20]:3000',
    'http://[fe80::20]:3000',
  ])('allows local cleartext server %s with a warning', value => {
    expect(validateServerUrl(value).requiresCleartextConfirmation).toBe(true)
  })

  it.each([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://[::1]:3000',
  ])('allows loopback cleartext server %s without a warning', value => {
    expect(validateServerUrl(value).requiresCleartextConfirmation).toBe(false)
  })

  it.each([
    'http://example.com',
    'http://8.8.8.8:3000',
    'http://172.15.255.255',
    'http://172.32.0.1',
    'ftp://192.168.1.2',
    'mangadb.local:3000',
    'https://user:password@example.com',
    'https://example.com?token=secret',
    'https://example.com/#reader',
  ])('rejects unsafe or malformed server address %s', value => {
    expect(() => validateServerUrl(value)).toThrow()
  })
})
