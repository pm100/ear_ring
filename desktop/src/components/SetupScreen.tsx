import React, { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import PitchMeter from './PitchMeter';
import MusicStaff from './MusicStaff';
import { useAudioCapture, TrackerFrame } from '../hooks/useAudioCapture';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { ExerciseSettings } from '../types';
import { TooltipIcon } from './Tooltip';

const STABILITY_OPTIONS = [2, 3, 4, 5];
const WARMUP_OPTIONS = [0, 1, 2, 3, 4, 5, 6];

interface InstrumentInfo { id: number; name: string; semitones: number; }

// Semitones to add to root chroma to get the implied major key (the major key sharing
// the scale's pitch classes) — mirrors ScaleType::implied_major_offset in music_theory.rs.
// null = no shift (a major scale is its own implied major key).
const IMPLIED_MAJOR_OFFSETS: (number | null)[] = [null, 3, 10, 5, 1];

function effectiveKeyChroma(rootChroma: number, scaleId: number): number {
  const offset = IMPLIED_MAJOR_OFFSETS[scaleId];
  if (offset === null || offset === undefined) return rootChroma;
  return (rootChroma + offset) % 12;
}

interface Props {
  onBack: () => void;
  onUpdateSettings: React.Dispatch<React.SetStateAction<ExerciseSettings>>;
  rangeStart: number;
  rangeEnd: number;
  rootChroma?: number;
  scaleId?: number;
  keySignatureMode?: number;
  silenceThreshold?: number;
  framesToConfirm?: number;
  warmupFrames?: number;
  instrumentIndex?: number;
  graceFrames?: number;
  octaveCorrection?: boolean;
  yinThreshold?: number;
}

export default function SetupScreen({ onBack, onUpdateSettings, rangeStart, rangeEnd, rootChroma = 0, scaleId = 0, keySignatureMode = 0, silenceThreshold = 0.003, framesToConfirm = 3, warmupFrames = 4, instrumentIndex = 0, graceFrames = 3, octaveCorrection = false, yinThreshold = 0.15 }: Props) {
  const set = <K extends keyof ExerciseSettings>(key: K, value: ExerciseSettings[K]) =>
    onUpdateSettings(prev => ({ ...prev, [key]: value }));

  const [hz, setHz] = useState(0);
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [noteHistory, setNoteHistory] = useState<number[]>([]);
  const { start, stop, destroy } = useAudioCapture();
  const { playSequence } = useAudioPlayback();

  const [roundNotes, setRoundNotes] = useState<number[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);      // which note within the round we're listening for
  const [roundNumber, setRoundNumber] = useState(0);
  const [calibrating, setCalibrating] = useState(false);
  const [bestScoreSoFar, setBestScoreSoFar] = useState<number | null>(null);
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [calibrationDone, setCalibrationDone] = useState<null | { silenceThreshold: number; framesToConfirm: number; warmupFrames: number; graceFrames: number; octaveCorrection: boolean; yinThreshold: number }>(null);
  const [roundNoteLabels, setRoundNoteLabels] = useState<string[]>([]);
  const roundDetectedRef = useRef<number[]>([]);
  const roundFramesRef = useRef<number[]>([]);
  const noteFrameCountRef = useRef(0);
  const capturingRef = useRef(false); // guards against the manual-mode handleFrame firing during auto mode

  const NOTE_STEP = 44;

  const handleFrame = useCallback(async (frame: TrackerFrame) => {
    setHz(frame.liveHz);
    if (frame.confirmedMidi >= 0) {
      const midi = frame.confirmedMidi;
      if (midi >= rangeStart && midi <= rangeEnd) {
        setNoteHistory(prev => {
          const next = [...prev, midi];
          if (next.length > 8) next.shift();
          return next;
        });
      }
    }
  }, [rangeStart, rangeEnd]);

  const beginRound = useCallback(async (notes: number[]) => {
    const params = await invoke<[number, number, number, number, boolean, number]>('cmd_calibration_current_params');
    const [st, rf, wf, gf, oc, yt] = params;
    await invoke('cmd_tracker_set_params', { silenceThreshold: st, requiredFrames: rf });
    await invoke('cmd_tracker_set_advanced_params', { graceFrames: gf, octaveCorrection: oc, yinThreshold: yt });
    roundDetectedRef.current = [];
    roundFramesRef.current = [];
    setRoundIndex(0);
    setCalibrating(true);
    await playSequence(notes, () => {}, () => {}, 100);
    await invoke('cmd_tracker_reset_with_warmup', { warmupFrames: wf });
    noteFrameCountRef.current = 0;
  }, [playSequence]);

  const startCalibrationRun = useCallback(async () => {
    setCalibrationDone(null);
    setCalibrationError(null);
    setBestScoreSoFar(null);
    setRoundNumber(1);
    capturingRef.current = true;
    const notes = await invoke<number[]>('cmd_calibration_start', {
      rangeStart, rangeEnd,
      silenceThreshold, requiredFrames: framesToConfirm, warmupFrames,
      graceFrames, octaveCorrection, yinThreshold,
    });
    setRoundNotes(notes);
    await beginRound(notes);
  }, [rangeStart, rangeEnd, silenceThreshold, framesToConfirm, warmupFrames, graceFrames, octaveCorrection, yinThreshold, beginRound]);

  // Resolve each round's MIDI notes to display labels (e.g. "C4") for the text
  // prompt, the same written/transposed label the rest of the app uses.
  useEffect(() => {
    if (roundNotes.length === 0) { setRoundNoteLabels([]); return; }
    let cancelled = false;
    Promise.all(roundNotes.map(m => invoke<string>('cmd_written_midi_label', { concertMidi: m, instrumentIndex })))
      .then(labels => { if (!cancelled) setRoundNoteLabels(labels); });
    return () => { cancelled = true; };
  }, [roundNotes, instrumentIndex]);

  // Shared by every path that ends a calibration run early or normally (perfect
  // round, plateau/round-cap convergence, no-signal abort, or the user's Stop
  // button): read whatever the session's best-scoring round was, apply it live,
  // and persist it for this instrument. `errorMessage` is non-null only for the
  // no-signal abort path — every other caller passes null (spec: Error handling
  // — "keep whatever was the best-scoring round so far" applies uniformly).
  const finishCalibration = useCallback(async (errorMessage: string | null) => {
    capturingRef.current = false;
    setCalibrating(false);
    const best = await invoke<[number, number, number, number, boolean, number]>('cmd_calibration_best_params');
    const [st, rf, wf, gf, oc, yt] = best;
    const result = { silenceThreshold: st, framesToConfirm: rf, warmupFrames: wf, graceFrames: gf, octaveCorrection: oc, yinThreshold: yt };
    onUpdateSettings(prev => ({
      ...prev,
      silenceThreshold: st, framesToConfirm: rf, warmupFrames: wf,
      graceFrames: gf, octaveCorrection: oc, yinThreshold: yt,
      calibrationParamsByInstrument: { ...prev.calibrationParamsByInstrument, [instrumentIndex]: result },
    }));
    await invoke('cmd_tracker_set_params', { silenceThreshold: st, requiredFrames: rf });
    await invoke('cmd_tracker_set_advanced_params', { graceFrames: gf, octaveCorrection: oc, yinThreshold: yt });
    setCalibrationDone(result);
    setCalibrationError(errorMessage);
  }, [instrumentIndex, onUpdateSettings]);

  const handleCalibrationFrame = useCallback(async (frame: TrackerFrame) => {
    if (!capturingRef.current) return;
    noteFrameCountRef.current += 1;
    let detected = -1;
    let frames = 0;
    if (frame.confirmedMidi >= 0) {
      detected = frame.confirmedMidi;
      frames = noteFrameCountRef.current;
    } else if (noteFrameCountRef.current >= 55 /* PER_NOTE_TIMEOUT_FRAMES */) {
      detected = -1;
      frames = 0;
    } else {
      return; // still listening for this note
    }

    roundDetectedRef.current = [...roundDetectedRef.current, detected];
    roundFramesRef.current = [...roundFramesRef.current, frames];
    await invoke('cmd_tracker_reset');
    noteFrameCountRef.current = 0;

    if (roundDetectedRef.current.length < roundNotes.length) {
      setRoundIndex(i => i + 1);
      return;
    }

    // Round complete — score it and either move on, finish, or abort on silence.
    const [converged, nextNotes] = await invoke<[boolean, number[]]>('cmd_calibration_record_round', {
      detected: roundDetectedRef.current,
      framesToConfirm: roundFramesRef.current,
    });
    const score = await invoke<number>('cmd_calibration_best_score');
    setBestScoreSoFar(score);

    const noSignal = await invoke<boolean>('cmd_calibration_last_round_no_signal');
    if (noSignal) {
      await finishCalibration('No sound detected — check mic permissions/input.');
      return;
    }
    if (converged) {
      await finishCalibration(null);
    } else {
      setRoundNumber(n => n + 1);
      setRoundNotes(nextNotes);
      beginRound(nextNotes);
    }
  }, [roundNotes, beginRound, finishCalibration]);

  const stopCalibration = useCallback(async () => {
    await finishCalibration(null);
  }, [finishCalibration]);

  // Load instrument transposition semitones and apply instrument-specific tracker params.
  const [transpSemitones, setTranspSemitones] = useState(0);
  useEffect(() => {
    invoke<string>('cmd_instrument_list')
      .then(json => {
        const list = JSON.parse(json) as InstrumentInfo[];
        setTranspSemitones(list[instrumentIndex]?.semitones ?? 0);
        void invoke('cmd_tracker_apply_instrument', { instrumentIndex });
      })
      .catch(() => {});
  }, [instrumentIndex]);

  // Configure tracker on entry, then auto-start with the callback for the active
  // mode.  Full cleanup on unmount, and also re-runs on mode switch (tearing down
  // and restarting capture with the right callback).
  useEffect(() => {
    void invoke('cmd_tracker_set_params', { silenceThreshold, requiredFrames: framesToConfirm });
    void invoke('cmd_tracker_set_advanced_params', { graceFrames, octaveCorrection, yinThreshold });
    void invoke('cmd_tracker_reset_with_warmup', { warmupFrames });
    start(mode === 'auto' ? handleCalibrationFrame : handleFrame);
    return () => {
      // Spec (Error handling): navigating away or switching back to Manual
      // mid-run must not silently discard progress — keep whatever was the
      // best-scoring round so far, same as an explicit Stop. Fire-and-forget:
      // this cleanup can't be async, and the component may already be
      // unmounting, but the invoke calls and onUpdateSettings still complete.
      if (capturingRef.current) {
        void finishCalibration(null);
      }
      stop();
      void invoke('cmd_tracker_reset');
      destroy();
    };
  }, [start, stop, destroy, handleFrame, handleCalibrationFrame, finishCalibration, mode]);

  const transpMidi = (midi: number) => Math.max(0, Math.min(127, midi + transpSemitones));
  // Staff notation shows written pitch, like a transposing instrument's part.
  const displayHistory = noteHistory.map(transpMidi);
  const instrKeyTranspose = ((transpSemitones % 12) + 12) % 12;
  const effChroma = (effectiveKeyChroma(rootChroma, scaleId) + instrKeyTranspose) % 12;

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="btn-back" onClick={onBack}>{'←'} Back</button>
        <span className="screen-title">Mic Setup</span>
      </div>

      <div className="segmented-control" role="tablist">
        <button role="tab" aria-selected={mode === 'manual'}
          className={`segment ${mode === 'manual' ? 'segment-selected' : ''}`}
          onClick={() => setMode('manual')}>Manual</button>
        <button role="tab" aria-selected={mode === 'auto'}
          className={`segment ${mode === 'auto' ? 'segment-selected' : ''}`}
          onClick={() => setMode('auto')}>Auto-Calibrate</button>
      </div>

      <p className="setup-instruction">Play a note to test your microphone.</p>

      <div className="listening-indicator">
        <span className="listening-ear">👂</span>
        <span className="listening-label">Listening…</span>
      </div>

      <MusicStaff
        notes={displayHistory.map((midi, index) => ({
          midi,
          state: index === displayHistory.length - 1 ? 'active' : 'expected',
        }))}
        fixedSpacing={NOTE_STEP}
        rootChroma={effChroma}
        keySignatureMode={keySignatureMode}
      />

      {/* The pitch meter alone carries "what's being detected right now" below the
          staff — the large note-name/Hz text that used to sit here was removed to
          make room for the always-visible Pitch Detection controls, without this
          screen needing to scroll. */}
      <div className="pitch-meter-circle">
        <PitchMeter hz={hz} />
      </div>

      {mode === 'manual' && (
        <div style={{ marginTop: 16 }}>
          <span className="section-label" style={{ marginTop: 0 }}>Mic Sensitivity<TooltipIcon tooltipKey="mic_sensitivity" /></span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="range" min={1} max={10} step={1}
              value={Math.round((0.011 - silenceThreshold) / 0.001)}
              onChange={e => set('silenceThreshold', parseFloat((0.011 - parseInt(e.target.value) * 0.001).toFixed(3)))}
              style={{ flex: 1 }} />
            <span style={{ minWidth: 40, fontSize: 13, color: '#212121' }}>{Math.round((0.011 - silenceThreshold) / 0.001)} / 10</span>
          </div>

          <span className="section-label">Note Stability (frames to confirm)<TooltipIcon tooltipKey="note_stability" /></span>
          <div className="chip-row">
            {STABILITY_OPTIONS.map(n => (
              <button key={n} type="button"
                className={`chip ${framesToConfirm === n ? 'chip-selected' : ''}`}
                onClick={() => set('framesToConfirm', n)}>{n}</button>
            ))}
          </div>

          <span className="section-label">Mic Warmup Frames<TooltipIcon tooltipKey="mic_warmup_frames" /></span>
          <div className="chip-row">
            {WARMUP_OPTIONS.map(n => (
              <button key={n} type="button"
                className={`chip ${warmupFrames === n ? 'chip-selected' : ''}`}
                onClick={() => set('warmupFrames', n)}>{n}</button>
            ))}
          </div>

          <button type="button" className="advanced-toggle" onClick={() => setAdvancedOpen(o => !o)}>
            {advancedOpen ? '▾' : '▸'} Advanced
          </button>
          {advancedOpen && (
            <div className="advanced-section">
              <span className="section-label">Grace Frames<TooltipIcon tooltipKey="grace_frames" /></span>
              <div className="chip-row">
                {[0, 1, 2, 3, 4, 5, 6].map(n => (
                  <button key={n} type="button"
                    className={`chip ${graceFrames === n ? 'chip-selected' : ''}`}
                    onClick={() => { set('graceFrames', n); void invoke('cmd_tracker_set_advanced_params', { graceFrames: n, octaveCorrection, yinThreshold }); }}>{n}</button>
                ))}
              </div>

              <span className="section-label">Octave Correction<TooltipIcon tooltipKey="octave_correction" /></span>
              <label className="switch-row">
                <input type="checkbox" checked={octaveCorrection}
                  onChange={e => { set('octaveCorrection', e.target.checked); void invoke('cmd_tracker_set_advanced_params', { graceFrames, octaveCorrection: e.target.checked, yinThreshold }); }} />
              </label>

              <span className="section-label">YIN Threshold<TooltipIcon tooltipKey="yin_threshold" /></span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input type="range" min={0.05} max={0.30} step={0.01}
                  value={yinThreshold}
                  onChange={e => { const v = parseFloat(e.target.value); set('yinThreshold', v); void invoke('cmd_tracker_set_advanced_params', { graceFrames, octaveCorrection, yinThreshold: v }); }}
                  style={{ flex: 1 }} />
                <span style={{ minWidth: 40, fontSize: 13, color: '#212121' }}>{yinThreshold.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'auto' && (
        <div style={{ marginTop: 16 }}>
          {!calibrating && !calibrationDone && (
            <button type="button" className="btn-primary" onClick={() => void startCalibrationRun()}>
              Start Auto-Calibrate
            </button>
          )}
          {calibrating && (
            <>
              <p className="setup-instruction">Round {roundNumber} — Play: {roundNoteLabels.length === roundNotes.length ? roundNoteLabels.join(' → ') : '…'}</p>
              <p className="setup-instruction" style={{ fontSize: 13, opacity: 0.7 }}>Note {roundIndex + 1} of {roundNotes.length}</p>
              {bestScoreSoFar !== null && (
                <p className="setup-instruction" style={{ fontSize: 13, opacity: 0.7 }}>Best so far: {Math.round(bestScoreSoFar * 100)}%</p>
              )}
              <button type="button" className="btn-secondary" onClick={() => void stopCalibration()}>Stop</button>
            </>
          )}
          {calibrationDone && (
            <div>
              {calibrationError ? (
                <p className="setup-instruction" style={{ color: '#b00020' }}>{calibrationError}</p>
              ) : (
                <p className="setup-instruction">Calibration complete for this instrument.</p>
              )}
              <p style={{ fontSize: 13 }}>
                {calibrationError ? 'Best result kept: ' : ''}Sensitivity threshold {calibrationDone.silenceThreshold.toFixed(4)}, stability {calibrationDone.framesToConfirm}, warmup {calibrationDone.warmupFrames}, grace {calibrationDone.graceFrames}, octave correction {calibrationDone.octaveCorrection ? 'on' : 'off'}, YIN {calibrationDone.yinThreshold.toFixed(2)}.
              </p>
              <button type="button" className="btn-secondary" onClick={() => setMode('manual')}>View in Manual</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
