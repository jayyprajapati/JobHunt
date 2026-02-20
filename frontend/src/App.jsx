import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactQuill from 'react-quill';
import RecipientList from './components/RecipientList.jsx';
import { Mail, Users, FolderOpen, Send, Clock, History, Heart } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const USER_ID = 'demo-user';
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const QUILL_MODULES = {
  toolbar: [
    ['bold', 'italic', 'underline'],
    [{ header: [2, 3, false] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link'],
  ],
};

const VARIABLE_OPTIONS = ['name', 'company'];

function uid() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(16).slice(2).padEnd(24, '0').slice(0, 24);
}

function Toast({ notice, onClose }) {
  if (!notice) return null;
  return (
    <div className={`toast toast--${notice.type}`}>
      <span>{notice.message}</span>
      <button onClick={onClose}>×</button>
    </div>
  );
}

function Drawer({ open, title, onClose, children, from = 'right', width = 480 }) {
  return (
    <>
      {open && <div className="drawer-overlay" onClick={onClose} />}
      <aside className={`drawer drawer--${from} ${open ? 'drawer--open' : ''}`} style={{ width }}>
        <div className="drawer__head">
          <span className="drawer__title">{title}</span>
          <button className="btn-icon" onClick={onClose}>×</button>
        </div>
        <div className="drawer__body">{children}</div>
      </aside>
    </>
  );
}

export default function App() {
  /* ── state ── */
  const [recipients, setRecipients] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sendMode, setSendMode] = useState('individual');
  const [deliveryMode, setDeliveryMode] = useState('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewRecipientId, setPreviewRecipientId] = useState(null);
  const [previewRecipientMeta, setPreviewRecipientMeta] = useState(null);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [senderName, setSenderName] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [errors, setErrors] = useState({ recipients: {} });
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draftId, setDraftId] = useState(null);

  const quillRef = useRef(null);
  const [slashMenu, setSlashMenu] = useState({ open: false, top: 0, left: 0 });
  const [slashHighlight, setSlashHighlight] = useState(0);
  const [slashTriggerIdx, setSlashTriggerIdx] = useState(null);

  const [groups, setGroups] = useState([]);
  const [groupDrawer, setGroupDrawer] = useState(null); // null | 'create' | group object
  const [groupTitle, setGroupTitle] = useState('');
  const [groupRecipients, setGroupRecipients] = useState([]);
  const [groupErrors, setGroupErrors] = useState({ recipients: {} });
  const [importedGroupId, setImportedGroupId] = useState(null);
  const [importedGroupEmails, setImportedGroupEmails] = useState([]);
  const [pendingGroupExtras, setPendingGroupExtras] = useState(0);

  const [templates, setTemplates] = useState([]);
  const [templateDrawer, setTemplateDrawer] = useState(null); // null | 'create' | tpl object
  const [templateTitle, setTemplateTitle] = useState('');

  /* ── effects ── */

  useEffect(() => { refreshAuth(); loadHistory(); loadGroups(); loadTemplates(); handleAuthCallback(); }, []);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 3500); return () => clearTimeout(t); }, [notice]);

  useEffect(() => {
    if (!recipients.length) { setPreviewRecipientId(null); return; }
    if (!recipients.some(r => r._id === previewRecipientId)) setPreviewRecipientId(recipients[0]._id);
  }, [recipients, previewRecipientId]);

  useEffect(() => {
    if (!importedGroupId) { setPendingGroupExtras(0); return; }
    const base = new Set((importedGroupEmails || []).map(e => (e || '').toLowerCase()));
    setPendingGroupExtras(recipients.filter(r => {
      const e = (r.email || '').toLowerCase();
      return e && emailRegex.test(e) && r.name && !base.has(e);
    }).length);
  }, [recipients, importedGroupId, importedGroupEmails]);

  const hdrs = useMemo(() => ({ 'Content-Type': 'application/json', 'x-user-id': USER_ID }), []);

  /* ── slash menu ── */

  useEffect(() => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    const handleKeyDown = e => {
      if (slashMenu.open) {
        if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
          e.preventDefault();
        }
        if (e.key === 'ArrowDown') {
          setSlashHighlight(prev => (prev + 1) % VARIABLE_OPTIONS.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          setSlashHighlight(prev => (prev - 1 + VARIABLE_OPTIONS.length) % VARIABLE_OPTIONS.length);
          return;
        }
        if (e.key === 'Enter') {
          insertVariable(VARIABLE_OPTIONS[slashHighlight]);
          return;
        }
        if (e.key === 'Escape') {
          closeSlashMenu();
          return;
        }
        closeSlashMenu();
        return;
      }

      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const sel = quill.getSelection(true);
        if (!sel) return;
        const bounds = quill.getBounds(sel.index);
        const rect = quill.root.getBoundingClientRect();
        setSlashMenu({
          open: true,
          left: rect.left + bounds.left,
          top: rect.top + bounds.top + bounds.height + 4,
        });
        setSlashTriggerIdx(sel.index);
        setSlashHighlight(0);
      }
    };

    quill.root.addEventListener('keydown', handleKeyDown);
    return () => quill.root.removeEventListener('keydown', handleKeyDown);
  }, [slashMenu.open, slashHighlight]);

  function closeSlashMenu() {
    setSlashMenu({ open: false, top: 0, left: 0 });
    setSlashTriggerIdx(null);
  }

  function insertVariable(key) {
    const quill = quillRef.current?.getEditor();
    if (!quill || slashTriggerIdx === null) return;
    const token = `{{${key}}}`;
    quill.deleteText(slashTriggerIdx, 1);
    quill.insertText(slashTriggerIdx, token);
    quill.setSelection(slashTriggerIdx + token.length, 0);
    closeSlashMenu();
  }

  /* ── api helpers ── */

  const refreshAuth = async () => {
    setAuthChecking(true);
    try {
      const r = await fetch(`${API_BASE}/auth/status`);
      const d = await r.json();
      setIsAuthed(!!d.authenticated);
      setAuthEmail(d.email || '');
    } catch {
      setIsAuthed(false);
      setAuthEmail('');
    } finally {
      setAuthChecking(false);
    }
  };

  function handleAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get('auth');
    if (auth === 'success') {
      setNotice({ type: 'success', message: 'Gmail connected successfully!' });
      refreshAuth();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (auth === 'error') {
      const reason = params.get('reason') || 'Authorization failed';
      setNotice({ type: 'error', message: `Gmail auth failed: ${reason}` });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  async function disconnectGmail() {
    try {
      await fetch(`${API_BASE}/auth/disconnect`, { method: 'POST' });
      setIsAuthed(false);
      setAuthEmail('');
      setNotice({ type: 'info', message: 'Gmail disconnected' });
    } catch {
      setNotice({ type: 'error', message: 'Failed to disconnect' });
    }
  }

  const loadHistory = async () => { try { const r = await fetch(`${API_BASE}/api/campaigns`); setHistory(await r.json()); } catch { setNotice({ type: 'error', message: 'Failed to load history' }); } };
  const loadGroups = async () => { try { const r = await fetch(`${API_BASE}/api/groups`, { headers: hdrs }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setGroups(d); } catch (e) { setNotice({ type: 'error', message: e.message }); } };
  const loadTemplates = async () => { try { const r = await fetch(`${API_BASE}/api/templates`, { headers: hdrs }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setTemplates(d); } catch (e) { setNotice({ type: 'error', message: e.message }); } };

  /* ── helpers ── */

  const strip = h => (h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const cap = w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '';
  const nameFrom = e => { const p = (e || '').split('@')[0].replace(/[0-9]/g, '').split(/[._-]+/).filter(Boolean); return p.length ? p.map(cap).join(' ') : 'There'; };
  const compFrom = e => { const d = (e || '').split('@')[1] || ''; return cap(d.split('.')[0]) || 'Company'; };
  const san = r => ({ ...r, email: (r.email || '').toLowerCase().trim(), name: (r.name || '').trim(), company: (r.company || '').trim(), _id: r._id || uid(), status: r.status || 'pending' });

  function parseBulk(raw) {
    if (!raw) return [];
    const seen = new Set(), list = [];
    for (const t of raw.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean)) {
      if (!emailRegex.test(t)) continue;
      const e = t.toLowerCase();
      if (seen.has(e)) continue;
      seen.add(e);
      list.push({ email: e, name: nameFrom(e), company: compFrom(e), _id: uid(), status: 'pending' });
    }
    return list;
  }

  /* ── recipient ops ── */

  function updateRecipient(idx, field, value) {
    setRecipients(prev => {
      const next = [...prev]; next[idx] = { ...next[idx], [field]: value };
      const id = next[idx]._id;
      if (errors.recipients?.[id]?.[field]) {
        const ok = field === 'email' ? emailRegex.test(value || '') : !!(value && value.trim());
        if (ok) setErrors(p => { const u = { ...p.recipients }; const x = { ...(u[id] || {}) }; delete x[field]; u[id] = x; return { ...p, recipients: u }; });
      }
      if (errors.recipientsGeneral && next.length) setErrors(p => ({ ...p, recipientsGeneral: undefined }));
      return next;
    });
  }

  function deleteRecipient(idx) {
    setRecipients(prev => {
      const rm = prev[idx];
      if (rm && errors.recipients?.[rm._id]) setErrors(p => { const u = { ...p.recipients }; delete u[rm._id]; return { ...p, recipients: u }; });
      return prev.filter((_, i) => i !== idx);
    });
  }

  function addRow() {
    setRecipients(p => [...p, { _id: uid(), email: '', name: '', company: '', status: 'pending' }]);
    if (errors.recipientsGeneral) setErrors(p => ({ ...p, recipientsGeneral: undefined }));
  }

  function onEmailBlur(idx) {
    setRecipients(prev => {
      const next = [...prev], r = next[idx];
      if (!r || !emailRegex.test(r.email || '')) return prev;
      next[idx] = { ...r, name: r.name?.trim() ? r.name : nameFrom(r.email), company: r.company?.trim() ? r.company : compFrom(r.email) };
      return next;
    });
  }

  function doBulkPaste(text) {
    const parsed = parseBulk(text);
    if (!parsed.length) return;
    setRecipients(parsed);
    setPreviewRecipientId(parsed[0]?._id || null);
    setBulkMode(false); setBulkInput('');
    setErrors(p => ({ ...p, recipients: {}, recipientsGeneral: undefined }));
    setImportedGroupId(null); setImportedGroupEmails([]);
  }

  /* ── validation ── */

  function validate() {
    const e = { recipients: {} };
    if (!subject.trim()) e.subject = 'Required';
    if (!strip(body)) e.body = 'Required';
    if (!isAuthed) e.sender = 'Connect Gmail first';
    if (!recipients.length) e.recipientsGeneral = 'Add at least one recipient';
    const usesCompany = /\{\{\s*company\s*\}\}/i.test(body) || /\{\{\s*company\s*\}\}/i.test(subject);
    recipients.forEach(r => {
      const re = {};
      if (!emailRegex.test(r.email || '')) re.email = 'Invalid';
      if (!r.name?.trim()) re.name = 'Required';
      if (usesCompany && !r.company?.trim()) re.company = 'Required';
      if (Object.keys(re).length) e.recipients[r._id] = re;
    });
    if (deliveryMode === 'schedule') {
      const d = new Date(scheduledAt);
      if (!scheduledAt || Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) e.scheduledAt = 'Must be in the future';
    }
    return e;
  }

  const hasErr = e => {
    const rr = Object.values(e.recipients || {}).some(o => Object.keys(o || {}).length);
    return !!(e.subject || e.body || e.sender || e.scheduledAt || e.recipientsGeneral || rr);
  };

  /* ── campaign actions ── */

  function buildPayload() {
    const when = deliveryMode === 'schedule' && scheduledAt ? new Date(scheduledAt) : null;
    return { subject, body_html: body, sender_name: senderName, send_mode: sendMode, recipients: recipients.map(san), scheduled_at: when && !Number.isNaN(when) ? when.toISOString() : null, status: deliveryMode === 'schedule' && when && when.getTime() > Date.now() ? 'scheduled' : 'draft' };
  }

  async function saveDraft(toast = false) {
    const p = buildPayload();
    if (!p.subject || !p.body_html || !p.recipients.length) { if (toast) setNotice({ type: 'error', message: 'Need subject, body & recipients' }); return; }
    setSaving(true);
    try {
      let res;
      if (draftId) { res = await fetch(`${API_BASE}/api/campaigns/${draftId}`, { method: 'PATCH', headers: hdrs, body: JSON.stringify(p) }); }
      else { res = await fetch(`${API_BASE}/api/campaigns`, { method: 'POST', headers: hdrs, body: JSON.stringify(p) }); }
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Save failed');
      if (!draftId && d.id) setDraftId(d.id);
      if (toast) setNotice({ type: 'info', message: 'Draft saved' });
      return d.id || draftId;
    } catch (e) { setNotice({ type: 'error', message: e.message }); } finally { setSaving(false); }
  }

  async function doPreview() {
    const ve = validate(); setErrors(ve); if (hasErr(ve)) return;
    setIsPreviewing(true);
    try {
      const id = (await saveDraft()) || draftId; if (!id) throw new Error('Save draft first');
      const tgt = recipients[Math.floor(Math.random() * recipients.length)];
      setPreviewRecipientId(tgt?._id);
      const res = await fetch(`${API_BASE}/api/campaigns/${id}/preview`, { method: 'POST', headers: hdrs, body: JSON.stringify({ recipient_id: tgt?._id }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Preview failed');
      setPreviewRecipientMeta(tgt); setPreviewHtml(d.html || ''); setPreviewOpen(true);
    } catch (e) { setNotice({ type: 'error', message: e.message }); } finally { setIsPreviewing(false); }
  }

  async function doSend() {
    setIsSending(true); setNotice(null);
    try {
      const id = (await saveDraft()) || draftId; if (!id) throw new Error('Save draft first');
      const res = await fetch(`${API_BASE}/api/campaigns/${id}/send`, { method: 'POST', headers: hdrs, body: JSON.stringify({ confirm_bulk_send: recipients.length > 5 }) });
      const d = await res.json();
      if (!res.ok) {
        // If it's an auth error, refresh auth state so UI reflects reality
        if (res.status === 401 || d.authError) {
          setIsAuthed(false);
          setAuthEmail('');
          setNotice({ type: 'error', message: 'Gmail authorization expired. Please reconnect your account, then try again.' });
          return;
        }
        throw new Error(d.error || 'Send failed');
      }
      setNotice({ type: 'success', message: d.status === 'scheduled' ? `Scheduled for ${scheduledAt}` : `Sent to ${recipients.length} recipients` });
      setErrors({ recipients: {} }); setPreviewOpen(false); await loadHistory();
    } catch (e) { setNotice({ type: 'error', message: e.message }); } finally { setIsSending(false); }
  }

  async function loadCampaign(id) {
    try {
      const res = await fetch(`${API_BASE}/api/campaigns/${id}`); const d = await res.json(); if (!res.ok) throw new Error(d.error);
      setSubject(d.subject || ''); setBody(d.body_html || ''); setSendMode(d.send_mode || 'individual'); setSenderName(d.sender_name || '');
      const recs = (d.recipients || []).map(r => ({ ...r, _id: r._id || uid() })); setRecipients(recs); setPreviewRecipientId(recs[0]?._id || null);
      setErrors({ recipients: {} }); setImportedGroupId(null); setImportedGroupEmails([]);
      if (d.scheduled_at) { setDeliveryMode('schedule'); setScheduledAt(d.scheduled_at.slice(0, 16)); } else { setDeliveryMode('now'); setScheduledAt(''); }
      setDraftId(d.id); setNotice({ type: 'info', message: 'Draft loaded' }); setHistoryOpen(false);
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
  }

  /* ── group actions ── */

  function importGroup(g) {
    const m = (g.recipients || []).map(r => ({ ...r, _id: uid(), status: 'pending' }));
    setRecipients(m); setPreviewRecipientId(m[0]?._id || null); setErrors({ recipients: {} });
    setImportedGroupId(g.id); setImportedGroupEmails((g.recipients || []).map(r => r.email));
    setNotice({ type: 'info', message: `Imported "${g.title}"` });
  }

  function openGroupDrawer(target) {
    if (target === 'create') {
      setGroupTitle(''); setGroupRecipients(recipients.map(r => ({ ...r, _id: r._id || uid() }))); setGroupErrors({ recipients: {} });
    } else {
      setGroupTitle(target.title); setGroupRecipients((target.recipients || []).map(r => ({ ...r, _id: r._id || uid() }))); setGroupErrors({ recipients: {} });
    }
    setGroupDrawer(target);
  }

  async function saveGroupDrawer() {
    const { recErrors, general } = valRecs(groupRecipients);
    const ne = { recipients: recErrors };
    if (!groupTitle.trim()) ne.title = 'Required';
    if (general) ne.general = general;
    setGroupErrors(ne);
    if (ne.title || ne.general || Object.keys(recErrors).length) return;
    try {
      const isCreate = groupDrawer === 'create';
      const url = isCreate ? `${API_BASE}/api/groups` : `${API_BASE}/api/groups/${groupDrawer.id}`;
      const method = isCreate ? 'POST' : 'PATCH';
      const payload = isCreate ? { title: groupTitle.trim(), recipients: groupRecipients.map(san) } : { title: groupTitle.trim(), recipients: groupRecipients.map(san) };
      const res = await fetch(url, { method, headers: hdrs, body: JSON.stringify(payload) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Failed');
      setNotice({ type: 'success', message: isCreate ? 'Group created' : 'Group saved' });
      setGroupDrawer(null); await loadGroups();
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
  }

  async function updateImportedGroup() {
    if (!importedGroupId) return;
    const base = new Set((importedGroupEmails || []).map(e => e.toLowerCase()));
    const extras = recipients.map(san).filter(r => r.email && !base.has(r.email) && emailRegex.test(r.email) && r.name && r.company);
    if (!extras.length) { setNotice({ type: 'info', message: 'No new recipients to add' }); return; }
    try {
      const res = await fetch(`${API_BASE}/api/groups/${importedGroupId}/append`, { method: 'POST', headers: hdrs, body: JSON.stringify({ recipients: extras }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error);
      setImportedGroupEmails(prev => [...prev, ...extras.map(r => r.email)]); setPendingGroupExtras(0);
      setNotice({ type: 'success', message: `Added ${d.added || extras.length} to group` });
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
  }

  function valRecs(list) {
    const recErrors = {}; let general;
    if (!list.length) general = 'Need at least one recipient';
    list.forEach(r => { const e = {}; if (!emailRegex.test(r.email || '')) e.email = 'Invalid'; if (!r.name?.trim()) e.name = 'Required'; if (Object.keys(e).length) recErrors[r._id] = e; });
    return { recErrors, general };
  }

  /* ── template actions ── */

  function importTemplate(t) {
    setSubject(t.subject || ''); setBody(t.body_html || '');
    setNotice({ type: 'info', message: `Template "${t.title}" applied` });
  }

  function openCreateTemplate() {
    if (!subject.trim() || !strip(body)) { setNotice({ type: 'error', message: 'Write subject & body first' }); return; }
    setTemplateTitle(''); setTemplateDrawer('create');
  }

  async function saveTemplate() {
    if (!templateTitle.trim()) { setNotice({ type: 'error', message: 'Title required' }); return; }
    try {
      const res = await fetch(`${API_BASE}/api/templates`, { method: 'POST', headers: hdrs, body: JSON.stringify({ title: templateTitle.trim(), subject, body_html: body }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error);
      setNotice({ type: 'success', message: 'Template saved' }); setTemplateDrawer(null); await loadTemplates();
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
  }

  /* ── group recipient helpers for drawer ── */

  function grUpdate(idx, field, value) {
    setGroupRecipients(prev => { const n = [...prev]; n[idx] = { ...n[idx], [field]: value, _id: n[idx]._id || uid() }; return n; });
  }
  function grDelete(idx) { setGroupRecipients(p => p.filter((_, i) => i !== idx)); }
  function grBlur(idx) {
    setGroupRecipients(prev => {
      const n = [...prev], r = n[idx]; if (!r || !emailRegex.test(r.email || '')) return prev;
      n[idx] = { ...r, name: r.name?.trim() ? r.name : nameFrom(r.email), company: r.company?.trim() ? r.company : compFrom(r.email) };
      return n;
    });
  }
  function grAdd() { setGroupRecipients(p => [...p, { _id: uid(), email: '', name: '', company: '' }]); }

  /* ── render ── */

  return (
    <div className="shell">
      {/* ── HEADER ── */}
      <header className="hdr">
        <div className="hdr__left">
          <Mail size={20} className="hdr__logo" />
          <b className="hdr__name">Recruiter Mailer</b>
        </div>
        <div className="hdr__right">
          {authChecking ? (
            <span className="hdr__gmail"><i className="dot dot--warn" /> Checking…</span>
          ) : isAuthed ? (
            <span className="hdr__gmail-group">
              <span className="hdr__gmail"><i className="dot dot--ok" /> {authEmail || 'Gmail Connected'}</span>
              <button className="hdr__disconnect" onClick={disconnectGmail}>Disconnect</button>
            </span>
          ) : (
            <span className="hdr__gmail" onClick={() => window.location.href = `${API_BASE}/auth/google`}>
              <i className="dot dot--err" /> Connect Gmail
            </span>
          )}
          <button className="hdr__btn" onClick={() => setHistoryOpen(true)}><History size={15} /> History</button>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="main">
        {/* LEFT */}
        <section className="side">
          <div className="side__scroll">

            {/* Sender */}
            <div className="card">
              <div className="card__head">
                <span className="card__title"><Mail size={16} /> Sender</span>
              </div>
              <input className="inp" value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="Display name (optional)" />
              {errors.sender && <small className="err">{errors.sender}</small>}
            </div>

            {/* Recipients */}
            <div className="card">
              <div className="card__head">
                <span className="card__title"><Users size={16} /> Recipients</span>
                <button className="link" onClick={() => setBulkMode(!bulkMode)}>{bulkMode ? 'Manual entry' : 'Paste bulk'}</button>
              </div>

              {bulkMode ? (
                <textarea className="inp inp--area" rows={5} placeholder="Paste emails (comma / newline separated)" value={bulkInput} onChange={e => setBulkInput(e.target.value)} onPaste={e => { e.preventDefault(); doBulkPaste(e.clipboardData?.getData('text') || ''); }} />
              ) : (
                <>
                  <RecipientList recipients={recipients} onChange={updateRecipient} onDelete={deleteRecipient} onEmailBlur={onEmailBlur} fieldErrors={errors.recipients} />
                  <button className="link" onClick={addRow}>+ Add recipient</button>
                </>
              )}
              {errors.recipientsGeneral && <small className="err">{errors.recipientsGeneral}</small>}

              {pendingGroupExtras > 0 && (
                <div className="note">{pendingGroupExtras} new — <button className="link" onClick={updateImportedGroup}>sync to group</button></div>
              )}
            </div>

            {/* Groups */}
            <div className="card">
              <div className="card__head">
                <span className="card__title"><FolderOpen size={16} /> Groups</span>
                <button className="link" onClick={() => openGroupDrawer('create')}>+ New group</button>
              </div>
              {groups.length ? (
                <div className="group-chips">
                  {groups.map(g => (
                    <div className="group-chip" key={g.id} onClick={() => openGroupDrawer(g)}>
                      <div className="group-chip__info">
                        <span className="group-chip__name">{g.title}</span>
                        <span className="group-chip__count">{g.recipients?.length || 0}</span>
                      </div>
                      <button className="group-chip__import" onClick={e => { e.stopPropagation(); importGroup(g); }}>Import</button>
                    </div>
                  ))}
                </div>
              ) : <p className="muted">No groups saved yet.</p>}
            </div>

            {/* Delivery */}
            <div className="card">
              <div className="card__head">
                <span className="card__title"><Send size={16} /> Delivery</span>
              </div>

              <div className="delivery-row">
                <div className="delivery-col">
                  <span className="lbl--upper">Timing</span>
                  <div className="toggle-row">
                    <button className={`tog ${deliveryMode === 'now' ? 'tog--on' : ''}`} onClick={() => { setDeliveryMode('now'); setErrors(p => ({ ...p, scheduledAt: undefined })); }}>Send now</button>
                    <button className={`tog ${deliveryMode === 'schedule' ? 'tog--on' : ''}`} onClick={() => setDeliveryMode('schedule')}>Schedule</button>
                  </div>
                  {deliveryMode === 'schedule' && <input className="inp" type="datetime-local" value={scheduledAt} onChange={e => { setScheduledAt(e.target.value); if (errors.scheduledAt) { const d = new Date(e.target.value); if (e.target.value && !Number.isNaN(d.getTime()) && d.getTime() > Date.now()) setErrors(p => ({ ...p, scheduledAt: undefined })); } }} style={{ marginTop: 4 }} />}
                  {errors.scheduledAt && <small className="err">{errors.scheduledAt}</small>}
                </div>

                <div className="delivery-col">
                  <span className="lbl--upper">Send type</span>
                  <div className="toggle-row">
                    <button className={`tog ${sendMode === 'individual' ? 'tog--on' : ''}`} onClick={() => setSendMode('individual')}>Individual</button>
                    <button className={`tog ${sendMode === 'single' ? 'tog--on' : ''}`} onClick={() => setSendMode('single')}>Single</button>
                  </div>
                </div>
              </div>
              <p className="hint">Individual mode personalizes each email with {'{{name}}'} and {'{{company}}'}</p>
            </div>

          </div>
        </section>

        {/* RIGHT */}
        <section className="compose">
          <div className="compose__inner">
            <div className="compose__scroll">
              <input className="compose__subject" value={subject} onChange={e => { setSubject(e.target.value); if (errors.subject) setErrors(p => ({ ...p, subject: undefined })); }} placeholder="Subject line" />
              {errors.subject && <span className="err--blue">{errors.subject}</span>}

              <div className="compose__editor">
                <p className="editor-hint">Type <b>/</b> in the editor to insert variables like {'{{name}}'} or {'{{company}}'}</p>
                <div className="quill-wrap">
                  <ReactQuill ref={quillRef} theme="snow" value={body} onChange={v => { setBody(v); if (errors.body && strip(v)) setErrors(p => ({ ...p, body: undefined })); }} modules={QUILL_MODULES} placeholder="Write your email…" />
                </div>
                {slashMenu.open && (
                  <div className="slash-menu" style={{ position: 'fixed', top: slashMenu.top, left: slashMenu.left, zIndex: 100 }}>
                    {VARIABLE_OPTIONS.map((opt, idx) => (
                      <button
                        key={opt}
                        className={idx === slashHighlight ? 'active' : ''}
                        onMouseDown={e => { e.preventDefault(); insertVariable(opt); }}
                      >
                        {`{{${opt}}}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {errors.body && <span className="err--blue">{errors.body}</span>}

              <div className="compose__actions">
                <button className="btn btn--outline" onClick={() => saveDraft(true)} disabled={saving}>{saving ? 'Saving…' : 'Save Draft'}</button>
                <button className="btn btn--white" onClick={doPreview} disabled={isPreviewing}>{isPreviewing ? 'Loading…' : 'Preview & Send'}</button>
              </div>

              {/* Templates */}
              <div className="tpl-area">
                <div className="blk__head">
                  <label className="lbl lbl--white">Templates</label>
                  <button className="link link--white" onClick={openCreateTemplate}>+ Save current</button>
                </div>
                {templates.length ? templates.map(t => (
                  <div className="row--dark" key={t.id}>
                    <div className="row__info" onClick={() => setTemplateDrawer(t)}>
                      <span className="row__name--w">{t.title || t.subject}</span>
                      <span className="row__sub--w">{strip(t.body_html || '').slice(0, 50)}</span>
                    </div>
                    <button className="chip-sm--w" onClick={() => importTemplate(t)}>Use</button>
                  </div>
                )) : <small className="muted muted--w">No templates yet</small>}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <footer className="ftr">
        <Heart size={12} /> Built with care · Recruiter Mailer
      </footer>

      <Toast notice={notice} onClose={() => setNotice(null)} />

      {/* ── DRAWERS ── */}

      {/* Preview */}
      <Drawer open={previewOpen} title="Preview & Send" onClose={() => setPreviewOpen(false)} width={560}>
        {previewRecipientMeta && (
          <div className="pv-meta">
            <div><b>{previewRecipientMeta.name}</b> <span className="muted">({previewRecipientMeta.company})</span></div>
            <div className="pv-meta__acts">
              <button className="link" onClick={() => { const r = recipients[Math.floor(Math.random() * recipients.length)]; if (r) { setIsPreviewing(true); fetch(`${API_BASE}/api/campaigns/${draftId}/preview`, { method: 'POST', headers: hdrs, body: JSON.stringify({ recipient_id: r._id }) }).then(x => x.json()).then(d => { setPreviewRecipientMeta(r); setPreviewHtml(d.html || ''); }).catch(e => setNotice({ type: 'error', message: e.message })).finally(() => setIsPreviewing(false)); } }}>Shuffle</button>
              <span className="muted" style={{ fontSize: 12 }}>(Random preview)</span>
            </div>
          </div>
        )}
        <div className="pv-frame" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        <div className="pv-foot">
          <button className="btn btn--ghost" onClick={() => setPreviewOpen(false)}>Cancel</button>
          <button className="btn btn--primary" onClick={doSend} disabled={isSending}>{isSending ? 'Sending…' : 'Confirm & Send'}</button>
        </div>
      </Drawer>

      {/* History */}
      <Drawer open={historyOpen} title="Campaign History" onClose={() => setHistoryOpen(false)} width={500}>
        {history.length ? history.map(h => (
          <button className="hist-row" key={h.id} onClick={() => loadCampaign(h.id)}>
            <div><b>{h.subject}</b><br /><small className="muted">{new Date(h.created_at).toLocaleString()}</small></div>
            <div className="hist-row__right"><span className={`pill pill--${h.status}`}>{h.status}</span><small className="muted">{h.recipient_count} recipients</small></div>
          </button>
        )) : <p className="muted">No campaigns yet.</p>}
      </Drawer>

      {/* Group drawer */}
      <Drawer open={!!groupDrawer} title={groupDrawer === 'create' ? 'Create Group' : `Edit: ${groupDrawer?.title || ''}`} onClose={() => setGroupDrawer(null)} from="left" width={480}>
        <input className="inp" placeholder="Group name" value={groupTitle} onChange={e => setGroupTitle(e.target.value)} style={{ marginBottom: 12 }} />
        {groupErrors.title && <small className="err">{groupErrors.title}</small>}
        <RecipientList recipients={groupRecipients} onChange={grUpdate} onDelete={grDelete} onEmailBlur={grBlur} fieldErrors={groupErrors.recipients} />
        <button className="link" onClick={grAdd} style={{ marginTop: 4 }}>+ Add row</button>
        {groupErrors.general && <small className="err">{groupErrors.general}</small>}
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button className="btn btn--primary" onClick={saveGroupDrawer}>{groupDrawer === 'create' ? 'Create' : 'Save'}</button>
        </div>
      </Drawer>

      {/* Template view */}
      <Drawer open={!!templateDrawer && templateDrawer !== 'create'} title={templateDrawer?.title || 'Template'} onClose={() => setTemplateDrawer(null)} width={480}>
        {templateDrawer && templateDrawer !== 'create' && (
          <>
            <p className="lbl" style={{ marginBottom: 4 }}>Subject</p>
            <p style={{ marginBottom: 16 }}>{templateDrawer.subject}</p>
            <p className="lbl" style={{ marginBottom: 4 }}>Body</p>
            <div className="pv-frame" style={{ minHeight: 120 }} dangerouslySetInnerHTML={{ __html: templateDrawer.body_html || '' }} />
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <button className="btn btn--primary" onClick={() => { importTemplate(templateDrawer); setTemplateDrawer(null); }}>Use this template</button>
            </div>
          </>
        )}
      </Drawer>

      {/* Template create */}
      <Drawer open={templateDrawer === 'create'} title="Save as Template" onClose={() => setTemplateDrawer(null)} width={420}>
        <input className="inp" placeholder="Template name" value={templateTitle} onChange={e => setTemplateTitle(e.target.value)} style={{ marginBottom: 16 }} />
        <p className="lbl" style={{ marginBottom: 4 }}>Subject</p>
        <p className="muted" style={{ marginBottom: 12 }}>{subject || '(empty)'}</p>
        <p className="lbl" style={{ marginBottom: 4 }}>Body preview</p>
        <div className="pv-frame" style={{ minHeight: 80 }} dangerouslySetInnerHTML={{ __html: body || '<em>Empty</em>' }} />
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button className="btn btn--primary" onClick={saveTemplate}>Save Template</button>
        </div>
      </Drawer>
    </div>
  );
}
