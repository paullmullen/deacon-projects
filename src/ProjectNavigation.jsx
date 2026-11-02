import { useEffect, useState } from "react";
import { Button, Drawer, Alert, Spin } from "antd";
import { useNavigate } from "react-router-dom";
import { loadPortfolio } from "./loadPortfolio";
import { navigationProjects } from "./projectNavigationOrder.js";
import "./ProjectNavigation.css";

export default function ProjectNavigation({ orgId, projectId, role, projectIds, loading, userId, context, disabled, children }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const accessKey = JSON.stringify([orgId, role, projectIds, userId]);
  useEffect(() => {
    if (loading) return;
    let live = true;
    setResult(null);
    setError("");
    loadPortfolio(orgId, role, projectIds).then(items => {
      if (live) setResult({ key: accessKey, items });
    }).catch(() => { if (live) setError("Project navigation could not be loaded."); });
    return () => { live = false; };
  }, [accessKey, loading]);
  useEffect(() => { setOpen(false); }, [projectId]);
  const projects = !loading && result?.key === accessKey
    ? navigationProjects(result.items, role, projectIds, context, projectId) : [];
  const index = projects.findIndex(p => p.id === projectId);
  const previous = index > 0 ? projects[index - 1] : null;
  const next = index >= 0 ? projects[index + 1] : null;
  const go = p => {
    if (!p || disabled) return;
    nav(`/org/${orgId}/projects/${p.id}`, { state: { portfolio: context } });
    window.scrollTo({ top: 0 });
  };
  const list = <nav aria-label="Projects">
    {error && <Alert type="warning" message={error} />}
    {!result && !error && <Spin size="small" />}
    {["active", "proposed", "draft", "closed"].map(status => {
      const group = projects.filter(p => p.status === status);
      return group.length > 0 && <section key={status}>
        <h3>{status[0].toUpperCase() + status.slice(1)} ({group.length})</h3>
        {group.map(p => <Button key={p.id} type="text" block
          className={p.id === projectId ? "project-nav-current" : ""}
          aria-current={p.id === projectId ? "page" : undefined}
          disabled={disabled} onClick={() => go(p)}>{p.title || "Untitled project"}</Button>)}
      </section>;
    })}
  </nav>;
  return <div className={`project-review-layout ${collapsed ? "project-nav-collapsed" : ""}`}>
    <aside className="project-review-sidebar">
      <Button onClick={() => setCollapsed(true)} aria-label="Collapse project list">Hide projects</Button>
      {list}
    </aside>
    <div className="project-review-main">
      <div className="project-review-controls" aria-label="Project navigation">
        <Button className="project-list-toggle" onClick={() => { if (window.matchMedia("(min-width: 1101px)").matches) setCollapsed(false); else setOpen(true); }}>Projects</Button>
        <Button disabled={disabled || !previous} title={previous?.title} onClick={() => go(previous)}>← Previous</Button>
        <span aria-live="polite">{index >= 0 ? `${index + 1} of ${projects.length}` : ""}</span>
        <Button disabled={disabled || !next} title={next?.title} onClick={() => go(next)}>Next →</Button>
      </div>
      {children}
    </div>
    <Drawer title="Projects" open={open} onClose={() => setOpen(false)} placement="left" rootClassName="project-navigation-drawer">{list}</Drawer>
  </div>;
}
