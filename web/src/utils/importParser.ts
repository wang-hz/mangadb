// Parses manga filenames following the convention:
// [time] (event) [artist] title [tag1][tag2]
// Python named groups (?P<name>) converted to JS (?<name>)
const FILENAME_REGEX =
  /^\s*(?:\[(?<time>[^\]]+)]\s*)?(?:\((?<event>[^)]+)\)\s*)?\[(?<artist>[^\]]+)]\s*(?<title>[^\[]+?)\s*(?<tags>(?:\[[^\]]+]\s*)*)$/

export interface ParsedFilename {
  displayTitle: string
  originalTitle: string
  publishDate: string | null
  group: string | null
  artist: string | null
  event: string | null
  parody: string | null
  tags: string[]
  matched: boolean
}

function parseDate(timeStr: string): string | null {
  const s = timeStr.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`
  const ymMatch = s.match(/^(\d{4})\D(\d{1,2})/)
  if (ymMatch) return `${ymMatch[1]}-${ymMatch[2].padStart(2, '0')}-01`
  const yMatch = s.match(/^(\d{4})/)
  if (yMatch) return `${yMatch[1]}-01-01`
  return null
}

function parseTags(tagsStr: string): string[] {
  return (tagsStr.match(/\[([^\]]+)\]/g) ?? [])
    .map(m => m.slice(1, -1).trim())
    .filter(Boolean)
}

// Splits "text1 (text2)" → { main: "text1", sub: "text2" }.
// Uses greedy matching so "A (B) (C)" → main="A (B)", sub="C".
// Returns sub=null when the pattern doesn't match.
function splitTrailingParen(str: string): { main: string; sub: string | null } {
  const match = str.match(/^(.*\S)\s+\(([^)]+)\)$/)
  if (!match) return { main: str, sub: null }
  return { main: match[1].trim(), sub: match[2].trim() }
}

// Only strips known archive extensions. Do NOT call this on folder names —
// folder names may contain dots (e.g. "Vol.1") that must not be removed.
export function stripArchiveExtension(filename: string): string {
  return filename.replace(/\.(zip|cbz)$/i, '')
}

export function parseFilename(name: string): ParsedFilename {
  const match = FILENAME_REGEX.exec(name)
  if (!match?.groups) {
    return {
      displayTitle: name,
      originalTitle: name,
      publishDate: null,
      group: null,
      artist: null,
      event: null,
      parody: null,
      tags: [],
      matched: false,
    }
  }

  const { time, event, artist, title, tags } = match.groups

  // "[Group (Author)]" → group + artist
  const artistRaw = artist?.trim() ?? ''
  const { main: group, sub: parsedArtist } = artistRaw
    ? splitTrailingParen(artistRaw)
    : { main: null, sub: null }

  // Step 1: split trailing "(parody)" from the whole title string
  // Step 2: split "original｜display" on the remaining part
  // Format: "original_title｜display_title (parody)"
  const titleRaw = title?.trim() ?? name
  const { main: titleMain, sub: parody } = splitTrailingParen(titleRaw)

  const pipeIdx = titleMain.indexOf('｜')
  const originalTitle = pipeIdx >= 0 ? titleMain.slice(0, pipeIdx).trim() : titleMain
  const displayTitle  = pipeIdx >= 0 ? titleMain.slice(pipeIdx + 1).trim() : titleMain

  return {
    displayTitle,
    originalTitle,
    publishDate: time ? parseDate(time) : null,
    group: parsedArtist !== null ? group : null,
    artist: parsedArtist ?? (artistRaw || null),
    event: event?.trim() ?? null,
    parody,
    tags: tags ? parseTags(tags) : [],
    matched: true,
  }
}
