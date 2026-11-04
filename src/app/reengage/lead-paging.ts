type PageRequest = {
  limit: number;
  offset: number;
};

type PageResponse<T> = {
  data: T[];
  total: number;
};

type PagedCollection<T> = {
  items: T[];
  total: number;
  capReached: boolean;
};

type PagingOptions = {
  maxItems?: number;
  pageSize?: number;
};

const LEAD_PAGE_SIZE = 100;
const LEAD_FETCH_CAP = 10_000;

async function fetchPagedCollection<T>(
  fetchPage: (request: PageRequest) => Promise<PageResponse<T>>,
  options: PagingOptions = {},
): Promise<PagedCollection<T>> {
  const pageSize = Math.max(1, Math.floor(options.pageSize ?? LEAD_PAGE_SIZE));
  const maxItems = Math.max(1, Math.floor(options.maxItems ?? LEAD_FETCH_CAP));
  const items: T[] = [];
  let total = 0;

  while (items.length < maxItems) {
    const limit = Math.min(pageSize, maxItems - items.length);
    const page = await fetchPage({ limit, offset: items.length });
    total = Math.max(0, Math.floor(Number(page.total) || 0));
    const nextItems = page.data.slice(0, limit);
    items.push(...nextItems);

    if (items.length >= total) {
      return { items, total: Math.max(total, items.length), capReached: false };
    }
    if (nextItems.length === 0) {
      throw new Error(`The lead service returned an incomplete page (${items.length} of ${total} rows).`);
    }
  }

  return { items, total: Math.max(total, items.length), capReached: items.length < total };
}

export { LEAD_FETCH_CAP, LEAD_PAGE_SIZE, fetchPagedCollection };
export type { PageRequest, PageResponse, PagedCollection, PagingOptions };
