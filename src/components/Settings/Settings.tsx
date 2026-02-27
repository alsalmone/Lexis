import { useState } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { useVocabulary } from '@/hooks/useVocabulary';
import { testConnection } from '@/services/deepseek';
import { clearVocabulary } from '@/services/vocabulary';
import styles from './Settings.module.css';

export function Settings() {
  const { settings, updateSettings } = useSettings();
  const { vocabulary, refresh } = useVocabulary();
  const [keyDraft, setKeyDraft] = useState(settings.deepseekApiKey);
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  function handleSave() {
    updateSettings({ deepseekApiKey: keyDraft.trim() });
  }

  async function handleTest() {
    const key = keyDraft.trim();
    if (!key) return;
    setTestStatus('loading');
    setTestError('');
    try {
      await testConnection(key);
      setTestStatus('ok');
    } catch (err) {
      setTestStatus('error');
      setTestError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleClearVocab() {
    if (!confirm('Clear all vocabulary history?')) return;
    clearVocabulary();
    refresh();
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Settings</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>DeepSeek API key</h2>
        <p className={styles.note}>
          Your key is stored in your browser's local storage. Do not use this app on a shared computer.
        </p>
        <div className={styles.keyRow}>
          <input
            className="input"
            type={showKey ? 'text' : 'password'}
            placeholder="sk-…"
            value={keyDraft}
            onChange={(e) => {
              setKeyDraft(e.target.value);
              setTestStatus('idle');
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <button className="btn btn-ghost" onClick={() => setShowKey((v) => !v)}>
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
        <div className={styles.keyActions}>
          <button className="btn btn-primary" onClick={handleSave}>
            Save
          </button>
          <button
            className="btn"
            onClick={handleTest}
            disabled={!keyDraft.trim() || testStatus === 'loading'}
          >
            {testStatus === 'loading' ? 'Testing…' : 'Test connection'}
          </button>
          {testStatus === 'ok' && (
            <span className={styles.ok}>Connection successful</span>
          )}
          {testStatus === 'error' && (
            <span className={styles.err}>Failed: {testError}</span>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.vocabHeader}>
          <h2 className={styles.sectionTitle}>Vocabulary</h2>
          {vocabulary.length > 0 && (
            <button className="btn" onClick={handleClearVocab}>
              Clear all
            </button>
          )}
        </div>

        {vocabulary.length === 0 ? (
          <p className={styles.empty}>No words encountered yet. Start reading to build your vocabulary.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Polish</th>
                  <th>English</th>
                  <th>Times seen</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {vocabulary.map((entry) => (
                  <tr key={entry.polishWord}>
                    <td className={styles.polish}>{entry.polishWord}</td>
                    <td>{entry.baseEn}</td>
                    <td>{entry.count}</td>
                    <td>{new Date(entry.lastSeen).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
