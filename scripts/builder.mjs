import * as M from "./model.mjs";
import { buildContext, kindFor } from "./keys.mjs";

/**
 * Built on the dnd5e system's application base, like Crafting and the Ability Score Generator,
 * so the window gets the system frame, the large title with the effect's name beneath it,
 * and the system's cards and gold buttons.
 * Falls back to a plain ApplicationV2 on dnd5e versions without the mixin.
 */
const { ApplicationV2 } = foundry.applications.api;
const BaseApp = globalThis.dnd5e?.applications?.api?.ApplicationV2Mixin
  ? dnd5e.applications.api.ApplicationV2Mixin(ApplicationV2, { handlebars: false })
  : ApplicationV2;

/**
 * Visual editor for one dnd5e filters field (change conditions or effect conditions).
 * Edits a tree of groups and rules, previews each against the actor's current data,
 * and writes filter JSON back to the field on Save.
 */
export default class ConditionBuilder extends BaseApp {
  /**
   * @param {object} options
   * @param {HTMLElement} options.input        The <filters-input> being edited.
   * @param {ActiveEffect|null} options.effect
   * @param {boolean} options.effectLevel      Conditions on the whole effect.
   */
  constructor({ input, effect, effectLevel, ...options }) {
    super(options);
    this.input = input;
    this.effect = effect;
    this.effectLevel = effectLevel;
    const root = M.parse(input.value);
    this.root = root ?? M.group();
    this.rawMode = !root;
    this.rawText = input.value;
    this.context = buildContext(effect, { effectLevel });
  }

  static DEFAULT_OPTIONS = {
    classes: ["dnd5e2", "condition-builder"],
    tag: "section",
    window: {
      icon: "fa-solid fa-filter",
      resizable: true
    },
    position: { width: 720, height: "auto" }
  };

  /** @override */
  get title() {
    return game.i18n.localize("CONDBUILDER.Title");
  }

  /** The dnd5e window header shows the title large and the subtitle beneath it. */
  get subtitle() {
    return this.effect?.name ?? "";
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _renderHTML() {
    const body = el("div", "cb-body standard-form");
    const intro = this.effectLevel ? "CONDBUILDER.IntroEffect" : "CONDBUILDER.Intro";
    body.append(el("p", "hint", game.i18n.localize(intro)));

    const card = el("fieldset", "card cb-card");
    if ( this.rawMode ) {
      card.append(el("legend", null, game.i18n.localize("CONDBUILDER.Json")));
      const area = el("textarea", "cb-raw");
      area.value = this.rawText;
      area.spellcheck = false;
      area.rows = 14;
      card.append(area, el("p", "hint", game.i18n.localize("CONDBUILDER.RawHint")));
    } else {
      card.append(el("legend", null, game.i18n.localize("CONDBUILDER.Rules")));
      const live = this.context.actor
        ? game.i18n.format("CONDBUILDER.CheckedAgainst", { actor: this.context.actor.name })
        : game.i18n.localize("CONDBUILDER.NoActor");
      card.append(el("p", "hint cb-live", live));
      const tree = el("div", "cb-tree");
      tree.append(this.#renderGroup(this.root, true));
      card.append(tree);
    }
    body.append(card);

    body.append(el("p", "cb-warning", ""));

    const footer = el("footer", "form-footer cb-footer");
    footer.append(
      button(this.rawMode ? "CONDBUILDER.Visual" : "CONDBUILDER.Raw", "toggle-raw",
        this.rawMode ? "fa-solid fa-diagram-project" : "fa-solid fa-code", "cb-toggle"),
      button("CONDBUILDER.Cancel", "cancel", "fa-solid fa-xmark", "cb-cancel"),
      button("CONDBUILDER.Save", "save", "fa-solid fa-floppy-disk", "cb-save")
    );
    body.append(footer);

    // Key suggestions without Effect Select.
    if ( !this.#keyPicker ) {
      const list = el("datalist");
      list.id = `${this.id}-keys`;
      for ( const entry of this.context.entries ) {
        const option = el("option");
        option.value = entry.key;
        option.label = entry.label;
        list.append(option);
      }
      body.append(list);
    }
    return body;
  }

  /** @override */
  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const picker = this.#keyPicker;
    if ( picker ) {
      for ( const input of this.element.querySelectorAll("input.cb-key") ) {
        new picker(input, () => this.context.entries);
      }
    }
    this.#refresh();
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.element.addEventListener("input", this.#onInput.bind(this));
    this.element.addEventListener("change", this.#onChange.bind(this));
    this.element.addEventListener("click", this.#onClick.bind(this));
  }

  /** Effect Select's key picker, when that module is active. */
  get #keyPicker() {
    const module = game.modules.get("effect-select");
    return module?.active ? module.api?.KeyPicker : null;
  }

  /* -------------------------------------------- */

  #renderGroup(node, isRoot=false) {
    const wrap = el("div", `cb-group${isRoot ? " root" : ""}`);
    wrap.dataset.id = node.id;

    const header = el("div", "cb-group-header");
    header.append(result());
    const select = el("select", "cb-group-op");
    for ( const op of M.GROUP_OPS ) {
      const option = el("option", null, game.i18n.localize(`CONDBUILDER.Groups.${op}`));
      option.value = op;
      option.selected = op === node.op;
      select.append(option);
    }
    header.append(select);
    const controls = el("div", "cb-controls");
    controls.append(
      goldButton("CONDBUILDER.AddRule", "add-rule", "fa-solid fa-plus"),
      goldButton("CONDBUILDER.AddGroup", "add-group", "fa-solid fa-layer-group")
    );
    if ( !isRoot ) controls.append(iconButton("CONDBUILDER.RemoveGroup", "remove", "fa-solid fa-trash"));
    header.append(controls);
    wrap.append(header);

    const children = el("div", "cb-children");
    if ( !node.children.length && isRoot ) children.append(el("p", "hint cb-empty", game.i18n.localize("CONDBUILDER.Empty")));
    for ( const child of node.children ) {
      if ( child.type === "group" ) children.append(this.#renderGroup(child));
      else if ( child.type === "rule" ) children.append(this.#renderRule(child));
      else children.append(this.#renderRaw(child));
    }
    wrap.append(children);
    return wrap;
  }

  #renderRule(node) {
    const row = el("div", "cb-rule");
    row.dataset.id = node.id;
    row.append(result());

    const key = el("input", "cb-key");
    key.type = "text";
    key.value = node.key;
    key.placeholder = game.i18n.localize("CONDBUILDER.Key");
    key.spellcheck = false;
    if ( !this.#keyPicker ) key.setAttribute("list", `${this.id}-keys`);
    const keyWrap = el("div", "cb-key-wrap");
    keyWrap.append(key, el("span", "cb-key-label", this.#keyLabel(node.key)));
    row.append(keyWrap);

    const op = el("select", "cb-op");
    for ( const [group, ops] of Object.entries(M.COMPARISONS) ) {
      const optgroup = el("optgroup");
      optgroup.label = game.i18n.localize(`CONDBUILDER.OpGroups.${group}`);
      for ( const value of ops ) {
        const option = el("option", null, game.i18n.localize(`CONDBUILDER.Ops.${value}`));
        option.value = value;
        option.selected = value === node.op;
        optgroup.append(option);
      }
      op.append(optgroup);
    }
    row.append(op);
    row.append(this.#renderValue(node));
    row.append(iconButton("CONDBUILDER.Remove", "remove", "fa-solid fa-trash"));
    return row;
  }

  #renderValue(node) {
    const kind = kindFor(this.context, node.key);
    const yesNo = (node.op === "empty") || ((kind === "boolean") && (node.op === "exact"));
    if ( yesNo ) {
      const select = el("select", "cb-value");
      for ( const value of [true, false] ) {
        const option = el("option", null, game.i18n.localize(value ? "CONDBUILDER.Yes" : "CONDBUILDER.No"));
        option.value = String(value);
        option.selected = node.value === value;
        select.append(option);
      }
      // Make sure the stored value matches what's shown.
      if ( typeof node.value !== "boolean" ) node.value = true;
      return select;
    }
    const input = el("input", "cb-value");
    input.type = "text";
    input.value = M.formatValue(node.value);
    input.placeholder = game.i18n.localize(M.LIST_OPS.has(node.op) ? "CONDBUILDER.ValueList" : "CONDBUILDER.Value");
    const choices = this.context.choices.get(node.key);
    if ( choices?.length ) {
      const list = el("datalist");
      list.id = `${this.id}-${node.id}-values`;
      for ( const choice of choices ) {
        const option = el("option");
        option.value = choice.value;
        option.label = choice.label;
        list.append(option);
      }
      input.setAttribute("list", list.id);
      const wrap = el("div", "cb-value-wrap");
      wrap.append(input, list);
      return wrap;
    }
    return input;
  }

  #renderRaw(node) {
    const row = el("div", "cb-rule cb-raw-rule");
    row.dataset.id = node.id;
    row.append(result());
    const wrap = el("div", "cb-raw-wrap");
    wrap.append(el("span", "cb-key-label", game.i18n.localize("CONDBUILDER.RawRow")));
    const area = el("textarea", "cb-raw-node");
    area.value = JSON.stringify(node.data);
    area.rows = 2;
    area.spellcheck = false;
    wrap.append(area);
    row.append(wrap, iconButton("CONDBUILDER.Remove", "remove", "fa-solid fa-trash"));
    return row;
  }

  #keyLabel(key) {
    if ( !key ) return "";
    return this.context.entries.find(e => e.key === key)?.label ?? "";
  }

  /* -------------------------------------------- */
  /*  Live results                                */
  /* -------------------------------------------- */

  /** Update pass/fail marks and the warning line without re-rendering. */
  #refresh() {
    const warning = this.element.querySelector(".cb-warning");
    if ( warning ) {
      const incomplete = !this.rawMode && M.hasIncomplete(this.root);
      warning.textContent = incomplete ? game.i18n.localize("CONDBUILDER.Incomplete") : "";
    }
    if ( this.rawMode ) return;
    for ( const row of this.element.querySelectorAll("[data-id]") ) {
      const { node } = M.find(this.root, row.dataset.id) ?? {};
      const mark = row.querySelector(":scope > .cb-result, :scope > .cb-group-header > .cb-result");
      if ( node && mark ) setResult(mark, this.#evaluate(node));
    }
  }

  /** "pass", "fail", "roll", "unknown" or "" (nothing to check). */
  #evaluate(node) {
    const data = M.toData(node);
    if ( data === undefined ) return "";
    if ( JSON.stringify(data).includes('"k":"roll.') ) return "roll";
    const sample = this.context.sample;
    if ( !sample ) return "unknown";
    try {
      return dnd5e.Filter.performCheck(sample, data) ? "pass" : "fail";
    } catch {
      return "unknown";
    }
  }

  /* -------------------------------------------- */
  /*  Events                                      */
  /* -------------------------------------------- */

  #nodeFor(target) {
    const row = target.closest("[data-id]");
    return row ? M.find(this.root, row.dataset.id) : null;
  }

  #onInput(event) {
    const target = event.target;
    if ( target.matches("textarea.cb-raw") ) {
      this.rawText = target.value;
      return;
    }
    const found = this.#nodeFor(target);
    if ( !found ) return;
    const { node } = found;
    if ( target.matches("input.cb-key") ) {
      node.key = target.value;
      const label = target.closest(".cb-key-wrap")?.querySelector(".cb-key-label");
      if ( label ) label.textContent = this.#keyLabel(node.key);
    }
    else if ( target.matches("input.cb-value") ) {
      node.value = M.parseValue(target.value, node.op, kindFor(this.context, node.key));
    }
    else if ( target.matches("textarea.cb-raw-node") ) {
      try {
        node.data = JSON.parse(target.value);
        target.classList.remove("invalid");
      } catch {
        target.classList.add("invalid");
      }
    }
    this.#refresh();
  }

  #onChange(event) {
    const target = event.target;
    const found = this.#nodeFor(target);
    if ( !found ) return;
    const { node } = found;
    const kind = () => kindFor(this.context, node.key);

    if ( target.matches("select.cb-group-op") ) {
      node.op = target.value;
      return this.#refresh();
    }
    if ( target.matches("select.cb-op") ) {
      const text = (typeof node.value === "boolean") ? "" : M.formatValue(node.value);
      node.op = target.value;
      node.value = M.parseValue(text, node.op, kind());
      return this.render();
    }
    if ( target.matches("select.cb-value") ) {
      node.value = target.value === "true";
      return this.#refresh();
    }
    if ( target.matches("input.cb-key") ) {
      // The value widget depends on the key's type, e.g. Yes/No for true/false keys.
      node.key = target.value;
      const text = (typeof node.value === "boolean") ? "" : M.formatValue(node.value);
      node.value = M.parseValue(text, node.op, kind());
      return this.render();
    }
  }

  async #onClick(event) {
    const button = event.target.closest("button[data-action]");
    if ( !button ) return;
    event.preventDefault();
    const action = button.dataset.action;
    const found = this.#nodeFor(button);
    switch ( action ) {
      case "add-rule":
        found.node.children.push(M.rule());
        return this.render();
      case "add-group":
        found.node.children.push(M.group("OR", [M.rule()]));
        return this.render();
      case "remove": {
        const { node, parent } = found;
        parent?.children.findSplice(c => c.id === node.id);
        return this.render();
      }
      case "toggle-raw": return this.#toggleRaw();
      case "cancel": return this.close();
      case "save": return this.#save();
    }
  }

  #toggleRaw() {
    if ( this.rawMode ) {
      const root = M.parse(this.rawText);
      if ( !root ) return ui.notifications.warn("CONDBUILDER.RawInvalid", { localize: true });
      this.root = root;
      this.rawMode = false;
    } else {
      const json = M.serialize(this.root);
      this.rawText = JSON.stringify(JSON.parse(json), null, 2);
      this.rawMode = true;
    }
    this.render();
  }

  async #save() {
    let json;
    if ( this.rawMode ) {
      const text = this.rawText.trim() || "{}";
      try { json = JSON.stringify(JSON.parse(text)); }
      catch { return ui.notifications.warn("CONDBUILDER.RawInvalid", { localize: true }); }
    }
    else json = M.serialize(this.root);
    // Setting the value refreshes dnd5e's summary and fires change, so the sheet saves as usual.
    if ( json !== this.input.value ) this.input.value = json;
    await this.close();
  }
}

/* -------------------------------------------- */
/*  DOM helpers                                 */
/* -------------------------------------------- */

function el(tag, className, text) {
  const element = document.createElement(tag);
  if ( className ) element.className = className;
  if ( text ) element.textContent = text;
  return element;
}

function button(label, action, icon, className) {
  const b = el("button", className);
  b.type = "button";
  b.dataset.action = action;
  b.innerHTML = `<i class="${icon}" inert></i> `;
  b.append(game.i18n.localize(label));
  return b;
}

/** Small icon button in the system's gold style, for adding rules and groups. */
function goldButton(label, action, icon) {
  const b = iconButton(label, action, icon);
  b.className = "gold-button";
  return b;
}

/** Quiet icon button, like the remove controls on the crafting window. */
function iconButton(label, action, icon) {
  const b = el("button", "unbutton control-button");
  b.type = "button";
  b.dataset.action = action;
  b.ariaLabel = game.i18n.localize(label);
  b.dataset.tooltip = label;
  b.innerHTML = `<i class="${icon}" inert></i>`;
  return b;
}

function result() {
  const span = el("span", "cb-result");
  span.setAttribute("aria-live", "polite");
  return span;
}

const RESULTS = {
  pass: ["fa-solid fa-circle-check", "CONDBUILDER.Pass"],
  fail: ["fa-solid fa-circle-xmark", "CONDBUILDER.Fail"],
  roll: ["fa-solid fa-dice-d20", "CONDBUILDER.DuringRoll"],
  unknown: ["fa-regular fa-circle-question", "CONDBUILDER.Unknown"]
};

function setResult(span, state) {
  span.className = `cb-result ${state}`;
  const [icon, label] = RESULTS[state] ?? [];
  span.innerHTML = icon ? `<i class="${icon}" inert></i>` : "";
  if ( label ) span.dataset.tooltip = game.i18n.localize(label);
  else delete span.dataset.tooltip;
}
