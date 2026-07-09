// Song Space — zero-config onboarding: pick a song → see yourself → move to begin.

import { AudioEngine } from './audio-engine.js';
import { SongPicker } from './song-picker.js';
import { LoopGrid } from './loop-grid.js';
import { MovementDetector } from './movement.js';
import { ReadingsEngine } from './readings.js';
import { ArcEngine } from './arc.js';
import { RalfRuntime } from './runtime.js';
import { CATEGORIES } from './constants.js';
import { DEFAULT_SCORE, PROOF_SCORE } from './score.js';
import { PhaseIndicator } from './phase-indicator.js';
import { ReadingsMeter } from './readings-meter.js';
import { StageDirections } from './stage-directions.js';
import { createDetectionLoop } from './detection.js';
import * as webcam from './webcam.js';

// The frontend is always served same-origin at /app (locally and on Railway),
// so the API base is simply the current origin.
const API_URL = window.location.origin;

const params = new URLSearchParams(window.location.search);
const DEBUG = params.has('debug');
const SCORE = params.get('score') === 'proof' ? PROOF_SCORE : DEFAULT_SCORE;

const engine = new AudioEngine();
const picker = new SongPicker(document.getElementById('song-picker'), API_URL);
const grid = new LoopGrid(document.getElementById('loop-grid'));
let runtime = null;
const detectors = [new MovementDetector(), new MovementDetector()];
const soloReadings = [new ReadingsEngine(SCORE.readings.solo), new ReadingsEngine(SCORE.readings.solo)];
const relReadingsEngine = new ReadingsEngine(SCORE.readings.relational);

const status = document.getElementById('status');
const priming = document.getElementById('camera-priming');
const phaseEl = document.getElementById('phase-indicator');
const bodyCanvas = document.getElementById('body-canvas');
const meter = new ReadingsMeter(document.getElementById('readings-meter'));
const directions = new StageDirections(document.getElementById('stage-hint'));

let arc = null, arcFadeTimeout = null, playing = false, _loadGeneration = 0, indicator = null, _lastPct = -1;

const setStatus = msg => { if (status) status.textContent = msg; };
const setPriming = on => { if (priming) priming.style.display = on ? 'block' : 'none'; };

function updatePhase(phase) {
  if (!indicator) return;
  const pct = Math.round(phase.progress * 100);
  if (pct === _lastPct) return;
  _lastPct = pct;
  indicator.update(phase.index, phase.progress);
  directions.update(phase.progress);
}

// Camera-less playback ("playing the song's arc automatically"): there is no
// dancer to summon the energy-gated layers, so on each phase we lift the
// trigger-mutes (groove/hook/accent) and set every in-phase category to its fixed
// level. Without this, advancing the arc only swaps atmosphere loops while
// groove/hook/accent stay pinned at -60 dB. Reuses the same volume/restore
// primitives the per-frame runtime uses when a camera IS present.
function applyFallbackMix(categories) {
  const fixedVolumes = SCORE.mappings?.fixedVolumes || {};
  // Restore before setting volume: setCategoryVolume is a no-op while a category
  // is trigger-muted, so the mute must be cleared first for the level to land.
  for (const cat of categories) {
    if (engine.isTriggerMuted(cat)) engine.restoreCategory(cat, 1.0);
  }
  for (const cat of CATEGORIES) {
    engine.setCategoryVolume(cat, categories.includes(cat) ? (fixedVolumes[cat] ?? -12) : -60);
  }
}

const loops = createDetectionLoop({
  detectors, soloReadings, relReadingsEngine,
  getArc: () => arc, getRuntime: () => runtime,
  engine, meter, bodyCanvas,
  skeletonCanvas: document.getElementById('skeleton-canvas'),
  debugPanel: document.getElementById('debug-panel'),
  onPhaseUpdate: updatePhase,
  isPlaying: () => playing,
});

if (DEBUG) {
  document.body.classList.add('debug');
  document.getElementById('controls')?.style.setProperty('display', 'flex');
  document.getElementById('debug-panel')?.style.setProperty('display', 'block');
  document.getElementById('skeleton-canvas')?.style.setProperty('display', 'block');
}

picker.onSongSelected = async (metadata) => {
  if (playing) stopArc();
  const gen = ++_loadGeneration;
  setStatus(`Loading ${metadata.name}...`);
  engine.onLoadProgress = (loaded, total) => setStatus(`Loading loops: ${loaded}/${total}`);
  try { await engine.load(metadata, API_URL); }
  catch (err) { console.error('Failed to load song:', err); setStatus(`Failed to load ${metadata.name}: ${err.message}`); picker.clearState(); return; }
  if (gen !== _loadGeneration) return;
  if (DEBUG) { grid.render(metadata); grid.onTrackToggle = (f, m) => engine.setTrackMuted(f, m); }
  // Prime the stranger before the browser's native camera dialog: webcam.start()
  // silently downloads the MediaPipe bundle/WASM/pose model AND triggers the
  // permission prompt, so set both the covering status and the one-line
  // reassurance copy first. The #webcam-video element is hidden, so the copy is
  // anchored to the visible status overlay, not the video.
  setStatus('Starting camera...');
  setPriming(true);
  try { await webcam.start(); } catch (err) { console.error('Webcam init:', err); setStatus("Camera unavailable. Playing the song's arc automatically."); }
  setPriming(false);
  if (gen !== _loadGeneration) return;
  try { await startArc(); } catch (err) { console.error('Audio start failed:', err); setStatus('Audio failed — try clicking the page and selecting again'); picker.clearState(); return; }
  if (gen !== _loadGeneration) return;
  picker.setPlaying(metadata.slug);
  if (webcam.isRunning()) loops.detectLoop();
  else loops.fallbackLoop();
};

picker.onSongStopped = () => {
  if (playing) stopArc();
  ++_loadGeneration;
  setStatus('Select a song to begin');
};

async function startArc() {
  await Tone.start();
  engine.start();
  arc = new ArcEngine(SCORE.arc);
  const flatReadings = [...SCORE.readings.solo, ...SCORE.readings.relational];
  runtime = new RalfRuntime({ readings: flatReadings, intents: SCORE.intents, mappings: SCORE.mappings }, engine);
  loops.resetTime();
  _lastPct = -1;
  arc.onPhaseChange = (phase) => {
    const section = arc.config.sectionMap[phase.id];
    if (section) {
      for (const cat of CATEGORIES) {
        const match = engine.getLoopsForCategory(cat).find(l => l.section === section && !l.active);
        if (match) engine.setActiveLoop(cat, match.index);
      }
    }
    // Clear the status once the arc advances off the opening phase. The status
    // must not echo raw phase ids (EMERGE/BREAKDOWN/...) and must not stay stuck
    // on "Move to begin" all session; the dancer-facing text is the stage hint.
    setStatus('');
    updatePhase(arc.getCurrentPhase());
    directions.show(arc.getCurrentPhase());
    // No camera: the runtime never runs, so bring this phase's mix up by hand.
    if (!webcam.isRunning()) applyFallbackMix(phase.categories);
    if (DEBUG) grid.setAvailableCategories(phase.categories);
  };
  arc.onComplete = () => {
    setStatus('');
    if (indicator) indicator.update(SCORE.arc.phases.length, 0);
    directions.complete();
    const fadeDur = engine.getBarDuration() * 8;
    engine.fadeOutAll(fadeDur);
    arcFadeTimeout = setTimeout(() => { arcFadeTimeout = null; stopArc(); picker.clearState(); setStatus('Select a song to go again'); }, fadeDur * 1000 + 500);
  };
  // Initial mix — derived from the score, not hardcoded literals. Categories in
  // the opening phase play at their fixed level; the rest stay silent until the
  // arc brings them in. startMuted names categories that begin trigger-muted
  // (the "bring-in" model) so a reading has to summon them. The per-frame runtime
  // update re-applies fixedVolumes; this just sets the pre-first-frame state.
  const fixedVolumes = SCORE.mappings?.fixedVolumes || {};
  const openingCats = SCORE.arc.phases[0]?.categories || [];
  for (const cat of CATEGORIES) {
    engine.setCategoryVolume(cat, openingCats.includes(cat) ? (fixedVolumes[cat] ?? -12) : -60);
  }
  for (const cat of (SCORE.arc.startMuted || [])) engine.muteCategory(cat, 0);
  if (phaseEl) { indicator = new PhaseIndicator(phaseEl, SCORE.arc.phases); indicator.update(0, 0); indicator.show(); }
  directions.show(arc.getCurrentPhase());
  if (DEBUG) grid.setAvailableCategories(['texture']);
  playing = true;
  setStatus('Move to begin');
}

function stopArc() {
  if (arcFadeTimeout) { clearTimeout(arcFadeTimeout); arcFadeTimeout = null; }
  engine.stop();
  arc = null;
  if (runtime) { runtime.reset(); runtime = null; }
  playing = false;
  if (indicator) { indicator.hide(); indicator = null; }
  directions.hide();
}

if (DEBUG) {
  document.getElementById('play-btn')?.addEventListener('click', async () => {
    if (playing) { stopArc(); setStatus('Stopped'); }
    else if (engine.loaded) await startArc();
  });
}

// A failed /api/library/{slug} metadata fetch (inside the picker) surfaces here.
// The catalog + engine.load paths already own their own status copy; this covers
// the one path that used to fail silently. The picker also renders its own inline
// retry, so this is purely the status-bar echo.
picker.onError = (msg) => setStatus(msg);

// --- Capability gate + small-screen interstitial ---
//
// The experience hard-requires getUserMedia, the Web Audio API, and WebAssembly
// (MediaPipe). Feature-detect on boot and stop with a plain message rather than
// failing later with cryptic errors. The small-screen interstitial is CSS-driven
// (a @media query in style.css); "try anyway" just tags <body> to dismiss it.

function missingCapabilities() {
  const missing = [];
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) missing.push('webcam access (getUserMedia)');
  if (!(window.AudioContext || window.webkitAudioContext)) missing.push('the Web Audio API');
  if (typeof WebAssembly !== 'object') missing.push('WebAssembly');
  return missing;
}

function boot() {
  const gate = missingCapabilities();
  if (gate.length) {
    const panel = document.getElementById('unsupported-panel');
    const list = document.getElementById('unsupported-list');
    if (list) list.textContent = `Missing: ${gate.join(', ')}.`;
    if (panel) panel.style.display = 'flex';
    return; // do not load the experience on an unsupported browser
  }
  document.getElementById('mobile-try-anyway')?.addEventListener('click', () => {
    document.body.classList.add('dismiss-mobile');
  });
  picker.load();
}

boot();
