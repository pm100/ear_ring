import React, { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { RawMelody, SearchResult } from '../types';
import RecordTab from './RecordTab';
import { parseAbcToNotes } from '../utils/abc';

interface Props {
  onImport: (melody: RawMelody) => void;
  onClose: () => void;
}

export default function ImportDialog({ onImport, onClose }: Props) {
  const [tab, setTab] = useState<'search' | 'url' | 'paste' | 'record'>('search');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState('');
  const [fetchingId, setFetchingId] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [pasteTitleInput, setPasteTitleInput] = useState('');
  const [pasteError, setPasteError] = useState('');

  const importFromAbc = useCallback((abc: string, fallbackTitle: string) => {
    const titleMatch = abc.match(/^T:\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : fallbackTitle;
    const notes = parseAbcToNotes(abc);
    if (!notes || notes.length === 0) return 'Could not parse ABC notation — check the format.';
    onImport({ index: -1, title, notes, source: 'import' });
    return null;
  }, [onImport]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError('');
    setResults([]);
    try {
      const res = await invoke<SearchResult[]>('cmd_search_tunes', { query: query.trim() });
      setResults(res);
      if (res.length === 0) setSearchError('No tunes found. Try a different name.');
    } catch (e) {
      setSearchError(`Search failed: ${e}`);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const handleSelect = useCallback(async (result: SearchResult) => {
    setFetchingId(result.id);
    setFetchError('');
    try {
      const { title, abc } = await invoke<{ title: string; abc: string }>(
        'cmd_fetch_tune_abc', { id: result.id, source: result.source, abc: result.abc ?? null, name: result.name }
      );
      const err = importFromAbc(abc, title);
      if (err) setFetchError(err);
    } catch (e) {
      setFetchError(`Failed to fetch tune: ${e}`);
    } finally {
      setFetchingId(null);
    }
  }, [importFromAbc]);

  const handleUrlImport = useCallback(async () => {
    if (!urlInput.trim()) return;
    setUrlLoading(true);
    setUrlError('');
    try {
      const abc = await invoke<string>('cmd_fetch_url_text', { url: urlInput.trim() });
      const err = importFromAbc(abc, urlInput.split('/').pop() ?? 'Imported tune');
      if (err) setUrlError(err);
    } catch (e) {
      setUrlError(`Failed to fetch URL: ${e}`);
    } finally {
      setUrlLoading(false);
    }
  }, [urlInput, importFromAbc]);

  const handlePasteImport = useCallback(() => {
    setPasteError('');
    if (!pasteText.trim()) { setPasteError('Paste some ABC notation first.'); return; }
    const title = pasteTitleInput.trim() || 'Imported tune';
    const err = importFromAbc(pasteText, title);
    if (err) setPasteError(err);
  }, [pasteText, pasteTitleInput, importFromAbc]);

  const tabStyle = (t: typeof tab) => ({
    padding: '6px 16px', border: 'none', borderBottom: tab === t ? '2px solid #1976D2' : '2px solid transparent',
    background: 'none', fontWeight: tab === t ? 700 : 400, color: tab === t ? '#1976D2' : '#666',
    cursor: 'pointer', fontSize: 13,
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 24, width: 500,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, flex: 1 }}>Add tune</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0', marginBottom: 16 }}>
          <button style={tabStyle('search')} onClick={() => setTab('search')}>Search</button>
          <button style={tabStyle('url')} onClick={() => setTab('url')}>URL</button>
          <button style={tabStyle('paste')} onClick={() => setTab('paste')}>Paste ABC</button>
          <button style={tabStyle('record')} onClick={() => setTab('record')}>🎤 Record</button>
        </div>

        {tab === 'search' && (<>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
            Searches <strong>TheSession.org</strong> (folk/trad) and <strong>abcnotation.com</strong>.
            Note: copyrighted tunes (many jazz standards) aren't in public ABC databases.
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              placeholder="e.g. Scarborough Fair, Greensleeves…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              style={{ flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
            />
            <button onClick={handleSearch} disabled={searching || !query.trim()}
              style={{ padding: '8px 16px', background: '#1976D2', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              {searching ? '…' : 'Search'}
            </button>
          </div>
          {searchError && <div style={{ color: '#f44336', fontSize: 13, marginBottom: 8 }}>{searchError}</div>}
          {fetchError && <div style={{ color: '#f44336', fontSize: 13, marginBottom: 8 }}>{fetchError}</div>}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {results.map(r => (
              <div key={r.id} style={{
                padding: '8px 12px', borderRadius: 6, marginBottom: 4,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: fetchingId === r.id ? '#E3F2FD' : '#f9f9f9', border: '1px solid #e0e0e0',
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>
                    {r.tune_type}{r.tune_type && ' · '}{r.source === 'abcnotation' ? 'abcnotation.com' : 'thesession.org'}
                  </div>
                </div>
                <button onClick={() => handleSelect(r)} disabled={fetchingId !== null}
                  style={{ padding: '6px 14px', background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                  {fetchingId === r.id ? '…' : 'Import'}
                </button>
              </div>
            ))}
          </div>
        </>)}

        {tab === 'url' && (<>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
            Enter the direct URL of a <code>.abc</code> file. Find ABC files at{' '}
            <strong>abcnotation.com</strong>, GitHub, or any public file host.
          </div>
          <input
            type="url"
            placeholder="https://example.com/tune.abc"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUrlImport()}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', marginBottom: 10 }}
          />
          {urlError && <div style={{ color: '#f44336', fontSize: 13, marginBottom: 8 }}>{urlError}</div>}
          <button onClick={handleUrlImport} disabled={urlLoading || !urlInput.trim()}
            style={{ padding: '10px', background: '#1976D2', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
            {urlLoading ? 'Fetching…' : 'Import from URL'}
          </button>
        </>)}

        {tab === 'paste' && (<>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
            Paste raw ABC notation below. The title will be read from the <code>T:</code> field, or enter one manually.
          </div>
          <input
            type="text"
            placeholder="Title (optional — uses T: from ABC if blank)"
            value={pasteTitleInput}
            onChange={e => setPasteTitleInput(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', marginBottom: 8 }}
          />
          <textarea
            placeholder={'X:1\nT:All of Me\nM:4/4\nL:1/8\nK:C\n...'}
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            style={{ flex: 1, minHeight: 160, padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box', marginBottom: 8 }}
          />
          {pasteError && <div style={{ color: '#f44336', fontSize: 13, marginBottom: 6 }}>{pasteError}</div>}
          <button onClick={handlePasteImport} disabled={!pasteText.trim()}
            style={{ padding: '10px', background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
            Import
          </button>
        </>)}
        {tab === 'record' && (
          <RecordTab onImport={melody => { onImport(melody); }} />
        )}
      </div>
    </div>
  );
}
