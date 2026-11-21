/**
 * Changes saved in the panel are pull requests on branches named cms/<collection>-<slug>-<time>
 * (or cms/<collection>-<slug>-delete-<time>), see src/server/admin/content.ts. Until they are merged, the
 * site and the lists still show the previous version: these helpers find which item a change belongs to.
 */
import type { Collection, PullRequestInfo } from './api';

const COLLECTIONS: Collection[] = ['news', 'activities', 'programs', 'pages'];

export interface PendingTarget {
  collection: Collection;
  slug: string;
  deleting: boolean;
}

export function changeTarget(change: PullRequestInfo): PendingTarget | null {
  for (const collection of COLLECTIONS) {
    const match = new RegExp(`^cms/${collection}-(.+)-([a-z0-9]+)$`).exec(change.branch);
    if (!match?.[1]) continue;
    const deleting = match[1].endsWith('-delete');
    return { collection, slug: deleting ? match[1].slice(0, -'-delete'.length) : match[1], deleting };
  }
  return null;
}

/** Title shown in a change ("تعديل · news: Title" → "Title"). */
export function changeTitle(change: PullRequestInfo): string {
  const index = change.title.indexOf(': ');
  return index >= 0 ? change.title.slice(index + 2) : change.title;
}
