export interface ValidatedServerUrl {
  url: string
  isCleartext: boolean
  requiresCleartextConfirmation: boolean
}

export class ServerUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServerUrlError'
  }
}

export function validateServerUrl(
  input: string,
  options: { allowLanHttp?: boolean } = {},
): ValidatedServerUrl {
  const value = input.trim()
  if (!/^https?:\/\//i.test(value)) {
    throw new ServerUrlError('服务器地址必须以 http:// 或 https:// 开头')
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new ServerUrlError('请输入有效的服务器地址')
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ServerUrlError('仅支持 HTTP 或 HTTPS 服务器')
  }
  if (!parsed.hostname) throw new ServerUrlError('服务器地址缺少主机名')
  if (parsed.username || parsed.password) {
    throw new ServerUrlError('服务器地址不能包含用户名或密码')
  }
  if (parsed.search || parsed.hash) {
    throw new ServerUrlError('服务器地址不能包含查询参数或片段')
  }

  const isCleartext = parsed.protocol === 'http:'
  const hostType = classifyLocalHost(parsed.hostname)
  if (isCleartext && hostType === 'public') {
    throw new ServerUrlError('公共网络服务器必须使用 HTTPS')
  }
  if (isCleartext && options.allowLanHttp === false) {
    throw new ServerUrlError('此应用构建仅支持 HTTPS 服务器')
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  const normalized = parsed.toString().replace(/\/$/, '')
  return {
    url: normalized,
    isCleartext,
    requiresCleartextConfirmation: isCleartext && hostType !== 'loopback',
  }
}

type HostType = 'loopback' | 'private' | 'public'

function classifyLocalHost(rawHostname: string): HostType {
  const hostname = rawHostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (hostname === 'localhost' || hostname === '::1') return 'loopback'
  if (isLoopbackIpv4(hostname)) return 'loopback'
  if (hostname.endsWith('.local')) return 'private'
  if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) return 'private'
  return 'public'
}

function isLoopbackIpv4(hostname: string): boolean {
  const parts = hostname.split('.')
  return parts.length === 4 && parts.every(part => /^\d+$/.test(part)) && Number(parts[0]) === 127
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.')
  if (parts.length !== 4 || parts.some(part => !/^\d+$/.test(part))) return false
  const octets = parts.map(Number)
  if (octets.some(octet => octet < 0 || octet > 255)) return false
  return octets[0] === 10 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
}

function isPrivateIpv6(hostname: string): boolean {
  const firstHextetText = hostname.split(':')[0]
  if (!/^[0-9a-f]{1,4}$/i.test(firstHextetText)) return false
  const firstHextet = Number.parseInt(firstHextetText, 16)
  return (firstHextet & 0xfe00) === 0xfc00 || (firstHextet & 0xffc0) === 0xfe80
}
