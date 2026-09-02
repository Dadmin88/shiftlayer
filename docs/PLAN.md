# ShiftLayer Product & Engineering Plan

## North star

ShiftLayer gives the user a personal presentation layer over the web. A site owns its functionality; the user should be able to control where that functionality lives on their screen without writing CSS or opening DevTools.

The product should feel closer to an ad-blocker's element picker than to a visual web-development suite.

## Phase 0 — Product definition

### Goals
- Establish the core mental model: **right-click → change the page → remember it**.
- Keep the first interaction obvious enough for non-developers.
- Make local-first privacy a non-negotiable product property.
- Prefer behavior-preserving visual changes before structural DOM edits.

### MVP acceptance criteria
1. User can right-click a normal page element.
2. `ShiftLayer · Move element` enters an unmistakable move state.
3. Pointer drag updates the real element visually without cloning or replacing it.
4. Drop persists the movement.
5. Reload restores the movement.
6. A framework-driven DOM replacement can be detected and best-effort restored.
7. Escape cancels safely.
8. Reset restores the page's original inline translate state.
9. Popup can inspect and remove saved movement rules.
10. No network or telemetry path exists.

## Phase 1 — MVP implementation (v0.1)

### Extension shell
- Chromium Manifest V3.
- Background service worker owns context-menu registration and message routing.
- Content script owns target selection, drag state, fingerprinting, restore/reconcile, and in-page feedback.
- Popup owns page/site inventory and reset controls.
- Shared zero-dependency helper layer owns storage schema and fingerprint utilities.

### Move engine
- Prefer an interactive ancestor when the right-click landed on a nested icon/span.
- Otherwise act on the exact element.
- Never target ShiftLayer's own UI or the document root/body.
- Use CSS individual `translate` instead of DOM re-parenting.
- Preserve/reset the element's pre-existing inline `translate` declaration.
- Compose common computed pixel translate values into the movement baseline.
- Intercept the drag gesture so the underlying control does not accidentally click while being moved.
- Suppress the post-drag click event.

### Precision controls
- Pointer drag.
- Arrow: 1 px.
- Shift + Arrow: 10 px.
- Enter: save.
- Escape: cancel.

### Persistence
- Schema version 1.
- Scope = exact origin + pathname.
- Ignore search query and hash.
- Save movement x/y plus bounded fingerprint metadata.
- Do not persist input values, textareas, contenteditable text, or general textContent.

### Re-identification
- stable unique id
- stable data attributes
- semantic attributes
- stable class combination when unique
- bounded nth-of-type path
- candidate scoring when a selector becomes non-unique

### Dynamic-page resilience
- Reconcile at initial load.
- MutationObserver only while the current page has ShiftLayer rules.
- Observe child-list changes only, not every attribute mutation.
- Debounce reconciliation.
- Detect pathname changes periodically plus popstate.
- Reapply if a framework removes and recreates the target node.

### Popup
- current origin customization count
- current pathname customization count
- moved-element labels and vectors
- reset one
- reset entire origin
- unsupported-page explanation

## Phase 2 — Hardening (v0.2)

### Selector repair
- Add a richer fingerprint score using ancestry and sibling shape without storing page text.
- Detect broken rules in the popup.
- Add `Repair target`: choose a replacement element and bind the existing movement to it.
- Track last successful match timestamp locally.

### Undo/history
- Keep a bounded local action journal.
- Toolbar/popup Undo and Redo.
- `Reset page` separate from `Reset site`.
- Optional temporary disable for site without deleting rules.

### Movement quality
- Magnetic viewport/page-edge guides.
- Optional 4/8 px grid snapping.
- On-screen x/y readout while moving.
- Detect off-screen drops and offer recovery.
- Add `Bring moved elements back onscreen` safety action.

### Performance
- Profile highly dynamic sites.
- Coalesce storage updates.
- Cap selector scan work per reconciliation cycle.
- Avoid document-wide scans when a primary selector can resolve directly.

## Phase 3 — The personal layout toolkit (v0.3–0.5)

### Hide
- Right-click `Hide element`.
- Preserve original inline display/visibility state for reset.
- Distinguish `display:none` from visually-hidden/accessibility-sensitive strategies.

### Resize
- Right-click `Resize element`.
- Corner/edge handles.
- Store width/height deltas with min/max safety.
- Preserve aspect ratio with Shift modifier where appropriate.

### Pin
- Right-click `Pin element`.
- Fixed-position viewport anchors: top-left, top-right, bottom-left, bottom-right, custom.
- Explicit z-index controls.
- Scroll-safe behavior.
- This is intentionally distinct from Move.

### Quick actions
- Move to corner.
- Center horizontally/vertically.
- Make smaller/larger.
- Keep visible while scrolling.
- Return to website default.

## Phase 4 — Site editor & rule management

- Full extension page listing customized sites.
- Search/filter rules.
- Enable/disable without deletion.
- Edit scope: this page, path prefix, entire origin.
- Duplicate a layout preset between paths.
- Broken-rule diagnostics.
- Friendly descriptions rather than raw CSS selectors by default.
- Advanced inspector showing exact fingerprint only behind a disclosure.

## Phase 5 — Portability

### Export/import
- Human-readable JSON export with schema version.
- Import preview and collision handling.
- Per-site or all-sites export.

### Optional sync
- Browser sync storage as an opt-in mode, never mandatory.
- Quota-aware compact schema.
- Clearly distinguish local-only and synced rules.
- No ShiftLayer-operated cloud required.

### Browser support
- Firefox WebExtensions compatibility pass.
- API abstraction where Chrome/Firefox differ.
- Cross-browser manual QA matrix.
- Store packaging and privacy disclosures.

## Phase 6 — Layout-aware Relocate (research)

A future `Relocate` command may genuinely alter document layout rather than only translating the element. It must remain separate because DOM re-parenting can break framework ownership, CSS inheritance, event delegation, form relationships, accessibility order, and responsive behavior.

Research tracks:
- placeholder + absolute overlay
- portal-like visual host while preserving event target
- CSS anchor positioning where supported
- layout-aware grid/flex overrides
- framework-specific failure detection

Ship only after it can clearly communicate the difference between safe visual movement and structural relocation.

## Release gates

Before a public store release:
- no remote code or network calls
- permissions reviewed for minimum viable set
- storage inspection confirms no page/form content leakage
- automated syntax/unit/build checks green
- manual QA on Chrome, Chromium, Brave, and Edge
- high-churn SPA QA
- accessibility keyboard path verified
- privacy policy/store disclosures written
- package has reproducible versioned build output
