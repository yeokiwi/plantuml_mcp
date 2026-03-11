const API_BASE = '/api';

export async function browseDirectory(path) {
  const response = await fetch(`${API_BASE}/code/browse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || 'Browse failed'), { code: data.error });
  return data;
}

export async function parseCodebase(path, options = {}) {
  const response = await fetch(`${API_BASE}/code/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, ...options })
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || 'Parse failed'), { code: data.error });
  return data;
}

export async function getSymbolSummary(sessionId, focus) {
  const params = new URLSearchParams({ sessionId });
  if (focus) params.set('focus', focus);
  const response = await fetch(`${API_BASE}/code/summary?${params}`);
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || 'Summary failed'), { code: data.error });
  return data;
}

export async function clearContext(sessionId) {
  const response = await fetch(`${API_BASE}/code/context`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Clear context failed');
  return data;
}
