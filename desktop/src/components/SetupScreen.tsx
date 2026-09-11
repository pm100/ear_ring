import React, { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import PitchMeter from './PitchMeter';
import MusicStaff from './MusicStaff';
import { useAudioCapture, TrackerFrame } from '../hooks/useAudioCapture';
import { ExerciseSettings, StaffNoteState } from '../types';
import { TooltipIcon } from './Tooltip';

const STABILITY_OPTIONS = [2, 3, 4, 5];
const WARMUP_OPTIONS = [0, 1, 2, 3, 4, 5, 6];
// Auto-Calibrate capture timing (wall-clock, not frame-counted): no audio is
// played and there's no rush to start — the user begins whenever they're
// ready. These bound how long we're willing to wait for that to happen.
const ONSET_TIMEOUT_MS = 25000;   // max time to wait for the user to start playing a note at all
const CONFIRM_TIMEOUT_MS = 15000; // max additional time, after onset, to reach a stable confirmed note
const TRAILING_QUIET_MS = 1000;   // fixed pause after a note confirms, before moving on

interface InstrumentInfo { id: number; name: string; semitones: number; graceFrames: number; octaveCorrection: boolean; }
// Global default for yin_threshold: DEFAULT_YIN_THRESHOLD in rust/src/pitch_detection.rs.
// apply_instrument never touches yin_threshold (it has no per-instrument INSTRUMENTS-table
// entry, unlike grace_frames/octave_correction), so an uncalibrated instrument switch falls
// back to this literal rather than a flat setting possibly left over from a different
// instrument (or a different instrument's saved calibration).
const DEFAULT_YIN_THRESHOLD = 0.15;
interface CalibratedParams {
  silenceThreshold: number;
  framesToConfirm: number;
  warmupFrames: number;
  graceFrames: number;
  octaveCorrection: boolean;
  yinThreshold: number;
}

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
  calibrationParamsByInstrument?: Record<number, CalibratedParams>;
}

export default function SetupScreen({ onBack, onUpdateSettings, rangeStart, rangeEnd, rootChroma = 0, scaleId = 0, keySignatureMode = 0, silenceThreshold = 0.003, framesToConfirm = 3, warmupFrames = 4, instrumentIndex = 0, graceFrames = 3, octaveCorrection = false, yinThreshold = 0.15, calibrationParamsByInstrument = {} }: Props) {
  // Spec (design doc "Manual edits ... update that instrument's saved params
  // directly"): a manual tweak to any of the 6 controls (basic or Advanced) must
  // also land in calibrationParamsByInstrument[instrumentIndex] — the same map an
  // Auto-Calibrate run writes to (finishCalibration) — so it's one params record
  // per instrument regardless of source, and survives an instrument switch.
  const setAndPersist = <K extends keyof ExerciseSettings>(key: K, value: ExerciseSettings[K]) => {
    onUpdateSettings(prev => {
      const next = { ...prev, [key]: value };
      const current: CalibratedParams = {
        silenceThreshold: next.silenceThreshold,
        framesToConfirm: next.framesToConfirm,
        warmupFrames: next.warmupFrames,
        graceFrames: next.graceFrames,
        octaveCorrection: next.octaveCorrection,
        yinThreshold: next.yinThreshold,
      };
      return {
        ...next,
        calibrationParamsByInstrument: { ...next.calibrationParamsByInstrument, [instrumentIndex]: current },
      };
    });
  };

  const [hz, setHz] = useState(0);
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [noteHistory, setNoteHistory] = useState<number[]>([]);
  const { start, stop, destroy } = useAudioCapture();

  const [roundNotes, setRoundNotes] = useState<number[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);      // which note within the round we're listening for
  const [roundNumber, setRoundNumber] = useState(0);
  const [roundCap, setRoundCap] = useState(0);
  const [calibrating, setCalibrating] = useState(false);
  const [bestScoreSoFar, setBestScoreSoFar] = useState<number | null>(null);
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [calibrationDone, setCalibrationDone] = useState<null | CalibratedParams>(null);
  const [roundNoteLabels, setRoundNoteLabels] = useState<string[]>([]);
  const roundDetectedRef = useRef<number[]>([]);
  const roundFramesRef = useRef<number[]>([]);
  const noteFrameCountRef = useRef(0);
  // Per-note capture wait phase. A ref for the frame callback's synchronous
  // logic (mirrored into state below purely so the UI text can react to it).
  type WaitPhase = 'waiting_onset' | 'waiting_confirm' | 'waiting_quiet';
  const waitPhaseRef = useRef<WaitPhase | null>(null);
  const [waitPhase, setWaitPhase] = useState<WaitPhase | null>(null);
  // Wall-clock timestamps (Date.now()) for the current note's two timeouts:
  // noteStartTimeRef marks when we started waiting for onset (also the basis
  // for the elapsed-time indicator), onsetTimeRef marks when onset happened.
  const noteStartTimeRef = useRef(0);
  const onsetTimeRef = useRef(0);
  const [waitElapsedSec, setWaitElapsedSec] = useState(0);
  const waitElapsedSecRef = useRef(0);
  // Handle for the trailing-quiet setTimeout that finalizes a just-confirmed
  // note, so Stop/unmount/mode-switch can cancel a still-pending one.
  const quietTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True only while the current note's listening window is genuinely open —
  // false while a round is being scored and during the trailing-quiet pause
  // after a note confirms, so handleCalibrationFrame ignores frames outside
  // the window it's actually deciding for.
  const capturingRef = useRef(false);
  // True from the moment a round's last note lands until the next round's
  // listening window opens, so the long IPC chain that scores a round can't be
  // entered twice for the same round.
  const roundCompletingRef = useRef(false);
  // True for a whole run (start → finish), including the prompt/settle windows
  // where capturingRef is false. Leaving the screen or the Auto tab mid-run has
  // to end the run; capturingRef is too narrow to detect that.
  const runActiveRef = useRef(false);
  // Bumped whenever a run starts or ends — invalidates in-flight async work
  // (the onset/confirm timeout checks and the trailing-quiet timer) belonging
  // to a run that's over.
  const runGenRef = useRef(0);
  // Latest-ref for the saved-calibration map so the instrument effect below can
  // read it without re-running every time an unrelated setting changes.
  const savedCalibrationRef = useRef(calibrationParamsByInstrument);
  savedCalibrationRef.current = calibrationParamsByInstrument;

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

  // Shared by every path that ends a calibration run early or normally (perfect
  // round, plateau/round-cap convergence, no-signal abort, an IPC failure, or the
  // user's Stop button): read whatever the session's best-scoring round was, apply
  // it live, and persist it for this instrument. `errorMessage` is non-null for the
  // no-signal abort and IPC-failure paths — every other caller passes null (spec:
  // Error handling — "keep whatever was the best-scoring round so far" applies
  // uniformly).
  const finishCalibration = useCallback(async (errorMessage: string | null) => {
    runActiveRef.current = false;
    runGenRef.current += 1;
    capturingRef.current = false;
    roundCompletingRef.current = false;
    // A pending trailing-quiet timer must not fire after the run has ended —
    // it would finalize a note into a session that no longer exists.
    if (quietTimerRef.current !== null) {
      clearTimeout(quietTimerRef.current);
      quietTimerRef.current = null;
    }
    waitPhaseRef.current = null;
    setWaitPhase(null);
    setCalibrating(false);
    try {
      const best = await invoke<[number, number, number, number, boolean, number]>('cmd_calibration_best_params');
      const [st, rf, wf, gf, oc, yt] = best;
      const result: CalibratedParams = { silenceThreshold: st, framesToConfirm: rf, warmupFrames: wf, graceFrames: gf, octaveCorrection: oc, yinThreshold: yt };
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
    } catch (e) {
      // A rejected command (e.g. the session was never started) must not leave the
      // screen stuck mid-run — surface it and fall back to the existing settings.
      setCalibrationDone(null);
      setCalibrationError(errorMessage ?? `Calibration could not be saved: ${String(e)}`);
    } finally {
      capturingRef.current = false;
      roundCompletingRef.current = false;
    }
  }, [instrumentIndex, onUpdateSettings]);

  // Opens the listening window for one note within the current round: resets
  // this note's per-note bookkeeping (frame count, wait phase, timeout clocks,
  // elapsed-time display) and starts the onset wait. Guarded by myGen so a
  // round transition or Stop that raced ahead of us can't reopen a window for
  // a run that's already over.
  const beginNoteWait = useCallback((myGen: number) => {
    if (runGenRef.current !== myGen) return;
    noteFrameCountRef.current = 0;
    noteStartTimeRef.current = Date.now();
    onsetTimeRef.current = 0;
    waitPhaseRef.current = 'waiting_onset';
    setWaitPhase('waiting_onset');
    waitElapsedSecRef.current = 0;
    setWaitElapsedSec(0);
    capturingRef.current = true;
  }, []);

  const beginRound = useCallback(async (notes: number[]) => {
    const myGen = runGenRef.current;
    // Nothing is captured until this round's params are pushed to the tracker
    // and it's been reset — set synchronously, before any await.
    capturingRef.current = false;
    roundCompletingRef.current = false;
    roundDetectedRef.current = [];
    roundFramesRef.current = [];
    setRoundIndex(0);
    setCalibrating(true);

    let params: [number, number, number, number, boolean, number];
    try {
      params = await invoke<[number, number, number, number, boolean, number]>('cmd_calibration_current_params');
    } catch (e) {
      await finishCalibration(`Calibration stopped: ${String(e)}`);
      return;
    }
    if (runGenRef.current !== myGen) return;
    const [st, rf, wf, gf, oc, yt] = params;
    await invoke('cmd_tracker_set_params', { silenceThreshold: st, requiredFrames: rf });
    await invoke('cmd_tracker_set_advanced_params', { graceFrames: gf, octaveCorrection: oc, yinThreshold: yt });
    if (runGenRef.current !== myGen) return;

    // No reference audio is played (Auto-Calibrate shows the target note(s)
    // as text + on the staff only) — go straight to warming up the tracker and
    // opening the onset wait for the round's first note.
    await invoke('cmd_tracker_reset_with_warmup', { warmupFrames: wf });
    if (runGenRef.current !== myGen) return;
    beginNoteWait(myGen);
  }, [finishCalibration, beginNoteWait]);

  // Shared by every path that ends a single note's capture: the onset timeout,
  // the confirm timeout, and the trailing-quiet timer after a note confirms.
  // Appends to the round's detected-notes accumulator, resets the tracker, and
  // either advances to the next note within the round or scores the whole
  // round. `myGen` must be the runGenRef value captured when the note's wait
  // began (or when the caller's timer was scheduled) — a run that has since
  // ended (Stop/unmount/mode-switch) must not finalize into it.
  const finalizeNote = useCallback(async (myGen: number, detected: number, frames: number) => {
    if (runGenRef.current !== myGen) return;
    // Close this note's window and cancel any pending trailing-quiet timer
    // before any await, so a stray frame or a second timer firing can't
    // finalize the same note twice.
    capturingRef.current = false;
    waitPhaseRef.current = null;
    setWaitPhase(null);
    if (quietTimerRef.current !== null) {
      clearTimeout(quietTimerRef.current);
      quietTimerRef.current = null;
    }

    roundDetectedRef.current = [...roundDetectedRef.current, detected];
    roundFramesRef.current = [...roundFramesRef.current, frames];
    const roundComplete = roundDetectedRef.current.length >= roundNotes.length;
    if (roundComplete) {
      // Close the round's listening window before the first await, same
      // reasoning as before: scoring a round spans several IPC round-trips.
      roundCompletingRef.current = true;
    }
    await invoke('cmd_tracker_reset');
    if (runGenRef.current !== myGen) return;

    if (!roundComplete) {
      setRoundIndex(i => i + 1);
      beginNoteWait(myGen);
      return;
    }

    // Round complete — score it and either move on, finish, or abort on silence.
    try {
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
        return;
      }
      setRoundNumber(n => n + 1);
      setRoundNotes(nextNotes);
      void beginRound(nextNotes);
    } catch (e) {
      await finishCalibration(`Calibration stopped: ${String(e)}`);
    }
  }, [roundNotes, beginRound, beginNoteWait, finishCalibration]);

  const startCalibrationRun = useCallback(async () => {
    setCalibrationDone(null);
    setCalibrationError(null);
    setBestScoreSoFar(null);
    setRoundNumber(1);
    let notes: number[];
    try {
      notes = await invoke<number[]>('cmd_calibration_start', {
        rangeStart, rangeEnd, rootChroma, scaleId,
        silenceThreshold, requiredFrames: framesToConfirm, warmupFrames,
        graceFrames, octaveCorrection, yinThreshold,
      });
    } catch (e) {
      // Nothing to clean up: no session exists, and capturing was never enabled.
      setCalibrating(false);
      setCalibrationError(`Could not start calibration: ${String(e)}`);
      return;
    }
    // Only now is there a session for the teardown paths to read from.
    runGenRef.current += 1;
    runActiveRef.current = true;
    setRoundNotes(notes);
    await beginRound(notes);
  }, [rangeStart, rangeEnd, rootChroma, scaleId, silenceThreshold, framesToConfirm, warmupFrames, graceFrames, octaveCorrection, yinThreshold, beginRound]);

  // Resolve each round's MIDI notes to dual-label display strings, "{written}
  // ({concert})" — e.g. "D (C4)" for tenor sax, "C (C4)" for piano — combining
  // the bare written note name (no octave; transposed for the instrument) with
  // the key-aware concert-pitch label (with octave, respecting the selected
  // key's sharp/flat spelling).
  useEffect(() => {
    if (roundNotes.length === 0) { setRoundNoteLabels([]); return; }
    let cancelled = false;
    Promise.all(roundNotes.map(async m => {
      const [written, concert] = await Promise.all([
        invoke<string>('cmd_written_note_name', { concertChroma: m % 12, instrumentIndex }),
        invoke<string>('cmd_preferred_midi_label', { midi: m, rootChroma }),
      ]);
      return `${written} (${concert})`;
    }))
      .then(labels => { if (!cancelled) setRoundNoteLabels(labels); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [roundNotes, instrumentIndex, rootChroma]);

  // Spec: "Round 2 of 8" — ROUND_CAP lives in the Rust core.
  useEffect(() => {
    invoke<number>('cmd_calibration_round_cap').then(setRoundCap).catch(() => {});
  }, []);

  // Auto-Calibrate's per-frame handler: no audio timeout here beyond the two
  // wall-clock safety timers below — the user sets the pace. `capturingRef`
  // gates whether the current note's window is open at all (false during the
  // trailing-quiet pause and while a round is being scored), and `waitPhaseRef`
  // tracks which of the two waits (onset / confirm) we're in for this note.
  const handleCalibrationFrame = useCallback((frame: TrackerFrame) => {
    if (!capturingRef.current || roundCompletingRef.current) return;
    noteFrameCountRef.current += 1;
    const myGen = runGenRef.current;
    const phase = waitPhaseRef.current;
    const now = Date.now();

    if (phase === 'waiting_onset' || phase === 'waiting_confirm') {
      const elapsedSec = Math.floor((now - noteStartTimeRef.current) / 1000);
      if (elapsedSec !== waitElapsedSecRef.current) {
        waitElapsedSecRef.current = elapsedSec;
        setWaitElapsedSec(elapsedSec);
      }
    }

    if (phase === 'waiting_onset') {
      // Onset = the moment ANY live pitch reading shows up for this note, even
      // before it's stability-confirmed — that's the user starting to play.
      if (frame.liveMidi >= 0) {
        onsetTimeRef.current = now;
        waitPhaseRef.current = 'waiting_confirm';
        setWaitPhase('waiting_confirm');
        return;
      }
      if (now - noteStartTimeRef.current >= ONSET_TIMEOUT_MS) {
        // Nobody ever started playing this note — give up and move on.
        capturingRef.current = false;
        void finalizeNote(myGen, -1, 0);
      }
      return;
    }

    if (phase === 'waiting_confirm') {
      // Stability confirmation itself is unchanged (the Rust tracker's
      // required_frames logic) — this only bounds how long we'll wait for it.
      if (frame.confirmedMidi >= 0) {
        const detected = frame.confirmedMidi;
        const frames = noteFrameCountRef.current;
        capturingRef.current = false;
        waitPhaseRef.current = 'waiting_quiet';
        setWaitPhase('waiting_quiet');
        // Don't rush to the next note: a fixed trailing-quiet pause, not a
        // continuous-silence monitor — the note is already correctly captured.
        quietTimerRef.current = setTimeout(() => {
          if (runGenRef.current !== myGen) return;
          void finalizeNote(myGen, detected, frames);
        }, TRAILING_QUIET_MS);
        return;
      }
      if (now - onsetTimeRef.current >= CONFIRM_TIMEOUT_MS) {
        // Onset happened but the pitch never stabilized — treat as missed.
        capturingRef.current = false;
        void finalizeNote(myGen, -1, 0);
      }
      return;
    }
    // 'waiting_quiet' (or idle): nothing to do per-frame; the scheduled
    // trailing-quiet timeout above handles finalization.
  }, [finalizeNote]);

  const stopCalibration = useCallback(async () => {
    await finishCalibration(null);
  }, [finishCalibration]);

  // Instrument change (and mount): apply the INSTRUMENTS table's defaults, then
  // this instrument's saved Auto-Calibrate result on top of them, if it has one —
  // without this the calibrated values were written to settings and never read
  // back. apply_instrument is awaited (not fired inside cmd_instrument_list's
  // .then) so it can't land after the param push below and silently revert
  // grace_frames/octave_correction; bumping instrumentEpoch at the end re-runs
  // that push after this whole sequence, never under it.
  const [transpSemitones, setTranspSemitones] = useState(0);
  const [instrumentEpoch, setInstrumentEpoch] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let list: InstrumentInfo[] = [];
      try {
        const json = await invoke<string>('cmd_instrument_list');
        if (cancelled) return;
        list = JSON.parse(json) as InstrumentInfo[];
        setTranspSemitones(list[instrumentIndex]?.semitones ?? 0);
      } catch {
        // Keep the last known transposition rather than snapping to concert pitch.
      }
      if (cancelled) return;
      try {
        await invoke('cmd_tracker_apply_instrument', { instrumentIndex });
      } catch {
        // Non-fatal: the param push below still runs.
      }
      if (cancelled) return;
      const saved = savedCalibrationRef.current?.[instrumentIndex];
      if (saved) {
        onUpdateSettings(prev => ({
          ...prev,
          silenceThreshold: saved.silenceThreshold,
          framesToConfirm: saved.framesToConfirm,
          warmupFrames: saved.warmupFrames,
          graceFrames: saved.graceFrames,
          octaveCorrection: saved.octaveCorrection,
          yinThreshold: saved.yinThreshold,
        }));
      } else {
        // Never calibrated: apply_instrument (above) already set grace_frames/
        // octave_correction correctly from the Rust INSTRUMENTS table — mirror those
        // into settings (not the flat graceFrames/octaveCorrection props, which can be
        // stale leftovers from whichever instrument was previously selected/calibrated)
        // so the push effect below and the displayed values match what the tracker
        // actually holds. yin_threshold has no table entry, so it gets the app-wide
        // default instead of a possibly-stale flat value.
        const info = list[instrumentIndex];
        onUpdateSettings(prev => ({
          ...prev,
          graceFrames: info?.graceFrames ?? prev.graceFrames,
          octaveCorrection: info?.octaveCorrection ?? prev.octaveCorrection,
          yinThreshold: DEFAULT_YIN_THRESHOLD,
        }));
      }
      setInstrumentEpoch(e => e + 1);
    })();
    return () => { cancelled = true; };
  }, [instrumentIndex, onUpdateSettings]);

  // The single owner of "the tracker's live config matches what this screen
  // displays". Manual edits, the per-instrument load above and the end of an
  // Auto-Calibrate run all just write settings; this pushes them. Skipped while a
  // run is in flight — there beginRound owns the tracker's params per round.
  useEffect(() => {
    if (calibrating) return;
    void invoke('cmd_tracker_set_params', { silenceThreshold, requiredFrames: framesToConfirm });
    void invoke('cmd_tracker_set_advanced_params', { graceFrames, octaveCorrection, yinThreshold });
    void invoke('cmd_tracker_reset_with_warmup', { warmupFrames });
  }, [instrumentEpoch, calibrating, silenceThreshold, framesToConfirm, warmupFrames, graceFrames, octaveCorrection, yinThreshold]);

  // Latest-ref pattern: dispatch always calls whichever handler is current
  // without the pipeline effect itself depending on handleFrame/handleCalibrationFrame
  // (both of which get new identities every round via handleCalibrationFrame's
  // roundNotes dependency) — otherwise the effect would tear down and re-run
  // mid-round. `mode` is read the same way, so switching tabs picks a different
  // handler without touching the microphone.
  const handleFrameRef = useRef(handleFrame);
  const handleCalibrationFrameRef = useRef(handleCalibrationFrame);
  const modeRef = useRef(mode);
  const finishCalibrationRef = useRef(finishCalibration);
  handleFrameRef.current = handleFrame;
  handleCalibrationFrameRef.current = handleCalibrationFrame;
  modeRef.current = mode;
  finishCalibrationRef.current = finishCalibration;

  // Audio pipeline: acquired once per mount, released on unmount. `mode` is
  // deliberately NOT a dependency — destroy() closes the AudioContext and stops
  // the media stream, and useAudioCapture's header documents why that
  // release/reacquire cycle (transient noise, detection glitches) is worth
  // avoiding. A tab switch only changes which handler dispatch calls.
  useEffect(() => {
    const dispatch = (frame: TrackerFrame) => {
      if (modeRef.current === 'auto') {
        void handleCalibrationFrameRef.current(frame);
      } else {
        void handleFrameRef.current(frame);
      }
    };
    void start(dispatch);
    return () => {
      stop();
      void invoke('cmd_tracker_reset');
      destroy();
    };
  }, [start, stop, destroy]);

  // Spec (Error handling): switching back to Manual mid-run must not silently
  // discard progress — keep whatever was the best-scoring round so far, same as an
  // explicit Stop. Separate from the pipeline effect so ending a run never costs a
  // microphone teardown.
  useEffect(() => {
    if (mode === 'auto') return;
    if (runActiveRef.current) void finishCalibrationRef.current(null);
  }, [mode]);

  // Same, for navigating away entirely. Fire-and-forget: cleanup can't be async
  // and the component may already be unmounting, but the invoke calls and
  // onUpdateSettings still complete.
  useEffect(() => () => {
    if (runActiveRef.current) void finishCalibrationRef.current(null);
  }, []);

  const transpMidi = (midi: number) => Math.max(0, Math.min(127, midi + transpSemitones));
  // Staff notation shows written pitch, like a transposing instrument's part.
  const displayHistory = noteHistory.map(transpMidi);
  const instrKeyTranspose = ((transpSemitones % 12) + 12) % 12;
  const effChroma = (effectiveKeyChroma(rootChroma, scaleId) + instrKeyTranspose) % 12;
  const showingRoundPrompt = mode === 'auto' && calibrating && roundNotes.length > 0;
  // M6: a calibrated silenceThreshold can go below 0.001 (clamp floor 0.0005),
  // which renders as "11 / 10" and pins the slider past its max. Display only —
  // the stored threshold keeps its real value.
  const sensitivityDisplay = Math.min(10, Math.max(1, Math.round((0.011 - silenceThreshold) / 0.001)));

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

      {/* Mode-aware: the live meter and "Listening…" indicator only mean anything
          in Manual mode — only manual-mode's handleFrame feeds setHz, so in Auto
          mode the meter would sit frozen and the instruction wouldn't match what
          the screen is actually doing. */}
      <p className="setup-instruction">
        {mode === 'manual'
          ? 'Play a note to test your microphone.'
          : 'Auto-Calibrate shows a few notes — play each one on your instrument, at your own pace.'}
      </p>

      {mode === 'manual' && (
        <div className="listening-indicator">
          <span className="listening-ear">👂</span>
          <span className="listening-label">Listening…</span>
        </div>
      )}

      {/* Spec (Global Constraints): calibration prompts appear both as text and on
          the staff, so Auto mode shows the round's target notes here as an
          expected-sequence preview with the note being listened for marked. */}
      <MusicStaff
        notes={showingRoundPrompt
          ? roundNotes.map((midi, index) => ({
              midi: transpMidi(midi),
              state: (index === roundIndex ? 'active' : 'expected') as StaffNoteState,
            }))
          : displayHistory.map((midi, index) => ({
              midi,
              state: (index === displayHistory.length - 1 ? 'active' : 'expected') as StaffNoteState,
            }))}
        fixedSpacing={NOTE_STEP}
        rootChroma={effChroma}
        keySignatureMode={keySignatureMode}
      />

      {/* The pitch meter alone carries "what's being detected right now" below the
          staff — the large note-name/Hz text that used to sit here was removed to
          make room for the always-visible Pitch Detection controls, without this
          screen needing to scroll. */}
      {mode === 'manual' && (
        <div className="pitch-meter-circle">
          <PitchMeter hz={hz} />
        </div>
      )}

      {mode === 'manual' && (
        <div style={{ marginTop: 16 }}>
          <span className="section-label" style={{ marginTop: 0 }}>Mic Sensitivity<TooltipIcon tooltipKey="mic_sensitivity" /></span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="range" min={1} max={10} step={1}
              value={sensitivityDisplay}
              onChange={e => setAndPersist('silenceThreshold', parseFloat((0.011 - parseInt(e.target.value) * 0.001).toFixed(3)))}
              style={{ flex: 1 }} />
            <span style={{ minWidth: 40, fontSize: 13, color: '#212121' }}>{sensitivityDisplay} / 10</span>
          </div>

          <span className="section-label">Note Stability (frames to confirm)<TooltipIcon tooltipKey="note_stability" /></span>
          <div className="chip-row">
            {STABILITY_OPTIONS.map(n => (
              <button key={n} type="button"
                className={`chip ${framesToConfirm === n ? 'chip-selected' : ''}`}
                onClick={() => setAndPersist('framesToConfirm', n)}>{n}</button>
            ))}
          </div>

          <span className="section-label">Mic Warmup Frames<TooltipIcon tooltipKey="mic_warmup_frames" /></span>
          <div className="chip-row">
            {WARMUP_OPTIONS.map(n => (
              <button key={n} type="button"
                className={`chip ${warmupFrames === n ? 'chip-selected' : ''}`}
                onClick={() => setAndPersist('warmupFrames', n)}>{n}</button>
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
                    onClick={() => setAndPersist('graceFrames', n)}>{n}</button>
                ))}
              </div>

              <span className="section-label">Octave Correction<TooltipIcon tooltipKey="octave_correction" /></span>
              <label className="switch-row">
                <input type="checkbox" checked={octaveCorrection}
                  onChange={e => setAndPersist('octaveCorrection', e.target.checked)} />
              </label>

              <span className="section-label">YIN Threshold<TooltipIcon tooltipKey="yin_threshold" /></span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input type="range" min={0.05} max={0.30} step={0.01}
                  value={yinThreshold}
                  onChange={e => setAndPersist('yinThreshold', parseFloat(e.target.value))}
                  style={{ flex: 1 }} />
                <span style={{ minWidth: 40, fontSize: 13, color: '#212121' }}>{yinThreshold.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'auto' && (
        <div style={{ marginTop: 16 }}>
          {calibrating ? (
            <>
              <p className="setup-instruction">
                Round {roundNumber}{roundCap > 0 ? ` of ${roundCap}` : ''} — Play: {roundNoteLabels.length === roundNotes.length ? roundNoteLabels.join(' → ') : '…'}
              </p>
              <p className="setup-instruction" style={{ fontSize: 13, opacity: 0.7 }}>Note {roundIndex + 1} of {roundNotes.length}</p>
              {/* Visible feedback that the app IS listening (no audio plays, and
                  there's no rush to start) rather than frozen. */}
              <p className="setup-instruction" style={{ fontSize: 13, opacity: 0.7 }}>
                {waitPhase === 'waiting_onset' && `Waiting for you to start… ${waitElapsedSec}s`}
                {waitPhase === 'waiting_confirm' && `Listening… ${waitElapsedSec}s`}
                {waitPhase === 'waiting_quiet' && 'Got it!'}
              </p>
              {bestScoreSoFar !== null && (
                <p className="setup-instruction" style={{ fontSize: 13, opacity: 0.7 }}>Best so far: {Math.round(bestScoreSoFar * 100)}%</p>
              )}
              <button type="button" className="btn-secondary" onClick={() => void stopCalibration()}>Stop</button>
            </>
          ) : (
            <>
              {/* Rendered independently of calibrationDone: a rejected command ends the
                  run with an error and nothing to show, and that must still be visible
                  rather than silently returning to the start button. */}
              {calibrationError && (
                <p className="setup-instruction" style={{ color: '#b00020' }}>{calibrationError}</p>
              )}
              {calibrationDone ? (
                <div>
                  {!calibrationError && (
                    <p className="setup-instruction">Calibration complete for this instrument.</p>
                  )}
                  <p style={{ fontSize: 13 }}>
                    {calibrationError ? 'Best result kept: ' : ''}Sensitivity threshold {calibrationDone.silenceThreshold.toFixed(4)}, stability {calibrationDone.framesToConfirm}, warmup {calibrationDone.warmupFrames}, grace {calibrationDone.graceFrames}, octave correction {calibrationDone.octaveCorrection ? 'on' : 'off'}, YIN {calibrationDone.yinThreshold.toFixed(2)}.
                  </p>
                  <button type="button" className="btn-secondary" onClick={() => setMode('manual')}>View in Manual</button>
                </div>
              ) : (
                <button type="button" className="btn-primary" onClick={() => void startCalibrationRun()}>
                  Start Auto-Calibrate
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
