import ProjectBrief from "./ProjectBrief";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Layout,
  List,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  Modal,
  message,
  Tooltip,
} from "antd";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  updateDoc,
  writeBatch,
  deleteDoc,
  orderBy,
} from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase";
const { Header, Content } = Layout;
const statuses = ["draft", "proposed", "active", "closed"];
function useUser() {
  const [user, setUser] = useState(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  return user;
}
function useOrg(orgId, user) {
  const [state, setState] = useState({ loading: true, org: null, role: null });
  useEffect(() => {
    let active = true;
    setState({ loading: true, org: null, role: null });
    Promise.all([
      getDoc(doc(db, "organizations", orgId)),
      user
        ? getDoc(doc(db, "organizations", orgId, "members", user.uid))
        : Promise.resolve(null),
    ])
      .then(([o, m]) => {
        if (active)
          setState({
            loading: false,
            org: o.exists() ? o.data() : null,
            role: m?.exists() ? m.data().role : null,
          });
      })
      .catch((error) => {
        console.error("Organization lookup failed:", {
          code: error.code,
          message: error.message,
          orgId,
          uid: user?.uid,
        });

        if (active) {
          setState({
            loading: false,
            org: null,
            role: null,
          });
        }
      });
    return () => {
      active = false;
    };
  }, [orgId, user?.uid]);
  return state;
}
function Shell({ user, children }) {
  return (
    <Layout className="shell">
      <Header className="top">
        <Link to="/" className="brand">
          DeaconProjects
        </Link>
        <Space>
          {user ? (
            <>
              <Typography.Text style={{ color: "white" }}>
                {user.displayName || user.email}
              </Typography.Text>
              <Button onClick={() => signOut(auth)}>Sign out</Button>
            </>
          ) : (
            <Button
              type="primary"
              onClick={() =>
                signInWithPopup(auth, googleProvider).catch((e) =>
                  message.error(e.message),
                )
              }
            >
              Sign in with Google
            </Button>
          )}
        </Space>
      </Header>
      <Content className="content">{children}</Content>
    </Layout>
  );
}
function Home() {
  const [org, setOrg] = useState("elmbrook");
  const nav = useNavigate();
  return (
    <Card title="Open an organization">
      <Space.Compact style={{ width: "100%" }}>
        <Input
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          placeholder="Organization ID"
        />
        <Button
          type="primary"
          onClick={() => nav("/org/" + encodeURIComponent(org.trim()))}
          disabled={!org.trim()}
        >
          Open
        </Button>
      </Space.Compact>
      <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
        Try elmbrook after the organization has been provisioned. Public
        projects are available without sign-in.
      </Typography.Paragraph>
    </Card>
  );
}
function Dashboard({ user }) {
  const { orgId } = useParams();
  const { loading, org, role } = useOrg(orgId, user);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  useEffect(() => {
    let live = true;
    setError("");
    const projects = collection(db, "organizations", orgId, "projects");
    const q = role
      ? query(projects)
      : query(projects, where("visibility", "==", "public"));
    getDocs(q)
      .then((snap) => {
        if (live) setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [orgId, role]);
  if (loading) return <Spin />;
  if (!org)
    return (
      <Alert type="warning" message="Organization not found or unavailable" />
    );
  const canEdit = role === "editor" || role === "admin";
  const shown = items.filter(
    (p) =>
      (showArchived || !p.archived) &&
      (filter === "all" || p.status === filter),
  );
  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div>
        <Typography.Title>{org.name || orgId}</Typography.Title>
        <Typography.Text type="secondary">
          Project portfolio · {role ? `Your role: ${role}` : "Public view"}
        </Typography.Text>
      </div>
      <Space wrap>
        <Select
          value={filter}
          onChange={setFilter}
          style={{ width: 160 }}
          options={[
            { value: "all", label: "All statuses" },
            ...statuses.map((s) => ({
              value: s,
              label: s[0].toUpperCase() + s.slice(1),
            })),
          ]}
        />
        {role && (
          <Button onClick={() => setShowArchived((x) => !x)}>
            {showArchived ? "Hide archived" : "Show archived"}
          </Button>
        )}
        {canEdit && (
          <Link to={`/org/${orgId}/new`}>
            <Button type="primary">New draft</Button>
          </Link>
        )}
      </Space>
      {error && (
        <Alert
          type="error"
          showIcon
          message="Unable to load projects"
          description={error}
        />
      )}
      <List
        bordered
        dataSource={shown}
        locale={{ emptyText: "No visible projects yet" }}
        renderItem={(p) => (
          <List.Item
            extra={
              <Space>
                <Tag>{p.status}</Tag>
                {p.archived && <Tag>Archived</Tag>}
              </Space>
            }
          >
            <Link to={`/org/${orgId}/projects/${p.id}`}>{p.title}</Link>
          </List.Item>
        )}
      />
    </Space>
  );
}
function NewDraft({ user }) {
  const { orgId } = useParams();
  const { loading, role } = useOrg(orgId, user);
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  if (loading) return <Spin />;
  if (!user || !["editor", "admin"].includes(role))
    return <Alert type="warning" message="Editor access required" />;
  const save = async (v) => {
    setBusy(true);
    try {
      const d = await addDoc(
        collection(db, "organizations", orgId, "projects"),
        {
          title: v.title.trim(),
          shortDescription: v.shortDescription || "",
          status: "draft",
          visibility: "private",
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      );
      nav(`/org/${orgId}/projects/${d.id}`);
    } catch (e) {
      message.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Create private draft">
      <Form layout="vertical" onFinish={save}>
        <Form.Item
          label="Project title"
          name="title"
          rules={[{ required: true, max: 160 }]}
        >
          <Input />
        </Form.Item>
        <Form.Item label="Short description" name="shortDescription">
          <Input.TextArea rows={4} maxLength={4000} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={busy}>
          Save draft
        </Button>
      </Form>
    </Card>
  );
}
const briefSections = [
  {
    title: "Project overview",
    fields: [
      ["title", "Project title", "short"],
      ["shortDescription", "Short description", "long"],
      ["longDescription", "Detailed description (optional)", "long"],
      ["purpose", "Why this matters", "long"],
      ["scope", "Scope & people involved", "long"],
    ],
  },
  {
    title: "Leadership and stakeholders",
    fields: [
      ["leadDeacon", "Project lead / Lead Deacon", "short"],
      ["projectSponsor", "Project sponsor(s)", "long"],
      ["statusNote", "Status note (e.g. On schedule)", "short"],
      ["teamMembers", "Project team members (one per line)", "long"],
      [
        "stakeholders",
        "Key stakeholders and sponsors (name — role, one per line)",
        "long",
      ],
    ],
  },
  {
    title: "Schedule and outcomes",
    fields: [
      ["kickoffDate", "Commissioned / kickoff date (YYYY-MM-DD)", "date"],
      ["targetDate", "Expected completion date (YYYY-MM-DD)", "date"],
      ["actualDate", "Actual completion date (YYYY-MM-DD)", "date"],
      ["nextReviewDate", "Next review date (YYYY-MM-DD)", "date"],
      [
        "expectedOutcome",
        "Expected outcome (research, recommendation, implementation, etc.)",
        "long",
      ],
      ["deliverables", "Expected deliverables", "long"],
    ],
  },
  {
    title: "Assumptions and barriers",
    fields: [
      ["assumptions", "Key assumptions and verification status", "long"],
      ["barriers", "Barriers, blockers and dependencies", "long"],
    ],
  },
  {
    title: "Progress and decisions",
    fields: [
      ["accomplishments", "Accomplishments / progress", "long"],
      ["nextSteps", "Next steps", "long"],
      ["decisionsNeeded", "Decisions or help needed", "long"],
      ["links", "Reference links (one per line)", "long"],
      ["workingDetails", "Working details reference or link", "short"],
    ],
  },
];
const briefKeys = briefSections.flatMap((s) => s.fields.map((f) => f[0]));
function Project({ user }) {
  const { orgId, projectId } = useParams();
  const nav = useNavigate();
  const { role, org } = useOrg(orgId, user);
  const [project, setProject] = useState(undefined);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const [action, setAction] = useState(null);
  const [actionForm] = Form.useForm();
  const [form] = Form.useForm();
  useEffect(() => {
    let live = true;
    setProject(undefined);
    getDoc(doc(db, "organizations", orgId, "projects", projectId))
      .then((s) => {
        if (live) setProject(s.exists() ? s.data() : null);
      })
      .catch((e) => {
        if (live) {
          setProject(null);
          setError(e.message);
        }
      });
    return () => {
      live = false;
    };
  }, [orgId, projectId, user?.uid]);
  useEffect(() => {
    if (!role) {
      setHistory([]);
      return;
    }
    let live = true;
    getDocs(
      query(
        collection(
          db,
          "organizations",
          orgId,
          "projects",
          projectId,
          "history",
        ),
        orderBy("at", "desc"),
      ),
    )
      .then((s) => {
        if (live) setHistory(s.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
      .catch((e) => console.error("History read failed", e));
    return () => {
      live = false;
    };
  }, [orgId, projectId, role, project?.status, project?.archived]);
  const transition = async (values) => {
    if (!user || !project || busy) return;
    setBusy(true);
    const projectRef = doc(db, "organizations", orgId, "projects", projectId);
    try {
      if (action === "delete") {
        await deleteDoc(projectRef);
        message.success("Draft deleted");
        nav(`/org/${orgId}`);
        return;
      }
      const transitions = {
        propose: ["draft", "proposed"],
        withdraw: ["proposed", "draft"],
        activate: ["proposed", "active"],
        close: ["active", "closed"],
      };
      const target = transitions[action];
      if (!target && action !== "archive") throw new Error("Invalid action");
      if (target && project.status !== target[0])
        throw new Error("Project status has changed; refresh and retry.");
      if (action === "archive" && project.status !== "proposed")
        throw new Error("Only proposed projects can be archived.");
      const eventRef = doc(collection(projectRef, "history"));
      const patch = { updatedAt: serverTimestamp(), lastEventId: eventRef.id };
      if (target) patch.status = target[1];
      if (action === "archive") patch.archived = true;
      if (action === "close") {
        if (!values.outcome || !values.lessonsLearned?.trim())
          throw new Error("Outcome and lessons learned are required.");
        patch.evaluation = {
          outcome: values.outcome,
          lessonsLearned: values.lessonsLearned.trim(),
          whatDifferently: values.whatDifferently?.trim() || "",
          followUps: values.followUps?.trim() || "",
        };
        patch.closedBy = user.uid;
        patch.closedAt = serverTimestamp();
      }
      const event = {
        action,
        fromStatus: project.status,
        toStatus: target ? target[1] : project.status,
        actorUid: user.uid,
        at: serverTimestamp(),
        ...(action === "close" ? { evaluation: patch.evaluation } : {}),
      };
      const batch = writeBatch(db);
      batch.update(projectRef, patch);
      batch.set(eventRef, event);
      await batch.commit();
      setProject((p) => ({ ...p, ...patch, updatedAt: p.updatedAt }));
      setAction(null);
      actionForm.resetFields();
      message.success("Project updated");
    } catch (e) {
      console.error("Lifecycle action failed:", e);
      message.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (project === undefined) return <Spin />;
  if (!project)
    return (
      <Alert
        type="warning"
        message="Project not available"
        description={error || "Not found or access denied"}
      />
    );
  const canEdit =
    ["editor", "admin"].includes(role) &&
    project.status !== "closed" &&
    !project.archived;
  const beginEdit = () => {
    form.setFieldsValue(
      Object.fromEntries(briefKeys.map((k) => [k, project[k] || ""])),
    );
    setEditing(true);
  };
  const save = async (values) => {
    setBusy(true);
    const fields = Object.fromEntries(
      briefKeys.map((k) => [k, (values[k] || "").trim()]),
    );
    try {
      await updateDoc(doc(db, "organizations", orgId, "projects", projectId), {
        ...fields,
        updatedAt: serverTimestamp(),
      });
      setProject((p) => ({ ...p, ...fields }));
      setEditing(false);
      message.success("Project brief saved");
    } catch (e) {
      console.error("Project brief save failed:", e.code, e.message);
      message.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ width: "100%" }}>
      <Space wrap style={{ marginBottom: 16 }}>
        <Link to={`/org/${orgId}`}>← Portfolio</Link>
        <Tag>{project.status}</Tag>
        <Tag>{project.visibility}</Tag>
        {!editing && canEdit && (
          <Button type="primary" onClick={beginEdit}>
            Edit brief
          </Button>
        )}
        {!editing && (
          <Button onClick={() => window.print()}>Print / Save as PDF</Button>
        )}
        {!editing && canEdit && project.status === "draft" && (
          <>
            <Tooltip title="Move this draft to Proposed status for Council review. This does not approve the project or change its visibility.">
              <Button onClick={() => setAction("propose")}>
                Submit as Proposal
              </Button>
            </Tooltip>{" "}
            <Button danger onClick={() => setAction("delete")}>
              Delete draft
            </Button>
          </>
        )}
        {!editing && canEdit && project.status === "proposed" && (
          <>
            <Button onClick={() => setAction("withdraw")}>
              Return to draft
            </Button>
            <Button type="primary" onClick={() => setAction("activate")}>
              Activate
            </Button>
            <Button onClick={() => setAction("archive")}>Archive</Button>
          </>
        )}
        {!editing && canEdit && project.status === "active" && (
          <Button type="primary" onClick={() => setAction("close")}>
            Close project
          </Button>
        )}
        {project.archived && <Tag>Archived</Tag>}
      </Space>
      <Modal
        title={
          {
            propose: "Propose project",
            withdraw: "Return to draft",
            activate: "Activate project",
            close: "Close project",
            archive: "Archive proposal",
            delete: "Delete draft",
          }[action] || ""
        }
        open={!!action}
        onCancel={() => {
          setAction(null);
          actionForm.resetFields();
        }}
        onOk={() => actionForm.submit()}
        okButtonProps={{ loading: busy, danger: action === "delete" }}
        okText="Confirm"
      >
        <Form form={actionForm} layout="vertical" onFinish={transition}>
          {action === "close" ? (
            <>
              <Form.Item
                name="outcome"
                label="Outcome"
                rules={[{ required: true }]}
              >
                <Select
                  options={[
                    "Successful",
                    "Partially Successful",
                    "Unsuccessful",
                    "Discontinued",
                  ].map((v) => ({ value: v, label: v }))}
                />
              </Form.Item>
              <Form.Item
                name="lessonsLearned"
                label="Lessons learned"
                rules={[{ required: true, whitespace: true }]}
              >
                <Input.TextArea rows={4} maxLength={4000} />
              </Form.Item>
              <Form.Item
                name="whatDifferently"
                label="What would we do differently? (optional)"
              >
                <Input.TextArea rows={2} />
              </Form.Item>
              <Form.Item name="followUps" label="Follow-up actions (optional)">
                <Input.TextArea rows={2} />
              </Form.Item>
            </>
          ) : (
            <Typography.Paragraph>
              {action === "delete"
                ? "This permanently deletes the draft and its history. This cannot be undone."
                : "Confirm this project lifecycle change."}
            </Typography.Paragraph>
          )}
        </Form>
      </Modal>
      {editing ? (
        <Card title="Edit project brief">
          <Form
            form={form}
            layout="vertical"
            onFinish={save}
            onFinishFailed={() =>
              message.warning("Please correct the highlighted fields.")
            }
          >
            {briefSections.map((section) => (
              <div key={section.title}>
                <Typography.Title level={4}>{section.title}</Typography.Title>
                {section.fields.map(([key, label, kind]) => (
                  <Form.Item
                    key={key}
                    name={key}
                    label={label}
                    rules={
                      key === "title"
                        ? [{ required: true, whitespace: true, max: 160 }]
                        : [{ max: kind === "short" ? 160 : 4000 }]
                    }
                  >
                    {kind === "long" ? (
                      <Input.TextArea rows={3} maxLength={4000} showCount />
                    ) : (
                      <Input
                        type={kind === "date" ? "date" : "text"}
                        maxLength={kind === "short" ? 160 : undefined}
                      />
                    )}
                  </Form.Item>
                ))}
              </div>
            ))}
            <Space>
              <Button type="primary" htmlType="submit" loading={busy}>
                Save brief
              </Button>
              <Button disabled={busy} onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </Space>
          </Form>
        </Card>
      ) : (
        <>
          <ProjectBrief project={project} orgName={org?.name || "Deacons"} />
          {role && (
            <Card title="Lifecycle history" style={{ marginTop: 20 }}>
              <List
                size="small"
                dataSource={history}
                locale={{ emptyText: "No lifecycle events yet" }}
                renderItem={(e) => (
                  <List.Item>
                    {e.action} · {e.fromStatus} → {e.toStatus} ·{" "}
                    {e.at?.toDate?.()?.toLocaleString() || "Pending"} ·{" "}
                    {e.actorUid}
                  </List.Item>
                )}
              />
              {project.evaluation && (
                <div>
                  <Typography.Title level={5}>
                    Post-project evaluation
                  </Typography.Title>
                  <p>
                    <strong>Outcome:</strong> {project.evaluation.outcome}
                  </p>
                  <p>
                    <strong>Lessons learned:</strong>{" "}
                    {project.evaluation.lessonsLearned}
                  </p>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
export default function App() {
  const user = useUser();
  if (user === undefined) return <Spin />;
  return (
    <Shell user={user}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/org/:orgId" element={<Dashboard user={user} />} />
        <Route path="/org/:orgId/new" element={<NewDraft user={user} />} />
        <Route
          path="/org/:orgId/projects/:projectId"
          element={<Project user={user} />}
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Shell>
  );
}
