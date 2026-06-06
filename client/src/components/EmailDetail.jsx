import { useState } from 'react';
import { api } from '../services/api';
import styles from './EmailDetail.module.css';

function parseSender(from) {
  const nameMatch = from?.match(/^"?([^"<]+)"?\s*</);
  const emailMatch = from?.match(/<([^>]+)>/);
  return {
    name: nameMatch ? nameMatch[1].trim() : from,
    email: emailMatch ? emailMatch[1] : from,
  };
}

const GMAIL_URL = (threadId) =>
  `https://mail.google.com/mail/u/0/#inbox/${threadId}`;

export default function EmailDetail({ email }) {
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);

  const [replyText, setReplyText] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [autoReplyLoading, setAutoReplyLoading] = useState(false);
  const [tone, setTone] = useState('professional');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState(null);

  const sender = parseSender(email.from);

  const handleSummarize = async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const data = await api.summarize(email.subject, email.from, email.body);
      setSummary(data);
    } catch (e) {
      setSummaryError(e.message);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleAutoReply = async () => {
    setAutoReplyLoading(true);
    try {
      const data = await api.autoReply(email.subject, email.from, email.body, tone);
      setReplyText(data.reply);
    } catch (e) {
      console.error(e);
    } finally {
      setAutoReplyLoading(false);
    }
  };

  const handleSend = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      await api.sendReply(email.id, replyText);
      setSent(true);
      setReplyText('');
    } catch (e) {
      setSendError(e.message);
    } finally {
      setSending(false);
    }
  };

  const priorityColor = {
    high: styles.priorityHigh,
    medium: styles.priorityMed,
    low: styles.priorityLow,
  };

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.subject}>{email.subject}</div>
        <div className={styles.meta}>
          <div className={styles.senderInfo}>
            <div className={styles.avatarCircle}>{sender.name?.[0]?.toUpperCase() || '?'}</div>
            <div>
              <div className={styles.senderName}>{sender.name}</div>
              <div className={styles.senderEmail}>{sender.email}</div>
            </div>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.date}>{new Date(email.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
            <a
              href={GMAIL_URL(email.threadId)}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.gmailLink}
              title="Open in Gmail"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Open in Gmail
            </a>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className={styles.body}>
        <pre className={styles.bodyText}>{email.body}</pre>
      </div>

      {/* Summarize */}
      <div className={styles.section}>
        {!summary && !summaryLoading && (
          <button className={styles.summarizeBtn} onClick={handleSummarize}>
            ✦ Summarize with AI
          </button>
        )}

        {summaryLoading && (
          <div className={styles.summaryCard}>
            <div className={styles.summaryLoading}>Grok is reading the email…</div>
          </div>
        )}

        {summaryError && (
          <div className={styles.errorBox}>{summaryError}</div>
        )}

        {summary && !summaryLoading && (
          <div className={styles.summaryCard}>
            <div className={styles.summaryHeader}>
              <span className={styles.summaryLabel}>✦ Summary</span>
              <span className={`${styles.priorityBadge} ${priorityColor[summary.priority] || ''}`}>
                {summary.priority} priority
              </span>
              <button className={styles.closeBtn} onClick={() => setSummary(null)}>✕</button>
            </div>
            <p className={styles.summaryText}>{summary.summary}</p>

            {summary.actions?.length > 0 && (
              <div className={styles.actions}>
                <div className={styles.actionsLabel}>Action items</div>
                <ul className={styles.actionList}>
                  {summary.actions.map((a, i) => (
                    <li key={i} className={styles.actionItem}>
                      <ActionCheckbox label={a} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reply */}
      <div className={styles.section}>
        <div className={styles.replyHeader}>
          <span className={styles.replyLabel}>Reply to {sender.name}</span>
          <div className={styles.toneRow}>
            {['professional', 'friendly', 'brief'].map(t => (
              <button
                key={t}
                className={`${styles.toneChip} ${tone === t ? styles.toneActive : ''}`}
                onClick={() => setTone(t)}
              >{t}</button>
            ))}
            <button
              className={styles.autoReplyBtn}
              onClick={handleAutoReply}
              disabled={autoReplyLoading}
            >
              {autoReplyLoading ? 'Generating…' : '✦ Auto reply'}
            </button>
          </div>
        </div>

        <textarea
          className={styles.replyBox}
          placeholder="Write your reply…"
          value={replyText}
          onChange={e => setReplyText(e.target.value)}
          rows={6}
        />

        {sendError && <div className={styles.errorBox}>{sendError}</div>}

        {sent && (
          <div className={styles.sentBanner}>
            ✓ Reply sent successfully
          </div>
        )}

        <div className={styles.replyActions}>
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={sending || !replyText.trim()}
          >
            {sending ? 'Sending…' : 'Send reply'}
          </button>
          {replyText && (
            <button className={styles.discardBtn} onClick={() => { setReplyText(''); setSent(false); }}>
              Discard
            </button>
          )}
          {autoReplyLoading && <span className={styles.hint}>AI is drafting your reply…</span>}
        </div>
      </div>
    </div>
  );
}

// Small checkable action item
function ActionCheckbox({ label }) {
  const [done, setDone] = useState(false);
  return (
    <label style={{ display:'flex', gap:8, alignItems:'flex-start', cursor:'pointer' }}>
      <input
        type="checkbox"
        checked={done}
        onChange={() => setDone(d => !d)}
        style={{ marginTop:3, accentColor:'var(--accent)' }}
      />
      <span style={{ textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--muted)' : 'var(--text)' }}>
        {label}
      </span>
    </label>
  );
}
