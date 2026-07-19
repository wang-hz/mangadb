export function validCoverIndex(cover: number | null, pageCount: number): number {
  if (pageCount <= 0) return 0
  return cover !== null && Number.isInteger(cover) && cover >= 0 && cover < pageCount ? cover : 0
}
