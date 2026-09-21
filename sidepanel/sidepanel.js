const STORAGE_KEY = "sidebarState";
const LEGACY_NOTES_KEY = "sidebarNotes";
const LEGACY_FONT_KEY = "sidebarFontSize";

const FONT_MIN = 10;
const FONT_MAX = 28;
const FONT_STEP = 2;
const FONT_DEFAULT = 14;

const textarea = document.getElementById("notes");
const tabListEl = document.getElementById("tab-list");
const tabNewBtn = document.getElementById("tab-new");
const charCountEl = document.getElementById("char-count");
const fontDecreaseBtn = document.getElementById("font-decrease");
const fontIncreaseBtn = document.getElementById("font-increase");
const fontSizeEl = document.getElementById("font-size");

let saveTimer = null;
let renamingTabId = null;
let draggedTabId = null;
let suppressTabClick = false;

let state = {
  tabs: [],
  activeTabId: null,
  fontSize: FONT_DEFAULT
};

const NOTE_TITLE_RE = /^Заметка (\d+)$/;

function getUsedNoteNumbers(excludeTabId = null) {
  const used = new Set();
  for (const tab of state.tabs) {
    if (excludeTabId && tab.id === excludeTabId) continue;
    const match = tab.title.trim().match(NOTE_TITLE_RE);
    if (match) {
      used.add(parseInt(match[1], 10));
    }
  }
  return used;
}

function getNextAvailableNoteNumber(excludeTabId = null) {
  const used = getUsedNoteNumbers(excludeTabId);
  let number = 1;
  while (used.has(number)) {
    number += 1;
  }
  return number;
}

function createId() {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getActiveTab() {
  return state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
}

function defaultTabTitle(number) {
  return `Заметка ${number}`;
}

function createTab(content = "", title = null, renamed = false) {
  return {
    id: createId(),
    title: title ?? defaultTabTitle(getNextAvailableNoteNumber()),
    content,
    renamed
  };
}

function updateCharCount() {
  charCountEl.textContent = `символов: ${textarea.value.length}`;
}

function flushActiveTabContent() {
  const tab = getActiveTab();
  if (tab) {
    tab.content = textarea.value;
  }
}

function persistState() {
  chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    flushActiveTabContent();
    persistState();
  }, 300);
}

function saveNow() {
  clearTimeout(saveTimer);
  flushActiveTabContent();
  persistState();
}

function applyFontSize(size) {
  state.fontSize = Math.min(FONT_MAX, Math.max(FONT_MIN, size));
  textarea.style.fontSize = `${state.fontSize}px`;
  fontSizeEl.textContent = `${state.fontSize}px`;
  fontDecreaseBtn.disabled = state.fontSize <= FONT_MIN;
  fontIncreaseBtn.disabled = state.fontSize >= FONT_MAX;
  persistState();
}

function changeFontSize(delta) {
  applyFontSize(state.fontSize + delta);
}

function loadActiveTabIntoEditor() {
  const tab = getActiveTab();
  textarea.value = tab?.content ?? "";
  updateCharCount();
}

function setActiveTab(tabId) {
  if (tabId === state.activeTabId) return;
  saveNow();
  state.activeTabId = tabId;
  loadActiveTabIntoEditor();
  renderTabs();
  persistState();
  textarea.focus();
}

function addTab(content = "") {
  saveNow();
  const tab = createTab(content);
  state.tabs.push(tab);
  state.activeTabId = tab.id;
  loadActiveTabIntoEditor();
  renderTabs();
  persistState();
  textarea.focus();
}

function closeTab(tabId, event) {
  event?.stopPropagation();
  if (renamingTabId === tabId) return;

  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return;

  const tab = state.tabs[index];
  const isLastTab = state.tabs.length === 1;
  const message = isLastTab
    ? `Очистить вкладку «${tab.title}»? Текст будет удалён.`
    : `Закрыть вкладку «${tab.title}»?`;

  if (!confirm(message)) return;

  saveNow();

  if (state.tabs.length === 1) {
    const onlyTab = state.tabs[0];
    onlyTab.content = "";
    onlyTab.title = defaultTabTitle(getNextAvailableNoteNumber(onlyTab.id));
    onlyTab.renamed = false;
    loadActiveTabIntoEditor();
    renderTabs();
    persistState();
    return;
  }

  const wasActive = state.activeTabId === tabId;
  state.tabs.splice(index, 1);

  if (wasActive) {
    const nextIndex = index > 0 ? index - 1 : 0;
    state.activeTabId = state.tabs[nextIndex].id;
    loadActiveTabIntoEditor();
  }

  renderTabs();
  persistState();
}

function startRename(tabId, event) {
  event.stopPropagation();
  renamingTabId = tabId;
  renderTabs();

  const input = tabListEl.querySelector(`[data-tab-id="${tabId}"] .tab-rename-input`);
  if (!input) return;

  input.focus();
  input.select();
}

function finishRename(tabId, newTitle) {
  const tab = state.tabs.find((item) => item.id === tabId);
  if (!tab) return;

  const trimmed = newTitle.trim();
  if (trimmed) {
    tab.title = trimmed;
    tab.renamed = true;
  }

  renamingTabId = null;
  renderTabs();
  persistState();
}

function cancelRename() {
  renamingTabId = null;
  renderTabs();
}

function getTabInsertIndex(tabEl, clientX) {
  const rect = tabEl.getBoundingClientRect();
  const tabIndex = state.tabs.findIndex((tab) => tab.id === tabEl.dataset.tabId);
  if (tabIndex === -1) return state.tabs.length;
  return clientX < rect.left + rect.width / 2 ? tabIndex : tabIndex + 1;
}

function clearDropIndicators() {
  tabListEl.querySelectorAll(".tab").forEach((el) => {
    el.classList.remove("drop-before", "drop-after");
  });
}

function showDropIndicator(insertAt) {
  clearDropIndicators();
  tabListEl.querySelectorAll(".tab").forEach((el) => {
    const tabIndex = state.tabs.findIndex((tab) => tab.id === el.dataset.tabId);
    if (tabIndex === -1) return;
    if (insertAt === tabIndex) {
      el.classList.add("drop-before");
    }
    if (insertAt === tabIndex + 1) {
      el.classList.add("drop-after");
    }
  });
}

function reorderTab(tabId, insertAt) {
  const fromIndex = state.tabs.findIndex((tab) => tab.id === tabId);
  if (fromIndex === -1) return;

  let targetIndex = Math.max(0, Math.min(insertAt, state.tabs.length));
  if (fromIndex === targetIndex || fromIndex + 1 === targetIndex) return;

  saveNow();

  const [tab] = state.tabs.splice(fromIndex, 1);
  if (fromIndex < targetIndex) {
    targetIndex -= 1;
  }
  state.tabs.splice(targetIndex, 0, tab);
  persistState();
  renderTabs();
}

function setupTabDrag(tabEl, tab) {
  tabEl.draggable = true;

  tabEl.addEventListener("dragstart", (event) => {
    if (renamingTabId || event.target.closest(".tab-close")) {
      event.preventDefault();
      return;
    }

    draggedTabId = tab.id;
    suppressTabClick = false;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", tab.id);
    tabEl.classList.add("is-dragging");
  });

  tabEl.addEventListener("dragover", (event) => {
    if (!draggedTabId || draggedTabId === tab.id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    showDropIndicator(getTabInsertIndex(tabEl, event.clientX));
  });

  tabEl.addEventListener("drop", (event) => {
    if (!draggedTabId) return;
    event.preventDefault();
    reorderTab(draggedTabId, getTabInsertIndex(tabEl, event.clientX));
    suppressTabClick = true;
    clearDropIndicators();
  });

  tabEl.addEventListener("dragend", () => {
    tabEl.classList.remove("is-dragging");
    draggedTabId = null;
    clearDropIndicators();
    if (suppressTabClick) {
      setTimeout(() => {
        suppressTabClick = false;
      }, 0);
    }
  });
}

function setupTabListDrag() {
  tabListEl.addEventListener("dragover", (event) => {
    if (!draggedTabId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    showDropIndicator(state.tabs.length);
  });

  tabListEl.addEventListener("drop", (event) => {
    if (!draggedTabId || event.target.closest(".tab")) return;
    event.preventDefault();
    reorderTab(draggedTabId, state.tabs.length);
    suppressTabClick = true;
    clearDropIndicators();
  });
}

function renderTabs() {
  tabListEl.replaceChildren();

  state.tabs.forEach((tab) => {
    const isActive = tab.id === state.activeTabId;
    const isRenaming = renamingTabId === tab.id;

    const tabEl = document.createElement("div");
    tabEl.className = `tab${isActive ? " is-active" : ""}`;
    tabEl.dataset.tabId = tab.id;
    tabEl.setAttribute("role", "tab");
    tabEl.setAttribute("aria-selected", String(isActive));

    if (isRenaming) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "tab-rename-input";
      input.value = tab.title;
      input.maxLength = 80;
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          finishRename(tab.id, input.value);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancelRename();
        }
      });
      input.addEventListener("blur", () => finishRename(tab.id, input.value));
      tabEl.appendChild(input);
    } else {
      const label = document.createElement("span");
      label.className = "tab-label";
      label.textContent = tab.title;
      label.title = "Перетащите для смены порядка. Двойной клик — переименовать";
      label.addEventListener("dblclick", (event) => startRename(tab.id, event));
      tabEl.appendChild(label);

      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "tab-close";
      closeBtn.setAttribute("aria-label", `Закрыть «${tab.title}»`);
      closeBtn.textContent = "×";
      closeBtn.addEventListener("click", (event) => closeTab(tab.id, event));
      tabEl.appendChild(closeBtn);

      tabEl.addEventListener("click", () => {
        if (suppressTabClick) return;
        setActiveTab(tab.id);
      });

      setupTabDrag(tabEl, tab);
    }

    tabListEl.appendChild(tabEl);
  });

  if (renamingTabId) {
    const input = tabListEl.querySelector(`[data-tab-id="${renamingTabId}"] .tab-rename-input`);
    input?.focus();
    input?.select();
  }
}

async function migrateLegacyData(data) {
  const legacyNotes = typeof data[LEGACY_NOTES_KEY] === "string" ? data[LEGACY_NOTES_KEY] : "";
  const legacyFont =
    typeof data[LEGACY_FONT_KEY] === "number" ? data[LEGACY_FONT_KEY] : FONT_DEFAULT;

  const firstTab = createTab(legacyNotes, defaultTabTitle(1), false);
  state = {
    tabs: [firstTab],
    activeTabId: firstTab.id,
    fontSize: legacyFont
  };

  await chrome.storage.local.set({ [STORAGE_KEY]: state });
  await chrome.storage.local.remove([LEGACY_NOTES_KEY, LEGACY_FONT_KEY]);
}

function normalizeState(raw) {
  if (!raw || !Array.isArray(raw.tabs) || raw.tabs.length === 0) {
    return null;
  }

  const tabs = raw.tabs.map((tab, index) => ({
    id: typeof tab.id === "string" ? tab.id : createId(),
    title: typeof tab.title === "string" && tab.title.trim() ? tab.title : defaultTabTitle(index + 1),
    content: typeof tab.content === "string" ? tab.content : "",
    renamed: Boolean(tab.renamed)
  }));

  const activeTabId = tabs.some((tab) => tab.id === raw.activeTabId)
    ? raw.activeTabId
    : tabs[0].id;

  return {
    tabs,
    activeTabId,
    fontSize:
      typeof raw.fontSize === "number"
        ? Math.min(FONT_MAX, Math.max(FONT_MIN, raw.fontSize))
        : FONT_DEFAULT
  };
}

async function loadState() {
  const data = await chrome.storage.local.get([
    STORAGE_KEY,
    LEGACY_NOTES_KEY,
    LEGACY_FONT_KEY
  ]);

  if (data[STORAGE_KEY]) {
    const normalized = normalizeState(data[STORAGE_KEY]);
    if (normalized) {
      state = normalized;
    } else {
      await migrateLegacyData(data);
    }
  } else {
    await migrateLegacyData(data);
  }

  if (state.tabs.length === 0) {
    const tab = createTab();
    state.tabs.push(tab);
    state.activeTabId = tab.id;
  }

  applyFontSize(state.fontSize);
  loadActiveTabIntoEditor();
  renderTabs();
}

textarea.addEventListener("input", () => {
  updateCharCount();
  scheduleSave();
});

tabNewBtn.addEventListener("click", () => addTab());
fontDecreaseBtn.addEventListener("click", () => changeFontSize(-FONT_STEP));
fontIncreaseBtn.addEventListener("click", () => changeFontSize(FONT_STEP));

window.addEventListener("beforeunload", saveNow);

setupTabListDrag();
loadState();
