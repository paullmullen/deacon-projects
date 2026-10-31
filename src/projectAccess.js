export const roleLabel = role => role === "special_access" ? "Special Access" : role;
export function hasProjectEditorAccess(role, projectIds, project, projectId) {
  return role === "editor" || role === "admin" ||
    (role === "special_access" && project?.visibility === "private" && (projectIds || []).includes(projectId));
}
