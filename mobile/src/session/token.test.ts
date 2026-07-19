import { userFromToken } from './token'

function token(payload: object): string {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `${encode({ alg: 'none' })}.${encode(payload)}.`
}

describe('userFromToken', () => {
  it('reads a valid MangaDB session payload', () => {
    const value = userFromToken(token({
      sub: 'reader',
      uuid: 'user-1',
      role: 'user',
      exp: 2_000,
    }), 1_000_000)

    expect(value).toEqual({
      uuid: 'user-1',
      username: 'reader',
      role: 'user',
      expiresAt: 2_000_000,
    })
  })

  it('rejects expired and malformed tokens', () => {
    expect(userFromToken(token({ sub: 'reader', uuid: 'user-1', role: 'user', exp: 1 }), 2_000)).toBeNull()
    expect(userFromToken('not-a-token')).toBeNull()
    expect(userFromToken(token({ sub: 'reader' }))).toBeNull()
  })
})
