interface PaginationQuery {
  page?: string;
  limit?: string;
  search?: string;
  sortBy?: 'createAt' | 'updateAt';
  sortOrder?: 'asc' | 'desc';
}
