import ConditionBuilder from "./builder.mjs";

const MODULE_ID = "dnd5e-condition-builder";

/** Open builders, so a second click on the same field brings its window forward. */
const open = new WeakMap();

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "enabled", {
    name: "CONDBUILDER.Settings.Enabled.Name",
    hint: "CONDBUILDER.Settings.Enabled.Hint",
    scope: "client", config: true, type: Boolean, default: true
  });
  game.modules.get(MODULE_ID).api = { ConditionBuilder, openFor };
});

/**
 * dnd5e's <filters-input> fires a cancelable "edit" event before opening its JSON editor.
 * Cancel it and open the builder instead.
 */
document.addEventListener("edit", event => {
  const input = event.target;
  if ( (input?.tagName !== "FILTERS-INPUT") || (game.system?.id !== "dnd5e") ) return;
  if ( !game.settings.get(MODULE_ID, "enabled") ) return;
  event.preventDefault();
  openFor(input);
}, { capture: true });

/**
 * Open (or focus) the builder for a filters input.
 * @param {HTMLElement} input  A <filters-input> element.
 * @returns {ConditionBuilder}
 */
export function openFor(input) {
  const existing = open.get(input);
  if ( existing?.rendered ) {
    existing.bringToFront();
    return existing;
  }
  const app = foundry.applications.instances.get(input.closest(".application")?.id);
  const doc = app?.effect ?? app?.document ?? app?.options?.document;
  const effect = (doc?.documentName === "ActiveEffect") ? doc : null;
  const builder = new ConditionBuilder({
    input,
    effect,
    effectLevel: input.getAttribute("name")?.endsWith("system.conditions") ?? false
  });
  open.set(input, builder);
  builder.render({ force: true });
  return builder;
}
