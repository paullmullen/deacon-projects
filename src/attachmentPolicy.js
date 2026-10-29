export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const attachmentTypes = Object.freeze({
  pdf:'application/pdf', doc:'application/msword',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:'application/vnd.ms-excel', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt:'application/vnd.ms-powerpoint', pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt:'text/plain', csv:'text/csv', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
});
export const attachmentAccept = Object.keys(attachmentTypes).map(ext=>'.'+ext).join(',');
export function validateAttachment(file) {
  const extension = String(file.name || '').split('.').pop().toLowerCase();
  if (!attachmentTypes[extension]) throw new Error('Choose a PDF, Word, Excel, PowerPoint, text, CSV, PNG or JPEG file.');
  if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new Error('The file is empty or its size is invalid.');
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('Each attachment must be 25 MB or smaller.');
  if (file.name.length > 240) throw new Error('Please shorten the file name to 240 characters or fewer.');
  return attachmentTypes[extension];
}
export function attachmentPath(orgId, projectId, attachmentId) {
  for (const value of [orgId,projectId,attachmentId]) {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error('Invalid attachment location.');
  }
  return `organizations/${orgId}/projects/${projectId}/attachments/${attachmentId}/file`;
}
export function attachmentSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
