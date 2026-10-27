import MarkdownText from "./MarkdownText";
export function NotesContent({ notes }) {
  if (!notes?.body?.trim()) return null;
  return <section className="brief-block brief-block-flowing brief-notes">
    <h2>Comments / meeting notes</h2>
    <p className="brief-notes-meta">Last edited by {notes.editorName} · {notes.editedAt?.toDate?.().toLocaleString() || "Just now"}</p>
    <MarkdownText value={notes.body} />
  </section>;
}
