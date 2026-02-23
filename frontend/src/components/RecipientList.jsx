import React from 'react';

export default function RecipientList({ recipients, variables = [], onChangeField, onChangeVariable, onDelete, onEmailBlur, fieldErrors }) {
  if (!recipients.length) {
    return <p className="muted" style={{ padding: '8px 0' }}>No recipients added yet.</p>;
  }

  return (
    <div className="recipient-list">
      {recipients.map((r, idx) => {
        const errs = fieldErrors?.[r._id] || {};
        return (
          <div className="recipient-row" key={r._id || r.email}>
            <div className="field">
              <input
                className="inp"
                value={r.email}
                placeholder="email@example.com"
                onChange={e => onChangeField(idx, 'email', e.target.value)}
                onBlur={() => onEmailBlur(idx)}
              />
              {errs.email && <small className="err">{errs.email}</small>}
            </div>
            <div className="field">
              <input
                className="inp"
                value={r.name}
                placeholder="Name"
                onChange={e => onChangeField(idx, 'name', e.target.value)}
              />
              {errs.name && <small className="err">{errs.name}</small>}
            </div>
            {variables.map(v => (
              <div className="field" key={`${r._id}-${v.key}`}>
                <input
                  className="inp"
                  value={r.variables?.[v.key] || ''}
                  placeholder={v.label || v.key}
                  onChange={e => onChangeVariable(idx, v.key, e.target.value)}
                />
                {errs[v.key] && <small className="err">{errs[v.key]}</small>}
              </div>
            ))}
            <button className="btn-icon" onClick={() => onDelete(idx)} title="Remove">✕</button>
          </div>
        );
      })}
    </div>
  );
}
