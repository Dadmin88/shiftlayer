"use strict";

const MENU_MOVE = "shiftlayer-move-element";
const MENU_RESET = "shiftlayer-reset-element";

function createMenus() {
  chrome.contextMenus.create({
    id: MENU_MOVE,
    title: "ShiftLayer · Move element",
    contexts: ["all"],
    documentUrlPatterns: ["http://*/*", "https://*/*"],
  });

  chrome.contextMenus.create({
    id: MENU_RESET,
    title: "ShiftLayer · Reset element",
    contexts: ["all"],
    documentUrlPatterns: ["http://*/*", "https://*/*"],
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => createMenus());
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  const type = info.menuItemId === MENU_MOVE
    ? "SHIFTLAYER_MOVE_LAST_TARGET"
    : info.menuItemId === MENU_RESET
      ? "SHIFTLAYER_RESET_LAST_TARGET"
      : null;

  if (!type) return;
  chrome.tabs.sendMessage(tab.id, { type }, () => void chrome.runtime.lastError);
});
