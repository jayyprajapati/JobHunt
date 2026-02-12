import React from 'react';

export default function EmailInput({ rawInput, onChange, onParse, parsedCount, error }) {
  return (
    <div className="section">
      <p className="eyebrow">Recipients</p>
      <div className="section-title-row">
        <h3 className="section-title">Paste, review, personalize</h3>
        <button className="text-button" onClick={onParse}>Parse</button>
      </div>
      <textarea
        className="textarea-underline"
        rows={5}
        placeholder="Paste email addresses here (comma or newline separated)"
        value={rawInput}
        onChange={e => onChange(e.target.value)}
      />
      <div className="helper">
        {parsedCount ? `${parsedCount} recipient${parsedCount === 1 ? '' : 's'} found` : 'Newlines, commas, or spaces all work'}
      </div>
      {error ? <div className="error-text">{error}</div> : null}
    </div>
  );
}
