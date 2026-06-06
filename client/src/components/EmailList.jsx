import styles from './EmailList.module.css';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function parseSender(from) {
  const match = from?.match(/^"?([^"<]+)"?\s*<?[^>]*>?$/);
  return match ? match[1].trim() : from || 'Unknown';
}

export default function EmailList({ emails, loading, selectedId, onSelect, onLoadMore }) {
  if (loading && emails.length === 0) {
    return (
      <div className={styles.skeletons}>
        {[...Array(8)].map((_, i) => (
          <div key={i} className={styles.skeleton} style={{ animationDelay: `${i * 0.06}s` }} />
        ))}
      </div>
    );
  }

  if (!loading && emails.length === 0) {
    return <div className={styles.empty}>No emails found</div>;
  }

  return (
    <div className={styles.list}>
      {emails.map(email => (
        <div
          key={email.id}
          className={`${styles.item} ${selectedId === email.id ? styles.selected : ''} ${email.unread ? styles.unread : ''}`}
          onClick={() => onSelect(email)}
        >
          <div className={styles.itemTop}>
            <span className={styles.sender}>{parseSender(email.from)}</span>
            <span className={styles.date}>{formatDate(email.date)}</span>
          </div>
          <div className={styles.subject}>{email.subject}</div>
          <div className={styles.snippet}>{email.snippet}</div>
          {email.important && <div className={styles.importantDot} title="Important" />}
        </div>
      ))}

      {onLoadMore && (
        <button className={styles.loadMore} onClick={onLoadMore} disabled={loading}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
