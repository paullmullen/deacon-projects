import { useEffect, useState } from 'react';
import { Alert, App, Button, Checkbox, Input, Modal, Space, Spin, Typography } from 'antd';
import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { portfolioTable, updateProjects } from './portfolioUpdate.js';

export default function PortfolioUpdate({ orgId, user, projects, disabled }) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [statuses, setStatuses] = useState(['active', 'proposed', 'draft']);
  const [confidential, setConfidential] = useState(false);
  const [excluded, setExcluded] = useState([]);
  const [entries, setEntries] = useState({});
  const [changed, setChanged] = useState([]);
  const [dirty, setDirty] = useState(false);
  const root = doc(db, 'organizations', orgId, 'portfolioUpdates', user.uid);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true); setError('');
    Promise.all([getDoc(root), getDocs(collection(root, 'entries'))]).then(([draft, rows]) => {
      if (!live) return;
      const data = draft.data();
      setStatuses(data?.statuses || ['active', 'proposed', 'draft']);
      setConfidential(data?.includeConfidential === true);
      setExcluded(data?.excluded || []);
      setEntries(Object.fromEntries(rows.docs.map(row => [row.id, row.data()])));
      setChanged([]); setDirty(false);
    }).catch(e => { if (live) setError(`Could not load your draft: ${e.message}`); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [open, orgId, user.uid]);
  useEffect(() => {
    if (!open || !dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [open, dirty]);
  const candidates = updateProjects(projects, statuses, confidential);
  const chosen = candidates.filter(p => !excluded.includes(p.id));
  function edit(id, field, value) {
    setEntries(old => ({ ...old, [id]: { ...old[id], [field]: value } }));
    setChanged(old => [...new Set([...old, id])]); setDirty(true);
  }
  async function save() {
    if (changed.length > 450) throw new Error('Save this draft before editing more projects.');
    const batch = writeBatch(db);
    batch.set(root, { statuses, includeConfidential: confidential, excluded, updatedAt: serverTimestamp() });
    const reviewedAt = new Date().toISOString();
    changed.forEach(id => batch.set(doc(root, 'entries', id), {
      insights: entries[id]?.insights || '', recommendation: entries[id]?.recommendation || '', reviewedAt,
    }));
    await batch.commit();
    setEntries(old => Object.fromEntries(Object.entries(old).map(([id, entry]) => [id, changed.includes(id) ? { ...entry, reviewedAt } : entry])));
    setChanged([]); setDirty(false);
  }
  async function act(copy) {
    setSaving(true);
    try {
      await save();
      if (copy) {
        const table = portfolioTable(chosen, entries, orgId, window.location.origin);
        if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Draft saved. Formatted copying is unavailable in this browser. Select the table in Preview and copy it manually.');
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([table.html], { type: 'text/html' }),
          'text/plain': new Blob([table.text], { type: 'text/plain' }),
        })]);
        message.success('Table copied. Paste it into your email.');
      } else message.success('Draft saved.');
    } catch (e) { message.error(e.message); }
    finally { setSaving(false); }
  }
  function close() {
    if (!dirty) return setOpen(false);
    Modal.confirm({ title: 'Discard unsaved changes?', content: 'Save your draft to keep these edits for next time.', okText: 'Discard changes', onOk: () => setOpen(false) });
  }
  const preview = portfolioTable(chosen, entries, orgId, window.location.origin);
  return <>
    <Button disabled={disabled} onClick={() => setOpen(true)}>Prepare Portfolio Update</Button>
    <Modal title="Prepare Portfolio Update" open={open} width={1400} onCancel={close} maskClosable={false}
      footer={<Space wrap><Typography.Text type="secondary">{dirty ? 'Unsaved changes' : 'Draft saved'}</Typography.Text><Button disabled={saving} onClick={close}>Close</Button><Button disabled={loading || !!error} loading={saving} onClick={() => act(false)}>Save Draft</Button><Button type="primary" loading={saving} disabled={loading || !!error || !chosen.length} onClick={() => act(true)}>Save & Copy Table</Button></Space>}>
      {loading ? <Spin /> : error ? <Alert type="error" message={error} /> : <>
        <Typography.Paragraph>Your private working draft. Edit and save here to reuse your commentary next time. Changes made in email do not return to the app.</Typography.Paragraph>
        <Space wrap style={{ marginBottom: 16 }}>
          <Checkbox.Group value={statuses} options={['active','proposed','draft','closed'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} onChange={value => { setStatuses(value); setDirty(true); }} />
          <Checkbox checked={confidential} onChange={e => { setConfidential(e.target.checked); setDirty(true); }}>Include confidential projects</Checkbox>
        </Space>
        {chosen.some(p => p.visibility === 'private') && <Alert type="warning" showIcon message="This table includes confidential projects. Check your email recipients before sending." style={{ marginBottom: 12 }} />}
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 850, borderCollapse: 'collapse' }}>
          <thead><tr>{['Include / Project','Confidential','Leader','My Insights','Status / Recommendation'].map(h => <th key={h} style={{ textAlign: 'left', padding: 8 }}>{h}</th>)}</tr></thead>
          <tbody>{candidates.map(p => <tr key={p.id}>
            <td style={{ width: '23%', padding: 8, verticalAlign: 'top' }}><Checkbox checked={!excluded.includes(p.id)} onChange={e => { setExcluded(old => e.target.checked ? old.filter(id => id !== p.id) : [...old, p.id]); setDirty(true); }}>{p.title}</Checkbox></td>
            <td style={{ padding: 8, verticalAlign: 'top' }}>{p.visibility === 'private' ? 'Confidential' : ''}</td>
            <td style={{ padding: 8, verticalAlign: 'top' }}>{p.leadDeacon || 'Unassigned'}</td>
            <td style={{ width: '30%', padding: 8, verticalAlign: 'top' }}><Input.TextArea aria-label={`Insights for ${p.title}`} autoSize={{ minRows: 3 }} maxLength={10000} value={entries[p.id]?.insights || ''} onChange={e => edit(p.id, 'insights', e.target.value)} /><Typography.Text type="secondary">{changed.includes(p.id) ? 'Edited — not saved' : entries[p.id]?.reviewedAt ? `Last reviewed ${new Date(entries[p.id].reviewedAt).toLocaleDateString()}` : 'Not yet reviewed'}</Typography.Text><Button size="small" type="link" onClick={() => { edit(p.id, 'insights', ''); edit(p.id, 'recommendation', ''); }}>Clear commentary</Button></td>
            <td style={{ width: '25%', padding: 8, verticalAlign: 'top' }}><Input.TextArea aria-label={`Recommendation for ${p.title}`} autoSize={{ minRows: 3 }} maxLength={10000} value={entries[p.id]?.recommendation || ''} onChange={e => edit(p.id, 'recommendation', e.target.value)} /></td>
          </tr>)}</tbody>
        </table></div>
        {!candidates.length && <Typography.Paragraph>No projects match these selections.</Typography.Paragraph>}
        <details style={{ marginTop: 16 }}><summary>Preview email table ({chosen.length} projects)</summary><div style={{ overflowX: 'auto', marginTop: 12 }} dangerouslySetInnerHTML={{ __html: preview.html }} /></details>
      </>}
    </Modal>
  </>;
}
