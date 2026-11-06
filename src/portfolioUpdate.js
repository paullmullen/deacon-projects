import { compareProjects, projectStatuses } from './projectPresentation.js';

export function updateProjects(projects, statuses, includeConfidential) {
  return projects.filter(p => !p.archived && statuses.includes(p.status) &&
    (includeConfidential || p.visibility !== 'private')).sort((a, b) => projectStatuses.indexOf(a.status) - projectStatuses.indexOf(b.status) || compareProjects(a, b));
}
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function portfolioTable(projects, entries, orgId, origin) {
  const headings = ['Project', 'Confidential', 'Leader', 'My Insights', 'Status / Recommendation'];
  const cell = value => escape(value).replace(/\r?\n/g, '<br>');
  const rows = projects.map(p => {
    const entry = entries[p.id] || {};
    const url = new URL(`/org/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(p.id)}`, origin).href;
    return { values: [p.title || 'Untitled project', p.visibility === 'private' ? 'Confidential' : '', p.leadDeacon || '', entry.insights || '', entry.recommendation || ''], url };
  });
  const style = 'border:1px solid #555;padding:8px;vertical-align:top;text-align:left;';
  return {
    html: `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;width:100%"><thead><tr>${headings.map(h => `<th style="${style}background:#245e91;color:white">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.values.map((v,i) => `<td style="${style}${i === 1 && v ? 'background:#f8d6be;' : ''}">${i === 0 ? `<a href="${escape(row.url)}">${cell(v)}</a>` : cell(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
    text: [headings.join('\t'), ...rows.map(r => r.values.map((v,i) => i === 0 ? `${v} (${r.url})` : v).join('\t'))].join('\n'),
  };
}
