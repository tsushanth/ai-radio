// Rows for the Settings "Hidden topics" list: the ids the user hid (kept in preferences), shown by name when the topic list has
// them. An id with no matching topic (e.g. a locale-only topic while another language is selected) is still listed, by id, so it
// can always be un-hidden.
export interface HiddenRow {
  id: string;
  name: string;
  known: boolean;
}

export function hiddenTopicRows(hiddenIds: readonly string[] | undefined, topics: readonly { id: string; name: string }[]): HiddenRow[] {
  const byId = new Map(topics.map((t) => [t.id, t.name]));
  const seen = new Set<string>();
  const rows: HiddenRow[] = [];
  for (const id of hiddenIds ?? []) {
    if (typeof id !== 'string' || !id || seen.has(id)) continue;
    seen.add(id);
    const name = byId.get(id);
    rows.push({ id, name: name ?? id, known: name !== undefined });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
