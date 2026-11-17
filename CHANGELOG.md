# Changelog

## 1.0.0
First release.
- Visual builder for dnd5e Change Conditions and Effect Conditions, opened from the system's filter button in place of the JSON editor.
- Rules (key, comparison, value) and nestable groups: All of, Any of, None of, Not all of, An odd number of, Not.
- Live pass/fail for each rule and group against the effect's actor, using dnd5e's own filter code; roll-dependent rules are marked as such.
- Keys from the actor's roll data, statuses, the source item and the current roll (change conditions only), with readable names.
- Values typed to match the key (numbers, text, Yes/No), comma-separated lists, and suggested values for common keys.
- Unsupported filter parts kept as editable advanced rules; Edit as JSON toggle.
- Uses Effect Select's searchable key dropdown when that module is active.
