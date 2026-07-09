/**
 * Tiny dependency-free JSON Schema validator — Node test layer only.
 *
 * Supports the exact keyword subset used by score.schema.json (Draft 2020-12):
 * type (string or array), enum, required, properties, additionalProperties
 * (boolean or subschema), items, minItems, maxItems, minProperties, minLength,
 * minimum, exclusiveMinimum, anyOf, and local $ref (#/$defs/...). It exists so
 * the schema file is genuinely exercised against the fixtures in CI, without
 * pulling ajv (this repo has zero runtime/build dependencies by design — see
 * docs/solutions/score-schema.md, "Why the loader is dependency-free").
 *
 * The dependency-free RUNTIME loader (frontend/js/score-loader.js) is the real
 * gatekeeper with human-readable messages; this validator only confirms the
 * fixtures conform to the formal contract external tools would use.
 */

function typeOf(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  if (Number.isInteger(v)) return 'integer';
  return typeof v; // 'number' | 'string' | 'boolean' | 'object'
}

function matchesType(v, t) {
  const actual = typeOf(v);
  if (t === 'number') return actual === 'number' || actual === 'integer';
  if (t === 'object') return actual === 'object';
  return actual === t;
}

function resolveRef(ref, root) {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported $ref: ${ref}`);
  let node = root;
  for (const seg of ref.slice(2).split('/')) node = node[seg];
  return node;
}

export function validate(schema, data, root = schema, path = '$') {
  const errors = [];
  if (schema.$ref) return validate(resolveRef(schema.$ref, root), data, root, path);

  // type
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(data, t))) {
      errors.push(`${path}: expected type ${types.join('|')}, got ${typeOf(data)}`);
      return errors; // further checks assume the type held
    }
  }

  if (schema.enum && !schema.enum.includes(data)) {
    errors.push(`${path}: ${JSON.stringify(data)} is not one of ${JSON.stringify(schema.enum)}`);
  }

  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) errors.push(`${path}: ${data} < minimum ${schema.minimum}`);
    if (schema.exclusiveMinimum !== undefined && data <= schema.exclusiveMinimum) errors.push(`${path}: ${data} <= exclusiveMinimum ${schema.exclusiveMinimum}`);
  }

  if (typeof data === 'string' && schema.minLength !== undefined && data.length < schema.minLength) {
    errors.push(`${path}: string shorter than minLength ${schema.minLength}`);
  }

  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) errors.push(`${path}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && data.length > schema.maxItems) errors.push(`${path}: more than ${schema.maxItems} items`);
    if (schema.items) data.forEach((v, i) => errors.push(...validate(schema.items, v, root, `${path}[${i}]`)));
  }

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const keys = Object.keys(data);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) errors.push(`${path}: fewer than ${schema.minProperties} properties`);
    for (const req of schema.required || []) {
      if (!(req in data)) errors.push(`${path}: missing required property "${req}"`);
    }
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(data)) {
      if (props[k]) {
        errors.push(...validate(props[k], v, root, `${path}.${k}`));
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}: unexpected property "${k}"`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        errors.push(...validate(schema.additionalProperties, v, root, `${path}.${k}`));
      }
    }
  }

  if (schema.anyOf) {
    const anyErrors = schema.anyOf.map((s) => validate(s, data, root, path));
    if (!anyErrors.some((e) => e.length === 0)) {
      errors.push(`${path}: does not match any allowed shape (anyOf)`);
    }
  }

  return errors;
}
