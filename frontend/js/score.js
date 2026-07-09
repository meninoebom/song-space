/**
 * Score — the complete definition of an interactive Song Space experience.
 *
 * As of #62 the scores are AUTHORED AS JSON (frontend/schema/scores/*.json) and
 * loaded here through the validating loader. score.js is now just the wiring: it
 * imports the JSON documents and runs each through loadScore(), which validates
 * them and returns the runtime object the rest of the app consumes. The authored
 * format and its rules live in docs/solutions/score-schema.md and the machine-
 * checkable frontend/schema/score.schema.json.
 *
 * Three roles provide a score's content:
 *   - Composer: arc + mappings.fixedVolumes (what sounds are available and when)
 *   - Interaction designer: readings + intents (how the body shapes the music)
 *   - Dancer: movement (brings it to life)
 *
 * The score is ADAPTER-AGNOSTIC. It references qualities by name
 * (see QUALITY_KEYS in constants.js) and emits actions by type
 * (see ACTION_TYPES in constants.js). See docs/solutions/adapter-architecture.md.
 *
 * Three interaction modes — how a reading connects body to music:
 *   IMPULSE      — mode: 'edge', no on_exit: a single punctuating moment.
 *   GATE         — mode: 'edge' + on_exit: a state you inhabit; exit undoes it.
 *   CONTINUOUS   — mode: 'continuous': proportional, fader-like tracking.
 *
 * Temporal modifiers (compose with any mode):
 *   - Accumulating (rampSeconds: N): value grows 0→full over N seconds.
 *   - Delayed edge (after: N): edge fires only after N seconds sustained.
 *
 * PROOF_SCORE (?score=proof) is the minimal "proof of feel" score: exactly three
 * interactions, one of each mode, no volume manipulation.
 */

import defaultScoreData from '../schema/scores/default.score.json' with { type: 'json' };
import proofScoreData from '../schema/scores/proof.score.json' with { type: 'json' };
import { loadScore } from './score-loader.js';

export const DEFAULT_SCORE = loadScore(defaultScoreData);
export const PROOF_SCORE = loadScore(proofScoreData);
