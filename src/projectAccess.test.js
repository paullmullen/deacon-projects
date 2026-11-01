import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hasProjectEditorAccess,hasProjectReadAccess,roleLabel} from './projectAccess.js';
test('Special Access is confidential-project-specific, with ordinary viewer defaults',()=>{
  assert.equal(roleLabel('special_access'),'Special Access');
  for(const role of [null,'viewer','special_access'])assert.equal(hasProjectEditorAccess(role,[],{visibility:'private'},'p'),false);
  assert.equal(hasProjectEditorAccess('special_access',['p'],{visibility:'private'},'p'),true);
  assert.equal(hasProjectEditorAccess('special_access',['p'],{visibility:'public'},'p'),false);
  assert.equal(hasProjectEditorAccess('special_access',['p'],{visibility:'private'},'other'),false);
  assert.equal(hasProjectEditorAccess('special_access',['p'],undefined,'p'),false);
  for(const role of ['editor','admin'])assert.equal(hasProjectEditorAccess(role,[],{visibility:'public'},'other'),true);
});

test('Special Access reads only public or assigned confidential projects',()=>{
  assert.equal(hasProjectReadAccess('special_access',['assigned'],{visibility:'private'},'assigned'),true);
  assert.equal(hasProjectReadAccess('special_access',['assigned'],{visibility:'private'},'other'),false);
  assert.equal(hasProjectReadAccess('special_access',[],{visibility:'private'},'assigned'),false);
  assert.equal(hasProjectReadAccess('special_access',[],{visibility:'public'},'other'),true);
  assert.equal(hasProjectReadAccess(null,[],{visibility:'private'},'assigned'),false);
  for(const role of ['viewer','editor','admin'])assert.equal(hasProjectReadAccess(role,[],{visibility:'private'},'other'),true);
});
