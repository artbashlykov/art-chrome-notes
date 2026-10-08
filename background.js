chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("[Заметки Арта] setPanelBehavior:", error));

// chrome.sidePanel.open() must run in the same turn as the user gesture.
// Any await / .then() before open() → "may only be called in response to a user gesture".
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "toggle-sidebar") return;

  if (tab?.windowId != null) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch((error) => {
      console.error("[Заметки Арта] sidePanel.open:", error);
    });
    return;
  }

  if (tab?.id != null) {
    chrome.sidePanel.open({ tabId: tab.id }).catch((error) => {
      console.error("[Заметки Арта] sidePanel.open:", error);
    });
  }
});
