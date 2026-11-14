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

function MeetingDateTime({ value, onChange, id }) {
  const hour = value ? value.hour() % 12 || 12 : 6;
  const minute = value?.minute() ?? 0;
  const period = value && value.hour() < 12 ? "AM" : "PM";
  function changeTime(nextHour, nextMinute, nextPeriod) {
    onChange(value.hour(nextHour % 12 + (nextPeriod === "PM" ? 12 : 0)).minute(nextMinute).second(0).millisecond(0));
  }
  return <Space wrap>
    <DatePicker id={id} value={value} onChange={date => onChange(date
      ? date.hour(value?.hour() ?? 18).minute(minute).second(0).millisecond(0) : null)} />
    <Select aria-label="Hour" disabled={!value} value={hour} style={{ width: 70 }}
      options={Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: String(index + 1) }))}
      onChange={next => changeTime(next, minute, period)} />
    <Select aria-label="Minute" disabled={!value} value={minute} style={{ width: 70 }}
      options={Array.from({ length: 60 }, (_, index) => ({ value: index, label: String(index).padStart(2, "0") }))}
      onChange={next => changeTime(hour, next, period)} />
    <Select aria-label="AM or PM" disabled={!value} value={period} style={{ width: 80 }}
      options={[{ value: "AM", label: "AM" }, { value: "PM", label: "PM" }]}
      onChange={next => changeTime(hour, minute, next)} />
  </Space>;
}

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
      title: meeting.title || "Deacon Meeting",
      startsAt: dayjs(meeting.startsAt),
      endsAt: dayjs(meeting.endsAt),
    } : { title: "Regular Meeting", agenda: [] });
    setEditing(meeting);
  }

  async function save(values) {
    setSaving(true);
    try {
      const data = {
        title: values.title.trim(),
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
            <Typography.Title level={5} style={{ margin: 0 }}>{meeting.title || "Deacon Meeting"}</Typography.Title>
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
          <Form.Item name="title" label="Meeting title" rules={[{ required: true, whitespace: true }]}>
            <Input maxLength={160} placeholder="Regular Meeting or Special Meeting for…" />
          </Form.Item>
          <Typography.Paragraph type="secondary">
            Times use your device’s time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
          </Typography.Paragraph>
          <Form.Item name="startsAt" label="Starts" rules={[{ required: true }]}>
            <MeetingDateTime />
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
            <MeetingDateTime />
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
