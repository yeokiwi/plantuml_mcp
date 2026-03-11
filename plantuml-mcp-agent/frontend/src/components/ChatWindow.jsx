import React, { useEffect, useRef } from 'react';

function Message({ msg, codeContextLoaded }) {
  const isUser = msg.role === 'user';
  const isAssistant = msg.role === 'assistant';

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 12,
      gap: 8
    }}>
      {isAssistant && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', background: '#2d3748',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, flexShrink: 0, marginTop: 2
        }}>
          🤖
        </div>
      )}

      <div style={{ maxWidth: '75%', minWidth: 60 }}>
        {isUser && codeContextLoaded && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 3 }}>
            <span style={{
              fontSize: 10, padding: '2px 6px',
              background: '#1a365d', borderRadius: 8, color: '#90cdf4'
            }}>
              📁 Code context active
            </span>
          </div>
        )}

        <div style={{
          padding: '10px 14px',
          background: isUser ? '#2c5282' : '#1a2035',
          borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
          color: '#e2e8f0',
          fontSize: 13,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}>
          {msg.content}

          {msg.diagram && (
            <div style={{ marginTop: 10 }}>
              {msg.diagram.format === 'svg' ? (
                <div
                  dangerouslySetInnerHTML={{ __html: atob(msg.diagram.data) }}
                  style={{ maxWidth: '100%', background: '#fff', borderRadius: 6, padding: 8 }}
                />
              ) : (
                <img
                  src={`data:${msg.diagram.mimeType};base64,${msg.diagram.data}`}
                  alt="Generated diagram"
                  style={{ maxWidth: '100%', borderRadius: 6 }}
                />
              )}
            </div>
          )}

          {msg.error && (
            <div style={{
              marginTop: 8, padding: '8px 10px',
              background: '#742a2a', borderRadius: 6,
              fontSize: 12, color: '#fc8181'
            }}>
              ⚠️ {msg.error}
            </div>
          )}
        </div>

        {msg.streaming && (
          <div style={{ display: 'flex', gap: 3, marginTop: 6, marginLeft: 4 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 5, height: 5, borderRadius: '50%', background: '#4299e1',
                animation: 'blink 1.2s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`
              }} />
            ))}
            <style>{`@keyframes blink { 0%,80%,100%{opacity:0.3} 40%{opacity:1} }`}</style>
          </div>
        )}
      </div>

      {isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', background: '#2c5282',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, flexShrink: 0, marginTop: 2
        }}>
          👤
        </div>
      )}
    </div>
  );
}

export default function ChatWindow({ messages, codeContextLoaded }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5568', textAlign: 'center', padding: 32 }}>
        <div>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🌿</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#718096', marginBottom: 8 }}>PlantUML MCP Agent</div>
          <div style={{ fontSize: 13, color: '#4a5568', maxWidth: 300 }}>
            Ask me to generate any PlantUML diagram in natural language.
            {codeContextLoaded && ' Code context is active — I can generate diagrams from your source files.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
      {messages.map(msg => (
        <Message key={msg.id} msg={msg} codeContextLoaded={codeContextLoaded} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
