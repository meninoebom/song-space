/**
 * Session recorder — captures raw MediaPipe landmark frames to a JSON
 * document that session-replay.js can feed back through the pipeline
 * (MovementDetector → ReadingsEngine → RalfRuntime) deterministically.
 *
 * A session is the durable artifact of a dance test: record once in the
 * Quality Lab, then replay it forever against any quality-formula or
 * score-gate change, headlessly in node or visually in the lab.
 *
 * Format notes:
 *   - tracking_system / coordinate_system follow the conventions of Ralf's
 *     gesture-studio .ralf format (FORMAT.md there), so sessions stay
 *     legible across the two repos.
 *   - Frames store ALL tracked bodies (up to MediaPipe's numPoses) even
 *     though replay currently drives body 0 only — two-body replay is a
 *     format-compatible extension, not a migration.
 *   - Each frame carries the label that was active while it was recorded
 *     (e.g. "flowing" / "staccato"), which is what makes offline
 *     separation analysis possible (#48).
 */

export const SESSION_FORMAT = 'song-space-session';
export const SESSION_VERSION = '1.0';

const round4 = (v) => Math.round(v * 10000) / 10000;

export class SessionRecorder {
  constructor() {
    this.recording = false;
    this.frames = [];
    this.labels = [];
    this._labelIdx = 0;
    this._t0 = null;
  }

  get currentLabel() {
    return this.labels[this._labelIdx] ?? 'unlabeled';
  }

  get frameCount() {
    return this.frames.length;
  }

  /**
   * Begin recording. @param {string[]} labels — segment labels the operator
   * cycles through while dancing (first one is active from the start).
   */
  start(labels = ['unlabeled']) {
    this.recording = true;
    this.frames = [];
    this.labels = labels.length > 0 ? labels : ['unlabeled'];
    this._labelIdx = 0;
    this._t0 = null;
  }

  /** Advance to the next segment label (wraps). Returns the new label. */
  cycleLabel() {
    this._labelIdx = (this._labelIdx + 1) % this.labels.length;
    return this.currentLabel;
  }

  /**
   * Record one frame. No-op unless recording.
   * @param {Array} bodies — MediaPipe results.landmarks (array of bodies,
   *   each an array of 33 {x, y, visibility} landmarks)
   * @param {number} ts — seconds (same clock the detection loop passes to
   *   MovementDetector.update, i.e. performance.now() / 1000)
   */
  addFrame(bodies, ts) {
    if (!this.recording || !bodies || bodies.length === 0) return;
    if (this._t0 === null) this._t0 = ts;
    this.frames.push({
      t: round4(ts - this._t0),
      label: this.currentLabel,
      bodies: bodies.map(body => body.map(lm => ({
        x: round4(lm.x),
        y: round4(lm.y),
        visibility: round4(lm.visibility ?? 1),
      }))),
    });
  }

  /** Stop recording and return the completed session document. */
  stop() {
    this.recording = false;
    return {
      format: SESSION_FORMAT,
      version: SESSION_VERSION,
      tracking_system: 'mediapipe-pose-33-xy',
      coordinate_system: 'normalized-0-1-xy',
      created_at: new Date().toISOString(),
      labels: this.labels,
      frame_count: this.frames.length,
      duration_sec: this.frames.length > 0 ? this.frames[this.frames.length - 1].t : 0,
      frames: this.frames,
    };
  }
}

/** Basic shape check for a loaded session document. Throws with a plain message. */
export function validateSession(session) {
  if (!session || session.format !== SESSION_FORMAT) {
    throw new Error(`Not a ${SESSION_FORMAT} document (format: ${session?.format})`);
  }
  if (!Array.isArray(session.frames) || session.frames.length === 0) {
    throw new Error('Session has no frames');
  }
  const f = session.frames[0];
  if (typeof f.t !== 'number' || !Array.isArray(f.bodies) || !Array.isArray(f.bodies[0])) {
    throw new Error('Session frames are malformed (expected { t, label, bodies: [[landmark×33]] })');
  }
  return session;
}

/** Trigger a browser download of a session as pretty-printed-enough JSON. */
export function downloadSession(session, filename = null) {
  const name = filename ?? `session-${session.created_at.replace(/[:.]/g, '-')}.json`;
  const blob = new Blob([JSON.stringify(session)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
