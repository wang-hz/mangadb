export function formatAppVersion(version: string): string {
  const normalized = version.trim()
  if (!normalized) return 'dev'
  return `v${normalized.replace(/^v+/i, '')}`
}
