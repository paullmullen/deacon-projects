import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, List, Popconfirm, Progress, Space, Typography, message } from 'antd';
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { getBlob, ref, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from './firebase';
import { attachmentAccept, attachmentPath, attachmentSize, MAX_ATTACHMENT_BYTES, validateAttachment } from './attachmentPolicy';

const filesRef = (orgId, projectId) => collection(db, 'organizations', orgId, 'projects', projectId, 'attachments');
const filesQuery = (orgId, projectId) => query(filesRef(orgId,projectId),orderBy('createdAt','asc'));
export async function loadProjectAttachments(orgId,projectId) {
  const snapshot = await getDocs(filesQuery(orgId,projectId));
  return snapshot.docs.map(d=>({...d.data(),id:d.id})).filter(file=>file.status==='ready');
}
export function useProjectAttachments(orgId,projectId,enabled,uid) {
  const [state,setState] = useState({files:[],loading:false,error:''});
  useEffect(()=>{
    setState({files:[],loading:!!enabled,error:''});
    if (!enabled) return;
    return onSnapshot(filesQuery(orgId,projectId), snapshot=>setState({files:snapshot.docs.map(d=>({...d.data(),id:d.id})),loading:false,error:''}),
      error=>setState({files:[],loading:false,error:error.message}));
  },[orgId,projectId,enabled,uid]);
  return state;
}
export async function downloadAttachment(orgId,projectId,file) {
  try {
    // Derive the path from trusted route IDs rather than a stored URL. No permanent download tokens are exposed.
    const blob = await getBlob(ref(storage,attachmentPath(orgId,projectId,file.id)),MAX_ATTACHMENT_BYTES);
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
export default function ProjectAttachments({orgId,projectId,user,canEdit,state}) {
  const [file,setFile]=useState(null);
  const [title,setTitle]=useState('');
  const [description,setDescription]=useState('');
  const [progress,setProgress]=useState(null);
  const [busy,setBusy]=useState(false);
  const [removing,setRemoving]=useState('');
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
        contentType,uploadedBy:user.uid,uploadedByName,createdAt:serverTimestamp(),status:'uploading'});
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
  return <section aria-label="Project file attachments" style={{marginBottom:24}}>
    <Typography.Title level={5}>File attachments</Typography.Title>
    <Typography.Paragraph type="secondary">Files use the project’s visibility. Public project files are public once the project is Proposed, Active, or Closed. Uploads save separately from the brief.</Typography.Paragraph>
    {state.error ? <Alert type="error" message="Attachments could not be loaded" description={state.error}/> : <List loading={state.loading} dataSource={state.files.filter(file=>file.status==='ready'||canEdit)}
      locale={{emptyText:'No files attached yet'}} renderItem={entry=><List.Item style={{flexWrap:"wrap"}} actions={[
        ...(entry.status==='ready'?[<Button key="download" onClick={()=>downloadAttachment(orgId,projectId,entry)}>Download</Button>]:[]),
        ...(canEdit?[<Popconfirm key="remove" title="Remove this attachment?" description="This removes the uploaded file from the project." onConfirm={()=>remove(entry.id)}><Button danger disabled={busy} loading={removing===entry.id}>Remove</Button></Popconfirm>]:[]),
      ]}>
      <List.Item.Meta style={{minWidth:180}} title={<span style={{overflowWrap:"anywhere"}}>{entry.title}</span>} description={<><span style={{overflowWrap:"anywhere"}}>{entry.name} · {attachmentSize(entry.size)}</span>{entry.description&&<div>{entry.description}</div>}{entry.status!=='ready'&&<div>Upload incomplete. Remove this entry and try again if no upload is in progress.</div>}</>}/>
    </List.Item>}/>}
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
