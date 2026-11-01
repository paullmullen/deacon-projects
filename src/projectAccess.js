export const roleLabel = role => ({ viewer: "Viewer", special_access: "Special Access", editor: "Editor", admin: "Admin" }[role] || role);
export function hasProjectEditorAccess(role, projectIds, project, projectId) {
  return role === "editor" || role === "admin" ||
    (role === "special_access" && project?.visibility === "private" && (projectIds || []).includes(projectId));
}
