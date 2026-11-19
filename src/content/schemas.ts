/**
 * Zod schemas for all content collections.
 * Shared by `src/content.config.ts` (site build), the Facebook sync script and the tests,
 * so every file in `src/content/` is validated the same way everywhere.
 *
 * Frontmatter conventions (see docs/CMS.md):
 * - `status: published` is the only state shown on the site. Drafts never render.
 * - `needs-review: true` marks translated or unverified text (CLAUDE.md rule).
 * - `example: true` marks sample entries. They are hidden from production builds
 *   unless SHOW_EXAMPLE_CONTENT=true (see src/lib/content.ts).
 */
import { z } from 'astro/zod';

/** Accepts Astro's `image()` helper in the site build, or a plain string schema in scripts/tests. */
type ImageSchema = z.ZodType;

const status = z.enum(['draft', 'published']).default('draft');

const altText = z.string().trim().min(1, 'Alt text is required for every image').max(250);

export const imageWithAlt = (image: ImageSchema) =>
  z.object({
    src: image,
    alt: altText,
  });

const base = {
  /** ASCII file/URL name chosen in the CMS (Arabic titles cannot produce file names). Not used as the entry id. */
  fileSlug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase latin letters, digits and single hyphens only')
    .max(80)
    .optional(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(400).optional(),
  status,
  'needs-review': z.boolean().default(false),
  example: z.boolean().default(false),
};

/** Reasons a Facebook post needs a human decision before it can be published (CLAUDE.md, step 5). */
export const careFlags = z.enum(['memorial', 'identifiable-people', 'personal', 'other']);

export const newsSchema = (image: ImageSchema) =>
  z
    .object({
      ...base,
      date: z.coerce.date(),
      source: z.enum(['manual', 'facebook']).default('manual'),
      /** Facebook post id ("{pageId}_{postId}"), used to deduplicate synced posts. */
      fbPostId: z
        .string()
        .regex(/^\d+(_\d+)?$/, 'Facebook post ids contain only digits and one underscore')
        .optional(),
      /** Link to the original Facebook post (a plain link, never an embed). */
      fbPermalink: z.url({ protocol: /^https$/, hostname: /(^|\.)facebook\.com$/ }).optional(),
      images: z.array(imageWithAlt(image)).max(20).default([]),
      careFlags: z.array(careFlags).default([]),
    })
    .refine((d) => d.source !== 'facebook' || d.fbPostId !== undefined, {
      message: 'fbPostId is required when source is "facebook"',
      path: ['fbPostId'],
    })
    .refine((d) => !(d.status === 'published' && d.careFlags.length > 0), {
      message: 'Remove careFlags (after a human decision) before publishing',
      path: ['careFlags'],
    });

export const activitySchema = (image: ImageSchema) =>
  z
    .object({
      ...base,
      date: z.coerce.date(),
      endDate: z.coerce.date().optional(),
      location: z.string().trim().max(200).optional(),
      images: z.array(imageWithAlt(image)).max(20).default([]),
    })
    .refine((d) => !d.endDate || d.endDate >= d.date, {
      message: 'endDate must be on or after date',
      path: ['endDate'],
    });

export const programSchema = (image: ImageSchema) =>
  z.object({
    ...base,
    /** Display order in the programs list (ascending). */
    order: z.number().int().min(0).default(100),
    /** Facts below are optional: leave them empty until confirmed by the administration. */
    duration: z.string().trim().max(120).optional(),
    diploma: z.string().trim().max(200).optional(),
    admission: z.string().trim().max(600).optional(),
    image: imageWithAlt(image).optional(),
  });

/** Free-text institutional pages (About, Admissions, Privacy…). */
export const pageSchema = z.object({
  title: z.string().trim().min(1).max(200),
  /** Meta description: unique per page and language. */
  description: z.string().trim().min(1).max(170),
  status,
  'needs-review': z.boolean().default(false),
  example: z.boolean().default(false),
});

export type NewsData = z.infer<ReturnType<typeof newsSchema>>;
