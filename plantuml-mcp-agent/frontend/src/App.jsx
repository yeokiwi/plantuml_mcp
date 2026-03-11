import React, { useState, useCallback, useRef } from 'react';

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
import ChatWindow from './components/ChatWindow.jsx';
import MessageInput from './components/MessageInput.jsx';
import DiagramViewer from './components/DiagramViewer.jsx';
import CodeContextPanel from './components/CodeContextPanel.jsx';
import { streamChat } from './api/chat.js';

const SESSION_ID = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;

const THEMES = ['default', 'blueprint', 'cerulean', 'materia', 'minty', 'superhero', 'sketchy'];

export default function App() {
  const [messages, setMessages] = useState([]);
  const [diagrams, setDiagrams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [codeContextLoaded, setCodeContextLoaded] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [selectedTheme, setSelectedTheme] = useState('default');
  const [prefillMessage, setPrefillMessage] = useState('');
  const abortRef = useRef(null);

  const appendMessage = useCallback((msg) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === msg.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...msg };
        return updated;
      }
      return [...prev, msg];
    });
  }, []);

  async function handleSend(text) {
    if (loading || !text.trim()) return;

    const userMsg = { id: uuidv4(), role: 'user', content: text };
    const assistantMsgId = uuidv4();

    setMessages(prev => [...prev, userMsg, {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      streaming: true
    }]);
    setLoading(true);

    // Build history for API (strip UI-only fields)
    const history = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content
    }));

    let accContent = '';
    let latestDiagram = null;

    const abort = streamChat({
      messages: history,
      sessionId: SESSION_ID,
      codeContextLoaded,
      onToken: (content) => {
        accContent += content;
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, content: accContent } : m
        ));
      },
      onDiagram: (diagramData) => {
        latestDiagram = { ...diagramData, id: uuidv4(), timestamp: Date.now() };
        setDiagrams(prev => [...prev, latestDiagram]);
        setRightPanelOpen(true);
        // Attach diagram to current assistant message
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, diagram: latestDiagram } : m
        ));
      },
      onError: (errMsg) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, streaming: false, error: errMsg, content: m.content || 'An error occurred.' }
            : m
        ));
        setLoading(false);
      },
      onDone: () => {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, streaming: false } : m
        ));
        setLoading(false);
      }
    });

    abortRef.current = abort;
  }

  function handleContextLoaded(parseResult) {
    setCodeContextLoaded(true);
  }

  function handleContextCleared() {
    setCodeContextLoaded(false);
  }

  function handleSuggestedDiagram(text) {
    setPrefillMessage(text);
  }

  const panelStyle = (open, minWidth = 260, maxWidth = 320) => ({
    width: open ? `${minWidth}px` : '36px',
    minWidth: open ? `${minWidth}px` : '36px',
    maxWidth: open ? `${maxWidth}px` : '36px',
    transition: 'width 0.2s ease, min-width 0.2s ease',
    overflow: 'hidden',
    background: '#111827',
    borderRight: '1px solid #1e2433',
    display: 'flex',
    flexDirection: 'column'
  });

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#0f1117' }}>
      {/* Left Panel — Code Context */}
      <div style={panelStyle(leftPanelOpen)}>
        <div style={{
          display: 'flex', alignItems: 'center', padding: '10px 8px',
          borderBottom: '1px solid #1e2433', flexShrink: 0
        }}>
          <button
            onClick={() => setLeftPanelOpen(o => !o)}
            style={{ background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 16, padding: 0, width: 20, height: 20 }}
            title={leftPanelOpen ? 'Collapse' : 'Expand code context'}
          >
            {leftPanelOpen ? '◀' : '▶'}
          </button>
          {leftPanelOpen && (
            <span style={{ marginLeft: 8, fontSize: 12, color: '#718096', fontWeight: 500, whiteSpace: 'nowrap' }}>
              Code Context
            </span>
          )}
        </div>
        {leftPanelOpen && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <CodeContextPanel
              sessionId={SESSION_ID}
              onContextLoaded={handleContextLoaded}
              onContextCleared={handleContextCleared}
              onSuggestedDiagram={handleSuggestedDiagram}
            />
          </div>
        )}
      </div>

      {/* Centre — Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '8px 16px',
          borderBottom: '1px solid #1e2433', gap: 12, background: '#111827', flexShrink: 0
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>PlantUML MCP Agent</span>
          {codeContextLoaded && (
            <span style={{
              padding: '2px 8px', background: '#1c4532', border: '1px solid #276749',
              borderRadius: 10, fontSize: 10, color: '#68d391', fontWeight: 600
            }}>
              📁 Code Context Active
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 11, color: '#718096' }}>Theme</label>
            <select
              value={selectedTheme}
              onChange={e => setSelectedTheme(e.target.value)}
              style={{
                background: '#1a1f2e', border: '1px solid #2d3748', borderRadius: 4,
                color: '#a0aec0', fontSize: 11, padding: '3px 6px', outline: 'none'
              }}
            >
              {THEMES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <ChatWindow messages={messages} codeContextLoaded={codeContextLoaded} />
        <MessageInput
          onSend={handleSend}
          disabled={loading}
          codeContextLoaded={codeContextLoaded}
          prefillMessage={prefillMessage}
          onPrefillConsumed={() => setPrefillMessage('')}
        />
      </div>

      {/* Right Panel — Diagram Gallery */}
      <div style={{ ...panelStyle(rightPanelOpen, 280, 380), borderRight: 'none', borderLeft: '1px solid #1e2433' }}>
        <div style={{
          display: 'flex', alignItems: 'center', padding: '10px 8px',
          borderBottom: '1px solid #1e2433', flexShrink: 0
        }}>
          <button
            onClick={() => setRightPanelOpen(o => !o)}
            style={{ background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 16, padding: 0, width: 20, height: 20 }}
            title={rightPanelOpen ? 'Collapse gallery' : 'Expand gallery'}
          >
            {rightPanelOpen ? '▶' : '◀'}
          </button>
          {rightPanelOpen && (
            <span style={{ marginLeft: 8, fontSize: 12, color: '#718096', fontWeight: 500, whiteSpace: 'nowrap' }}>
              Diagram Gallery
            </span>
          )}
          {!rightPanelOpen && diagrams.length > 0 && (
            <span style={{ marginTop: 4, display: 'block', fontSize: 10, color: '#4299e1', textAlign: 'center', width: '100%' }}>
              {diagrams.length}
            </span>
          )}
        </div>
        {rightPanelOpen && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <DiagramViewer diagrams={diagrams} />
          </div>
        )}
      </div>
    </div>
  );
}
