import { useEffect, useState } from "react";
import { Alert, Button, Input, Space, Spin, Typography, message } from "antd";
import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import MarkdownText from "./MarkdownText";

const notesRef = (orgId, projectId) => doc(db, "organizations", orgId, "projects", projectId, "notes", "current");
export async function loadProjectNotes(orgId, projectId) {
  const snapshot = await getDoc(notesRef(orgId, projectId));
  return snapshot.exists() ? snapshot.data() : null;
}
export default function ProjectNotes({ orgId, projectId, user }) {
  const [saved, setSaved] = useState(null);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    loadProjectNotes(orgId, projectId).then(notes => {
      if (live) { setSaved(notes); setBody(notes?.body || ""); }
    }).catch(e => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [orgId, projectId, user.uid, reload]);
  const save = async () => {
    setBusy(true);
    try {
      const patch = { body: body.trim(), editorUid: user.uid,
        editorName: (user.displayName || user.email || "Organization editor").slice(0, 320), editedAt: serverTimestamp() };
      await runTransaction(db, async transaction => {
        const ref = notesRef(orgId, projectId);
        const latest = await transaction.get(ref);
        const current = latest.exists() ? latest.data() : null;
        if ((current?.editedAt?.toMillis() ?? null) !== (saved?.editedAt?.toMillis() ?? null))
          throw new Error("Someone else updated these notes. Copy your changes, then reload the notes before saving.");
        transaction.set(ref, patch);
      });
      // Refresh the server timestamp so the next save can detect concurrent edits.
      const fresh = await loadProjectNotes(orgId, projectId);
      setSaved(fresh); setBody(fresh?.body || "");
      message.success("Notes saved");
    } catch (e) { message.error(e.message); }
    finally { setBusy(false); }
  };
  return <section style={{ marginTop: 24 }} aria-label="Comments and meeting notes editor">
    <Typography.Title level={4}>Comments / meeting notes</Typography.Title>
    <Typography.Paragraph type="secondary">Shared organization notes. Saved separately from the brief and excluded from printouts unless requested.</Typography.Paragraph>
    {loading ? <Spin /> : error ? <Alert type="error" message="Notes could not be loaded" description={error} action={<Button onClick={() => setReload(n => n + 1)}>Retry</Button>} /> : <>
      {saved && <Typography.Paragraph type="secondary">Last edited by {saved.editorName} · {saved.editedAt?.toDate?.().toLocaleString() || "Just now"}</Typography.Paragraph>}
      <Space style={{ marginBottom: 8 }}><Button onClick={() => setPreview(!preview)}>{preview ? "Edit notes" : "Preview formatting"}</Button></Space>
      {preview ? <div className="project-brief" style={{ minHeight: 0, padding: 16, boxShadow: "none" }}><MarkdownText value={body} /></div> : <Input.TextArea aria-label="Comments / meeting notes" value={body} onChange={e => setBody(e.target.value)} rows={8} maxLength={20000} showCount disabled={busy} />}
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>Formatting: **bold**, *italic*, - bullets, 1. numbered steps, ### headings, [link](https://example.com).</Typography.Paragraph>
      <Button type="primary" onClick={save} loading={busy} disabled={body.trim() === (saved?.body || "")}>Save notes</Button>
    </>}
  </section>;
}
