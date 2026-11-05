import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSteps, orderedSteps, isStepOverdue, localDate, shortStepDate } from './nextSteps.js';

test('legacy rows retain content and acquire optional timing/completion fields', () => {
  assert.deepEqual(normalizeSteps([{action:' Call team ',owner:' Paul '}]), [{action:'Call team',owner:'Paul',expectedDate:'',completed:false,completedDate:''}]);
});
test('completion preserves due date and history; reopening clears completion date', () => {
  const done = {action:'Call team',expectedDate:'2026-11-04',completed:true,completedDate:'2026-11-05'};
  assert.equal(normalizeSteps([done])[0].completedDate,'2026-11-05');
  assert.equal(normalizeSteps([done])[0].expectedDate,'2026-11-04');
  assert.equal(normalizeSteps([{...done,completed:false}])[0].completedDate,'');
  assert.equal(isStepOverdue(done,'2026-11-05'),false);
});
test('open rows precede completed rows without mutating source or changing relative order', () => {
  const rows = [{action:'Done',completed:true},{action:'First'},{action:'Second'}];
  assert.deepEqual(orderedSteps(rows).map(x=>x.action),['First','Second','Done']);
  assert.equal(rows[0].action,'Done');
});
test('only unfinished dated steps before today are overdue', () => {
  assert.equal(isStepOverdue({expectedDate:'2026-11-04'},'2026-11-05'),true);
  assert.equal(isStepOverdue({expectedDate:'2026-11-05'},'2026-11-05'),false);
  assert.equal(isStepOverdue({},'2026-11-05'),false);
  assert.equal(localDate(new Date(2026,10,5)),'2026-11-05');
  assert.equal(shortStepDate('2026-11-05'),'11/5/26');
});
