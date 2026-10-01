import { z } from 'zod';

export const progressOperationSchema = z.object({
  mangaUuid: z.string().uuid(),
  pageIndex: z.number().int().nonnegative().max(2147483647),
  mode: z.enum(['paged', 'scroll']),
  state: z.enum(['reading', 'completed']),
  hiddenFromRecent: z.boolean(),
  deleted: z.boolean(),
  updatedAt: z.iso.datetime({ precision: 3 }),
  operationId: z.string().uuid().transform(value => value.toLowerCase()),
}).strict();

export const progressBatchSchema = z.object({
  operations: z.array(progressOperationSchema).min(1).max(100),
}).strict();

export const progressListSchema = z.object({
  after: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

export type ProgressOperation = z.infer<typeof progressOperationSchema>;
