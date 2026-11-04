import React, { useEffect, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { auth } from "./firebase";

export default function LeadContact({ orgId, projectId, project }) {
  const [contact, setContact] = useState(null);
  useEffect(() => {
    let live = true;
    setContact(null);
    if (orgId && projectId && project.projectLeadUid) {
      httpsCallable(getFunctions(auth.app, "us-central1"), "projectLeadContact")({ orgId, projectId })
        .then(result => { if (live) setContact(result.data.email); })
        .catch(() => {});
    }
    return () => { live = false; };
  }, [orgId, projectId, project.projectLeadUid]);
  const label = project.leadDeacon || "Not assigned";
  const email = contact || label.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  return <>{label}{email && <> · <a href={`mailto:${email}`}>{email}</a></>}</>;
}
