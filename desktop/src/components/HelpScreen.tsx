import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

interface HelpSection {
  title: string;
  body: string;
}

interface Props {
  onBack: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#3F51B5', marginBottom: 8 }}>{title}</h2>
      <div style={{ fontSize: 14, color: '#424242', lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

export default function HelpScreen({ onBack }: Props) {
  const [sections, setSections] = useState<HelpSection[]>([]);

  useEffect(() => {
    invoke<string>('cmd_help_content')
      .then(json => setSections(JSON.parse(json) as HelpSection[]))
      .catch(() => setSections([]));
  }, []);

  return (
    <div className="screen" style={{ paddingBottom: 72 }}>
      <div className="screen-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <span className="screen-title">Help</span>
        <div style={{ width: 48 }} />
      </div>

      {sections.map(({ title, body }) => (
        <Section key={title} title={title}>
          {body.split('\n\n').map((para, i) => {
            const lines = para.trim().split('\n');
            const isList = lines.every(l => l.trimStart().startsWith('•'));
            if (isList) {
              return (
                <ul key={i} style={{ margin: i === 0 ? '0 0 0 18px' : '8px 0 0 18px', padding: 0 }}>
                  {lines.map((l, j) => (
                    <li key={j} style={{ marginBottom: 4 }}>{l.replace(/^\s*•\s*/, '')}</li>
                  ))}
                </ul>
              );
            }
            return <p key={i} style={{ margin: i === 0 ? 0 : '8px 0 0' }}>{para.trim()}</p>;
          })}
        </Section>
      ))}
    </div>
  );
}
