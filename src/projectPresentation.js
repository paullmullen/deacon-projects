export const projectStatuses = ["active", "proposed", "draft", "closed"];

export function projectPriority(project) {
  return Number.isSafeInteger(project.priority) && project.priority > 0 && project.priority <= 999999
    ? project.priority
    : null;
}

export function compareProjects(a, b, sort = "priority") {
  const byTitle = String(a.title || "").localeCompare(String(b.title || "")) ||
    String(a.id || "").localeCompare(String(b.id || ""));
  if (sort === "title") return byTitle;
  return (projectPriority(a) ?? Infinity) - (projectPriority(b) ?? Infinity) || byTitle;
}

export function reviewPackageProjects(projects, selectedStatuses, sort = "priority") {
  return projects
    .filter(p => !p.archived && p.status !== "closed" && selectedStatuses.includes(p.status))
    .sort((a, b) => projectStatuses.indexOf(a.status) - projectStatuses.indexOf(b.status) ||
      compareProjects(a, b, sort));
}

export const isRepresentationOnly = project => project.deaconRole === "representation";

export function safeDocumentUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

// Return a new group in the requested order; callers persist sequential priorities.
export function reorderProjects(group, sourceId, targetId, direction) {
  const from = group.findIndex(p => p.id === sourceId);
  const to = direction ? from + direction : group.findIndex(p => p.id === targetId);
  if (from < 0 || to < 0 || to >= group.length || from === to) return null;
  if (group[from].status !== group[to].status) return null;
  const result = [...group];
  const [moved] = result.splice(from, 1);
  result.splice(to, 0, moved);
  return result;
}
