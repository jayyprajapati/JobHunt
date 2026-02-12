import React from 'react';
import ReactQuill from 'react-quill';

const modules = {
  toolbar: [
    ['bold', 'italic', 'underline'],
    [{ header: [2, 3, false] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link'],
  ],
};

export default function Editor({ subject, setSubject, body, setBody, subjectError, bodyError }) {
  return (
    <div className="composer">
      <div className="composer-header">
        <p className="eyebrow">Compose</p>
        <span className="helper">Available variables: {'{{name}}'}</span>
      </div>

      <input
        className="subject-input"
        value={subject}
        onChange={e => setSubject(e.target.value)}
        placeholder="Subject"
      />
      {subjectError ? <div className="error-text">{subjectError}</div> : null}

      <div className="editor-container">
        <div className="editor-shell">
          <ReactQuill
            theme="snow"
            value={body}
            onChange={setBody}
            readOnly={false}
            modules={modules}
            placeholder="Write the email body"
          />
        </div>
      </div>
      {bodyError ? <div className="error-text">{bodyError}</div> : null}
    </div>
  );
}
