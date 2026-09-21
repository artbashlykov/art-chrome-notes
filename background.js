chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

async function getFocusedWindowId() {
  const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
  return win?.id;
}

async function openSidePanel() {
  const windowId = await getFocusedWindowId();
  if (!windowId) return;
  await chrome.sidePanel.open({ windowId });
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-sidebar") return;
  await openSidePanel();
});
