import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateProjects, portfolioTable } from './portfolioUpdate.js';
test('selection excludes archived and confidential projects unless explicitly included', () => {
  const projects = [{ id:'a',status:'draft',visibility:'private' },{ id:'b',status:'active',visibility:'public' },{ id:'c',status:'active',archived:true }];
  assert.deepEqual(updateProjects(projects,['active','draft'],false).map(p=>p.id),['b']);
  assert.equal(updateProjects(projects,['draft'],true)[0].id,'a');
});
test('email table escapes project and commentary content, preserves lines and encodes links', () => {
  const output = portfolioTable([{id:'a/b',title:'<img src=x>',leadDeacon:'A & B',visibility:'private'}], {'a/b':{insights:'<script>\nNext',recommendation:'Ready'}},'org','https://example.org');
  assert.ok(!output.html.includes('<script>'));
  assert.ok(!output.html.includes('<img'));
  assert.ok(output.html.includes('&lt;script&gt;<br>Next'));
  assert.ok(output.html.includes('/org/org/projects/a%2Fb'));
  assert.ok(output.html.includes('Confidential'));
  assert.ok(output.text.includes('Ready'));
});
test('table follows dashboard status groups and priority within each group', () => {
  const rows = updateProjects([
    {id:'d',status:'draft',priority:1}, {id:'a2',status:'active',priority:2},
    {id:'p',status:'proposed',priority:1}, {id:'a1',status:'active',priority:1},
  ], ['draft','active','proposed'], false);
  assert.deepEqual(rows.map(p=>p.id), ['a1','a2','p','d']);
  const output = portfolioTable(rows, {}, 'org', 'https://example.org');
  assert.equal([...output.html.matchAll(/<font color="#ffffff" style="color:#ffffff"><strong>/g)].length, 5);
  assert.deepEqual([...output.html.matchAll(/<th colspan="5"[^>]*>([^<]*)<\/th>/g)].map(match => match[1]),
    ['Active', 'Proposed', 'Draft']);
  assert.deepEqual([...output.html.matchAll(/<tr aria-hidden="true"><td colspan="5"[^>]*>&nbsp;<\/td><\/tr><tr><th[^>]*>([^<]*)<\/th>/g)].map(match => match[1]),
    ['Proposed', 'Draft']);
  assert.deepEqual(output.text.split('\n').filter(line => !line.includes('\t')),
    ['Active', '', 'Proposed', '', 'Draft']);
});
