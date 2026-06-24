import { defineCollection, z } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';
import { glob } from 'astro/loaders';

// The docs live in the repo's top-level `docs/` folder (the single source of truth,
// also used to generate README.md), not the default `src/content/docs`. Load them
// from there, excluding the README wrappers in `docs/_readme/`. `readme: false`
// (on the splash landing) is an extra frontmatter flag the README generator reads.
export const collections = {
  docs: defineCollection({
    loader: glob({ pattern: ['**/*.md', '!**/_readme/**'], base: '../docs' }),
    schema: docsSchema({
      extend: z.object({
        readme: z.boolean().optional(),
      }),
    }),
  }),
};
