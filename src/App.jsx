import { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, Layout, List, Select, Space, Spin, Tag, Typography, message } from 'antd';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, getDocs, query, where, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
const { Header, Content } = Layout;
const statuses = ['draft','proposed','active','closed'];
function useUser() { const [user,setUser]=useState(undefined); useEffect(()=>onAuthStateChanged(auth,setUser),[]); return user; }
function useOrg(orgId,user) {
  const [state,setState]=useState({loading:true,org:null,role:null});
  useEffect(()=>{let active=true;setState({loading:true,org:null,role:null});
    Promise.all([getDoc(doc(db,'organizations',orgId)),user ? getDoc(doc(db,'organizations',orgId,'members',user.uid)):Promise.resolve(null)])
      .then(([o,m])=>{if(active)setState({loading:false,org:o.exists()?o.data():null,role:m?.exists()?m.data().role:null});})
.catch((error) => {
  console.error('Organization lookup failed:', {
    code: error.code,
    message: error.message,
    orgId,
    uid: user?.uid,
  });

  if (active) {
    setState({
      loading: false,
      org: null,
      role: null,
    });
  }
});    return()=>{active=false;};},[orgId,user?.uid]); return state;
}
function Shell({user,children}) {return <Layout className="shell"><Header className="top"><Link to="/" className="brand">DeaconProjects</Link><Space>{user ? <><Typography.Text style={{color:'white'}}>{user.displayName||user.email}</Typography.Text><Button onClick={()=>signOut(auth)}>Sign out</Button></>:<Button type="primary" onClick={()=>signInWithPopup(auth,googleProvider).catch(e=>message.error(e.message))}>Sign in with Google</Button>}</Space></Header><Content className="content">{children}</Content></Layout>}
function Home(){const [org,setOrg]=useState('elmbrook');const nav=useNavigate();return <Card title="Open an organization"><Space.Compact style={{width:'100%'}}><Input value={org} onChange={e=>setOrg(e.target.value)} placeholder="Organization ID"/><Button type="primary" onClick={()=>nav('/org/'+encodeURIComponent(org.trim()))} disabled={!org.trim()}>Open</Button></Space.Compact><Typography.Paragraph type="secondary" style={{marginTop:16}}>Try elmbrook after the organization has been provisioned. Public projects are available without sign-in.</Typography.Paragraph></Card>}
function Dashboard({user}){const {orgId}=useParams();const {loading,org,role}=useOrg(orgId,user);const [items,setItems]=useState([]);const [error,setError]=useState('');const [filter,setFilter]=useState('all');
 useEffect(()=>{let live=true;setError('');
   const projects=collection(db,'organizations',orgId,'projects');
   const q=role ? query(projects) : query(projects,where('visibility','==','public'));
   getDocs(q).then(snap=>{if(live)setItems(snap.docs.map(d=>({id:d.id,...d.data()})));})
     .catch(e=>{if(live)setError(e.message)});
   return()=>{live=false};
 },[orgId,role]);
 if(loading)return <Spin/>;if(!org)return <Alert type="warning" message="Organization not found or unavailable"/>;
 const canEdit=role==='editor'||role==='admin';const shown=items.filter(p=>filter==='all'||p.status===filter);
 return <Space direction="vertical" size="large" style={{width:'100%'}}><div><Typography.Title>{org.name||orgId}</Typography.Title><Typography.Text type="secondary">Project portfolio · {role?`Your role: ${role}`:'Public view'}</Typography.Text></div><Space wrap><Select value={filter} onChange={setFilter} style={{width:160}} options={[{value:'all',label:'All statuses'},...statuses.map(s=>({value:s,label:s[0].toUpperCase()+s.slice(1)}))]}/>{canEdit&&<Link to={`/org/${orgId}/new`}><Button type="primary">New draft</Button></Link>}</Space>{error&&<Alert type="error" showIcon message="Unable to load projects" description={error}/>}<List bordered dataSource={shown} locale={{emptyText:'No visible projects yet'}} renderItem={p=><List.Item extra={<Tag>{p.status}</Tag>}><Link to={`/org/${orgId}/projects/${p.id}`}>{p.title}</Link></List.Item>}/></Space>;
}
function NewDraft({user}){const {orgId}=useParams();const {loading,role}=useOrg(orgId,user);const nav=useNavigate();const [busy,setBusy]=useState(false);if(loading)return <Spin/>;if(!user||!['editor','admin'].includes(role))return <Alert type="warning" message="Editor access required"/>;
const save = async (v) => {
  console.log('SAVE DRAFT STARTED', v);

  setBusy(true);

  try {
    const d = await addDoc(
      collection(db, 'organizations', orgId, 'projects'),
      {
        title: v.title.trim(),
        shortDescription: v.shortDescription || '',
        status: 'draft',
        visibility: 'private',
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
    );

    console.log('DRAFT CREATED:', d.id);
    nav(`/org/${orgId}/projects/${d.id}`);
  } catch (error) {
    console.error('DRAFT SAVE FAILED:', error.code, error.message);
    message.error(error.message);
  } finally {
    setBusy(false);
  }
}; return <Card title="Create private draft"><Form layout="vertical" onFinish={save}><Form.Item label="Project title" name="title" rules={[{required:true,max:160}]}><Input/></Form.Item><Form.Item label="Short description" name="shortDescription"><Input.TextArea rows={4} maxLength={4000}/></Form.Item><Button type="primary" htmlType="submit" loading={busy}>Save draft</Button></Form></Card>;
}
function Project({user}){const {orgId,projectId}=useParams();const {role}=useOrg(orgId,user);const [project,setProject]=useState(undefined);const [error,setError]=useState('');const [editing,setEditing]=useState(false);const [busy,setBusy]=useState(false);const [form]=Form.useForm();
 useEffect(()=>{let live=true;getDoc(doc(db,'organizations',orgId,'projects',projectId)).then(s=>{if(live)setProject(s.exists()?s.data():null)}).catch(e=>{if(live){setProject(null);setError(e.message)}});return()=>{live=false}},[orgId,projectId,user?.uid]);
 if(project===undefined)return <Spin/>;if(!project)return <Alert type="warning" message="Project not available" description={error||'Not found or access denied'}/>;
 const canEdit=['editor','admin'].includes(role);
 const save=async v=>{setBusy(true);try{await updateDoc(doc(db,'organizations',orgId,'projects',projectId),{title:v.title.trim(),shortDescription:v.shortDescription||'',updatedAt:serverTimestamp()});setProject({...project,...v});setEditing(false);message.success('Saved')}catch(e){message.error(e.message)}finally{setBusy(false)}};
 return <Card title={project.title} extra={<Space><Tag>{project.status}</Tag><Tag>{project.visibility}</Tag>{canEdit&&!editing&&<Button onClick={()=>{form.setFieldsValue({title:project.title,shortDescription:project.shortDescription});setEditing(true)}}>Edit</Button>}</Space>}>{editing?<Form form={form} layout="vertical" onFinish={save}><Form.Item label="Title" name="title" rules={[{required:true,max:160}]}><Input/></Form.Item><Form.Item label="Short description" name="shortDescription"><Input.TextArea rows={5} maxLength={4000}/></Form.Item><Space><Button type="primary" htmlType="submit" loading={busy}>Save</Button><Button onClick={()=>setEditing(false)}>Cancel</Button></Space></Form>:<Typography.Paragraph>{project.shortDescription||'No description yet.'}</Typography.Paragraph>}<Alert type="info" showIcon style={{marginTop:20}} message="Starter milestone" description="The complete project brief, lifecycle actions and audit history are planned for the next increments."/></Card>;
}
export default function App(){const user=useUser();if(user===undefined)return <Spin/>;return <Shell user={user}><Routes><Route path="/" element={<Home/>}/><Route path="/org/:orgId" element={<Dashboard user={user}/>}/><Route path="/org/:orgId/new" element={<NewDraft user={user}/>}/><Route path="/org/:orgId/projects/:projectId" element={<Project user={user}/>}/><Route path="*" element={<Navigate to="/"/>}/></Routes></Shell>}
