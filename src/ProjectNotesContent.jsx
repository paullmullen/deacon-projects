import MarkdownText from "./MarkdownText";
export function NotesContent({ notes, showHeading = true }) {
  const entries = (Array.isArray(notes) ? notes : notes ? [notes] : []).filter(note => note.body?.trim());
  if (!entries.length) return null;
  return <section className="brief-block brief-block-flowing brief-notes">
    {showHeading && <h2>Comments / meeting notes</h2>}
    {entries.map((note, index) => <section className="brief-note-entry" key={note.id || index}>
      <p className="brief-notes-meta">{note.editorName} · {note.editedAt?.toDate?.().toLocaleString() || "Saving…"}</p>
      <MarkdownText value={note.body} />
    </section>)}
  </section>;
}
