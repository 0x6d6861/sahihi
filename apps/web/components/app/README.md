# components/app

App-specific **compositions** of coss and Extend components (field editor, signing surface, recipient
list, …). This is where our UI code lives.

- `components/ui/`: vendored coss/Extend registry files. **Do not edit.**
- Here: import from `@/components/ui/*` and compose. No new primitives and no hard-coded colours.

See `docs/ui.md` and ADR 0003.
