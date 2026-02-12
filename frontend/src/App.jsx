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
  const [rawInput, setRawInput] = useState('');
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
  const [errors, setErrors] = useState({});
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
    const shouldSave = subject.trim() && stripHtml(body) && recipients.length;
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

  async function handleParse() {
    const res = await fetch(`${API_BASE}/api/recipients/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawInput }),
    });
    const data = await res.json();
    const withIds = (data || []).map(r => ({ ...r, _id: uid() }));
    setRecipients(withIds);
    if (withIds.length) setPreviewRecipientId(withIds[0]._id);
  }

  function updateRecipient(idx, field, value) {
    setRecipients(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  function deleteRecipient(idx) {
    setRecipients(prev => prev.filter((_, i) => i !== idx));
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

  function validateForm() {
    const nextErrors = {};

    if (!subject.trim()) {
      nextErrors.subject = 'Subject is required';
    }

    const bodyText = stripHtml(body);
    if (!bodyText) {
      nextErrors.body = 'Email body cannot be empty';
    }

    if (!recipients.length) {
      nextErrors.recipients = 'At least one valid recipient is required';
    } else if (recipients.some(r => !emailRegex.test(r.email))) {
      nextErrors.recipients = 'At least one valid recipient is required';
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
    if (Object.keys(validationErrors).length) {
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
      setErrors({});
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
      setErrors({});
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
            <EmailInput
              rawInput={rawInput}
              onChange={value => {
                setRawInput(value);
              }}
              onParse={handleParse}
              parsedCount={recipients.length}
              error={errors.recipients}
            />
            <RecipientList recipients={recipients} onChange={updateRecipient} onDelete={deleteRecipient} />
          </div>

          <div className="section">
            <p className="section-title">Delivery</p>
            <div className="chip-toggle">
              <button
                className={`chip ${deliveryMode === 'now' ? 'active' : ''}`}
                onClick={() => {
                  setDeliveryMode('now');
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
                  setScheduledAt(e.target.value);
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
              setSubject={value => {
                setSubject(value);
              }}
              body={body}
              setBody={value => {
                setBody(value);
              }}
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
