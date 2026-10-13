import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/[^_]*.md' }),
  schema: z.object({
    name: z.string(),
    /** `owner/name` on GitHub. Stars, language and activity are read from it at build time. */
    repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
    summary: z.string(),
    tags: z.array(z.string()).default([]),
    /** Lower sorts first. */
    order: z.number().default(100),
    website: z.url().optional(),
  }),
});

export const collections = { projects };
