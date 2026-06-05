// 2:3 gray placeholder shown when a cover image fails to load
const IMG_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3'%3E%3Crect fill='%23f0f0f0' width='2' height='3'/%3E%3C/svg%3E"

interface Props {
  uuid: string
  /** Index into manga.pages used as the cover; defaults to 0 */
  cover?: number | null
  style?: React.CSSProperties
  /** Request a small thumbnail instead of the full image */
  thumb?: boolean
}

export default function CoverImage({ uuid, cover, style, thumb }: Props) {
  return (
    <img
      src={`/api/file/mangas/${uuid}/pages/${cover ?? 0}${thumb ? '?thumb=1' : ''}`}
      alt=""
      loading="lazy"
      decoding="async"
      style={{ display: 'block', ...style }}
      onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
        e.currentTarget.onerror = null
        e.currentTarget.src = IMG_FALLBACK
      }}
    />
  )
}