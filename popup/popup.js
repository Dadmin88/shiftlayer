(() => {
  "use strict";

  const SL = globalThis.ShiftLayer;
  const statusEl = document.querySelector("#status");
  const contentEl = document.querySelector("#content");
  const siteCountEl = document.querySelector("#siteCount");
  const pageCountEl = document.querySelector("#pageCount");
  const pagePathEl = document.querySelector("#pagePath");
  const listEl = document.querySelector("#list");
  const resetSiteEl = document.querySelector("#resetSite");

  let activeTabId = null;
  let pageInfo = null;

  function queryActiveTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0] || null));
    });
  }

  function sendMessage(tabId, message) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response || null);
      });
    });
  }

  async function load() {
    const tab = await queryActiveTab();
    activeTabId = tab?.id || null;
    if (!activeTabId) return showUnsupported("No active tab is available.");

    pageInfo = await sendMessage(activeTabId, { type: "SHIFTLAYER_GET_PAGE_INFO" });
    if (!pageInfo?.ok) {
      return showUnsupported("ShiftLayer works on normal http:// and https:// pages. Browser settings and extension pages are protected.");
    }

    await render();
  }

  async function render() {
    const items = await SL.getScopeItems(pageInfo.href);
    const stats = await SL.originStats(pageInfo.origin);
    statusEl.hidden = true;
    contentEl.hidden = false;
    siteCountEl.textContent = String(stats.itemCount);
    pageCountEl.textContent = String(items.length);
    pagePathEl.textContent = pageInfo.pathname;
    resetSiteEl.disabled = stats.itemCount === 0;

    listEl.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Nothing moved on this page yet.";
      listEl.appendChild(empty);
      return;
    }

    for (const item of items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))) {
      const row = document.createElement("div");
      row.className = "item";

      const meta = document.createElement("div");
      meta.className = "itemMeta";
      const label = document.createElement("strong");
      label.textContent = item.label || item.fingerprint?.tag || "element";
      const vector = document.createElement("span");
      vector.textContent = `x ${item.offsetX}px · y ${item.offsetY}px`;
      meta.append(label, vector);

      const reset = document.createElement("button");
      reset.type = "button";
      reset.textContent = "Reset";
      reset.addEventListener("click", async () => {
        reset.disabled = true;
        await SL.removeItem(pageInfo.href, item.id);
        await sendMessage(activeTabId, { type: "SHIFTLAYER_RECONCILE" });
        await render();
      });

      row.append(meta, reset);
      listEl.appendChild(row);
    }
  }

  function showUnsupported(message) {
    statusEl.textContent = message;
    statusEl.hidden = false;
    contentEl.hidden = true;
  }

  resetSiteEl.addEventListener("click", async () => {
    if (!pageInfo || !confirm(`Reset every ShiftLayer move saved for ${pageInfo.origin}?`)) return;
    resetSiteEl.disabled = true;
    await SL.clearOrigin(pageInfo.origin);
    await sendMessage(activeTabId, { type: "SHIFTLAYER_RECONCILE" });
    await render();
  });

  void load();
})();
