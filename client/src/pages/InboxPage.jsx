import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import EmailList from '../components/EmailList';
import EmailDetail from '../components/EmailDetail';
import { api } from '../services/api';
import styles from './InboxPage.module.css';

const TABS = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'important', label: 'Important' },
];

export default function InboxPage() {
  const { user, logout } = useAuth();

  const [tab, setTab] = useState('inbox');
  const [emails, setEmails] = useState([]);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const [selectedEmail, setSelectedEmail] = useState(null);
  const [emailDetail, setEmailDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchEmails = useCallback(async (activeTab, pageToken = null) => {
    if (pageToken) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await api.getEmails(activeTab, pageToken);
      setEmails(prev => pageToken ? [...prev, ...data.emails] : data.emails);
      setNextPageToken(data.nextPageToken);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    setEmails([]);
    setSelectedEmail(null);
    setEmailDetail(null);
    setNextPageToken(null);
    fetchEmails(tab);
  }, [tab, fetchEmails]);

  const handleSelectEmail = async (email) => {
    setSelectedEmail(email);
    setDetailLoading(true);
    setEmailDetail(null);
    try {
      const full = await api.getEmail(email.id);
      setEmailDetail(full);
    } catch (e) {
      setEmailDetail({ ...email, body: `Failed to load email: ${e.message}` });
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className={styles.root}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          Mail<span>Mind</span>
        </div>

        <nav className={styles.tabs}>
          {TABS.map(t => (
            <button
              key={t.key}
              className={`${styles.tabBtn} ${tab === t.key ? styles.tabActive : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.key === 'inbox' ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
                  <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              )}
              {t.label}
            </button>
          ))}
        </nav>

        <div className={styles.sidebarSpacer} />

        <div className={styles.userSection}>
          {user?.picture && (
            <img src={user.picture} alt={user.name} className={styles.avatar} referrerPolicy="no-referrer" />
          )}
          <div className={styles.userInfo}>
            <div className={styles.userName}>{user?.name}</div>
            <div className={styles.userEmail}>{user?.email}</div>
          </div>
          <button className={styles.logoutBtn} onClick={logout} title="Sign out">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </aside>

      {/* Email list panel */}
      <div className={styles.listPanel}>
        <div className={styles.listHeader}>
          <h2 className={styles.listTitle}>
            {tab === 'inbox' ? 'Inbox' : 'Important'}
          </h2>
          <button
            className={styles.refreshBtn}
            onClick={() => fetchEmails(tab)}
            disabled={loading}
            title="Refresh"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: loading ? 'rotate(360deg)' : 'none', transition: 'transform 0.5s' }}>
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        </div>

        {error && (
          <div className={styles.errorBanner}>
            {error}
            <button onClick={() => fetchEmails(tab)}>Retry</button>
          </div>
        )}

        <EmailList
          emails={emails}
          loading={loading}
          selectedId={selectedEmail?.id}
          onSelect={handleSelectEmail}
          onLoadMore={nextPageToken ? () => fetchEmails(tab, nextPageToken) : null}
          loadingMore={loadingMore}
        />
      </div>

      {/* Detail panel */}
      <div className={styles.detailPanel}>
        {detailLoading && (
          <div className={styles.detailLoading}>
            <div className={styles.spinner} />
            <span>Loading email…</span>
          </div>
        )}

        {!detailLoading && emailDetail && (
          <EmailDetail email={emailDetail} />
        )}

        {!detailLoading && !emailDetail && (
          <div className={styles.emptyDetail}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border2)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            <p>Select an email to read it</p>
          </div>
        )}
      </div>
    </div>
  );
}
