(() => {
  "use strict";

  const root = (globalThis.ShiftLayer = globalThis.ShiftLayer || {});
  const STATE_KEY = "shiftlayer.state.v1";
  const STATE_VERSION = 1;
  const MAX_SELECTOR_VALUE = 120;

  function emptyState() {
    return { version: STATE_VERSION, scopes: {} };
  }

  function normalizeState(value) {
    if (!value || typeof value !== "object") return emptyState();
    if (value.version !== STATE_VERSION || !value.scopes || typeof value.scopes !== "object") {
      return emptyState();
    }
    return value;
  }

  function pageInfoFromUrl(urlString) {
    const url = new URL(urlString);
    const pathname = url.pathname || "/";
    return {
      origin: url.origin,
      pathname,
      scopeKey: `${url.origin}${pathname}`,
    };
  }

  function clampString(value, max = MAX_SELECTOR_VALUE) {
    if (typeof value !== "string") return "";
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized.length <= max ? normalized : normalized.slice(0, max);
  }

  function looksGeneratedToken(value) {
    const token = clampString(value, 160);
    if (!token) return true;
    if (/^[a-f0-9]{8,}$/i.test(token)) return true;
    if (/\d{5,}/.test(token)) return true;
    if (/^(css|sc|jsx|chakra|mantine|mui|emotion)[-_]?[a-z0-9_-]{6,}$/i.test(token)) return true;
    if (token.length >= 24 && /[a-z]/i.test(token) && /\d/.test(token) && !/[\s_-]/.test(token)) return true;
    return false;
  }

  function cssString(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, "\\a ");
  }

  function uniquePush(list, value) {
    if (value && !list.includes(value)) list.push(value);
  }

  function isUniqueSelector(selector, doc = document) {
    try {
      return doc.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }

  function stableAttributePairs(element) {
    const names = ["data-testid", "data-test", "data-cy", "data-qa", "aria-label", "name", "role", "title", "type"];
    const pairs = [];
    for (const name of names) {
      const raw = element.getAttribute?.(name);
      const value = clampString(raw);
      if (!value || value.length > MAX_SELECTOR_VALUE) continue;
      if ((name.startsWith("data-") || name === "name") && looksGeneratedToken(value)) continue;
      pairs.push([name, value]);
    }
    return pairs;
  }

  function nthOfTypePart(element) {
    const tag = element.tagName.toLowerCase();
    const parent = element.parentElement;
    if (!parent) return tag;
    const siblings = Array.from(parent.children).filter((child) => child.tagName === element.tagName);
    if (siblings.length <= 1) return tag;
    return `${tag}:nth-of-type(${siblings.indexOf(element) + 1})`;
  }

  function buildCssPath(element) {
    const parts = [];
    let current = element;
    let depth = 0;
    while (current && current.nodeType === 1 && depth < 9) {
      const id = clampString(current.id);
      if (id && !looksGeneratedToken(id)) {
        parts.unshift(`#${CSS.escape(id)}`);
        break;
      }
      parts.unshift(nthOfTypePart(current));
      if (current === document.body || current === document.documentElement) break;
      current = current.parentElement;
      depth += 1;
    }
    return parts.join(" > ");
  }

  function buildFingerprint(element) {
    const tag = element.tagName.toLowerCase();
    const selectors = [];
    const attributes = {};
    const id = clampString(element.id);

    if (id && !looksGeneratedToken(id)) {
      const selector = `#${CSS.escape(id)}`;
      if (isUniqueSelector(selector)) uniquePush(selectors, selector);
      attributes.id = id;
    }

    for (const [name, value] of stableAttributePairs(element)) {
      attributes[name] = value;
      const selector = `${tag}[${name}="${cssString(value)}"]`;
      if (isUniqueSelector(selector)) uniquePush(selectors, selector);
    }

    const stableClasses = Array.from(element.classList || [])
      .map((value) => clampString(value, 80))
      .filter((value) => value && !looksGeneratedToken(value))
      .slice(0, 3);

    if (stableClasses.length) {
      const selector = `${tag}${stableClasses.map((value) => `.${CSS.escape(value)}`).join("")}`;
      if (isUniqueSelector(selector)) uniquePush(selectors, selector);
    }

    const path = buildCssPath(element);
    uniquePush(selectors, path);

    return {
      version: 1,
      tag,
      selectors: selectors.slice(0, 8),
      attributes,
      path,
    };
  }

  function scoreCandidate(element, fingerprint) {
    if (!element || element.tagName?.toLowerCase() !== fingerprint.tag) return -1;
    let score = 1;
    for (const [name, value] of Object.entries(fingerprint.attributes || {})) {
      const actual = name === "id" ? element.id : element.getAttribute?.(name);
      if (actual === value) score += name === "id" ? 6 : 3;
    }
    return score;
  }

  function findElement(fingerprint, doc = document) {
    if (!fingerprint || !Array.isArray(fingerprint.selectors)) return null;
    for (const selector of fingerprint.selectors) {
      let matches;
      try {
        matches = Array.from(doc.querySelectorAll(selector));
      } catch {
        continue;
      }
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) {
        const ranked = matches
          .map((element) => [element, scoreCandidate(element, fingerprint)])
          .sort((a, b) => b[1] - a[1]);
        if (ranked[0]?.[1] > ranked[1]?.[1] && ranked[0][1] > 1) return ranked[0][0];
      }
    }
    return null;
  }

  function safeLabel(element) {
    const tag = element.tagName.toLowerCase();
    const preferred = ["aria-label", "title", "data-testid", "data-test", "name", "id"];
    for (const name of preferred) {
      const raw = name === "id" ? element.id : element.getAttribute?.(name);
      const value = clampString(raw, 64);
      if (!value || looksGeneratedToken(value)) continue;
      return `${tag} · ${value}`;
    }
    const role = clampString(element.getAttribute?.("role"), 32);
    return role ? `${tag} · ${role}` : tag;
  }

  function storageGet(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(key, (result) => {
        const error = chrome.runtime.lastError;
        if (error) reject(error);
        else resolve(result[key]);
      });
    });
  }

  function storageSet(key, value) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key]: value }, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(error);
        else resolve();
      });
    });
  }

  let mutationQueue = Promise.resolve();

  async function getState() {
    return normalizeState(await storageGet(STATE_KEY));
  }

  function mutateState(mutator) {
    mutationQueue = mutationQueue.then(async () => {
      const state = await getState();
      await mutator(state);
      await storageSet(STATE_KEY, state);
      return state;
    });
    return mutationQueue;
  }

  async function getScope(urlString) {
    const info = pageInfoFromUrl(urlString);
    const state = await getState();
    return state.scopes[info.scopeKey] || { origin: info.origin, pathname: info.pathname, items: {} };
  }

  async function getScopeItems(urlString) {
    const scope = await getScope(urlString);
    return Object.values(scope.items || {});
  }

  function upsertItem(urlString, item) {
    const info = pageInfoFromUrl(urlString);
    return mutateState((state) => {
      const scope = state.scopes[info.scopeKey] || { origin: info.origin, pathname: info.pathname, items: {} };
      scope.items[item.id] = item;
      state.scopes[info.scopeKey] = scope;
    });
  }

  function removeItem(urlString, itemId) {
    const info = pageInfoFromUrl(urlString);
    return mutateState((state) => {
      const scope = state.scopes[info.scopeKey];
      if (!scope?.items) return;
      delete scope.items[itemId];
      if (!Object.keys(scope.items).length) delete state.scopes[info.scopeKey];
    });
  }

  function clearOrigin(origin) {
    return mutateState((state) => {
      for (const [key, scope] of Object.entries(state.scopes)) {
        if (scope.origin === origin) delete state.scopes[key];
      }
    });
  }

  async function originStats(origin) {
    const state = await getState();
    let pageCount = 0;
    let itemCount = 0;
    for (const scope of Object.values(state.scopes)) {
      if (scope.origin !== origin) continue;
      pageCount += 1;
      itemCount += Object.keys(scope.items || {}).length;
    }
    return { pageCount, itemCount };
  }

  root.STATE_KEY = STATE_KEY;
  root.STATE_VERSION = STATE_VERSION;
  root.emptyState = emptyState;
  root.normalizeState = normalizeState;
  root.pageInfoFromUrl = pageInfoFromUrl;
  root.clampString = clampString;
  root.looksGeneratedToken = looksGeneratedToken;
  root.buildFingerprint = buildFingerprint;
  root.findElement = findElement;
  root.safeLabel = safeLabel;
  root.getState = getState;
  root.getScope = getScope;
  root.getScopeItems = getScopeItems;
  root.upsertItem = upsertItem;
  root.removeItem = removeItem;
  root.clearOrigin = clearOrigin;
  root.originStats = originStats;
})();
