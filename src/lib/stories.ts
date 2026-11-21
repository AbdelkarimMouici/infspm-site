/**
 * Home-page stories (the circles at the top of the home page), built at build time from the content:
 * 1. "New": the latest news and activities (automatic, can be switched off in Settings → newsStory);
 * 2. one story per published program, followed by the pictures and text of a story entry linked to it;
 * 3. extra stories written in the admin panel (events, announcements).
 * Everything is rendered as HTML by Stories.astro; the viewer script only shows and hides it.
 */
import type { ImageMetadata } from 'astro';
import { getCollection } from 'astro:content';
import type { BrandColor, IconName } from '~/content/schemas';
import { defaultLocale, type Locale } from '~/i18n/config';
import { t } from '~/i18n/utils';
import { site } from '~/config/site';
import { formatDate } from './format';
import { getLocalizedEntries, type LocalizedEntry } from './localized';
import { showExamples, splitId } from './content';

export interface StoryLink {
  href: string;
  label: string;
}

export type Slide =
  | { kind: 'text'; kicker: string; title: string; text?: string; subLang?: Locale; tag?: string; icon: IconName; lang?: Locale; link?: StoryLink }
  | { kind: 'image'; kicker?: string; title: string; image: ImageMetadata; alt: string; lang?: Locale; link?: StoryLink };

export interface Story {
  key: string;
  label: string;
  title: string;
  color: BrandColor;
  icon: IconName;
  cover?: { image: ImageMetadata; alt: string };
  isNew?: boolean;
  lang?: Locale;
  slides: Slide[];
}

const NEWS_SLIDES = 3;

/** Language of an entry's text on this page (undefined when it is the page language). */
const langOf = (item: { contentLocale: Locale; isFallback: boolean }): Locale | undefined => (item.isFallback ? item.contentLocale : undefined);

function storyExtras(item: LocalizedEntry<'stories'> | undefined, link?: StoryLink): Slide[] {
  if (!item) return [];
  const data = item.entry.data;
  const lang = langOf(item);
  const own = data.link ? { href: data.link, label: data.linkLabel ?? '' } : link;
  const slides: Slide[] = [];
  if (data.summary) {
    slides.push({ kind: 'text', kicker: data.title, title: data.title, text: data.summary, icon: data.icon, ...(lang ? { lang } : {}), ...(own ? { link: own } : {}) });
  }
  for (const picture of data.images) {
    slides.push({ kind: 'image', title: data.title, image: picture.src, alt: picture.alt, ...(lang ? { lang } : {}), ...(own ? { link: own } : {}) });
  }
  return slides;
}

/**
 * Program names in the other official language (French on Arabic pages, Arabic on French/English pages),
 * shown under each program's name.
 */
export async function otherProgramNames(locale: Locale): Promise<{ otherLocale: Locale; names: Map<string, string> }> {
  const otherLocale: Locale = locale === defaultLocale ? 'fr' : defaultLocale;
  const names = new Map<string, string>();
  for (const entry of await getCollection('programs')) {
    const { locale: entryLocale, slug } = splitId(entry.id);
    if (entryLocale === otherLocale && entry.data.status === 'published' && (showExamples || !entry.data.example)) names.set(slug, entry.data.title);
  }
  return { otherLocale, names };
}

export async function getStories(locale: Locale): Promise<Story[]> {
  const stories: Story[] = [];

  // 1. Latest news and activities
  if (site.newsStory) {
    const [news, activities] = await Promise.all([getLocalizedEntries('news', locale), getLocalizedEntries('activities', locale)]);
    const latest = [
      ...news.map((item) => ({ item, kind: 'news' as const })),
      ...activities.map((item) => ({ item, kind: 'activities' as const })),
    ]
      .sort((a, b) => b.item.entry.data.date.getTime() - a.item.entry.data.date.getTime())
      .slice(0, NEWS_SLIDES);
    if (latest.length > 0) {
      stories.push({
        key: 'new',
        label: t(locale, 'home.storyNew'),
        title: t(locale, 'home.storyNewTitle'),
        color: 'navy',
        icon: 'news',
        isNew: true,
        slides: latest.map(({ item, kind }): Slide => {
          const data = item.entry.data;
          const kicker = `${t(locale, kind === 'news' ? 'home.kindNews' : 'home.kindActivity')} · ${formatDate(data.date, locale)}`;
          const link = { href: `/${locale}/${kind}/${item.slug}/`, label: t(locale, 'common.readMore') };
          const lang = langOf(item);
          const picture = data.images[0];
          return picture
            ? { kind: 'image', kicker, title: data.title, image: picture.src, alt: picture.alt, link, ...(lang ? { lang } : {}) }
            : { kind: 'text', kicker, title: data.title, ...(data.summary ? { text: data.summary } : {}), icon: kind === 'news' ? 'news' : 'calendar', link, ...(lang ? { lang } : {}) };
        }),
      });
    }
  }

  // Story entries, by program they belong to
  const storyEntries = await getLocalizedEntries('stories', locale);
  const linked = new Map<string, LocalizedEntry<'stories'>>();
  for (const item of storyEntries) if (item.entry.data.program) linked.set(item.entry.data.program, item);

  // 2. Programs (the other official language's name is shown under the title)
  const programs = (await getLocalizedEntries('programs', locale)).sort((a, b) => a.entry.data.order - b.entry.data.order);
  const { otherLocale, names: otherNames } = await otherProgramNames(locale);
  for (const item of programs) {
    const data = item.entry.data;
    const extra = linked.get(item.slug);
    const lang = langOf(item);
    const details = { href: `/${locale}/programs/${item.slug}/`, label: t(locale, 'home.storyDetails') };
    const other = otherNames.get(item.slug);
    const tag = [data.abbr, data.duration].filter(Boolean).join(' · ');
    const cover = extra?.entry.data.images[0];
    stories.push({
      key: `program-${item.slug}`,
      label: data.shortTitle ?? data.title,
      title: data.title,
      color: data.color,
      icon: data.icon,
      ...(cover ? { cover: { image: cover.src, alt: cover.alt } } : {}),
      ...(lang ? { lang } : {}),
      slides: [
        {
          kind: 'text',
          kicker: t(locale, 'home.storyProgram'),
          title: data.title,
          ...(other && other !== data.title ? { text: other, subLang: otherLocale } : {}),
          ...(tag ? { tag } : {}),
          icon: data.icon,
          link: details,
          ...(lang ? { lang } : {}),
        },
        ...storyExtras(extra, details),
      ],
    });
  }

  // 3. Extra stories (not linked to a program), by order
  const extras = storyEntries.filter((item) => !item.entry.data.program).sort((a, b) => a.entry.data.order - b.entry.data.order);
  for (const item of extras) {
    const data = item.entry.data;
    const lang = langOf(item);
    const slides = storyExtras(item);
    if (slides.length === 0) {
      slides.push({ kind: 'text', kicker: data.title, title: data.title, icon: data.icon, ...(lang ? { lang } : {}) });
    }
    const cover = data.images[0];
    stories.push({
      key: `story-${item.slug}`,
      label: data.title,
      title: data.title,
      color: data.color,
      icon: data.icon,
      ...(cover ? { cover: { image: cover.src, alt: cover.alt } } : {}),
      ...(lang ? { lang } : {}),
      slides,
    });
  }
  return stories;
}
