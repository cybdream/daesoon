const SETTINGS_KEY = "dg_settings";

// KO: 설정 화면과 저장/안전 모드 전환을 담당합니다.
// EN: Handle the settings dialog, persistence, and safe reader mode.
export function createSettingsController(deps) {
  const { state, el, storage, toast } = deps;

  function openSettingsDialog() {
    el.themeSelect.value = state.settings.theme;
    el.fontSizeInput.value = state.settings.fontSize;
    el.readerModeSelect.value = state.settings.readerMode;
    openDialog(el.settingsDialog);
  }

  function saveSettingsFromDialog() {
    state.settings.theme = el.themeSelect.value;
    state.settings.fontSize = Number(el.fontSizeInput.value);
    state.settings.readerMode = el.readerModeSelect.value;
    ensureSafeReaderMode(true);
    storage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    applySettings();
    closeDialog(el.settingsDialog);
  }

  function openDialog(dialogNode) {
    if (!dialogNode) return;
    if (typeof dialogNode.showModal === "function") {
      if (!dialogNode.open) dialogNode.showModal();
      return;
    }

    dialogNode.setAttribute("open", "");
  }

  function closeDialog(dialogNode) {
    if (!dialogNode) return;
    if (typeof dialogNode.close === "function") {
      dialogNode.close();
      return;
    }

    dialogNode.removeAttribute("open");
  }

  function applySettings() {
    ensureSafeReaderMode(false);
    document.documentElement.dataset.theme = state.settings.theme;
    document.documentElement.style.setProperty("--reader-size", `${state.settings.fontSize}px`);
    el.readerVerse.classList.toggle("swipe", state.settings.readerMode === "swipe");
    el.searchSort.value = state.searchSort;
    el.searchWindow.value = state.searchWindow;
    el.searchPreview.value = state.searchPreview;
  }

  function ensureSafeReaderMode(notify) {
    const isAndroidApp =
      typeof window.Capacitor !== "undefined" &&
      typeof window.Capacitor.getPlatform === "function" &&
      window.Capacitor.getPlatform() === "android";

    if (!isAndroidApp || state.settings.readerMode !== "swipe") {
      return false;
    }

    state.settings.readerMode = "scroll";
    el.readerModeSelect.value = "scroll";
    storage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));

    if (notify) {
      toast("안드로이드 안정성을 위해 상하 스크롤 모드로 자동 전환했습니다.");
    }

    return true;
  }

  return {
    openSettingsDialog,
    saveSettingsFromDialog,
    openDialog,
    closeDialog,
    applySettings,
    ensureSafeReaderMode
  };
}