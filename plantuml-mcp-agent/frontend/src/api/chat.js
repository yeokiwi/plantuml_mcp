const API_BASE = '/api';

/**
 * Send a chat message and stream SSE events.
 *
 * @param {object} params
 * @param {Array}  params.messages     - Full message history
 * @param {string} params.sessionId    - Session identifier
 * @param {boolean} params.codeContextLoaded
 * @param {Function} params.onToken    - (text) => void
 * @param {Function} params.onDiagram  - ({ format, data, mimeType }) => void
 * @param {Function} params.onCodeContext - (status) => void
 * @param {Function} params.onError    - (error) => void
 * @param {Function} params.onDone     - () => void
 * @returns {() => void} abort function
 */
export function streamChat({ messages, sessionId, codeContextLoaded, onToken, onDiagram, onCodeContext, onError, onDone }) {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, sessionId, codeContextLoaded }),
        signal: controller.signal
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: response.statusText }));
        onError?.(err.message || 'Chat request failed');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              switch (currentEvent) {
                case 'token':
                  onToken?.(data.content);
                  break;
                case 'diagram':
                  onDiagram?.(data);
                  break;
                case 'code_context':
                  onCodeContext?.(data);
                  break;
                case 'error':
                  onError?.(data.message || 'Unknown error');
                  break;
                case 'done':
                  onDone?.();
                  break;
              }
            } catch {}
            currentEvent = null;
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        onError?.(err.message);
      }
    }
  })();

  return () => controller.abort();
}
