import { isLanHttpEnabledFromExtra } from './connectionPolicy'

describe('isLanHttpEnabledFromExtra', () => {
  it('defaults to HTTPS-only when the build flag is absent', () => {
    expect(isLanHttpEnabledFromExtra(undefined)).toBe(false)
    expect(isLanHttpEnabledFromExtra({})).toBe(false)
  })

  it('enables LAN HTTP only for an explicitly opted-in build', () => {
    expect(isLanHttpEnabledFromExtra({ allowLanHttp: true })).toBe(true)
  })

  it('does not accept truthy string values from malformed config', () => {
    expect(isLanHttpEnabledFromExtra({ allowLanHttp: 'true' })).toBe(false)
  })
})
