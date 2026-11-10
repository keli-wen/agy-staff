window.__ModuleLoader__.load({
  id: "agy-staff-dsh",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const jsxRuntime = require("react/jsx-runtime");
    const { jsx, jsxs, Fragment } = jsxRuntime;

    const TAB_ID = "agy-staff-dsh";
    const TAB_KIND = "agy-staff";
    const STYLE_TAG_ID = "agy-staff-dsh/subagents-dashboard-v6.8-pixel-font-lang.css";
    const LANG_STORAGE_KEY = "agy-staff-dsh-lang";
    const ARCHIVE_STORAGE_KEY = "agy-staff-dsh-archived-v1";

    const CSS_TEXT = `
@keyframes agy-hourglass-rock {
  0%, 100% { transform: rotate(-6deg) scale(1); }
  50% { transform: rotate(6deg) scale(1.04); }
}

@keyframes agy-refresh-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.agy-root {
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--agy-ink);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", sans-serif;
  font-size: 12.5px;
  line-height: 1.5;
  overflow: hidden;
  user-select: none;

  --agy-bg: transparent;
  --agy-surface: var(--dsw-alias-bg-layer-2, #FFFFFF);
  --agy-surface-subtle: var(--dsw-alias-bg-layer-1, #F4F6F8);
  --agy-surface-elevated: #FFFFFF;
  --agy-surface-hover: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04));
  --agy-ink: var(--dsw-alias-label-primary, #1F2328);
  --agy-secondary: var(--dsw-alias-label-secondary, #59636E);
  --agy-muted: var(--dsw-alias-label-tertiary, #6E7781);
  --agy-border: var(--dsw-alias-border-l2, rgba(31, 35, 40, 0.11));
  --agy-border-strong: var(--dsw-alias-border-l3, rgba(31, 35, 40, 0.2));

  --agy-blue: #6A9BCC;
  --agy-blue-ink: #4A7CAB;
  --agy-blue-tint: rgba(106, 155, 204, 0.14);
  --agy-query-bg: rgba(214, 122, 151, 0.06);
  --agy-qa-well: rgba(31, 35, 40, 0.035);
  --agy-qa-sheet: #FFFFFF;
  --agy-qa-sheet-shadow: 0 1px 2px rgba(31, 35, 40, 0.05), 0 8px 18px -14px rgba(31, 35, 40, 0.28);

  --agy-rose: #D67A97;
  --agy-rose-ink: #B0567A;

  --agy-purple: #8B7BB8;
  --agy-purple-ink: #6A5A9E;
  --agy-purple-tint: rgba(139, 123, 184, 0.14);

  --agy-green: #7F9E6E;
  --agy-green-ink: #5C7A4D;
  --agy-green-tint: rgba(127, 158, 110, 0.15);

  --agy-terracotta: #D97757;
  --agy-terracotta-ink: #B7563A;
  --agy-terracotta-tint: rgba(217, 119, 87, 0.14);

  --agy-red: #C8553D;
  --agy-red-ink: #B0422B;
  --agy-red-tint: rgba(200, 85, 61, 0.13);

  --agy-amber: #E3B04B;
  --agy-amber-ink: #9E7422;
  --agy-amber-tint: rgba(227, 176, 75, 0.16);

  background: var(--agy-bg);
}

body[data-ds-dark-theme] .agy-root {
  --agy-surface: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.035));
  --agy-surface-subtle: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.22));
  --agy-surface-elevated: rgba(255, 255, 255, 0.07);
  --agy-surface-hover: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.055));
  --agy-ink: var(--dsw-alias-label-primary, #ECE8DF);
  --agy-secondary: var(--dsw-alias-label-secondary, #A6A29A);
  --agy-muted: var(--dsw-alias-label-tertiary, #7D7A73);
  --agy-border: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.085));
  --agy-border-strong: var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.16));

  --agy-blue: #6A9BCC;
  --agy-blue-ink: #8FB8E0;
  --agy-blue-tint: rgba(106, 155, 204, 0.16);
  --agy-query-bg: rgba(214, 122, 151, 0.065);
  --agy-qa-well: rgba(0, 0, 0, 0.2);
  --agy-qa-sheet: rgba(255, 255, 255, 0.045);
  --agy-qa-sheet-shadow: 0 1px 0 rgba(255, 255, 255, 0.035) inset, 0 10px 20px -14px rgba(0, 0, 0, 0.7);

  --agy-rose: #D67A97;
  --agy-rose-ink: #E59BB3;

  --agy-purple: #9E8EC9;
  --agy-purple-ink: #C5B8E8;
  --agy-purple-tint: rgba(139, 123, 184, 0.18);

  --agy-green: #7F9E6E;
  --agy-green-ink: #9DC08A;
  --agy-green-tint: rgba(127, 158, 110, 0.18);

  --agy-terracotta: #D97757;
  --agy-terracotta-ink: #EDA086;
  --agy-terracotta-tint: rgba(217, 119, 87, 0.16);

  --agy-red: #E07058;
  --agy-red-ink: #F29682;
  --agy-red-tint: rgba(200, 85, 61, 0.16);

  --agy-amber: #E3B04B;
  --agy-amber-ink: #F0C975;
  --agy-amber-tint: rgba(227, 176, 75, 0.16);
}

.agy-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.agy-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 18px 16px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* CRITICAL FIX: Prevent Flexbox from ever shrinking cards inside the scroll container */
.agy-scroll > * {
  flex-shrink: 0;
}


/* Left Open/Close Disclosure Caret (No ugly square box; pure hand-drawn pebble caret) */
.agy-disclosure {
  width: 21px;
  height: 21px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  opacity: 0.88;
  transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.15s ease;
}

.agy-disclosure[data-size="sm"] {
  width: 18px;
  height: 18px;
}

.agy-disclosure[data-open="true"] {
  transform: rotate(90deg);
  opacity: 1;
}

.agy-subagent-summary:hover .agy-disclosure:not([data-open="true"]),
.agy-cap-toggle:hover .agy-disclosure:not([data-open="true"]),
.agy-turn-summary:hover .agy-disclosure:not([data-open="true"]) {
  transform: translateX(1.5px);
  opacity: 1;
}

/* ============================================================================
 * CUJ 1: Collapsible Capability Card (Default Expanded, Never Shrunk)
 * ========================================================================== */
.agy-cap-card {
  position: relative;
  flex: none;
  box-sizing: border-box;
  border-radius: 10px;
  border: 1px solid var(--agy-border);
  background: var(--agy-surface);
}

.agy-cap-header {
  box-sizing: border-box;
  height: 46px;
  padding: 0 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.agy-cap-toggle {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  text-align: left;
}

.agy-cap-title {
  font-size: 13.5px;
  font-weight: 650;
  letter-spacing: -0.01em;
  line-height: 20px;
  color: var(--agy-ink);
  white-space: nowrap;
}

.agy-cap-subtitle {
  min-width: 0;
  font-size: 11.5px;
  line-height: 20px;
  color: var(--agy-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agy-cap-chip {
  flex: none;
  box-sizing: border-box;
  height: 18px;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--agy-qa-well);
  box-shadow: inset 0 0 0 1px var(--agy-border);
  color: var(--agy-secondary);
  font-size: 10.5px;
  line-height: 18px;
  white-space: nowrap;
}

.agy-cap-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.agy-lang-btn {
  box-sizing: border-box;
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--agy-border);
  background: var(--agy-surface-subtle);
  color: var(--agy-secondary);
  font-size: 11px;
  font-weight: 500;
  line-height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  cursor: pointer;
  flex: none;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}

.agy-lang-btn:hover {
  background: var(--agy-surface-hover);
  border-color: var(--agy-border-strong);
  color: var(--agy-ink);
}

.agy-lang-opt {
  display: inline-flex;
  align-items: center;
  color: var(--agy-muted);
  transition: color 0.12s ease;
}

.agy-lang-opt[data-active="true"] {
  color: var(--agy-ink);
}

.agy-lang-sep {
  display: inline-flex;
  align-items: center;
  color: var(--agy-border-strong);
}

.agy-cap-body {
  padding: 2px 13px 13px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.agy-cap-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.agy-cap-item {
  box-sizing: border-box;
  height: 50px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--agy-border);
  background: transparent;
  color: var(--agy-ink);
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.agy-cap-item:hover {
  background: var(--agy-surface-hover);
  border-color: var(--agy-border-strong);
}

.agy-cap-item[data-copied="true"] {
  border-color: var(--agy-green);
  background: var(--agy-green-tint);
}

.agy-cap-icon {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: var(--agy-surface-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.agy-cap-text {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}

.agy-cap-cmd {
  height: 16px;
  line-height: 16px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--agy-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.agy-cap-desc {
  height: 16px;
  line-height: 16px;
  font-size: 11px;
  color: var(--agy-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agy-cap-hint {
  height: 18px;
  line-height: 18px;
  font-size: 11px;
  color: var(--agy-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ============================================================================
 * CUJ 2: Subagents Dashboard & Segmented Control
 * ========================================================================== */
.agy-section {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agy-section-bar {
  box-sizing: border-box;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.agy-section-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
  color: var(--agy-ink);
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.agy-section-glyph {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  background: rgba(246, 145, 46, 0.14);
  box-shadow: inset 0 0 0 1px rgba(246, 145, 46, 0.34);
  color: #D97A1E;
}

body[data-ds-dark-theme] .agy-section-glyph {
  color: #F6A85A;
}

.agy-section-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.agy-segmented {
  box-sizing: border-box;
  height: 28px;
  padding: 2px;
  border-radius: 8px;
  border: 1px solid var(--agy-border);
  background: var(--agy-surface-subtle);
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.agy-seg-btn {
  box-sizing: border-box;
  height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--agy-secondary);
  font-size: 11.5px;
  font-weight: 500;
  line-height: 22px;
  font-variant-numeric: tabular-nums;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s ease, color 0.12s ease, box-shadow 0.12s ease;
}

.agy-seg-btn:hover {
  color: var(--agy-ink);
}

.agy-seg-btn[data-active="true"] {
  background: var(--agy-surface-elevated);
  color: var(--agy-ink);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}

.agy-seg-count {
  font-size: 10.5px;
  color: var(--agy-muted);
  font-variant-numeric: tabular-nums;
}

.agy-seg-btn[data-active="true"] .agy-seg-count {
  color: var(--agy-secondary);
}


.agy-icon-btn {
  box-sizing: border-box;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 8px;
  border: 1px solid var(--agy-border);
  background: var(--agy-surface-subtle);
  color: var(--agy-secondary);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex: none;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}

.agy-icon-btn:hover {
  background: var(--agy-surface-hover);
  border-color: var(--agy-border-strong);
  color: var(--agy-ink);
}

.agy-icon-btn[data-refreshing="true"] {
  border-color: rgba(246, 145, 46, 0.48);
  background: rgba(246, 145, 46, 0.12);
  color: #F6912E;
}

.agy-refresh-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.agy-icon-btn:hover:not([data-refreshing="true"]) .agy-refresh-glyph {
  transform: rotate(45deg);
}

.agy-icon-btn[data-refreshing="true"] .agy-refresh-glyph {
  animation: agy-refresh-spin 0.56s cubic-bezier(0.34, 1.15, 0.64, 1) infinite;
}

/* Subagent Cards */
.agy-subagent-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agy-empty-state {
  border-radius: 10px;
  border: 1px dashed var(--agy-border);
  padding: 28px 16px;
  text-align: center;
  color: var(--agy-muted);
  font-size: 12px;
}

.agy-subagent-card {
  flex: none;
  border-radius: 9px;
  border: 1px solid var(--agy-border);
  background: var(--agy-surface);
  transition: border-color 0.12s ease;
}

.agy-subagent-card:hover {
  border-color: var(--agy-border-strong);
}

.agy-subagent-card[data-running="true"] {
  border-color: rgba(227, 176, 75, 0.45);
}

/* Collapsed Session Header */
.agy-subagent-summary {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 11px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 9px;
  transition: background 0.12s ease;
}

.agy-subagent-summary:hover {
  background: var(--agy-surface-hover);
}

.agy-subagent-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--agy-surface-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.agy-subagent-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.agy-subagent-top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 17px;
}

.agy-subagent-role {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--agy-ink);
  white-space: nowrap;
}

.agy-turn-badge {
  font-size: 10.5px;
  padding: 0 6px;
  height: 16px;
  border-radius: 999px;
  background: var(--agy-purple-tint);
  color: var(--agy-purple-ink);
  display: inline-flex;
  align-items: center;
  font-weight: 600;
  white-space: nowrap;
}

/* Inline subtle link on the left metadata bar for running tasks (keeps right side clean!) */
.agy-inline-progress-link {
  padding: 0 6px;
  height: 16px;
  border-radius: 999px;
  border: 1px solid rgba(227, 176, 75, 0.4);
  background: var(--agy-amber-tint);
  color: var(--agy-amber-ink);
  font-size: 10.5px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.12s ease, background 0.12s ease, color 0.12s ease;
}

.agy-inline-progress-link:hover {
  border-color: var(--agy-amber);
}

.agy-inline-progress-link[data-copied="true"] {
  border-color: var(--agy-green);
  background: var(--agy-green-tint);
  color: var(--agy-green-ink);
}

.agy-subagent-query-preview {
  height: 17px;
  line-height: 17px;
  font-size: 12px;
  color: var(--agy-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Right-side Timestamp/Elapsed + Hand-Drawn Status Icon (Strictly 2 items, never crowded!) */
.agy-subagent-right {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: none;
}

.agy-time-tag {
  font-size: 11px;
  color: var(--agy-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.agy-running-timer {
  font-size: 11px;
  font-weight: 500;
  color: var(--agy-amber-ink);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.agy-pixel-hourglass {
  animation: agy-hourglass-rock 2.2s ease-in-out infinite;
}

.agy-status-icon-wrap {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

/* ============================================================================
 * Progressive Disclosure Inside Expanded Session
 * ========================================================================== */
.agy-subagent-detail {
  border-top: 1px solid var(--agy-border);
  padding: 12px 13px 13px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--agy-surface-subtle);
  border-bottom-left-radius: 10px;
  border-bottom-right-radius: 10px;
  user-select: text;
}

/* Live activities strip for running tasks.
   Locked to exactly one 20px row for the whole running lifecycle so the
   Query / Reply cards below never shift: newest step first, consecutive
   duplicates collapsed to "xN", older steps clipped behind a fade. */
.agy-live-strip {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  flex: 0 0 auto;
  height: 20px;
  min-height: 20px;
  max-height: 20px;
  overflow: hidden;
  white-space: nowrap;
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
  mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
}

.agy-step-pill {
  flex: 0 0 auto;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  height: 20px;
  max-width: 100%;
  font-size: 10.5px;
  line-height: 1;
  padding: 0 7px;
  border-radius: 5px;
  background: var(--agy-surface);
  border: 1px solid var(--agy-border);
  color: var(--agy-muted);
  overflow: hidden;
}

.agy-step-pill-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.agy-step-pill.is-current {
  flex: 0 1 auto;
  min-width: 0;
  color: var(--agy-secondary);
  border-color: var(--agy-border-strong);
}

.agy-step-pill.is-placeholder {
  border-style: dashed;
  background: transparent;
}

.agy-step-pill-count {
  flex: 0 0 auto;
  margin-left: 4px;
  opacity: 0.65;
}

/* Turn Accordion Card (Multi-turn progressive disclosure) */
.agy-turn-item {
  border-radius: 8px;
  border: 1px solid var(--agy-border);
  background: var(--agy-surface);
}

.agy-turn-summary {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: inherit;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  text-align: left;
  border-radius: 8px;
  transition: background 0.12s ease;
}

.agy-turn-summary:hover {
  background: var(--agy-surface-hover);
}

.agy-turn-pill {
  font-size: 10.5px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--agy-surface-subtle);
  color: var(--agy-secondary);
  flex: none;
}

.agy-turn-preview {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  color: var(--agy-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agy-turn-body {
  padding: 10px 11px 11px;
  border-top: 1px solid var(--agy-border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.agy-turn-body[data-single="true"] {
  padding: 0;
  border-top: none;
}

/* ============================================================================
 * Distinct Query vs Reply Cards with Hand-Drawn Icons & Bounded Scrollable Expand
 * ========================================================================== */
.agy-qa-card {
  position: relative;
  flex: none;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
}

/* Query = a sunken well (what went in) */
.agy-qa-card[data-kind="query"] {
  background: var(--agy-qa-well);
  box-shadow: inset 0 0 0 1px var(--agy-border);
}

/* Reply = a raised sheet (what came back) */
.agy-qa-card[data-kind="reply"] {
  background: var(--agy-qa-sheet);
  box-shadow: 0 0 0 1px var(--agy-border), var(--agy-qa-sheet-shadow);
}

/* Pixel stitch: 2px steps threading the reply back to its query glyph */
.agy-qa-card[data-kind="reply"]::before {
  content: "";
  position: absolute;
  left: 20px;
  top: -10px;
  width: 2px;
  height: 10px;
  background: repeating-linear-gradient(to bottom, transparent 0 2px, var(--agy-border-strong) 2px 4px);
  pointer-events: none;
}

.agy-qa-head {
  padding: 8px 8px 4px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.agy-qa-badge {
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--agy-ink);
}

.agy-qa-glyph {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.agy-qa-glyph[data-kind="query"] {
  background: var(--agy-blue-tint);
  box-shadow: inset 0 0 0 1px rgba(106, 155, 204, 0.32);
  color: var(--agy-blue-ink);
}

.agy-qa-glyph[data-kind="reply"] {
  background: var(--agy-green-tint);
  box-shadow: inset 0 0 0 1px rgba(127, 158, 110, 0.36);
  color: var(--agy-green-ink);
}

.agy-qa-card .agy-link-btn:not([data-copied="true"]) {
  color: var(--agy-muted);
}

.agy-qa-card:hover .agy-link-btn:not([data-copied="true"]) {
  color: var(--agy-secondary);
}

.agy-qa-card .agy-link-btn:not([data-copied="true"]):hover {
  color: var(--agy-ink);
}

.agy-qa-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.agy-link-btn {
  padding: 2px 7px;
  border-radius: 5px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--agy-secondary);
  font-size: 11px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: color 0.12s ease, background 0.12s ease, border-color 0.12s ease;
}

.agy-link-btn:hover {
  color: var(--agy-ink);
  background: var(--agy-surface-hover);
}

.agy-link-btn[data-copied="true"] {
  color: var(--agy-green-ink);
  border-color: rgba(127, 158, 110, 0.45);
  background: var(--agy-green-tint);
}

/* Bounded Height + Internal Scroll When Expanded (Never pushes bottom off-screen!) */
.agy-qa-viewport {
  padding: 4px 12px 11px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--agy-ink);
  word-break: break-word;
}

/* Query collapsed vs expanded-scrollable */
.agy-qa-viewport[data-kind="query"][data-state="collapsed"] {
  max-height: 68px;
  overflow: hidden;
  white-space: pre-wrap;
  -webkit-mask-image: linear-gradient(to bottom, #000 62%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 62%, transparent 100%);
}

.agy-qa-viewport[data-kind="query"][data-state="short"] {
  white-space: pre-wrap;
}

.agy-qa-viewport[data-kind="query"][data-state="expanded"] {
  max-height: 220px;
  overflow-y: auto;
  overscroll-behavior: contain;
  white-space: pre-wrap;
}

/* Reply collapsed vs expanded-scrollable */
.agy-qa-viewport[data-kind="reply"][data-state="collapsed"] {
  max-height: 145px;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, #000 68%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 68%, transparent 100%);
}

.agy-qa-viewport[data-kind="reply"][data-state="expanded"] {
  max-height: 320px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* Formatted Markdown Styles inside Reply */
.agy-md {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--agy-ink);
}

.agy-md-h {
  font-size: 12px;
  font-weight: 600;
  color: var(--agy-ink);
  margin-top: 2px;
}

.agy-md-p {
  margin: 0;
  white-space: pre-wrap;
}

.agy-md-list {
  margin: 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.agy-md-code-inline {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--agy-surface-subtle);
  border: 1px solid var(--agy-border);
}

.agy-md-pre {
  margin: 2px 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--agy-surface-subtle);
  border: 1px solid var(--agy-border);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  line-height: 1.45;
  overflow-x: auto;
  white-space: pre-wrap;
}

.agy-expand-bar {
  width: 100%;
  padding: 4px 10px 6px;
  border: none;
  border-radius: 0 0 10px 10px;
  background: transparent;
  color: var(--agy-muted);
  font-size: 11px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}

.agy-expand-bar:hover {
  background: var(--agy-surface-hover);
  color: var(--agy-ink);
}

/* Continue Footer Bar */
.agy-continue-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 2px;
}

.agy-footer-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.agy-archive-btn {
  padding: 2px 7px;
  border-radius: 5px;
  border: 1px solid var(--agy-border);
  background: var(--agy-surface);
  color: var(--agy-secondary);
  font-size: 11px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: color 0.12s ease, background 0.12s ease, border-color 0.12s ease;
}

.agy-archive-btn:hover {
  color: var(--agy-ink);
  background: var(--agy-surface-hover);
  border-color: var(--agy-border-strong);
}

.agy-archive-confirm-bar {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 1px 4px 1px 7px;
  border-radius: 6px;
  border: 1px solid rgba(227, 176, 75, 0.45);
  background: var(--agy-amber-tint);
  color: var(--agy-amber-ink);
  font-size: 11px;
  font-weight: 500;
}

.agy-confirm-yes {
  padding: 1px 7px;
  border-radius: 4px;
  border: 1px solid rgba(227, 176, 75, 0.55);
  background: var(--agy-surface);
  color: var(--agy-amber-ink);
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.agy-confirm-yes:hover {
  border-color: var(--agy-amber);
  background: var(--agy-surface-hover);
}

.agy-confirm-no {
  padding: 1px 6px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--agy-secondary);
  font-size: 10.5px;
  font-weight: 500;
  cursor: pointer;
}

.agy-confirm-no:hover {
  color: var(--agy-ink);
}

.agy-unhide-pill {
  padding: 0 7px;
  height: 16px;
  border-radius: 999px;
  border: 1px solid var(--agy-border-strong);
  background: var(--agy-surface-subtle);
  color: var(--agy-secondary);
  font-size: 10.5px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.12s ease, background 0.12s ease, border-color 0.12s ease;
}

.agy-unhide-pill:hover {
  color: var(--agy-ink);
  background: var(--agy-surface-hover);
  border-color: var(--agy-ink);
}

.agy-continue-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--agy-blue);
  background: var(--agy-blue-tint);
  color: var(--agy-blue-ink);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.12s ease, border-color 0.12s ease, background 0.12s ease, color 0.12s ease;
}

.agy-continue-btn:hover {
  opacity: 0.88;
}

.agy-continue-btn[data-copied="true"] {
  border-color: var(--agy-green);
  background: var(--agy-green-tint);
  color: var(--agy-green-ink);
}

.agy-header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border-radius: var(--dsw-radius-sm, 6px);
  border: 0.5px solid var(--dsw-alias-border-l1, rgba(128, 128, 128, 0.22));
  background: transparent;
  color: var(--dsw-alias-label-secondary, inherit);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.agy-header-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.08));
  color: var(--dsw-alias-label-primary, inherit);
}
`;

    const I18N = {
      zh: {
        capSub: "子代理协作",
        capModel: "Carbon · Argon · 3.8 Flash",
        capHint: "点击任意角色，将指令填入下方输入框",
        brainDesc: "第二大脑 · 方案推演",
        leadDesc: "任务拆解 · 协同编排",
        stafferDesc: "通用子代理 · 独立执行",
        researcherDesc: "代码与资料调研",
        reviewerDesc: "代码与方案审查",
        implementerDesc: "代码实现与修改",
        subagentsTitle: "任务记录",
        filterAll: "全部",
        filterBrain: "大脑",
        filterWorkers: "员工",
        filterHidden: "隐藏",
        askProgressShort: "询问进度",
        askProgressFull: "询问当前进度 · 填入输入框",
        emptyText: "当前工作区暂无子代理任务记录",
        emptyHiddenText: "暂无已隐藏的任务记录",
        turnCount: (n) => `${n} 轮`,
        turnLabel: (i) => `第 ${i} 轮`,
        queryLabel: "提问",
        replyLabel: "回复",
        expandText: "展开阅读",
        collapseText: "收起",
        copyText: "复制",
        copiedInline: "已复制",
        insertedInline: "已填入",
        loadingDetail: "正在读取记录…",
        noReplyYet: "正在等待子代理输出…",
        liveWaiting: "等待首个工具调用…",
        continueBtn: "继续追问 · 填入输入框",
        cancelBtn: "停止任务",
        archiveBtn: "隐藏",
        confirmArchivePrompt: "确认隐藏？",
        confirmYes: "确认",
        confirmNo: "取消",
        unarchiveBtn: "取消隐藏",
        justNow: "刚刚",
        minsAgo: (m) => `${m} 分钟前`,
        todayAt: (hm) => `今天 ${hm}`,
        yesterdayAt: (hm) => `昨天 ${hm}`,
        roleBrain: "brain · Carbon",
        roleResearch: "researcher · Flash",
        roleReview: "reviewer · Flash",
        roleImplement: "implementer · Flash",
        roleStaffer: "staffer · Flash",
        roleAsk: "ask · Flash",
      },
      en: {
        capSub: "Subagents",
        capModel: "Carbon · Argon · 3.8 Flash",
        capHint: "Click any role to insert its command into the input box",
        brainDesc: "Second brain · Carbon",
        leadDesc: "Task orchestration",
        stafferDesc: "General subagent",
        researcherDesc: "Code & doc research",
        reviewerDesc: "Code & plan review",
        implementerDesc: "Code implementation",
        subagentsTitle: "Tasks",
        filterAll: "All",
        filterBrain: "Brain",
        filterWorkers: "Workers",
        filterHidden: "Hidden",
        askProgressShort: "Ask progress",
        askProgressFull: "Ask progress in input",
        emptyText: "No subagent tasks in this workspace yet",
        emptyHiddenText: "No hidden tasks",
        turnCount: (n) => `${n} turns`,
        turnLabel: (i) => `Turn ${i}`,
        queryLabel: "Query",
        replyLabel: "Reply",
        expandText: "Expand",
        collapseText: "Collapse",
        copyText: "Copy",
        copiedInline: "Copied",
        insertedInline: "Inserted",
        loadingDetail: "Loading record…",
        noReplyYet: "Waiting for subagent output…",
        liveWaiting: "Waiting for first tool call…",
        continueBtn: "Continue in input",
        cancelBtn: "Cancel",
        archiveBtn: "Hide",
        confirmArchivePrompt: "Hide task?",
        confirmYes: "Confirm",
        confirmNo: "Cancel",
        unarchiveBtn: "Unhide",
        justNow: "Just now",
        minsAgo: (m) => `${m}m ago`,
        todayAt: (hm) => `Today ${hm}`,
        yesterdayAt: (hm) => `Yesterday ${hm}`,
        roleBrain: "brain · Carbon",
        roleResearch: "researcher · Flash",
        roleReview: "reviewer · Flash",
        roleImplement: "implementer · Flash",
        roleStaffer: "staffer · Flash",
        roleAsk: "ask · Flash",
      },
    };

    function ensureStyles() {
      if (
        typeof document !== "undefined" &&
        document.querySelector(
          "style[data-plugin-css=" + JSON.stringify(STYLE_TAG_ID) + "]"
        ) === null
      ) {
        const tag = document.createElement("style");
        tag.dataset.plugin = TAB_ID;
        tag.dataset.pluginCss = STYLE_TAG_ID;
        tag.textContent = CSS_TEXT;
        document.head.appendChild(tag);
      }
    }

    function readInitialLang() {
      try {
        const saved = globalThis.localStorage?.getItem(LANG_STORAGE_KEY);
        if (saved === "en" || saved === "zh") return saved;
      } catch {}
      return "zh";
    }

    function readInitialArchived() {
      try {
        const raw = globalThis.localStorage?.getItem(ARCHIVE_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") return parsed;
        }
      } catch {}
      return {};
    }

    function extractText(val, maxLen = 0) {
      if (val === null || val === undefined) return "";
      let str = "";
      if (typeof val === "string") {
        str = val;
      } else if (typeof val === "number" || typeof val === "boolean") {
        str = String(val);
      } else if (typeof val === "object") {
        if (typeof val.text === "string") str = val.text;
        else if (typeof val.summary === "string") str = val.summary;
        else if (typeof val.message === "string") str = val.message;
        else if (typeof val.content === "string") str = val.content;
      }
      str = str.trim();
      if (maxLen > 0 && str.length > maxLen) {
        return `${str.slice(0, maxLen)}…`;
      }
      return str;
    }

    function formatActivityItem(act) {
      if (!act) return "";
      if (typeof act === "string") return act.trim();
      if (typeof act === "object") {
        const tool = String(act.tool || act.kind || act.label || "step").trim();
        let detail = "";
        const rawPreview = act.input_preview ?? act.detail ?? "";
        if (typeof rawPreview === "string" && rawPreview.trim()) {
          const trimmed = rawPreview.trim();
          if (trimmed.startsWith("{")) {
            try {
              const parsed = JSON.parse(trimmed);
              const candidate =
                parsed.Path ||
                parsed.path ||
                parsed.filePath ||
                parsed.CommandLine ||
                parsed.command ||
                parsed.query ||
                parsed.pattern ||
                "";
              if (typeof candidate === "string" && candidate.trim()) {
                const parts = candidate.trim().split(/[/\\]/);
                detail = parts[parts.length - 1] || candidate.trim();
              }
            } catch {}
          }
          if (!detail) detail = extractText(trimmed, 36);
        }
        detail = extractText(detail, 36);
        return detail ? `${tool}: ${detail}` : tool;
      }
      return String(act);
    }

    // Collapse the 5-item recent_activities window for the single-line live
    // strip: format each step, merge consecutive identical labels into one
    // entry with a count, and return newest-first so the current step is
    // always the visible (leftmost) pill.
    function collapseActivities(list) {
      if (!Array.isArray(list)) return [];
      const out = [];
      for (const act of list) {
        const label = formatActivityItem(act);
        if (!label) continue;
        const prev = out[out.length - 1];
        if (prev && prev.label === label) prev.count += 1;
        else out.push({ label, count: 1 });
      }
      return out.reverse();
    }

    function extractCleanQueryFromSpec(spec, fallbackTask = "") {
      if (!spec || typeof spec !== "object") return extractText(fallbackTask);
      const fromSource = extractText(spec.prompt_source?.task);
      if (fromSource) return fromSource;
      const rawPrompt = extractText(spec.prompt);
      if (!rawPrompt) return extractText(fallbackTask);
      const taskMarker = "## Task\n";
      const idx = rawPrompt.indexOf(taskMarker);
      if (idx !== -1) {
        return rawPrompt.slice(idx + taskMarker.length).trim();
      }
      return rawPrompt;
    }

    function summarizeQueryForOneLine(raw) {
      const s = extractText(raw);
      if (!s) return "";
      const lines = s
        .split(/\r?\n/u)
        .map((l) => l.trim())
        .filter(Boolean);

      for (let line of lines) {
        if (
          /^#+\s*(?:背景|任务|目标|问题|上下文|Context|Background|Task|Goal|Objective|Summary)\s*$/iu.test(
            line
          )
        ) {
          continue;
        }
        if (
          /^(?:用户原话|用户原始请求|用户最新反馈|用户本轮请求原文|用户本轮授权原文|背景|任务|问题|User(?:'s)? (?:latest )?(?:feedback|request)(?:,?\s*verbatim)?)(?:（[^）]*）|\([^)]*\))?\s*[:：]?\s*$/iu.test(
            line
          )
        ) {
          continue;
        }
        if (line.length <= 24 && /[:：]$/u.test(line)) {
          continue;
        }
        line = line
          .replace(/^#+\s*/u, "")
          .replace(
            /^(?:用户原话|用户原始请求|用户最新反馈|用户本轮请求原文|用户本轮授权原文|User(?:'s)? (?:latest )?(?:feedback|request)(?:,?\s*verbatim)?|User)(?:（[^）]*）|\([^)]*\))?\s*[:：]\s*/iu,
            ""
          )
          .replace(/^请继续你刚才的分析[^\n]*[:：]\s*/u, "")
          .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
          .replace(/^[「"']+|[」"']+$/gu, "")
          .trim();
        if (line.length > 2) {
          return extractText(line, 130);
        }
      }
      return extractText(lines[0] || s, 130);
    }

    function formatTimeTag(isoStr, t) {
      if (!isoStr) return "";
      const ms = Date.parse(isoStr);
      if (!Number.isFinite(ms)) return "";
      const now = new Date();
      const d = new Date(ms);
      const diffSec = Math.floor((now.getTime() - ms) / 1000);

      if (diffSec >= 0 && diffSec < 60) return t.justNow;
      if (diffSec >= 60 && diffSec < 3600) {
        return t.minsAgo(Math.floor(diffSec / 60));
      }

      const pad = (n) => String(n).padStart(2, "0");
      const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

      const isSameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
      if (isSameDay) return t.todayAt(hm);

      const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const isYesterday =
        d.getFullYear() === yest.getFullYear() &&
        d.getMonth() === yest.getMonth() &&
        d.getDate() === yest.getDate();
      if (isYesterday) return t.yesterdayAt(hm);

      if (d.getFullYear() === now.getFullYear()) {
        return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`;
      }
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function formatDurationClock(seconds) {
      const s = Math.max(0, Math.floor(Number(seconds) || 0));
      if (s < 60) return `${s}s`;
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return `${m}:${String(rem).padStart(2, "0")}`;
    }

    function isLongQuery(text) {
      if (!text) return false;
      const lines = text.split(/\r?\n/u);
      return lines.length > 3 || text.length > 150;
    }

    function isLongReply(text) {
      if (!text) return false;
      const lines = text.split(/\r?\n/u);
      return lines.length > 6 || text.length > 280;
    }

    function renderInlineRichText(line) {
      const parts = String(line).split(/(`[^`]+`|\*\*[^*]+\*\*)/gu);
      return parts.map((part, idx) => {
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return jsx(
            "code",
            {
              className: "agy-md-code-inline",
              children: part.slice(1, -1),
            },
            idx
          );
        }
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return jsx(
            "strong",
            {
              children: part.slice(2, -2),
            },
            idx
          );
        }
        return part;
      });
    }

    function renderFormattedMarkdown(rawText) {
      const text = extractText(rawText);
      if (!text) return null;

      const lines = text.split(/\r?\n/u);
      const blocks = [];
      let listItems = [];
      let inCodeBlock = false;
      let codeLines = [];

      const flushList = () => {
        if (listItems.length > 0) {
          blocks.push(
            jsx(
              "ul",
              {
                className: "agy-md-list",
                children: listItems.map((item, idx) =>
                  jsx("li", { children: renderInlineRichText(item) }, idx)
                ),
              },
              `list-${blocks.length}`
            )
          );
          listItems = [];
        }
      };

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (line.trim().startsWith("```")) {
          flushList();
          if (inCodeBlock) {
            blocks.push(
              jsx(
                "pre",
                {
                  className: "agy-md-pre",
                  children: codeLines.join("\n"),
                },
                `code-${blocks.length}`
              )
            );
            codeLines = [];
            inCodeBlock = false;
          } else {
            inCodeBlock = true;
          }
          continue;
        }

        if (inCodeBlock) {
          codeLines.push(line);
          continue;
        }

        const trimmed = line.trim();
        if (!trimmed) {
          flushList();
          continue;
        }

        const headingMatch = /^(#{1,4})\s+(.+)$/u.exec(trimmed);
        if (headingMatch) {
          flushList();
          blocks.push(
            jsx(
              "div",
              {
                className: "agy-md-h",
                children: renderInlineRichText(headingMatch[2]),
              },
              `h-${blocks.length}`
            )
          );
          continue;
        }

        const bulletMatch = /^(?:[-*]|\d+\.)\s+(.+)$/u.exec(trimmed);
        if (bulletMatch) {
          listItems.push(bulletMatch[1]);
          continue;
        }

        flushList();
        blocks.push(
          jsx(
            "p",
            {
              className: "agy-md-p",
              children: renderInlineRichText(trimmed),
            },
            `p-${blocks.length}`
          )
        );
      }

      flushList();
      if (codeLines.length > 0) {
        blocks.push(
          jsx(
            "pre",
            {
              className: "agy-md-pre",
              children: codeLines.join("\n"),
            },
            `code-${blocks.length}`
          )
        );
      }

      return jsx("div", {
        className: "agy-md",
        children: blocks,
      });
    }

    function groupJobsIntoSubagents(jobs) {
      const byId = new Map();
      for (const j of jobs) {
        if (j && j.id) byId.set(j.id, j);
      }

      function findGroupKey(job) {
        if (job.conversation_id) return `conv:${job.conversation_id}`;
        let cur = job;
        const visited = new Set();
        while (cur && cur.parent_job_id && !visited.has(cur.id)) {
          visited.add(cur.id);
          const parent = byId.get(cur.parent_job_id);
          if (!parent) return `root:${cur.parent_job_id}`;
          if (parent.conversation_id) return `conv:${parent.conversation_id}`;
          cur = parent;
        }
        return `job:${cur?.id || job.id}`;
      }

      const groupsMap = new Map();
      for (const job of jobs) {
        if (!job || !job.id) continue;
        const key = findGroupKey(job);
        if (!groupsMap.has(key)) {
          groupsMap.set(key, []);
        }
        groupsMap.get(key).push(job);
      }

      const subagents = [];
      for (const [key, groupJobs] of groupsMap.entries()) {
        const turns = [...groupJobs].sort((a, b) =>
          String(a.started_at || a.createdAt || "").localeCompare(
            String(b.started_at || b.createdAt || "")
          )
        );
        const firstTurn = turns[0];
        const latestTurn = turns[turns.length - 1];
        const sortTime =
          latestTurn.finished_at ||
          latestTurn.started_at ||
          firstTurn.started_at ||
          "";
        subagents.push({
          key,
          turns,
          firstTurn,
          latestTurn,
          id: latestTurn.id,
          brain: Boolean(latestTurn.brain || firstTurn.brain),
          mode: latestTurn.mode || firstTurn.mode || "staffer",
          model: latestTurn.model || firstTurn.model || "",
          status: latestTurn.status || "done",
          startedAt: latestTurn.started_at || firstTurn.started_at || "",
          sortTime,
          recentActivities: latestTurn.recentActivities || [],
        });
      }

      subagents.sort((a, b) => {
        const aRun = a.status === "running" || a.status === "queued" ? 1 : 0;
        const bRun = b.status === "running" || b.status === "queued" ? 1 : 0;
        if (aRun !== bRun) return bRun - aRun;
        return String(b.sortTime || "").localeCompare(String(a.sortTime || ""));
      });
      return subagents;
    }

    // Subtle Stepped-Pixel Disclosure Caret (Muted grey when closed, warm AGY orange #F6912E when open)
    function DisclosureChevron({ open, size = "md" }) {
      const px = size === "sm" ? 14 : 16;
      const isOpen = Boolean(open);
      const mainColor = isOpen ? "#F6912E" : "var(--agy-muted)";
      const dotColor = isOpen ? "#F6912E" : "var(--agy-border-strong)";
      return jsx("span", {
        className: "agy-disclosure",
        "data-open": String(isOpen),
        "data-size": size,
        "aria-hidden": "true",
        children: jsxs("svg", {
          width: px,
          height: px,
          viewBox: "0 0 16 16",
          shapeRendering: "crispEdges",
          children: [
            jsx("rect", { x: "2", y: "7", width: "2", height: "2", fill: dotColor }),
            jsxs("g", {
              fill: mainColor,
              children: [
                jsx("rect", { x: "6", y: "3", width: "2", height: "10" }),
                jsx("rect", { x: "8", y: "5", width: "2", height: "6" }),
                jsx("rect", { x: "10", y: "6", width: "2", height: "4" }),
                jsx("rect", { x: "12", y: "7", width: "2", height: "2" }),
              ],
            }),
          ],
        }),
      });
    }

    // 2px-pixel glyph renderer: rows of "X" / "." on a 14px canvas, merged into horizontal runs
    function PixelGlyph({ rows, offsetX = 0, offsetY = 0 }) {
      const rects = [];
      rows.forEach((row, y) => {
        let x = 0;
        while (x < row.length) {
          if (row[x] !== "X") { x += 1; continue; }
          let end = x;
          while (end < row.length && row[end] === "X") end += 1;
          rects.push(jsx("rect", {
            x: String(offsetX + x * 2),
            y: String(offsetY + y * 2),
            width: String((end - x) * 2),
            height: "2",
          }, `${x}-${y}`));
          x = end;
        }
      });
      return jsx("svg", {
        width: 14,
        height: 14,
        viewBox: "0 0 14 14",
        shapeRendering: "crispEdges",
        fill: "currentColor",
        "aria-hidden": "true",
        style: { flex: "none", display: "block" },
        children: rects,
      });
    }

    // Query: pixel speech bubble with two knocked-out eyes (kin of the staffer / researcher sprites)
    const QUERY_GLYPH = [
      ".XXXXX.",
      "XXXXXXX",
      "XX.X.XX",
      "XXXXXXX",
      ".XXXXX.",
      ".XX....",
      ".X.....",
    ];
    function IconQueryBubble() {
      return jsx("span", {
        className: "agy-qa-glyph",
        "data-kind": "query",
        children: jsx(PixelGlyph, { rows: QUERY_GLYPH }),
      });
    }

    // Tasks: pixel checklist (bullet + line rows), same 2px grid as the role sprites
    const TASKS_GLYPH = [
      "XX.XXXX",
      ".......",
      "XX.XXXX",
      ".......",
      "XX.XXX.",
    ];
    function IconTasksList() {
      return jsx("span", {
        className: "agy-section-glyph",
        children: jsx(PixelGlyph, { rows: TASKS_GLYPH, offsetY: 2 }),
      });
    }

    // Reply: pixel sheet with a dog-eared corner and knocked-out text lines
    const REPLY_GLYPH = [
      "XXXX..",
      "XXXXX.",
      "XXXXXX",
      "X....X",
      "XXXXXX",
      "X...XX",
      "XXXXXX",
    ];
    function IconReplySheet() {
      return jsx("span", {
        className: "agy-qa-glyph",
        "data-kind": "reply",
        children: jsx(PixelGlyph, { rows: REPLY_GLYPH, offsetX: 1 }),
      });
    }

    // Pixel-Font Bitmap Renderer for "中 / EN" (1.5px per bitmap cell on an 8-row grid = 12px tall)
    function PixelBitmapWord({ rows, scale = 1.5 }) {
      const cols = rows[0]?.length || 1;
      const hCells = rows.length;
      const rects = [];
      rows.forEach((row, y) => {
        let x = 0;
        while (x < row.length) {
          if (row[x] !== "X") { x += 1; continue; }
          let end = x;
          while (end < row.length && row[end] === "X") end += 1;
          rects.push(jsx("rect", {
            x: String(x * 2),
            y: String(y * 2),
            width: String((end - x) * 2),
            height: "2",
          }, `${x}-${y}`));
          x = end;
        }
      });
      return jsx("svg", {
        width: cols * scale,
        height: hCells * scale,
        viewBox: `0 0 ${cols * 2} ${hCells * 2}`,
        shapeRendering: "crispEdges",
        fill: "currentColor",
        "aria-hidden": "true",
        style: { flex: "none", display: "block" },
        children: rects,
      });
    }

    const PIXEL_FONT_ZH = [
      "...X...",
      "XXXXXXX",
      "X..X..X",
      "X..X..X",
      "XXXXXXX",
      "...X...",
      "...X...",
      "...X...",
    ];

    const PIXEL_FONT_SLASH = [
      "....",
      "...X",
      "..X.",
      "..X.",
      ".X..",
      ".X..",
      "X...",
      "....",
    ];

    const PIXEL_FONT_EN = [
      "...........",
      "XXXXX.X...X",
      "X.....XX..X",
      "XXXX..X.X.X",
      "X.....X..XX",
      "X.....X...X",
      "XXXXX.X...X",
      "...........",
    ];

    // Refresh / Loading Sync: 180°-symmetric 7x7 pixel twin-arrow cycle on the 2px grid
    const REFRESH_GLYPH = [
      ".XXXX.X",
      "X....XX",
      "....XXX",
      ".......",
      "XXX....",
      "XX....X",
      "X.XXXX.",
    ];
    function IconRefreshGlyph() {
      return jsx("span", {
        className: "agy-refresh-glyph",
        children: jsx(PixelGlyph, { rows: REFRESH_GLYPH }),
      });
    }

    // Subtle Stepped-Pixel Status Icons
    function StatusGraphicIcon({ status }) {
      const s = String(status || "done").toLowerCase();
      if (s === "running" || s === "queued") {
        return jsx("span", {
          className: "agy-status-icon-wrap agy-pixel-hourglass",
          title: "Running / 运行中",
          children: jsxs("svg", {
            width: 16,
            height: 16,
            viewBox: "0 0 16 16",
            shapeRendering: "crispEdges",
            children: [
              jsxs("g", {
                fill: "var(--agy-secondary)",
                children: [
                  jsx("rect", { x: "2", y: "1", width: "12", height: "2" }),
                  jsx("rect", { x: "2", y: "13", width: "12", height: "2" }),
                  jsx("rect", { x: "3", y: "3", width: "2", height: "3" }),
                  jsx("rect", { x: "11", y: "3", width: "2", height: "3" }),
                  jsx("rect", { x: "5", y: "6", width: "2", height: "2" }),
                  jsx("rect", { x: "9", y: "6", width: "2", height: "2" }),
                  jsx("rect", { x: "5", y: "8", width: "2", height: "2" }),
                  jsx("rect", { x: "9", y: "8", width: "2", height: "2" }),
                  jsx("rect", { x: "3", y: "10", width: "2", height: "3" }),
                  jsx("rect", { x: "11", y: "10", width: "2", height: "3" }),
                ],
              }),
              jsxs("g", {
                fill: "#FBBC04",
                children: [
                  jsx("rect", { x: "7", y: "5", width: "2", height: "2" }),
                  jsx("rect", { x: "7", y: "8", width: "2", height: "2" }),
                  jsx("rect", { x: "5", y: "10", width: "6", height: "3" }),
                ],
              }),
            ],
          }),
        });
      }
      if (s === "error" || s === "crashed") {
        return jsx("span", {
          className: "agy-status-icon-wrap",
          title: "Failed / 执行失败",
          children: jsxs("svg", {
            width: 16,
            height: 16,
            viewBox: "0 0 16 16",
            shapeRendering: "crispEdges",
            children: [
              jsx("rect", {
                x: "4",
                y: "2",
                width: "8",
                height: "12",
                fill: "#C8553D",
                fillOpacity: "0.14",
              }),
              jsx("rect", {
                x: "2",
                y: "4",
                width: "12",
                height: "8",
                fill: "#C8553D",
                fillOpacity: "0.14",
              }),
              jsxs("g", {
                fill: "#C8553D",
                fillOpacity: "0.85",
                children: [
                  jsx("rect", { x: "4", y: "1", width: "8", height: "1" }),
                  jsx("rect", { x: "4", y: "14", width: "8", height: "1" }),
                  jsx("rect", { x: "1", y: "4", width: "1", height: "8" }),
                  jsx("rect", { x: "14", y: "4", width: "1", height: "8" }),
                  jsx("rect", { x: "2", y: "2", width: "2", height: "2" }),
                  jsx("rect", { x: "12", y: "2", width: "2", height: "2" }),
                  jsx("rect", { x: "2", y: "12", width: "2", height: "2" }),
                  jsx("rect", { x: "12", y: "12", width: "2", height: "2" }),
                ],
              }),
              jsxs("g", {
                fill: "#C8553D",
                children: [
                  jsx("rect", { x: "5", y: "5", width: "2", height: "2" }),
                  jsx("rect", { x: "9", y: "5", width: "2", height: "2" }),
                  jsx("rect", { x: "7", y: "7", width: "2", height: "2" }),
                  jsx("rect", { x: "5", y: "9", width: "2", height: "2" }),
                  jsx("rect", { x: "9", y: "9", width: "2", height: "2" }),
                ],
              }),
            ],
          }),
        });
      }
      if (s === "canceled" || s === "cancelled") {
        return jsx("span", {
          className: "agy-status-icon-wrap",
          title: "Canceled / 已取消",
          children: jsxs("svg", {
            width: 16,
            height: 16,
            viewBox: "0 0 16 16",
            shapeRendering: "crispEdges",
            children: [
              jsx("rect", {
                x: "4",
                y: "2",
                width: "8",
                height: "12",
                fill: "#6E7781",
                fillOpacity: "0.14",
              }),
              jsx("rect", {
                x: "2",
                y: "4",
                width: "12",
                height: "8",
                fill: "#6E7781",
                fillOpacity: "0.14",
              }),
              jsxs("g", {
                fill: "#6E7781",
                fillOpacity: "0.85",
                children: [
                  jsx("rect", { x: "4", y: "1", width: "8", height: "1" }),
                  jsx("rect", { x: "4", y: "14", width: "8", height: "1" }),
                  jsx("rect", { x: "1", y: "4", width: "1", height: "8" }),
                  jsx("rect", { x: "14", y: "4", width: "1", height: "8" }),
                  jsx("rect", { x: "2", y: "2", width: "2", height: "2" }),
                  jsx("rect", { x: "12", y: "2", width: "2", height: "2" }),
                  jsx("rect", { x: "2", y: "12", width: "2", height: "2" }),
                  jsx("rect", { x: "12", y: "12", width: "2", height: "2" }),
                ],
              }),
              jsx("rect", {
                x: "5",
                y: "7",
                width: "6",
                height: "2",
                fill: "#6E7781",
              }),
            ],
          }),
        });
      }
      if (s === "attention") {
        return jsx("span", {
          className: "agy-status-icon-wrap",
          title: "Needs attention / 需处理",
          children: jsxs("svg", {
            width: 16,
            height: 16,
            viewBox: "0 0 16 16",
            shapeRendering: "crispEdges",
            children: [
              jsx("rect", {
                x: "4",
                y: "2",
                width: "8",
                height: "12",
                fill: "#E3B04B",
                fillOpacity: "0.14",
              }),
              jsx("rect", {
                x: "2",
                y: "4",
                width: "12",
                height: "8",
                fill: "#E3B04B",
                fillOpacity: "0.14",
              }),
              jsxs("g", {
                fill: "#E3B04B",
                fillOpacity: "0.85",
                children: [
                  jsx("rect", { x: "4", y: "1", width: "8", height: "1" }),
                  jsx("rect", { x: "4", y: "14", width: "8", height: "1" }),
                  jsx("rect", { x: "1", y: "4", width: "1", height: "8" }),
                  jsx("rect", { x: "14", y: "4", width: "1", height: "8" }),
                  jsx("rect", { x: "2", y: "2", width: "2", height: "2" }),
                  jsx("rect", { x: "12", y: "2", width: "2", height: "2" }),
                  jsx("rect", { x: "2", y: "12", width: "2", height: "2" }),
                  jsx("rect", { x: "12", y: "12", width: "2", height: "2" }),
                ],
              }),
              jsxs("g", {
                fill: "#E3B04B",
                children: [
                  jsx("rect", { x: "7", y: "4", width: "2", height: "5" }),
                  jsx("rect", { x: "7", y: "10", width: "2", height: "2" }),
                ],
              }),
            ],
          }),
        });
      }
      return jsx("span", {
        className: "agy-status-icon-wrap",
        title: "Completed / 已完成",
        children: jsxs("svg", {
          width: 16,
          height: 16,
          viewBox: "0 0 16 16",
          shapeRendering: "crispEdges",
          children: [
            jsx("rect", {
              x: "4",
              y: "2",
              width: "8",
              height: "12",
              fill: "#34A853",
              fillOpacity: "0.14",
            }),
            jsx("rect", {
              x: "2",
              y: "4",
              width: "12",
              height: "8",
              fill: "#34A853",
              fillOpacity: "0.14",
            }),
            jsxs("g", {
              fill: "#34A853",
              fillOpacity: "0.85",
              children: [
                jsx("rect", { x: "4", y: "1", width: "8", height: "1" }),
                jsx("rect", { x: "4", y: "14", width: "8", height: "1" }),
                jsx("rect", { x: "1", y: "4", width: "1", height: "8" }),
                jsx("rect", { x: "14", y: "4", width: "1", height: "8" }),
                jsx("rect", { x: "2", y: "2", width: "2", height: "2" }),
                jsx("rect", { x: "12", y: "2", width: "2", height: "2" }),
                jsx("rect", { x: "2", y: "12", width: "2", height: "2" }),
                jsx("rect", { x: "12", y: "12", width: "2", height: "2" }),
                jsx("rect", { x: "4", y: "8", width: "2", height: "2" }),
                jsx("rect", { x: "6", y: "10", width: "2", height: "2" }),
                jsx("rect", { x: "8", y: "7", width: "2", height: "3" }),
                jsx("rect", { x: "10", y: "5", width: "2", height: "2" }),
              ],
            }),
          ],
        }),
      });
    }

    function InlineCheckIcon({ size = 12 }) {
      return jsx("svg", {
        width: size,
        height: size,
        viewBox: "0 0 14 14",
        fill: "none",
        "aria-hidden": "true",
        style: { flex: "none" },
        children: jsx("path", {
          d: "M2.5 7.4L5.6 10.5L11.5 3.8",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }),
      });
    }

    // =========================================================================
    // Crisp Pixel-Art Role Icons (from assets/design.svg & arch-rainbow-sprite.svg)
    // =========================================================================

    function PixelArchRainbowSprite({ size = 22, className }) {
      return jsxs("svg", {
        width: size,
        height: size,
        viewBox: "5 5 130 120",
        shapeRendering: "crispEdges",
        className,
        "aria-hidden": "true",
        children: [
          jsxs("g", {
            fill: "#3D85FC",
            children: [
              jsx("rect", { x: "80", y: "70", width: "10", height: "10" }),
              jsx("rect", { x: "90", y: "80", width: "10", height: "20" }),
              jsx("rect", { x: "100", y: "90", width: "10", height: "20" }),
              jsx("rect", { x: "110", y: "100", width: "10", height: "20" }),
              jsx("rect", { x: "120", y: "110", width: "10", height: "10" }),
            ],
          }),
          jsxs("g", {
            fill: "#64B6F5",
            children: [
              jsx("rect", { x: "50", y: "70", width: "10", height: "10" }),
              jsx("rect", { x: "30", y: "90", width: "20", height: "10" }),
              jsx("rect", { x: "30", y: "100", width: "10", height: "10" }),
              jsx("rect", { x: "10", y: "110", width: "20", height: "10" }),
            ],
          }),
          jsxs("g", {
            fill: "#85C64E",
            children: [
              jsx("rect", { x: "40", y: "30", width: "10", height: "20" }),
              jsx("rect", { x: "50", y: "40", width: "10", height: "10" }),
              jsx("rect", { x: "30", y: "50", width: "20", height: "10" }),
              jsx("rect", { x: "30", y: "60", width: "10", height: "20" }),
            ],
          }),
          jsxs("g", {
            fill: "#F6912E",
            children: [
              jsx("rect", { x: "60", y: "10", width: "20", height: "30" }),
              jsx("rect", { x: "70", y: "40", width: "10", height: "10" }),
            ],
          }),
          jsxs("g", {
            fill: "#955FA5",
            children: [
              jsx("rect", { x: "80", y: "50", width: "30", height: "10" }),
              jsx("rect", { x: "100", y: "60", width: "10", height: "20" }),
            ],
          }),
          jsxs("g", {
            fill: "#EF5441",
            children: [
              jsx("rect", { x: "80", y: "20", width: "10", height: "10" }),
              jsx("rect", { x: "80", y: "30", width: "20", height: "20" }),
            ],
          }),
          jsxs("g", {
            fill: "#6C73D8",
            children: [
              jsx("rect", { x: "80", y: "60", width: "20", height: "10" }),
              jsx("rect", { x: "90", y: "70", width: "10", height: "10" }),
              jsx("rect", { x: "100", y: "80", width: "10", height: "10" }),
              jsx("rect", { x: "110", y: "90", width: "10", height: "10" }),
            ],
          }),
          jsxs("g", {
            fill: "#D9B031",
            children: [
              jsx("rect", { x: "50", y: "20", width: "10", height: "20" }),
              jsx("rect", { x: "60", y: "40", width: "10", height: "10" }),
            ],
          }),
          jsxs("g", {
            fill: "#43AEAA",
            children: [
              jsx("rect", { x: "50", y: "50", width: "10", height: "10" }),
              jsx("rect", { x: "40", y: "60", width: "20", height: "10" }),
              jsx("rect", { x: "40", y: "70", width: "10", height: "10" }),
              jsx("rect", { x: "30", y: "80", width: "20", height: "10" }),
              jsx("rect", { x: "20", y: "90", width: "10", height: "20" }),
            ],
          }),
        ],
      });
    }

    function PixelIconBrain({ size = 16 }) {
      return jsxs("svg", {
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        shapeRendering: "crispEdges",
        children: [
          jsxs("g", {
            fill: "#6A3AB2",
            children: [
              jsx("rect", { x: "10", y: "0", width: "4", height: "3" }),
              jsx("rect", { x: "7", y: "3", width: "10", height: "3" }),
              jsx("rect", { x: "4", y: "6", width: "16", height: "3" }),
              jsx("rect", { x: "7", y: "9", width: "10", height: "3" }),
              jsx("rect", { x: "10", y: "12", width: "4", height: "3" }),
            ],
          }),
          jsxs("g", {
            fill: "#4285F4",
            children: [
              jsx("rect", { x: "4", y: "15", width: "6", height: "3" }),
              jsx("rect", { x: "14", y: "15", width: "6", height: "3" }),
              jsx("rect", { x: "1", y: "18", width: "6", height: "3" }),
              jsx("rect", { x: "17", y: "18", width: "6", height: "3" }),
              jsx("rect", { x: "1", y: "21", width: "6", height: "3" }),
              jsx("rect", { x: "17", y: "21", width: "6", height: "3" }),
            ],
          }),
          jsx("rect", { x: "10", y: "6", width: "4", height: "3", fill: "#FBBC04" }),
        ],
      });
    }

    function PixelIconCarbon({ size = 16 }) {
      return jsxs("svg", {
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        shapeRendering: "crispEdges",
        children: [
          jsx("rect", { x: "7", y: "3", width: "10", height: "2", fill: "#26C6DA" }),
          jsx("rect", { x: "5", y: "5", width: "2", height: "2", fill: "#26C6DA" }),
          jsx("rect", { x: "7", y: "5", width: "4", height: "2", fill: "#E0F7FA" }),
          jsx("rect", { x: "11", y: "5", width: "6", height: "2", fill: "#26C6DA" }),
          jsx("rect", { x: "17", y: "5", width: "2", height: "2", fill: "#0097A7" }),
          jsx("rect", { x: "3", y: "7", width: "2", height: "2", fill: "#26C6DA" }),
          jsx("rect", { x: "5", y: "7", width: "4", height: "2", fill: "#80DEEA" }),
          jsx("rect", { x: "9", y: "7", width: "6", height: "2", fill: "#00BCD4" }),
          jsx("rect", { x: "15", y: "7", width: "4", height: "2", fill: "#0097A7" }),
          jsx("rect", { x: "19", y: "7", width: "2", height: "2", fill: "#00838F" }),
          jsx("rect", { x: "1", y: "9", width: "6", height: "2", fill: "#4DD0E1" }),
          jsx("rect", { x: "7", y: "9", width: "10", height: "2", fill: "#00ACC1" }),
          jsx("rect", { x: "17", y: "9", width: "6", height: "2", fill: "#00838F" }),
          jsx("rect", { x: "3", y: "11", width: "4", height: "2", fill: "#26C6DA" }),
          jsx("rect", { x: "7", y: "11", width: "8", height: "2", fill: "#0097A7" }),
          jsx("rect", { x: "15", y: "11", width: "6", height: "2", fill: "#1A73E8" }),
          jsx("rect", { x: "5", y: "13", width: "4", height: "2", fill: "#26C6DA" }),
          jsx("rect", { x: "9", y: "13", width: "6", height: "2", fill: "#00838F" }),
          jsx("rect", { x: "15", y: "13", width: "4", height: "2", fill: "#1A73E8" }),
          jsx("rect", { x: "7", y: "15", width: "4", height: "2", fill: "#00ACC1" }),
          jsx("rect", { x: "11", y: "15", width: "4", height: "2", fill: "#00838F" }),
          jsx("rect", { x: "15", y: "15", width: "2", height: "2", fill: "#1A73E8" }),
          jsx("rect", { x: "9", y: "17", width: "2", height: "2", fill: "#00ACC1" }),
          jsx("rect", { x: "11", y: "17", width: "4", height: "2", fill: "#1A73E8" }),
          jsx("rect", { x: "11", y: "19", width: "2", height: "2", fill: "#1A73E8" }),
        ],
      });
    }

    function PixelIconArgon({ size = 16 }) {
      return jsxs("svg", {
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        shapeRendering: "crispEdges",
        children: [
          jsxs("g", {
            fill: "#9B72CB",
            children: [
              jsx("rect", { x: "9", y: "1", width: "2", height: "2" }),
              jsx("rect", { x: "13", y: "1", width: "2", height: "2" }),
              jsx("rect", { x: "7", y: "3", width: "2", height: "2" }),
              jsx("rect", { x: "15", y: "3", width: "2", height: "2" }),
              jsx("rect", { x: "3", y: "7", width: "2", height: "2" }),
              jsx("rect", { x: "19", y: "7", width: "2", height: "2" }),
              jsx("rect", { x: "1", y: "9", width: "2", height: "2" }),
              jsx("rect", { x: "21", y: "9", width: "2", height: "2" }),
              jsx("rect", { x: "1", y: "13", width: "2", height: "2" }),
              jsx("rect", { x: "21", y: "13", width: "2", height: "2" }),
              jsx("rect", { x: "3", y: "15", width: "2", height: "2" }),
              jsx("rect", { x: "19", y: "15", width: "2", height: "2" }),
              jsx("rect", { x: "7", y: "19", width: "2", height: "2" }),
              jsx("rect", { x: "15", y: "19", width: "2", height: "2" }),
              jsx("rect", { x: "9", y: "21", width: "2", height: "2" }),
              jsx("rect", { x: "13", y: "21", width: "2", height: "2" }),
            ],
          }),
          jsxs("g", {
            fill: "#4285F4",
            children: [
              jsx("rect", { x: "11", y: "1", width: "2", height: "2" }),
              jsx("rect", { x: "17", y: "5", width: "2", height: "2" }),
              jsx("rect", { x: "21", y: "11", width: "2", height: "2" }),
              jsx("rect", { x: "17", y: "17", width: "2", height: "2" }),
              jsx("rect", { x: "11", y: "21", width: "2", height: "2" }),
              jsx("rect", { x: "5", y: "17", width: "2", height: "2" }),
              jsx("rect", { x: "1", y: "11", width: "2", height: "2" }),
              jsx("rect", { x: "5", y: "5", width: "2", height: "2" }),
            ],
          }),
          jsxs("g", {
            fill: "#6A3AB2",
            children: [
              jsx("rect", { x: "11", y: "9", width: "2", height: "6" }),
              jsx("rect", { x: "9", y: "11", width: "6", height: "2" }),
            ],
          }),
          jsx("rect", { x: "11", y: "11", width: "2", height: "2", fill: "#FBBC04" }),
        ],
      });
    }

    function PixelIconLead({ size = 16 }) {
      return jsxs("svg", {
        width: size,
        height: size,
        viewBox: "0 0 16 16",
        shapeRendering: "crispEdges",
        children: [
          jsx("rect", { x: "2", y: "2", width: "2", height: "12", fill: "currentColor" }),
          jsxs("g", {
            fill: "#4285F4",
            children: [
              jsx("rect", { x: "4", y: "2", width: "8", height: "2" }),
              jsx("rect", { x: "4", y: "4", width: "10", height: "2" }),
              jsx("rect", { x: "4", y: "6", width: "10", height: "2" }),
              jsx("rect", { x: "4", y: "8", width: "8", height: "2" }),
            ],
          }),
        ],
      });
    }

    function PixelIconStaffer({ size = 16 }) {
      return jsxs("svg", {
        width: size,
        height: size,
        viewBox: "422 204 20 20",
        shapeRendering: "crispEdges",
        children: jsxs("g", {
          fill: "#4285F4",
          children: [
            jsx("rect", { x: "430", y: "206", width: "4", height: "2" }),
            jsx("rect", { x: "428", y: "208", width: "8", height: "2" }),
            jsx("rect", { x: "428", y: "210", width: "8", height: "2" }),
            jsx("rect", { x: "430", y: "212", width: "4", height: "2" }),
            jsx("rect", { x: "428", y: "216", width: "8", height: "2" }),
            jsx("rect", { x: "426", y: "218", width: "12", height: "2" }),
            jsx("rect", { x: "424", y: "220", width: "16", height: "2" }),
          ],
        }),
      });
    }

    function PixelIconResearcher({ size = 16 }) {
      return jsxs("svg", {
        width: size,
        height: size,
        viewBox: "650 204 20 20",
        shapeRendering: "crispEdges",
        children: jsxs("g", {
          fill: "#34A853",
          children: [
            jsx("rect", { x: "654", y: "206", width: "4", height: "2" }),
            jsx("rect", { x: "662", y: "206", width: "4", height: "2" }),
            jsx("rect", { x: "652", y: "208", width: "12", height: "2" }),
            jsx("rect", { x: "666", y: "208", width: "2", height: "2" }),
            jsx("rect", { x: "652", y: "210", width: "2", height: "2" }),
            jsx("rect", { x: "658", y: "210", width: "4", height: "2" }),
            jsx("rect", { x: "666", y: "210", width: "2", height: "2" }),
            jsx("rect", { x: "652", y: "212", width: "12", height: "2" }),
            jsx("rect", { x: "666", y: "212", width: "2", height: "2" }),
            jsx("rect", { x: "652", y: "214", width: "2", height: "2" }),
            jsx("rect", { x: "658", y: "214", width: "4", height: "2" }),
            jsx("rect", { x: "666", y: "214", width: "2", height: "2" }),
            jsx("rect", { x: "652", y: "216", width: "12", height: "2" }),
            jsx("rect", { x: "666", y: "216", width: "2", height: "2" }),
            jsx("rect", { x: "654", y: "218", width: "4", height: "2" }),
            jsx("rect", { x: "662", y: "218", width: "4", height: "2" }),
            jsx("rect", { x: "656", y: "220", width: "8", height: "2" }),
          ],
        }),
      });
    }

    function PixelIconReviewer({ size = 16 }) {
      return jsxs("svg", {
        width: size,
        height: size,
        viewBox: "422 276 20 20",
        shapeRendering: "crispEdges",
        children: jsxs("g", {
          fill: "#9B72CB",
          children: [
            jsx("rect", { x: "426", y: "278", width: "8", height: "2" }),
            jsx("rect", { x: "424", y: "280", width: "2", height: "2" }),
            jsx("rect", { x: "434", y: "280", width: "2", height: "2" }),
            jsx("rect", { x: "424", y: "282", width: "2", height: "2" }),
            jsx("rect", { x: "434", y: "282", width: "2", height: "2" }),
            jsx("rect", { x: "424", y: "284", width: "2", height: "2" }),
            jsx("rect", { x: "434", y: "284", width: "2", height: "2" }),
            jsx("rect", { x: "426", y: "286", width: "8", height: "2" }),
            jsx("rect", { x: "432", y: "288", width: "4", height: "2" }),
            jsx("rect", { x: "434", y: "290", width: "4", height: "2" }),
            jsx("rect", { x: "436", y: "292", width: "4", height: "2" }),
          ],
        }),
      });
    }

    function PixelIconImplementer({ size = 16 }) {
      return jsxs("svg", {
        width: size,
        height: size,
        viewBox: "650 276 20 20",
        shapeRendering: "crispEdges",
        children: jsxs("g", {
          fill: "#D93025",
          children: [
            jsx("rect", { x: "656", y: "278", width: "8", height: "2" }),
            jsx("rect", { x: "654", y: "280", width: "12", height: "2" }),
            jsx("rect", { x: "652", y: "282", width: "16", height: "2" }),
            jsx("rect", { x: "652", y: "284", width: "6", height: "2" }),
            jsx("rect", { x: "662", y: "284", width: "6", height: "2" }),
            jsx("rect", { x: "652", y: "286", width: "6", height: "2" }),
            jsx("rect", { x: "662", y: "286", width: "6", height: "2" }),
            jsx("rect", { x: "652", y: "288", width: "16", height: "2" }),
            jsx("rect", { x: "654", y: "290", width: "12", height: "2" }),
            jsx("rect", { x: "656", y: "292", width: "8", height: "2" }),
          ],
        }),
      });
    }

    function shortModelTag(modelStr, isBrain) {
      const lower = String(modelStr || "").toLowerCase();
      if (lower.includes("carbon")) return "Carbon";
      if (lower.includes("argon")) return "Argon";
      if (lower.includes("flash")) return "Flash";
      if (lower.includes("pro")) return "Pro";
      if (lower.includes("opus")) return "Opus";
      if (lower.includes("sonnet")) return "Sonnet";
      return isBrain ? "Carbon" : "Flash";
    }

    function renderSubagentIcon(sub) {
      const modelLower = String(
        sub.model || sub.latestTurn?.model || sub.firstTurn?.model || ""
      ).toLowerCase();
      if (sub.brain) {
        if (modelLower.includes("carbon")) return jsx(PixelIconCarbon, { size: 16 });
        if (modelLower.includes("argon")) return jsx(PixelIconArgon, { size: 16 });
        return jsx(PixelIconBrain, { size: 16 });
      }
      const m = sub.mode;
      switch (m) {
        case "research":
          return jsx(PixelIconResearcher, { size: 16 });
        case "review":
          return jsx(PixelIconReviewer, { size: 16 });
        case "implement":
          return jsx(PixelIconImplementer, { size: 16 });
        default:
          return jsx(PixelIconStaffer, { size: 16 });
      }
    }

    function formatSubagentRole(sub, _t) {
      const modelStr =
        sub.model || sub.latestTurn?.model || sub.firstTurn?.model || "";
      if (sub.brain) {
        return `brain · ${shortModelTag(modelStr, true)}`;
      }
      let roleName = "staffer";
      switch (sub.mode) {
        case "ask":
          roleName = "ask";
          break;
        case "research":
          roleName = "researcher";
          break;
        case "review":
          roleName = "reviewer";
          break;
        case "implement":
          roleName = "implementer";
          break;
        default:
          roleName = "staffer";
      }
      return `${roleName} · ${shortModelTag(modelStr, false)}`;
    }

    function resolveContinuationCommand(sub) {
      if (sub.brain) return "/agy-brain";
      switch (sub.mode) {
        case "ask":
          return "/agy-ask";
        case "research":
          return "/agy-researcher";
        case "review":
          return "/agy-reviewer";
        case "implement":
          return "/agy-implementer";
        default:
          return "/agy-staffer";
      }
    }

    const GuideArtworkAgyStaff = PixelArchRainbowSprite;

    function AgyTabTitle({ useTabInfo }) {
      const { tab } = useTabInfo();
      return jsxs(Fragment, {
        children: [
          jsx("span", {
            style: { display: "inline-flex", marginRight: 6, alignItems: "center" },
            children: jsx(PixelArchRainbowSprite, { size: 15 }),
          }),
          tab.title || "agy staff",
        ],
      });
    }

    function createHeaderAction(ctx) {
      return function AgyHeaderAction() {
        const onClick = React.useCallback(() => {
          try {
            const target = ctx.sidebarRight?.commandTarget?.(null);
            if (target !== undefined) {
              ctx.sidebarRight.openTabFromTarget(TAB_KIND, target);
              return;
            }
            ctx.sidebarRight?.openTab?.(TAB_KIND);
          } catch {}
        }, []);

        return jsxs("button", {
          type: "button",
          className: "agy-header-btn agy-mono",
          onClick,
          title: "agy-staff · 子代理协作 (Antigravity CLI)",
          children: [
            jsx(PixelArchRainbowSprite, { size: 15 }),
            jsx("span", { children: "agy staff" }),
          ],
        });
      };
    }

    class AgyErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error) {
        return { error };
      }
      render() {
        if (this.state.error) {
          return jsxs("div", {
            className: "agy-root",
            style: { padding: 18, gap: 10 },
            children: [
              jsx("div", {
                className: "agy-mono",
                style: { fontWeight: 700, color: "var(--agy-red)" },
                children: "agy-staff UI render error",
              }),
              jsx("div", {
                className: "agy-mono",
                style: { fontSize: 11, color: "var(--agy-muted)" },
                children: String(this.state.error?.message || this.state.error),
              }),
              jsx("button", {
                type: "button",
                className: "agy-lang-btn agy-mono",
                style: { alignSelf: "flex-start", width: "auto", padding: "0 10px" },
                onClick: () => this.setState({ error: null }),
                children: "Retry / 重试",
              }),
            ],
          });
        }
        return this.props.children;
      }
    }

    function createSidebarBody(ctx) {
      function AgySidebarBodyInner(props) {
        const { sessionId, inputActions } = props;

        const useRef =
          React.useRef ||
          ((init) => React.useState(() => ({ current: init }))[0]);
        const loadInFlightRef = useRef(false);
        const specCacheRef = useRef(new Map());

        const [lang, setLang] = React.useState(readInitialLang);
        const [capExpanded, setCapExpanded] = React.useState(true);
        const [filter, setFilter] = React.useState("all");
        const [jobs, setJobs] = React.useState([]);
        const [nowTick, setNowTick] = React.useState(() => Date.now());

        const [expandedKeys, setExpandedKeys] = React.useState({});
        const [openTurnIds, setOpenTurnIds] = React.useState({});
        const [expandedBlocks, setExpandedBlocks] = React.useState({});
        const [turnDetails, setTurnDetails] = React.useState({});
        const [archivedMap, setArchivedMap] = React.useState(readInitialArchived);
        const [confirmArchiveKey, setConfirmArchiveKey] = React.useState(null);
        const [isRefreshing, setIsRefreshing] = React.useState(false);
        // Inline checkmark state per button key (Replaces intrusive top toast popup!)
        const [copiedKeys, setCopiedKeys] = React.useState({});

        const t = I18N[lang] || I18N.zh;

        const toggleLang = React.useCallback(() => {
          setLang((prev) => {
            const next = prev === "zh" ? "en" : "zh";
            try {
              globalThis.localStorage?.setItem(LANG_STORAGE_KEY, next);
            } catch {}
            return next;
          });
        }, []);

        const markCopied = React.useCallback((key) => {
          if (!key) return;
          setCopiedKeys((prev) => ({ ...prev, [key]: true }));
          setTimeout(() => {
            setCopiedKeys((prev) => {
              if (!prev[key]) return prev;
              const next = { ...prev };
              delete next[key];
              return next;
            });
          }, 1600);
        }, []);

        const runCtl = React.useCallback(
          async (payload) => {
            if (!sessionId || !ctx.remote?.commands?.execute) {
              return { ok: false, error: "No active session" };
            }
            const cmdLine = `/agy-ctl ${JSON.stringify(payload)}`;
            const res = await ctx.remote.commands.execute(sessionId, cmdLine, []);
            if (!res.ok) {
              return {
                ok: false,
                error: `${res.error?.message || "Command failed"}`,
              };
            }
            if (!res.value) {
              return {
                ok: false,
                error: "Command /agy-ctl is not registered in this session",
              };
            }
            const inner = res.value.result;
            if (inner.kind === "error") {
              return { ok: false, error: inner.text || "Execution error" };
            }
            return { ok: true, text: inner.text || "" };
          },
          [sessionId]
        );

        const loadWorkspaceState = React.useCallback(async () => {
          if (!sessionId || !ctx.remote?.workspaceFiles?.read) return;
          if (loadInFlightRef.current) return;
          loadInFlightRef.current = true;
          try {
            const stateRes = await ctx.remote.workspaceFiles.read(
              sessionId,
              ".agy-staff/state.json",
              {}
            );
            if (!stateRes.ok || !stateRes.value?.text) {
              setJobs([]);
              return;
            }
            const parsed = JSON.parse(stateRes.value.text);
            const rawJobs = Array.isArray(parsed?.jobs) ? parsed.jobs : [];
            const realJobs = rawJobs.filter(
              (j) => j && !j.demo && !String(j.id || "").includes("-demo-")
            );
            const sorted = [...realJobs].sort((a, b) =>
              String(b.started_at || b.createdAt || "").localeCompare(
                String(a.started_at || a.createdAt || "")
              )
            );

            const recentSlice = sorted.slice(0, 32);
            const enriched = await Promise.all(
              recentSlice.map(async (job) => {
                const isBrain = Boolean(job.brain);
                let next = {
                  ...job,
                  brain: isBrain,
                  task: extractText(job.task || job.promptPreview, 400),
                  summary: extractText(job.summary || job.latestText, 500),
                };

                if (!next.task) {
                  if (specCacheRef.current.has(job.id)) {
                    next.task = specCacheRef.current.get(job.id);
                  } else {
                    try {
                      const specRes = await ctx.remote.workspaceFiles.read(
                        sessionId,
                        `.agy-staff/jobs/${job.id}.spec.json`,
                        {}
                      );
                      if (specRes.ok && specRes.value?.text) {
                        const spec = JSON.parse(specRes.value.text);
                        const cleanTask =
                          extractCleanQueryFromSpec(spec, job.id) ||
                          String(job.id || "");
                        next.task = cleanTask;
                        specCacheRef.current.set(job.id, cleanTask);
                      }
                    } catch {}
                  }
                }

                const isJobRunning =
                  job.status === "running" || job.status === "queued";
                if (isJobRunning) {
                  try {
                    const progRes = await ctx.remote.workspaceFiles.read(
                      sessionId,
                      `.agy-staff/jobs/${job.id}.progress.json`,
                      {}
                    );
                    if (progRes.ok && progRes.value?.text) {
                      const prog = JSON.parse(progRes.value.text);
                      const progSummary = extractText(
                        prog.summary ||
                          prog.latest_text ||
                          prog.latest_response_excerpt,
                        600
                      );
                      const progActivities = Array.isArray(
                        prog.recent_activities
                      )
                        ? prog.recent_activities
                            .map(formatActivityItem)
                            .filter(Boolean)
                        : next.recentActivities || [];
                      next = {
                        ...next,
                        status:
                          extractText(prog.status || next.status, 24) ||
                          "done",
                        elapsedSeconds:
                          typeof prog.elapsed_seconds === "number"
                            ? prog.elapsed_seconds
                            : typeof next.elapsedSeconds === "number"
                            ? next.elapsedSeconds
                            : null,
                        summary: progSummary || next.summary || "",
                        recentActivities: progActivities,
                      };
                    }
                  } catch {}
                }
                return next;
              })
            );
            setJobs(enriched);
          } catch {
            setJobs([]);
          } finally {
            loadInFlightRef.current = false;
          }
        }, [sessionId]);

        const hasRealRunning = jobs.some(
          (j) => j.status === "running" || j.status === "queued"
        );

        const handleManualRefresh = React.useCallback(async () => {
          setIsRefreshing(true);
          const minSpin = new Promise((resolve) => setTimeout(resolve, 560));
          try {
            await Promise.all([loadWorkspaceState(), minSpin]);
          } finally {
            setIsRefreshing(false);
          }
        }, [loadWorkspaceState]);

        React.useEffect(() => {
          const initialTimer = setTimeout(loadWorkspaceState, 30);
          const intervalMs = hasRealRunning ? 2000 : 5000;
          const timer = setInterval(loadWorkspaceState, intervalMs);
          return () => {
            clearTimeout(initialTimer);
            clearInterval(timer);
          };
        }, [loadWorkspaceState, hasRealRunning]);

        React.useEffect(() => {
          if (!hasRealRunning) return undefined;
          const clock = setInterval(() => {
            setNowTick(Date.now());
          }, 1000);
          return () => clearInterval(clock);
        }, [hasRealRunning]);

        // Prefill the chat composer input box (NEVER auto-send!) + show inline checkmark on clicked button
        const prefillInput = React.useCallback(
          async (draftText, feedbackKey, e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            try {
              if (inputActions?.setDraft) {
                inputActions.setDraft(draftText);
              } else if (
                inputActions?.insertText &&
                inputActions?.captureInsertion
              ) {
                inputActions.insertText(
                  draftText,
                  inputActions.captureInsertion()
                );
              }
            } catch {}
            try {
              await globalThis.navigator?.clipboard?.writeText(draftText);
            } catch {}
            if (feedbackKey) markCopied(feedbackKey);
          },
          [inputActions, markCopied]
        );

        const copyTextToClipboard = React.useCallback(
          async (text, copyKey, e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            try {
              await globalThis.navigator?.clipboard?.writeText(text);
            } catch {}
            if (copyKey) markCopied(copyKey);
          },
          [markCopied]
        );

        const loadTurnData = React.useCallback(
          async (turns) => {
            if (!sessionId || !ctx.remote?.workspaceFiles?.read) return;
            const turnsToLoad = turns.filter(
              (turn) => turn && !turnDetails[turn.id]?.loaded
            );
            if (turnsToLoad.length === 0) return;

            const loadedEntries = await Promise.all(
              turnsToLoad.map(async (turn) => {
                let query = extractText(turn.task || turn.id);
                if (specCacheRef.current?.has(turn.id)) {
                  query = specCacheRef.current.get(turn.id) || query;
                } else {
                  try {
                    const specRes = await ctx.remote.workspaceFiles.read(
                      sessionId,
                      `.agy-staff/jobs/${turn.id}.spec.json`,
                      {}
                    );
                    if (specRes.ok && specRes.value?.text) {
                      const spec = JSON.parse(specRes.value.text);
                      const fullQuery = extractCleanQueryFromSpec(spec, query);
                      if (fullQuery) query = fullQuery;
                      specCacheRef.current?.set(turn.id, fullQuery || query);
                    }
                  } catch {}
                }

                let hasResultMd = false;
                let resultMdText = "";
                try {
                  const resMd = await ctx.remote.workspaceFiles.read(
                    sessionId,
                    `.agy-staff/jobs/${turn.id}.result.md`,
                    {}
                  );
                  if (resMd.ok && resMd.value?.text?.trim()) {
                    hasResultMd = true;
                    resultMdText = resMd.value.text.trim();
                  }
                } catch {}

                const isTerminal = Boolean(
                  turn.status &&
                    turn.status !== "running" &&
                    turn.status !== "queued"
                );
                const reply = hasResultMd
                  ? resultMdText
                  : isTerminal
                  ? extractText(turn.summary || "")
                  : "";
                const loaded = hasResultMd || isTerminal;

                return [
                  turn.id,
                  {
                    loaded,
                    query,
                    reply,
                  },
                ];
              })
            );

            setTurnDetails((prev) => {
              const next = { ...prev };
              for (const [id, data] of loadedEntries) {
                next[id] = data;
              }
              return next;
            });
          },
          [sessionId, turnDetails]
        );

        const toggleSubagentExpand = React.useCallback(
          async (subagent) => {
            const isOpen = Boolean(expandedKeys[subagent.key]);
            setExpandedKeys((prev) => ({
              ...prev,
              [subagent.key]: !isOpen,
            }));
            if (isOpen) return;

            const latestTurnId = subagent.latestTurn?.id;
            if (latestTurnId) {
              setOpenTurnIds((prev) => ({
                ...prev,
                [latestTurnId]: true,
              }));
            }
            await loadTurnData(subagent.turns);
          },
          [expandedKeys, loadTurnData]
        );

        const toggleTurnOpen = React.useCallback((turnId) => {
          setOpenTurnIds((prev) => ({
            ...prev,
            [turnId]: !prev[turnId],
          }));
        }, []);

        const toggleBlockExpand = React.useCallback((blockKey, e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          const cardEl = e?.currentTarget?.closest?.(".agy-qa-card");
          const vpFromCard = cardEl?.querySelector?.(".agy-qa-viewport");
          setExpandedBlocks((prev) => {
            const wasExpanded = Boolean(prev[blockKey]);
            if (wasExpanded) {
              if (vpFromCard) vpFromCard.scrollTop = 0;
              if (typeof document !== "undefined") {
                const vpByAttr = document.querySelector(
                  "[data-block-key=" + JSON.stringify(blockKey) + "]"
                );
                if (vpByAttr) vpByAttr.scrollTop = 0;
              }
            }
            return {
              ...prev,
              [blockKey]: !wasExpanded,
            };
          });
        }, []);

        const handleRequestArchive = React.useCallback((sub, e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          if (!sub) return;
          setConfirmArchiveKey(sub.key);
        }, []);

        const handleCancelArchive = React.useCallback((e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          setConfirmArchiveKey(null);
        }, []);

        const handleArchiveSubagent = React.useCallback((sub, e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          if (!sub) return;
          setConfirmArchiveKey(null);
          setExpandedKeys((prev) => {
            const next = { ...prev };
            delete next[sub.key];
            return next;
          });
          setArchivedMap((prev) => {
            const next = { ...prev, [sub.key]: true };
            try {
              globalThis.localStorage?.setItem(
                ARCHIVE_STORAGE_KEY,
                JSON.stringify(next)
              );
            } catch {}
            return next;
          });
        }, []);

        const handleUnarchiveSubagent = React.useCallback((sub, e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          if (!sub) return;
          setConfirmArchiveKey(null);
          setArchivedMap((prev) => {
            const next = { ...prev };
            delete next[sub.key];
            try {
              globalThis.localStorage?.setItem(
                ARCHIVE_STORAGE_KEY,
                JSON.stringify(next)
              );
            } catch {}
            return next;
          });
        }, []);

        const handleCancelJob = React.useCallback(
          async (sub, e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            await runCtl({ action: "cancel", jobId: sub.id });
            await loadWorkspaceState();
          },
          [runCtl, loadWorkspaceState]
        );

        const allSubagents = React.useMemo(
          () => groupJobsIntoSubagents(jobs),
          [jobs]
        );

        React.useEffect(() => {
          const pendingTurns = [];
          for (const sub of allSubagents) {
            if (!expandedKeys[sub.key]) continue;
            for (const turn of sub.turns) {
              const isTerminal =
                turn.status &&
                turn.status !== "running" &&
                turn.status !== "queued";
              if (isTerminal && !turnDetails[turn.id]?.loaded) {
                pendingTurns.push(turn);
              }
            }
          }
          if (pendingTurns.length > 0) {
            loadTurnData(pendingTurns);
          }
        }, [allSubagents, expandedKeys, turnDetails, loadTurnData]);

        const archivedSubagents = React.useMemo(
          () => allSubagents.filter((s) => Boolean(archivedMap[s.key])),
          [allSubagents, archivedMap]
        );
        const archivedCount = archivedSubagents.length;

        const subagents = React.useMemo(
          () => allSubagents.filter((s) => !archivedMap[s.key]),
          [allSubagents, archivedMap]
        );

        const brainCount = subagents.filter((s) => s.brain).length;
        const workerCount = subagents.filter((s) => !s.brain).length;
        const filteredSubagents =
          filter === "hidden"
            ? archivedSubagents
            : subagents.filter((s) => {
                if (filter === "brain") return s.brain;
                if (filter === "workers") return !s.brain;
                return true;
              });

        const capabilities = [
          {
            cmd: "/agy-brain",
            desc: t.brainDesc,
            icon: jsx(PixelIconBrain, { size: 15 }),
          },
          {
            cmd: "/agy-lead",
            desc: t.leadDesc,
            icon: jsx(PixelIconLead, { size: 15 }),
          },
          {
            cmd: "/agy-staffer",
            desc: t.stafferDesc,
            icon: jsx(PixelIconStaffer, { size: 15 }),
          },
          {
            cmd: "/agy-researcher",
            desc: t.researcherDesc,
            icon: jsx(PixelIconResearcher, { size: 15 }),
          },
          {
            cmd: "/agy-reviewer",
            desc: t.reviewerDesc,
            icon: jsx(PixelIconReviewer, { size: 15 }),
          },
          {
            cmd: "/agy-implementer",
            desc: t.implementerDesc,
            icon: jsx(PixelIconImplementer, { size: 15 }),
          },
        ];

        const renderTurnQA = (turn, isSingleTurn) => {
          const cached = turnDetails[turn.id];
          const isTurnRunning =
            turn.status === "running" || turn.status === "queued";
          const qText =
            cached?.query || extractText(turn.task || turn.id);
          const rText = isTurnRunning
            ? extractText(turn.summary || "") || cached?.reply || t.noReplyYet
            : cached?.reply ||
              extractText(turn.summary || "") ||
              (cached?.loaded ? t.noReplyYet : t.loadingDetail);

          const qKey = `${turn.id}:q`;
          const rKey = `${turn.id}:r`;
          const qCopyKey = `copy:${qKey}`;
          const rCopyKey = `copy:${rKey}`;
          const qCopied = Boolean(copiedKeys[qCopyKey]);
          const rCopied = Boolean(copiedKeys[rCopyKey]);

          const qLong = isLongQuery(qText);
          const rLong = isLongReply(rText);
          const qExpanded = Boolean(expandedBlocks[qKey]);
          const rExpanded = Boolean(expandedBlocks[rKey]);

          const qViewportState = !qLong
            ? "short"
            : qExpanded
            ? "expanded"
            : "collapsed";
          const rViewportState = !rLong
            ? "short"
            : rExpanded
            ? "expanded"
            : "collapsed";

          return jsxs("div", {
            className: "agy-turn-body",
            "data-single": String(Boolean(isSingleTurn)),
            children: [
              // 1. Historical Query (With Hand-Drawn Thought Cloud Icon + Inline Copy Checkmark)
              jsxs("div", {
                className: "agy-qa-card",
                "data-kind": "query",
                children: [
                  jsxs("div", {
                    className: "agy-qa-head",
                    children: [
                      jsxs("span", {
                        className: "agy-qa-badge",
                        children: [
                          jsx(IconQueryBubble, {}),
                          jsx("span", { children: t.queryLabel }),
                        ],
                      }),
                      jsxs("div", {
                        className: "agy-qa-actions",
                        children: [
                          qLong
                            ? jsx("button", {
                                type: "button",
                                className: "agy-link-btn",
                                onClick: (e) => toggleBlockExpand(qKey, e),
                                children: qExpanded
                                  ? `${t.collapseText} ▴`
                                  : `${t.expandText} ▾`,
                              })
                            : null,
                          jsxs("button", {
                            type: "button",
                            className: "agy-link-btn",
                            "data-copied": String(qCopied),
                            onClick: (e) =>
                              copyTextToClipboard(qText, qCopyKey, e),
                            children: qCopied
                              ? [
                                  jsx(InlineCheckIcon, { size: 11 }, "chk"),
                                  jsx("span", { children: t.copiedInline }, "lbl"),
                                ]
                              : [jsx("span", { children: t.copyText }, "lbl")],
                          }),
                        ],
                      }),
                    ],
                  }),
                  jsx("div", {
                    className: "agy-qa-viewport",
                    "data-kind": "query",
                    "data-state": qViewportState,
                    "data-block-key": qKey,
                    children: qText,
                  }),
                  qLong
                    ? jsx("button", {
                        type: "button",
                        className: "agy-expand-bar",
                        onClick: (e) => toggleBlockExpand(qKey, e),
                        children: qExpanded
                          ? `${t.collapseText} ▴`
                          : `${t.expandText} ▾`,
                      })
                    : null,
                ],
              }),

              // 2. Historical Reply (With Hand-Drawn Sticky Note Icon + Inline Copy Checkmark)
              jsxs("div", {
                className: "agy-qa-card",
                "data-kind": "reply",
                children: [
                  jsxs("div", {
                    className: "agy-qa-head",
                    children: [
                      jsxs("span", {
                        className: "agy-qa-badge",
                        children: [
                          jsx(IconReplySheet, {}),
                          jsx("span", { children: t.replyLabel }),
                        ],
                      }),
                      jsxs("div", {
                        className: "agy-qa-actions",
                        children: [
                          rLong
                            ? jsx("button", {
                                type: "button",
                                className: "agy-link-btn",
                                onClick: (e) => toggleBlockExpand(rKey, e),
                                children: rExpanded
                                  ? `${t.collapseText} ▴`
                                  : `${t.expandText} ▾`,
                              })
                            : null,
                          jsxs("button", {
                            type: "button",
                            className: "agy-link-btn",
                            "data-copied": String(rCopied),
                            onClick: (e) =>
                              copyTextToClipboard(rText, rCopyKey, e),
                            children: rCopied
                              ? [
                                  jsx(InlineCheckIcon, { size: 11 }, "chk"),
                                  jsx("span", { children: t.copiedInline }, "lbl"),
                                ]
                              : [jsx("span", { children: t.copyText }, "lbl")],
                          }),
                        ],
                      }),
                    ],
                  }),
                  jsx("div", {
                    className: "agy-qa-viewport",
                    "data-kind": "reply",
                    "data-state": rViewportState,
                    "data-block-key": rKey,
                    children: renderFormattedMarkdown(rText),
                  }),
                  rLong
                    ? jsx("button", {
                        type: "button",
                        className: "agy-expand-bar",
                        onClick: (e) => toggleBlockExpand(rKey, e),
                        children: rExpanded
                          ? `${t.collapseText} ▴`
                          : `${t.expandText} ▾`,
                      })
                    : null,
                ],
              }),
            ],
          });
        };

        return jsxs("div", {
          className: "agy-root",
          children: [
            jsxs("div", {
              className: "agy-scroll",
              children: [
                // =============================================================
                // CUJ 1: Collapsible Capability Card (Default Expanded, flex: none)
                // =============================================================
                jsxs("div", {
                  className: "agy-cap-card",
                  children: [
                    jsxs("div", {
                      className: "agy-cap-header",
                      children: [
                        jsxs("button", {
                          type: "button",
                          className: "agy-cap-toggle",
                          onClick: () => setCapExpanded((prev) => !prev),
                          children: [
                            jsx(DisclosureChevron, { open: capExpanded }),
                            jsx(PixelArchRainbowSprite, { size: 17 }),
                            jsx("span", {
                              className: "agy-cap-title",
                              children: "agy staff",
                            }),
                            jsx("span", {
                              className: "agy-cap-subtitle",
                              children: t.capSub,
                            }),
                            jsx("span", {
                              className: "agy-cap-chip agy-mono",
                              children: t.capModel,
                            }),
                          ],
                        }),
                        jsxs("div", {
                          className: "agy-cap-header-actions",
                          children: [
                            jsxs("button", {
                              type: "button",
                              className: "agy-lang-btn agy-mono",
                              onClick: toggleLang,
                              title: "切换中英文 (中 / EN)",
                              children: [
                                jsx("span", {
                                  className: "agy-lang-opt",
                                  "data-active": String(lang === "zh"),
                                  children: jsx(PixelBitmapWord, {
                                    rows: PIXEL_FONT_ZH,
                                  }),
                                }),
                                jsx("span", {
                                  className: "agy-lang-sep",
                                  children: jsx(PixelBitmapWord, {
                                    rows: PIXEL_FONT_SLASH,
                                  }),
                                }),
                                jsx("span", {
                                  className: "agy-lang-opt",
                                  "data-active": String(lang === "en"),
                                  children: jsx(PixelBitmapWord, {
                                    rows: PIXEL_FONT_EN,
                                  }),
                                }),
                              ],
                            }),
                          ],
                        }),
                      ],
                    }),

                    capExpanded
                      ? jsxs("div", {
                          className: "agy-cap-body",
                          children: [
                            jsx("div", {
                              className: "agy-cap-grid",
                              children: capabilities.map((cap) => {
                                const capCopyKey = `cap:${cap.cmd}`;
                                const capCopied = Boolean(copiedKeys[capCopyKey]);
                                return jsxs(
                                  "button",
                                  {
                                    type: "button",
                                    className: "agy-cap-item",
                                    "data-copied": String(capCopied),
                                    onClick: (e) =>
                                      prefillInput(
                                        `${cap.cmd} `,
                                        capCopyKey,
                                        e
                                      ),
                                    children: [
                                      jsx("div", {
                                        className: "agy-cap-icon",
                                        children: cap.icon,
                                      }),
                                      jsxs("div", {
                                        className: "agy-cap-text",
                                        children: [
                                          jsxs("div", {
                                            className: "agy-cap-cmd agy-mono",
                                            children: [
                                              jsx("span", { children: cap.cmd }),
                                              capCopied
                                                ? jsx(InlineCheckIcon, { size: 12 })
                                                : null,
                                            ],
                                          }),
                                          jsx("div", {
                                            className: "agy-cap-desc",
                                            children: capCopied
                                              ? t.insertedInline
                                              : cap.desc,
                                          }),
                                        ],
                                      }),
                                    ],
                                  },
                                  cap.cmd
                                );
                              }),
                            }),
                            jsx("div", {
                              className: "agy-cap-hint",
                              children: t.capHint,
                            }),
                          ],
                        })
                      : null,
                  ],
                }),

                // =============================================================
                // CUJ 2: Subagents Dashboard (Hand-Drawn Icons + Clean Running Layout)
                // =============================================================
                jsxs("div", {
                  className: "agy-section",
                  children: [
                    jsxs("div", {
                      className: "agy-section-bar",
                      children: [
                        jsxs("span", {
                          className: "agy-section-title",
                          children: [
                            jsx(IconTasksList, {}),
                            jsx("span", { children: t.subagentsTitle }),
                          ],
                        }),
                        jsxs("div", {
                          className: "agy-section-controls",
                          children: [
                            jsxs("div", {
                              className: "agy-segmented",
                              children: [
                                jsxs("button", {
                                  type: "button",
                                  className: "agy-seg-btn",
                                  "data-active": String(filter === "all"),
                                  onClick: () => setFilter("all"),
                                  children: [
                                    jsx("span", { children: t.filterAll }),
                                    jsx("span", {
                                      className: "agy-seg-count agy-mono",
                                      children: subagents.length,
                                    }),
                                  ],
                                }),
                                jsxs("button", {
                                  type: "button",
                                  className: "agy-seg-btn",
                                  "data-active": String(filter === "brain"),
                                  onClick: () => setFilter("brain"),
                                  children: [
                                    jsx("span", { children: t.filterBrain }),
                                    jsx("span", {
                                      className: "agy-seg-count agy-mono",
                                      children: brainCount,
                                    }),
                                  ],
                                }),
                                jsxs("button", {
                                  type: "button",
                                  className: "agy-seg-btn",
                                  "data-active": String(filter === "workers"),
                                  onClick: () => setFilter("workers"),
                                  children: [
                                    jsx("span", { children: t.filterWorkers }),
                                    jsx("span", {
                                      className: "agy-seg-count agy-mono",
                                      children: workerCount,
                                    }),
                                  ],
                                }),
                                jsxs("button", {
                                  type: "button",
                                  className: "agy-seg-btn",
                                  "data-active": String(filter === "hidden"),
                                  onClick: () => setFilter("hidden"),
                                  children: [
                                    jsx("span", { children: t.filterHidden }),
                                    jsx("span", {
                                      className: "agy-seg-count agy-mono",
                                      children: archivedCount,
                                    }),
                                  ],
                                }),
                              ],
                            }),
                            jsx("button", {
                              type: "button",
                              className: "agy-icon-btn agy-mono",
                              "data-refreshing": String(isRefreshing),
                              onClick: handleManualRefresh,
                              title: "Refresh .agy-staff/state.json",
                              children: jsx(IconRefreshGlyph, {}),
                            }),
                          ],
                        }),
                      ],
                    }),

                    filteredSubagents.length === 0
                      ? jsx("div", {
                          className: "agy-empty-state",
                          children:
                            filter === "hidden"
                              ? t.emptyHiddenText
                              : t.emptyText,
                        })
                      : jsx("div", {
                          className: "agy-subagent-list",
                          children: filteredSubagents.map((sub) => {
                            const isExpanded = Boolean(expandedKeys[sub.key]);
                            const isRunning =
                              sub.status === "running" ||
                              sub.status === "queued";
                            const latest = sub.latestTurn;
                            const first = sub.firstTurn;
                            const previewQuery =
                              summarizeQueryForOneLine(
                                latest.task || first.task || latest.id
                              ) || latest.id;

                            const contSkill = resolveContinuationCommand(sub);
                            const continueInputDraft =
                              lang === "zh"
                                ? `${contSkill} 继续任务 ${latest.id}：`
                                : `${contSkill} Continue task ${latest.id}: `;

                            const askProgressDraft =
                              lang === "zh"
                                ? `/agy-jobs 帮我查看一下正在运行的子代理任务（${latest.id}）目前的最新进度怎么样了？`
                                : `/agy-jobs Check the current progress of running subagent task (${latest.id})`;

                            const askKeyInline = `ask-inline:${sub.key}`;
                            const askKeyFooter = `ask-footer:${sub.key}`;
                            const contKeyFooter = `cont-footer:${sub.key}`;
                            const askInlineCopied = Boolean(copiedKeys[askKeyInline]);
                            const askFooterCopied = Boolean(copiedKeys[askKeyFooter]);
                            const contFooterCopied = Boolean(copiedKeys[contKeyFooter]);

                            const liveElapsedSec = isRunning
                              ? Math.max(
                                  1,
                                  Math.floor(
                                    (nowTick -
                                      (Date.parse(sub.startedAt) || nowTick)) /
                                      1000
                                  )
                                )
                              : null;

                            const timeTag = formatTimeTag(
                              sub.sortTime || sub.startedAt,
                              t
                            );

                            return jsxs(
                              "div",
                              {
                                className: "agy-subagent-card",
                                "data-expanded": String(isExpanded),
                                "data-running": String(isRunning),
                                children: [
                                  // Level 1: Collapsed Summary Header (Default)
                                  jsxs("div", {
                                    role: "button",
                                    tabIndex: 0,
                                    className: "agy-subagent-summary",
                                    onClick: () => toggleSubagentExpand(sub),
                                    children: [
                                      jsx(DisclosureChevron, {
                                        open: isExpanded,
                                      }),
                                      jsx("div", {
                                        className: "agy-subagent-icon",
                                        children: renderSubagentIcon(sub),
                                      }),
                                      jsxs("div", {
                                        className: "agy-subagent-main",
                                        children: [
                                          jsxs("div", {
                                            className: "agy-subagent-top",
                                            children: [
                                              jsx("span", {
                                                className:
                                                  "agy-subagent-role agy-mono",
                                                children: formatSubagentRole(
                                                  sub,
                                                  t
                                                ),
                                              }),
                                              sub.turns.length > 1
                                                ? jsx("span", {
                                                    className: "agy-turn-badge",
                                                    children: t.turnCount(
                                                      sub.turns.length
                                                    ),
                                                  })
                                                : null,
                                              archivedMap[sub.key]
                                                ? jsx("button", {
                                                    type: "button",
                                                    className: "agy-unhide-pill",
                                                    onClick: (e) =>
                                                      handleUnarchiveSubagent(
                                                        sub,
                                                        e
                                                      ),
                                                    children: t.unarchiveBtn,
                                                  })
                                                : null,
                                              isRunning
                                                ? jsxs("button", {
                                                    type: "button",
                                                    className:
                                                      "agy-inline-progress-link",
                                                    "data-copied": String(
                                                      askInlineCopied
                                                    ),
                                                    onClick: (e) =>
                                                      prefillInput(
                                                        askProgressDraft,
                                                        askKeyInline,
                                                        e
                                                      ),
                                                    children: askInlineCopied
                                                      ? [
                                                          jsx(
                                                            InlineCheckIcon,
                                                            { size: 10 },
                                                            "chk"
                                                          ),
                                                          jsx(
                                                            "span",
                                                            {
                                                              children:
                                                                t.insertedInline,
                                                            },
                                                            "lbl"
                                                          ),
                                                        ]
                                                      : [
                                                          jsx(
                                                            "span",
                                                            {
                                                              children:
                                                                t.askProgressShort,
                                                            },
                                                            "lbl"
                                                          ),
                                                          jsx(
                                                            "span",
                                                            { children: "↗" },
                                                            "arr"
                                                          ),
                                                        ],
                                                  })
                                                : null,
                                            ],
                                          }),
                                          jsx("div", {
                                            className:
                                              "agy-subagent-query-preview",
                                            children: previewQuery,
                                          }),
                                        ],
                                      }),

                                      // Right side: Strictly [Elapsed/Timestamp] + [22px Hand-Drawn Status Icon] (Never crowded!)
                                      jsxs("div", {
                                        className: "agy-subagent-right",
                                        children: [
                                          isRunning
                                            ? jsx("span", {
                                                className:
                                                  "agy-running-timer agy-mono",
                                                children:
                                                  formatDurationClock(
                                                    liveElapsedSec
                                                  ),
                                              })
                                            : timeTag
                                            ? jsx("span", {
                                                className: "agy-time-tag",
                                                children: timeTag,
                                              })
                                            : null,
                                          jsx(StatusGraphicIcon, {
                                            status: sub.status,
                                          }),
                                        ],
                                      }),
                                    ],
                                  }),

                                  // Level 2 & 3: Progressive Disclosure Body
                                  isExpanded
                                    ? jsxs("div", {
                                        className: "agy-subagent-detail",
                                        children: [
                                          // Always mounted while running (placeholder
                                          // before the first tool call) and locked to a
                                          // single row, so it never jumps 0 -> 1 -> 2 rows.
                                          isRunning
                                            ? (() => {
                                                const steps =
                                                  collapseActivities(
                                                    sub.recentActivities
                                                  );
                                                return jsx("div", {
                                                  className: "agy-live-strip",
                                                  "aria-live": "polite",
                                                  children:
                                                    steps.length === 0
                                                      ? jsx("span", {
                                                          className:
                                                            "agy-step-pill agy-mono is-placeholder",
                                                          children: jsx(
                                                            "span",
                                                            {
                                                              className:
                                                                "agy-step-pill-label",
                                                              children:
                                                                t.liveWaiting,
                                                            }
                                                          ),
                                                        })
                                                      : steps.map((step, i) =>
                                                          jsxs(
                                                            "span",
                                                            {
                                                              className:
                                                                "agy-step-pill agy-mono" +
                                                                (i === 0
                                                                  ? " is-current"
                                                                  : ""),
                                                              title:
                                                                step.count > 1
                                                                  ? `${step.label} ×${step.count}`
                                                                  : step.label,
                                                              children: [
                                                                jsx("span", {
                                                                  className:
                                                                    "agy-step-pill-label",
                                                                  children:
                                                                    step.label,
                                                                }),
                                                                step.count > 1
                                                                  ? jsx("span", {
                                                                      className:
                                                                        "agy-step-pill-count",
                                                                      children: `×${step.count}`,
                                                                    })
                                                                  : null,
                                                              ],
                                                            },
                                                            `${i}:${step.label}`
                                                          )
                                                        ),
                                                });
                                              })()
                                            : null,

                                          sub.turns.length === 1
                                            ? renderTurnQA(
                                                sub.turns[0],
                                                true
                                              )
                                            : sub.turns.map((turn, idx) => {
                                                const isTurnOpen = Boolean(
                                                  openTurnIds[turn.id]
                                                );
                                                const cached =
                                                  turnDetails[turn.id];
                                                const turnOneLine =
                                                  summarizeQueryForOneLine(
                                                    cached?.query ||
                                                      turn.task ||
                                                      turn.id
                                                  ) || turn.id;
                                                const turnTime = formatTimeTag(
                                                  turn.finished_at ||
                                                    turn.started_at,
                                                  t
                                                );
                                                return jsxs(
                                                  "div",
                                                  {
                                                    className: "agy-turn-item",
                                                    children: [
                                                      jsxs("button", {
                                                        type: "button",
                                                        className:
                                                          "agy-turn-summary",
                                                        onClick: () =>
                                                          toggleTurnOpen(
                                                            turn.id
                                                          ),
                                                        children: [
                                                          jsx(
                                                            DisclosureChevron,
                                                            {
                                                              open: isTurnOpen,
                                                              size: "sm",
                                                            }
                                                          ),
                                                          jsx("span", {
                                                            className:
                                                              "agy-turn-pill",
                                                            children:
                                                              t.turnLabel(
                                                                idx + 1
                                                              ),
                                                          }),
                                                          jsx("span", {
                                                            className:
                                                              "agy-turn-preview",
                                                            children:
                                                              turnOneLine,
                                                          }),
                                                          turnTime
                                                            ? jsx("span", {
                                                                className:
                                                                  "agy-time-tag",
                                                                children:
                                                                  turnTime,
                                                              })
                                                            : null,
                                                        ],
                                                      }),
                                                      isTurnOpen
                                                        ? renderTurnQA(
                                                            turn,
                                                            false
                                                          )
                                                        : null,
                                                    ],
                                                  },
                                                  turn.id
                                                );
                                              }),

                                          // Footer Bar: Task ID (+ Archive) + Ask Progress (if running) or Continue Shortcut
                                          jsxs("div", {
                                            className: "agy-continue-bar",
                                            children: [
                                              jsxs("div", {
                                                className: "agy-footer-meta",
                                                children: [
                                                  jsx("span", {
                                                    className: "agy-mono",
                                                    style: {
                                                      fontSize: 10.5,
                                                      color: "var(--agy-muted)",
                                                    },
                                                    children: latest.id,
                                                  }),
                                                  archivedMap[sub.key]
                                                      ? jsx("button", {
                                                          type: "button",
                                                          className:
                                                            "agy-archive-btn",
                                                          onClick: (e) =>
                                                            handleUnarchiveSubagent(
                                                              sub,
                                                              e
                                                            ),
                                                          children:
                                                            t.unarchiveBtn,
                                                        })
                                                      : confirmArchiveKey ===
                                                        sub.key
                                                      ? jsxs("span", {
                                                          className:
                                                            "agy-archive-confirm-bar",
                                                          onClick: (e) =>
                                                            e.stopPropagation(),
                                                          children: [
                                                            jsx("span", {
                                                              children:
                                                                t.confirmArchivePrompt,
                                                            }),
                                                            jsx("button", {
                                                              type: "button",
                                                              className:
                                                                "agy-confirm-yes",
                                                              onClick: (e) =>
                                                                handleArchiveSubagent(
                                                                  sub,
                                                                  e
                                                                ),
                                                              children:
                                                                t.confirmYes,
                                                            }),
                                                            jsx("button", {
                                                              type: "button",
                                                              className:
                                                                "agy-confirm-no",
                                                              onClick:
                                                                handleCancelArchive,
                                                              children:
                                                                t.confirmNo,
                                                            }),
                                                          ],
                                                        })
                                                      : jsx("button", {
                                                          type: "button",
                                                          className:
                                                            "agy-archive-btn",
                                                          onClick: (e) =>
                                                            handleRequestArchive(
                                                              sub,
                                                              e
                                                            ),
                                                          children: t.archiveBtn,
                                                        }),
                                                ],
                                              }),
                                              jsxs("div", {
                                                style: {
                                                  display: "flex",
                                                  alignItems: "center",
                                                  gap: 8,
                                                },
                                                children: [
                                                  isRunning
                                                    ? jsxs(Fragment, {
                                                        children: [
                                                          jsx("button", {
                                                            type: "button",
                                                            className:
                                                              "agy-lang-btn",
                                                            style: {
                                                              width: "auto",
                                                              padding: "0 10px",
                                                              color:
                                                                "var(--agy-red)",
                                                            },
                                                            onClick: (e) =>
                                                              handleCancelJob(
                                                                sub,
                                                                e
                                                              ),
                                                            children:
                                                              t.cancelBtn,
                                                          }),
                                                          jsxs("button", {
                                                            type: "button",
                                                            className:
                                                              "agy-continue-btn",
                                                            "data-copied":
                                                              String(
                                                                askFooterCopied
                                                              ),
                                                            onClick: (e) =>
                                                              prefillInput(
                                                                askProgressDraft,
                                                                askKeyFooter,
                                                                e
                                                              ),
                                                            children:
                                                              askFooterCopied
                                                                ? [
                                                                    jsx(
                                                                      InlineCheckIcon,
                                                                      {
                                                                        size: 12,
                                                                      },
                                                                      "chk"
                                                                    ),
                                                                    jsx(
                                                                      "span",
                                                                      {
                                                                        children:
                                                                          t.insertedInline,
                                                                      },
                                                                      "lbl"
                                                                    ),
                                                                  ]
                                                                : [
                                                                    jsx(
                                                                      "span",
                                                                      {
                                                                        children:
                                                                          t.askProgressFull,
                                                                      },
                                                                      "lbl"
                                                                    ),
                                                                    jsx(
                                                                      "span",
                                                                      {
                                                                        children:
                                                                          "↗",
                                                                      },
                                                                      "arr"
                                                                    ),
                                                                  ],
                                                          }),
                                                        ],
                                                      })
                                                    : jsxs("button", {
                                                        type: "button",
                                                        className:
                                                          "agy-continue-btn",
                                                        "data-copied": String(
                                                          contFooterCopied
                                                        ),
                                                        onClick: (e) =>
                                                          prefillInput(
                                                            continueInputDraft,
                                                            contKeyFooter,
                                                            e
                                                          ),
                                                        children:
                                                          contFooterCopied
                                                            ? [
                                                                jsx(
                                                                  InlineCheckIcon,
                                                                  { size: 12 },
                                                                  "chk"
                                                                ),
                                                                jsx(
                                                                  "span",
                                                                  {
                                                                    children:
                                                                      t.insertedInline,
                                                                  },
                                                                  "lbl"
                                                                ),
                                                              ]
                                                            : [
                                                                jsx(
                                                                  "span",
                                                                  {
                                                                    children:
                                                                      t.continueBtn,
                                                                  },
                                                                  "lbl"
                                                                ),
                                                                jsx(
                                                                  "span",
                                                                  {
                                                                    children:
                                                                      "↗",
                                                                  },
                                                                  "arr"
                                                                ),
                                                              ],
                                                      }),
                                                ],
                                              }),
                                            ],
                                          }),
                                        ],
                                      })
                                    : null,
                                ],
                              },
                              sub.key
                            );
                          }),
                        }),
                  ],
                }),
              ],
            }),
          ],
        });
      }

      return function AgySidebarBody(props) {
        return jsx(AgyErrorBoundary, {
          children: jsx(AgySidebarBodyInner, { ...props }),
        });
      };
    }

    const inject = [
      "slots",
      "sidebarRightTabs",
      "sidebarRight",
      "remote",
      "remote.workspaceFiles",
      "remote.commands",
    ];

    function apply(ctx) {
      ensureStyles();
      const SidebarBody = createSidebarBody(ctx);
      const HeaderAction = createHeaderAction(ctx);

      ctx.effect(
        () =>
          ctx.sidebarRightTabs.register({
            id: TAB_ID,
            kind: TAB_KIND,
            priority: "extension",
            title: () => "agy staff",
            guide: [
              {
                id: "agy-staff",
                order: 25,
                title: () => "agy staff",
                description: () =>
                  "子代理协作 · Gemini 4 Carbon, Argon & 3.8 Flash",
                icon: GuideArtworkAgyStaff,
              },
            ],
          }),
        "agy-staff: sidebar tab type"
      );

      ctx.effect(
        () =>
          ctx.slots.inject("sidebar.right.pane.tab", () =>
            ctx.slots.register(
              {
                name: "sidebar.right.pane.tab",
                key: TAB_ID,
              },
              SidebarBody
            )
          ),
        "agy-staff: sidebar tab body"
      );

      ctx.effect(
        () =>
          ctx.slots.inject("sidebar.right.pane.tab.title", () =>
            ctx.slots.register(
              {
                name: "sidebar.right.pane.tab.title",
                key: TAB_ID,
              },
              AgyTabTitle
            )
          ),
        "agy-staff: sidebar tab title"
      );

      ctx.effect(
        () =>
          ctx.slots.inject("conversation.session.header.actions", () =>
            ctx.slots.register(
              {
                name: "conversation.session.header.actions",
                id: "agy-staff-header-action",
                order: 15,
              },
              HeaderAction
            )
          ),
        "agy-staff: session header button"
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
