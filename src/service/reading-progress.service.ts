import prisma from '@/config/database';
import type { ProgressOperation } from '@/type/reading-progress';

const include = { manga: { select: {
  uuid: true, displayTitle: true, originalTitle: true, publishDate: true,
  cover: true, createAt: true, updateAt: true, pages: true,
} } };

function serialize(record: NonNullable<Awaited<ReturnType<typeof findProgress>>>) {
  const { userUuid: _userUuid, manga: { pages, ...manga }, ...progress } = record;
  const pageCount = Array.isArray(pages) ? pages.length : 0;
  return {
    ...progress,
    pageIndex: Math.max(0, Math.min(progress.pageIndex, pageCount - 1)),
    pageCount, manga,
  };
}

function findProgress(userUuid: string, mangaUuid: string) {
  return prisma.readingProgress.findUnique({ where: { userUuid_mangaUuid: { userUuid, mangaUuid } }, include });
}

export const readingProgressService = {
  async get(userUuid: string, mangaUuid: string) {
    const record = await findProgress(userUuid, mangaUuid);
    return record ? serialize(record) : null;
  },

  async list(userUuid: string, limit: number, after?: string) {
    const records = await prisma.readingProgress.findMany({
      where: { userUuid, ...(after ? { mangaUuid: { gt: after } } : {}) },
      orderBy: { mangaUuid: 'asc' }, take: limit + 1, include,
    });
    return {
      items: records.slice(0, limit).map(serialize),
      next: records.length > limit ? records[limit - 1].mangaUuid : null,
      serverTime: new Date().toISOString(),
    };
  },

  async submit(userUuid: string, operations: ProgressOperation[]) {
    // Bound operations from incorrectly set future clocks without changing retry IDs.
    const now = new Date();
    if (operations.some(operation => Date.parse(operation.updatedAt) > now.getTime() + 60000)) {
      throw new RangeError('Reading operation is ahead of server time');
    }
    const items = [];
    const missing = [];
    // Sort keys so concurrent batches acquire row locks in the same order.
    for (const operation of [...operations].sort((a, b) => a.mangaUuid.localeCompare(b.mangaUuid))) {
      const item = await prisma.$transaction(async tx => {
        await tx.$executeRaw`
          INSERT INTO reading_progress
            (user_uuid, manga_uuid, page_index, mode, state, hidden_from_recent, deleted, updated_at, operation_id)
          SELECT ${userUuid}, m.uuid,
            CASE WHEN ${operation.deleted} THEN 0 ELSE LEAST(${operation.pageIndex}, GREATEST(0, jsonb_array_length(m.pages) - 1)) END,
            ${operation.mode}, ${operation.state}, ${operation.hiddenFromRecent}, ${operation.deleted},
            ${new Date(operation.updatedAt)}, ${operation.operationId}
          FROM manga m WHERE m.uuid = ${operation.mangaUuid}
          ON CONFLICT (user_uuid, manga_uuid) DO UPDATE SET
            page_index = EXCLUDED.page_index, mode = EXCLUDED.mode, state = EXCLUDED.state,
            hidden_from_recent = EXCLUDED.hidden_from_recent, deleted = EXCLUDED.deleted,
            updated_at = EXCLUDED.updated_at, operation_id = EXCLUDED.operation_id
          WHERE (reading_progress.updated_at, reading_progress.operation_id COLLATE "C")
            < (EXCLUDED.updated_at, EXCLUDED.operation_id COLLATE "C")
        `;
        const record = await tx.readingProgress.findUnique({
          where: { userUuid_mangaUuid: { userUuid, mangaUuid: operation.mangaUuid } }, include,
        });
        return record ? serialize(record) : null;
      });
      if (item) items.push(item);
      else missing.push(operation.mangaUuid);
    }
    return { items, missing, serverTime: new Date().toISOString() };
  },
};
