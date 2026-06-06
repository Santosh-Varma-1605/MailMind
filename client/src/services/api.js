const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  getEmails: (tab, pageToken) => {
    const params = new URLSearchParams({ tab });
    if (pageToken) params.set('pageToken', pageToken);
    return req(`/emails?${params}`);
  },
  getEmail: (id) => req(`/emails/${id}`),
  sendReply: (id, replyText) =>
    req(`/emails/${id}/reply`, { method: 'POST', body: JSON.stringify({ replyText }) }),
  summarize: (subject, from, body) =>
    req('/ai/summarize', { method: 'POST', body: JSON.stringify({ subject, from, body }) }),
  autoReply: (subject, from, body, tone) =>
    req('/ai/reply', { method: 'POST', body: JSON.stringify({ subject, from, body, tone }) }),
};
