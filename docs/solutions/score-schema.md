# The Score JSON Schema

*Status: landed in #62. The authored format that composers and interaction
designers write, the validating loader that turns it into a runtime object, and
the transfer contract into Ralf's scene system.*

A **score** is the complete definition of an interactive Song Space experience.
Before #62 it was a hand-authored JavaScript object in `frontend/js/score.js`.
It is now authored as **JSON** (`frontend/schema/scores/*.json`) and loaded
through a validating loader. `score.js` is reduced to wiring: it imports the JSON
documents, runs each through `loadScore()`, and exports the result.

```
default.score.json ─┐
                    ├─ loadScore()  ─→  DEFAULT_SCORE / PROOF_SCORE  ─→  Arc · ReadingsEngine · RalfRuntime
proof.score.json  ──┘   (validation)      (runtime object)
```

## The three artifacts

| File | Role | Runs where |
|------|------|-----------|
| `frontend/schema/score.schema.json` | The formal, machine-checkable contract (JSON Schema, Draft 2020-12). What an external editor or a Ralf importer reads. | Node test layer |
| `frontend/js/score-loader.js` | The runtime gatekeeper. Dependency-free, no I/O. Repeats the checks that matter at runtime **plus** the cross-reference checks a JSON Schema cannot express, phrasing every failure so a non-programmer can act on it. | Browser + tests |
| `frontend/schema/validate.mjs` | A tiny dependency-free validator covering the exact JSON Schema keyword subset the schema uses. Confirms the fixtures conform to the formal contract in CI without pulling `ajv`. | Node test layer |

### Why the loader is dependency-free

The frontend has **zero runtime or build dependencies** by design (no build step,
vanilla ES modules served straight to the browser). Vendoring a full JSON Schema
validator (ajv is ~120 KB and assumes a bundler) would break that invariant for a
document that is authored rarely and validated once at load. So the split is:

- **Formal contract** (`score.schema.json`) — the portable, tool-readable artifact.
  Exercised against the fixtures in the Node test layer via `validate.mjs`.
- **Runtime validation** (`score-loader.js`) — hand-rolled checks with
  human-readable messages, and the referential-integrity checks JSON Schema
  cannot express (does every `reading.intents[].intent` name an intent that
  actually exists? does every category name a real category?).

The two are kept deliberately redundant on the overlapping checks: the schema is
the contract external authors target; the loader is what protects the running app
and what a non-programmer sees when they get it wrong.

## Document shape

Two separately-authorable halves live in one document, split by role:

```jsonc
{
  "meta":     { "name": "default", "score": "default" },   // identity
  "arc":      { ... },   // COMPOSER: the temporal journey
  "mappings": { ... },   // COMPOSER: fixed per-category levels
  "readings": { ... },   // INTERACTION DESIGNER: how the body is read
  "intents":  { ... }    // INTERACTION DESIGNER: what body states do to the music
}
```

- **Composer** owns `arc` (phases, their available `categories`, `duration`,
  dancer-facing `hint`, `sectionMap`, `startMuted`) and `mappings.fixedVolumes`
  (the resting level of each category). This is "what sound is available, and
  when."
- **Interaction designer** owns `readings` (named body states built from quality
  mixes + gates) and `intents` (weighted pools of actions the readings fire).
  This is "how movement shapes the available sound."

The boundary is drawn at **arc vs readings** because that is the real authorship
seam: a composer can re-score the same interaction design onto different loops and
a different journey without touching a single gate threshold, and an interaction
designer can retune gates and intent pools without knowing which loops are loaded.
They meet only through two shared vocabularies — **category names** and **action
types** — both defined by the engine adapter (`constants.js`), not by either
author. That shared vocabulary is the entire coupling surface between the halves.

## Engine-defined enum vs. score-defined string

The single most consequential decision, because getting it wrong bakes a false
constraint into every future score and into the Ralf transfer.

| Vocabulary | Where it lives | Rationale |
|-----------|----------------|-----------|
| **Body qualities** (`velocity`, `armsRaised`, …) | Engine enum (`QUALITY_KEYS`) | Produced by the input adapter (`movement.js`). A score that mixes a quality the adapter does not compute is simply wrong, and the valid set differs between song-space (11) and Ralf. Validated by the **loader** against `constants.js`, **not** frozen in the portable schema. |
| **Relational qualities** (`synchrony`, …) | Engine enum (`RELATIONAL_QUALITY_KEYS`) | Same reasoning, two-body namespace. |
| **Action types** (`mute`, `restore`, `set_effect`, …) | Engine enum (`ACTION_TYPES`) | The output contract. An action the output adapter cannot execute is a dead command. Loader-validated. |
| **Interaction modes** (`edge`, `continuous`) | Engine enum (`INTERACTION_MODES`) | There are exactly two binding shapes; a third would be a runtime feature, not a score choice. |
| **Sections** (`intro`…`outro`) | Engine enum (`SECTIONS`) | Loops in the library are categorized by section, so `sectionMap` targets are fixed. |
| **Categories** (`groove`, `hook`, …) | **Score-visible string, engine-registered** | Categories are the composer/designer coupling vocabulary. They are validated against `CATEGORIES` in `constants.js` today, but are deliberately **not frozen as a schema enum**, because Ralf's category model diverges (see below) and the standalone Blender uses its own set. Freezing them would break the transfer. The schema types a category as a string; the loader checks it against the *current adapter's* registry. |
| **Phase ids** (`await`, `peak`, …) | **Free score-authored string** | Purely a score's own timeline labels. Only `sectionMap` keys must reference a declared phase id (a referential check, not an enum). |

**The rule:** anything the *adapter* must be able to produce or consume is an
engine enum, validated by the loader against `constants.js` so the portable schema
stays adapter-neutral. Anything that is purely the score's internal structure
(phase ids) is a free string. Categories sit in between on purpose: engine-checked
but not schema-frozen, because they are exactly the vocabulary that legitimately
differs across the three repos this schema has to travel between.

## Output-agnosticism: no Tone.js in the schema

The schema and fixtures contain **no Tone.js concept** (verified: `grep -i tone`
over the schema and fixtures finds only the sentence documenting the rule). Actions
are named by type and carry `args`; the output adapter interprets them.

Two output units *do* appear in `args`: **dB** (volumes in `fixedVolumes`, mute
levels) and **Hz** (filter frequencies in `set_effect`). These are kept, and
documented here as **output-adapter conventions**: they are the lingua franca of
audio and every plausible output adapter (Tone.js, Ableton, a hardware mixer)
speaks them, so encoding a volume as `-12` (dB) rather than a Tone.js
`Volume` node is portable, not leaky. An adapter that genuinely could not accept
dB/Hz would translate at its boundary, exactly as the input adapters translate
landmarks into qualities.

## Explicit rulings on legacy concepts

The issue required a keep/rename/kill decision for two concepts that must not leak
into the schema as-is.

### `_invertInMix` → **renamed to `invert`** (kept, de-hacked)

The underscore prefix marked it as an internal, not-really-supported field on
readings. It expresses a real and needed idea: a quality that contributes
`(1 - value) × weight` to a mix (e.g. "grounded" reads as *low* verticality). It is
promoted to a first-class, documented reading field named `invert`, a sibling of
`mix`. `readings.js` now reads `config.invert`; the underscore form is gone from
the codebase.

### `quietVolumes` → **killed from the schema; not an authorable field**

`runtime.js` still contains a legacy `quietVolumes` blending path used by
PROOF_SCORE, alongside the current `fixedVolumes` path used by DEFAULT_SCORE. The
schema exposes **only `fixedVolumes`**. PROOF_SCORE authors no volume field at all
(it is the minimal "proof of feel" score with no volume manipulation), so it never
needed `quietVolumes` in the first place — the runtime path simply defaults to
quiet when no `fixedVolumes` is present. The legacy `runtime.js` branch is left as
a runtime implementation detail for now (its removal is a runtime-cleanup concern,
not a schema concern); the important thing for #62 is that **the authored format
has exactly one way to set levels**, and it is `fixedVolumes`.

## How this maps to Ralf

This schema is the primary transfer artifact into Ralf's scene system (Song Space
is Ralf's concept lab). The mapping, extending the table in
`composer-framework.md`:

| Score concept | Ralf equivalent | Divergence to preserve |
|---------------|-----------------|------------------------|
| Whole score document | Scene + a new temporal (arc) layer | The **arc** is genuinely new for Ralf; Ralf scenes are currently stateless/reactive. |
| `arc.phases` | Scene sequence (ordered scenes + transitions) | New concept; carries `sectionMap` to bind phases to library sections. |
| `readings` (`mix` / `invert` / `gate`) | Readings — near-identical format | Song-space computes **11** solo qualities; Ralf's canonical `quality-math.ts` computes a **different ~12** (velocity, acceleration, jerkiness, energy, spatialExtent, contraction, symmetry, coherence, verticality, stillness, periodicity, groundedness). The *format* transfers; the *quality vocabulary is adapter-specific* — which is exactly why qualities are loader-validated, not schema-frozen. |
| `intents` (weighted pools) | Intent pools via translator | Identical shape. The `draw` (weighted random selection) is shared vocabulary. |
| Reading arbitration (`exclusiveGroup` + `priority`, per-frame action arbiter) | Scene-level conflict resolution | Landed in #54; the schema encodes it declaratively so Ralf inherits the resolved contract, not the old first-touch-wins bug. |
| `categories` | Track groups in the translator | **Different category set** in Ralf and in the standalone Blender. Never frozen as a schema enum for this reason. |
| Action types + `args` (dB/Hz) | Actions via the output translator | Output-agnostic; Ralf's translator maps the same action types onto Ableton instead of Tone.js. |

### Versioning strategy for Ralf divergence

The schema carries `$id` and a `$schema` draft marker. Because song-space and Ralf
deliberately fork (the input adapters already do — `movement.js` vs
`quality-math.ts`), the plan is **not** a single shared schema file but a shared
*shape* with adapter-specific registries:

- The **structural schema** (arc/readings/intents/mappings shape, mode enum,
  arbitration vocabulary) is the transferable artifact and should stay in lockstep.
- The **registries** (qualities, categories, actions, sections) are adapter-local
  and are expected to differ. They live in each repo's `constants.js` equivalent
  and are applied by that repo's loader, not embedded in the portable schema.

When Ralf imports a score, it validates structure against the shared schema and
vocabulary against its own registries. A quality song-space uses that Ralf does not
compute fails Ralf's loader with a readable message — the correct, explicit failure
mode, not a silent misread.

## Authoring a score

Minimum viable score (what the loader requires):

- `arc.phases`: at least one phase, each with a unique `id`, a non-empty
  `categories` list (known categories), and a dancer-facing `hint`.
- `readings.solo`: a list; each reading needs a unique `id`, a non-empty `mix`
  (known qualities, positive weights), and a `gate` (`{}` for always-on).
- `intents`: a map of name → pool; each option needs a known `action` and a
  positive `weight`.
- Referential integrity: every `reading.intents[].intent` and every `on_exit`
  entry must name an intent that exists.

Get any of it wrong and `loadScore()` throws a `ScoreValidationError` that lists
**every** problem at once, each as a plain sentence naming the offending value and
the valid options — e.g. *"reading 'arms_up' mixes an unknown body quality
'jerkyness'. Valid ones: velocity, impulse, coherence, …"*.

## Tests

`frontend/js/score-loader.test.js` (wired into `npm test`) covers:

1. **Round-trip** — both fixtures load, produce the runtime shape, and equal the
   `DEFAULT_SCORE` / `PROOF_SCORE` the app exports. (The existing `score.test.js`
   and `runtime.test.js` suites already run against these loaded objects, so
   behavior-identity is continuously enforced, not asserted once.)
2. **Three failure classes** — unknown quality, unknown category, invalid mode —
   each throwing a `ScoreValidationError` with a human-readable message, plus an
   empty-document case and a "reports every problem at once" case.
3. **Schema conformance** — both fixtures validate against `score.schema.json` via
   `validate.mjs`, and a malformed document is rejected.
