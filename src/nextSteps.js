export const localDate = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

export function normalizeSteps(rows = []) {
  return rows.map(row => ({
    action: (row?.action || '').trim(),
    owner: (row?.owner || '').trim(),
    expectedDate: row?.expectedDate || '',
    completed: row?.completed === true,
    completedDate: row?.completed === true ? row.completedDate || '' : '',
  })).filter(row => row.action || row.owner);
}

export const orderedSteps = rows => [...normalizeSteps(rows)].sort((a, b) => Number(a.completed) - Number(b.completed));
export const isStepOverdue = (row, today = localDate()) => !row.completed && Boolean(row.expectedDate) && row.expectedDate < today;
export const shortStepDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : '—';
