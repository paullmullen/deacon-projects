export const roleLabel = role => ({ viewer: "Viewer", special_access: "Special Access", editor: "Editor", admin: "Admin" }[role] || role);
export function hasProjectEditorAccess(role, projectIds, project, projectId) {
  return role === "editor" || role === "admin" ||
    (role === "special_access" && (project?.visibility === "private" || project?.status === "draft") && (projectIds || []).includes(projectId));
}

export function hasProjectReadAccess(role, projectIds, project, projectId) {
  if (!project) return false;
  if (role === "special_access" && project.status === "draft") return (projectIds || []).includes(projectId);
  if (project.visibility === "public") return true;
  if (role === "special_access") return (projectIds || []).includes(projectId);
  return ["viewer", "editor", "admin"].includes(role);
}
