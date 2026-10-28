import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, Select } from "antd";
import { getFunctions, httpsCallable } from "firebase/functions";
import { auth } from "./firebase";

export default function ProjectLeadField({ orgId, project, form }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true); setError("");
    httpsCallable(getFunctions(auth.app, "us-central1"), "listProjectLeads")({orgId})
      .then(result => { if (live) setLeads(result.data.leads); })
      .catch(error => { if (live) setError(error.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [orgId, retry]);
  const options = leads.map(lead => ({value:lead.uid,label:`${lead.name} (${lead.email})`}));
  if (project.projectLeadUid && !leads.some(lead=>lead.uid===project.projectLeadUid))
    options.unshift({value:project.projectLeadUid,label:`${project.leadDeacon || "Current lead"} (existing assignment)`,disabled:true});
  return <div>
    <Form.Item name="leadDeacon" hidden><Input /></Form.Item>
    <Form.Item name="projectLeadUid" label="Project lead"
      extra={project.leadDeacon && !project.projectLeadUid
        ? `Existing lead: ${project.leadDeacon}. Select an account to enable email notifications. Leaving this unchanged preserves the name.`
        : "Select an active editor or administrator. New meeting notes notify this person by email."}>
      <Select allowClear showSearch optionFilterProp="label" loading={loading} disabled={loading || !!error}
        placeholder={project.leadDeacon || "Select a project lead"} options={options}
        onChange={uid=>form.setFieldValue("leadDeacon",leads.find(lead=>lead.uid===uid)?.name || "")} />
    </Form.Item>
    {error && <Alert type="warning" message="Project lead list could not be loaded" description={error}
      action={<Button onClick={()=>setRetry(n=>n+1)}>Retry</Button>} />}
  </div>;
}
