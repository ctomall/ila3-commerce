import { resolveFormatLocale } from "./format-locale.js";
function formatCurrency(value, currency, locale) {
  if (value === null || value === void 0 || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return typeof value === "string" ? value : null;
  }
  const code = currency && currency.length === 3 ? currency.toUpperCase() : void 0;
  try {
    if (code) {
      return new Intl.NumberFormat(resolveFormatLocale(locale), { style: "currency", currency: code }).format(numeric);
    }
  } catch {
  }
  const formatted = new Intl.NumberFormat(resolveFormatLocale(locale)).format(numeric);
  return code ? `${formatted} ${code}` : formatted;
}
function formatDate(value, locale) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}
export {
  formatCurrency,
  formatDate
};
//# sourceMappingURL=format.js.map
