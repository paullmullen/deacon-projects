import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Select,
  Space,
  Table,
  Typography,
  message,
  Divider,
} from "antd";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  reload,
} from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from "firebase/functions";
import { auth, db } from "./firebase";
const functions = getFunctions(auth.app, "us-central1");
if (import.meta.env.VITE_USE_EMULATORS === "true")
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
const call = (name, data) => httpsCallable(functions, name)(data);
const roles = ["viewer", "editor", "admin"];
export function AuthPage({ user, mode = "login" }) {
  const { orgId = "elmbrook" } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [loginError, setLoginError] = useState("");
  const submit = async (v) => {
    setBusy(true);
    setNotice("");
    setLoginError("");
    try {
      if (mode === "register") {
        const cred = await createUserWithEmailAndPassword(
          auth,
          v.email.trim(),
          v.password,
        );
        await updateProfile(cred.user, { displayName: v.displayName.trim() });
        await sendEmailVerification(cred.user);
        setNotice(
          "Account created. Check your inbox for a verification email, then return to the portfolio to request access.",
        );
      } else if (mode === "reset") {
        await sendPasswordResetEmail(auth, v.email.trim());
        setNotice(
          "If this address has an account, password reset instructions will arrive by email.",
        );
      } else {
        await signInWithEmailAndPassword(auth, v.email.trim(), v.password);

        navigate(`/org/${encodeURIComponent(orgId)}`, {
          replace: true,
        });
      }
    } catch (e) {
      if (mode === "login") {
        setLoginError(
          [
            "auth/invalid-credential",
            "auth/invalid-login-credentials",
            "auth/wrong-password",
            "auth/user-not-found",
          ].includes(e.code)
            ? "Email or password not recognized. Please try again."
            : "Unable to sign in right now. Please try again.",
        );

        form.setFieldValue("password", "");
      } else {
        setLoginError(
          mode === "register" && e.code === "auth/email-already-in-use"
            ? "An account already exists with this email. Please sign in instead."
            : mode === "register" && e.code === "auth/weak-password"
              ? "Choose a stronger password (at least 8 characters)."
              : mode === "reset"
                ? "Unable to send a reset email right now. Please try again."
                : "Unable to create your account right now. Please try again.",
        );
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      title={
        mode === "register"
          ? "Create your Deacon Projects account"
          : mode === "reset"
            ? "Reset password"
            : "Sign in"
      }
      style={{ maxWidth: 520, margin: "auto" }}
    >
      <Typography.Paragraph type="secondary">
        {mode === "register"
          ? "Create an account, verify your email, then request access to the Elmbrook project portfolio. An administrator will review your request."
          : mode === "reset"
            ? "Enter your account email and we’ll send password reset instructions."
            : "Sign in to view your organization’s projects and manage work assigned to you."}
      </Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        onFinish={submit}
        onFinishFailed={({ errorFields }) => {
          console.error("Sign-in form validation failed:", errorFields);
        }}
      >
        {mode === "register" && (
          <Form.Item
            label="Full name"
            name="displayName"
            rules={[{ required: true, max: 120 }]}
          >
            <Input />
          </Form.Item>
        )}
        <Form.Item
          label="Email"
          name="email"
          rules={[{ required: true, type: "email" }]}
        >
          <Input autoComplete="email" />
        </Form.Item>
        {mode !== "reset" && (
          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, min: 8 }]}
          >
            <Input.Password
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
            />
          </Form.Item>
        )}
        <Button type="primary" htmlType="submit" loading={busy}>
          {mode === "register"
            ? "Create account"
            : mode === "reset"
              ? "Send reset email"
              : "Sign in"}
        </Button>
      </Form>

      {loginError && (
        <Alert
          type="error"
          showIcon
          message={loginError}
          style={{ marginTop: 12 }}
        />
      )}

      {notice && (
        <Alert
          type="info"
          showIcon
          message={notice}
          style={{ marginTop: 12 }}
        />
      )}
      <Space wrap style={{ marginTop: 16 }}>
        {mode !== "login" && <Link to={`/org/${orgId}/login`}>Back to sign in</Link>}
        {mode === "login" && <Link to={`/org/${orgId}/register`}>Create an account</Link>}
        {mode === "login" && <Link to={`/org/${orgId}/reset-password`}>Forgot password?</Link>}
        <Link to={`/org/${orgId}`}>View portfolio</Link>
      </Space>
      {user && !user.emailVerified && <EmailVerification user={user} />}
    </Card>
  );
}
export function EmailVerification({ user }) {
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    try {
      await reload(user);
      message.info(
        user.emailVerified
          ? "Email verified. Refresh the page to continue."
          : "Not verified yet. Check your inbox.",
      );
    } catch (e) {
      message.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Alert
      style={{ marginTop: 12 }}
      type="warning"
      showIcon
      message="Email verification required"
      description={
        <Space wrap>
          <Button
            size="small"
            onClick={async () => {
              try {
                await sendEmailVerification(user);
                message.success("Verification email sent");
              } catch (e) {
                message.error(e.message);
              }
            }}
          >
            Resend verification
          </Button>
          <Button size="small" loading={busy} onClick={check}>
            I've verified my email
          </Button>
        </Space>
      }
    />
  );
}
export function MembershipStatus({ orgId, user, role }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user || role) return;
    getDoc(doc(db, "organizations", orgId, "membershipRequests", user.uid))
      .then((s) => setState(s.exists() ? s.data().status : "none"))
      .catch(() => setState("none"));
  }, [orgId, user?.uid, role]);
  if (!user || role) return null;
  if (!user.emailVerified) return <EmailVerification user={user} />;
  return (
    <Alert
      style={{ marginTop: 12 }}
      type="info"
      showIcon
      message={
        state === "pending"
          ? "Your access request is awaiting approval"
          : state === "rejected"
            ? "Membership request declined"
            : "Request access to this organization"
      }
      description={
        state === "pending"
          ? "An organization administrator will review your request. You can return to this page later to check its status."
          : state === "rejected"
            ? "Please contact an organization administrator if you believe this is an error."
            : state === "none" && (
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await call("requestMembership", {
                  orgId,
                  displayName: user.displayName,
                });
                setState(r.data.status);
              } catch (e) {
                message.error(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Request membership
          </Button>
        )
      }
    />
  );
}
export function AdminUsers({ user }) {
  const { orgId } = useParams();
  const [role, setRole] = useState(null);
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [members, setMembers] = useState([]);
  const [settings, setSettings] = useState({});
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    const [a, b, c, organization] = await Promise.all([
      getDocs(collection(db, "organizations", orgId, "membershipRequests")),
      getDocs(collection(db, "organizations", orgId, "members")),
      getDoc(doc(db, "organizations", orgId, "settings", "email")),
      getDoc(doc(db, "organizations", orgId)),
    ]);
    setOrgName(organization.exists() ? organization.data().name || "" : "");
    setRequests(
      a.docs
        .map((x) => ({ uid: x.id, ...x.data() }))
        .filter((x) => x.status === "pending"),
    );
    setMembers(b.docs.map((x) => ({ uid: x.id, ...x.data() })));
    setSettings(c.exists() ? c.data() : {});
  };
  useEffect(() => {
    let live = true;
    setLoading(true);
    getDoc(doc(db, "organizations", orgId, "members", user?.uid || "_"))
      .then(async (s) => {
        if (!live) return;
        const r = s.exists() ? s.data().role : null;
        setRole(r);
        if (r === "admin") await refresh();
      })
      .catch((e) => message.error(e.message))
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [orgId, user?.uid]);
  const act = async (name, data) => {
    setBusy(true);
    try {
      await call(name, { orgId, ...data });
      message.success("Saved");
      await refresh();
    } catch (e) {
      message.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (loading) return <Card loading />;
  if (role !== "admin")
    return (
      <Alert type="error" message="Tenant administrator access required" />
    );
  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Typography.Title level={2}>
        User administration · {orgName || orgId}
      </Typography.Title>
      <Card title={`Pending requests (${requests.length})`}>
        <Table
          rowKey="uid"
          dataSource={requests}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: "Name", dataIndex: "displayName" },
            { title: "Email", dataIndex: "email" },
            {
              title: "Invited",
              dataIndex: "invited",
              render: (v) => (v ? "Yes" : "No"),
            },
            {
              title: "Actions",
              render: (_, r) => (
                <Space wrap>
                  {roles.map((role) => (
                    <Button
                      key={role}
                      disabled={busy}
                      size="small"
                      onClick={() =>
                        act("approveMembership", { uid: r.uid, role })
                      }
                    >
                      Approve {role}
                    </Button>
                  ))}
                  <Button
                    danger
                    size="small"
                    disabled={busy}
                    onClick={() => act("rejectMembership", { uid: r.uid })}
                  >
                    Decline
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Card title="Invite a user">
        <Space.Compact style={{ maxWidth: 550, width: "100%" }}>
          <Input
            type="email"
            placeholder="Email address"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <Button
            type="primary"
            disabled={busy || !inviteEmail}
            onClick={async () => {
              await act("inviteMember", { email: inviteEmail });
              setInviteEmail("");
            }}
          >
            Send invitation
          </Button>
        </Space.Compact>
      </Card>
      <Card title="Current members">
        <Table
          rowKey="uid"
          dataSource={members}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: "Name", dataIndex: "displayName" },
            { title: "Email", dataIndex: "email" },
            {
              title: "Role",
              render: (_, r) => (
                <Select
                  style={{ width: 130 }}
                  value={r.role}
                  disabled={busy || r.uid === user.uid}
                  options={roles.map((value) => ({ value, label: value }))}
                  onChange={(role) =>
                    act("changeMemberRole", { uid: r.uid, role })
                  }
                />
              ),
            },
          ]}
        />
      </Card>
      <Card title="Organization email settings">
        <Form
          key={settings.updatedAt?.seconds || 0}
          layout="vertical"
          initialValues={settings}
          onFinish={(v) => act("saveTenantEmailSettings", v)}
        >
          <Form.Item
            label="Reply-To email"
            name="replyToEmail"
            rules={[{ type: "email" }]}
          >
            <Input placeholder="Organization administrator email" />
          </Form.Item>
          <Form.Item label="Reply-To display name" name="replyToName">
            <Input maxLength={100} />
          </Form.Item>
          <Space wrap>
            <Button htmlType="submit" type="primary" disabled={busy}>
              Save settings
            </Button>
            <Button disabled={busy} onClick={() => act("testTenantEmail", {})}>
              Send test email to me
            </Button>
          </Space>
        </Form>
      </Card>
    </Space>
  );
}
