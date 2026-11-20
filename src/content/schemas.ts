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
// Factories are generic so the image type (ImageMetadata in the site build) flows into the entry types.

const status = z.enum(['draft', 'published']).default('draft');

const altText = z.string().trim().min(1, 'Alt text is required for every image').max(250);

export const imageWithAlt = <T extends ImageSchema>(image: T) =>
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

/**
 * Unpublished entries (drafts, Facebook imports awaiting the consent check) never resolve their images:
 * Astro would otherwise copy the files into the build and deploy them, even though the page is not published.
 */
export function withoutUnpublishedImages(data: unknown): unknown {
  if (data && typeof data === 'object' && (data as { status?: unknown }).status !== 'published') {
    const copy = { ...(data as Record<string, unknown>) };
    delete copy['images'];
    delete copy['image'];
    return copy;
  }
  return data;
}

/** Reasons a Facebook post needs a human decision before it can be published (CLAUDE.md, step 5). */
export const careFlags = z.enum(['memorial', 'identifiable-people', 'personal', 'other']);

export const newsSchema = <T extends ImageSchema>(image: T) =>
  z.preprocess(
    withoutUnpublishedImages,
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
    }),
  );

export const activitySchema = <T extends ImageSchema>(image: T) =>
  z.preprocess(
    withoutUnpublishedImages,
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
    }),
  );

export const programSchema = <T extends ImageSchema>(image: T) =>
  z.preprocess(
    withoutUnpublishedImages,
    z.object({
    ...base,
    /** Display order in the programs list (ascending). */
    order: z.number().int().min(0).default(100),
    /** Facts below are optional: leave them empty until confirmed by the administration. */
    duration: z.string().trim().max(120).optional(),
    diploma: z.string().trim().max(200).optional(),
    admission: z.string().trim().max(600).optional(),
    image: imageWithAlt(image).optional(),
  }),
  );

/** Free-text institutional pages (About, Admissions, Privacy…). */
export const pageSchema = z.object({
  title: z.string().trim().min(1).max(200),
  /** Meta description: unique per page and language. */
  description: z.string().trim().min(1).max(170),
  status,
  'needs-review': z.boolean().default(false),
  example: z.boolean().default(false),
});

/**
 * Site settings edited in the CMS ("Settings"): src/content/settings/site.json.
 * Empty strings mean "not confirmed yet": the site then shows "to be confirmed" instead of a value.
 */
const localizedLine = z.object({
  ar: z.string().trim().max(300).default(''),
  fr: z.string().trim().max(300).default(''),
  en: z.string().trim().max(300).default(''),
});
const emptyOr = <T extends z.ZodType>(schema: T) => z.union([z.literal(''), schema]).default('');

export const settingsSchema = z.object({
  /** Path from src/content/settings/ to a logo inside src/assets/brand/. */
  logo: z.string().regex(/^\.\.\/\.\.\/assets\/brand\/[\w.-]+\.(png|jpe?g|webp|svg)$/i, 'The logo must be in src/assets/brand/'),
  /** Show demo entries (example: true) on the public site until the official content is in. */
  showExamples: z.boolean().default(false),
  email: z.email(),
  phone: z.string().trim().max(40).default(''),
  address: localizedLine,
  hours: localizedLine,
  facebookUrl: emptyOr(z.url({ protocol: /^https$/, hostname: /(^|\.)facebook\.com$/ })),
  mapUrl: emptyOr(z.url({ protocol: /^https$/ })),
});

export type Settings = z.infer<typeof settingsSchema>;

export type NewsData = z.infer<ReturnType<typeof newsSchema>>;
