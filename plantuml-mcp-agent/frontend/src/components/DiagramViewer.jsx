import React, { useState } from 'react';

function DiagramCard({ diagram, index, onClick }) {
  const src = `data:${diagram.mimeType};base64,${diagram.data}`;
  const ts = new Date(diagram.timestamp).toLocaleTimeString();

  return (
    <div
      onClick={() => onClick(diagram)}
      style={{
        background: '#1a1f2e',
        border: '1px solid #2d3748',
        borderRadius: 8,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color 0.15s'
      }}
    >
      <div style={{ background: '#0f1117', padding: 8, display: 'flex', justifyContent: 'center', minHeight: 100, alignItems: 'center' }}>
        {diagram.format === 'svg' ? (
          <div
            dangerouslySetInnerHTML={{ __html: atob(diagram.data) }}
            style={{ maxWidth: '100%', maxHeight: 120 }}
          />
        ) : (
          <img src={src} alt={`Diagram ${index + 1}`} style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain' }} />
        )}
      </div>
      <div style={{ padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#718096' }}>{ts}</span>
        <button
          onClick={e => { e.stopPropagation(); downloadDiagram(diagram, index); }}
          style={{ background: 'none', border: 'none', color: '#4299e1', cursor: 'pointer', fontSize: 11 }}
        >
          ↓ {diagram.format.toUpperCase()}
        </button>
      </div>
    </div>
  );
}

function downloadDiagram(diagram, index) {
  const ext = diagram.format;
  const filename = `diagram_${index + 1}_${Date.now()}.${ext}`;
  const link = document.createElement('a');

  if (ext === 'svg') {
    const svgContent = atob(diagram.data);
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    link.href = URL.createObjectURL(blob);
  } else {
    link.href = `data:${diagram.mimeType};base64,${diagram.data}`;
  }

  link.download = filename;
  link.click();
}

export default function DiagramViewer({ diagrams }) {
  const [modal, setModal] = useState(null);

  if (diagrams.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#4a5568', fontSize: 13, textAlign: 'center', padding: 24 }}>
        <div>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎨</div>
          <div>Generated diagrams will appear here</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e2433' }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
          Diagrams ({diagrams.length})
        </h3>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[...diagrams].reverse().map((d, i) => (
          <DiagramCard key={d.id} diagram={d} index={diagrams.length - 1 - i} onClick={setModal} />
        ))}
      </div>

      {modal && (
        <div
          onClick={() => setModal(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#1a1f2e',
              borderRadius: 12,
              padding: 24,
              maxWidth: '90vw',
              maxHeight: '90vh',
              overflow: 'auto',
              position: 'relative'
            }}
          >
            <button
              onClick={() => setModal(null)}
              style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: '#a0aec0', cursor: 'pointer', fontSize: 18 }}
            >✕</button>

            {modal.format === 'svg' ? (
              <div dangerouslySetInnerHTML={{ __html: atob(modal.data) }} style={{ maxWidth: '80vw', maxHeight: '80vh' }} />
            ) : (
              <img
                src={`data:${modal.mimeType};base64,${modal.data}`}
                alt="Diagram"
                style={{ maxWidth: '80vw', maxHeight: '80vh', objectFit: 'contain' }}
              />
            )}

            <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => downloadDiagram(modal, 0)}
                style={{ padding: '6px 16px', background: '#4299e1', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12 }}
              >
                Download {modal.format.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
