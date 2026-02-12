import React from 'react';

export default function EmailInput({ value, onChange, onPaste, error }) {
  return (
    <div className="section">
      <textarea
        className="textarea-underline"
        rows={6}
        placeholder="Paste emails separated by comma or newline"
        value={value}
        onChange={e => onChange(e.target.value)}
        onPaste={e => {
          const text = e.clipboardData?.getData('text') || '';
          e.preventDefault();
          onPaste(text);
        }}
      />
      <div className="helper">Paste to auto-parse into structured rows.</div>
      {error ? <div className="error-text">{error}</div> : null}
    </div>
  );
}
