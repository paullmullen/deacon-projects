import React from "react";

// Safe, dependency-free Markdown subset for project brief narratives.
// Supported: paragraphs, headings, bullet/numbered lists, emphasis, code, links.
// Raw HTML is always rendered as text.
const safeUrl = (url) => /^https?:\/\//i.test(url) || /^mailto:/i.test(url);
function inline(value) {
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  const result = [];
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    if (match.index > cursor) result.push(value.slice(cursor, match.index));
    const key = match.index;
    if (match[2]) {
      const url = match[3].trim();
      result.push(safeUrl(url) ? <a key={key} href={url} target="_blank" rel="noopener noreferrer">{match[2]}</a> : match[0]);
    } else if (match[4]) result.push(<strong key={key}>{match[4]}</strong>);
    else if (match[5]) result.push(<em key={key}>{match[5]}</em>);
    else if (match[6]) result.push(<code key={key}>{match[6]}</code>);
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) result.push(value.slice(cursor));
  return result;
}
export default function MarkdownText({ value }) {
  if (typeof value !== "string" || !value.trim()) return <p>—</p>;
  const lines = value.trim().split(/\r?\n/);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(lines[i]);
    if (heading) {
      const Tag = `h${Math.min(heading[1].length + 2, 5)}`;
      blocks.push(<Tag key={i}>{inline(heading[2])}</Tag>);
      i++; continue;
    }
    const bullet = /^\s*[-*+]\s+(.+)$/.test(lines[i]);
    const numbered = /^\s*\d+\.\s+(.+)$/.test(lines[i]);
    if (bullet || numbered) {
      const start = i;
      const entries = [];
      const re = bullet ? /^\s*[-*+]\s+(.+)$/ : /^\s*\d+\.\s+(.+)$/;
      while (i < lines.length && re.test(lines[i])) {
        entries.push(<li key={i}>{inline(lines[i].match(re)[1])}</li>);
        i++;
      }
      blocks.push(bullet ? <ul key={start}>{entries}</ul> : <ol key={start}>{entries}</ol>);
      continue;
    }
    const start = i;
    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3})\s+/.test(lines[i]) && !/^\s*(?:[-*+]\s+|\d+\.\s+)/.test(lines[i])) {
      paragraph.push(lines[i].trim());
      i++;
    }
    blocks.push(<p key={start}>{inline(paragraph.join(" "))}</p>);
  }
  return <div className="brief-markdown">{blocks}</div>;
}
