import { compareProjects, projectStatuses } from './projectPresentation.js';

export const portfolioStatusOptions = projectStatuses.map(value => ({
  value, label: value[0].toUpperCase() + value.slice(1),
}));

export function updateProjects(projects, statuses, includeConfidential) {
  return projects.filter(p => !p.archived && statuses.includes(p.status) &&
    (includeConfidential || p.visibility !== 'private')).sort((a, b) => projectStatuses.indexOf(a.status) - projectStatuses.indexOf(b.status) || compareProjects(a, b));
}
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function portfolioTable(projects, entries, orgId, origin) {
  const headings = ['Project', 'Confidential', 'Leader', 'My Insights', 'Status / Recommendation'];
  const cell = value => escape(value).replace(/\r?\n/g, '<br>');
  const rows = projects.map((p, index) => {
    const section = p.status !== projects[index - 1]?.status
      ? portfolioStatusOptions.find(option => option.value === p.status)?.label
      : undefined;
    const entry = entries[p.id] || {};
    const url = new URL(`/org/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(p.id)}`, origin).href;
    const spaceBefore = section && (p.status === 'proposed' || p.status === 'draft');
    return { section, spaceBefore, values: [p.title || 'Untitled project', p.visibility === 'private' ? 'Confidential' : '', p.leadDeacon || '', entry.insights || '', entry.recommendation || ''], url };
  });
  const style = 'border:1px solid #555;padding:8px;vertical-align:top;text-align:left;';
  const header = headings.map(heading =>
    `<th scope="col" bgcolor="#245e91" style="${style}background-color:#245e91;color:#ffffff"><span style="color:#ffffff">${heading}</span></th>`).join('');
  const body = rows.map(row => {
    const spacer = row.spaceBefore
      ? `<tr aria-hidden="true"><td colspan="${headings.length}" style="height:14px;font-size:14px;line-height:14px;padding:0">&nbsp;</td></tr>`
      : '';
    const section = row.section
      ? `<tr><th colspan="${headings.length}" style="${style}background:#f0f5ff">${row.section}</th></tr>`
      : '';
    const cells = row.values.map((value, index) => {
      const background = index === 1 && value ? 'background:#f8d6be;' : '';
      const content = index === 0 ? `<a href="${escape(row.url)}">${cell(value)}</a>` : cell(value);
      return `<td style="${style}${background}">${content}</td>`;
    }).join('');
    return `${spacer}${section}<tr>${cells}</tr>`;
  }).join('');
  return {
    html: `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;width:100%"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`,
    text: [headings.join('\t'), ...rows.flatMap(row => {
      const line = row.values.map((value, index) => index === 0 ? `${value} (${row.url})` : value).join('\t');
      if (row.spaceBefore) return ['', row.section, line];
      return row.section ? [row.section, line] : [line];
    })].join('\n'),
  };
}
