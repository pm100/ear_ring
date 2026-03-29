import React, { useEffect, useState } from 'react';
import { SessionRecord, TestRecord } from '../types';

interface Props {
  onBack: () => void;
  onClearProgress: () => void;
}

export default function ProgressScreen({ onBack, onClearProgress }: Props) {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [tests, setTests] = useState<TestRecord[]>([]);
  const [streak, setStreak] = useState(0);
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    const sessionRaw = localStorage.getItem('ear_ring_sessions');
    const testRaw = localStorage.getItem('ear_ring_tests');
    const parsedSessions: SessionRecord[] = sessionRaw ? JSON.parse(sessionRaw) : [];
    const parsedTests: TestRecord[] = testRaw ? JSON.parse(testRaw) : [];
    setSessions(parsedSessions);
    setTests(parsedTests);
    const dates = parsedSessions.map(s => s.date.slice(0, 10));
    const unique = [...new Set(dates)].sort().reverse();
    let s = 0;
    const today = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < unique.length; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (unique[i] === d.toISOString().slice(0, 10)) s++;
      else break;
    }
    setStreak(s);
  }, []);

  const avgScore = sessions.length > 0
    ? Math.round(sessions.reduce((sum, s) => sum + s.score, 0) / sessions.length)
    : 0;
  const avgTestScore = tests.length > 0
    ? Math.round(tests.reduce((sum, t) => sum + t.score, 0) / tests.length)
    : 0;

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <span className="screen-title">Progress</span>
      </div>

        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value">🔥 {streak}</div>
            <div className="stat-label">Day Streak</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{sessions.length}</div>
          <div className="stat-label">Sessions</div>
        </div>
          <div className="stat-card">
            <div className="stat-value">{avgScore}%</div>
            <div className="stat-label">Avg Score</div>
          </div>
        </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="section-label">Recorded Tests</h3>
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value">{tests.length}</div>
            <div className="stat-label">Tests</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{avgTestScore}%</div>
            <div className="stat-label">Avg Test Score</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="section-label">Session History</h3>
        {sessions.length === 0 ? (
          <p className="empty-state">No sessions yet. Complete an exercise to see history!</p>
        ) : (
          sessions.map((s, i) => (
              <div key={i} className="session-row">
                <div className="session-info">
                  <span className="session-scale">{s.root} {s.scale}</span>
                  <span className="session-date">{new Date(s.date).toLocaleDateString()}</span>
                  {s.testsCompleted !== undefined && (
                    <span className="session-date">{s.testsCompleted} tests</span>
                  )}
                </div>
                <div className={`session-score ${s.score >= 80 ? 'score-good' : s.score >= 50 ? 'score-ok' : 'score-bad'}`}>
                  {s.score}%
                </div>
              </div>
            ))
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="section-label">Recent Tests</h3>
        {tests.length === 0 ? (
          <p className="empty-state">No tests recorded yet.</p>
        ) : (
          tests.slice(0, 10).map((test, i) => (
            <div key={i} className="session-row">
              <div className="session-info">
                <span className="session-scale">{test.root} {test.scale}</span>
                <span className="session-date">{new Date(test.date).toLocaleString()}</span>
                <span className="session-date">
                  {test.passed ? `Passed in ${test.attemptsUsed}/${test.maxAttempts}` : `Failed after ${test.maxAttempts}`}
                </span>
              </div>
              <div className={`session-score ${test.score >= 80 ? 'score-good' : test.score >= 50 ? 'score-ok' : 'score-bad'}`}>
                {test.score}%
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 24, paddingBottom: 16 }}>
        {confirmingClear ? (
          <div style={{ border: '1px solid #f44336', borderRadius: 8, padding: 16 }}>
            <p style={{ margin: '0 0 12px', fontSize: 14, color: '#212121' }}>
              This will permanently delete all session history and test records. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => { onClearProgress(); setSessions([]); setTests([]); setStreak(0); setConfirmingClear(false); }}
                style={{ flex: 1, padding: '8px 0', background: '#f44336', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>
                Clear
              </button>
              <button type="button" onClick={() => setConfirmingClear(false)}
                style={{ flex: 1, padding: '8px 0', background: '#e0e0e0', color: '#212121', border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmingClear(true)}
            style={{ width: '100%', padding: '12px 0', background: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>
            Clear All Progress
          </button>
        )}
      </div>
    </div>
  );
}
