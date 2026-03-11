import React, { useState } from 'react';
import DirectoryPicker from './DirectoryPicker.jsx';
import SymbolSummaryBadge from './SymbolSummaryBadge.jsx';
import { parseCodebase, getSymbolSummary, clearContext } from '../api/codeContext.js';

function FileIcon({ ext }) {
  const isCs = ext === '.cs';
  return (
    <span style={{
      display: 'inline-block',
      width: 14,
      height: 14,
      borderRadius: 2,
      background: isCs ? '#4c51bf' : '#2b6cb0',
      fontSize: 7,
      color: '#fff',
      textAlign: 'center',
      lineHeight: '14px',
      fontWeight: 700,
      marginRight: 4,
      flexShrink: 0
    }}>
      {isCs ? 'C#' : 'C+'}
    </span>
  );
}

function FileTree({ node, depth = 0 }) {
  const [open, setOpen] = useState(depth < 2);
  if (!node) return null;

  if (node.type === 'file') {
    return (
      <div style={{ paddingLeft: depth * 12 + 8, display: 'flex', alignItems: 'center', padding: '2px 8px 2px ' + (depth * 12 + 8) + 'px' }}>
        <FileIcon ext={node.extension} />
        <span style={{ fontSize: 11, color: '#718096', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
        </span>
      </div>
    );
  }

  const hasContent = node.children && node.children.length > 0;
  return (
    <div>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', cursor: 'pointer',
          padding: `3px 8px 3px ${depth * 12 + 8}px`,
          color: '#a0aec0', fontSize: 12
        }}
      >
        <span style={{ marginRight: 4, fontSize: 10 }}>{open ? '▼' : '▶'}</span>
        <span style={{ fontWeight: 500 }}>{node.name}</span>
        {(node.csFiles > 0 || node.cppFiles > 0) && (
          <span style={{ marginLeft: 6, fontSize: 10, color: '#4a5568' }}>
            {node.csFiles + node.cppFiles}
          </span>
        )}
      </div>
      {open && hasContent && node.children.map((child, i) => (
        <FileTree key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function CodeContextPanel({ sessionId, onContextLoaded, onContextCleared, onSuggestedDiagram }) {
  const [state, setState] = useState('empty'); // 'empty' | 'parsing' | 'loaded'
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [tree, setTree] = useState(null);
  const [summary, setSummary] = useState(null);
  const [parseData, setParseData] = useState(null);
  const [error, setError] = useState('');
  const [showSymbols, setShowSymbols] = useState(true);
  const abortRef = React.useRef(false);

  async function handleDirectoryConfirmed(dirPath) {
    setState('parsing');
    setError('');
    abortRef.current = false;
    setProgress({ current: 0, total: 0 });

    try {
      const result = await parseCodebase(dirPath, { language: 'auto', scope: 'public_only', sessionId });

      if (abortRef.current) return;

      setParseData(result);
      setProgress({ current: result.stats?.totalFiles || 0, total: result.stats?.totalFiles || 0 });

      // Fetch summary
      try {
        const sym = await getSymbolSummary(result.sessionId || sessionId);
        setSummary(sym);
      } catch {}

      setState('loaded');
      onContextLoaded?.(result);
    } catch (err) {
      setError(err.message || 'Failed to parse codebase');
      setState('empty');
    }
  }

  async function handleClear() {
    try {
      await clearContext(sessionId);
    } catch {}
    setState('empty');
    setTree(null);
    setSummary(null);
    setParseData(null);
    setError('');
    onContextCleared?.();
  }

  const suggestedDiagrams = state === 'loaded' && summary?.recommendedDiagramTypes
    ? summary.recommendedDiagramTypes.slice(0, 5)
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e2433' }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>Code Context</h3>
        <p style={{ fontSize: 11, color: '#718096' }}>
          Load a C# or C++ project to generate diagrams from real code.
        </p>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px' }}>
        {state === 'empty' && (
          <>
            <DirectoryPicker onConfirm={handleDirectoryConfirmed} />
            {error && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: '#742a2a', borderRadius: 6, fontSize: 12, color: '#fc8181' }}>
                {error}
              </div>
            )}
          </>
        )}

        {state === 'parsing' && (
          <div style={{ padding: '16px 0' }}>
            <div style={{ fontSize: 12, color: '#a0aec0', marginBottom: 8 }}>
              Scanning files… {progress.current > 0 ? `(${progress.current} / ${progress.total})` : ''}
            </div>
            <div style={{ height: 4, background: '#1a1f2e', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                background: '#4299e1',
                width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '60%',
                borderRadius: 2,
                transition: 'width 0.3s ease',
                animation: progress.total === 0 ? 'pulse 1.5s ease-in-out infinite' : 'none'
              }} />
            </div>
            <button
              onClick={() => { abortRef.current = true; setState('empty'); }}
              style={{ marginTop: 12, padding: '4px 10px', background: '#2d3748', border: 'none', borderRadius: 4, color: '#a0aec0', cursor: 'pointer', fontSize: 11 }}
            >
              Cancel
            </button>
            <style>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
          </div>
        )}

        {state === 'loaded' && parseData && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <SymbolSummaryBadge stats={parseData.stats} language={parseData.language} />
            </div>

            {suggestedDiagrams.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#718096', marginBottom: 6 }}>Suggested diagrams</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {suggestedDiagrams.map((d, i) => (
                    <button
                      key={i}
                      onClick={() => onSuggestedDiagram?.(`Generate a ${d.type} from the loaded codebase`)}
                      style={{
                        padding: '4px 10px',
                        background: '#1a365d',
                        border: '1px solid #2c5282',
                        borderRadius: 12,
                        color: '#90cdf4',
                        cursor: 'pointer',
                        fontSize: 11
                      }}
                    >
                      {d.type}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {summary && summary.namespaces.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <button
                  onClick={() => setShowSymbols(s => !s)}
                  style={{ background: 'none', border: 'none', color: '#a0aec0', cursor: 'pointer', fontSize: 11, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <span>{showSymbols ? '▼' : '▶'}</span>
                  <span>Symbol Summary</span>
                </button>
                {showSymbols && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#718096' }}>
                    {summary.namespaces.map((ns, i) => (
                      <div key={i} style={{ marginBottom: 4 }}>
                        <span style={{ color: '#a0aec0' }}>{ns.name}</span>
                        <span style={{ marginLeft: 6, color: '#4a5568' }}>{ns.classCount} classes</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                onClick={() => setState('empty')}
                style={{ padding: '5px 10px', background: '#2d3748', border: 'none', borderRadius: 4, color: '#a0aec0', cursor: 'pointer', fontSize: 11 }}
              >
                Change Directory
              </button>
              <button
                onClick={handleClear}
                style={{ padding: '5px 10px', background: '#742a2a', border: 'none', borderRadius: 4, color: '#fc8181', cursor: 'pointer', fontSize: 11 }}
              >
                Clear Context
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
