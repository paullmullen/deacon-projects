import React from 'react';
import './ProjectBrief.css';

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '—');
const date = (value) => {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString('en-US', {month:'long',day:'numeric',year:'numeric'});
};
const lines = (value) => (value || '').split('\n').map(x=>x.trim()).filter(Boolean);
function Block({heading,value,bullets=false}) {
  return <section className="brief-block"><h2>{heading}</h2>{bullets && lines(value).length ?
    <ul>{lines(value).map((item,i)=><li key={i}>{item.replace(/^[•*-]\s*/, '')}</li>)}</ul> :
    <p>{text(value)}</p>}</section>;
}
function Meta({label,children}) {return <div className="brief-meta-item"><div className="brief-meta-label">{label}</div><div className="brief-meta-value">{children}</div></div>}
export default function ProjectBrief({project,orgName='Deacons'}) {
  const updated = project.updatedAt?.toDate?.()?.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) || '—';
  const stakeholders = project.stakeholders || '';
  const sponsor = project.projectSponsor || '';
  const status = [project.status ? project.status[0].toUpperCase()+project.status.slice(1) : '—',project.statusNote].filter(Boolean).join(' · ');
  return <article className="project-brief" aria-label="Printable project brief">
    <div className="brief-top-rule" />
    <div className="brief-eyebrow">{orgName.toUpperCase()} · PROJECT BRIEF · {(project.visibility||'private').toUpperCase()}</div>
    <h1>{text(project.title)}</h1>
    <p className="brief-deck">{text(project.shortDescription)}</p>
    <div className="brief-meta">
      <Meta label="Project lead">{text(project.leadDeacon)}</Meta>
      <Meta label="Current status">{status}</Meta>
      <Meta label="Expected outcome">{text(project.expectedOutcome)}</Meta>
      <Meta label="Project Team Members">{text(project.teamMembers)}</Meta>
      <Meta label="Kick-off">{date(project.kickoffDate)}</Meta>
      <Meta label="Target completion">{date(project.targetDate)}</Meta>
      <Meta label="Project sponsor">{text(sponsor)}</Meta>
      <Meta label="Key stakeholders">{text(stakeholders)}</Meta>
    </div>
    <div className="brief-columns">
      <div>
        <Block heading="Why this matters" value={project.purpose || project.longDescription}/>
        <Block heading="What we will deliver" value={project.deliverables}/>
        <Block heading="Scope & people involved" value={project.scope || project.longDescription}/>
      </div>
      <div>
        <Block heading="Progress so far" value={project.accomplishments} bullets/>
        <Block heading="Next steps" value={project.nextSteps} bullets/>
        <Block heading="Key assumptions" value={project.assumptions}/>
        <Block heading="Barriers & dependencies" value={project.barriers}/>
      </div>
    </div>
    <div className="brief-decision"><h2>Decision needed</h2><p>{text(project.decisionsNeeded)}</p></div>
    <footer className="brief-footer"><span>Updated {updated} · Next review {date(project.nextReviewDate)}</span><span>Working details: {text(project.workingDetails || project.links)}</span></footer>
  </article>;
}
