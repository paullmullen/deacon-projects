import { useEffect, useState } from "react";
import { Alert } from "antd";
import { getFunctions, httpsCallable } from "firebase/functions";
import { auth } from "./firebase";

const listSpecialAccess = httpsCallable(getFunctions(auth.app, "us-central1"), "listProjectSpecialAccess");

export default function ProjectSpecialAccess({ orgId, projectId }) {
  const [names, setNames] = useState([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    listSpecialAccess({ orgId, projectId })
      .then(({ data }) => { if (live) setNames(data.names); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [orgId, projectId]);

  if (!error && !names.length) return null;

  return (
    <Alert
      className="project-special-access"
      type="warning"
      showIcon
      message={error ? "Special Access could not be checked." : "Special Access to this project"}
      description={error ? undefined : names.join(", ")}
      style={{ marginBottom: 16 }}
    />
  );
}
