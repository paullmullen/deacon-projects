export const activityStatuses = ['draft', 'proposed', 'active'];
export const activityBands = ['Within 1 week', '1–2 weeks ago', '2 weeks–1 month ago', '1–3 months ago', 'Over 3 months ago', 'Unknown'];
export function activityTime(value) {
  const time = value?.toMillis?.() ?? value?.toDate?.().getTime() ?? (value instanceof Date ? value.getTime() : typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : 0);
  return Number.isFinite(time) && time > 0 ? time : 0;
}
export function lastActivity(project, evidence = [], now = Date.now()) {
  return Math.max(0, ...[project.createdAt, project.briefEditedAt, project.progressEditedAt, project.attachmentsEditedAt, ...evidence].map(activityTime).filter(t => t <= now));
}
export function activityBand(time, now = Date.now()) {
  if (!time || time > now) return 5;
  const days = (now - time) / 86400000;
  return days <= 7 ? 0 : days <= 14 ? 1 : days <= 30 ? 2 : days <= 90 ? 3 : 4;
}
export function activityRows(projects, evidence, now = Date.now()) {
  return projects.filter(p => !p.archived && activityStatuses.includes(p.status)).map(p => {
    const time = lastActivity(p, evidence[p.id] || [], now);
    return { ...p, activityTime: time, activityBand: activityBand(time, now) };
  });
}
