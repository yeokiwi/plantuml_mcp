import React from 'react';

export default function SymbolSummaryBadge({ stats, language }) {
  if (!stats) return null;

  const langColor = language === 'csharp' ? '#68d391' : language === 'cpp' ? '#63b3ed' : '#f6ad55';
  const langLabel = language === 'csharp' ? 'C#' : language === 'cpp' ? 'C++' : 'Mixed';

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{
        padding: '3px 8px',
        background: '#1c4532',
        border: '1px solid #276749',
        borderRadius: 12,
        fontSize: 11,
        color: '#68d391',
        fontWeight: 600
      }}>
        Context Active
      </span>
      <span style={{ padding: '3px 8px', background: '#1a1f2e', borderRadius: 12, fontSize: 11, color: langColor }}>
        {langLabel}
      </span>
      <span style={{ padding: '3px 8px', background: '#1a1f2e', borderRadius: 12, fontSize: 11, color: '#a0aec0' }}>
        {stats.totalClasses} classes
      </span>
      <span style={{ padding: '3px 8px', background: '#1a1f2e', borderRadius: 12, fontSize: 11, color: '#a0aec0' }}>
        {stats.totalFiles} files
      </span>
      {stats.totalMethods > 0 && (
        <span style={{ padding: '3px 8px', background: '#1a1f2e', borderRadius: 12, fontSize: 11, color: '#a0aec0' }}>
          {stats.totalMethods} methods
        </span>
      )}
    </div>
  );
}
