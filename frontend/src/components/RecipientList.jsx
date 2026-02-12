import React from 'react';

export default function RecipientList({ recipients, onChange, onDelete, onEmailBlur, fieldErrors }) {
  if (!recipients.length) {
    return (
      <div className="section muted empty-line">Recipients will appear here after parsing.</div>
    );
  }

  return (
    <div className="recipient-list">
      {recipients.map((r, idx) => {
        const errs = fieldErrors?.[r._id] || {};
        return (
          <div className="recipient-row" key={r._id || r.email}>
            <div className="field">
              <input
                className="input-underline"
                value={r.email}
                placeholder="email@example.com"
                onChange={e => onChange(idx, 'email', e.target.value)}
                onBlur={() => onEmailBlur(idx)}
              />
              {errs.email ? <div className="error-text">{errs.email}</div> : null}
            </div>
            <div className="field">
              <input
                className="input-underline"
                value={r.name}
                placeholder="Name"
                onChange={e => onChange(idx, 'name', e.target.value)}
              />
              {errs.name ? <div className="error-text">{errs.name}</div> : null}
            </div>
            <div className="field">
              <input
                className="input-underline"
                value={r.company || ''}
                placeholder="Company"
                onChange={e => onChange(idx, 'company', e.target.value)}
              />
              {errs.company ? <div className="error-text">{errs.company}</div> : null}
            </div>
            <button className="icon-button" onClick={() => onDelete(idx)} title="Remove">
              <span aria-hidden>✕</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
