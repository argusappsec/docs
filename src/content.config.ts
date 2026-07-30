import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { defineCollection } from 'astro:content';

// `docsLoader()` hard-codes its base to `<srcDir>/content/docs` and does not
// expose it, which is why the Mirror physically sits at
// `src/content/docs/guide/` and why every Guide URL is prefixed `/guide/`.
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
