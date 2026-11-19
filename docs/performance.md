# Loading and navigation

Private API responses use a bounded browser-memory cache. Nothing is persisted
to browser storage or a shared CDN. Session checks, credentials, errors and sends
are never cached. Login, logout and authorization failures clear cached data;
session changes notify other tabs. Writes invalidate data before and after the
request. Concurrent matching reads share one network request.

Leads, campaign lists, summary and other general reads remain fresh for 30
seconds. Conversations use 2 seconds, delivery activity and campaign results use
3 seconds, and read-only Meta connection checks use 20 seconds. Pages can render
previously loaded data immediately for up to 2 minutes while revalidating in the
background. Manual refresh bypasses the cache. The cache holds at most 80 entries
and approximately 8 MiB of response text.

The header inbox badge and inbox list share the same conversation response.
Sensitive HTTP requests still use `cache: no-store`; caching happens only within
the signed-in app session in memory.

## Verified measurements — 19 November 2026

The request-cache probe used actual authenticated production API responses. Its
second read reused the same response locally, including JSON parsing. These
measure data access, not complete browser rendering or Core Web Vitals.

| Data | First read | Cached revisit | Revisit network requests |
| --- | ---: | ---: | ---: |
| Leads | 1,857 ms | 1.57 ms | 0 |
| Campaigns | 2,360 ms | 0.41 ms | 0 |
| Summary | 809 ms | 0.29 ms | 0 |
| Conversations | 2,386 ms | 0.31 ms | 0 |

Kept: short-lived memory caching, concurrent-request coalescing and immediate
reuse of cached page data. Auth and sending decisions remain fresh on the server.
