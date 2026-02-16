import React, { useEffect, useMemo, useState } from 'react';
import EmailInput from './components/EmailInput.jsx';
import RecipientList from './components/RecipientList.jsx';
import Editor from './components/Editor.jsx';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const USER_ID = 'demo-user';
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function uid() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(16).slice(2).padEnd(24, '0').slice(0, 24);
}

function StatusBanner({ notice, onClose }) {
  if (!notice) return null;
  return (
    <div className={`status-banner ${notice.type}`}>
      <span>{notice.message}</span>
      <button className="icon-button" onClick={onClose} aria-label="Close notice">×</button>
    </div>
  );
}

function SlidePanel({ open, title, onClose, children, width = '55vw' }) {
  return (
    <div className={`drawer ${open ? 'open' : ''}`} style={{ width }}>
      <div className="drawer-header">
        <div>
          <p className="eyebrow">{title}</p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close panel">×</button>
      </div>
      <div className="drawer-body">{children}</div>
    </div>
  );
}

function Modal({ open, title, onClose, children, width = 420 }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width }}>
        {title ? <p className="section-title">{title}</p> : null}
        <div className="modal-body">{children}</div>
        <div className="buttons">
          <button className="text-button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
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
  const [senderName, setSenderName] = useState('');
  const [recipientTab, setRecipientTab] = useState('enter');
  const [bulkInput, setBulkInput] = useState('');
  const [errors, setErrors] = useState({ recipients: {} });
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [groups, setGroups] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupRecipients, setGroupRecipients] = useState([]);
  const [groupErrors, setGroupErrors] = useState({ recipients: {} });
  const [groupImportOpen, setGroupImportOpen] = useState(false);
  const [groupToConfirm, setGroupToConfirm] = useState(null);
  const [importedGroupId, setImportedGroupId] = useState(null);
  const [importedGroupEmails, setImportedGroupEmails] = useState([]);
  const [pendingGroupExtras, setPendingGroupExtras] = useState(0);
  const [templateTitlePrompt, setTemplateTitlePrompt] = useState(false);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateImportOpen, setTemplateImportOpen] = useState(false);
  const [templateToConfirm, setTemplateToConfirm] = useState(null);

  useEffect(() => {
    refreshAuth();
    loadHistory();
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!recipients.length) {
      setPreviewRecipientId(null);
      return;
    }
    const exists = recipients.some(r => r._id === previewRecipientId);
    if (!exists) {
      setPreviewRecipientId(recipients[0]._id);
    }
  }, [recipients, previewRecipientId]);

  useEffect(() => {
    const recipientsReady = recipients.length && recipients.every(r => emailRegex.test(r.email || '') && r.name && r.company);
    const shouldSave = subject.trim() && stripHtml(body) && recipientsReady;
    if (!shouldSave) return undefined;
    const t = setTimeout(() => saveDraft(), 600);
    return () => clearTimeout(t);
  }, [subject, body, recipients, sendMode, deliveryMode, scheduledAt]);

  useEffect(() => {
    if (!importedGroupId) {
      setPendingGroupExtras(0);
      return;
    }
    const baseline = new Set((importedGroupEmails || []).map(e => (e || '').toLowerCase()));
    const extras = recipients.filter(r => {
      const email = (r.email || '').toLowerCase();
      return email && emailRegex.test(email) && r.name && r.company && !baseline.has(email);
    });
    setPendingGroupExtras(extras.length);
  }, [recipients, importedGroupId, importedGroupEmails]);

  const authHeaders = useMemo(() => ({ 'Content-Type': 'application/json', 'x-user-id': USER_ID }), []);

  const refreshAuth = async () =>
    fetch(`${API_BASE}/auth/status`)
      .then(r => r.json())
      .then(data => setIsAuthed(!!data.authenticated))
      .catch(() => setIsAuthed(false));

  const loadHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/campaigns`);
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      setNotice({ type: 'error', message: 'Failed to load history' });
    }
  };

  const loadGroups = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/groups`, { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load groups');
      setGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    }
  };

  const loadTemplates = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/templates`, { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load templates');
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    }
  };

  function handleBulkPaste(text) {
    const parsed = parseBulkRecipients(text);
    if (!parsed.length) return;
    setRecipients(parsed);
    setPreviewRecipientId(parsed[0]?._id || null);
    setRecipientTab('enter');
    setBulkInput('');
    setErrors(prev => ({ ...prev, recipients: {}, recipientsGeneral: undefined }));
    setImportedGroupId(null);
    setImportedGroupEmails([]);
  }

  function validateRecipientField(field, value) {
    if (field === 'email') return emailRegex.test(value || '');
    return !!(value && value.trim());
  }

  function sanitizeRecipient(rec) {
    return {
      ...rec,
      email: (rec.email || '').toLowerCase().trim(),
      name: (rec.name || '').trim(),
      company: (rec.company || '').trim(),
      _id: rec._id || uid(),
      status: rec.status || 'pending',
    };
  }

  function updateRecipient(idx, field, value) {
    setRecipients(prev => {
      const next = [...prev];
      const current = next[idx] || {};
      next[idx] = { ...current, [field]: value };
      const recId = next[idx]._id;
      if (errors.recipients?.[recId]?.[field]) {
        if (validateRecipientField(field, value)) {
          setErrors(prev => {
            const updated = { ...prev.recipients };
            const existing = { ...(updated[recId] || {}) };
            delete existing[field];
            updated[recId] = existing;
            return { ...prev, recipients: updated };
          });
        }
      }
      if (errors.recipientsGeneral && next.length) {
        setErrors(prev => ({ ...prev, recipientsGeneral: undefined }));
      }
      return next;
    });
  }

  function deleteRecipient(idx) {
    setRecipients(prev => {
      const next = prev.filter((_, i) => i !== idx);
      const removed = prev[idx];
      if (removed && errors.recipients?.[removed._id]) {
        setErrors(prevErr => {
          const updated = { ...(prevErr.recipients || {}) };
          delete updated[removed._id];
          return { ...prevErr, recipients: updated };
        });
      }
      return next;
    });
  }

  function addRecipientRow() {
    setRecipients(prev => [
      ...prev,
      { _id: uid(), email: '', name: '', company: '', status: 'pending' },
    ]);
    if (errors.recipientsGeneral) {
      setErrors(prev => ({ ...prev, recipientsGeneral: undefined }));
    }
  }

  function handleEmailBlur(idx) {
    setRecipients(prev => {
      const next = [...prev];
      const rec = next[idx];
      if (!rec) return prev;
      const autofillName = !rec.name?.trim();
      const autofillCompany = !rec.company?.trim();
      if (emailRegex.test(rec.email || '')) {
        next[idx] = {
          ...rec,
          name: autofillName ? extractName(rec.email) : rec.name,
          company: autofillCompany ? extractCompany(rec.email) : rec.company,
        };
      }
      return next;
    });
  }

  function handleSubjectChange(value) {
    setSubject(value);
    if (errors.subject && value.trim()) {
      setErrors(prev => ({ ...prev, subject: undefined }));
    }
  }

  function handleBodyChange(value) {
    setBody(value);
    if (errors.body && stripHtml(value)) {
      setErrors(prev => ({ ...prev, body: undefined }));
    }
  }

  function handleScheduledChange(value) {
    setScheduledAt(value);
    if (errors.scheduledAt) {
      const date = new Date(value);
      if (value && !Number.isNaN(date.getTime()) && date.getTime() > Date.now()) {
        setErrors(prev => ({ ...prev, scheduledAt: undefined }));
      }
    }
  }

  function buildPayload() {
    const when = deliveryMode === 'schedule' && scheduledAt ? new Date(scheduledAt) : null;
    return {
      subject,
      body_html: body,
      sender_name: senderName,
      send_mode: sendMode,
      recipients: recipients.map(sanitizeRecipient),
      scheduled_at: when && !Number.isNaN(when) ? when.toISOString() : null,
      status: deliveryMode === 'schedule' && when && when.getTime() > Date.now() ? 'scheduled' : 'draft',
    };
  }

  function stripHtml(html) {
    return (html || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function toTitle(word) {
    if (!word) return '';
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }

  function extractName(email) {
    const local = (email || '').split('@')[0];
    const cleaned = local.replace(/[0-9]/g, '');
    const parts = cleaned.split(/[._-]+/).filter(Boolean);
    if (!parts.length) return 'There';
    return parts.map(toTitle).join(' ').trim() || 'There';
  }

  function extractCompany(email) {
    const domain = (email || '').split('@')[1] || '';
    if (!domain) return 'Company';
    const main = domain.split('.')[0] || '';
    return toTitle(main) || 'Company';
  }

  function parseBulkRecipients(raw) {
    if (!raw) return [];
    const tokens = raw
      .split(/[\n,\s]+/)
      .map(t => t.trim())
      .filter(Boolean);

    const seen = new Set();
    const list = [];
    for (const token of tokens) {
      if (!emailRegex.test(token)) continue;
      const email = token.toLowerCase();
      if (seen.has(email)) continue;
      seen.add(email);
      list.push({
        email,
        name: extractName(email),
        company: extractCompany(email),
        _id: uid(),
        status: 'pending',
      });
    }
    return list;
  }

  function validateRecipients(list) {
    const recErrors = {};
    let general;
    if (!list.length) {
      general = 'At least one valid recipient is required';
    }
    list.forEach(rec => {
      const errs = {};
      if (!emailRegex.test(rec.email || '')) errs.email = 'Invalid email format';
      if (!rec.name || !rec.name.trim()) errs.name = 'Name is required';
      if (!rec.company || !rec.company.trim()) errs.company = 'Company is required';
      if (Object.keys(errs).length) recErrors[rec._id] = errs;
    });
    return { recErrors, general };
  }

  function validateForm() {
    const nextErrors = { recipients: {} };

    if (!subject.trim()) {
      nextErrors.subject = 'Subject is required';
    }

    const bodyText = stripHtml(body);
    if (!bodyText) {
      nextErrors.body = 'Email body cannot be empty';
    }

    const { recErrors, general } = validateRecipients(recipients);
    nextErrors.recipients = recErrors;
    if (general) nextErrors.recipientsGeneral = general;

    if (!isAuthed) {
      nextErrors.sender = 'Connect Gmail to resolve sender identity';
    }

    if (deliveryMode === 'schedule') {
      if (!scheduledAt) {
        nextErrors.scheduledAt = 'Scheduled time must be in the future';
      } else {
        const date = new Date(scheduledAt);
        if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
          nextErrors.scheduledAt = 'Scheduled time must be in the future';
        }
      }
    }

    return nextErrors;
  }

  function hasValidationErrors(errs) {
    const recipientErrors = errs.recipients || {};
    const hasRecipientFieldErrors = Object.values(recipientErrors).some(obj => Object.keys(obj || {}).length);
    return Boolean(
      errs.subject ||
      errs.body ||
      errs.sender ||
      errs.scheduledAt ||
      errs.recipientsGeneral ||
      hasRecipientFieldErrors
    );
  }

  async function saveDraft(forceToast = false) {
    const payload = buildPayload();
    if (!payload.subject || !payload.body_html || !payload.recipients.length) return;
    setSaving(true);
    try {
      let res;
      let latestId = draftId;
      if (draftId) {
        res = await fetch(`${API_BASE}/api/campaigns/${draftId}`, {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_BASE}/api/campaigns`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(payload),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save draft');
      if (!draftId && data.id) {
        setDraftId(data.id);
        latestId = data.id;
      }
      if (forceToast) setNotice({ type: 'info', message: 'Draft saved' });
      return latestId;
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function fetchPreview(targetId) {
    setIsPreviewing(true);
    try {
      const id = (await saveDraft()) || draftId;
      if (!id) throw new Error('Save a draft before previewing');
      const res = await fetch(`${API_BASE}/api/campaigns/${id}/preview`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ recipient_id: targetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      const meta = recipients.find(r => r._id === targetId) || recipients[0];
      setPreviewRecipientMeta(meta || null);
      setPreviewHtml(data.html || '');
      setPreviewOpen(true);
      setNotice({ type: 'info', message: 'Preview ready' });
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handlePreviewContinue() {
    const validationErrors = validateForm();
    setErrors(validationErrors);
    if (hasValidationErrors(validationErrors)) return;
    const random = recipients[Math.floor(Math.random() * recipients.length)];
    setPreviewRecipientId(random?._id || null);
    await fetchPreview(random?._id);
  }

  async function confirmAndSend() {
    setIsSending(true);
    setNotice(null);
    try {
      const id = (await saveDraft()) || draftId;
      if (!id) throw new Error('Save a draft before sending');
      const res = await fetch(`${API_BASE}/api/campaigns/${id}/send`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ confirm_bulk_send: recipients.length > 5 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      if (data.status === 'scheduled') {
        setNotice({ type: 'success', message: `Campaign scheduled for ${scheduledAt || 'later'}` });
      } else {
        setNotice({ type: 'success', message: `Email sent to ${recipients.length} recipients` });
      }
      setErrors({ recipients: {} });
      setPreviewOpen(false);
      await loadHistory();
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setIsSending(false);
    }
  }

  function connectGmail() {
    window.location.href = `${API_BASE}/auth/google`;
  }

  async function loadCampaign(id) {
    try {
      const res = await fetch(`${API_BASE}/api/campaigns/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load draft');
      setSubject(data.subject || '');
      setBody(data.body_html || '');
      setSendMode(data.send_mode || 'individual');
      const recs = (data.recipients || []).map(r => ({ ...r, _id: r._id || uid() }));
      setRecipients(recs);
      setPreviewRecipientId(recs[0]?._id || null);
      setSenderName(data.sender_name || '');
      setErrors({ recipients: {} });
      setImportedGroupId(null);
      setImportedGroupEmails([]);
      if (data.scheduled_at) {
        setDeliveryMode('schedule');
        setScheduledAt(data.scheduled_at.slice(0, 16));
      } else {
        setDeliveryMode('now');
        setScheduledAt('');
      }
      setDraftId(data.id);
      setNotice({ type: 'info', message: 'Draft loaded' });
      setHistoryOpen(false);
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    }
  }

  function startCreateGroup() {
    setGroupTitle('');
    setGroupRecipients(recipients.map(r => ({ ...r, _id: r._id || uid(), status: undefined })));
    setGroupErrors({ recipients: {} });
    setGroupModalOpen(true);
  }

  async function saveGroup() {
    const { recErrors, general } = validateRecipients(groupRecipients);
    const nextErrors = { recipients: recErrors };
    if (!groupTitle.trim()) nextErrors.title = 'Title is required';
    if (general) nextErrors.general = general;
    setGroupErrors(nextErrors);
    if (nextErrors.title || nextErrors.general || Object.keys(recErrors).length) return;
    try {
      const payload = {
        title: groupTitle.trim(),
        recipients: groupRecipients.map(sanitizeRecipient),
      };
      const res = await fetch(`${API_BASE}/api/groups`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save group');
      setNotice({ type: 'success', message: 'Group saved' });
      setGroupModalOpen(false);
      await loadGroups();
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    }
  }

  async function openImportGroups() {
    await loadGroups();
    setGroupImportOpen(true);
  }

  function confirmGroupImport(group) {
    setGroupToConfirm(group);
  }

  function applyGroupImport() {
    if (!groupToConfirm) return;
    const mapped = (groupToConfirm.recipients || []).map(r => ({ ...r, _id: uid(), status: 'pending' }));
    setRecipients(mapped);
    setPreviewRecipientId(mapped[0]?._id || null);
    setErrors({ recipients: {} });
    setGroupImportOpen(false);
    setGroupToConfirm(null);
    setImportedGroupId(groupToConfirm.id);
    setImportedGroupEmails((groupToConfirm.recipients || []).map(r => r.email));
    setNotice({ type: 'info', message: 'Group imported' });
  }

  async function updateImportedGroup() {
    if (!importedGroupId) return;
    const baseline = new Set((importedGroupEmails || []).map(e => e.toLowerCase()));
    const extras = recipients
      .map(sanitizeRecipient)
      .filter(r => r.email && !baseline.has(r.email) && emailRegex.test(r.email) && r.name && r.company);
    if (!extras.length) {
      setNotice({ type: 'info', message: 'No new valid recipients to add' });
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/groups/${importedGroupId}/append`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ recipients: extras }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update group');
      const nextEmails = [...baseline, ...extras.map(r => r.email)];
      setImportedGroupEmails(nextEmails);
      setPendingGroupExtras(0);
      setNotice({ type: 'success', message: `Group updated with ${data.added || extras.length} new recipient(s)` });
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    }
  }

  async function saveTemplate() {
    if (!templateTitle.trim()) {
      setNotice({ type: 'error', message: 'Template title is required' });
      return;
    }
    if (!subject.trim() || !stripHtml(body)) {
      setNotice({ type: 'error', message: 'Subject and body are required to save a template' });
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/templates`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ title: templateTitle.trim(), subject, body_html: body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save template');
      setNotice({ type: 'success', message: 'Template saved' });
      setTemplateTitle('');
      setTemplateTitlePrompt(false);
      await loadTemplates();
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    }
  }

  async function openTemplateImport() {
    await loadTemplates();
    setTemplateImportOpen(true);
  }

  function confirmTemplateImport(template) {
    setTemplateToConfirm(template);
  }

  function applyTemplateImport() {
    if (!templateToConfirm) return;
    setSubject(templateToConfirm.subject || '');
    setBody(templateToConfirm.body_html || '');
    setTemplateImportOpen(false);
    setTemplateToConfirm(null);
    setNotice({ type: 'info', message: 'Template imported' });
  }

  const previewButtonLabel = isPreviewing ? 'Working…' : 'Preview & Continue';
  const previewDisabled = isPreviewing;

  return (
    <div className="app-shell">
      <div className="left-pane">
        <div className="brand-row">
          <div>
            <p className="eyebrow">Recruiter Mailer</p>
            <div className="brand">Compose and control</div>
          </div>
          <div className="brand-actions">
            <button className="chip" onClick={() => setHistoryOpen(true)}>History</button>
            <button className={`chip ${isAuthed ? 'chip-ok' : 'chip-warn'}`} onClick={connectGmail}>
              <span className={`dot ${isAuthed ? 'ok' : 'warn'}`} />
              {isAuthed ? 'Gmail linked' : 'Connect Gmail'}
            </button>
          </div>
        </div>

        <div className="sections">
          <div className="section">
            <p className="section-title">Sender</p>
            <input
              className="input-underline"
              value={senderName}
              onChange={e => {
                setSenderName(e.target.value);
              }}
              placeholder="Uses your Gmail name by default"
            />
            <div className="helper">Optional display name override.</div>
            {errors.sender ? <div className="error-text">{errors.sender}</div> : null}
          </div>

          <div className="section">
            <div className="section-title-row">
              <h3 className="section-title">Recipients</h3>
              <div className="tabs">
                <button
                  className={recipientTab === 'enter' ? 'active' : ''}
                  onClick={() => setRecipientTab('enter')}
                >
                  Enter Emails
                </button>
                <button
                  className={recipientTab === 'bulk' ? 'active' : ''}
                  onClick={() => setRecipientTab('bulk')}
                >
                  Paste in Bulk
                </button>
              </div>
            </div>

            {recipientTab === 'enter' ? (
              <>
                <div className="helper">One email per row.</div>
                <RecipientList
                  recipients={recipients}
                  onChange={updateRecipient}
                  onDelete={deleteRecipient}
                  onEmailBlur={handleEmailBlur}
                  fieldErrors={errors.recipients}
                />
                <button className="text-button" onClick={addRecipientRow}>+ Add recipient</button>
              </>
            ) : (
              <EmailInput
                value={bulkInput}
                onChange={setBulkInput}
                onPaste={handleBulkPaste}
                error={errors.recipientsGeneral}
              />
            )}

            {errors.recipientsGeneral ? <div className="error-text">{errors.recipientsGeneral}</div> : null}
            {pendingGroupExtras > 0 ? (
              <div className="status-banner info" style={{ position: 'static', boxShadow: 'none', marginTop: 8 }}>
                <span>You added {pendingGroupExtras} new recipients. Add them to this group?</span>
                <button className="text-button" onClick={updateImportedGroup}>Update Group</button>
              </div>
            ) : null}
          </div>

          <div className="section">
            <p className="section-title">Groups</p>
            <div className="chip-toggle">
              <button className="chip" onClick={startCreateGroup}>Create Group</button>
              <button className="chip" onClick={openImportGroups}>Import Group</button>
            </div>
          </div>

          <div className="section">
            <p className="section-title">Delivery</p>
            <div className="chip-toggle">
              <button
                className={`chip ${deliveryMode === 'now' ? 'active' : ''}`}
                onClick={() => {
                  setDeliveryMode('now');
                  if (errors.scheduledAt) {
                    setErrors(prev => ({ ...prev, scheduledAt: undefined }));
                  }
                }}
              >
                Send now
              </button>
              <button
                className={`chip ${deliveryMode === 'schedule' ? 'active' : ''}`}
                onClick={() => setDeliveryMode('schedule')}
              >
                Schedule
              </button>
            </div>
            {deliveryMode === 'schedule' ? (
              <input
                className="input-underline"
                type="datetime-local"
                value={scheduledAt}
                onChange={e => {
                  handleScheduledChange(e.target.value);
                }}
              />
            ) : null}
            {errors.scheduledAt ? <div className="error-text">{errors.scheduledAt}</div> : null}
          </div>

          <div className="section">
            <p className="section-title">Send type</p>
            <div className="radio-chips">
              <label className={`chip ${sendMode === 'individual' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="sendMode"
                  value="individual"
                  checked={sendMode === 'individual'}
                  onChange={() => setSendMode('individual')}
                />
                <span>Send individually</span>
              </label>
              <label className={`chip ${sendMode === 'single' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="sendMode"
                  value="single"
                  checked={sendMode === 'single'}
                  onChange={() => setSendMode('single')}
                />
                <span>Send as single email</span>
              </label>
            </div>
            <div className="helper">Individual sends support {'{{name}}'} personalization</div>
          </div>
        </div>
      </div>

      <div className="right-panel">
        <div className="content-wrapper">
          <div className="composer-shell">
            <div className="composer-header" style={{ alignItems: 'center' }}>
              <div>
                <p className="eyebrow">Templates</p>
                <span className="helper">Save or reuse subject + body</span>
              </div>
              <div className="chip-toggle">
                <button className="chip" onClick={() => setTemplateTitlePrompt(true)}>Save as Template</button>
                <button className="chip" onClick={openTemplateImport}>Import Template</button>
              </div>
            </div>

            <Editor
              subject={subject}
              setSubject={handleSubjectChange}
              body={body}
              setBody={handleBodyChange}
              subjectError={errors.subject}
              bodyError={errors.body}
            />
            <div className="button-row" style={{ justifyContent: 'flex-end' }}>
              <button className="primary" onClick={handlePreviewContinue} disabled={previewDisabled}>
                {previewButtonLabel}
              </button>
            </div>
            {saving ? <div className="helper saving-hint">Saving…</div> : null}
          </div>
        </div>
      </div>

      <StatusBanner notice={notice} onClose={() => setNotice(null)} />

      <SlidePanel open={previewOpen} title="Preview" onClose={() => setPreviewOpen(false)}>
        {previewRecipientMeta ? (
          <div className="panel-row" style={{ gridTemplateColumns: '1fr auto auto' }}>
            <div>
              <div className="section-title">{previewRecipientMeta.name}</div>
              <div className="helper">{previewRecipientMeta.company} • {previewRecipientMeta.email}</div>
            </div>
            <button
              className="text-button"
              onClick={() => {
                if (!recipients.length) return;
                const next = recipients[Math.floor(Math.random() * recipients.length)];
                if (next?._id) fetchPreview(next._id);
              }}
            >
              Shuffle recipient
            </button>
            <button className="text-button" onClick={() => fetchPreview(previewRecipientMeta._id)} disabled={isPreviewing}>
              Refresh
            </button>
          </div>
        ) : null}
        <div className="preview-frame" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        <div className="button-row" style={{ marginTop: 12 }}>
          <button className="ghost" onClick={() => setPreviewOpen(false)}>Cancel</button>
          <button className="primary" onClick={confirmAndSend} disabled={isSending}>
            {isSending ? 'Sending…' : 'Confirm & Send'}
          </button>
        </div>
      </SlidePanel>

      <SlidePanel open={historyOpen} title="History" onClose={() => setHistoryOpen(false)} width="50vw">
        <div className="history-list">
          {history.map(item => (
            <button key={item.id} className="history-row" onClick={() => loadCampaign(item.id)}>
              <div className="history-left">
                <div className="subject-line">{item.subject}</div>
                <div className="helper">{new Date(item.created_at).toLocaleString()}</div>
              </div>
              <div className="history-meta">
                <span className={`status-pill ${item.status}`}>{item.status}</span>
                <span className="helper">{item.recipient_count} recipients</span>
              </div>
            </button>
          ))}
          {!history.length && <div className="helper">No campaigns yet.</div>}
        </div>
      </SlidePanel>

      <Modal open={groupModalOpen} title="Create Group" onClose={() => setGroupModalOpen(false)} width={540}>
        <div className="section">
          <input
            className="input-underline"
            placeholder="Group title"
            value={groupTitle}
            onChange={e => setGroupTitle(e.target.value)}
          />
          {groupErrors.title ? <div className="error-text">{groupErrors.title}</div> : null}
        </div>
        <RecipientList
          recipients={groupRecipients}
          onChange={(idx, field, value) => {
            setGroupRecipients(prev => {
              const next = [...prev];
              const current = next[idx] || {};
              next[idx] = { ...current, [field]: value, _id: current._id || uid() };
              return next;
            });
          }}
          onDelete={idx => setGroupRecipients(prev => prev.filter((_, i) => i !== idx))}
          onEmailBlur={idx => {
            setGroupRecipients(prev => {
              const next = [...prev];
              const rec = next[idx];
              if (!rec) return prev;
              if (emailRegex.test(rec.email || '')) {
                next[idx] = {
                  ...rec,
                  name: rec.name?.trim() ? rec.name : extractName(rec.email),
                  company: rec.company?.trim() ? rec.company : extractCompany(rec.email),
                };
              }
              return next;
            });
          }}
          fieldErrors={groupErrors.recipients}
        />
        <button className="text-button" onClick={() => setGroupRecipients(prev => [...prev, { _id: uid(), email: '', name: '', company: '' }])}>+ Add recipient</button>
        {groupErrors.general ? <div className="error-text">{groupErrors.general}</div> : null}
        <div className="buttons" style={{ justifyContent: 'flex-end' }}>
          <button className="primary" onClick={saveGroup}>Save Group</button>
        </div>
      </Modal>

      <Modal open={groupImportOpen} title="Import Group" onClose={() => { setGroupImportOpen(false); setGroupToConfirm(null); }} width={520}>
        <div className="history-list">
          {groups.map(group => (
            <button key={group.id} className="history-row" onClick={() => confirmGroupImport(group)}>
              <div className="history-left">
                <div className="subject-line">{group.title}</div>
                <div className="helper">{group.recipients.length} recipients</div>
              </div>
              <div className="history-meta">
                <span className="helper">Updated {new Date(group.updatedAt).toLocaleString()}</span>
              </div>
            </button>
          ))}
          {!groups.length && <div className="helper">No groups yet.</div>}
        </div>
        {groupToConfirm ? (
          <div className="status-banner info" style={{ position: 'static', boxShadow: 'none', marginTop: 10 }}>
            <span>Importing this group will reset current recipients. Continue?</span>
            <button className="primary" onClick={applyGroupImport}>Yes, import</button>
          </div>
        ) : null}
      </Modal>

      <Modal open={templateTitlePrompt} title="Save as Template" onClose={() => setTemplateTitlePrompt(false)} width={420}>
        <div className="section">
          <input
            className="input-underline"
            placeholder="Template title"
            value={templateTitle}
            onChange={e => setTemplateTitle(e.target.value)}
          />
        </div>
        <div className="buttons" style={{ justifyContent: 'flex-end' }}>
          <button className="primary" onClick={saveTemplate}>Save</button>
        </div>
      </Modal>

      <Modal open={templateImportOpen} title="Import Template" onClose={() => { setTemplateImportOpen(false); setTemplateToConfirm(null); }} width={520}>
        <div className="history-list">
          {templates.map(t => (
            <button key={t.id} className="history-row" onClick={() => confirmTemplateImport(t)}>
              <div className="history-left">
                <div className="subject-line">{t.title}</div>
                <div className="helper">Last updated {new Date(t.updatedAt).toLocaleString()}</div>
              </div>
            </button>
          ))}
          {!templates.length && <div className="helper">No templates saved yet.</div>}
        </div>
        {templateToConfirm ? (
          <div className="status-banner info" style={{ position: 'static', boxShadow: 'none', marginTop: 10 }}>
            <span>Importing this template will overwrite subject and body. Continue?</span>
            <button className="primary" onClick={applyTemplateImport}>Yes, import</button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
