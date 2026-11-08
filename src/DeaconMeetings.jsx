import { useEffect, useState } from "react";
import { Alert, App, Button, Card, DatePicker, Form, Input, Modal, Popconfirm, Select, Space, Spin, Typography } from "antd";
import dayjs from "dayjs";
import { addDoc, collection, deleteDoc, doc, Timestamp, updateDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Link } from "react-router-dom";
import { db } from "./firebase";
import { meetingCalendar } from "./meetingCalendar";

const listMeetings = httpsCallable(getFunctions(db.app, "us-central1"), "upcomingDeaconMeetings");
const meetingTime = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" });

function downloadMeeting(orgId, meeting) {
  const dashboardUrl = new URL(`/org/${orgId}`, window.location.origin).href;
  const file = new Blob([meetingCalendar(orgId, meeting, dashboardUrl)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "deacon-meeting.ics";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DeaconMeetings({ orgId, role, projects }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [meetings, setMeetings] = useState(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const canManage = role === "admin";
  const canDownload = canManage || role === "editor";
  const meetingDocs = collection(db, "organizations", orgId, "deaconMeetings");
  const projectOptions = projects.map(project => ({ value: project.id, label: project.title }));

  useEffect(() => {
    let live = true;
    setError(false);
    listMeetings({ orgId }).then(({ data }) => {
      if (live) setMeetings(data.meetings);
    }).catch(() => {
      if (live) setError(true);
    });
    return () => { live = false; };
  }, [orgId, revision]);

  function openEditor(meeting) {
    form.resetFields();
    form.setFieldsValue(meeting.id ? {
      ...meeting,
      startsAt: dayjs(meeting.startsAt),
      endsAt: dayjs(meeting.endsAt),
    } : { agenda: [] });
    setEditing(meeting);
  }

  async function save(values) {
    setSaving(true);
    try {
      const data = {
        startsAt: Timestamp.fromMillis(values.startsAt.valueOf()),
        endsAt: Timestamp.fromMillis(values.endsAt.valueOf()),
        location: values.location.trim(),
        agenda: (values.agenda || []).map(item => item.projectId ? { projectId: item.projectId } : { text: item.text.trim() }),
      };
      if (editing.id) await updateDoc(doc(meetingDocs, editing.id), data);
      else await addDoc(meetingDocs, data);
      setEditing(null);
      setRevision(value => value + 1);
    } catch {
      message.error("Could not save the meeting.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    try {
      await deleteDoc(doc(meetingDocs, id));
      setRevision(value => value + 1);
    } catch {
      message.error("Could not remove the meeting.");
    }
  }

  return (
    <Card title="Upcoming Deacon Meetings" extra={canManage && <Button onClick={() => openEditor({})}>Add meeting</Button>}>
      {error && <Alert type="error" message="Could not load upcoming meetings."
        action={<Button size="small" onClick={() => setRevision(value => value + 1)}>Retry</Button>} />}
      {!meetings && !error && <Spin />}
      {meetings?.length === 0 && !error && <Typography.Text type="secondary">No upcoming meetings scheduled.</Typography.Text>}
      {meetings?.map(meeting => (
        <Card key={meeting.id} size="small" style={{ marginBottom: 8 }}>
          <Space direction="vertical">
            <Typography.Text strong>{meetingTime.formatRange(meeting.startsAt, meeting.endsAt)}</Typography.Text>
            <Typography.Text>{meeting.location}</Typography.Text>
            {meeting.agenda.length > 0 && (
              <details>
                <summary>Agenda</summary>
                <ol>
                  {meeting.agenda.map((item, index) => (
                    <li key={index}>{item.projectId
                      ? <Link to={`/org/${orgId}/projects/${item.projectId}`}>{item.title}</Link>
                      : item.text}</li>
                  ))}
                </ol>
              </details>
            )}
            <Space wrap>
              {canDownload && <Button size="small" onClick={() => downloadMeeting(orgId, meeting)}>Download calendar file</Button>}
              {canManage && <Button size="small" onClick={() => openEditor(meeting)}>Edit</Button>}
              {canManage && <Popconfirm title="Remove this meeting?" onConfirm={() => remove(meeting.id)}>
                <Button size="small" danger>Remove</Button>
              </Popconfirm>}
            </Space>
          </Space>
        </Card>
      ))}
      {canManage && <Modal forceRender open={!!editing} title={editing?.id ? "Edit meeting" : "Add meeting"}
        onCancel={() => setEditing(null)} onOk={() => form.submit()} okText="Save meeting"
        confirmLoading={saving} keyboard={!saving} closable={!saving} maskClosable={!saving} cancelButtonProps={{ disabled: saving }}>
        <Form form={form} layout="vertical" onFinish={save}>
          <Typography.Paragraph type="secondary">
            Times use your device’s time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
          </Typography.Paragraph>
          <Form.Item name="startsAt" label="Starts" rules={[{ required: true }]}>
            <DatePicker showTime={{ format: "HH:mm" }} />
          </Form.Item>
          <Form.Item name="endsAt" label="Ends" dependencies={["startsAt"]} rules={[
            { required: true },
            ({ getFieldValue }) => ({
              validator(_, value) {
                const start = getFieldValue("startsAt");
                return !value || !start || value.isAfter(start)
                  ? Promise.resolve() : Promise.reject(new Error("End time must be after start time."));
              },
            }),
          ]}>
            <DatePicker showTime={{ format: "HH:mm" }} />
          </Form.Item>
          <Form.Item name="location" label="Location" rules={[{ required: true, whitespace: true }]}>
            <Input maxLength={250} />
          </Form.Item>
          <Typography.Text strong>Agenda</Typography.Text>
          <Typography.Paragraph type="secondary">
            Freeform items are public. Linked projects follow the project’s access permissions.
          </Typography.Paragraph>
          <Form.List name="agenda">
            {(fields, { add, move, remove }) => (
              <>
                {fields.map((field, index) => (
                  <div key={field.key} style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                    <Form.Item noStyle shouldUpdate>
                      {() => {
                        const item = form.getFieldValue(["agenda", field.name]);
                        return item?.type === "project" || item?.projectId ? (
                          <Form.Item name={[field.name, "projectId"]} label={`Project ${index + 1}`}
                            rules={[{ required: true }]} style={{ flex: "1 1 160px" }}>
                            <Select showSearch optionFilterProp="label" options={projectOptions} />
                          </Form.Item>
                        ) : (
                          <Form.Item name={[field.name, "text"]} label={`Topic ${index + 1}`}
                            rules={[{ required: true, whitespace: true }]} style={{ flex: "1 1 160px" }}>
                            <Input maxLength={500} />
                          </Form.Item>
                        );
                      }}
                    </Form.Item>
                    <Space size={4}>
                      <Button title="Move up" aria-label={`Move agenda item ${index + 1} up`}
                        disabled={index === 0} onClick={() => move(index, index - 1)}>↑</Button>
                      <Button title="Move down" aria-label={`Move agenda item ${index + 1} down`}
                        disabled={index === fields.length - 1} onClick={() => move(index, index + 1)}>↓</Button>
                      <Button aria-label={`Remove agenda item ${index + 1}`} onClick={() => remove(field.name)}>Remove</Button>
                    </Space>
                  </div>
                ))}
                <Space wrap>
                  <Button disabled={fields.length >= 30} onClick={() => add({ type: "project" })}>Add project</Button>
                  <Button disabled={fields.length >= 30} onClick={() => add({ text: "" })}>Add freeform topic</Button>
                </Space>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>}
    </Card>
  );
}
