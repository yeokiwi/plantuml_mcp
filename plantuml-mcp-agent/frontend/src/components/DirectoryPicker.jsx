import React, { useState, useRef } from 'react';
import { browseDirectory } from '../api/codeContext.js';

const MAX_HISTORY = 5;
const STORAGE_KEY = 'plantuml_dir_history';

function getHistory() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function addToHistory(path) {
  const history = getHistory().filter(p => p !== path);
  history.unshift(path);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

export default function DirectoryPicker({ onConfirm }) {
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const history = getHistory();
  const inputRef = useRef(null);

  async function handleBrowse() {
    const trimmed = path.trim();
    if (!trimmed) {
      setError('Please enter a directory path');
      return;
    }
    setError('');
    setBrowsing(true);
    try {
      await browseDirectory(trimmed);
      addToHistory(trimmed);
      onConfirm(trimmed);
    } catch (err) {
      if (err.code === 'NO_SOURCE_FILES') {
        setError('No C# or C++ source files found in this directory. Please select a directory containing .cs, .cpp, or .h files.');
      } else if (err.code === 'ACCESS_DENIED') {
        setError('Access denied. This directory is not in the list of allowed paths.');
      } else if (err.code === 'PATH_NOT_FOUND') {
        setError('Directory not found. Please check the path and try again.');
      } else {
        setError(err.message || 'Failed to browse directory');
      }
    } finally {
      setBrowsing(false);
    }
  }

  function selectHistory(p) {
    setPath(p);
    setShowHistory(false);
    inputRef.current?.focus();
  }

  return (
    <div style={{ padding: '12px 0' }}>
      <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          value={path}
          onChange={e => { setPath(e.target.value); setError(''); }}
          onFocus={() => history.length > 0 && setShowHistory(true)}
          onBlur={() => setTimeout(() => setShowHistory(false), 150)}
          onKeyDown={e => e.key === 'Enter' && handleBrowse()}
          placeholder="/path/to/your/project"
          style={{
            flex: 1,
            padding: '8px 12px',
            background: '#1a1f2e',
            border: `1px solid ${error ? '#f56565' : '#2d3748'}`,
            borderRadius: 6,
            color: '#e2e8f0',
            fontSize: 13,
            outline: 'none'
          }}
        />
        <button
          onClick={handleBrowse}
          disabled={browsing}
          style={{
            padding: '8px 16px',
            background: browsing ? '#2d3748' : '#4299e1',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            cursor: browsing ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 500,
            whiteSpace: 'nowrap'
          }}
        >
          {browsing ? 'Validating…' : 'Load Project'}
        </button>

        {showHistory && history.length > 0 && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 60,
            background: '#1a1f2e',
            border: '1px solid #2d3748',
            borderRadius: 6,
            zIndex: 100,
            overflow: 'hidden',
            marginTop: 2
          }}>
            <div style={{ padding: '6px 12px', fontSize: 11, color: '#718096', borderBottom: '1px solid #2d3748' }}>
              Recent directories
            </div>
            {history.map((h, i) => (
              <div
                key={i}
                onMouseDown={() => selectHistory(h)}
                style={{
                  padding: '7px 12px',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: '#a0aec0',
                  borderBottom: i < history.length - 1 ? '1px solid #1e2433' : 'none'
                }}
              >
                {h}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#fc8181', lineHeight: 1.4 }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
        {['C#', 'C++'].map(lang => (
          <span key={lang} style={{
            padding: '2px 8px',
            background: '#2d3748',
            borderRadius: 4,
            fontSize: 11,
            color: '#a0aec0'
          }}>{lang}</span>
        ))}
        <span style={{ fontSize: 11, color: '#4a5568', marginLeft: 2 }}>supported languages</span>
      </div>
    </div>
  );
}
