import { useEffect, useState } from "react";
import { Alert, Button, Card, Col, Empty, List, Modal, Popover, Space, Spin, Statistic, Typography } from "antd";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "./firebase";
import { RECENT_COMMENT_WINDOW, recentComments } from "./recentComments.js";

// Query each authorized project: no collection-group rule or index is required.
export function useRecentComments(orgId, projects, role, uid) {
  const allowed = role === "editor" || role === "admin";
  const ids = JSON.stringify(projects.map(project => project.id).sort());
  const scope = JSON.stringify([orgId, role, uid, ids]);
  const [state, setState] = useState({});
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    const entries = new Map();
    const failures = new Set();
    const pending = new Set(projects.map(project => project.id));
    setState({ scope, notes: [], loading: !!pending.size, error: false });
    const publish = () => {
      if (live) setState({ scope, notes: [...entries.values()].flat(), loading: !!pending.size, error: !!failures.size });
    };
    const unsubscribers = projects.map(project => onSnapshot(query(
      collection(db, "organizations", orgId, "projects", project.id, "notes"),
      where("editedAt", ">=", new Date(Date.now() - RECENT_COMMENT_WINDOW)),
    ), snapshot => {
      entries.set(project.id, snapshot.docs.map(note => ({ ...note.data(), id: note.id, projectId: project.id })));
      pending.delete(project.id); failures.delete(project.id); publish();
    }, () => {
      entries.delete(project.id); pending.delete(project.id); failures.add(project.id); publish();
    }));
    return () => { live = false; unsubscribers.forEach(unsubscribe => unsubscribe()); };
  }, [scope]);
  return allowed && state.scope === scope
    ? { ...state, notes: recentComments(state.notes || [], now) }
    : { notes: [], loading: allowed, error: false };
}
function CommentPreview({ note }) {
  return <div>
    <Typography.Text type="secondary">{note.editorName || "Organization editor"} · {note.editedAt?.toDate?.().toLocaleString()}</Typography.Text>
    <Typography.Paragraph style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginTop: 8 }}>
      {note.body.length > 500 ? `${note.body.slice(0, 500)}…` : note.body}
    </Typography.Paragraph>
  </div>;
}
export function RecentCommentIndicator({ orgId, projectId, notes }) {
  if (!notes.length) return null;
  return <Popover trigger={["hover", "click"]} title="Latest comment" content={<div style={{ width: 320, maxWidth: "70vw" }}>
    <CommentPreview note={notes[0]} />
    <Link to={`/org/${orgId}/projects/${projectId}#comments`}>View discussion →</Link>
  </div>}>
    <Button type="link" size="small" style={{ padding: 0 }} aria-label={`${notes.length} recent comments; preview latest comment`}>
      💬 {notes.length} recent {notes.length === 1 ? "comment" : "comments"}
    </Button>
  </Popover>;
}
export function RecentCommentsStatistic({ orgId, projects, state, fetching }) {
  const [open, setOpen] = useState(false);
  const loading = fetching || state.loading;
  const unavailable = loading || state.error;
  return <>
    <Col xs={24} sm={12} lg={{ flex: "1 1 0" }}>
      <Card size="small">
        <Statistic title="Comments in the last 2 weeks" value={unavailable ? "—" : state.notes.length} />
        {loading ? <Spin size="small" /> : state.error
          ? <Alert type="warning" message="Recent comments could not be loaded. Refresh to retry." />
          : <Button type="link" style={{ padding: 0 }} onClick={() => setOpen(true)}>View recent comments →</Button>}
      </Card>
    </Col>
    <Modal title="Comments in the last 2 weeks" open={open} onCancel={() => setOpen(false)} footer={null} width={700}>
      {unavailable ? <Alert type="info" message="Recent comments are currently unavailable." /> : <>
        <Typography.Paragraph type="secondary">Newest first · All accessible projects, including closed and archived projects.</Typography.Paragraph>
        <List style={{ maxHeight: "65vh", overflowY: "auto" }} dataSource={state.notes} locale={{ emptyText: <Empty description="No comments in the last 2 weeks" /> }}
          renderItem={note => <List.Item key={`${note.projectId}/${note.id}`}>
            <Space direction="vertical" style={{ width: "100%" }}>
              <Link onClick={() => setOpen(false)} to={`/org/${orgId}/projects/${note.projectId}#comments`}>
                {projects.find(project => project.id === note.projectId)?.title || "Untitled project"}
              </Link>
              <CommentPreview note={note} />
              <Link onClick={() => setOpen(false)} to={`/org/${orgId}/projects/${note.projectId}#comments`}>View discussion →</Link>
            </Space>
          </List.Item>} />
      </>}
    </Modal>
  </>;
}
