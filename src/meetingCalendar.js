const dateStamp = millis => new Date(millis).toISOString().replace(/[-:]|\.\d{3}/g, '');
const escapeText = value => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/[;,]/g, '\\$&');

function foldLine(line) {
  const encoder = new TextEncoder();
  let bytes = 0;
  let result = '';
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      result += '\r\n ';
      bytes = 1;
    }
    result += character;
    bytes += size;
  }
  return result;
}

export function meetingCalendar(orgId, meeting, dashboardUrl, now = Date.now()) {
  const agenda = (meeting.agenda || []).map((item, index) => `${index + 1}. ${item.title ?? item.text}`);
  const description = [
    'Agenda',
    ...(agenda.length ? agenda : ['No agenda items listed.']),
    '',
    'Agenda as of the time of this download.  Check the Deacon Project portal for the latest agenda.',
    'https://deaconprojects.web.app',
  ].join('\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DeaconProjects//Deacon Meetings//EN',
    'BEGIN:VEVENT',
    `UID:${orgId}-${meeting.id}@deaconprojects.web.app`,
    `DTSTAMP:${dateStamp(now)}`,
    `DTSTART:${dateStamp(meeting.startsAt)}`,
    `DTEND:${dateStamp(meeting.endsAt)}`,
    'SUMMARY:Deacon Meeting',
    `LOCATION:${escapeText(meeting.location)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `URL:${dashboardUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].map(foldLine).join('\r\n');
}
