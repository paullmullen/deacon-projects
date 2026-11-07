import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityBand, activityRows, lastActivity } from './portfolioActivity.js';
const now = Date.UTC(2026,10,6), day = 86400000;
test('age bands are exclusive with exact seven, fourteen, thirty and ninety day boundaries', () => {
  for (const [age, band] of [[0,0],[7,0],[7.01,1],[14,1],[14.01,2],[30,2],[30.01,3],[90,3],[90.01,4]]) assert.equal(activityBand(now-age*day,now),band);
  assert.equal(activityBand(0,now),5);
  assert.equal(activityBand(now+day,now),5);
});
test('priority and general updatedAt never refresh meaningful activity', () => {
  assert.equal(lastActivity({updatedAt:new Date(now),priority:1},[],now),0);
  assert.equal(lastActivity({createdAt:new Date(now-50*day),briefEditedAt:new Date(now-20*day)},[new Date(now-2*day)],now),now-2*day);
  assert.equal(lastActivity({progressEditedAt:{toMillis:()=>now-day},attachmentsEditedAt:new Date(now-3*day)},[new Date(now+day)],now),now-day);
});
test('only current draft proposed and active projects appear once, including confidential projects', () => {
  const rows=activityRows([{id:'a',status:'active',visibility:'private',createdAt:new Date(now-day)},{id:'d',status:'draft'},{id:'p',status:'proposed'},{id:'c',status:'closed'},{id:'x',status:'draft',archived:true}],{},now);
  assert.deepEqual(rows.map(p=>p.id),['a','d','p']);
  assert.deepEqual(rows.map(p=>p.activityBand),[0,5,5]);
});
