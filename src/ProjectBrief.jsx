import React from "react";
import { isRepresentationOnly, safeDocumentUrl } from "./projectPresentation";
import "./ProjectBrief.css";
import MarkdownText from "./MarkdownText";

const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : "—";
const date = (value) => {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match
    ? new Date(+match[1], +match[2] - 1, +match[3]).toLocaleDateString(
        "en-US",
        { month: "long", day: "numeric", year: "numeric" },
      )
    : value;
};
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
const lines = (value) =>
  (value || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
function Block({ heading, value, bullets = false, flowing = false }) {
  return (
    <section className={`brief-block${flowing ? " brief-block-flowing" : ""}`}>
      <h2>{heading}</h2>
      {bullets && lines(value).length ? (
        <ul>
          {lines(value).map((item, i) => (
            <li key={i}>{item.replace(/^[•*-]\s*/, "")}</li>
          ))}
        </ul>
      ) : (
        <MarkdownText value={value} />
      )}
    </section>
  );
}
function Meta({ label, children }) {
  return (
    <div className="brief-meta-item">
      <div className="brief-meta-label">{label}</div>
      <div className="brief-meta-value">{children}</div>
    </div>
  );
}
function BriefTable({ heading, columns, rows }) {
  return (
    <section className="brief-block">
      <h2>{heading}</h2>
      {rows?.length ? (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.92em",
          }}
        >
          <thead>
            <tr>
              {columns.map(([key, label]) => (
                <th
                  key={key}
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #bbb",
                    padding: "5px 8px 5px 0",
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map(([key]) => (
                  <td
                    key={key}
                    style={{
                      verticalAlign: "top",
                      borderBottom: "1px solid #eee",
                      padding: "6px 8px 6px 0",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {text(row[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>—</p>
      )}
    </section>
  );
}
export default function ProjectBrief({ project, orgName = "Deacons" }) {
  const participationOnly = isRepresentationOnly(project);
  const updated =
    project.updatedAt?.toDate?.()?.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }) || "—";
  const progressUpdated =
    project.progressEditedAt?.toDate?.()?.toLocaleDateString("en-US") ||
    (project.progressEditedAt instanceof Date
      ? project.progressEditedAt.toLocaleDateString("en-US")
      : null);
  const lastEditLabel = progressUpdated
    ? `Progress last edited on: ${progressUpdated}`
    : `Project last updated on: ${updated} (progress edit date unavailable)`;
  const status = [
    project.status
      ? project.status[0].toUpperCase() + project.status.slice(1)
      : "—",
    project.statusNote,
  ]
    .filter(Boolean)
    .join(" · ");
  const assumptions =
    project.assumptionsTable ||
    lines(project.assumptions).map((assumption) => ({
      assumption,
      status: "Unverified",
    }));
  const steps =
    project.nextStepsTable ||
    lines(project.nextSteps).map((action) => ({ action, owner: "" }));
  return (
    <article className="project-brief" aria-label="Printable project brief">
      <table className="brief-print-frame" role="presentation">
        <thead>
          <tr><td>
            <div className="brief-running-header">
              <span>{text(project.title)}</span>
              <span>Project brief · {project.visibility === "public" ? "Public" : "Confidential"}</span>
            </div>
          </td></tr>
        </thead>
        <tbody><tr><td className="brief-print-body">
      <div className="brief-top-rule" />
      <div className="brief-eyebrow">
        {orgName.toUpperCase()} · PROJECT BRIEF ·{" "}
        {project.visibility === "public" ? "PUBLIC" : "CONFIDENTIAL"}
      </div>
      <h1>{text(project.title)}</h1>
      <p className="brief-deck">{text(project.shortDescription)}</p>
      <div className="brief-meta">
        <Meta label="Project lead">{text(project.leadDeacon)}</Meta>
        {participationOnly && <Meta label="Deacon involvement">Deacon Participation Only</Meta>}
        {!participationOnly && <>
        <Meta label="Current status">{status}</Meta>
        <Meta label="Project team deliverables">
          <div>
            {Array.isArray(project.deliverableCategories) && project.deliverableCategories.length > 0 && (
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {project.deliverableCategories.join(" · ")}
              </div>
            )}

          </div>
        </Meta>
        </>}
        <Meta label="Project team">{text(project.teamMembers)}</Meta>
        {!participationOnly && <>
        <Meta label="Kick-off">{date(project.kickoffDate)}</Meta>
        <Meta label="Target completion">
          <div>{project.targetDate ? date(project.targetDate) : "Ongoing"}</div>
          {project.targetDate && (
            <div style={{ fontSize: "0.85em", color: "#666", marginTop: 3 }}>
              {remainingTime(project.targetDate)}
            </div>
          )}
        </Meta>
        </>}
        <Meta label="Project sponsor">{text(project.projectSponsor)}</Meta>
        <Meta label="Key stakeholders">{text(project.stakeholders)}</Meta>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
          marginTop: 12,
          marginBottom: 8,
        }}
      >
        <h2 style={{ margin: 0 }}>{participationOnly ? "Project overview" : "Project details and progress"}</h2>
        {!participationOnly && <span style={{ color: "#666", fontSize: "0.85em" }}>
          {lastEditLabel}
        </span>}
      </div>
      <div className="brief-narrative">
          <Block heading="Why this matters" value={project.purpose} flowing />
          <Block
            heading="Detailed description and scope"
            value={project.longDescription}
            flowing
          />
          <Block heading="Out of scope" value={project.scope} flowing />
      </div>
      {!participationOnly && <div className="brief-columns">
        <div>
          <Block
            heading="Progress so far"
            value={project.accomplishments}
            bullets
          />
        </div>
        <div>
          <Block heading="Barriers and blockers" value={project.barriers} />
          <Block
            heading="Decisions or help needed"
            value={project.decisionsNeeded}
          />
        </div>
      </div>}
      {!participationOnly && <>
      <section className="brief-block" style={{ marginTop: 16 }}>
        <h2 style={{ marginBottom: 12 }}>Project assumptions and next steps</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 310px), 1fr))",
            gap: 24,
            alignItems: "start",
          }}
        >
          <BriefTable
            heading="Key assumptions"
            columns={[
              ["assumption", "Assumption"],
              ["status", "Verification status"],
            ]}
            rows={assumptions}
          />
          <BriefTable
            heading="Next steps and owners"
            columns={[
              ["action", "Action"],
              ["owner", "Owner"],
            ]}
            rows={steps}
          />
        </div>
      </section>
      {Array.isArray(project.supportingDocuments) && project.supportingDocuments.length > 0 && (
        <section className="brief-block brief-documents">
          <h2>Supporting documents</h2>
          {project.supportingDocuments.map((document, index) => {
            const href = safeDocumentUrl(document.url);
            return (
              <div key={index} className="brief-document">
                {href ? <a href={href} target="_blank" rel="noopener noreferrer">{document.title || "Supporting document"}</a> : <strong>{document.title || "Supporting document"}</strong>}
                {document.description && <p>{document.description}</p>}
                {href && <div className="brief-document-url">{href}</div>}
              </div>
            );
          })}
        </section>
      )}
      {project.links?.trim() && <Block heading="Other supporting links" value={project.links} />}
      </>}
      <footer className="brief-footer">
        <span>Updated {updated}</span>
        <span style={{ textAlign: "right", marginLeft: "auto" }}>
          Paper copies of this brief may not be up-to-date. Check online at{" "}
          <a href="http://deaconprojects.web.app/org/elmbrook">http://deaconprojects.web.app/org/elmbrook</a>
        </span>
      </footer>
        </td></tr></tbody>
      </table>
    </article>
  );
}

