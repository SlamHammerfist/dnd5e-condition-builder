# D&D 5e Condition Builder

Replaces the raw JSON editor for Active Effect **Change Conditions** with a visual builder. Pick a key, a comparison and a value, group rules with *All of / Any of / None of*, and see whether each rule passes for the actor right now.

## Using it
Click the filter button next to **Change Conditions** (in a change's edit dialog) or **Effect Conditions** (on the effect's Details tab). The builder opens instead of the JSON box.

- **Rule**: key, comparison, value. The key's readable name shows under it.
- **Group**: *All of*, *Any of*, *None of*, *Not all of*, *An odd number of*, or *Not*. Groups can be nested.
- **Live check**: each rule and group gets a tick (passes now), a cross (fails now) or a d20 (depends on the roll, so it's only known during one). Checks use the actor the effect is on and dnd5e's own filter code.
- **Save** writes the conditions back to the field. **Cancel** or closing the window changes nothing.
- **Edit as JSON** switches to the raw filter, and back.

## Keys
- **Actor data**: everything a roll formula can use, e.g. `attributes.hp.value`, `abilities.str.mod`, `classes.bard.levels`, `details.level`, `flags.dnd5e.jackOfAllTrades`.
- **Statuses**: `statuses.prone`, `statuses.exhaustion` (its level), ... Use *at least 1* to mean "has it".
- **Source item** (effects on items): `sourceItem.*`, e.g. `sourceItem.equipped`, `sourceItem.attunement`.
- **Current roll** (change conditions only): `roll.type`, `roll.ability`, `roll.skill`, `roll.tool`, `roll.proficient`, `roll.attack.mode`, `roll.attack.type`, `roll.attack.classification`, `roll.item.*`. Effect-wide conditions can't use these (dnd5e warns if you try).

With **[Effect Select](https://github.com/SlamHammerfist/effect-select)** active, the key field gets its searchable dropdown (type `bard lev` or `prone`). Without it, the browser's own suggestion list is used.

## Values
Values are stored with the right type for the key, which matters because *is* compares exactly (`3` isn't `"3"`):
- Number keys get numbers, text keys get text, true/false keys get a Yes/No choice.
- *is one of*, *includes any of*, *includes all of* and *only includes* take a comma-separated list.
- Keys with known options (roll type, ability, skill, attack mode, size, creature type, ...) suggest them.

Anything the builder can't show (for example *includes* with a nested filter) appears as an **advanced rule** with its JSON, and is saved unchanged.

## Settings (per player)
- **Use the condition builder**: turn off to get the system's JSON editor back.

## Requirements
- Foundry VTT v14
- D&D 5e 6.0 or later
- Optional: Effect Select
