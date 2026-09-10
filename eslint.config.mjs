import jsxA11y from 'eslint-plugin-jsx-a11y'
import nextPlugin from '@next/eslint-plugin-next'
import reactHooks from 'eslint-plugin-react-hooks'
import tsParser from '@typescript-eslint/parser'

/**
 * THE AUTOMATED ACCESSIBILITY GATE.
 *
 * Every accessibility fix in the standing UI-quality program
 * (docs/UI-BEST-VERSION.md) was found by a person reading components one at
 * a time. That found real defects — but it scales with attention, and the
 * six hand-written guards in `tests/a11y/` only pin findings we already
 * made. Nothing in the repo could catch the NEXT missing label.
 *
 * This config is deliberately NOT `jsx-a11y`'s recommended preset. The
 * preset's interaction rules (`click-events-have-key-events`,
 * `no-static-element-interactions`, `no-noninteractive-element-*`) fire on
 * hundreds of rows across this codebase — every clickable table row, card
 * and list item — most of which already carry a real keyboard path through
 * a nested link or button that the rule cannot see. Turning them on would
 * mean an allowlist covering half the tree, and an allowlist that large is
 * indistinguishable from the rule being off, except that it also has to be
 * maintained.
 *
 * So the set below is the one that maps to the failure CLASSES this program
 * actually kept finding, and every one of them is an error:
 *
 *   - a control with no accessible name (the largest class by far);
 *   - a role that is misspelled, unsupported, or missing its required
 *     properties — an invented role is silently ignored by AT;
 *   - an `aria-*` prop that is misspelled or wrongly typed, which likewise
 *     fails silently;
 *   - an image, anchor, heading or iframe with no text alternative;
 *   - focus traps and focus sinks (positive tabindex,
 *     aria-hidden on a focusable node).
 *
 * Every rule here is on ERROR because the gate is worth nothing as a
 * warning: a warning that CI does not fail on is a comment.
 *
 * THE SUPPRESSIONS FILE IS EMPTY, AND THAT IS THE POINT.
 * `eslint-suppressions.json` (ESLint's own native bulk-suppression format,
 * not a hand-written allowlist) landed in batch 52 carrying 77
 * `label-has-associated-control` hits across 23 files — a real defect class,
 * the largest in the app: a `<label>` that is a SIBLING of its input with no
 * `htmlFor` and no nesting gives that field no accessible name at all, so a
 * screen reader reads it "edit text, blank". Suppression rather than an
 * allowlist was chosen because the two differ in the one way that mattered:
 * a suppression records a per-file COUNT, so a 78th offender — even in an
 * already-listed file — failed. The class could not grow while it was burned
 * down. **Batch 53 finished the burn-down**: all 77 are named, `pnpm
 * lint:prune` emptied the file, and the rule below now guards the tree with
 * nothing suppressing it. Do NOT re-fill this file to get a red gate green —
 * `tests/a11y/form-labels.test.ts` fails on any `label-has-associated-control`
 * entry returning to it. Name the field instead.
 *
 * Run: `pnpm lint`. CI runs it on every PR (.github/workflows/ci.yml).
 */

/** The rendering tree. Tests, scripts and config are not shipped UI. */
const UI_FILES = ['app/**/*.tsx', 'components/**/*.tsx']

export default [
  {
    files: UI_FILES,
    plugins: {
      'jsx-a11y': jsxA11y,
      // REGISTERED BUT ENTIRELY OFF, on purpose. 74 `eslint-disable-next-
      // line` comments across the tree name `@next/next/no-img-element`,
      // `@next/next/no-page-custom-font` and `react-hooks/exhaustive-deps`
      // — written when `next lint` still ran, and inert ever since Next 16
      // removed it and the repo shipped without an ESLint config at all.
      // ESLint 9 treats a directive naming an UNREGISTERED rule as an error
      // in its own right, so without these two the a11y gate would fail on
      // 74 comments that have nothing to do with accessibility.
      //
      // Registering them keeps the authors' intent readable (somebody
      // deliberately allowed that <img>) and leaves the door open: turning
      // either rule set on is its own batch with its own burn-down, not a
      // rider on this one.
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    linterOptions: {
      // Every one of those 74 directives is by definition unused while its
      // rule is off; reporting them would bury the a11y findings.
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      'jsx-a11y': {
        // Our own primitives, so the rules see through them to the element
        // they render. Without this every ActionButton is an unknown
        // component and the whole set silently stops applying to the one
        // control the app uses most.
        components: {
          ActionButton: 'button',
          BrandButton: 'button',
          GhostButton: 'button',
          PortalInput: 'input',
          SearchInput: 'input',
          SiteImage: 'img',
        },
      },
    },
    rules: {
      // ── Accessible names ────────────────────────────────────────────
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/iframe-has-title': 'error',
      'jsx-a11y/img-redundant-alt': 'error',
      'jsx-a11y/label-has-associated-control': [
        'error',
        // `nesting` OR `id` — the repo uses both shapes deliberately, and a
        // label with only text and a `for` is still a correct label.
        { assert: 'either', depth: 3 },
      ],

      // ── Roles and ARIA: the silent-failure class ────────────────────
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-role': ['error', { ignoreNonDOM: true }],
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      'jsx-a11y/no-redundant-roles': 'error',
      // NOT `prefer-tag-over-role` — 111 hits, none of them a defect. It
      // wants `<dialog>` for every `role="dialog"` (the repo's drawers and
      // modals are hand-built precisely because `<dialog>`'s focus and
      // dismissal behaviour is not what they need) and `<output>` for every
      // `role="status"` (a live region on a div is the standard shape; the
      // two elements are not interchangeable). A style preference wearing an
      // accessibility rule's clothes.

      // ── Focus ───────────────────────────────────────────────────────
      'jsx-a11y/tabindex-no-positive': 'error',
      'jsx-a11y/no-aria-hidden-on-focusable': 'error',
      'jsx-a11y/aria-activedescendant-has-tabindex': 'error',
      'jsx-a11y/interactive-supports-focus': 'error',

      // ── Form and document correctness ───────────────────────────────
      'jsx-a11y/autocomplete-valid': 'error',
      'jsx-a11y/html-has-lang': 'error',
      'jsx-a11y/lang': 'error',
      'jsx-a11y/scope': 'error',
      'jsx-a11y/no-access-key': 'error',
      'jsx-a11y/no-distracting-elements': 'error',
      'jsx-a11y/mouse-events-have-key-events': 'error',
    },
  },
]
