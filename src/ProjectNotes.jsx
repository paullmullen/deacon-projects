import { useEffect, useState } from "react";
import { Alert, Button, Input, Space, Spin, Typography, message } from "antd";
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import MarkdownText from "./MarkdownText";
import { NotesContent } from "./ProjectNotesContent";

const notesCollection = (orgId, projectId) => collection(db, "organizations", orgId, "projects", projectId, "notes");
const notesQuery = (orgId, projectId) => query(notesCollection(orgId, projectId), orderBy("editedAt", "asc"));
// The original notes/current document is included as an immutable historical note.
export async function loadProjectNotes(orgId, projectId) {
  const snapshot = await getDocs(notesQuery(orgId, projectId));
  return snapshot.docs.map(note => ({ ...note.data(), id: note.id }));
}
export default function ProjectNotes({ orgId, projectId, user, canAdd = true }) {
  const [notes, setNotes] = useState([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    setLoading(true);
    setError("");
    setNotes([]);
    return onSnapshot(notesQuery(orgId, projectId), snapshot => {
      setNotes(snapshot.docs.map(note => ({ ...note.data(), id: note.id })));
      setLoading(false);
    }, e => { setError(e.message); setLoading(false); });
  }, [orgId, projectId, user.uid, reload]);
  const save = async () => {
    if (busy || !canAdd || !body.trim()) return;
    setBusy(true);
    try {
      const membership = await getDoc(doc(db, "organizations", orgId, "members", user.uid));
      const editorName = [membership.data()?.displayName, user.displayName, user.email, "Organization editor"]
        .find(value => typeof value === "string" && value.trim()).trim().slice(0, 320);
      await addDoc(notesCollection(orgId, projectId), {
        body: body.trim(), editorUid: user.uid,
        editorName,
        editedAt: serverTimestamp(),
      });
      setBody(""); setPreview(false);
      message.success("Note added to the project record");
    } catch (e) { message.error(e.message); }
    finally { setBusy(false); }
  };
  return <section aria-label="Comments and meeting notes">
    <Typography.Title level={4}>Comments / meeting notes</Typography.Title>
    <Typography.Paragraph type="secondary">Each saved note becomes part of the project record and cannot be edited or deleted. Notes are excluded from printouts unless requested.</Typography.Paragraph>
    {loading ? <Spin /> : error ? <Alert type="error" message="Notes could not be loaded" description={error} action={<Button onClick={() => setReload(n => n + 1)}>Retry</Button>} /> : <>
      {notes.length ? <NotesContent notes={notes} showHeading={false} /> : <Typography.Paragraph type="secondary">No notes yet.</Typography.Paragraph>}
      {canAdd && <>
        <Typography.Title level={5}>Add a note</Typography.Title>
        <Space style={{ marginBottom: 8 }}><Button disabled={busy} onClick={() => setPreview(!preview)}>{preview ? "Edit note" : "Preview formatting"}</Button></Space>
        {preview ? <div><MarkdownText value={body} /></div> : <Input.TextArea aria-label="New meeting note" value={body} onChange={e => setBody(e.target.value)} rows={6} maxLength={20000} showCount disabled={busy} />}
        <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>Formatting: **bold**, *italic*, - bullets, 1. numbered steps, ### headings, [link](https://example.com).</Typography.Paragraph>
        <Button type="primary" onClick={save} loading={busy} disabled={!body.trim()}>Add note</Button>
      </>}
    </>}
  </section>;
}
