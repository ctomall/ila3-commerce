let activeLocale;
function setFormatLocale(locale) {
  const next = typeof locale === "string" && locale.trim().length ? locale.trim() : void 0;
  activeLocale = next;
}
function getFormatLocale() {
  return activeLocale;
}
function resolveFormatLocale(locale) {
  const explicit = typeof locale === "string" && locale.trim().length ? locale.trim() : void 0;
  return explicit ?? activeLocale;
}
function resetFormatLocale() {
  activeLocale = void 0;
}
export {
  getFormatLocale,
  resetFormatLocale,
  resolveFormatLocale,
  setFormatLocale
};
//# sourceMappingURL=format-locale.js.map
