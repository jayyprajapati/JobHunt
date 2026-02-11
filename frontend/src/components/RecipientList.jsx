import React from 'react';

export default function RecipientList({ recipients, onChange, onDelete }) {
  if (!recipients.length) {
    return (
      <div className="section muted empty-line">Recipients will appear here after parsing.</div>
    );
  }

  return (
    <div className="recipient-list">
      {recipients.map((r, idx) => (
        <div className="recipient-row" key={r._id || r.email}>
          <div className="pill-text">{r.email}</div>
          <input
            className="input-underline"
            value={r.name}
            onChange={e => onChange(idx, 'name', e.target.value)}
          />
          <button className="icon-button" onClick={() => onDelete(idx)} title="Remove">
            <span aria-hidden>✕</span>
          </button>
        </div>
      ))}
    </div>
  );
}
