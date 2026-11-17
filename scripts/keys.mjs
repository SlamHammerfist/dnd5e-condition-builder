import { valueKind } from "./model.mjs";

/**
 * What a condition can check, for one effect:
 * - the actor's roll data (abilities.str.mod, attributes.hp.value, classes.bard.levels, ...)
 * - statuses.<id> (level for exhaustion and the like, 1 otherwise)
 * - sourceItem.* when the effect is on an item
 * - roll.* (what is being rolled), for change conditions only
 */

const SEP = " › ";

/** Roll data branches that aren't useful as condition keys. */
const SKIP = new Set(["roll", "statuses", "item", "labels", "scaling", "sourceScaling", "favorites", "bastion"]);

/**
 * @typedef {object} ConditionContext
 * @property {Actor|null} actor        Actor the effect is on, for live checks.
 * @property {object|null} sample      Condition data for that actor right now.
 * @property {object[]} entries        Keys for the dropdown: { key, label, group }.
 * @property {Map<string, {value, label}[]>} choices  Suggested values per key.
 * @property {Map<string, string>} kinds               Value type per key, where the sample can't tell.
 */

/**
 * @param {ActiveEffect|null} effect
 * @param {object} [options]
 * @param {boolean} [options.effectLevel]  Conditions on the whole effect (no roll.* keys).
 * @returns {ConditionContext}
 */
export function buildContext(effect, { effectLevel=false }={}) {
  const actor = effectActor(effect);
  const keyActor = actor ?? game.actors?.find(a => a.type === "character") ?? null;
  const sample = actor ? conditionData(effect, actor) : null;
  const keySample = sample ?? (keyActor ? conditionData(effect, keyActor) : {});

  const entries = [];
  const choices = new Map();
  const kinds = new Map();
  const cfg = CONFIG.DND5E;
  const loc = s => (s ? game.i18n.localize(s) : "");
  const label = v => loc(typeof v === "string" ? v : (v?.label ?? v?.name));
  const options = obj => Object.entries(obj ?? {}).map(([value, v]) => ({ value, label: label(v) || value }));

  // Roll data and source item.
  const itemGroup = loc("CONDBUILDER.ItemGroup");
  for ( const [key] of flatten(keySample) ) {
    const top = key.split(".")[0];
    const group = (top === "sourceItem") ? itemGroup : humanize(top);
    entries.push({ key, label: keyLabel(key, keyActor), group });
  }

  // Statuses: present only while active, so list them all.
  const statusGroup = loc("CONDBUILDER.StatusGroup");
  for ( const status of CONFIG.statusEffects ?? [] ) {
    const key = `statuses.${status.id}`;
    entries.push({ key, label: [statusGroup, label(status) || status.id].join(SEP), group: statusGroup });
    kinds.set(key, "number");
  }

  // The roll being made. Effect-wide conditions can't use these (dnd5e warns about it).
  if ( !effectLevel ) {
    const rollGroup = loc("CONDBUILDER.RollGroup");
    const add = (key, name, values, kind="string") => {
      entries.push({ key, label: [rollGroup, loc(`CONDBUILDER.Roll.${name}`)].join(SEP), group: rollGroup });
      if ( values?.length ) choices.set(key, values);
      kinds.set(key, kind);
    };
    const types = ["ability", "skill", "tool", "initiative", "attack", "save"]
      .map(value => ({ value, label: loc(`CONDBUILDER.Roll.Types.${value}`) }));
    add("roll.type", "type", types);
    add("roll.ability", "ability", options(cfg.abilities));
    add("roll.proficient", "proficient", null, "boolean");
    add("roll.skill", "skill", options(cfg.skills));
    add("roll.tool", "tool", Object.keys(cfg.tools ?? {}).map(value => ({ value, label: toolLabel(value) })));
    add("roll.attack.mode", "attackMode", options(cfg.attackModes));
    add("roll.attack.type", "attackType", options(cfg.attackTypes));
    add("roll.attack.classification", "classification", options(cfg.attackClassifications));
    add("roll.item.name", "itemName");
    add("roll.item.identifier", "itemIdentifier");
    add("roll.item.properties", "itemProperties", options(cfg.itemProperties));
  }

  // Suggested values for common keys.
  choices.set("traits.size", options(cfg.actorSizes));
  choices.set("details.type.value", options(cfg.creatureTypes));
  choices.set("details.alignment", options(cfg.alignments).map(o => ({ value: o.label, label: o.label })));

  // Keys from more than one source (e.g. the actor's own flags) appear once.
  const unique = new Map(entries.map(e => [e.key, e]));
  return { actor, sample, keySample, entries: Array.from(unique.values()), choices, kinds };
}

/** Value type for a key: known kinds first, then whatever the sample holds. */
export function kindFor(context, key) {
  return context.kinds.get(key) ?? valueKind(context.sample ?? {}, key)
    ?? valueKind(context.keySample ?? {}, key);
}

/* -------------------------------------------- */

function effectActor(effect) {
  const parent = effect?.parent;
  if ( parent instanceof Actor ) return parent;
  return parent?.actor ?? null;
}

/** The same data dnd5e checks conditions against (minus the roll). */
function conditionData(effect, actor) {
  try {
    const rollData = actor.getRollData();
    return effect?.getRuleConditionData?.(rollData) ?? rollData;
  } catch ( err ) {
    console.warn("D&D 5e Condition Builder | Couldn't read condition data", err);
    return {};
  }
}

/** All leaf paths in the data, skipping documents, functions and private keys. */
function flatten(data) {
  const out = new Map();
  const seen = new WeakSet();
  const walk = (obj, prefix, depth) => {
    if ( depth > 6 ) return;
    for ( const [k, v] of Object.entries(obj) ) {
      if ( k.startsWith("_") || (!prefix && SKIP.has(k)) ) continue;
      const path = prefix ? `${prefix}.${k}` : k;
      if ( (v === null) || (v === undefined) || (typeof v !== "object") ) {
        if ( typeof v !== "function" ) out.set(path, v);
        continue;
      }
      if ( (v instanceof Set) || Array.isArray(v) ) { out.set(path, v); continue; }
      if ( v instanceof foundry.abstract.Document ) continue;
      if ( seen.has(v) ) continue;
      seen.add(v);
      walk(v, path, depth + 1);
    }
  };
  walk(data ?? {}, "", 0);
  return out;
}

/** dnd5e's own label where it has one, otherwise a readable path. */
function keyLabel(key, actor) {
  try {
    const label = dnd5e.utils.getHumanReadableAttributeLabel(key, { actor });
    if ( label ) return label;
  } catch {}
  const cfg = CONFIG.DND5E;
  const parts = key.split(".");
  return parts.map((part, i) => {
    const parent = parts[i - 1];
    if ( (i === 1) && (parent === "classes") ) return actor?.classes?.[part]?.name ?? humanize(part);
    const entry = (i === 1) ? cfg[parent]?.[part] : null;
    const label = (typeof entry === "string") ? entry : (entry?.label ?? null);
    if ( label ) return game.i18n.localize(label);
    if ( (i === 0) && (part === "sourceItem") ) return game.i18n.localize("CONDBUILDER.ItemGroup");
    return humanize(part);
  }).join(SEP);
}

function toolLabel(id) {
  try {
    const label = dnd5e.documents.Trait.keyLabel(`tool:${id}`, { trait: "tool" });
    if ( label && (label !== id) ) return label;
  } catch {}
  return id;
}

/** "spellDC" → "Spell DC". */
function humanize(key) {
  return String(key).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());
}
