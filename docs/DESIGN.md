# ShiftLayer Design

## Product sentence

**ShiftLayer lets you rearrange the annoying parts of the web without breaking the parts you still need.**

## Interaction model

The primary UX deliberately borrows a browser-native habit:

1. Right-click an element.
2. Choose `ShiftLayer · Move element`.
3. The element gains a bright outline and the extension explains the available controls.
4. Drag it, or nudge with arrow keys.
5. Drop or press Enter to persist.
6. Press Escape at any time to return to the pre-move position.

No inspector panel, selector knowledge, or CSS vocabulary is required.

## Visual identity

ShiftLayer should feel like a small precision tool rather than a design suite.

- Deep violet base for the extension surface.
- Acid-lime accent for the thing ShiftLayer is actively touching.
- Compact rounded geometry.
- UI appears only when it has a job, then gets out of the way.
- In-page feedback is isolated in a closed Shadow DOM so site styles cannot easily distort it.

Tagline: **Your web. Your layout.**

## Why Move is visual, not structural

The obvious implementation is `someOtherContainer.appendChild(button)`. That is also the dangerous implementation.

Modern frameworks maintain their own model of the DOM. A node can have event delegation assumptions, contextual CSS, form ownership, accessibility order, and component lifecycle tied to where the framework expects it to be. Re-parenting a live node can work until the next render, then fail strangely.

ShiftLayer v0.1 therefore keeps the real node exactly where its application placed it and changes only its visual translation. The button remains the button. Its event listeners remain attached. Framework ownership remains intact.

The cost is a blank/occupied original layout slot. That is an acceptable MVP tradeoff and should be explained rather than hidden.

## Why CSS `translate`

CSS individual transform properties (`translate`, `rotate`, `scale`) are separate from the legacy `transform` property. Websites very commonly animate `transform`; overwriting that property would break hover effects and other motion.

ShiftLayer uses `translate` for its displacement and therefore normally leaves `transform` alone. At runtime it snapshots the element's inline `translate` declaration so Reset can restore it. Common computed pixel translations are folded into the movement baseline.

A site that heavily animates the individual `translate` property itself is a known edge case.

## Architecture

### `background.js`
Responsibilities:
- register context-menu entries
- convert menu clicks into messages for the active tab

It does not inspect page DOM or store content.

### `content/content.js`
Responsibilities:
- remember the element that received the most recent page context menu
- normalize nested clicks to a meaningful interactive ancestor when appropriate
- run move sessions
- prevent accidental activation during drag
- build/find fingerprints
- apply/reset movement
- reconcile saved rules after reload or dynamic DOM replacement
- expose current page scope to the popup
- render tiny in-page guidance UI

### `shared.js`
Responsibilities:
- storage schema and migration boundary
- origin/path scope calculation
- local storage helpers
- element fingerprint construction and lookup
- safe human-readable labels
- generated-token heuristics

It is loaded as a classic script so the same code can serve content scripts, the popup, and tests without a bundler.

### Popup
Responsibilities:
- ask the content script which page is active
- read local rules for that page/origin
- show counts/list
- delete a rule or origin set

The popup does not need broad tab URL permissions because the content script reports its own safe scope.

## Storage schema v1

Conceptually:

```json
{
  "version": 1,
  "scopes": {
    "https://example.com/path": {
      "origin": "https://example.com",
      "pathname": "/path",
      "items": {
        "uuid": {
          "id": "uuid",
          "kind": "move",
          "label": "button · aria-label-value",
          "fingerprint": {},
          "offsetX": 140,
          "offsetY": -20,
          "createdAt": "ISO timestamp",
          "updatedAt": "ISO timestamp"
        }
      }
    }
  }
}
```

The query string and hash never participate in the scope key. This avoids multiplying rules for tracking parameters, tabs, and transient anchors.

## Fingerprints

A raw `document.querySelector` path is too brittle. ShiftLayer saves a small fingerprint with several candidate selectors.

Priority:
1. stable unique id
2. stable automation data attributes
3. semantic attributes
4. stable unique class combination
5. nth-of-type structural path

The extension rejects obvious hash-like/generated tokens. Restoration tries selectors in order. If a selector returns multiple candidates, attributes contribute to a score and ShiftLayer uses the winner only when it is meaningfully stronger than the runner-up.

No `textContent`, `innerText`, `value`, `href`, or `src` is used for persistence.

## Dynamic pages

Rules can fail on modern SPAs because a component is frequently destroyed and recreated.

ShiftLayer keeps a runtime map from rule id to currently matched element and original style baseline. While a page has rules, a MutationObserver watches only child-list changes. Reconciliation is debounced, missing nodes are re-found, and recreated matches receive the saved offset.

Pathname changes are also detected. If the route scope changes, old offsets are restored before the new route's rules are applied.

## Move state machine

`idle → armed → dragging → commit → idle`

Alternative exits:
- `armed/dragging → Escape → rollback → idle`
- click elsewhere while armed → rollback → idle
- pointer cancel → remain armed

The `armed` state matters because selecting the context-menu command and physically dragging are separate gestures.

## Privacy and security

ShiftLayer does not need a backend.

Threat-reduction choices:
- no analytics
- no fetch/XHR/WebSocket path in extension code
- no remote script or stylesheet
- no eval/new Function
- no form/page text persistence
- selector values are bounded
- no href/src storage, avoiding accidental tokenized URL capture
- browser-protected pages are left protected
- minimal extension permissions beyond storage/context menu and declarative content-script access

## Accessibility

The move interaction is not pointer-only.
- Arrow keys move by one pixel.
- Shift + Arrow moves by ten pixels.
- Enter saves.
- Escape cancels.

Future versions should add a popup command to begin keyboard targeting without requiring a context menu and should expose richer screen-reader announcements.

## Failure philosophy

ShiftLayer should fail quietly and reversibly.

If a selector no longer matches, the page should remain normal. A broken saved rule is preferable to a broken website. Future versions can surface broken-rule repair in the site editor.
