import React, { useRef, useEffect } from 'react';

const CHIPS_NO_CONTEXT = [
  'Sequence diagram for a REST API login flow',
  'Class diagram for a simple web app',
  'Architecture diagram',
  'Flow chart',
  'Gantt chart'
];

const CHIPS_WITH_CONTEXT = [
  'Class diagram from code',
  'Inheritance hierarchy',
  'Component dependencies',
  'Full architecture overview'
];

export default function MessageInput({ onSend, disabled, codeContextLoaded, prefillMessage, onPrefillConsumed }) {
  const [text, setTextState] = React.useState('');
  const textRef = useRef('');

  function setText(v) {
    setTextState(v);
    textRef.current = v;
  }

  useEffect(() => {
    if (prefillMessage) {
      setText(prefillMessage);
      onPrefillConsumed?.();
    }
  }, [prefillMessage]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const msg = textRef.current.trim();
    if (!msg || disabled) return;
    onSend(msg);
    setText('');
  }

  const chips = codeContextLoaded ? CHIPS_WITH_CONTEXT : CHIPS_NO_CONTEXT;

  return (
    <div style={{ borderTop: '1px solid #1e2433', padding: '12px 16px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {chips.map((chip, i) => (
          <button
            key={i}
            onClick={() => onSend(chip)}
            disabled={disabled}
            style={{
              padding: '4px 10px',
              background: '#1a2035',
              border: '1px solid #2d3748',
              borderRadius: 12,
              color: '#a0aec0',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: 11,
              transition: 'border-color 0.15s'
            }}
          >
            {chip}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? 'Generating…' : 'Ask for a diagram… (Enter to send, Shift+Enter for newline)'}
          rows={2}
          style={{
            flex: 1,
            padding: '10px 12px',
            background: '#1a1f2e',
            border: '1px solid #2d3748',
            borderRadius: 8,
            color: '#e2e8f0',
            fontSize: 13,
            resize: 'none',
            outline: 'none',
            lineHeight: 1.5,
            fontFamily: 'inherit'
          }}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          style={{
            padding: '0 20px',
            background: (disabled || !text.trim()) ? '#2d3748' : '#4299e1',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            cursor: (disabled || !text.trim()) ? 'not-allowed' : 'pointer',
            fontSize: 18,
            fontWeight: 700,
            transition: 'background 0.15s'
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
