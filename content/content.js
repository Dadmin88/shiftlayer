(() => {
  "use strict";

  if (globalThis.__shiftLayerLoaded) return;
  globalThis.__shiftLayerLoaded = true;

  const SL = globalThis.ShiftLayer;
  const APPLIED = new Map();
  const MOVING_CLASS = "__shiftlayer_moving_target__";
  const INTERACTIVE_SELECTOR = [
    "button",
    "a",
    "input:not([type='hidden'])",
    "select",
    "textarea",
    "summary",
    "[role='button']",
    "[role='link']",
    "[tabindex]",
  ].join(",");

  let lastContextTarget = null;
  let moveSession = null;
  let currentScopeKey = SL.pageInfoFromUrl(location.href).scopeKey;
  let reconcileTimer = null;
  let observer = null;

  const ui = createUi();

  function createUi() {
    const host = document.createElement("div");
    host.dataset.shiftlayerUi = "true";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .toast {
        position: fixed;
        left: 50%;
        bottom: 24px;
        transform: translateX(-50%);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        gap: 10px;
        max-width: min(520px, calc(100vw - 32px));
        padding: 11px 14px;
        border: 1px solid rgba(183,255,90,.35);
        border-radius: 12px;
        background: rgba(20, 15, 38, .96);
        color: #f8f7ff;
        box-shadow: 0 16px 44px rgba(0,0,0,.28);
        font: 600 13px/1.35 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: .01em;
        opacity: 0;
        pointer-events: none;
        transition: opacity 120ms ease, transform 120ms ease;
      }
      .toast.show { opacity: 1; transform: translateX(-50%) translateY(-4px); }
      .mark {
        width: 22px;
        height: 22px;
        display: grid;
        place-items: center;
        flex: 0 0 auto;
        border-radius: 7px;
        background: #7657ff;
        color: #b7ff5a;
        font-weight: 900;
      }
      kbd {
        border: 1px solid rgba(255,255,255,.22);
        border-bottom-width: 2px;
        border-radius: 5px;
        padding: 1px 5px;
        background: rgba(255,255,255,.08);
        font: inherit;
        font-size: 11px;
      }
    `;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<span class="mark">S</span><span class="message"></span>`;
    shadow.append(style, toast);
    (document.documentElement || document.body).appendChild(host);
    let timer = null;

    return {
      show(message, sticky = false) {
        clearTimeout(timer);
        toast.querySelector(".message").innerHTML = message;
        toast.classList.add("show");
        if (!sticky) timer = setTimeout(() => toast.classList.remove("show"), 2200);
      },
      hide() {
        clearTimeout(timer);
        toast.classList.remove("show");
      },
      host,
    };
  }

  function normalizeTarget(raw) {
    if (!(raw instanceof Element)) return null;
    if (raw.closest?.("[data-shiftlayer-ui='true']")) return null;
    if (raw === document.documentElement || raw === document.body) return null;
    const interactive = raw.closest?.(INTERACTIVE_SELECTOR);
    if (interactive && interactive !== document.documentElement && interactive !== document.body) return interactive;
    return raw;
  }

  function runtimeBaseFor(id, element) {
    const existing = APPLIED.get(id);
    if (existing?.element === element) return existing.base;

    const computed = getComputedStyle(element).translate;
    const numbers = computed && computed !== "none"
      ? computed.match(/-?\d*\.?\d+(?:e[+-]?\d+)?px/gi)?.map((value) => Number.parseFloat(value)) || []
      : [];

    const base = {
      inlineTranslate: element.style.getPropertyValue("translate"),
      inlinePriority: element.style.getPropertyPriority("translate"),
      x: Number.isFinite(numbers[0]) ? numbers[0] : 0,
      y: Number.isFinite(numbers[1]) ? numbers[1] : 0,
    };
    APPLIED.set(id, { element, base });
    return base;
  }

  function applyOffset(id, element, offsetX, offsetY) {
    const base = runtimeBaseFor(id, element);
    const x = Math.round(base.x + offsetX);
    const y = Math.round(base.y + offsetY);
    element.style.setProperty("translate", `${x}px ${y}px`, "important");
  }

  function restoreApplied(id) {
    const runtime = APPLIED.get(id);
    if (!runtime) return;
    const { element, base } = runtime;
    if (element?.isConnected) {
      if (base.inlineTranslate) {
        element.style.setProperty("translate", base.inlineTranslate, base.inlinePriority || "");
      } else {
        element.style.removeProperty("translate");
      }
    }
    APPLIED.delete(id);
  }

  async function reconcile() {
    clearTimeout(reconcileTimer);
    reconcileTimer = null;

    const info = SL.pageInfoFromUrl(location.href);
    if (info.scopeKey !== currentScopeKey) {
      for (const id of Array.from(APPLIED.keys())) restoreApplied(id);
      currentScopeKey = info.scopeKey;
    }

    const records = await SL.getScopeItems(location.href);
    const desiredIds = new Set(records.map((record) => record.id));

    for (const [id, runtime] of Array.from(APPLIED.entries())) {
      if (!desiredIds.has(id) || !runtime.element?.isConnected) restoreApplied(id);
    }

    for (const record of records) {
      const live = APPLIED.get(record.id)?.element;
      if (live?.isConnected) {
        applyOffset(record.id, live, record.offsetX, record.offsetY);
        continue;
      }
      const element = SL.findElement(record.fingerprint);
      if (element) applyOffset(record.id, element, record.offsetX, record.offsetY);
    }

    configureObserver(records.length > 0);
  }

  function scheduleReconcile(delay = 180) {
    if (reconcileTimer) clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(() => void reconcile(), delay);
  }

  function configureObserver(needed) {
    if (needed && !observer) {
      observer = new MutationObserver(() => scheduleReconcile(260));
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } else if (!needed && observer) {
      observer.disconnect();
      observer = null;
    }
  }

  async function recordForElement(element) {
    const records = await SL.getScopeItems(location.href);
    for (const record of records) {
      const applied = APPLIED.get(record.id)?.element;
      if (applied === element) return record;
      if (!applied && SL.findElement(record.fingerprint) === element) return record;
    }
    return null;
  }

  function newId() {
    return crypto.randomUUID ? crypto.randomUUID() : `sl-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function beginMove(element) {
    if (moveSession) cancelMove(false);
    const existing = await recordForElement(element);
    const id = existing?.id || newId();
    runtimeBaseFor(id, element);

    moveSession = {
      id,
      element,
      existing,
      fingerprint: existing?.fingerprint || SL.buildFingerprint(element),
      label: existing?.label || SL.safeLabel(element),
      offsetX: existing?.offsetX || 0,
      offsetY: existing?.offsetY || 0,
      startOffsetX: existing?.offsetX || 0,
      startOffsetY: existing?.offsetY || 0,
      pointerId: null,
      pointerStartX: 0,
      pointerStartY: 0,
      moved: false,
    };

    element.classList.add(MOVING_CLASS);
    applyOffset(id, element, moveSession.offsetX, moveSession.offsetY);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    ui.show("Drag the highlighted element. Arrow keys nudge it. <kbd>Enter</kbd> saves, <kbd>Esc</kbd> cancels.", true);
  }

  function onPointerDown(event) {
    if (!moveSession) return;
    if (!(event.target instanceof Node) || !moveSession.element.contains(event.target)) {
      cancelMove();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    moveSession.pointerId = event.pointerId;
    moveSession.pointerStartX = event.clientX;
    moveSession.pointerStartY = event.clientY;
    moveSession.startOffsetX = moveSession.offsetX;
    moveSession.startOffsetY = moveSession.offsetY;
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
  }

  function onPointerMove(event) {
    if (!moveSession || event.pointerId !== moveSession.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const dx = event.clientX - moveSession.pointerStartX;
    const dy = event.clientY - moveSession.pointerStartY;
    moveSession.offsetX = Math.round(moveSession.startOffsetX + dx);
    moveSession.offsetY = Math.round(moveSession.startOffsetY + dy);
    moveSession.moved ||= Math.abs(dx) + Math.abs(dy) >= 2;
    applyOffset(moveSession.id, moveSession.element, moveSession.offsetX, moveSession.offsetY);
  }

  function cleanupPointerListeners() {
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("pointercancel", onPointerCancel, true);
  }

  async function onPointerUp(event) {
    if (!moveSession || event.pointerId !== moveSession.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cleanupPointerListeners();
    moveSession.pointerId = null;
    if (!moveSession.moved) {
      ui.show("Still in move mode. Drag, use arrow keys, <kbd>Enter</kbd> to save, or <kbd>Esc</kbd> to cancel.", true);
      return;
    }
    suppressNextClick();
    await commitMove();
  }

  function onPointerCancel(event) {
    if (!moveSession || event.pointerId !== moveSession.pointerId) return;
    cleanupPointerListeners();
    moveSession.pointerId = null;
  }

  function onKeyDown(event) {
    if (!moveSession) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelMove();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopImmediatePropagation();
      void commitMove();
      return;
    }

    const amount = event.shiftKey ? 10 : 1;
    let dx = 0;
    let dy = 0;
    if (event.key === "ArrowLeft") dx = -amount;
    else if (event.key === "ArrowRight") dx = amount;
    else if (event.key === "ArrowUp") dy = -amount;
    else if (event.key === "ArrowDown") dy = amount;
    else return;

    event.preventDefault();
    event.stopImmediatePropagation();
    moveSession.offsetX += dx;
    moveSession.offsetY += dy;
    moveSession.moved = true;
    applyOffset(moveSession.id, moveSession.element, moveSession.offsetX, moveSession.offsetY);
  }

  function suppressNextClick() {
    const swallow = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      document.removeEventListener("click", swallow, true);
    };
    document.addEventListener("click", swallow, true);
    setTimeout(() => document.removeEventListener("click", swallow, true), 350);
  }

  async function commitMove() {
    if (!moveSession) return;
    const session = moveSession;
    const now = new Date().toISOString();
    const record = {
      id: session.id,
      kind: "move",
      label: session.label,
      fingerprint: session.fingerprint,
      offsetX: Math.round(session.offsetX),
      offsetY: Math.round(session.offsetY),
      createdAt: session.existing?.createdAt || now,
      updatedAt: now,
    };

    await SL.upsertItem(location.href, record);
    finishMoveUi();
    ui.show(`Saved ${escapeHtml(record.label)} at its new position.`);
    scheduleReconcile(0);
  }

  function cancelMove(showToast = true) {
    if (!moveSession) return;
    const session = moveSession;
    cleanupPointerListeners();
    if (session.existing) {
      applyOffset(session.id, session.element, session.startOffsetX, session.startOffsetY);
    } else {
      restoreApplied(session.id);
    }
    finishMoveUi();
    if (showToast) ui.show("Move cancelled.");
  }

  function finishMoveUi() {
    if (!moveSession) return;
    moveSession.element.classList.remove(MOVING_CLASS);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    cleanupPointerListeners();
    moveSession = null;
    ui.hide();
  }

  async function resetElement(element) {
    const record = await recordForElement(element);
    if (!record) {
      ui.show("ShiftLayer has no saved move for that element.");
      return;
    }
    await SL.removeItem(location.href, record.id);
    restoreApplied(record.id);
    ui.show(`Reset ${escapeHtml(record.label)}.`);
    scheduleReconcile(0);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    })[char]);
  }

  document.addEventListener("contextmenu", (event) => {
    lastContextTarget = normalizeTarget(event.target);
  }, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SHIFTLAYER_MOVE_LAST_TARGET") {
      if (lastContextTarget?.isConnected) void beginMove(lastContextTarget);
      else ui.show("That element is no longer on the page.");
      return;
    }

    if (message?.type === "SHIFTLAYER_RESET_LAST_TARGET") {
      if (lastContextTarget?.isConnected) void resetElement(lastContextTarget);
      else ui.show("That element is no longer on the page.");
      return;
    }

    if (message?.type === "SHIFTLAYER_GET_PAGE_INFO") {
      const info = SL.pageInfoFromUrl(location.href);
      sendResponse({ ok: true, ...info, href: location.href });
      return true;
    }

    if (message?.type === "SHIFTLAYER_RECONCILE") {
      scheduleReconcile(0);
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[SL.STATE_KEY]) scheduleReconcile(40);
  });

  window.addEventListener("popstate", () => scheduleReconcile(0));
  setInterval(() => {
    const nextScope = SL.pageInfoFromUrl(location.href).scopeKey;
    if (nextScope !== currentScopeKey) scheduleReconcile(0);
  }, 1000);

  void reconcile();
})();
