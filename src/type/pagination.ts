import { z } from 'zod';

function decimalInteger(max: number) {
  return z.preprocess(
    value => typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value,
    z.number().int().positive().max(max).safe(),
  );
}

const pageSchema = decimalInteger(1_000_000).default(1);
const limitSchema = decimalInteger(100).default(10);
const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');
const publishYearSchema = z.preprocess(
  value => typeof value === 'string' && /^\d{4}$/.test(value) ? Number(value) : value,
  z.number().int().min(1000).max(9999),
);
const tagUuidsSchema = z.preprocess(
  value => typeof value === 'string'
    ? value.split(',').map(item => item.trim()).filter(Boolean)
    : value,
  z.array(z.string().uuid()).max(20),
);

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
  tagUuids: tagUuidsSchema.optional(),
  publishYearFrom: publishYearSchema.optional(),
  publishYearTo: publishYearSchema.optional(),
}).superRefine((value, context) => {
  if (
    value.publishYearFrom !== undefined &&
    value.publishYearTo !== undefined &&
    value.publishYearFrom > value.publishYearTo
  ) {
    context.addIssue({
      code: 'custom',
      path: ['publishYearTo'],
      message: 'publishYearTo must be greater than or equal to publishYearFrom',
    });
  }
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
