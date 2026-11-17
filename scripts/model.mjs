/**
 * Converts between dnd5e filter JSON and the builder's tree of nodes.
 *
 * dnd5e filters: { k: key, o: operator, v: value }, where o is a comparison (exact, gt, in, ...)
 * or a group operator (AND, OR, NOR, NAND, XOR take an array; NOT takes one filter).
 * A top-level array means AND. "{}" (or empty) means no conditions.
 *
 * Builder nodes:
 *   { type: "group", op, children }
 *   { type: "rule", key, op, value }
 *   { type: "raw", data }   anything the builder can't show, kept exactly as it was
 */

export const GROUP_OPS = ["AND", "OR", "NOR", "NAND", "XOR", "NOT"];

export const COMPARISONS = {
  Compare: ["exact", "gt", "gte", "lt", "lte", "empty"],
  List: ["in", "has", "hasany", "hasall", "subsetof"],
  Text: ["contains", "icontains", "startswith", "istartswith", "endswith", "iendswith"]
};

const ALL_COMPARISONS = new Set(Object.values(COMPARISONS).flat());

/** Comparisons whose value is a list. */
export const LIST_OPS = new Set(["in", "hasany", "hasall", "subsetof"]);

/** Comparisons whose value is always text / always a number. */
const TEXT_OPS = new Set(COMPARISONS.Text);
const NUMBER_OPS = new Set(["gt", "gte", "lt", "lte"]);

let counter = 0;
const nextId = () => `n${++counter}`;

export const group = (op="AND", children=[]) => ({ id: nextId(), type: "group", op, children });
export const rule = (key="", op="exact", value="") => ({ id: nextId(), type: "rule", key, op, value });
const raw = data => ({ id: nextId(), type: "raw", data });

/* -------------------------------------------- */
/*  Parsing                                     */
/* -------------------------------------------- */

/**
 * Turn filter JSON into a root group.
 * @param {string} json
 * @returns {object|null}  Root group node, or null if the JSON is invalid.
 */
export function parse(json) {
  let data;
  try { data = JSON.parse(json || "{}"); } catch { return null; }
  if ( foundry.utils.isEmpty(data) ) return group();
  if ( Array.isArray(data) ) return group("AND", data.map(toNode));
  const node = toNode(data);
  return (node.type === "group") && (node.op !== "NOT") ? node : group("AND", [node]);
}

function toNode(filter) {
  if ( !foundry.utils.isPlainObject(filter) ) return raw(filter);
  const op = filter.o ?? "exact";
  if ( GROUP_OPS.includes(op) ) {
    const value = (op === "NOT") ? (filter.v == null ? [] : [filter.v]) : filter.v;
    if ( !Array.isArray(value) ) return raw(filter);
    return group(op, value.map(toNode));
  }
  // Rules with a nested filter as the value (e.g. "has" an object matching...) stay raw.
  if ( ALL_COMPARISONS.has(op) && (typeof filter.k === "string") && !foundry.utils.isPlainObject(filter.v) ) {
    return rule(filter.k, op, filter.v ?? (op === "empty" ? true : ""));
  }
  return raw(filter);
}

/* -------------------------------------------- */
/*  Serializing                                 */
/* -------------------------------------------- */

/**
 * Turn a root group back into filter JSON. Rules without a key and empty groups are dropped.
 * @param {object} root
 * @returns {string}
 */
export function serialize(root) {
  const data = toData(root, true);
  return JSON.stringify(data ?? {});
}

/** Filter data for one node, or undefined if it has nothing to save. */
export function toData(node, isRoot=false) {
  switch ( node.type ) {
    case "raw": return node.data;
    case "rule": {
      if ( !node.key.trim() ) return undefined;
      const data = { k: node.key.trim() };
      if ( node.op !== "exact" ) data.o = node.op;
      data.v = node.value;
      return data;
    }
    case "group": {
      const children = node.children.map(c => toData(c)).filter(c => c !== undefined);
      if ( isRoot && (node.op === "AND") ) return children.length ? children : undefined;
      if ( !children.length ) return undefined;
      if ( node.op === "NOT" ) return (children.length === 1) ? { o: "NOT", v: children[0] } : { o: "NOR", v: children };
      return { o: node.op, v: children };
    }
  }
}

/** Does the tree contain a rule with no key? */
export function hasIncomplete(node) {
  if ( node.type === "rule" ) return !node.key.trim();
  return (node.type === "group") && node.children.some(hasIncomplete);
}

/* -------------------------------------------- */
/*  Tree helpers                                */
/* -------------------------------------------- */

/** Find a node and its parent by id. */
export function find(root, id, parent=null) {
  if ( root.id === id ) return { node: root, parent };
  if ( root.type !== "group" ) return null;
  for ( const child of root.children ) {
    const found = find(child, id, root);
    if ( found ) return found;
  }
  return null;
}

/* -------------------------------------------- */
/*  Values                                      */
/* -------------------------------------------- */

/**
 * The kind of value a key holds in the sample data, so typed text becomes the right type
 * (dnd5e's "is" compares with ===, so 3 and "3" are different).
 * @returns {"number"|"boolean"|"string"|null}
 */
export function valueKind(sample, key) {
  let value = sample ? foundry.utils.getProperty(sample, key) : undefined;
  if ( (value instanceof Set) || Array.isArray(value) ) value = Array.from(value)[0];
  if ( typeof value === "number" ) return "number";
  if ( typeof value === "boolean" ) return "boolean";
  if ( typeof value === "string" ) return "string";
  return null;
}

/**
 * Convert typed text to the stored value.
 * @param {string} text
 * @param {string} op
 * @param {string|null} kind  From valueKind().
 */
export function parseValue(text, op, kind) {
  if ( op === "empty" ) return text !== "false";
  if ( LIST_OPS.has(op) ) {
    return text.split(",").map(s => s.trim()).filter(Boolean).map(s => scalar(s, kind));
  }
  if ( TEXT_OPS.has(op) ) return text;
  if ( NUMBER_OPS.has(op) ) return scalar(text.trim(), "number");
  return scalar(text.trim(), kind);
}

function scalar(text, kind) {
  if ( kind === "string" ) return text;
  if ( (kind === "number") || !kind ) {
    const n = Number(text);
    if ( (text !== "") && Number.isFinite(n) ) return n;
    if ( kind === "number" ) return text;
  }
  if ( (kind === "boolean") || !kind ) {
    if ( text === "true" ) return true;
    if ( text === "false" ) return false;
  }
  return text;
}

/** Stored value back to the text shown in the field. */
export function formatValue(value) {
  if ( Array.isArray(value) ) return value.map(v => String(v)).join(", ");
  if ( value == null ) return "";
  return String(value);
}
