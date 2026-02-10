import React from 'react';

export default function Preview({ html }) {
  return (
    <section className="panel preview">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Step 4</p>
          <h2>Preview</h2>
        </div>
      </div>
      {html ? (
        <div className="preview-frame" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="muted">Generate a preview to see the rendered email.</p>
      )}
    </section>
  );
}
