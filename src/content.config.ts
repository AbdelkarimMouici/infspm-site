import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { activitySchema, newsSchema, pageSchema, programSchema } from './content/schemas';

// One folder per language: src/content/<collection>/<locale>/<slug>.md
// Entry ids are "<locale>/<slug>"; the same slug in each folder is the same item in another language.
const pattern = '{ar,fr,en}/**/*.md';

export const collections = {
  news: defineCollection({
    loader: glob({ pattern, base: './src/content/news' }),
    schema: ({ image }) => newsSchema(image()),
  }),
  activities: defineCollection({
    loader: glob({ pattern, base: './src/content/activities' }),
    schema: ({ image }) => activitySchema(image()),
  }),
  programs: defineCollection({
    loader: glob({ pattern, base: './src/content/programs' }),
    schema: ({ image }) => programSchema(image()),
  }),
  pages: defineCollection({
    loader: glob({ pattern, base: './src/content/pages' }),
    schema: pageSchema,
  }),
};
