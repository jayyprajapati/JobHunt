import React from 'react';
import ReactQuill from 'react-quill';

export default function Editor({
  subject,
  setSubject,
  body,
  setBody,
  sendMode,
  setSendMode,
  scheduledAt,
  setScheduledAt,
  onConnect,
  isAuthed,
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Step 3</p>
          <h2>Compose</h2>
        </div>
        <button className="ghost" onClick={onConnect}>
          {isAuthed ? 'Reconnect Gmail' : 'Connect Gmail'}
        </button>
      </div>

      <label className="label">Subject</label>
      <input
        className="input"
        value={subject}
        onChange={e => setSubject(e.target.value)}
        placeholder="Role at Company"
      />

      <div className="mode-row">
        <label className="label">Send mode</label>
        <div className="mode-options">
          <label className={`chip ${sendMode === 'individual' ? 'active' : ''}`}>
            <input
              type="radio"
              name="sendMode"
              value="individual"
              checked={sendMode === 'individual'}
              onChange={() => setSendMode('individual')}
            />
            Send individually
          </label>
          <label className={`chip ${sendMode === 'single' ? 'active' : ''}`}>
            <input
              type="radio"
              name="sendMode"
              value="single"
              checked={sendMode === 'single'}
              onChange={() => setSendMode('single')}
            />
            Send as one email
          </label>
        </div>
      </div>

      <label className="label">Schedule (optional)</label>
      <input
        className="input"
        type="datetime-local"
        value={scheduledAt}
        onChange={e => setScheduledAt(e.target.value)}
      />

      <label className="label">Body (supports {{name}})</label>
      <div className="editor">
        <ReactQuill theme="snow" value={body} onChange={setBody} />
      </div>
    </section>
  );
}
