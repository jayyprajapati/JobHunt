import React, { useEffect, useRef, useState } from 'react';
import ReactQuill from 'react-quill';

const modules = {
  toolbar: [
    ['bold', 'italic', 'underline'],
    [{ header: [2, 3, false] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link'],
  ],
};

const VARIABLE_OPTIONS = ['name'];

export default function Editor({ subject, setSubject, body, setBody, subjectError, bodyError, hideSubject }) {
  const quillRef = useRef(null);
  const [slashMenu, setSlashMenu] = useState({ open: false, top: 0, left: 0 });
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [triggerIndex, setTriggerIndex] = useState(null);

  useEffect(() => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return undefined;

    const handleKeyDown = e => {
      if (slashMenu.open) {
        if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
          e.preventDefault();
        }
        if (e.key === 'ArrowDown') {
          setHighlightIndex(prev => (prev + 1) % VARIABLE_OPTIONS.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          setHighlightIndex(prev => (prev - 1 + VARIABLE_OPTIONS.length) % VARIABLE_OPTIONS.length);
          return;
        }
        if (e.key === 'Enter') {
          insertToken(VARIABLE_OPTIONS[highlightIndex]);
          return;
        }
        if (e.key === 'Escape') {
          closeSlashMenu();
          return;
        }
      }

      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const sel = quill.getSelection(true);
        if (!sel) return;
        const bounds = quill.getBounds(sel.index);
        setSlashMenu({ open: true, left: bounds.left, top: bounds.top + bounds.height });
        setTriggerIndex(sel.index);
        setHighlightIndex(0);
      }
    };

    quill.root.addEventListener('keydown', handleKeyDown);
    return () => quill.root.removeEventListener('keydown', handleKeyDown);
  }, [slashMenu.open, highlightIndex]);

  function closeSlashMenu() {
    setSlashMenu({ open: false, top: 0, left: 0 });
    setTriggerIndex(null);
  }

  function insertToken(key) {
    const quill = quillRef.current?.getEditor();
    if (!quill || triggerIndex === null) return;
    const token = `{{${key}}}`;
    quill.deleteText(triggerIndex, 1);
    quill.insertText(triggerIndex, token);
    quill.setSelection(triggerIndex + token.length, 0);
    closeSlashMenu();
  }

  return (
    <div className="composer">
      <div className="composer-header">
        <span className="helper-white">Variables: {'{{name}}'} — type / in body</span>
      </div>

      {!hideSubject && (
        <>
          <input
            className="subject-input"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Subject"
          />
          {subjectError ? <div className="error-text">{subjectError}</div> : null}
        </>
      )}

      <div className="editor-container">
        <div className="editor-shell">
          <ReactQuill
            ref={quillRef}
            theme="snow"
            value={body}
            onChange={setBody}
            readOnly={false}
            modules={modules}
            placeholder="Write the email body"
          />
          {slashMenu.open ? (
            <div
              className="slash-menu"
              style={{ top: slashMenu.top + 12, left: slashMenu.left + 12 }}
            >
              {VARIABLE_OPTIONS.map((opt, idx) => (
                <button
                  key={opt}
                  className={idx === highlightIndex ? 'active' : ''}
                  onMouseDown={e => {
                    e.preventDefault();
                    insertToken(opt);
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {bodyError ? <div className="error-text" style={{ color: '#ffb3b3' }}>{bodyError}</div> : null}
    </div>
  );
}
