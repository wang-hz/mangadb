interface PaginationQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  sortBy?: 'createAt' | 'updateAt';
  sortOrder?: 'asc' | 'desc';
}
