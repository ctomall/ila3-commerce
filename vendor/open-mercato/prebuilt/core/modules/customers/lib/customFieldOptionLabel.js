function resolveCustomFieldOptionLabel(def, value) {
  const options = Array.isArray(def?.options) ? def?.options : [];
  for (const option of options) {
    if (option == null) continue;
    if (typeof option === "string") {
      if (option === value) return option;
      continue;
    }
    if (String(option.value ?? "") !== value) continue;
    const label = option.label ?? option.value;
    return typeof label === "string" && label.length > 0 ? label : value;
  }
  return null;
}
export {
  resolveCustomFieldOptionLabel
};
//# sourceMappingURL=customFieldOptionLabel.js.map
