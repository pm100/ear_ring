import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

interface TooltipEntry {
  key: string;
  text: string;
}

let tooltipTextCache: Record<string, string> | null = null;
let tooltipTextPromise: Promise<Record<string, string>> | null = null;

function loadTooltipText(): Promise<Record<string, string>> {
  if (tooltipTextCache) return Promise.resolve(tooltipTextCache);
  if (!tooltipTextPromise) {
    tooltipTextPromise = invoke<string>('cmd_tooltip_content')
      .then(json => {
        const arr = JSON.parse(json) as TooltipEntry[];
        const map: Record<string, string> = {};
        arr.forEach(({ key, text }) => { map[key] = text; });
        tooltipTextCache = map;
        return map;
      })
      .catch(() => ({}));
  }
  return tooltipTextPromise;
}

/** A small "?" icon that shows an anchored bubble with explanatory text on click, and
 *  dismisses on an outside click. `tooltipKey` must match a `## key` entry in
 *  tooltips.md — renders nothing if it doesn't, so a typo fails soft (issue #11). */
export function TooltipIcon({ tooltipKey }: { tooltipKey: string }) {
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadTooltipText().then(map => {
      if (!cancelled) setText(map[tooltipKey] ?? null);
    });
    return () => { cancelled = true; };
  }, [tooltipKey]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (text === null) return null;

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-block', marginLeft: 4 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Help"
        style={{
          width: 18, height: 18, borderRadius: '50%', border: '1px solid #9E9E9E',
          background: 'transparent', color: '#757575', fontSize: 11, lineHeight: '16px',
          cursor: 'pointer', padding: 0, verticalAlign: 'middle',
        }}
      >
        ?
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: 22, left: 0, zIndex: 20,
            background: '#424242', color: '#fff', fontSize: 13, lineHeight: 1.4,
            borderRadius: 8, padding: '10px 12px', width: 240,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}
