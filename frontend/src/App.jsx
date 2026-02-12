import React, { useEffect, useState } from 'react';
import EmailInput from './components/EmailInput.jsx';
import RecipientList from './components/RecipientList.jsx';
import Editor from './components/Editor.jsx';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
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

export default function App() {
  const [recipients, setRecipients] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sendMode, setSendMode] = useState('individual');
  const [deliveryMode, setDeliveryMode] = useState('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewRecipientId, setPreviewRecipientId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [senderName, setSenderName] = useState('');
  const [recipientTab, setRecipientTab] = useState('enter');
  const [bulkInput, setBulkInput] = useState('');
  const [errors, setErrors] = useState({ recipients: {} });
  const [showConfirm, setShowConfirm] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draftId, setDraftId] = useState(null);

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

  function handleBulkPaste(text) {
    const parsed = parseBulkRecipients(text);
    if (!parsed.length) return;
    setRecipients(parsed);
    setPreviewRecipientId(parsed[0]?._id || null);
    setRecipientTab('enter');
    setBulkInput('');
    setErrors(prev => ({ ...prev, recipients: {}, recipientsGeneral: undefined }));
  }

  function validateRecipientField(field, value) {
    if (field === 'email') return emailRegex.test(value || '');
    return !!(value && value.trim());
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
      recipients,
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

  function validateForm() {
    const nextErrors = { recipients: {} };

    if (!subject.trim()) {
      nextErrors.subject = 'Subject is required';
    }

    const bodyText = stripHtml(body);
    if (!bodyText) {
      nextErrors.body = 'Email body cannot be empty';
    }

    if (!recipients.length) {
      nextErrors.recipientsGeneral = 'At least one valid recipient is required';
    } else {
      recipients.forEach(rec => {
        const recErrors = {};
        if (!emailRegex.test(rec.email || '')) {
          recErrors.email = 'Invalid email format';
        }
        if (!rec.name || !rec.name.trim()) {
          recErrors.name = 'Name is required';
        }
        if (!rec.company || !rec.company.trim()) {
          recErrors.company = 'Company is required';
        }
        if (Object.keys(recErrors).length) {
          nextErrors.recipients[rec._id] = recErrors;
        }
      });
    }

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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_BASE}/api/campaigns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

  async function handlePreview() {
    setIsPreviewing(true);
    setNotice(null);
    try {
      const id = (await saveDraft()) || draftId;
      const targetId = previewRecipientId || (recipients[0]?.id || recipients[0]?._id);
      if (!id) throw new Error('Save a draft before previewing');
      const res = await fetch(`${API_BASE}/api/campaigns/${id}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: targetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      setPreviewHtml(data.html || '');
      setPreviewOpen(true);
      setNotice({ type: 'info', message: 'Preview ready' });
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleSend(confirmed = false) {
    setNotice(null);
    const validationErrors = validateForm();
    setErrors(validationErrors);
    if (hasValidationErrors(validationErrors)) {
      return;
    }

    if (recipients.length > 5 && !confirmed) {
      setShowConfirm(true);
      return;
    }
    setIsSending(true);
    try {
      const id = (await saveDraft()) || draftId;
      if (!id) throw new Error('Save a draft before sending');
      const res = await fetch(`${API_BASE}/api/campaigns/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      await loadHistory();
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setIsSending(false);
      setShowConfirm(false);
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

  const actionDisabled = isSending;
  const previewDisabled = isPreviewing || !recipients.length || !subject.trim() || !stripHtml(body);
  const actionLabel = deliveryMode === 'schedule' ? 'Schedule' : 'Send';

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
            <Editor
              subject={subject}
              setSubject={handleSubjectChange}
              body={body}
              setBody={handleBodyChange}
              subjectError={errors.subject}
              bodyError={errors.body}
            />
            <div className="button-row">
              <button className="ghost" onClick={handlePreview} disabled={previewDisabled}>
                {isPreviewing ? 'Working…' : 'Preview'}
              </button>
              <button className="primary" onClick={() => handleSend()} disabled={actionDisabled}>
                {isSending ? (deliveryMode === 'schedule' ? 'Scheduling…' : 'Sending…') : actionLabel}
              </button>
            </div>
            {saving ? <div className="helper saving-hint">Saving…</div> : null}
          </div>
        </div>
      </div>

      <StatusBanner notice={notice} onClose={() => setNotice(null)} />

      <SlidePanel open={previewOpen} title="Preview" onClose={() => setPreviewOpen(false)}>
        <div className="panel-row">
          <label className="helper">Preview as</label>
          <select
            className="input-underline"
            value={previewRecipientId || ''}
            onChange={e => setPreviewRecipientId(e.target.value)}
          >
            {recipients.map(r => (
              <option key={r._id} value={r._id}>
                {r.name} — {r.email}
              </option>
            ))}
          </select>
          <button className="text-button" onClick={handlePreview} disabled={!recipients.length}>
            Refresh
          </button>
        </div>
        <div className="preview-frame" dangerouslySetInnerHTML={{ __html: previewHtml }} />
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

      {showConfirm ? (
        <div className="modal-backdrop">
          <div className="modal">
            <p>You are about to send {recipients.length} emails. This action cannot be undone.</p>
            <div className="buttons">
              <button className="text-button" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="primary" onClick={() => handleSend(true)}>Confirm &amp; Send</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
