/** The URL page (one page's SEO story) for a URL. Shown only with the `data` flag and analytics.read, decided by the caller. */
export const urlHistoryHref = (url: string) => `/performance/url?u=${encodeURIComponent(url)}`;
