// Discover tab: topics grouped into one row per category, the way Android's HomeViewModel.updateDiscoverCategories does.
// The API names categories two ways: `categories` in the topics response is a list of display names ("News"), while each topic
// carries the category id ("news"). Matching is case-insensitive so the two line up (the old `topicsByCategory` compared them
// directly and so was always empty).

export interface CategorizedTopic {
  category: string;
}

export interface CategoryGroup<T> {
  /** Display name for the row title. */
  title: string;
  topics: T[];
}

const titleCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * One group per category with at least one topic. Server category order is kept; categories the server did not list (a topic
 * whose category is new) are appended, A to Z with uncategorized ("Other") last, so no topic is ever dropped.
 */
export function groupTopicsByCategory<T extends CategorizedTopic>(topics: readonly T[], categoryNames: readonly string[]): CategoryGroup<T>[] {
  const byKey = new Map<string, T[]>();
  for (const t of topics) {
    const key = (t.category ?? '').toLowerCase();
    const list = byKey.get(key);
    if (list) list.push(t);
    else byKey.set(key, [t]);
  }
  const groups: CategoryGroup<T>[] = [];
  for (const name of categoryNames) {
    const key = name.toLowerCase();
    const list = byKey.get(key);
    if (list) {
      groups.push({ title: name, topics: list });
      byKey.delete(key);
    }
  }
  const rest = [...byKey.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b))); // uncategorized last
  for (const [key, list] of rest) groups.push({ title: titleCase(key) || 'Other', topics: list });
  return groups;
}
