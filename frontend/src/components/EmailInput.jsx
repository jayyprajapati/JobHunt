import React from 'react';

export default function EmailInput({ rawInput, onChange, onParse, parsedCount }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Step 1</p>
          <h2>Paste recruiter emails</h2>
        </div>
        <button className="ghost" onClick={onParse}>
          Parse
        </button>
      </div>
      <textarea
        className="input area"
        rows={5}
        placeholder="john@acme.com, jane.doe@startup.io, ..."
        value={rawInput}
        onChange={e => onChange(e.target.value)}
      />
      <div className="hint">
        {parsedCount ? `${parsedCount} recipient${parsedCount === 1 ? '' : 's'} found` : 'Newlines, commas, or spaces all work'}
      </div>
    </section>
  );
}
