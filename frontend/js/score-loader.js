/**
 * Score loader — turns an authored JSON score (a plain parsed object) into a
 * validated runtime score object, or throws with an error a NON-PROGRAMMER can read.
 *
 * This is the runtime half of the score-format contract. It is DEPENDENCY-FREE
 * and does NO I/O: the caller passes an already-parsed object (imported JSON in
 * the browser, JSON.parse in tests). The formal machine-checkable contract lives
 * in frontend/schema/score.schema.json; that schema is validated in the Node test
 * layer. This loader repeats the checks that matter at runtime AND adds the
 * cross-reference checks a JSON Schema cannot express (does every reading point at
 * an intent that exists? does every category name a real category?), phrasing
 * every failure in plain language. See docs/solutions/score-schema.md.
 *
 * Engine registries (which qualities, categories, actions exist) come from
 * constants.js — the loader validates the ADAPTER-SPECIFIC vocabulary here rather
 * than freezing it in the portable schema, so the same schema travels to Ralf.
 */

import {
  CATEGORIES,
  QUALITY_KEYS,
  RELATIONAL_QUALITY_KEYS,
  ACTION_TYPES,
  INTERACTION_MODES,
  SECTIONS,
} from './constants.js';

const CATEGORY_TARGETS = [...CATEGORIES, '*']; // '*' = every category in the current phase

export class ScoreValidationError extends Error {
  constructor(problems) {
    const list = problems.map((p) => `  • ${p}`).join('\n');
    super(`This score can't be loaded. Please fix:\n${list}`);
    this.name = 'ScoreValidationError';
    this.problems = problems;
  }
}

/**
 * Validate and return a runtime score object.
 * @param {Object} raw — a parsed score document (see score.schema.json)
 * @returns {Object} the same score, ready for RalfRuntime / ReadingsEngine / Arc
 * @throws {ScoreValidationError} listing every problem in plain language
 */
export function loadScore(raw) {
  const problems = [];
  const fail = (msg) => problems.push(msg);
  const quoteList = (arr) => arr.join(', ');

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ScoreValidationError(['The score is empty or is not a JSON object.']);
  }

  // --- Arc (composer layer) ---
  const arc = raw.arc;
  const phaseIds = new Set();
  if (!arc || typeof arc !== 'object') {
    fail('The score is missing its "arc" (the timeline of phases). Every score needs one.');
  } else {
    if (!Array.isArray(arc.phases) || arc.phases.length === 0) {
      fail('The arc has no phases. Add at least one phase (for example an "await" phase and a "play" phase).');
    } else {
      arc.phases.forEach((phase, i) => {
        const where = phase && phase.id ? `phase "${phase.id}"` : `phase #${i + 1}`;
        if (!phase || typeof phase.id !== 'string' || !phase.id) {
          fail(`Arc ${where} is missing an "id" (a short name like "peak").`);
        } else {
          if (phaseIds.has(phase.id)) fail(`Two arc phases share the id "${phase.id}". Ids must be unique.`);
          phaseIds.add(phase.id);
        }
        if (!Array.isArray(phase?.categories) || phase.categories.length === 0) {
          fail(`Arc ${where} lists no sound categories. Add at least one.`);
        } else {
          for (const cat of phase.categories) {
            if (!CATEGORIES.includes(cat)) {
              fail(`Arc ${where} uses an unknown sound category "${cat}". The categories are: ${quoteList(CATEGORIES)}.`);
            }
          }
        }
        if (typeof phase?.hint !== 'string' || !phase.hint.trim()) {
          fail(`Arc ${where} is missing a dancer-facing "hint" (the on-screen line, like "give it everything").`);
        }
        if (phase?.duration !== undefined && phase.duration !== null) {
          const d = phase.duration;
          if (!Array.isArray(d) || d.length !== 2 || typeof d[0] !== 'number' || typeof d[1] !== 'number') {
            fail(`Arc ${where} has an invalid "duration". Use null (waits for a trigger) or [min, max] seconds.`);
          }
        }
      });
    }
    if (Array.isArray(arc.startMuted)) {
      for (const cat of arc.startMuted) {
        if (!CATEGORIES.includes(cat)) {
          fail(`arc.startMuted names an unknown category "${cat}". The categories are: ${quoteList(CATEGORIES)}.`);
        }
      }
    }
    if (arc.sectionMap && typeof arc.sectionMap === 'object') {
      for (const [phaseId, section] of Object.entries(arc.sectionMap)) {
        if (!phaseIds.has(phaseId)) fail(`arc.sectionMap points at a phase "${phaseId}" that does not exist in the arc.`);
        if (!SECTIONS.includes(section)) {
          fail(`arc.sectionMap maps phase "${phaseId}" to an unknown section "${section}". The sections are: ${quoteList(SECTIONS)}.`);
        }
      }
    }
  }

  // --- Intents (interaction-designer layer) ---
  const intents = raw.intents;
  const intentNames = new Set();
  if (!intents || typeof intents !== 'object' || Array.isArray(intents)) {
    fail('The score is missing its "intents" (what each body state does to the music).');
  } else {
    for (const [name, pool] of Object.entries(intents)) {
      intentNames.add(name);
      const options = Array.isArray(pool) ? pool : pool?.pool;
      if (!Array.isArray(options)) {
        fail(`Intent "${name}" has no list of options. Give it a list of actions (each with a weight).`);
        continue;
      }
      options.forEach((opt, i) => {
        const where = `intent "${name}" option #${i + 1}`;
        if (!ACTION_TYPES.includes(opt?.action)) {
          fail(`${where} uses an unknown action "${opt?.action}". The actions are: ${quoteList(ACTION_TYPES)}.`);
        }
        if (typeof opt?.weight !== 'number' || opt.weight <= 0) {
          fail(`${where} needs a "weight" greater than zero (how likely this option is chosen).`);
        }
        const args = opt?.args || {};
        const cats = [];
        if (typeof args.category === 'string') cats.push(args.category);
        if (Array.isArray(args.categories)) cats.push(...args.categories);
        for (const cat of cats) {
          if (!CATEGORY_TARGETS.includes(cat)) {
            fail(`${where} points at an unknown category "${cat}". Use one of: ${quoteList(CATEGORIES)} (or "*" for all).`);
          }
        }
      });
    }
  }

  // --- Readings (interaction-designer layer) ---
  const readings = raw.readings;
  const readingIds = new Set();
  if (!readings || typeof readings !== 'object' || !Array.isArray(readings.solo)) {
    fail('The score is missing its "readings" (how the body is interpreted). It needs a "solo" list.');
  } else {
    const groups = [
      ['solo', readings.solo, QUALITY_KEYS, 'body quality'],
      ['relational', readings.relational || [], RELATIONAL_QUALITY_KEYS, 'two-body quality'],
    ];
    for (const [groupName, list, validQualities, qualityLabel] of groups) {
      if (!Array.isArray(list)) {
        fail(`readings.${groupName} must be a list.`);
        continue;
      }
      list.forEach((r, i) => {
        const where = r && r.id ? `reading "${r.id}"` : `${groupName} reading #${i + 1}`;
        if (typeof r?.id !== 'string' || !r.id) {
          fail(`A ${groupName} reading is missing an "id" (a short name like "arms_up").`);
        } else {
          if (readingIds.has(r.id)) fail(`Two readings share the id "${r.id}". Ids must be unique.`);
          readingIds.add(r.id);
        }
        // mix (required, positive weights, known qualities)
        if (!r?.mix || typeof r.mix !== 'object' || Object.keys(r.mix).length === 0) {
          fail(`${where} has an empty "mix". A reading must blend at least one ${qualityLabel}.`);
        } else {
          for (const [q, w] of Object.entries(r.mix)) {
            if (!validQualities.includes(q)) fail(`${where} mixes an unknown ${qualityLabel} "${q}". Valid ones: ${quoteList(validQualities)}.`);
            if (typeof w !== 'number' || w <= 0) fail(`${where} gives "${q}" a weight that is not greater than zero.`);
          }
        }
        // invert (optional)
        if (r?.invert) {
          for (const [q, w] of Object.entries(r.invert)) {
            if (!validQualities.includes(q)) fail(`${where} inverts an unknown ${qualityLabel} "${q}". Valid ones: ${quoteList(validQualities)}.`);
            if (typeof w !== 'number' || w <= 0) fail(`${where} gives inverted "${q}" a weight that is not greater than zero.`);
          }
        }
        // gate (required object; conditions reference known qualities)
        if (r?.gate === undefined || typeof r.gate !== 'object' || Array.isArray(r.gate)) {
          fail(`${where} is missing a "gate" (when the reading turns on). Use {} for always-on.`);
        } else {
          for (const [q, cond] of Object.entries(r.gate)) {
            if (!validQualities.includes(q)) fail(`${where} gates on an unknown ${qualityLabel} "${q}". Valid ones: ${quoteList(validQualities)}.`);
            if (!cond || (cond.above === undefined && cond.below === undefined)) {
              fail(`${where} gate on "${q}" needs an "above" or "below" threshold.`);
            }
          }
        }
        // intents (optional) — modes + referential integrity
        if (r?.intents !== undefined) {
          if (!Array.isArray(r.intents)) {
            fail(`${where} "intents" must be a list.`);
          } else {
            for (const it of r.intents) {
              if (!INTERACTION_MODES.includes(it?.mode)) {
                fail(`${where} intent "${it?.intent}" has an invalid mode "${it?.mode}". Use one of: ${quoteList(INTERACTION_MODES)}.`);
              }
              if (it?.after !== undefined && (typeof it.after !== 'number' || it.after <= 0)) {
                fail(`${where} intent "${it?.intent}" has an "after" delay that is not greater than zero.`);
              }
              if (!intentNames.has(it?.intent)) {
                fail(`${where} refers to an intent "${it?.intent}" that is not defined in "intents".`);
              }
            }
          }
        }
        // on_exit (optional) — referential integrity
        if (r?.on_exit !== undefined) {
          if (!Array.isArray(r.on_exit)) {
            fail(`${where} "on_exit" must be a list of intent names.`);
          } else {
            for (const nm of r.on_exit) {
              if (!intentNames.has(nm)) fail(`${where} on_exit refers to an intent "${nm}" that is not defined in "intents".`);
            }
          }
        }
      });
    }
  }

  // --- Mappings (composer layer, optional) ---
  if (raw.mappings?.fixedVolumes) {
    for (const [cat, db] of Object.entries(raw.mappings.fixedVolumes)) {
      if (!CATEGORIES.includes(cat)) fail(`mappings.fixedVolumes names an unknown category "${cat}". The categories are: ${quoteList(CATEGORIES)}.`);
      if (typeof db !== 'number') fail(`mappings.fixedVolumes for "${cat}" must be a number (a volume in dB).`);
    }
  }

  if (problems.length) throw new ScoreValidationError(problems);

  // Runtime object shape is identical to the authored document: app.js reads
  // score.readings.solo / .relational, and flattens them for RalfRuntime.
  return raw;
}
