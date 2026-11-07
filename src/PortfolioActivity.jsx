import { useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, List, Modal, Space, Spin, Typography } from 'antd';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from './firebase';
import { activityBands, activityRows, activityStatuses } from './portfolioActivity.js';

export default function PortfolioActivity({ orgId, projects, uid, role, fetching }) {
  const [state, setState] = useState({});
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState(null);
  const [now, setNow] = useState(Date.now());
  const ids = JSON.stringify(projects.filter(p => !p.archived && activityStatuses.includes(p.status)).map(p => p.id).sort());
  const scope = JSON.stringify([orgId, uid, role, ids, revision]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let live = true;
    setState({ scope, loading: true });
    Promise.all(JSON.parse(ids).map(async id => {
      const evidence = await Promise.all([['notes','editedAt'],['history','at'],['attachments','createdAt']].map(async ([name, field]) => {
        const ref = collection(db, 'organizations', orgId, 'projects', id, name);
        const snapshot = await getDocs(name === 'attachments' ? ref : query(ref, orderBy(field, 'desc'), limit(1)));
        return snapshot.docs.filter(d => name !== 'attachments' || d.data().status === 'ready').map(d => d.data()[field]);
      }));
      return [id, evidence.flat()];
    })).then(entries => { if (live) setState({ scope, evidence: Object.fromEntries(entries) }); })
      .catch(() => { if (live) setState({ scope, error: true }); });
    return () => { live = false; };
  }, [scope]);
  const loading = fetching || state.scope !== scope || state.loading;
  const rows = activityRows(projects, state.evidence || {}, now);
  const matches = (status, band) => rows.filter(p => p.status === status && (band === null || p.activityBand === band));
  const palette = ['#e0f2e2','#edf6e8','#fff4d6','#ffe2be','#ffd5ce','#f1f1f1'];
  const title = status => status[0].toUpperCase() + status.slice(1);
  return <Card title="Portfolio Activity" extra={<Button size="small" disabled={loading} onClick={() => setRevision(n => n + 1)}>Refresh activity</Button>}>
    <Typography.Paragraph type="secondary">Time since the last recorded project update. Select a count to explore recent work or projects needing follow-up.</Typography.Paragraph>
    {loading ? <Spin /> : state.error ? <Alert type="warning" message="Activity could not be loaded. Refresh activity to retry." /> : <>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 360, borderCollapse: 'collapse' }}>
        <thead><tr><th scope="col" style={{ textAlign: 'left', padding: 8 }}>Last meaningful update</th>{activityStatuses.map(status => <th scope="col" key={status}>{title(status)}</th>)}</tr></thead>
        <tbody>{activityBands.map((band, index) => <tr key={band}><th scope="row" style={{ textAlign: 'left', padding: 8, fontWeight: 400 }}>{band}</th>{activityStatuses.map(status => {
          const count = matches(status, index).length;
          const color = !count ? '#fafafa' : index >= 3 && status === 'draft' ? '#fff4d6' : palette[index];
          return <td key={status} style={{ textAlign: 'center', background: color, border: '2px solid white' }}><Button type="text" disabled={!count} aria-label={`${count} ${title(status)} projects: ${band}`} onClick={() => setSelection({status, band: index})} style={{ width: '100%', fontWeight: count ? 600 : 400 }}>{count}</Button></td>;
        })}</tr>)}</tbody>
        <tfoot><tr><th scope="row" style={{ textAlign: 'left', padding: 8 }}>Total</th>{activityStatuses.map(status => <td key={status} style={{ textAlign: 'center' }}><Button type="text" onClick={() => setSelection({status, band: null})}>{matches(status,null).length}</Button></td>)}</tr></tfoot>
      </table></div>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>Counts include current Draft, Proposed and Active projects, including confidential projects. Brief changes, notes, attachments and lifecycle changes count; priority reordering does not. Month = 30 days; quarter = 90 days. Older brief edits without a reliable activity date may be missing; Unknown means no reliable date is available.</Typography.Paragraph>
    </>}
    <Modal title={selection ? `${title(selection.status)} · ${selection.band === null ? 'All updates' : activityBands[selection.band]}` : ''} open={!!selection} onCancel={() => setSelection(null)} footer={null}>
      <List dataSource={selection && !loading && !state.error ? matches(selection.status,selection.band).sort((a,b) => b.activityTime-a.activityTime || String(a.title).localeCompare(String(b.title))) : []} locale={{emptyText:<Empty description="No projects" />}} renderItem={p => <List.Item><Space direction="vertical" size={2}>
        <Link to={`/org/${orgId}/projects/${p.id}`} onClick={() => setSelection(null)}>{p.title || 'Untitled project'}</Link>
        <Typography.Text>Lead: {p.leadDeacon || 'Unassigned'}{p.visibility === 'private' ? ' · Confidential' : ''}</Typography.Text>
        <Typography.Text type="secondary">Last recorded update: {p.activityTime ? new Date(p.activityTime).toLocaleString() : 'Unknown'}</Typography.Text>
      </Space></List.Item>} />
    </Modal>
  </Card>;
}
