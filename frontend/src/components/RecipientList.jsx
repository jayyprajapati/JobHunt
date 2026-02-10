import React from 'react';

export default function RecipientList({ recipients, onChange }) {
  if (!recipients.length) {
    return (
      <section className="panel empty">
        <p className="eyebrow">Step 2</p>
        <p className="muted">Recipients will appear here after parsing.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Step 2</p>
          <h2>Check names</h2>
        </div>
        <span className="pill">{recipients.length} total</span>
      </div>
      <div className="recipient-grid">
        {recipients.map((r, idx) => (
          <div className="recipient-row" key={r.email + idx}>
            <input
              className="input"
              value={r.email}
              onChange={e => onChange(idx, 'email', e.target.value)}
            />
            <input
              className="input"
              value={r.name}
              onChange={e => onChange(idx, 'name', e.target.value)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
