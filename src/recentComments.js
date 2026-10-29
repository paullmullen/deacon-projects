export const RECENT_COMMENT_WINDOW = 14 * 24 * 60 * 60 * 1000;
export const commentTime = note => note.editedAt?.toMillis?.() ?? note.editedAt?.toDate?.().getTime() ?? 0;
export function recentComments(notes, now = Date.now()) {
  return notes.filter(note => note.body?.trim() && commentTime(note) >= now - RECENT_COMMENT_WINDOW && commentTime(note) <= now)
    .sort((a, b) => commentTime(b) - commentTime(a) || String(a.id).localeCompare(String(b.id)));
}
