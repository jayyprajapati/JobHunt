import React, { useEffect, useState } from 'react';
import EmailInput from './components/EmailInput.jsx';
import RecipientList from './components/RecipientList.jsx';
import Editor from './components/Editor.jsx';
import Preview from './components/Preview.jsx';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

export default function App() {
  const [rawInput, setRawInput] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sendMode, setSendMode] = useState('individual');
  const [scheduledAt, setScheduledAt] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    refreshAuth();
  }, []);

  const refreshAuth = async () => 
    fetch(`${API_BASE}/auth/status`)
      .then(r => r.json())
      .then(data => setIsAuthed(!!data.authenticated))
      .catch(() => setIsAuthed(false));

  async function handleParse() {
    setNotice('');
    const res = await fetch(`${API_BASE}/api/recipients/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawInput }),
    });
    const data = await res.json();
    setRecipients(data);
  }

  function updateRecipient(idx, field, value) {
    setRecipients(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  async function createCampaign() {
    let scheduleIso = null;
    if (scheduledAt) {
      const parsed = new Date(scheduledAt);
      if (!isNaN(parsed)) {
        scheduleIso = parsed.toISOString();
      }
    }
    const payload = {
      subject,
      body_html: body,
      send_mode: sendMode,
      recipients,
      scheduled_at: scheduleIso,
    };
    const res = await fetch(`${API_BASE}/api/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save campaign');
    }
    const data = await res.json();
    return data.id;
  }

  async function handlePreview() {
    setBusy(true);
    setNotice('');
    try {
      const id = await createCampaign();
      const res = await fetch(`${API_BASE}/api/campaigns/${id}/preview`, { method: 'POST' });
      const data = await res.json();
      setPreviewHtml(data.html || '');
      setNotice('Preview ready');
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSend() {
    setBusy(true);
    setNotice('');
    try {
      const id = await createCampaign();
      const res = await fetch(`${API_BASE}/api/campaigns/${id}/send`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      setNotice(data.status === 'scheduled' ? 'Scheduled. It will go out automatically.' : 'Sent!');
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  }

  function connectGmail() {
    window.location.href = `${API_BASE}/auth/google`;
  }

  const disabled = !recipients.length || !subject || !body || busy;

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Recruiter Mailer</p>
          <h1>Personalized Gmail blasts without the spreadsheet wrangling.</h1>
          <p className="muted">Paste addresses, fix names, write once, and fire off Gmail with {'{{name}}'} tokens.</p>
        </div>
        <div className="status">
          <span className={`dot ${isAuthed ? 'ok' : 'warn'}`} />
          {isAuthed ? 'Gmail linked' : 'Connect Gmail to send'}
        </div>
      </header>

      <main className="grid">
        <div className="stack">
          <EmailInput rawInput={rawInput} onChange={setRawInput} onParse={handleParse} parsedCount={recipients.length} />
          <RecipientList recipients={recipients} onChange={updateRecipient} />
          <Editor
            subject={subject}
            setSubject={setSubject}
            body={body}
            setBody={setBody}
            sendMode={sendMode}
            setSendMode={setSendMode}
            scheduledAt={scheduledAt}
            setScheduledAt={setScheduledAt}
            onConnect={connectGmail}
            isAuthed={isAuthed}
          />
        </div>
        <div className="stack">
          <div className="panel actions">
            <div className="buttons">
              <button className="ghost" onClick={handlePreview} disabled={disabled}>
                Preview
              </button>
              <button className="primary" onClick={handleSend} disabled={disabled}>
                {scheduledAt ? 'Schedule' : 'Send'}
              </button>
            </div>
            {notice ? <div className="notice">{notice}</div> : null}
          </div>
          <Preview html={previewHtml} />
        </div>
      </main>
    </div>
  );
}
