import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import SetupScreen from './SetupScreen';
import { ExerciseSettings } from '../types';
import { SettingsAction } from '../settingsStore';
import { midiToLabel } from '../music';

interface Step {
  id: string;
  title: string;
  body: string;
  primaryLabel: string;
  hint: string;
  success: string;
  exitLabel: string;
}

interface InstrumentInfo { id: number; name: string; semitones: number; premium: boolean; }

interface Props {
  settings: ExerciseSettings;
  onAction: (action: SettingsAction) => void;
  isPremium: boolean;
  onFinished: () => void;
}

/** First-run welcome flow (issue #43). Step text comes from the Rust core. */
export default function WelcomeScreen({ settings, onAction, isPremium, onFinished }: Props) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [index, setIndex] = useState(0);
  const [micHeard, setMicHeard] = useState(false);
  const markHeard = useCallback(() => setMicHeard(true), []);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    invoke<string>('cmd_onboarding_steps')
      .then(json => setSteps(JSON.parse(json) as Step[]))
      .catch(() => onFinished());
  }, [onFinished]);

  if (steps.length === 0) return null;
  const step = steps[index];
  const isMic = step.id === 'mic';
  const isWelcome = index === 0;
  const next = () => (index >= steps.length - 1 ? onFinished() : setIndex(index + 1));

  // Swipe left for Next, right for Back (touch screens); drags on the sensitivity slider are ignored.
  const onTouchStart = (e: React.TouchEvent) => {
    const onSlider = (e.target as HTMLElement).closest('input[type="range"]');
    touchStart.current = onSlider ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s0 = touchStart.current;
    touchStart.current = null;
    if (!s0) return;
    const dx = e.changedTouches[0].clientX - s0.x;
    const dy = e.changedTouches[0].clientY - s0.y;
    if (Math.abs(dx) < 80 || Math.abs(dx) < 2 * Math.abs(dy)) return;
    if (dx < 0 && index < steps.length - 1 && !(isMic && !micHeard)) next();
    else if (dx > 0 && index > 0) setIndex(index - 1);
  };

  return (
    <div className="screen" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ maxWidth: isMic ? 640 : 520, margin: '0 auto', textAlign: 'center', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', minHeight: 32 }}>
        {step.exitLabel && (
          <button type="button" className="btn-back" onClick={onFinished}>{step.exitLabel}</button>
        )}
      </div>
      {isWelcome && (
        <img src="/icon.png" alt="Ear Ring" style={{ width: 96, height: 96, borderRadius: 20, marginTop: 8 }} />
      )}
      <h1 style={{ fontSize: 24, margin: '16px 0' }}>{step.title}</h1>
      {step.body.split('\n\n').map((para, i) => (
        <p key={i} style={{ fontSize: 16, lineHeight: 1.6, margin: '8px 0' }}>{para.trim()}</p>
      ))}

      <div style={{ margin: '20px 0' }}>
        {step.id === 'instrument' && (
          <InstrumentChoice settings={settings} onAction={onAction} isPremium={isPremium} />
        )}
        {isMic && <MicCheck settings={settings} onAction={onAction} step={step} heard={micHeard} onHeard={markHeard} />}
      </div>

      {/* Pinned so Next and Back stay visible beside the tall embedded Mic Setup screen. */}
      <div style={{ position: 'sticky', bottom: 0, marginTop: 'auto', background: '#fff', padding: '8px 0 12px', minHeight: 56, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {isWelcome ? (
          <button type="button" className="btn-primary" onClick={next}>{step.primaryLabel}</button>
        ) : (
          // Back, progress dots (every step after Welcome), Next.
          <div style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <button type="button" className="btn-back" onClick={() => setIndex(index - 1)}>Back</button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {steps.slice(1).map((st, i) => (
                <span key={st.id} style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: i === index - 1 ? '#3F51B5' : '#c5cae9',
                }} />
              ))}
            </div>
            <div style={{ flex: 1, textAlign: 'right' }}>
              <button type="button" className="btn-back" disabled={isMic && !micHeard}
                style={{ fontWeight: 700, ...(isMic && !micHeard ? { opacity: 0.5, cursor: 'default' } : {}) }}
                onClick={next}>{step.primaryLabel}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InstrumentChoice({ settings, onAction, isPremium }: Pick<Props, 'settings' | 'onAction' | 'isPremium'>) {
  const [instruments, setInstruments] = useState<InstrumentInfo[]>([]);
  useEffect(() => {
    invoke<string>('cmd_instrument_list')
      .then(json => setInstruments(JSON.parse(json) as InstrumentInfo[]))
      .catch(() => setInstruments([]));
  }, []);
  return (
    <>
      <select
        value={settings.instrumentIndex}
        onChange={e => onAction({ type: 'setInstrument', value: parseInt(e.target.value) })}
        style={{ width: '100%', padding: '8px 12px', fontSize: 16, borderRadius: 4, border: '1px solid #bdbdbd' }}
      >
        {instruments.filter(i => !i.premium || isPremium).map(i => (
          <option key={i.id} value={i.id}>{i.name}</option>
        ))}
      </select>
      <div style={{ marginTop: 8, fontSize: 14, color: '#757575' }}>
        Range: {midiToLabel(settings.rangeStart)} to {midiToLabel(settings.rangeEnd)}
      </div>
    </>
  );
}

function MicCheck({ settings, onAction, step, heard, onHeard }:
  { settings: ExerciseSettings; onAction: (action: SettingsAction) => void; step: Step; heard: boolean; onHeard: () => void }) {
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    if (heard) return;
    const t = setTimeout(() => setShowHint(true), 10000);
    return () => clearTimeout(t);
  }, [heard]);

  // The real Mic Setup screen: staff, tuner meter, Mic Sensitivity and Advanced. The webview asks
  // for microphone access when it starts capturing, i.e. when this step opens.
  return (
    <>
      <SetupScreen
        embedded
        onNoteHeard={onHeard}
        onBack={() => {}}
        onAction={onAction}
        rangeStart={settings.rangeStart}
        rangeEnd={settings.rangeEnd}
        rootChroma={settings.rootNote}
        scaleId={settings.scaleId}
        keySignatureMode={settings.keySignatureMode}
        silenceThreshold={settings.silenceThreshold}
        framesToConfirm={settings.framesToConfirm}
        warmupFrames={settings.warmupFrames}
        instrumentIndex={settings.instrumentIndex}
        graceFrames={settings.graceFrames}
        octaveCorrection={settings.octaveCorrection}
        yinThreshold={settings.yinThreshold}
        pitchToleranceCents={settings.pitchToleranceCents}
        useTunerMeter={settings.useTunerMeter}
      />
      <div style={{ marginTop: 8, fontSize: 15, fontWeight: 600, color: '#3F51B5' }}>
        {heard
          ? `\u2713 ${step.success}`
          : showHint
            ? <span style={{ fontWeight: 400, color: '#424242' }}>{step.hint}</span>
            : null}
      </div>
    </>
  );
}
