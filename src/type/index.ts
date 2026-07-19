export interface PaginationQuery {
  page?: string;
  limit?: string;
  search?: string;
  sortBy?: 'createAt' | 'updateAt' | 'publishDate';
  sortOrder?: 'asc' | 'desc';
  view?: 'full' | 'summary';
}

export * from './pagination';
