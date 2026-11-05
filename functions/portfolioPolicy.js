function publicPortfolioProject(id, project) {
  if (project.visibility !== 'public' || !['draft','proposed','active','closed'].includes(project.status)) return null;
  if (project.status === 'draft') {
    if (project.archived) return null;
    return {id,title:project.title || '',status:'draft',visibility:'public',priority:project.priority ?? null};
  }
  return {...project,id};
}
function canReadLeadContact(project, projectId, member) {
  const active = member && member.status !== 'inactive';
  if (active && member.role === 'special_access' && project.status === 'draft') return (member.projectIds || []).includes(projectId);
  if (project.visibility === 'public') return project.status !== 'draft' || !!active;
  return !!active && (['viewer','editor','admin'].includes(member.role) ||
    (member.role === 'special_access' && (member.projectIds || []).includes(projectId)));
}
module.exports = {publicPortfolioProject,canReadLeadContact};
