import type { GitHubOptions } from './github';

/**
 * GitHub options for the build. Kept apart from github.ts because `process`
 * only exists in Node, and the Worker imports github.ts too.
 */
export const buildOptions: GitHubOptions = { token: process.env.GITHUB_TOKEN };
