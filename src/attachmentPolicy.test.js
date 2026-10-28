import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attachmentPath,attachmentSize,MAX_ATTACHMENT_BYTES,validateAttachment} from './attachmentPolicy.js';
test('common project document formats receive deterministic MIME types',()=>{
  assert.equal(validateAttachment({name:'Budget.XLSX',size:123,type:''}),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(validateAttachment({name:'Brief.pdf',size:MAX_ATTACHMENT_BYTES}),'application/pdf');
  assert.equal(validateAttachment({name:'Photo.jpg',size:50}),'image/jpeg');
});
test('unsupported files, empty files and oversized files are rejected',()=>{
  for(const file of [{name:'script.html',size:10},{name:'app.exe',size:10},{name:'empty.pdf',size:0},{name:'too-large.pdf',size:MAX_ATTACHMENT_BYTES+1},{name:'invalid.pdf',size:NaN},{name:'x'.repeat(241)+'.pdf',size:1}])assert.throws(()=>validateAttachment(file));
});
test('storage locations cannot escape the project or use user-supplied filenames',()=>{
  assert.equal(attachmentPath('elmbrook','project1','file123'),'organizations/elmbrook/projects/project1/attachments/file123/file');
  for(const value of ['../other','path/child','',null])assert.throws(()=>attachmentPath('elmbrook','project1',value));
  assert.equal(attachmentSize(1024),'1 KB');assert.equal(attachmentSize(1048576),'1.0 MB');
});
