import { hasProjectReadAccess } from "./projectAccess.js";
import { projectStatuses, compareProjects } from "./projectPresentation.js";

export function navigationProjects(items, role, projectIds, context, currentId) {
  const needle = String(context?.search || "").trim().toLowerCase();
  return items.filter(p => {
    if (!hasProjectReadAccess(role, projectIds, p, p.id)) return false;
    if (!role && !["active", "proposed", "closed"].includes(p.status)) return false;
    if (p.id === currentId) return true;
    if (p.archived && !context?.showArchived) return false;
    if (context && p.status === "closed" && !context.showClosed && !needle) return false;
    return !needle || [p.title, p.shortDescription, p.leadDeacon, p.projectSponsor]
      .some(value => String(value || "").toLowerCase().includes(needle));
  }).sort((a, b) => Number(!!a.archived) - Number(!!b.archived) ||
    projectStatuses.indexOf(a.status) - projectStatuses.indexOf(b.status) || compareProjects(a, b, context?.sort));
}
