export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  /**
   * Optional GitHub token for `/api/github`, set with `wrangler secret put`.
   * Cloudflare's addresses share GitHub's anonymous limit of 60 requests an
   * hour, so without it the live commit list may fall back to the build's.
   */
  GITHUB_TOKEN?: string;
}
