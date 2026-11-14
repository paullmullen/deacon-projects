import test from 'node:test';
import assert from 'node:assert/strict';
import { meetingCalendar } from './meetingCalendar.js';

const meeting = {
  id: 'meeting-1',
  startsAt: Date.UTC(2026, 10, 20, 0),
  endsAt: Date.UTC(2026, 10, 20, 2),
  location: 'Church',
  agenda: [],
};

test('calendar event uses the meeting title and escapes calendar control characters', () => {
  const calendar = meetingCalendar('elmbrook', {
    ...meeting, title: 'Special Meeting; budget, planning\nDiscussion',
  }, 'https://deaconprojects.web.app', 0);
  assert.ok(calendar.includes('SUMMARY:Special Meeting\\; budget\\, planning\\nDiscussion\r\n'));
  assert.ok(calendar.includes('DTSTART:20261120T000000Z\r\n'));
  assert.ok(calendar.includes('DTEND:20261120T020000Z\r\n'));
});

test('existing meetings without titles retain the default calendar event title', () => {
  assert.ok(meetingCalendar('elmbrook', meeting, 'https://deaconprojects.web.app', 0)
    .includes('SUMMARY:Deacon Meeting\r\n'));
});
