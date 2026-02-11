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

export default function Editor({ subject, setSubject, body, setBody }) {
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

      <div className="editor-shell">
        <ReactQuill
          theme="bubble"
          value={body}
          onChange={setBody}
          modules={modules}
          placeholder="Write the email body"
        />
      </div>
    </div>
  );
}
