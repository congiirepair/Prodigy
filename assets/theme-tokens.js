function normalizeHexColor(value, fallback) {
  const normalized = String(value || "").trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) return fallback;
  if (normalized.length === 4) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`.toLowerCase();
  }
  return normalized.toLowerCase();
}

function hexToRgbChannels(hexColor) {
  const normalized = normalizeHexColor(hexColor, "#000000").slice(1);
  const channels = [0, 2, 4].map((index) => parseInt(normalized.slice(index, index + 2), 16));
  return channels.join(", ");
}

function getRelativeLuminance(hexColor) {
  const normalized = normalizeHexColor(hexColor, "#000000").slice(1);
  const channels = [0, 2, 4].map((index) => parseInt(normalized.slice(index, index + 2), 16) / 255);
  const corrected = channels.map((channel) => (
    channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * corrected[0]) + (0.7152 * corrected[1]) + (0.0722 * corrected[2]);
}

function getContrastInkColor(hexColor, darkInk = "#17130f", lightInk = "#ffffff") {
  return getRelativeLuminance(hexColor) > 0.52 ? darkInk : lightInk;
}

function getDefaultClientTheme(themeName) {
  if (themeName === "dark") {
    return {
      accent: "#f7f7f4",
      accentDark: "#bdbdb8",
      buttonAccent: "#111111",
      buttonAccentDark: "#333333",
      accentCyan: "#e6e6e0",
      accentGreen: "#f7f7f4",
      accentGreenDark: "#a8a8a3",
      panelHighlight: "#f7f7f4",
      accentWarm: "#f7f7f4",
      wordmarkColor: "#f7f7f4",
    };
  }
  return {
    accent: "#111111",
    accentDark: "#333333",
    buttonAccent: "#ffffff",
    buttonAccentDark: "#e5e5e5",
    accentCyan: "#222222",
    accentGreen: "#111111",
    accentGreenDark: "#444444",
    panelHighlight: "#111111",
    accentWarm: "#333333",
    wordmarkColor: "#111111",
  };
}

function getClientThemePalette(clientTheme, isPlainObject, themeName) {
  const defaults = getDefaultClientTheme(themeName);
  const configured = isPlainObject(clientTheme?.[themeName]) ? clientTheme[themeName] : {};
  return {
    accent: normalizeHexColor(configured.accent, defaults.accent),
    accentDark: normalizeHexColor(configured.accentDark, defaults.accentDark),
    buttonAccent: normalizeHexColor(configured.buttonAccent, defaults.buttonAccent),
    buttonAccentDark: normalizeHexColor(configured.buttonAccentDark, defaults.buttonAccentDark),
    accentCyan: normalizeHexColor(configured.accentCyan, defaults.accentCyan),
    accentGreen: normalizeHexColor(configured.accentGreen, defaults.accentGreen),
    accentGreenDark: normalizeHexColor(configured.accentGreenDark, defaults.accentGreenDark),
    panelHighlight: normalizeHexColor(configured.panelHighlight, defaults.panelHighlight),
    accentWarm: normalizeHexColor(configured.accentWarm, defaults.accentWarm),
    wordmarkColor: normalizeHexColor(configured.wordmarkColor, defaults.wordmarkColor),
  };
}

function buildAccentGlow(accentHex, accentDarkHex, isDarkMode) {
  const accentRgb = hexToRgbChannels(accentHex);
  const accentDarkRgb = hexToRgbChannels(accentDarkHex);
  return isDarkMode
    ? `0 0 0 1px rgba(${accentRgb}, 0.36), 0 0 24px rgba(${accentRgb}, 0.20), 0 0 52px rgba(${accentDarkRgb}, 0.12)`
    : `0 0 0 1px rgba(${accentRgb}, 0.24), 0 12px 28px rgba(${accentDarkRgb}, 0.18)`;
}

function buildAccentGreenGlow(accentGreenHex, isDarkMode) {
  const accentGreenRgb = hexToRgbChannels(accentGreenHex);
  return isDarkMode
    ? `0 0 0 1px rgba(${accentGreenRgb}, 0.34), 0 0 20px rgba(${accentGreenRgb}, 0.18)`
    : `0 0 0 1px rgba(${accentGreenRgb}, 0.24), 0 10px 22px rgba(${accentGreenRgb}, 0.16)`;
}

function buildButtonGlow(buttonAccentHex, buttonAccentDarkHex, isDarkMode) {
  const buttonAccentRgb = hexToRgbChannels(buttonAccentHex);
  const buttonAccentDarkRgb = hexToRgbChannels(buttonAccentDarkHex);
  return isDarkMode
    ? `0 0 0 1px rgba(${buttonAccentRgb}, 0.36), 0 0 24px rgba(${buttonAccentRgb}, 0.20), 0 0 52px rgba(${buttonAccentDarkRgb}, 0.12)`
    : `0 0 0 1px rgba(${buttonAccentRgb}, 0.24), 0 12px 28px rgba(${buttonAccentDarkRgb}, 0.18)`;
}

function buildBracketAdvanceGlow(accentGreenHex) {
  const accentGreenRgb = hexToRgbChannels(accentGreenHex);
  return `0 0 0 1px rgba(${accentGreenRgb}, 0.94), 0 0 16px rgba(${accentGreenRgb}, 0.74), 0 0 34px rgba(${accentGreenRgb}, 0.5), 0 16px 28px rgba(0, 0, 0, 0.24)`;
}

function buildPanelHighlightBand(panelHighlightHex) {
  const panelHighlightRgb = hexToRgbChannels(panelHighlightHex);
  return `linear-gradient(90deg, rgba(${panelHighlightRgb}, 0.74), rgba(${panelHighlightRgb}, 0.96) 36%, rgba(255, 255, 255, 0.92) 62%, rgba(${panelHighlightRgb}, 0.74) 100%)`;
}

function buildPanelHighlightShadow(panelHighlightHex) {
  const panelHighlightRgb = hexToRgbChannels(panelHighlightHex);
  return `0 0 18px rgba(${panelHighlightRgb}, 0.14)`;
}

export function createThemeTokenSyncer({ document, isPlainObject, clientTheme }) {
  return {
    sync() {
      const target = document.body || document.documentElement;
      const themeName = document.body?.dataset?.theme === "dark" ? "dark" : "light";
      const palette = getClientThemePalette(clientTheme, isPlainObject, themeName);
      target.style.setProperty("--accent", palette.accent);
      target.style.setProperty("--accent-dark", palette.accentDark);
      target.style.setProperty("--button-accent", palette.buttonAccent);
      target.style.setProperty("--button-accent-dark", palette.buttonAccentDark);
      target.style.setProperty("--accent-cyan", palette.accentCyan);
      target.style.setProperty("--accent-green", palette.accentGreen);
      target.style.setProperty("--accent-green-dark", palette.accentGreenDark);
      target.style.setProperty("--panel-highlight", palette.panelHighlight);
      target.style.setProperty("--accent-warm", palette.accentWarm);
      target.style.setProperty("--accent-rgb", hexToRgbChannels(palette.accent));
      target.style.setProperty("--button-accent-rgb", hexToRgbChannels(palette.buttonAccent));
      target.style.setProperty("--button-accent-dark-rgb", hexToRgbChannels(palette.buttonAccentDark));
      target.style.setProperty("--accent-cyan-rgb", hexToRgbChannels(palette.accentCyan));
      target.style.setProperty("--accent-green-rgb", hexToRgbChannels(palette.accentGreen));
      target.style.setProperty("--panel-highlight-rgb", hexToRgbChannels(palette.panelHighlight));
      target.style.setProperty("--button-accent-text", getContrastInkColor(palette.buttonAccent));
      target.style.setProperty("--button-accent-text-strong", getContrastInkColor(palette.accent));
      target.style.setProperty("--accent-glow", buildAccentGlow(palette.accent, palette.accentDark, themeName === "dark"));
      target.style.setProperty("--button-glow", buildButtonGlow(palette.buttonAccent, palette.buttonAccentDark, themeName === "dark"));
      target.style.setProperty("--accent-green-glow", buildAccentGreenGlow(palette.accentGreen, themeName === "dark"));
      target.style.setProperty("--bracket-advance-glow", buildBracketAdvanceGlow(palette.accentGreen));
      target.style.setProperty("--panel-highlight-band", buildPanelHighlightBand(palette.panelHighlight));
      target.style.setProperty("--panel-highlight-shadow", buildPanelHighlightShadow(palette.panelHighlight));
      target.style.setProperty("--landing-wordmark-color", palette.wordmarkColor);
    },
  };
}
