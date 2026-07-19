import { z } from 'zod';

const pageSchema = z.coerce.number().int().positive().default(1);
const limitSchema = z.coerce.number().int().positive().max(100).default(10);
const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

const basePaginationShape = {
  page: pageSchema,
  limit: limitSchema,
};

export const mangaListQuerySchema = z.object({
  ...basePaginationShape,
  search: z.string().optional(),
  sortBy: z.enum(['createAt', 'updateAt', 'publishDate']).default('createAt'),
  sortOrder: sortOrderSchema,
  view: z.enum(['full', 'summary']).default('full'),
});

export const tagListQuerySchema = z.object({
  ...basePaginationShape,
  search: z.string().optional(),
  sortBy: z.enum(['createAt', 'updateAt']).default('createAt'),
  sortOrder: sortOrderSchema,
  tagTypeName: z.string().optional(),
});

export const paginationQuerySchema = z.object(basePaginationShape);

export type MangaListQuery = z.infer<typeof mangaListQuerySchema>;
export type MangaListView = MangaListQuery['view'];
export type MangaSortBy = MangaListQuery['sortBy'];
export type SortOrder = MangaListQuery['sortOrder'];
export type TagListQuery = z.infer<typeof tagListQuerySchema>;
