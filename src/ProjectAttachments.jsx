import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, List, Modal, Popconfirm, Progress, Space, Typography, App as AntApp } from 'antd';
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { getBlob, ref, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from './firebase';
import './ProjectAttachments.css';
import { attachmentAccept, attachmentPath, attachmentSize, MAX_ATTACHMENT_BYTES, validateAttachment, sortAttachments } from './attachmentPolicy';

const filesRef = (orgId, projectId) => collection(db, 'organizations', orgId, 'projects', projectId, 'attachments');
const filesQuery = (orgId, projectId) => query(filesRef(orgId,projectId),orderBy('createdAt','asc'));
export async function loadProjectAttachments(orgId,projectId) {
  const snapshot = await getDocs(filesQuery(orgId,projectId));
  return sortAttachments(snapshot.docs.map(d=>({...d.data(),id:d.id}))).filter(file=>file.status==='ready');
}
export function useProjectAttachments(orgId,projectId,enabled,uid) {
  const [state,setState] = useState({files:[],loading:false,error:''});
  useEffect(()=>{
    setState({files:[],loading:!!enabled,error:''});
    if (!enabled) return;
    return onSnapshot(filesQuery(orgId,projectId), snapshot=>setState({files:sortAttachments(snapshot.docs.map(d=>({...d.data(),id:d.id}))),loading:false,error:''}),
      error=>setState({files:[],loading:false,error:error.message}));
  },[orgId,projectId,enabled,uid]);
  return state;
}
export async function downloadAttachment(orgId,projectId,file,message) {
  try {
    // Derive the path from trusted route IDs rather than a stored URL. No permanent download tokens are exposed.
    const blob = await getBlob(ref(storage,attachmentPath(orgId,projectId,file.id,file.versionId)),MAX_ATTACHMENT_BYTES);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download=file.name.replace(/[\\/\x00-\x1f]/g,'_'); document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),60000);
  } catch(error) { message.error(`Unable to download attachment: ${error.message}`); }
}
async function changeAttachment(orgId,projectId,id,ready,uid) {
  const project = doc(db,'organizations',orgId,'projects',projectId);
  const attachment = doc(filesRef(orgId,projectId),id);
  await runTransaction(db,async transaction=>{
    const [parent,current] = await Promise.all([transaction.get(project),transaction.get(attachment)]);
    if (!parent.exists()) throw new Error('Project no longer exists.');
    if (!current.exists()) throw new Error('Attachment was removed.');
    if (ready && current.data().status !== 'uploading') throw new Error('Attachment is no longer awaiting upload.');
    if (ready) transaction.update(attachment,{status:'ready'});
    else transaction.delete(attachment);
    // Successful attachment changes participate in project edit notifications.
    if (ready || current.data().status==='ready') transaction.update(project,{
      attachmentsEditedAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:uid,
    });
  });
}
async function editAttachments(orgId,projectId,changes,uid,expectedVersion) {
  await runTransaction(db,async transaction=>{
    const project=doc(db,'organizations',orgId,'projects',projectId);
    const refs=changes.map(change=>doc(filesRef(orgId,projectId),change.id));
    const snapshots=await Promise.all(refs.map(record=>transaction.get(record)));
    snapshots.forEach((snapshot,index)=>{
      if (!snapshot.exists() || snapshot.data().status!=='ready') throw new Error('Attachment is no longer available. Refresh and try again.');
      if (expectedVersion !== undefined && (snapshot.data().versionId || '') !== expectedVersion) throw new Error('Another version was uploaded. Refresh and try again.');
      transaction.update(refs[index],changes[index].patch);
    });
    transaction.update(project,{attachmentsEditedAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:uid});
  });
}
export default function ProjectAttachments({orgId,projectId,user,canEdit,state}) {
  const { message } = AntApp.useApp();
  const [file,setFile]=useState(null);
  const [title,setTitle]=useState('');
  const [description,setDescription]=useState('');
  const [progress,setProgress]=useState(null);
  const [busy,setBusy]=useState(false);
  const [removing,setRemoving]=useState('');
  const [editing,setEditing]=useState(null);
  const [replacement,setReplacement]=useState(null);
  const replacementInput=useRef(null);
  const saveChanges=async changes=>{
    setBusy(true);
    try { await editAttachments(orgId,projectId,changes,user.uid); return true; }
    catch(error) {message.error(error.message);return false;}
    finally {setBusy(false);}
  };
  const move=async (entry,direction)=>{
    const ordered=sortAttachments(state.files).filter(file=>file.status==='ready');
    const index=ordered.findIndex(file=>file.id===entry.id), target=index+direction;
    if (target<0 || target>=ordered.length) return;
    if (ordered.length>450) {message.error('Too many files to reorder at once.');return;}
    [ordered[index],ordered[target]]=[ordered[target],ordered[index]];
    await saveChanges(ordered.map((file,order)=>({id:file.id,patch:{order}})));
  };
  const replace=async selected=>{
    if (!selected || !replacement || busy) return;
    const entry=replacement;
    setBusy(true);setProgress(0);
    try {
      const contentType=validateAttachment(selected);
      const versionId=doc(filesRef(orgId,projectId)).id;
      const uploadTask=uploadBytesResumable(ref(storage,attachmentPath(orgId,projectId,entry.id,versionId)),selected,{
        contentType,cacheControl:'private, no-store',contentDisposition:'attachment',
      });
      task.current=uploadTask;
      await new Promise((resolve,reject)=>uploadTask.on('state_changed',snapshot=>setProgress(Math.round(snapshot.bytesTransferred/snapshot.totalBytes*100)),reject,resolve));
      await editAttachments(orgId,projectId,[{id:entry.id,patch:{name:selected.name,size:selected.size,contentType,versionId,version:(entry.version || 1)+1}}],user.uid,entry.versionId || '');
      message.success('New version uploaded');
    } catch(error) {message.error(error.code==='storage/canceled'?'Upload canceled':`Replacement failed: ${error.message}`);}
    finally {task.current=null;setBusy(false);setProgress(null);setReplacement(null);if(replacementInput.current)replacementInput.current.value='';}
  };
  const task=useRef(null);
  const input=useRef(null);
  useEffect(()=>()=>task.current?.cancel(),[]);
  const remove = async id=>{
    setRemoving(id);
    try { await changeAttachment(orgId,projectId,id,false,user.uid); message.success('Attachment removed'); }
    catch(error) { message.error(error.message); }
    finally { setRemoving(''); }
  };
  const upload = async()=>{
    if (!file || busy) return;
    setBusy(true);setProgress(0);
    let record;
    try {
      const contentType=validateAttachment(file);
      const membership=await getDoc(doc(db,'organizations',orgId,'members',user.uid));
      const uploadedByName=[membership.data()?.displayName,user.displayName,user.email,'Organization editor'].find(v=>typeof v==='string'&&v.trim()).trim().slice(0,320);
      record=doc(filesRef(orgId,projectId));
      await setDoc(record,{name:file.name,title:(title.trim()||file.name).slice(0,200),description:description.trim(),size:file.size,
        order:Math.max(Date.now(),...state.files.map(entry=>Number.isFinite(entry.order)?entry.order+1:0)),contentType,uploadedBy:user.uid,uploadedByName,createdAt:serverTimestamp(),status:'uploading'});
      const uploadTask=uploadBytesResumable(ref(storage,attachmentPath(orgId,projectId,record.id)),file,{
        contentType,cacheControl:'private, no-store',contentDisposition:'attachment',
      });
      task.current=uploadTask;
      await new Promise((resolve,reject)=>uploadTask.on('state_changed',snapshot=>setProgress(Math.round(snapshot.bytesTransferred/snapshot.totalBytes*100)),reject,resolve));
      await changeAttachment(orgId,projectId,record.id,true,user.uid);
      setFile(null);setTitle('');setDescription('');if(input.current) input.current.value='';
      message.success('Attachment uploaded');
    } catch(error) {
      if (record) {
        try { await changeAttachment(orgId,projectId,record.id,false,user.uid); }
        catch { /* The saved incomplete entry can be removed from the list. */ }
      }
      message.error(error.code==='storage/canceled'?'Upload canceled':`Upload failed: ${error.message}`);
    } finally { task.current=null;setProgress(null);setBusy(false); }
  };
  return <section className="project-attachments" aria-label="Project file attachments" style={{marginBottom:24}}>
    <Typography.Title level={5}>File attachments</Typography.Title>
    <Typography.Paragraph type="secondary">Files use the project’s visibility. Public project files are public once the project is Proposed, Active, or Closed. Attachment changes save separately from the brief. Use Move up and Move down to set the document order, and mark key documents with a star.</Typography.Paragraph>
    {state.error ? <Alert type="error" message="Attachments could not be loaded" description={state.error}/> : <List loading={state.loading} dataSource={state.files.filter(file=>file.status==='ready'||canEdit)}
      locale={{emptyText:'No files attached yet'}} renderItem={entry=><List.Item style={{flexWrap:"wrap"}} actions={[
        ...(entry.status==='ready'?[<Button key="download" onClick={()=>downloadAttachment(orgId,projectId,entry,message)}>Download</Button>]:[]),
        ...(canEdit && entry.status==='ready'?[
          <Button key="up" aria-label={`Move ${entry.title} up`} disabled={busy || state.files.filter(file=>file.status==='ready')[0]?.id===entry.id} onClick={()=>move(entry,-1)}>↑</Button>,
          <Button key="down" aria-label={`Move ${entry.title} down`} disabled={busy || state.files.filter(file=>file.status==='ready').at(-1)?.id===entry.id} onClick={()=>move(entry,1)}>↓</Button>,
          <Button key="star" aria-label={`${entry.keyDocument?'Unmark':'Mark'} ${entry.title} as key document`} aria-pressed={!!entry.keyDocument} disabled={busy} onClick={()=>saveChanges([{id:entry.id,patch:{keyDocument:!entry.keyDocument}}])}>{entry.keyDocument?'★ Key document':'☆ Mark as key'}</Button>,
          <Button key="edit" disabled={busy} onClick={()=>setEditing({...entry})}>Edit details</Button>,
          <Button key="replace" disabled={busy} onClick={()=>{setReplacement(entry);replacementInput.current?.click();}}>Upload new version</Button>,
        ]:[]),
        ...(canEdit?[<Popconfirm key="remove" title="Remove this attachment?" description="This removes the uploaded file from the project." onConfirm={()=>remove(entry.id)}><Button danger disabled={busy} loading={removing===entry.id}>Remove</Button></Popconfirm>]:[]),
      ]}>
      <List.Item.Meta style={{minWidth:180}} title={<span style={{overflowWrap:"anywhere"}}>{entry.keyDocument && <span aria-label="Key document" style={{color:'#ad6800'}}>★ </span>}{entry.title}</span>} description={<><span style={{overflowWrap:"anywhere"}}>{entry.name} · {attachmentSize(entry.size)}{entry.version>1 && ` - Version ${entry.version}`}</span>{entry.description&&<div>{entry.description}</div>}{entry.status!=='ready'&&<div>Upload incomplete. Remove this entry and try again if no upload is in progress.</div>}</>}/>
    </List.Item>}/>}
    {canEdit&&<>
      <input ref={replacementInput} type="file" accept={attachmentAccept} aria-label="Choose new document version" style={{display:'none'}} onChange={event=>replace(event.target.files?.[0])}/>
      {replacement && progress!==null && <Space direction="vertical" style={{width:'100%'}}><Typography.Text>Uploading new version of {replacement.title}</Typography.Text><Progress percent={progress}/><Button onClick={()=>task.current?.cancel()}>Cancel upload</Button></Space>}
      <Modal title="Edit document details" open={!!editing} confirmLoading={busy} onCancel={()=>{if(!busy)setEditing(null);}} onOk={async()=>{
        if (!editing.title.trim()) {message.error('Enter a document title.');return;}
        if(await saveChanges([{id:editing.id,patch:{title:editing.title.trim(),description:(editing.description || '').trim()}}]))setEditing(null);
      }}>
        <Space direction="vertical" style={{width:'100%'}}>
          <Input aria-label="Document title" value={editing?.title || ''} maxLength={200} disabled={busy} onChange={event=>setEditing({...editing,title:event.target.value})}/>
          <Input.TextArea aria-label="Document description" value={editing?.description || ''} maxLength={500} disabled={busy} onChange={event=>setEditing({...editing,description:event.target.value})}/>
        </Space>
      </Modal>
    </>}
    {canEdit&&<Space direction="vertical" style={{width:'100%',marginTop:16}}>
      <input ref={input} type="file" aria-label="Choose attachment" accept={attachmentAccept} disabled={busy} onChange={event=>{
        const selected=event.target.files?.[0];if(!selected)return;
        try {validateAttachment(selected);setFile(selected);setTitle(selected.name.slice(0,200));}catch(error){message.error(error.message);event.target.value='';setFile(null);}
      }}/>
      <Typography.Text type="secondary">PDF, Word, Excel, PowerPoint, text/CSV and PNG/JPEG · Up to 25 MB per file</Typography.Text>
      {file&&<>
        <Input aria-label="Attachment title" placeholder="Document title" value={title} maxLength={200} disabled={busy} onChange={e=>setTitle(e.target.value)}/>
        <Input.TextArea aria-label="Attachment description" placeholder="Description (optional)" value={description} maxLength={500} disabled={busy} onChange={e=>setDescription(e.target.value)}/>
        {progress!==null&&<Progress percent={progress}/>}
        <Space><Button type="primary" onClick={upload} loading={busy} disabled={!!state.error||state.loading}>Upload attachment</Button>{busy&&<Button onClick={()=>task.current?.cancel()}>Cancel upload</Button>}</Space>
      </>}
    </Space>}
  </section>;
}
