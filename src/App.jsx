import ProjectBrief from "./ProjectBrief";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Layout,
  List,
  Row,
  Col,
  Statistic,
  Empty,
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
  useLocation,
} from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { AuthPage, MembershipStatus, AdminUsers } from "./Membership";
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
import { auth, db } from "./firebase";
const { Header, Content } = Layout;
const statuses = ["active", "proposed", "draft", "closed"];
const remainingTime = (value, now = new Date()) => {
  if (!value) return "Ongoing";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "";
  const target = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((target - today) / 86400000);
  if (days === 0) return "Due today";
  const absoluteDays = Math.abs(days);
  const amount =
    absoluteDays >= 60 ? Math.round(absoluteDays / 30.44) : absoluteDays;
  const unit = absoluteDays >= 60 ? "month" : "day";
  const duration = `${amount} ${unit}${amount === 1 ? "" : "s"}`;
  return days > 0 ? `${duration} remaining` : `${duration} overdue`;
};

const capitalBudgetUrl = "https://elmbrookchurch-my.sharepoint.com/:x:/g/personal/rheld_elmbrook_org/IQBDBKgsfLDoR6JVwCsc8s79AcS2Dm89FMkHGbgB1ThLuQk?e=wY3RIN&nav=MTVfe0VEMzVGOEE3LTQxMjYtRDA0OC04RTdFLTkwRTc4NENDMENGRH0";
const publicStatuses = ["proposed", "active", "closed"];
const statusLabel = (status) =>
  status ? status[0].toUpperCase() + status.slice(1) : "Unknown";
const visibilityLabel = (visibility) =>
  visibility === "private" ? "Confidential" : "Public";
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
  const location = useLocation();
  const currentOrgId =
    location.pathname.match(/^\/org\/([^/]+)/)?.[1] || "elmbrook";
  return (
    <Layout className="shell">
      <Header className="top">
        <Link to={`/org/${currentOrgId}`} className="brand">
          Deacon Projects
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
            <Link to={`/org/${currentOrgId}/login`}>
              <Button type="primary">Sign in / Register</Button>
            </Link>
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
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    if (loading) return;
    let live = true;
    setFetching(true);
    setItems([]);
    setError("");
    const projects = collection(db, "organizations", orgId, "projects");
    // Firestore rules are not filters: the public query must exclude drafts.
    const q = role
      ? query(projects)
      : query(
          projects,
          where("visibility", "==", "public"),
          where("status", "in", publicStatuses),
        );
    getDocs(q)
      .then((snap) => {
        if (live) setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setFetching(false);
      });
    return () => {
      live = false;
    };
  }, [orgId, role, loading]);

  if (loading) return <Spin />;
  if (!org)
    return (
      <Alert type="warning" message="Organization not found or unavailable" />
    );

  const isMember = !!role;
  const canEdit = role === "editor" || role === "admin";
  // Defense in depth; Firestore rules independently enforce public access.
  const accessible = items.filter(
    (p) =>
      isMember ||
      (p.visibility === "public" && publicStatuses.includes(p.status)),
  );
  const current = accessible.filter((p) => !p.archived);
  const archived = accessible.filter((p) => !!p.archived);
  const needle = search.trim().toLowerCase();
  const matches = (p) =>
    !needle ||
    [p.title, p.shortDescription, p.leadDeacon, p.projectSponsor].some(
      (value) =>
        String(value || "")
          .toLowerCase()
          .includes(needle),
    );
  const visible = current.filter(matches);
  const count = (status) => current.filter((p) => p.status === status).length;

  const projectCard = (p) => (
    <Card key={p.id} size="small" hoverable style={{ height: "100%" }}>
      <Space direction="vertical" size={6} style={{ width: "100%" }}>
        <Space wrap size={4}>
          {isMember && (
            <Tag color={p.visibility === "private" ? "gold" : "default"}>
              {visibilityLabel(p.visibility)}
            </Tag>
          )}
          {p.statusNote && <Tag>{p.statusNote}</Tag>}
        </Space>
        <Link
          to={`/org/${orgId}/projects/${p.id}`}
          style={{ fontSize: 16, fontWeight: 600 }}
        >
          {p.title || "Untitled project"}
        </Link>
        {p.shortDescription && (
          <Typography.Paragraph
            ellipsis={{ rows: 2 }}
            style={{ marginBottom: 0 }}
          >
            {p.shortDescription}
          </Typography.Paragraph>
        )}
        <Typography.Text type="secondary">
          Lead: {p.leadDeacon || "Not assigned"}
        </Typography.Text>
        {p.targetDate && (
          <Space direction="vertical" size={0}>
            <Typography.Text type="secondary">
              Target: {p.targetDate}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {remainingTime(p.targetDate)}
            </Typography.Text>
          </Space>
        )}
      </Space>
    </Card>
  );

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div>
        <Typography.Title style={{ marginBottom: 4 }}>
          {org.name || orgId}
        </Typography.Title>
        <Typography.Text type="secondary">
          Project Portfolio ·{" "}
          {isMember ? `Member view (${role})` : "Public view"}
        </Typography.Text>
      </div>
      <Row gutter={[12, 12]}>
        {statuses
          .filter((status) => isMember || status !== "draft")
          .map((status) => (
            <Col xs={12} sm={6} key={status}>
              <Card size="small">
                <Statistic title={statusLabel(status)} value={count(status)} />
              </Card>
            </Col>
          ))}
      </Row>
      {isMember && orgId === "elmbrook" && (
        <div style={{ textAlign: "center", marginTop: 14, marginBottom: 18 }}>
          <a href={capitalBudgetUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 18 }}>
            Open Capital Budget ↗
          </a>
        </div>
      )}
      <MembershipStatus orgId={orgId} user={user} role={role} />
      <div style={{ borderTop: "1px solid #d9d9d9", marginTop: 6, paddingTop: 24, display: "flex", justifyContent: "center" }}>
        <Space wrap style={{ justifyContent: "center" }}>
        <Input.Search
          allowClear
          placeholder="Search projects"
          aria-label="Search projects"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 260, maxWidth: "100%" }}
        />
        {canEdit && (
          <Link to={`/org/${orgId}/new`}>
            <Button type="primary">Draft a new project</Button>
          </Link>
        )}
        {isMember && archived.length > 0 && (
          <Button onClick={() => setShowArchived((value) => !value)}>
            {showArchived
              ? "Hide archived proposals"
              : `Archived proposals (${archived.length})`}
          </Button>
        )}
        </Space>
      </div>
      {error && (
        <Alert
          type="error"
          showIcon
          message="Unable to load projects"
          description={error}
        />
      )}
      {fetching ? (
        <Spin />
      ) : (
        <>
          {statuses
            .filter((status) => isMember || status !== "draft")
            .map((status) => {
              const group = visible.filter((p) => p.status === status);
              if (status === "closed" && !showClosed && !needle) {
                return (
                  <Card key={status} size="small">
                    <Space wrap>
                      <Typography.Title level={4} style={{ margin: 0 }}>
                        Closed ({count("closed")})
                      </Typography.Title>
                      <Button onClick={() => setShowClosed(true)}>
                        Show closed projects
                      </Button>
                    </Space>
                  </Card>
                );
              }
              return (
                <section
                  key={status}
                  aria-label={`${statusLabel(status)} projects`}
                >
                  <Typography.Title level={4}>
                    {statusLabel(status)} (
                    {needle ? group.length : count(status)})
                  </Typography.Title>
                  {group.length ? (
                    <Row gutter={[12, 12]}>
                      {group.map((p) => (
                        <Col key={p.id} xs={24} md={12} xl={8}>
                          {projectCard(p)}
                        </Col>
                      ))}
                    </Row>
                  ) : (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="No projects to show"
                    />
                  )}
                  {status === "closed" && !needle && (
                    <Button type="link" onClick={() => setShowClosed(false)}>
                      Collapse closed projects
                    </Button>
                  )}
                </section>
              );
            })}
          {isMember && showArchived && (
            <section aria-label="Archived proposals">
              <Typography.Title level={4}>
                Archived proposals ({archived.filter(matches).length})
              </Typography.Title>
              <Row gutter={[12, 12]}>
                {archived.filter(matches).map((p) => (
                  <Col key={p.id} xs={24} md={12} xl={8}>
                    {projectCard(p)}
                  </Col>
                ))}
              </Row>
            </section>
          )}
        </>
      )}
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
    <Card title="Create confidential draft">
      <Form layout="vertical" onFinish={save}>
        <Form.Item
          label="Project title"
          name="title"
          rules={[{ required: true, max: 160 }]}
        >
          <Input />
        </Form.Item>
        <Form.Item label="Short description" name="shortDescription">
          <Input.TextArea rows={4} maxLength={500} showCount />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={busy}>
          Save draft
        </Button>
      </Form>
    </Card>
  );
}
const deliverableCategories = [
  "Research report / assessment",
  "Recommendation / proposal",
  "Project plan",
  "Project management / coordination",
  "Implemented solution",
  "Ongoing operational responsibility",
  "Other",
];
const sectionGuidance = {
  "Project overview": "What is this project, and why does it matter?",
  "Leadership and stakeholders": "Who is leading, sponsoring, and participating?",
  "Schedule and outcomes": "What should the team deliver, and when?",
  "Assumptions and barriers": "What must be true, and what might prevent success?",
  "Progress and decisions": "What has happened, and what needs to happen next?",
};
const briefSections = [
  {
    title: "Project overview",
    fields: [
      ["title", "Project title", "short"],
      ["shortDescription", "Short description", "long", 500],
      ["longDescription", "Detailed description and scope (optional)", "long"],
      ["purpose", "Why this matters", "long", 500],
      ["scope", "Out of scope", "long", 500],
    ],
  },
  {
    title: "Leadership and stakeholders",
    fields: [
      ["leadDeacon", "Project lead / Lead Deacon", "short"],
      ["projectSponsor", "Project sponsor(s)", "long", 500],
      ["statusNote", "Status note (e.g. On schedule)", "short", 100],
      ["teamMembers", "Project team members (one per line)", "long", 1000],
      [
        "stakeholders",
        "Key stakeholders (name — role, one per line)",
        "long",
        1000,
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
      ["expectedOutcome", "Describe the expected deliverable", "long", 1000],
    ],
  },
  {
    title: "Assumptions and barriers",
    fields: [["barriers", "Barriers, blockers and dependencies", "long", 1000]],
  },
  {
    title: "Progress and decisions",
    fields: [
      ["accomplishments", "Accomplishments / progress", "long"],
      ["decisionsNeeded", "Decisions or help needed", "long", 1000],
    ],
  },
];
// Structured tables. Existing plain-text fields are preserved for compatibility.
const legacyRows = (text, field) =>
  (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      field === "assumptions"
        ? { assumption: line, status: "Unverified" }
        : { action: line, owner: "" },
    );
const cleanRows = (rows, columns) =>
  (rows || [])
    .map((row) =>
      Object.fromEntries(
        columns.map((key) => [key, (row?.[key] || "").trim()]),
      ),
    )
    .filter((row) => columns.some((key) => row[key]));
const sameRows = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

function RowEditor({ name, columns }) {
  return (
    <Form.List name={name}>
      {(fields, { add, remove }) => (
        <Space direction="vertical" style={{ width: "100%" }}>
          {fields.map(({ key, name: rowIndex, ...rest }) => (
            <Space key={key} align="start" wrap>
              {columns.map((column) => (
                <Form.Item
                  {...rest}
                  key={column.key}
                  name={[rowIndex, column.key]}
                  rules={[
                    {
                      max: column.max,
                      message: `Maximum ${column.max} characters`,
                    },
                  ]}
                  style={{ marginBottom: 4, minWidth: column.width || 180 }}
                >
                  {column.options ? (
                    <Select
                      placeholder={column.title}
                      options={column.options}
                      style={{ minWidth: 180 }}
                    />
                  ) : (
                    <Input placeholder={column.title} maxLength={column.max} />
                  )}
                </Form.Item>
              ))}
              <Button danger onClick={() => remove(rowIndex)}>
                Remove
              </Button>
            </Space>
          ))}
          {fields.length < 30 && (
            <Button onClick={() => add()}>+ Add row</Button>
          )}
        </Space>
      )}
    </Form.List>
  );
}
const validDocumentUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
};
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
    const existing = Object.fromEntries(
      briefKeys.map((k) => [k, project[k] || ""]),
    );
    if (project.deliverables?.trim()) {
      existing.expectedOutcome = [
        project.expectedOutcome,
        `Deliverables: ${project.deliverables}`,
      ]
        .filter(Boolean)
        .join("\n\n");
    }
    form.setFieldsValue({
      ...existing,
      deliverableCategories: Array.isArray(project.deliverableCategories) ? project.deliverableCategories : [],
      supportingDocuments: Array.isArray(project.supportingDocuments) ? project.supportingDocuments : [],
      visibility: project.visibility || "private",
      assumptionsTable:
        project.assumptionsTable ||
        legacyRows(project.assumptions, "assumptions"),
      nextStepsTable:
        project.nextStepsTable || legacyRows(project.nextSteps, "nextSteps"),
    });
    setEditing(true);
  };
  const save = async (values) => {
    setBusy(true);
    const fields = Object.fromEntries(
      briefKeys.map((k) => [k, (values[k] || "").trim()]),
    );
    const supportingDocuments = (values.supportingDocuments || [])
      .map((row) => ({
        title: String(row?.title || "").trim(),
        description: String(row?.description || "").trim(),
        url: String(row?.url || "").trim(),
        addedBy: row?.addedBy || user.email || user.uid,
        addedAt: row?.addedAt || new Date().toISOString(),
      }))
      .filter((row) => row.title || row.url || row.description);
    if (supportingDocuments.length > 20 ||
        supportingDocuments.some((row) => !row.title || !validDocumentUrl(row.url))) {
      message.error("Each supporting document needs a title and a valid HTTPS link (maximum 20).");
      return;
    }
    const selectedDeliverables = (values.deliverableCategories || []).filter((category) => deliverableCategories.includes(category));
    const assumptionsTable = cleanRows(values.assumptionsTable, [
      "assumption",
      "status",
    ]);
    const nextStepsTable = cleanRows(values.nextStepsTable, [
      "action",
      "owner",
    ]);
    const progressKeys = ["accomplishments", "decisionsNeeded"];
    const progressChanged =
      progressKeys.some((key) => fields[key] !== (project[key] || "")) ||
      !sameRows(
        nextStepsTable,
        project.nextStepsTable || legacyRows(project.nextSteps, "nextSteps"),
      ) ||
      !sameRows(
        assumptionsTable,
        project.assumptionsTable ||
          legacyRows(project.assumptions, "assumptions"),
      );
    const legacyDeliverables = project.deliverables?.trim()
      ? { deliverables: "" }
      : {};
    const progressStamp = progressChanged
      ? { progressEditedAt: serverTimestamp() }
      : {};
    try {
      await updateDoc(doc(db, "organizations", orgId, "projects", projectId), {
        ...fields,
        deliverableCategories: selectedDeliverables,
        supportingDocuments,
        assumptionsTable,
        nextStepsTable,
        ...legacyDeliverables,
        ...progressStamp,
        visibility: values.visibility,
        updatedAt: serverTimestamp(),
      });
      setProject((p) => ({
        ...p,
        ...fields,
        deliverableCategories: selectedDeliverables,
        supportingDocuments,
        assumptionsTable,
        nextStepsTable,
        ...legacyDeliverables,
        ...(progressChanged ? { progressEditedAt: new Date() } : {}),
        visibility: values.visibility,
      }));
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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <Link to={`/org/${orgId}`}>← Portfolio</Link>
        <Space wrap style={{ justifyContent: "flex-end" }}>
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
        </Space>
      </div>
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
      <Space size="small" wrap style={{ marginBottom: 12 }}>
        <Tag bordered={false} style={{ textTransform: "capitalize" }}>
          {project.status}
        </Tag>
        <Tag bordered={false}>{visibilityLabel(project.visibility)}</Tag>
        {project.archived && <Tag bordered={false}>Archived</Tag>}
      </Space>
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
            <Form.Item
              name="visibility"
              label="Project visibility"
              rules={[{ required: true }]}
              extra="Public projects can be viewed by visitors once they are Proposed, Active, or Closed. Drafts remain visible only to organization members."
            >
              <Select
                options={[
                  {
                    value: "private",
                    label: "Confidential — Elders and Deacons only",
                  },
                  {
                    value: "public",
                    label:
                      "Public — visible to visitors when project is proposed, active, or closed.",
                  },
                ]}
              />
            </Form.Item>
            {briefSections.map((section, index) => (
              <details
                key={section.title}
                defaultOpen={index === 0}
                style={{
                  border: "1px solid #d9d9d9",
                  borderRadius: 8,
                  marginBottom: 16,
                  background: "#fff",
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    padding: "16px 20px",
                    background: "#fafafa",
                    borderRadius: 8,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 17 }}>
                    {index + 1}. {section.title}
                  </span>
                  <div style={{ color: "#777", fontSize: 13, marginTop: 3 }}>
                    {sectionGuidance[section.title]}
                  </div>
                </summary>
                <div style={{ padding: "16px 20px 8px" }}>
                <Typography.Title level={5} style={{ display: section.title === "Progress and decisions" ? "block" : "none", marginTop: 0 }}>
                  {section.title}
                  {section.title === "Progress and decisions" && (
                    <Typography.Text
                      type="secondary"
                      style={{
                        marginLeft: 12,
                        fontSize: 13,
                        fontWeight: "normal",
                      }}
                    >
                      Last edited on:{" "}
                      {project.progressEditedAt
                        ?.toDate?.()
                        ?.toLocaleDateString?.() ||
                        (project.progressEditedAt instanceof Date &&
                          project.progressEditedAt.toLocaleDateString()) ||
                        "Not recorded"}
                    </Typography.Text>
                  )}
                </Typography.Title>
                {section.title === "Assumptions and barriers" && (
                  <div style={{ marginBottom: 20 }}>
                    <Typography.Text strong>
                      Key assumptions and verification status
                    </Typography.Text>
                    <div style={{ marginTop: 8 }}>
                      <RowEditor
                        name="assumptionsTable"
                        columns={[
                          {
                            key: "assumption",
                            title: "Assumption",
                            max: 500,
                            width: 340,
                          },
                          {
                            key: "status",
                            title: "Verification status",
                            max: 50,
                            options: [
                              { value: "Unverified", label: "Unverified" },
                              { value: "In progress", label: "In progress" },
                              { value: "Verified", label: "Verified" },
                              { value: "Disproven", label: "Disproven" },
                            ],
                          },
                        ]}
                      />
                    </div>
                  </div>
                )}
                {section.title === "Progress and decisions" && (
                  <div style={{ marginBottom: 20 }}>
                    <Typography.Text strong>
                      Next steps and owners
                    </Typography.Text>
                    <div style={{ marginTop: 8 }}>
                      <RowEditor
                        name="nextStepsTable"
                        columns={[
                          {
                            key: "action",
                            title: "Action",
                            max: 500,
                            width: 340,
                          },
                          {
                            key: "owner",
                            title: "Owner",
                            max: 160,
                            width: 200,
                          },
                        ]}
                      />
                    </div>
                  </div>
                )}
                {section.fields.filter(([key]) => key !== "expectedOutcome").map(([key, label, kind, limit]) => (
                  <Form.Item
                    key={key}
                    name={key}
                    label={label}
                    extra={
                      key === "expectedOutcome"
                        ? "Be specific about what the team is expected to deliver. This is different from why the project matters."
                        : key === "stakeholders"
                        ? "Who will be affected by the outcome of this project?"
                        : kind === "long" && ["longDescription", "purpose", "scope", "accomplishments", "barriers", "decisionsNeeded"].includes(key)
                          ? "Formatting: **bold**, *italic*, - bullets, 1. numbered steps, ### headings, [link](https://example.com)."
                          : undefined
                    }
                    rules={
                      key === "title"
                        ? [{ required: true, whitespace: true, max: 160 }]
                        : [{ max: limit || (kind === "short" ? 160 : 4000) }]
                    }
                  >
                    {kind === "long" ? (
                      <Input.TextArea
                        rows={3}
                        maxLength={limit || 4000}
                        showCount
                      />
                    ) : (
                      <Input
                        type={kind === "date" ? "date" : "text"}
                        maxLength={
                          limit || (kind === "short" ? 160 : undefined)
                        }
                      />
                    )}
                  </Form.Item>
                ))}
                {section.title === "Progress and decisions" && (
                  <div style={{ marginBottom: 20 }}>
                    <Typography.Title level={5}>Supporting Documents</Typography.Title>
                    <Typography.Paragraph type="secondary">
                      Link to OneDrive, SharePoint, or other HTTPS documents. Access to each document is managed by its hosting service.
                    </Typography.Paragraph>
                    <Form.List name="supportingDocuments">
                      {(fields, { add, remove }) => (
                        <Space direction="vertical" style={{ width: "100%" }}>
                          {fields.map(({ key, name, ...rest }) => (
                            <Card key={key} size="small">
                              <Row gutter={12}>
                                <Col xs={24} md={10}>
                                  <Form.Item {...rest} name={[name, "title"]} label="Document title" rules={[{ required: true, max: 160 }]}>
                                    <Input maxLength={160} placeholder="e.g. Council recommendation" />
                                  </Form.Item>
                                </Col>
                                <Col xs={24} md={14}>
                                  <Form.Item {...rest} name={[name, "url"]} label="Document link" rules={[{ required: true }, { type: "url", message: "Enter a valid URL" }, { validator: (_, value) => !value || validDocumentUrl(value) ? Promise.resolve() : Promise.reject(new Error("Use an HTTPS link")) }]}>
                                    <Input placeholder="https://..." maxLength={2000} />
                                  </Form.Item>
                                </Col>
                                <Col xs={24}>
                                  <Form.Item {...rest} name={[name, "description"]} label="Description (optional)" rules={[{ max: 500 }]}>
                                    <Input maxLength={500} />
                                  </Form.Item>
                                </Col>
                              </Row>
                              <Form.Item name={[name, "addedBy"]} hidden><Input /></Form.Item>
                              <Form.Item name={[name, "addedAt"]} hidden><Input /></Form.Item>
                              <Button danger onClick={() => remove(name)}>Remove document</Button>
                            </Card>
                          ))}
                          {fields.length < 20 && <Button onClick={() => add({})}>+ Add document link</Button>}
                        </Space>
                      )}
                    </Form.List>
                  </div>
                )}
                {section.title === "Schedule and outcomes" && (
                  <div style={{ marginTop: 16 }}>
                    <Typography.Title level={5} style={{ marginBottom: 4 }}>
                      Project Team Deliverables
                    </Typography.Title>
                    <Typography.Paragraph type="secondary">
                      What has the Council asked the project team to produce or accomplish?
                    </Typography.Paragraph>
                    <Row gutter={[24, 12]} align="top">
                      <Col xs={24} md={12}>
                        <Form.Item name="deliverableCategories" label="Type of deliverable">
                          <Checkbox.Group
                            options={deliverableCategories}
                            style={{ display: "flex", flexDirection: "column", gap: 8 }}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item
                          name="expectedOutcome"
                          label="Describe the expected deliverable"
                          extra="Be specific about what the team should deliver, rather than why the project matters."
                          rules={[{ max: 1000 }]}
                        >
                          <Input.TextArea rows={7} maxLength={1000} showCount />
                        </Form.Item>
                      </Col>
                    </Row>
                  </div>
                )}
                </div>
              </details>
            ))}
            <div
              style={{
                position: "sticky",
                bottom: 0,
                zIndex: 10,
                background: "#fff",
                padding: "12px 16px",
                borderTop: "1px solid #d9d9d9",
                boxShadow: "0 -3px 12px rgba(0,0,0,0.06)",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
            <Space>
              <Button type="primary" htmlType="submit" loading={busy}>
                Save brief
              </Button>
              <Button disabled={busy} onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </Space>
            </div>
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
        <Route
          path="/org/:orgId/login"
          element={<AuthPage user={user} mode="login" />}
        />
        <Route
          path="/org/:orgId/register"
          element={<AuthPage user={user} mode="register" />}
        />
        <Route
          path="/org/:orgId/reset-password"
          element={<AuthPage user={user} mode="reset" />}
        />
        <Route
          path="/org/:orgId/admin/users"
          element={<AdminUsers user={user} />}
        />
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
