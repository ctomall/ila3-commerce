"use client";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import * as React from "react";
import { useRouter } from "next/navigation";
import { flexRender } from "@tanstack/react-table";
import { useLegacyTable, getCoreRowModel, getSortedRowModel, getExpandedRowModel } from "@tanstack/react-table/legacy";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Loader2, SlidersHorizontal, MoreHorizontal, Circle, Filter, ChevronUp, ChevronDown, ChevronRight, ChevronsUpDown, Check, Inbox, Save } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../primitives/table.js";
import { Button } from "../primitives/button.js";
import { IconButton } from "../primitives/icon-button.js";
import { Checkbox } from "../primitives/checkbox.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../primitives/select.js";
import { Pagination } from "../primitives/pagination.js";
import { Spinner } from "../primitives/spinner.js";
import { EmptyState } from "../primitives/empty-state.js";
import { TooltipProvider } from "../primitives/tooltip.js";
import { TruncatedCell } from "./TruncatedCell.js";
import { FilterBar } from "./FilterBar.js";
import { FilteredEmptyResults } from "./filters/FilteredEmptyResults.js";
import { SearchEmptyResults } from "./filters/SearchEmptyResults.js";
import { useCustomFieldFilterDefs } from "./utils/customFieldFilters.js";
import { fetchCustomFieldDefinitionsPayload } from "./utils/customFieldDefs.js";
import { RowActions } from "./RowActions.js";
import { subscribeOrganizationScopeChanged } from "@open-mercato/shared/lib/frontend/organizationEvents";
import { InjectionSpot } from "./injection/InjectionSpot.js";
import { useAppEvent } from "./injection/useAppEvent.js";
import { useInjectionDataWidgets } from "./injection/useInjectionDataWidgets.js";
import { resolveInjectedIcon } from "./injection/resolveInjectedIcon.js";
import { serializeExport, defaultExportFilename } from "@open-mercato/shared/lib/crud/exporters";
import { apiCall, withScopedApiRequestHeaders } from "./utils/apiCall.js";
import { buildOptimisticLockHeader } from "./utils/optimisticLock.js";
import { useGuardedMutation } from "./injection/useGuardedMutation.js";
import { raiseCrudError } from "./utils/serverErrors.js";
import { computeMenuViewportShiftX } from "./utils/viewport.js";
import { PerspectiveSidebar } from "./PerspectiveSidebar.js";
import { Popover, PopoverTrigger, PopoverContent } from "../primitives/popover.js";
import { parseISO } from "date-fns/parseISO";
import { formatDisplayDateTime } from "../primitives/date-format.js";
import { cn } from "@open-mercato/shared/lib/utils";
import { readVersionedPreference, writeVersionedPreference, clearVersionedPreference } from "@open-mercato/shared/lib/browser/versionedPreference";
import { useT, useLocale } from "@open-mercato/shared/lib/i18n/context";
import { flash } from "./FlashMessages.js";
import { useConfirmDialog } from "./confirm-dialog/index.js";
import { surfaceRecordConflict } from "./conflicts/index.js";
import { ComponentReplacementHandles } from "@open-mercato/shared/modules/widgets/component-registry";
import { useRegisteredComponent } from "./injection/useRegisteredComponent.js";
import { dataTableExtensionSpotId, extensionSpotChildId } from "@open-mercato/shared/modules/widgets/extension-points";
import { insertByInjectionPlacement } from "@open-mercato/shared/modules/widgets/injection-position";
import { useVirtualizer } from "@tanstack/react-virtual";
import { getDefaultOperator, isAdvancedFilterState, flatToTree } from "@open-mercato/shared/lib/query/advanced-filter";
import {
  createEmptyTree,
  serializeTreeForPersist,
  deserializeTreeFromPersist,
  isPersistedFilterTree,
  treeToFlat
} from "@open-mercato/shared/lib/query/advanced-filter-tree";
import { treeReducer } from "./filters/treeReducer.js";
import { AdvancedFilterBuilder } from "./filters/AdvancedFilterBuilder.js";
import { useAutoDiscoveredFields } from "./utils/useAutoDiscoveredFields.js";
import { useCustomFieldDefs } from "./utils/customFieldDefs.js";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createLogger } from "@open-mercato/shared/lib/logger";
import { clearAllPerspectiveState, PERSPECTIVE_COOKIE_PREFIX, PERSPECTIVE_STORAGE_PREFIX } from "./perspectiveState.js";
import { diffPerspectiveSettings } from "./perspectiveDirty.js";
const logger = createLogger("ui").child({ component: "DataTable" });
let refreshScheduled = false;
function scheduleRouterRefresh(router) {
  if (refreshScheduled) return;
  refreshScheduled = true;
  if (typeof window === "undefined") {
    refreshScheduled = false;
    return;
  }
  window.requestAnimationFrame(() => {
    refreshScheduled = false;
    try {
      router.refresh();
    } catch {
    }
  });
}
const DEFAULT_ROW_CLICK_ACTION_IDS = ["edit", "open"];
function withDataTableNamespaces(mappedRow, sourceItem) {
  const namespaced = {};
  for (const [key, value] of Object.entries(sourceItem)) {
    if (!key.startsWith("_")) continue;
    namespaced[key] = value;
  }
  return {
    ...mappedRow,
    ...namespaced
  };
}
function resolveDataTableRowId(row, index) {
  if (row && typeof row === "object") {
    const candidate = row.id;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return String(index);
}
function resolveDefaultRowAction(items, preferredIds) {
  for (const preferredId of preferredIds) {
    const match = items.find((item) => item.id === preferredId && (item.href || item.onSelect));
    if (match) return match;
  }
  for (const preferredId of preferredIds) {
    const match = items.find((item) => item.label.toLowerCase() === preferredId && (item.href || item.onSelect));
    if (match) return match;
  }
  return null;
}
function pickDefaultRowAction(node, preferredIds) {
  if (!React.isValidElement(node)) return null;
  const items = node.props.items;
  if (!Array.isArray(items)) return null;
  return resolveDefaultRowAction(items, preferredIds);
}
const DEFAULT_EXPORT_FORMATS = ["csv", "json", "xml", "markdown"];
const EXPORT_LABELS = {
  csv: "CSV",
  json: "JSON",
  xml: "XML",
  markdown: "Markdown"
};
const EMPTY_FILTER_DEFS = [];
const EMPTY_FILTER_VALUES = Object.freeze({});
const EMPTY_VIEW_SETTINGS = Object.freeze({});
const STICKY_RIGHT_SHADOW_CLASS = "md:before:absolute md:before:inset-y-0 md:before:-left-2 md:before:w-2 md:before:bg-gradient-to-l md:before:from-foreground/8 md:before:to-transparent md:before:pointer-events-none";
const STICKY_LEFT_SHADOW_CLASS = "md:after:absolute md:after:inset-y-0 md:after:-right-2 md:after:w-2 md:after:bg-gradient-to-r md:after:from-foreground/8 md:after:to-transparent md:after:pointer-events-none";
function collectUniqueById(entries, warningScope) {
  const byId = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (!entry.id) continue;
    if (byId.has(entry.id)) {
      if (process.env.NODE_ENV !== "production") {
        logger.warn("Duplicate injected id detected; keeping the first entry", { scope: warningScope, id: entry.id });
      }
      continue;
    }
    byId.set(entry.id, entry);
  }
  return Array.from(byId.values());
}
const DEFAULT_VIEW_EXPORT_TITLE = "Export what you view";
const DEFAULT_FULL_EXPORT_TITLE = "Full data export";
function resolveExportSections(config, t) {
  if (!config) return [];
  const sections = [];
  const baseFormats = config.formats && config.formats.length > 0 ? config.formats : DEFAULT_EXPORT_FORMATS;
  const addSection = (key, section, fallbackTitle, fallbackFilenameBase) => {
    if (!section || !section.getUrl && !section.prepare) return;
    const explicitTitle = section.title?.trim().length ? section.title.trim() : null;
    const title = explicitTitle ?? fallbackTitle;
    const filenameBase = explicitTitle ?? fallbackFilenameBase;
    const seen = /* @__PURE__ */ new Set();
    const formatsSource = section.formats && section.formats.length > 0 ? section.formats : baseFormats;
    const formats = formatsSource.filter((format) => {
      if (seen.has(format)) return false;
      seen.add(format);
      return true;
    });
    if (formats.length === 0) return;
    sections.push({
      key,
      title,
      filenameBase,
      description: section.description,
      formats,
      getUrl: section.getUrl,
      prepare: section.prepare ? async (format) => {
        const result = await section.prepare(format);
        if (!result) return null;
        if ("prepared" in result) return result;
        return { prepared: result };
      } : void 0,
      filename: section.filename,
      disabled: Boolean(config.disabled || section.disabled)
    });
  };
  const hasExplicitSections = Array.isArray(config.sections) && config.sections.length > 0;
  const viewTitle = t("ui.dataTable.export.viewTitle", DEFAULT_VIEW_EXPORT_TITLE);
  if (!config.view && !config.full && !hasExplicitSections && config.getUrl) {
    addSection("view", { getUrl: config.getUrl, formats: config.formats }, viewTitle, DEFAULT_VIEW_EXPORT_TITLE);
  } else {
    addSection("view", config.view, viewTitle, DEFAULT_VIEW_EXPORT_TITLE);
  }
  if (hasExplicitSections) {
    config.sections.forEach((section, idx) => {
      const numberedTitle = t("ui.dataTable.export.sectionTitle", "Export {index}", { index: idx + 1 });
      addSection(`section-${idx}`, section, numberedTitle, `Export ${idx + 1}`);
    });
  }
  addSection("full", config.full, t("ui.dataTable.export.fullTitle", DEFAULT_FULL_EXPORT_TITLE), DEFAULT_FULL_EXPORT_TITLE);
  return sections;
}
const COLUMN_MIN_WIDTH = 60;
const COLUMN_MAX_WIDTH = 900;
function formatDurationLabel(durationMs) {
  if (durationMs == null) return "";
  if (!Number.isFinite(durationMs)) return "";
  if (durationMs < 0) return "";
  if (durationMs < 1e3) return `${Math.round(durationMs)}ms`;
  if (durationMs < 1e4) return `${(durationMs / 1e3).toFixed(1)}s`;
  if (durationMs < 6e4) return `${Math.round(durationMs / 1e3)}s`;
  if (durationMs < 36e5) return `${(durationMs / 6e4).toFixed(durationMs < 6e5 ? 1 : 0)}m`;
  return `${(durationMs / 36e5).toFixed(durationMs < 72e5 ? 1 : 0)}h`;
}
const PERSPECTIVE_SNAPSHOT_VERSION = 1;
function isStoredPerspectiveSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const settings = value.settings;
  return typeof settings === "object" && settings !== null;
}
function readPerspectiveCookie(tableId) {
  if (typeof document === "undefined") return null;
  const key = `${PERSPECTIVE_COOKIE_PREFIX}:${tableId}`;
  const pattern = new RegExp(`(?:^|;\\s*)${key}=([^;]+)`);
  const match = document.cookie.match(pattern);
  return match ? decodeURIComponent(match[1]) : null;
}
function writePerspectiveCookie(tableId, perspectiveId) {
  if (typeof document === "undefined") return;
  const key = `${PERSPECTIVE_COOKIE_PREFIX}:${tableId}`;
  const expires = perspectiveId ? "Max-Age=31536000" : "Max-Age=0";
  const value = perspectiveId ? encodeURIComponent(perspectiveId) : "";
  document.cookie = `${key}=${value}; Path=/; ${expires}; SameSite=Lax`;
}
function readPerspectiveSnapshot(tableId) {
  const parsed = readVersionedPreference(
    `${PERSPECTIVE_STORAGE_PREFIX}:${tableId}`,
    PERSPECTIVE_SNAPSHOT_VERSION,
    (value) => isStoredPerspectiveSnapshot(value),
    null,
    { legacyIsValid: (value) => isStoredPerspectiveSnapshot(value) }
  );
  if (!parsed) return null;
  const perspectiveId = typeof parsed.perspectiveId === "string" && parsed.perspectiveId.trim().length > 0 ? parsed.perspectiveId : null;
  const settings = parsed.settings;
  const updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now();
  return { perspectiveId, settings, updatedAt };
}
function writePerspectiveSnapshot(tableId, snapshot) {
  const key = `${PERSPECTIVE_STORAGE_PREFIX}:${tableId}`;
  if (!snapshot) {
    clearVersionedPreference(key);
    return;
  }
  writeVersionedPreference(key, PERSPECTIVE_SNAPSHOT_VERSION, snapshot);
}
function sanitizePerspectiveSettings(source) {
  if (!source || typeof source !== "object") return null;
  const forbidden = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
  const result = {};
  if (Array.isArray(source.columnOrder)) {
    const seen = /* @__PURE__ */ new Set();
    const order = source.columnOrder.map((id) => typeof id === "string" ? id.trim() : "").filter((id) => id.length > 0 && !seen.has(id) && (seen.add(id), true));
    if (order.length) result.columnOrder = order;
  }
  if (source.columnVisibility && typeof source.columnVisibility === "object") {
    const entries = Object.entries(source.columnVisibility).filter(([key, value]) => typeof key === "string" && key.trim().length > 0 && !forbidden.has(key) && typeof value === "boolean");
    if (entries.length) {
      const visibility = {};
      entries.forEach(([key, value]) => {
        visibility[key] = value;
      });
      result.columnVisibility = visibility;
    }
  }
  if (source.columnSizing && typeof source.columnSizing === "object") {
    const sizing = {};
    for (const [key, value] of Object.entries(source.columnSizing)) {
      const id = typeof key === "string" ? key.trim() : "";
      if (!id || forbidden.has(id)) continue;
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      sizing[id] = Math.max(COLUMN_MIN_WIDTH, Math.min(COLUMN_MAX_WIDTH, Math.round(value)));
    }
    if (Object.keys(sizing).length) result.columnSizing = sizing;
  }
  if (Array.isArray(source.sorting)) {
    const sorting = source.sorting.map((item) => {
      const id = typeof item?.id === "string" ? item.id.trim() : "";
      if (!id || forbidden.has(id)) return null;
      return { id, desc: Boolean(item?.desc) };
    }).filter((item) => item !== null);
    if (sorting.length) result.sorting = sorting;
  }
  if (typeof source.pageSize === "number" && Number.isFinite(source.pageSize)) {
    const pageSize = Math.max(1, Math.min(500, Math.floor(source.pageSize)));
    result.pageSize = pageSize;
  }
  if (typeof source.searchValue === "string" && source.searchValue.trim().length > 0) {
    result.searchValue = source.searchValue.trim().slice(0, 200);
  }
  if (source.filters && typeof source.filters === "object") {
    const filters = {};
    for (const [key, value] of Object.entries(source.filters)) {
      if (typeof key === "string") {
        const trimmed = key.trim();
        if (trimmed.length > 0 && !forbidden.has(trimmed)) filters[trimmed] = value;
      }
    }
    if (Object.keys(filters).length) result.filters = filters;
  }
  return Object.keys(result).length ? result : null;
}
function normalizeLabel(input) {
  if (!input) return "";
  return input.replace(/^cf[_:]/, "").replace(/[_:\-]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}
function getColumnTruncateConfig(columnId, accessorKey, columnMeta) {
  const key = accessorKey || columnId;
  const metaMaxWidth = typeof columnMeta?.maxWidth === "string" ? columnMeta.maxWidth.trim() : "";
  if (key.startsWith("cf_") || key.startsWith("cf:")) {
    return {
      maxWidth: metaMaxWidth || "120px",
      truncate: typeof columnMeta?.truncate === "boolean" ? columnMeta.truncate : true
    };
  }
  const wideColumns = ["title", "name", "description", "source", "companies", "people"];
  if (wideColumns.includes(key)) {
    return {
      maxWidth: metaMaxWidth || "250px",
      truncate: typeof columnMeta?.truncate === "boolean" ? columnMeta.truncate : true
    };
  }
  const mediumColumns = ["status", "pipelineStage", "pipeline_stage", "type", "category"];
  if (mediumColumns.includes(key)) {
    return {
      maxWidth: metaMaxWidth || "180px",
      truncate: typeof columnMeta?.truncate === "boolean" ? columnMeta.truncate : true
    };
  }
  if (key.endsWith("_at") || key.endsWith("At") || key.includes("date") || key.includes("Date")) {
    return {
      maxWidth: metaMaxWidth || "120px",
      truncate: typeof columnMeta?.truncate === "boolean" ? columnMeta.truncate : true
    };
  }
  return {
    maxWidth: metaMaxWidth || "150px",
    truncate: typeof columnMeta?.truncate === "boolean" ? columnMeta.truncate : true
  };
}
function readInjectedColumnValue(row, accessorKey) {
  if (!row || typeof row !== "object" || !accessorKey) return void 0;
  const segments = accessorKey.split(".").filter((segment) => segment.length > 0);
  if (segments.length === 0) return void 0;
  let current = row;
  for (const segment of segments) {
    if (!current || typeof current !== "object") return void 0;
    current = current[segment];
  }
  return current;
}
function shouldSkipTruncation(columnId) {
  const skipColumns = ["actions", "select", "checkbox", "expand"];
  return skipColumns.includes(columnId.toLowerCase());
}
function ExportMenu({ config, sections }) {
  const t = useT();
  const { label } = config;
  const defaultLabel = label ?? t("ui.dataTable.export.label", "Export");
  const disabled = Boolean(config.disabled);
  const hasSections = sections.length > 0;
  const [open, setOpen] = React.useState(false);
  const [menuOffsetX, setMenuOffsetX] = React.useState(0);
  const buttonRef = React.useRef(null);
  const menuRef = React.useRef(null);
  React.useLayoutEffect(() => {
    if (!open) {
      setMenuOffsetX(0);
      return;
    }
    const measure = () => {
      const el = menuRef.current;
      if (!el || typeof window === "undefined") return;
      const previousTransform = el.style.transform;
      el.style.transform = "none";
      const rect = el.getBoundingClientRect();
      el.style.transform = previousTransform;
      setMenuOffsetX(computeMenuViewportShiftX(rect, window.innerWidth));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);
  React.useEffect(() => {
    if (!open || !hasSections) return;
    const onDocClick = (event) => {
      const target = event.target;
      if (menuRef.current && !menuRef.current.contains(target) && buttonRef.current && !buttonRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [hasSections, open]);
  if (!hasSections) return null;
  const handleSelect = async (section, format) => {
    try {
      if (section.prepare) {
        const preparedResult = await section.prepare(format);
        if (!preparedResult) return;
        const prepared = preparedResult.prepared;
        const serialized = serializeExport(prepared, format);
        const filename = preparedResult.filename ?? section.filename?.(format) ?? config.filename?.(format) ?? defaultExportFilename(section.filenameBase, format);
        if (typeof window !== "undefined") {
          const blob = new Blob([serialized.body], { type: serialized.contentType });
          const href = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = href;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(href);
        }
      } else if (section.getUrl) {
        const url = section.getUrl(format);
        if (url && typeof window !== "undefined") {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      }
    } catch {
    } finally {
      setOpen(false);
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "relative inline-block", children: [
    /* @__PURE__ */ jsx(
      Button,
      {
        ref: buttonRef,
        variant: "outline",
        type: "button",
        onClick: () => {
          if (disabled) return;
          setOpen((prev) => !prev);
        },
        "aria-haspopup": "menu",
        "aria-expanded": open,
        disabled,
        children: defaultLabel
      }
    ),
    open ? /* @__PURE__ */ jsx(
      "div",
      {
        ref: menuRef,
        role: "menu",
        className: "absolute right-0 mt-2 w-60 max-w-[calc(100vw-1rem)] rounded-md border bg-background py-2 shadow z-dropdown",
        style: menuOffsetX ? { transform: `translateX(${menuOffsetX}px)` } : void 0,
        children: sections.map((section, idx) => /* @__PURE__ */ jsxs("div", { className: idx > 0 ? "mt-2 border-t pt-3" : "", children: [
          /* @__PURE__ */ jsxs("div", { className: "px-3", children: [
            /* @__PURE__ */ jsx("div", { className: "text-xs font-semibold uppercase text-muted-foreground", children: section.title }),
            section.description ? /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-muted-foreground leading-snug", children: section.description }) : null
          ] }),
          /* @__PURE__ */ jsx("div", { className: "mt-2 space-y-1 px-2 pb-1", children: section.formats.map((format) => /* @__PURE__ */ jsx(
            Button,
            {
              type: "button",
              variant: "ghost",
              size: "sm",
              className: "w-full justify-start font-normal",
              onClick: () => void handleSelect(section, format),
              disabled: section.disabled,
              children: EXPORT_LABELS[format]
            },
            `${section.key}-${format}`
          )) })
        ] }, section.key))
      }
    ) : null
  ] });
}
function sanitizeDndContextId(value) {
  const trimmed = value.trim().toLowerCase();
  let normalized = "";
  let previousWasDash = false;
  for (const character of trimmed) {
    const isLowercaseLetter = character >= "a" && character <= "z";
    const isDigit = character >= "0" && character <= "9";
    if (isLowercaseLetter || isDigit || character === "_") {
      normalized += character;
      previousWasDash = false;
      continue;
    }
    if (!previousWasDash) {
      normalized += "-";
      previousWasDash = true;
    }
  }
  while (normalized.startsWith("-")) {
    normalized = normalized.slice(1);
  }
  while (normalized.endsWith("-")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized.length > 0 ? normalized : "data-table";
}
function HeaderDndWrapper({ enabled, contextId, sensors, columnIds, onDragEnd, children }) {
  if (!enabled) return /* @__PURE__ */ jsx(Fragment, { children });
  return /* @__PURE__ */ jsx(DndContext, { id: contextId, sensors, collisionDetection: closestCenter, onDragEnd, children: /* @__PURE__ */ jsx(SortableContext, { items: columnIds, strategy: horizontalListSortingStrategy, children }) });
}
function ColumnResizeHandle({
  columnId,
  onResize,
  onCommit,
  onReset,
  ariaLabel
}) {
  const [active, setActive] = React.useState(false);
  const dragCleanupRef = React.useRef(null);
  React.useEffect(() => () => {
    dragCleanupRef.current?.();
  }, []);
  const handlePointerDown = React.useCallback((event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const headerCell = event.currentTarget.parentElement;
    if (!headerCell) return;
    const startX = event.clientX;
    const startWidth = headerCell.getBoundingClientRect().width;
    setActive(true);
    let frame = 0;
    let latest = startWidth;
    const onMove = (moveEvent) => {
      latest = Math.max(COLUMN_MIN_WIDTH, Math.min(COLUMN_MAX_WIDTH, Math.round(startWidth + (moveEvent.clientX - startX))));
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        onResize(columnId, latest);
      });
    };
    const teardown = () => {
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      dragCleanupRef.current = null;
    };
    const onUp = () => {
      onResize(columnId, latest);
      teardown();
      setActive(false);
      onCommit();
    };
    dragCleanupRef.current = teardown;
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [columnId, onResize, onCommit]);
  return /* @__PURE__ */ jsx(
    "div",
    {
      role: "separator",
      "aria-orientation": "vertical",
      "aria-label": ariaLabel,
      title: ariaLabel,
      onPointerDown: handlePointerDown,
      onClick: (event) => event.stopPropagation(),
      onDoubleClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        onReset(columnId);
      },
      className: "group/resize absolute right-0 top-0 z-10 flex h-full w-3 translate-x-1/2 cursor-col-resize touch-none select-none items-center justify-center",
      children: /* @__PURE__ */ jsx(
        "span",
        {
          "aria-hidden": true,
          className: cn(
            "w-0.5 rounded-full transition-all",
            active ? "h-full bg-primary" : "h-3.5 bg-border group-hover:h-full group-hover:bg-border group-hover/resize:h-full group-hover/resize:bg-primary"
          )
        }
      )
    }
  );
}
function ariaSortFor(state) {
  if (state === "asc") return "ascending";
  if (state === "desc") return "descending";
  return "none";
}
function SortableHeaderCell({ id, children, className, width, ariaSort }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const isSticky = typeof className === "string" && className.includes("sticky");
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: "grab",
    position: isSticky ? "sticky" : "relative",
    ...typeof width === "number" ? { width, minWidth: width, maxWidth: width } : {}
  };
  return /* @__PURE__ */ jsx(TableHead, { ref: setNodeRef, style, className, "aria-sort": ariaSort, ...attributes, ...listeners, children });
}
function ViewSwitcherDropdown({
  activePerspectiveId,
  perspectives,
  rolePerspectives,
  onClear,
  onActivate,
  onOpenSidebar,
  t
}) {
  const [open, setOpen] = React.useState(false);
  const allViews = [...perspectives, ...rolePerspectives];
  const activeName = allViews.find((v) => v.id === activePerspectiveId)?.name.trim() || "";
  const activeLabel = activeName || t("ui.dataTable.perspectives.allViews", "All views");
  return /* @__PURE__ */ jsxs("div", { className: "inline-flex h-9 items-center rounded-md border border-input text-sm", children: [
    /* @__PURE__ */ jsxs(
      Button,
      {
        "data-testid": "data-table-open-views-sidebar",
        type: "button",
        variant: "ghost",
        size: "sm",
        onClick: onOpenSidebar,
        className: "h-full rounded-none rounded-l-md px-3 font-medium",
        children: [
          /* @__PURE__ */ jsx(SlidersHorizontal, { className: "size-4 mr-1.5" }),
          t("ui.dataTable.perspectives.button", "Views")
        ]
      }
    ),
    /* @__PURE__ */ jsx("div", { className: "h-5 w-px bg-border" }),
    /* @__PURE__ */ jsxs(Popover, { open, onOpenChange: setOpen, children: [
      /* @__PURE__ */ jsx(PopoverTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(
        Button,
        {
          type: "button",
          variant: "ghost",
          size: "sm",
          className: "h-full max-w-[200px] rounded-none rounded-r-md px-3 font-normal text-muted-foreground",
          children: [
            /* @__PURE__ */ jsx("span", { className: "truncate", children: activeLabel }),
            /* @__PURE__ */ jsx(ChevronDown, { className: "size-3.5 shrink-0 ml-1.5" })
          ]
        }
      ) }),
      /* @__PURE__ */ jsxs(PopoverContent, { align: "start", className: "w-[220px] p-1", children: [
        /* @__PURE__ */ jsxs(
          Button,
          {
            type: "button",
            variant: "ghost",
            size: "sm",
            className: cn(
              "w-full justify-start h-auto px-2 py-1.5 text-sm font-normal",
              !activePerspectiveId && "bg-accent text-accent-foreground"
            ),
            onClick: () => {
              onClear();
              setOpen(false);
            },
            children: [
              /* @__PURE__ */ jsx(Check, { className: cn("size-4 shrink-0 mr-2", activePerspectiveId ? "invisible" : "") }),
              t("ui.dataTable.perspectives.noView", "\u2014 No view \u2014")
            ]
          }
        ),
        perspectives.map((p) => /* @__PURE__ */ jsxs(
          Button,
          {
            type: "button",
            variant: "ghost",
            size: "sm",
            className: cn(
              "w-full justify-start h-auto px-2 py-1.5 text-sm font-normal",
              activePerspectiveId === p.id && "bg-accent text-accent-foreground"
            ),
            onClick: () => {
              onActivate(p, "personal");
              setOpen(false);
            },
            children: [
              /* @__PURE__ */ jsx(Check, { className: cn("size-4 shrink-0 mr-2", activePerspectiveId !== p.id ? "invisible" : "") }),
              /* @__PURE__ */ jsx("span", { className: "truncate", children: p.name.trim() || t("ui.perspectives.untitled", "Untitled view") })
            ]
          },
          p.id
        )),
        rolePerspectives.map((p) => /* @__PURE__ */ jsxs(
          Button,
          {
            type: "button",
            variant: "ghost",
            size: "sm",
            className: cn(
              "w-full justify-start h-auto px-2 py-1.5 text-sm font-normal",
              activePerspectiveId === p.id && "bg-accent text-accent-foreground"
            ),
            onClick: () => {
              onActivate(p, "role");
              setOpen(false);
            },
            children: [
              /* @__PURE__ */ jsx(Check, { className: cn("size-4 shrink-0 mr-2", activePerspectiveId !== p.id ? "invisible" : "") }),
              /* @__PURE__ */ jsx("span", { className: "truncate", children: p.name.trim() || t("ui.perspectives.untitled", "Untitled view") })
            ]
          },
          p.id
        ))
      ] })
    ] })
  ] });
}
function DataTableImpl({
  columns,
  data,
  toolbar,
  title,
  titleHeadingLevel,
  actions,
  refreshButton,
  sortable,
  manualSorting,
  sorting: sortingProp,
  onSortingChange,
  pagination,
  showQueryTime = true,
  isLoading,
  emptyState,
  error,
  rowActions,
  onRowClick,
  rowClickActionIds,
  disableRowClick = false,
  bulkActions: bulkActionsProp,
  selectionScopeKey,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchAlign = "left",
  filters: baseFilters = EMPTY_FILTER_DEFS,
  filterValues = EMPTY_FILTER_VALUES,
  onFiltersApply,
  onFiltersClear,
  entityId,
  entityIds,
  exporter,
  perspective,
  onColumnsDirtyChange,
  viewApiRef,
  showSaveViewButton = false,
  embedded = false,
  onCustomFieldFilterFieldsetChange,
  customFieldFilterKeyExtras,
  injectionSpotId,
  injectionContext,
  replacementHandle,
  extensionTableId: extensionTableIdProp,
  stickyFirstColumn = false,
  stickyActionsColumn = false,
  actionsColumnAlign = "right",
  virtualized = false,
  virtualizedMaxHeight,
  virtualizedOverscan = 10,
  advancedFilter: advancedFilterInput,
  columnChooser,
  activeFilterChips,
  filterAwareEmptyState,
  getSubRows,
  expandable,
  expanded: expandedProp,
  onExpandedChange
}) {
  const t = useT();
  const { confirm, ConfirmDialogElement } = useConfirmDialog();
  const router = useRouter();
  const resolvedRowClickActionIds = rowClickActionIds ?? DEFAULT_ROW_CLICK_ACTION_IDS;
  const containerRef = React.useRef(null);
  const lastScopeRef = React.useRef(null);
  const hasInitializedScopeRef = React.useRef(false);
  const legacyAdvancedFilterWarnedRef = React.useRef(false);
  const advancedFilter = React.useMemo(() => {
    if (!advancedFilterInput) return void 0;
    if (!isAdvancedFilterState(advancedFilterInput.value)) {
      return advancedFilterInput;
    }
    if (!legacyAdvancedFilterWarnedRef.current && process.env.NODE_ENV !== "production") {
      legacyAdvancedFilterWarnedRef.current = true;
      logger.warn("advancedFilter.value was passed as the legacy AdvancedFilterState shape. This bridge will be removed in the next minor version \u2014 migrate to the tree shape (AdvancedFilterTree, see @open-mercato/shared/lib/query/advanced-filter-tree).");
    }
    const legacy = advancedFilterInput;
    return {
      fields: legacy.fields,
      auto: legacy.auto,
      value: flatToTree(legacy.value),
      onChange: (next) => legacy.onChange(treeToFlat(next)),
      onApply: legacy.onApply,
      onClear: legacy.onClear
    };
  }, [advancedFilterInput]);
  React.useEffect(() => {
    return subscribeOrganizationScopeChanged((detail) => {
      const prev = lastScopeRef.current;
      lastScopeRef.current = detail;
      if (!hasInitializedScopeRef.current) {
        hasInitializedScopeRef.current = true;
        return;
      }
      if (prev && prev.organizationId === detail.organizationId && prev.tenantId === detail.tenantId) {
        return;
      }
      scheduleRouterRefresh(router);
    });
  }, [router]);
  const queryClient = useQueryClient();
  const perspectiveConfig = perspective ?? null;
  const perspectiveTableId = perspectiveConfig?.tableId ?? null;
  const perspectiveAlign = perspectiveConfig?.align ?? "left";
  const perspectiveEnabled = Boolean(perspectiveTableId);
  const initialSnapshotRef = React.useRef(null);
  const snapshotHydratedTableRef = React.useRef(null);
  const serverReconciledTableRef = React.useRef(null);
  const hydratedSnapshotRef = React.useRef(null);
  const hydratedAdvancedFilterRestoredRef = React.useRef(false);
  const pendingPerspectiveFiltersRef = React.useRef(null);
  React.useLayoutEffect(() => {
    pendingPerspectiveFiltersRef.current = null;
  }, [advancedFilter?.value, perspectiveTableId]);
  const initialSettingsSource = perspectiveConfig?.initialState?.initialSettings ?? null;
  const mergedInitialSettings = React.useMemo(
    () => sanitizePerspectiveSettings(initialSettingsSource),
    [initialSettingsSource]
  );
  const initialActiveId = perspectiveConfig?.initialState?.activePerspectiveId ?? null;
  const [isPerspectiveOpen, setPerspectiveOpen] = React.useState(false);
  const [isAdvancedFilterOpen, setAdvancedFilterOpen] = React.useState(false);
  const [activePerspectiveId, setActivePerspectiveId] = React.useState(initialActiveId);
  const [columnVisibility, setColumnVisibility] = React.useState(() => mergedInitialSettings?.columnVisibility ?? {});
  const [columnOrder, setColumnOrder] = React.useState(() => mergedInitialSettings?.columnOrder ?? []);
  const [columnSizing, setColumnSizing] = React.useState(() => mergedInitialSettings?.columnSizing ?? {});
  const columnSizingRef = React.useRef(columnSizing);
  React.useEffect(() => {
    columnSizingRef.current = columnSizing;
  }, [columnSizing]);
  const [deletingIds, setDeletingIds] = React.useState([]);
  const [roleClearingIds, setRoleClearingIds] = React.useState([]);
  const [perspectiveApiMissing, setPerspectiveApiMissing] = React.useState(false);
  const [viewBaseline, setViewBaselineState] = React.useState(() => mergedInitialSettings ?? {});
  const viewBaselineInitializedRef = React.useRef(Boolean(mergedInitialSettings));
  const autoHiddenVisibilityRef = React.useRef({});
  const setViewBaseline = React.useCallback((settings) => {
    const initialized = viewBaselineInitializedRef.current;
    viewBaselineInitializedRef.current = true;
    const autoHidden = autoHiddenVisibilityRef.current;
    const next = Object.keys(autoHidden).length ? { ...settings, columnVisibility: { ...settings.columnVisibility ?? {}, ...autoHidden } } : settings;
    setViewBaselineState((previous) => initialized && diffPerspectiveSettings(previous, next).length === 0 ? previous : next);
  }, []);
  const foldAutoHiddenIntoBaseline = React.useCallback((entries) => {
    autoHiddenVisibilityRef.current = { ...autoHiddenVisibilityRef.current, ...entries };
    if (!viewBaselineInitializedRef.current) return;
    setViewBaselineState((previous) => {
      const current = previous.columnVisibility ?? {};
      if (Object.keys(entries).every((key) => key in current)) return previous;
      return { ...previous, columnVisibility: { ...entries, ...current } };
    });
  }, []);
  const perspectiveFeatureQuery = useQuery({
    queryKey: ["feature-check", "perspectives"],
    enabled: perspectiveEnabled,
    staleTime: 5 * 60 * 1e3,
    queryFn: async () => {
      try {
        const call = await apiCall(
          "/api/auth/feature-check",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ features: ["perspectives.use", "perspectives.role_defaults"] })
          }
        );
        if (!call.ok) throw new Error(`feature-check failed (${call.status})`);
        const data2 = call.result ?? {};
        const granted = Array.isArray(data2?.granted) ? data2.granted.map((f) => String(f)) : [];
        const has = (feature) => granted.some((grantedFeature) => {
          if (grantedFeature === "*") return true;
          if (grantedFeature === feature) return true;
          if (grantedFeature.endsWith(".*")) {
            const prefix = grantedFeature.slice(0, -2);
            return feature === prefix || feature.startsWith(`${prefix}.`);
          }
          return false;
        });
        return {
          use: has("perspectives.use"),
          roleDefaults: has("perspectives.role_defaults")
        };
      } catch {
        return {
          use: true,
          roleDefaults: true
        };
      }
    }
  });
  const perspectivePermissions = perspectiveFeatureQuery.data;
  const canUsePerspectives = perspectiveEnabled && Boolean(perspectivePermissions?.use);
  const canUseRoleDefaultsFeature = Boolean(perspectivePermissions?.roleDefaults);
  React.useEffect(() => {
    if (!canUsePerspectives && isPerspectiveOpen) {
      setPerspectiveOpen(false);
    }
  }, [canUsePerspectives, isPerspectiveOpen]);
  const initialSettingsSeededTableRef = React.useRef(null);
  React.useEffect(() => {
    if (!perspectiveTableId) return;
    if (!mergedInitialSettings) return;
    if (initialSettingsSeededTableRef.current === perspectiveTableId) return;
    initialSettingsSeededTableRef.current = perspectiveTableId;
    const snapshot = {
      perspectiveId: initialActiveId,
      settings: mergedInitialSettings,
      updatedAt: Date.now()
    };
    writePerspectiveSnapshot(perspectiveTableId, snapshot);
    initialSnapshotRef.current = snapshot;
    setViewBaseline(mergedInitialSettings);
  }, [perspectiveTableId, mergedInitialSettings, initialActiveId, setViewBaseline]);
  const perspectiveQuery = useQuery({
    queryKey: ["table-perspectives", perspectiveTableId],
    queryFn: async () => {
      if (!perspectiveTableId) throw new Error("Missing table id");
      const call = await apiCall(`/api/perspectives/${encodeURIComponent(perspectiveTableId)}`);
      if (call.status === 404) {
        setPerspectiveApiMissing(true);
        return {
          tableId: perspectiveTableId,
          perspectives: [],
          defaultPerspectiveId: null,
          rolePerspectives: [],
          manageableRolePerspectives: [],
          roles: [],
          canApplyToRoles: false
        };
      }
      if (!call.ok) {
        await raiseCrudError(call.response, t("ui.dataTable.perspectives.error.load", "Failed to load perspectives"));
      }
      setPerspectiveApiMissing(false);
      const payload = call.result;
      if (!payload) throw new Error(t("ui.dataTable.perspectives.error.load", "Failed to load perspectives"));
      return payload;
    },
    enabled: canUsePerspectives,
    initialData: perspectiveConfig?.initialState?.response,
    staleTime: 5 * 60 * 1e3,
    gcTime: 10 * 60 * 1e3
  });
  const perspectiveData = perspectiveQuery.data;
  const initialPerspectiveAppliedRef = React.useRef(Boolean(mergedInitialSettings));
  const extensionTableId = React.useMemo(() => {
    if (perspective?.tableId) return perspective.tableId;
    if (extensionTableIdProp) return extensionTableIdProp;
    if (injectionSpotId?.startsWith("data-table:")) return injectionSpotId.slice("data-table:".length);
    return null;
  }, [injectionSpotId, perspective?.tableId, extensionTableIdProp]);
  const resolvedInjectionSpotId = injectionSpotId ?? (perspective?.tableId ? dataTableExtensionSpotId(perspective.tableId) : null) ?? (extensionTableIdProp ? dataTableExtensionSpotId(extensionTableIdProp) : null);
  const resolvedReplacementHandle = replacementHandle ?? ComponentReplacementHandles.dataTable(extensionTableId ?? "unknown");
  const baseInjectionContext = React.useMemo(
    () => {
      if (injectionContext) return injectionContext;
      const resolvedTableId = extensionTableId ?? perspective?.tableId ?? null;
      const baseTitle = typeof title === "string" ? title : void 0;
      return { tableId: resolvedTableId, title: baseTitle };
    },
    [injectionContext, perspective?.tableId, extensionTableId, title]
  );
  const headerInjectionSpotId = React.useMemo(
    () => resolvedInjectionSpotId ? extensionSpotChildId(resolvedInjectionSpotId, "header") : null,
    [resolvedInjectionSpotId]
  );
  const toolbarInjectionSpotId = React.useMemo(
    () => resolvedInjectionSpotId ? extensionSpotChildId(resolvedInjectionSpotId, "toolbar") : null,
    [resolvedInjectionSpotId]
  );
  const searchTrailingInjectionSpotId = React.useMemo(
    () => resolvedInjectionSpotId ? extensionSpotChildId(resolvedInjectionSpotId, "search-trailing") : null,
    [resolvedInjectionSpotId]
  );
  const footerInjectionSpotId = React.useMemo(
    () => resolvedInjectionSpotId ? extensionSpotChildId(resolvedInjectionSpotId, "footer") : null,
    [resolvedInjectionSpotId]
  );
  const { widgets: columnWidgets } = useInjectionDataWidgets(
    extensionTableId ? dataTableExtensionSpotId(extensionTableId, "columns") : "__disabled__:columns"
  );
  const { widgets: rowActionWidgets } = useInjectionDataWidgets(
    extensionTableId ? dataTableExtensionSpotId(extensionTableId, "row-actions") : "__disabled__:row-actions"
  );
  const { widgets: bulkActionWidgets } = useInjectionDataWidgets(
    extensionTableId ? dataTableExtensionSpotId(extensionTableId, "bulk-actions") : "__disabled__:bulk-actions"
  );
  const { widgets: filterWidgets } = useInjectionDataWidgets(
    extensionTableId ? dataTableExtensionSpotId(extensionTableId, "filters") : "__disabled__:filters"
  );
  const injectedColumnDefs = React.useMemo(() => {
    const entries = [];
    for (const widget of columnWidgets) {
      if (!("columns" in widget)) continue;
      for (const definition of widget.columns ?? []) {
        entries.push(definition);
      }
    }
    return collectUniqueById(entries, "column").map((definition) => ({
      def: {
        id: definition.id,
        accessorFn: (row) => readInjectedColumnValue(row, definition.accessorKey),
        header: t(definition.header, definition.header),
        cell: definition.cell,
        size: definition.size,
        enableSorting: definition.sortable === true
      },
      placement: definition.placement
    }));
  }, [columnWidgets, t]);
  const injectedRowActions = React.useMemo(() => {
    const entries = [];
    for (const widget of rowActionWidgets) {
      if (!("rowActions" in widget)) continue;
      for (const definition of widget.rowActions ?? []) {
        entries.push(definition);
      }
    }
    return collectUniqueById(entries, "row action");
  }, [rowActionWidgets]);
  const injectedBulkActions = React.useMemo(() => {
    const entries = [];
    for (const widget of bulkActionWidgets) {
      if (!("bulkActions" in widget)) continue;
      for (const definition of widget.bulkActions ?? []) {
        entries.push(definition);
      }
    }
    return collectUniqueById(entries, "bulk action");
  }, [bulkActionWidgets]);
  const { serverFilters: injectedFilters, clientFilters: injectedClientFilters } = React.useMemo(() => {
    const byId = /* @__PURE__ */ new Map();
    const clientEntries = [];
    for (const widget of filterWidgets) {
      if (!("filters" in widget)) continue;
      for (const definition of widget.filters ?? []) {
        const filter = definition;
        const mappedType = filter.type === "date-range" ? "dateRange" : filter.type === "boolean" ? "checkbox" : filter.type === "select" ? "select" : "text";
        const id = filter.queryParam ?? filter.id;
        if (filter.strategy === "client" && filter.filterFn) {
          clientEntries.push({ id, filterFn: filter.filterFn });
        }
        if (!byId.has(id)) {
          const translatedOptions = Array.isArray(filter.options) ? filter.options.map((option) => ({
            ...option,
            label: t(option.label, option.label)
          })) : filter.options;
          byId.set(id, {
            id,
            label: t(filter.label, filter.label),
            type: mappedType,
            options: translatedOptions
          });
        }
      }
    }
    return { serverFilters: Array.from(byId.values()), clientFilters: clientEntries };
  }, [filterWidgets, t]);
  const mergedColumns = React.useMemo(() => {
    if (!injectedColumnDefs.length) return columns;
    let result = [...columns];
    for (const { def, placement } of injectedColumnDefs) {
      result = insertByInjectionPlacement(
        result,
        def,
        placement,
        (col) => col.id ?? ""
      );
    }
    return result;
  }, [columns, injectedColumnDefs]);
  const resolvedRowActions = React.useCallback((row) => {
    const injectedItems = injectedRowActions.map((action) => ({
      id: action.id,
      label: t(action.label, action.label),
      onSelect: () => action.onSelect(row, { navigate: (href) => router.push(href) }),
      placement: action.placement
    }));
    const baseNode = rowActions ? rowActions(row) : null;
    if (!injectedItems.length) return baseNode;
    if (React.isValidElement(baseNode)) {
      const baseItems = baseNode.props.items;
      if (Array.isArray(baseItems)) {
        let merged = [...baseItems];
        const existingIds = new Set(
          baseItems.map((item) => item.id).filter((id) => typeof id === "string" && id.length > 0)
        );
        for (const item of injectedItems) {
          if (item.id && existingIds.has(item.id)) continue;
          merged = insertByInjectionPlacement(
            merged,
            item,
            item.placement,
            (entry) => entry.id ?? ""
          );
        }
        return /* @__PURE__ */ jsx(RowActions, { items: merged });
      }
    }
    return /* @__PURE__ */ jsx(RowActions, { items: injectedItems });
  }, [injectedRowActions, rowActions, router, t]);
  const dateLocale = useLocale();
  const tryParseDate = (v) => {
    if (v == null) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v === "number") {
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof v === "string") {
      const s = v.trim();
      if (!s) return null;
      if (/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(s)) {
        const d2 = parseISO(s);
        return isNaN(d2.getTime()) ? null : d2;
      }
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  };
  const [dateColumnIds, setDateColumnIds] = React.useState(null);
  React.useEffect(() => {
    if (dateColumnIds) return;
    if (!data || data.length === 0) return;
    const accessors = mergedColumns.map((c) => {
      const key = c.accessorKey;
      const id = c.id;
      return { id: id || key || "", key };
    });
    const guessed = /* @__PURE__ */ new Set();
    accessors.forEach((a) => {
      if (!a.id) return;
      const name = a.id;
      if (name.endsWith("_at")) {
        guessed.add(name);
        return;
      }
    });
    setDateColumnIds(guessed);
  }, [dateColumnIds, data, mergedColumns]);
  const responsiveClass = (_priority, hidden) => {
    if (hidden) return "";
    return "";
  };
  const resolvePriority = React.useCallback((column) => {
    const meta = column.columnDef?.meta;
    const rawPriority = typeof meta?.priority === "number" ? meta.priority : void 0;
    if (rawPriority && rawPriority > 0) return rawPriority;
    const index = column.getIndex();
    return index <= 1 ? 1 : 2;
  }, []);
  const initialSorting = React.useMemo(() => {
    if (mergedInitialSettings?.sorting) {
      return mergedInitialSettings.sorting.map((item) => ({ id: item.id, desc: Boolean(item.desc) }));
    }
    return [];
  }, [mergedInitialSettings]);
  const [sorting, setSorting] = React.useState(() => {
    if (sortingProp && sortingProp.length) return sortingProp;
    if (initialSorting.length) return initialSorting;
    return [];
  });
  const clientFilteredData = React.useMemo(() => {
    if (!injectedClientFilters.length || !filterValues) return data;
    const activeClientFilters = injectedClientFilters.filter(
      (cf) => filterValues[cf.id] !== void 0 && filterValues[cf.id] !== "" && filterValues[cf.id] !== null
    );
    if (!activeClientFilters.length) return data;
    return data.filter(
      (row) => activeClientFilters.every((cf) => cf.filterFn(row, filterValues[cf.id]))
    );
  }, [data, injectedClientFilters, filterValues]);
  const hasPropBulkActions = Array.isArray(bulkActionsProp) && bulkActionsProp.length > 0;
  const hasInjectedBulkActions = injectedBulkActions.length > 0 || hasPropBulkActions;
  const [rowSelection, setRowSelection] = React.useState({});
  const selectionScopeKeyRef = React.useRef(selectionScopeKey);
  const enableClientSorting = sortable && !manualSorting;
  const expansionEnabled = getSubRows !== void 0 || expandable !== void 0;
  const [internalExpanded, setInternalExpanded] = React.useState({});
  const expandedState = expandedProp !== void 0 ? expandedProp : internalExpanded;
  const handleExpandedChange = React.useCallback((updater) => {
    if (onExpandedChange) {
      onExpandedChange(updater);
      return;
    }
    setInternalExpanded((prev) => typeof updater === "function" ? updater(prev) : updater);
  }, [onExpandedChange]);
  const table = useLegacyTable({
    data: clientFilteredData,
    columns: mergedColumns,
    getCoreRowModel: getCoreRowModel(),
    ...enableClientSorting ? { getSortedRowModel: getSortedRowModel() } : {},
    ...expansionEnabled ? {
      getSubRows,
      getExpandedRowModel: getExpandedRowModel(),
      getRowCanExpand: (row) => {
        if (typeof expandable === "function") return expandable(row.original);
        if (expandable === true) return true;
        return (row.subRows?.length ?? 0) > 0;
      },
      onExpandedChange: handleExpandedChange
    } : {},
    manualSorting: manualSorting === true,
    getRowId: resolveDataTableRowId,
    state: { sorting, columnVisibility, columnOrder, rowSelection, ...expansionEnabled ? { expanded: expandedState } : {} },
    enableRowSelection: hasInjectedBulkActions,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      setSorting(next);
      onSortingChange?.(next);
    },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnVisibility) : updater;
      setColumnVisibility(next);
    },
    onColumnOrderChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnOrder) : updater;
      setColumnOrder(next);
    },
    onRowSelectionChange: setRowSelection
  });
  React.useEffect(() => {
    if (sortingProp) setSorting(sortingProp);
  }, [sortingProp]);
  React.useEffect(() => {
    if (selectionScopeKey === void 0) {
      selectionScopeKeyRef.current = void 0;
      return;
    }
    if (selectionScopeKeyRef.current === void 0) {
      selectionScopeKeyRef.current = selectionScopeKey;
      return;
    }
    if (selectionScopeKeyRef.current === selectionScopeKey) return;
    selectionScopeKeyRef.current = selectionScopeKey;
    setRowSelection({});
  }, [selectionScopeKey]);
  React.useEffect(() => {
    if (hasInjectedBulkActions) return;
    if (Object.keys(rowSelection).length === 0) return;
    setRowSelection({});
  }, [hasInjectedBulkActions, rowSelection]);
  const resolvedInjectionContext = React.useMemo(
    () => {
      if (!hasInjectedBulkActions) return baseInjectionContext;
      const selectedIds = Object.keys(rowSelection).filter((key) => rowSelection[key]);
      if (selectedIds.length === 0) return baseInjectionContext;
      return { ...baseInjectionContext, selectedRowIds: selectedIds, selectedCount: selectedIds.length };
    },
    [baseInjectionContext, hasInjectedBulkActions, rowSelection]
  );
  React.useEffect(() => {
    const ids = table.getAllLeafColumns().map((column) => column.id);
    if (!ids.length) return;
    setColumnOrder((prev) => {
      if (!prev.length) return ids;
      const allowed = ids;
      const filtered = prev.filter((id) => allowed.includes(id));
      const seen = new Set(filtered);
      for (const id of allowed) {
        if (!seen.has(id)) {
          filtered.push(id);
          seen.add(id);
        }
      }
      const changed = filtered.length !== prev.length || filtered.some((id, index) => id !== prev[index]);
      return changed ? filtered : prev;
    });
  }, [table, mergedColumns]);
  const visibilityDecidedColumnIds = React.useRef(
    new Set(Object.keys(mergedInitialSettings?.columnVisibility ?? {}))
  );
  const [visibilityDefaultsPass, setVisibilityDefaultsPass] = React.useState(0);
  React.useEffect(() => {
    const hidden = {};
    table.getAllLeafColumns().forEach((column) => {
      if (visibilityDecidedColumnIds.current.has(column.id)) return;
      const hiddenMeta = column.columnDef?.meta?.hidden;
      if (!hiddenMeta) return;
      visibilityDecidedColumnIds.current.add(column.id);
      hidden[column.id] = false;
    });
    if (!Object.keys(hidden).length) return;
    setColumnVisibility((prev) => ({ ...hidden, ...prev }));
    foldAutoHiddenIntoBaseline(hidden);
  }, [table, mergedColumns, visibilityDefaultsPass, foldAutoHiddenIntoBaseline]);
  const getCurrentSettings = React.useCallback(() => {
    const visibility = {};
    for (const [key, value] of Object.entries(columnVisibility)) {
      if (typeof value === "boolean") visibility[key] = value;
    }
    for (const column of table.getAllLeafColumns()) {
      visibility[column.id] = column.getIsVisible();
    }
    let filtersPayload;
    if (advancedFilter) {
      const persisted = serializeTreeForPersist(advancedFilter.value);
      filtersPayload = persisted.root.children.length > 0 ? persisted : void 0;
    } else {
      const filtersRecord = {};
      for (const [key, value] of Object.entries(filterValues ?? {})) {
        if (typeof key === "string") filtersRecord[key] = value;
      }
      if (Object.keys(filtersRecord).length) filtersPayload = filtersRecord;
    }
    const candidate = {
      columnOrder,
      columnVisibility: visibility,
      columnSizing,
      sorting,
      filters: filtersPayload,
      searchValue
    };
    return sanitizePerspectiveSettings(candidate) ?? {};
  }, [table, columnOrder, columnVisibility, columnSizing, sorting, filterValues, searchValue, advancedFilter]);
  const applyPerspectiveSettings = React.useCallback((settings, nextId, options) => {
    const normalized = sanitizePerspectiveSettings(settings) ?? {};
    if (!options?.preserveAdvancedFilter && advancedFilter?.onApplyTree) {
      hydratedAdvancedFilterRestoredRef.current = false;
      pendingPerspectiveFiltersRef.current = {
        filters: isPersistedFilterTree(normalized.filters) ? normalized.filters : void 0
      };
    }
    autoHiddenVisibilityRef.current = {};
    setViewBaseline(
      options?.preserveAdvancedFilter ? {
        ...normalized,
        filters: pendingPerspectiveFiltersRef.current ? pendingPerspectiveFiltersRef.current.filters : getCurrentSettings().filters
      } : normalized
    );
    if (normalized.columnOrder && normalized.columnOrder.length) {
      setColumnOrder(normalized.columnOrder);
    } else {
      const ids = table.getAllLeafColumns().map((column) => column.id);
      if (ids.length) setColumnOrder(ids);
    }
    visibilityDecidedColumnIds.current = new Set(Object.keys(normalized.columnVisibility ?? {}));
    setVisibilityDefaultsPass((pass) => pass + 1);
    if (normalized.columnVisibility) setColumnVisibility(normalized.columnVisibility);
    else setColumnVisibility({});
    if (normalized.sorting) {
      const sortingState = normalized.sorting.map((item) => ({
        id: item.id,
        desc: item.desc === true
      }));
      setSorting(sortingState);
      onSortingChange?.(sortingState);
    } else {
      setSorting([]);
      onSortingChange?.([]);
    }
    if (normalized.columnSizing) {
      setColumnSizing(normalized.columnSizing);
      columnSizingRef.current = normalized.columnSizing;
    } else {
      setColumnSizing({});
      columnSizingRef.current = {};
    }
    if (!options?.preserveAdvancedFilter) {
      const restoredTree = isPersistedFilterTree(normalized.filters) ? deserializeTreeFromPersist(normalized.filters) : null;
      if (advancedFilter?.onApplyTree) {
        advancedFilter.onApplyTree(restoredTree ?? createEmptyTree());
        if (onFiltersApply) onFiltersApply({});
      } else if (onFiltersApply) {
        const legacy = restoredTree ? {} : normalized.filters ?? {};
        onFiltersApply(legacy);
      }
    }
    if (onSearchChange) {
      onSearchChange(normalized.searchValue ?? "");
    }
    setActivePerspectiveId(nextId);
    if (perspectiveTableId) {
      writePerspectiveCookie(perspectiveTableId, nextId);
      if (nextId) {
        const previousSnapshot = readPerspectiveSnapshot(perspectiveTableId) ?? initialSnapshotRef.current;
        const preserveClearedFilter = options?.preserveAdvancedFilter && !getCurrentSettings().filters && !previousSnapshot?.settings.filters;
        const snapshotSettings = preserveClearedFilter ? { ...normalized, filters: void 0 } : normalized;
        const snapshot = { perspectiveId: nextId, settings: snapshotSettings, updatedAt: Date.now() };
        writePerspectiveSnapshot(perspectiveTableId, snapshot);
        initialSnapshotRef.current = snapshot;
      } else if (normalized.columnSizing && Object.keys(normalized.columnSizing).length) {
        const snapshot = {
          perspectiveId: null,
          settings: { columnSizing: normalized.columnSizing },
          updatedAt: Date.now()
        };
        writePerspectiveSnapshot(perspectiveTableId, snapshot);
        initialSnapshotRef.current = snapshot;
      } else {
        writePerspectiveSnapshot(perspectiveTableId, null);
        initialSnapshotRef.current = null;
      }
    }
  }, [onFiltersApply, onSearchChange, onSortingChange, perspectiveTableId, table, advancedFilter, getCurrentSettings, setViewBaseline]);
  const persistColumnSizingSnapshot = React.useCallback(() => {
    if (!perspectiveTableId) return;
    const sizing = columnSizingRef.current;
    const existing = readPerspectiveSnapshot(perspectiveTableId) ?? initialSnapshotRef.current;
    const baseSettings = existing?.settings ? { ...existing.settings } : mergedInitialSettings ? { ...mergedInitialSettings } : {};
    if (sizing && Object.keys(sizing).length) baseSettings.columnSizing = sizing;
    else delete baseSettings.columnSizing;
    const snapshot = {
      perspectiveId: existing?.perspectiveId ?? activePerspectiveId ?? null,
      settings: baseSettings,
      updatedAt: Date.now()
    };
    writePerspectiveSnapshot(perspectiveTableId, snapshot);
    initialSnapshotRef.current = snapshot;
  }, [perspectiveTableId, activePerspectiveId, mergedInitialSettings]);
  const handleColumnResize = React.useCallback((colId, width) => {
    const next = { ...columnSizingRef.current, [colId]: width };
    columnSizingRef.current = next;
    setColumnSizing(next);
  }, []);
  const commitColumnSizing = React.useCallback(() => {
    persistColumnSizingSnapshot();
  }, [persistColumnSizingSnapshot]);
  const resetColumnSize = React.useCallback((colId) => {
    const next = { ...columnSizingRef.current };
    delete next[colId];
    columnSizingRef.current = next;
    setColumnSizing(next);
    persistColumnSizingSnapshot();
  }, [persistColumnSizingSnapshot]);
  React.useLayoutEffect(() => {
    if (!perspectiveTableId) return;
    if (snapshotHydratedTableRef.current === perspectiveTableId) return;
    snapshotHydratedTableRef.current = perspectiveTableId;
    hydratedAdvancedFilterRestoredRef.current = false;
    const snapshot = readPerspectiveSnapshot(perspectiveTableId);
    if (!snapshot) return;
    initialSnapshotRef.current = snapshot;
    hydratedSnapshotRef.current = snapshot;
    const restoredTree = isPersistedFilterTree(snapshot.settings.filters) ? deserializeTreeFromPersist(snapshot.settings.filters) : null;
    const preserveAdvancedFilter = !!advancedFilter?.onApplyTree && (advancedFilter.value.root.children.length > 0 || !restoredTree?.root.children.length);
    applyPerspectiveSettings(
      snapshot.settings,
      snapshot.perspectiveId ?? null,
      { preserveAdvancedFilter }
    );
    hydratedAdvancedFilterRestoredRef.current = !!advancedFilter?.onApplyTree && !preserveAdvancedFilter;
    initialPerspectiveAppliedRef.current = true;
  }, [perspectiveTableId, applyPerspectiveSettings, advancedFilter]);
  const previousAdvancedFilterRef = React.useRef(null);
  const advancedFilterHasRules = !!advancedFilter?.value.root.children.length;
  React.useEffect(() => {
    const previous = previousAdvancedFilterRef.current;
    previousAdvancedFilterRef.current = { tableId: perspectiveTableId, hasRules: advancedFilterHasRules };
    if (!perspectiveTableId || !advancedFilter?.onApplyTree) return;
    if (previous?.tableId !== perspectiveTableId || !previous.hasRules || advancedFilterHasRules) return;
    const snapshot = readPerspectiveSnapshot(perspectiveTableId) ?? initialSnapshotRef.current;
    if (!snapshot) return;
    const settings = { ...snapshot.settings };
    delete settings.filters;
    const clearedSnapshot = { ...snapshot, settings, updatedAt: Date.now() };
    writePerspectiveSnapshot(perspectiveTableId, clearedSnapshot);
    initialSnapshotRef.current = clearedSnapshot;
  }, [perspectiveTableId, advancedFilterHasRules, advancedFilter?.onApplyTree]);
  const perspectiveQueryKey = ["table-perspectives", perspectiveTableId];
  const rolePerspectivesForLocking = React.useMemo(
    () => perspectiveData?.manageableRolePerspectives ?? perspectiveData?.rolePerspectives ?? [],
    [perspectiveData]
  );
  const perspectiveMutationContextId = `data-table-perspectives:${perspectiveTableId ?? "unknown"}`;
  const { runMutation: runPerspectiveMutation, retryLastMutation: retryPerspectiveMutation } = useGuardedMutation({
    contextId: perspectiveMutationContextId,
    blockedMessage: t("ui.forms.flash.saveBlocked", "Save blocked by validation")
  });
  const perspectiveMutationContext = React.useMemo(
    () => ({
      formId: perspectiveMutationContextId,
      resourceKind: "perspective",
      retryLastMutation: retryPerspectiveMutation
    }),
    [perspectiveMutationContextId, retryPerspectiveMutation]
  );
  const savePerspectiveMutation = useMutation({
    mutationFn: async (input) => {
      if (!perspectiveTableId) throw new Error("Missing table id");
      const roleExpectedUpdatedAtByRoleId = {};
      const roleExpectedUpdatedAtByPerspectiveId = {};
      for (const roleId of input.applyToRoles) {
        const rolePerspectives = rolePerspectivesForLocking.filter((p) => p.roleId === roleId);
        const matching = rolePerspectives.find((p) => p.name.trim() === input.name.trim()) ?? null;
        const defaultPerspective = input.setRoleDefault ? rolePerspectives.find((p) => p.isDefault) ?? null : null;
        for (const candidate of [matching, defaultPerspective]) {
          if (!candidate?.updatedAt) continue;
          roleExpectedUpdatedAtByPerspectiveId[candidate.id] = candidate.updatedAt;
        }
        const roleFallback = matching ?? defaultPerspective;
        if (roleFallback?.updatedAt) roleExpectedUpdatedAtByRoleId[roleId] = roleFallback.updatedAt;
      }
      const payload = {
        perspectiveId: input.perspectiveId ?? void 0,
        name: input.name,
        settings: input.settings ?? getCurrentSettings(),
        isDefault: input.isDefault,
        applyToRoles: input.applyToRoles,
        setRoleDefault: input.setRoleDefault,
        ...Object.keys(roleExpectedUpdatedAtByRoleId).length > 0 ? { roleExpectedUpdatedAtByRoleId } : {},
        ...Object.keys(roleExpectedUpdatedAtByPerspectiveId).length > 0 ? { roleExpectedUpdatedAtByPerspectiveId } : {}
      };
      if (process.env.NODE_ENV !== "production") {
        logger.debug("Perspective payload", { payload });
      }
      const existing = input.perspectiveId ? perspectiveData?.perspectives.find((p) => p.id === input.perspectiveId) ?? null : null;
      return runPerspectiveMutation({
        operation: async () => {
          const call = await withScopedApiRequestHeaders(
            buildOptimisticLockHeader(existing?.updatedAt ?? null),
            () => apiCall(
              `/api/perspectives/${encodeURIComponent(perspectiveTableId)}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
              }
            )
          );
          if (call.status === 404) {
            throw new Error(t("ui.dataTable.perspectives.error.apiUnavailable", "Perspectives API is not available. Run `yarn generate` to regenerate module routes and restart the dev server."));
          }
          if (!call.ok) {
            await raiseCrudError(call.response, t("ui.dataTable.perspectives.error.save", "Failed to save perspective"));
          }
          const result = call.result;
          if (!result) throw new Error(t("ui.dataTable.perspectives.error.save", "Failed to save perspective"));
          return result;
        },
        context: perspectiveMutationContext,
        mutationPayload: payload
      });
    },
    onSuccess: (data2) => {
      if (perspectiveTableId) {
        void queryClient.invalidateQueries({ queryKey: perspectiveQueryKey });
      }
      if (data2.perspective) {
        applyPerspectiveSettings(data2.perspective.settings, data2.perspective.id);
      }
    },
    onError: () => {
      if (perspectiveTableId) {
        void queryClient.invalidateQueries({ queryKey: perspectiveQueryKey });
      }
    }
  });
  const resolveColumnLabel = React.useCallback((column) => {
    const meta = column.columnDef?.meta;
    if (typeof meta?.label === "string" && meta.label.trim().length > 0) return meta.label.trim();
    if (typeof meta?.title === "string" && meta.title.trim().length > 0) return meta.title.trim();
    const header = column.columnDef.header;
    if (typeof header === "string") return header;
    if (typeof header === "function") return normalizeLabel(column.id);
    return normalizeLabel(column.id);
  }, []);
  const activePersonalPerspectiveId = React.useMemo(() => {
    if (!perspectiveData || !activePerspectiveId) return null;
    const found = perspectiveData.perspectives.find((p) => p.id === activePerspectiveId);
    return found ? found.id : null;
  }, [perspectiveData, activePerspectiveId]);
  const deletePerspectiveMutation = useMutation({
    mutationFn: async ({ perspectiveId }) => {
      if (!perspectiveTableId) throw new Error("Missing table id");
      const existing = perspectiveData?.perspectives.find((p) => p.id === perspectiveId) ?? null;
      await runPerspectiveMutation({
        operation: async () => {
          const call = await withScopedApiRequestHeaders(
            buildOptimisticLockHeader(existing?.updatedAt ?? null),
            () => apiCall(
              `/api/perspectives/${encodeURIComponent(perspectiveTableId)}/${encodeURIComponent(perspectiveId)}`,
              { method: "DELETE" }
            )
          );
          if (call.status === 404) throw new Error(t("ui.dataTable.perspectives.error.apiUnavailable", "Perspectives API is not available. Run `yarn generate` and restart the dev server."));
          if (!call.ok) {
            await raiseCrudError(call.response, t("ui.dataTable.perspectives.error.delete", "Failed to delete perspective"));
          }
        },
        context: perspectiveMutationContext,
        mutationPayload: { perspectiveId }
      });
    },
    onMutate: ({ perspectiveId }) => {
      setDeletingIds((prev) => prev.includes(perspectiveId) ? prev : [...prev, perspectiveId]);
    },
    onSettled: (_data, _error, variables) => {
      setDeletingIds((prev) => prev.filter((id) => id !== variables.perspectiveId));
    },
    onSuccess: (_data, variables) => {
      const removedActive = activePerspectiveId === variables.perspectiveId;
      if (perspectiveTableId) {
        void queryClient.invalidateQueries({ queryKey: perspectiveQueryKey });
        if (removedActive) {
          setActivePerspectiveId(null);
          writePerspectiveCookie(perspectiveTableId, null);
          writePerspectiveSnapshot(perspectiveTableId, null);
          initialSnapshotRef.current = null;
          initialPerspectiveAppliedRef.current = false;
        }
      } else if (removedActive) {
        setActivePerspectiveId(null);
        initialPerspectiveAppliedRef.current = false;
      }
    },
    onError: () => {
      if (perspectiveTableId) {
        void queryClient.invalidateQueries({ queryKey: perspectiveQueryKey });
      }
    }
  });
  const clearRoleMutation = useMutation({
    mutationFn: async ({ roleId, updatedAt, expectedUpdatedAtByPerspectiveId }) => {
      if (!perspectiveTableId) throw new Error("Missing table id");
      const hasPerRowVersions = expectedUpdatedAtByPerspectiveId && Object.keys(expectedUpdatedAtByPerspectiveId).length > 0;
      await runPerspectiveMutation({
        operation: async () => {
          const call = await withScopedApiRequestHeaders(
            hasPerRowVersions ? {} : buildOptimisticLockHeader(updatedAt ?? null),
            () => apiCall(
              `/api/perspectives/${encodeURIComponent(perspectiveTableId)}/roles/${encodeURIComponent(roleId)}`,
              hasPerRowVersions ? {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roleExpectedUpdatedAtByPerspectiveId: expectedUpdatedAtByPerspectiveId })
              } : { method: "DELETE" }
            )
          );
          if (call.status === 404) throw new Error(t("ui.dataTable.perspectives.error.apiUnavailable", "Perspectives API is not available. Run `yarn generate` and restart the dev server."));
          if (!call.ok) {
            await raiseCrudError(call.response, t("ui.dataTable.perspectives.error.clearRoles", "Failed to clear role perspectives"));
          }
        },
        context: perspectiveMutationContext,
        mutationPayload: { roleId }
      });
    },
    onMutate: ({ roleId }) => {
      setRoleClearingIds((prev) => prev.includes(roleId) ? prev : [...prev, roleId]);
    },
    onSettled: (_data, _error, variables) => {
      setRoleClearingIds((prev) => prev.filter((id) => id !== variables.roleId));
    },
    onSuccess: (_data, variables) => {
      if (perspectiveTableId) {
        void queryClient.invalidateQueries({ queryKey: perspectiveQueryKey });
      }
      if (activePerspectiveId) {
        const current = queryClient.getQueryData(perspectiveQueryKey);
        const match = current?.rolePerspectives.find((rp) => rp.id === activePerspectiveId);
        if (match && match.roleId === variables.roleId) {
          setActivePerspectiveId(null);
          if (perspectiveTableId) writePerspectiveCookie(perspectiveTableId, null);
          if (perspectiveTableId) writePerspectiveSnapshot(perspectiveTableId, null);
          initialSnapshotRef.current = null;
          initialPerspectiveAppliedRef.current = false;
        }
      }
    },
    onError: () => {
      if (perspectiveTableId) {
        void queryClient.invalidateQueries({ queryKey: perspectiveQueryKey });
      }
    }
  });
  const handlePerspectiveActivate = React.useCallback((item, _source) => {
    applyPerspectiveSettings(item.settings, item.id);
  }, [applyPerspectiveSettings]);
  const handlePerspectiveSave = React.useCallback(async (input) => {
    const normalizedRoles = Array.from(new Set(input.applyToRoles));
    await savePerspectiveMutation.mutateAsync({
      name: input.name.trim(),
      isDefault: input.isDefault,
      applyToRoles: normalizedRoles,
      setRoleDefault: normalizedRoles.length > 0 ? input.setRoleDefault : false,
      perspectiveId: input.perspectiveId !== void 0 ? input.perspectiveId : activePersonalPerspectiveId,
      settings: input.settings
    });
  }, [savePerspectiveMutation, activePersonalPerspectiveId]);
  const defaultColumnOrderIds = React.useMemo(
    () => table.getAllLeafColumns().map((column) => column.id),
    [table, mergedColumns]
  );
  const viewApiRequested = Boolean(onColumnsDirtyChange || viewApiRef || showSaveViewButton);
  const currentViewSettings = React.useMemo(
    () => viewApiRequested ? getCurrentSettings() : EMPTY_VIEW_SETTINGS,
    [viewApiRequested, getCurrentSettings]
  );
  const viewDirtyState = React.useMemo(() => {
    if (!viewApiRequested || !perspectiveEnabled || !viewBaselineInitializedRef.current) {
      return {
        isDirty: false,
        changedKeys: [],
        changedCount: 0,
        activePerspectiveId,
        canSaveToActiveView: false
      };
    }
    const changedKeys = diffPerspectiveSettings(viewBaseline, currentViewSettings, {
      defaultColumnOrder: defaultColumnOrderIds
    });
    return {
      isDirty: changedKeys.length > 0,
      changedKeys,
      changedCount: changedKeys.length,
      activePerspectiveId,
      canSaveToActiveView: Boolean(activePersonalPerspectiveId)
    };
  }, [
    viewApiRequested,
    perspectiveEnabled,
    viewBaseline,
    currentViewSettings,
    defaultColumnOrderIds,
    activePerspectiveId,
    activePersonalPerspectiveId
  ]);
  React.useEffect(() => {
    if (!viewApiRequested || !perspectiveEnabled || viewBaselineInitializedRef.current) return;
    setViewBaseline(currentViewSettings);
  }, [viewApiRequested, perspectiveEnabled, currentViewSettings, setViewBaseline]);
  const viewDirtyStateRef = React.useRef(viewDirtyState);
  const onColumnsDirtyChangeRef = React.useRef(onColumnsDirtyChange);
  React.useLayoutEffect(() => {
    viewDirtyStateRef.current = viewDirtyState;
    onColumnsDirtyChangeRef.current = onColumnsDirtyChange;
  }, [viewDirtyState, onColumnsDirtyChange]);
  const lastDirtySignatureRef = React.useRef(null);
  React.useEffect(() => {
    const notify = onColumnsDirtyChangeRef.current;
    if (!notify || !perspectiveEnabled) return;
    const signature = JSON.stringify([
      viewDirtyState.isDirty,
      viewDirtyState.changedKeys,
      viewDirtyState.activePerspectiveId,
      viewDirtyState.canSaveToActiveView
    ]);
    if (lastDirtySignatureRef.current === signature) return;
    lastDirtySignatureRef.current = signature;
    notify(viewDirtyState);
  }, [viewDirtyState, perspectiveEnabled]);
  const saveCurrentView = React.useCallback(async (input) => {
    if (!perspectiveTableId) return { ok: false, reason: "perspectives-disabled" };
    if (perspectivePermissions === void 0) return { ok: false, reason: "not-ready" };
    if (!canUsePerspectives) return { ok: false, reason: "perspectives-disabled" };
    const targetId = input?.perspectiveId !== void 0 ? input.perspectiveId : activePersonalPerspectiveId;
    const existing = targetId ? perspectiveData?.perspectives.find((item) => item.id === targetId) ?? null : null;
    const name = (input?.name ?? existing?.name ?? "").trim();
    if (!name) return { ok: false, reason: "name-required" };
    try {
      const saved = await savePerspectiveMutation.mutateAsync({
        name,
        isDefault: input?.isDefault ?? existing?.isDefault ?? false,
        applyToRoles: [],
        setRoleDefault: false,
        perspectiveId: targetId ?? null
      });
      return { ok: true, perspectiveId: saved?.perspective?.id ?? null };
    } catch (error2) {
      return { ok: false, reason: "failed", error: error2 };
    }
  }, [
    canUsePerspectives,
    perspectivePermissions,
    perspectiveTableId,
    activePersonalPerspectiveId,
    perspectiveData,
    savePerspectiveMutation
  ]);
  React.useImperativeHandle(viewApiRef, () => ({
    getCurrentSettings: () => getCurrentSettings(),
    getDirtyState: () => viewDirtyStateRef.current,
    saveCurrentView,
    openViewsSidebar: () => setPerspectiveOpen(true)
  }), [getCurrentSettings, saveCurrentView]);
  const handleSaveViewClick = React.useCallback(async () => {
    const result = await saveCurrentView();
    if (result.ok) {
      flash(t("ui.dataTable.saveView.success", "View saved"), "success");
      return;
    }
    if (result.reason === "name-required") {
      setPerspectiveOpen(true);
      return;
    }
    if (result.reason === "failed") {
      if (surfaceRecordConflict(result.error, t)) return;
      flash(t("ui.dataTable.saveView.error", "Failed to save view"), "error");
    }
  }, [saveCurrentView, t]);
  const handlePerspectiveDelete = React.useCallback(async (perspectiveId) => {
    await deletePerspectiveMutation.mutateAsync({ perspectiveId });
  }, [deletePerspectiveMutation]);
  const handleClearRole = React.useCallback(async (perspective2) => {
    const expectedUpdatedAtByPerspectiveId = Object.fromEntries(
      rolePerspectivesForLocking.filter((item) => item.roleId === perspective2.roleId && item.updatedAt).map((item) => [item.id, item.updatedAt])
    );
    await clearRoleMutation.mutateAsync({
      roleId: perspective2.roleId,
      updatedAt: perspective2.updatedAt ?? null,
      expectedUpdatedAtByPerspectiveId
    });
  }, [clearRoleMutation, rolePerspectivesForLocking]);
  const handleColumnChooserToggle = React.useCallback((key) => {
    const column = table.getColumn(key);
    if (!column) return;
    const nextVisible = !column.getIsVisible();
    if (nextVisible) {
      setColumnOrder((prev) => prev.includes(key) ? prev : [...prev, key]);
    }
    setColumnVisibility((prev) => {
      const next = { ...prev };
      if (nextVisible) delete next[key];
      else next[key] = false;
      return next;
    });
    column.toggleVisibility(nextVisible);
  }, [table]);
  const handleColumnChooserReorder = React.useCallback((newOrder) => {
    setColumnOrder(newOrder);
    table.setColumnOrder(newOrder);
  }, [table]);
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const enableHeaderDnd = Boolean(columnChooser);
  const enableColumnResize = perspectiveEnabled;
  const stableDndContextId = React.useMemo(
    () => sanitizeDndContextId(
      extensionTableId ?? perspectiveTableId ?? resolvedReplacementHandle ?? (typeof title === "string" && title.trim().length > 0 ? title : "data-table")
    ),
    [extensionTableId, perspectiveTableId, resolvedReplacementHandle, title]
  );
  const headerColumnIds = React.useMemo(() => {
    if (!enableHeaderDnd) return [];
    return table.getHeaderGroups().flatMap((hg) => hg.headers.map((h) => h.id));
  }, [enableHeaderDnd, table, columnOrder]);
  const handleHeaderDragEnd = React.useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const currentIds = columnOrder.length ? columnOrder : table.getAllLeafColumns().map((c) => c.id);
    const oldIdx = currentIds.indexOf(String(active.id));
    const newIdx = currentIds.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const next = [...currentIds];
    const [moved] = next.splice(oldIdx, 1);
    next.splice(newIdx, 0, moved);
    setColumnOrder(next);
    table.setColumnOrder(next);
  }, [columnOrder, table]);
  const perspectiveApiWarning = perspectiveApiMissing && canUsePerspectives ? t("ui.dataTable.perspectives.warning.apiUnavailable", "Perspectives API is not available yet. Run `yarn generate` to regenerate module routes, then restart the server.") : null;
  const loadStartRef = React.useRef(null);
  const [measuredDurationMs, setMeasuredDurationMs] = React.useState(null);
  React.useEffect(() => {
    if (typeof isLoading !== "boolean") return;
    if (isLoading) {
      if (loadStartRef.current === null) {
        const now = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
        loadStartRef.current = now;
      }
      return;
    }
    if (loadStartRef.current !== null) {
      const now = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
      setMeasuredDurationMs(now - loadStartRef.current);
      loadStartRef.current = null;
    }
  }, [isLoading]);
  React.useLayoutEffect(() => {
    if (!canUsePerspectives) return;
    if (!perspectiveTableId) return;
    if ((initialSnapshotRef.current || initialPerspectiveAppliedRef.current) && serverReconciledTableRef.current === perspectiveTableId) return;
    const source = perspectiveData ?? perspectiveConfig?.initialState?.response;
    if (!source) return;
    let orphanedSnapshotDropped = false;
    const currentFilters = pendingPerspectiveFiltersRef.current ? pendingPerspectiveFiltersRef.current.filters : getCurrentSettings().filters;
    const restoredFilterStillActive = hydratedAdvancedFilterRestoredRef.current && diffPerspectiveSettings(
      { filters: currentFilters },
      { filters: hydratedSnapshotRef.current?.settings.filters }
    ).length === 0;
    const preserveAdvancedFilter = !!advancedFilter?.onApplyTree && !restoredFilterStillActive;
    const tryResolve = (id) => {
      if (!id) return void 0;
      return source.perspectives.find((p) => p.id === id) ?? source.rolePerspectives.find((p) => p.id === id);
    };
    if (initialSnapshotRef.current || initialPerspectiveAppliedRef.current) {
      serverReconciledTableRef.current = perspectiveTableId;
      const hydrated = hydratedSnapshotRef.current;
      const snapshot = hydrated && (!activePerspectiveId || activePerspectiveId === hydrated.perspectiveId) ? hydrated : null;
      const localId = snapshot?.perspectiveId ?? activePerspectiveId;
      if (!localId) return;
      const local = tryResolve(localId);
      if (local) {
        const serverUpdatedAt = local.updatedAt ? Date.parse(local.updatedAt) : NaN;
        const serverIsNewer = snapshot != null && Number.isFinite(serverUpdatedAt) && serverUpdatedAt > snapshot.updatedAt;
        const settingsDiffer = snapshot != null && diffPerspectiveSettings(
          sanitizePerspectiveSettings(local.settings) ?? {},
          sanitizePerspectiveSettings(snapshot.settings) ?? {}
        ).length > 0;
        if (serverIsNewer && settingsDiffer) {
          applyPerspectiveSettings(local.settings, local.id, {
            preserveAdvancedFilter
          });
          initialPerspectiveAppliedRef.current = true;
        }
        return;
      }
      writePerspectiveSnapshot(perspectiveTableId, null);
      initialSnapshotRef.current = null;
      hydratedSnapshotRef.current = null;
      initialPerspectiveAppliedRef.current = false;
      orphanedSnapshotDropped = true;
    }
    let target;
    if (activePerspectiveId) {
      target = tryResolve(activePerspectiveId);
    }
    const cookieId = readPerspectiveCookie(perspectiveTableId);
    if (!target && cookieId) target = tryResolve(cookieId);
    if (!target && source.defaultPerspectiveId) {
      target = tryResolve(source.defaultPerspectiveId);
    }
    if (!target) {
      target = source.rolePerspectives.find((p) => p.isDefault);
    }
    if (!target) {
      target = source.perspectives[0];
    }
    if (target) {
      applyPerspectiveSettings(
        target.settings,
        target.id,
        orphanedSnapshotDropped ? { preserveAdvancedFilter } : void 0
      );
    } else if (orphanedSnapshotDropped) {
      applyPerspectiveSettings({}, null, {
        preserveAdvancedFilter
      });
    }
    initialPerspectiveAppliedRef.current = true;
  }, [canUsePerspectives, perspectiveData, perspectiveTableId, perspectiveConfig, applyPerspectiveSettings, activePerspectiveId, advancedFilter?.onApplyTree, getCurrentSettings]);
  const scrollTableIntoView = React.useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.top >= 0) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
    containerRef.current?.scrollIntoView({ behavior, block: "start" });
  }, []);
  const paginationNode = React.useMemo(() => {
    if (!pagination || pagination.total === 0) return null;
    const { page, totalPages, onPageChange, durationMs, cacheStatus } = pagination;
    const totalIsCapped = pagination.totalIsCapped === true;
    const pageIsFull = data.length >= pagination.pageSize;
    const startItem = (page - 1) * pagination.pageSize + 1;
    const endItem = totalIsCapped ? Math.max(startItem, startItem + data.length - 1) : Math.min(page * pagination.pageSize, pagination.total);
    const pageIsEmpty = data.length === 0;
    const effectiveDuration = typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : measuredDurationMs ?? void 0;
    const durationLabel = showQueryTime ? formatDurationLabel(effectiveDuration) : "";
    const normalizedCacheStatus = cacheStatus === "hit" || cacheStatus === "miss" ? cacheStatus : null;
    const cacheBadge = normalizedCacheStatus ? /* @__PURE__ */ jsxs(
      "span",
      {
        className: "inline-flex items-center justify-center",
        "aria-label": t("ui.dataTable.pagination.cache.ariaLabel", "Cache {status}", { status: normalizedCacheStatus.toUpperCase() }),
        title: t("ui.dataTable.pagination.cache.title", "Cache {status}", { status: normalizedCacheStatus.toUpperCase() }),
        children: [
          /* @__PURE__ */ jsx(
            Circle,
            {
              className: `h-3.5 w-3.5 ${normalizedCacheStatus === "hit" ? "text-status-success-icon" : "text-status-warning-icon"}`,
              strokeWidth: 3
            }
          ),
          /* @__PURE__ */ jsx("span", { className: "sr-only", children: t("ui.dataTable.pagination.cache.srOnly", "Cache {status}", { status: normalizedCacheStatus.toUpperCase() }) })
        ]
      }
    ) : null;
    const pageSizeOptions = Array.isArray(pagination.pageSizeOptions) ? Array.from(new Set(
      [pagination.pageSize, ...pagination.pageSizeOptions].filter((size) => typeof size === "number" && Number.isFinite(size) && size > 0).map((size) => Math.max(1, Math.floor(size)))
    )).sort((left, right) => left - right) : [10, 25, 50, 100];
    return /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 border-t", children: [
      cacheBadge ? /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center sm:justify-start gap-2 text-sm text-muted-foreground", children: cacheBadge }) : null,
      /* @__PURE__ */ jsx(
        Pagination,
        {
          page,
          pageSize: pagination.pageSize,
          total: pagination.total,
          totalIsCapped,
          hasNextPage: totalIsCapped ? pageIsFull : void 0,
          onPageChange: (next) => {
            onPageChange(next);
            scrollTableIntoView();
          },
          onPageSizeChange: pagination.onPageSizeChange ? (next) => {
            pagination.onPageSizeChange(next);
            scrollTableIntoView();
          } : void 0,
          pageSizeOptions,
          formatPageInfo: () => {
            if (totalIsCapped) {
              if (pageIsEmpty) {
                return t("ui.dataTable.pagination.resultsCappedNoRows", "No further results past {total}", { total: pagination.total });
              }
              return durationLabel ? t("ui.dataTable.pagination.resultsCappedWithDuration", "Showing {start} to {end} of {total}+ results in {duration}", { start: startItem, end: endItem, total: pagination.total, duration: durationLabel }) : t("ui.dataTable.pagination.resultsCapped", "Showing {start} to {end} of {total}+ results", { start: startItem, end: endItem, total: pagination.total });
            }
            return durationLabel ? t("ui.dataTable.pagination.resultsWithDuration", "Showing {start} to {end} of {total} results in {duration}", { start: startItem, end: endItem, total: pagination.total, duration: durationLabel }) : t("ui.dataTable.pagination.results", "Showing {start} to {end} of {total} results", { start: startItem, end: endItem, total: pagination.total });
          },
          formatPageSizeLabel: (size) => `${size} ${t("ui.dataTable.pagination.perPage", "per page")}`,
          "aria-label": t("ui.dataTable.pagination.navAriaLabel", "Table pagination"),
          className: "flex-1"
        }
      )
    ] });
  }, [pagination, data, showQueryTime, measuredDurationMs, scrollTableIntoView, t]);
  const resolvedEntityIds = React.useMemo(() => {
    if (Array.isArray(entityIds) && entityIds.length) {
      const dedup = /* @__PURE__ */ new Set();
      const list = [];
      entityIds.forEach((id) => {
        const trimmed = typeof id === "string" ? id.trim() : "";
        if (!trimmed || dedup.has(trimmed)) return;
        dedup.add(trimmed);
        list.push(trimmed);
      });
      return list;
    }
    if (typeof entityId === "string" && entityId.trim().length > 0) {
      return [entityId.trim()];
    }
    return [];
  }, [entityId, entityIds]);
  const entityKey = React.useMemo(() => resolvedEntityIds.length ? resolvedEntityIds.join("|") : null, [resolvedEntityIds]);
  const customFieldFilterExtrasSignature = React.useMemo(
    () => JSON.stringify(customFieldFilterKeyExtras ?? []),
    [customFieldFilterKeyExtras]
  );
  const [cfFilterFieldsetsByEntity, setCfFilterFieldsetsByEntity] = React.useState({});
  const [cfFilterFieldsetSelection, setCfFilterFieldsetSelection] = React.useState({});
  React.useEffect(() => {
    if (!entityKey) {
      setCfFilterFieldsetsByEntity({});
      setCfFilterFieldsetSelection({});
      return;
    }
    let cancelled = false;
    const loadFieldsets = async () => {
      try {
        const payload = await fetchCustomFieldDefinitionsPayload(resolvedEntityIds);
        if (cancelled) return;
        const fieldsets = payload.fieldsetsByEntity ?? {};
        setCfFilterFieldsetsByEntity(fieldsets);
        const selectionChanges = [];
        let shouldNotify = false;
        setCfFilterFieldsetSelection((prev) => {
          const next = {};
          let changed = false;
          resolvedEntityIds.forEach((entityId2) => {
            const list = fieldsets[entityId2] ?? [];
            if (!list.length) {
              if (prev[entityId2] !== void 0) changed = true;
              return;
            }
            const existing = prev[entityId2];
            const fallback = list[0]?.code ?? null;
            const isValidExisting = existing ? list.some((entry) => entry.code === existing) : false;
            const value = isValidExisting ? existing : fallback ?? null;
            next[entityId2] = value;
            if (value !== existing) {
              changed = true;
              selectionChanges.push([entityId2, value]);
            }
          });
          if (Object.keys(prev).length !== Object.keys(next).length) changed = true;
          if (changed) {
            shouldNotify = true;
            return next;
          }
          return prev;
        });
        if (shouldNotify && selectionChanges.length && onCustomFieldFilterFieldsetChange) {
          selectionChanges.forEach(([entityId2, value]) => onCustomFieldFilterFieldsetChange(value, entityId2));
        }
      } catch {
        if (!cancelled) {
          setCfFilterFieldsetsByEntity({});
          setCfFilterFieldsetSelection({});
        }
      }
    };
    loadFieldsets();
    return () => {
      cancelled = true;
    };
  }, [customFieldFilterExtrasSignature, entityKey, onCustomFieldFilterFieldsetChange, resolvedEntityIds]);
  const supportsCustomFieldFilterFieldsets = resolvedEntityIds.length === 1 && (cfFilterFieldsetsByEntity[resolvedEntityIds[0]]?.length ?? 0) > 0;
  const activeCustomFieldFilterFieldset = supportsCustomFieldFilterFieldsets ? cfFilterFieldsetSelection[resolvedEntityIds[0]] ?? cfFilterFieldsetsByEntity[resolvedEntityIds[0]]?.[0]?.code ?? null : null;
  const handleCustomFieldFilterFieldsetChange = React.useCallback(
    (value) => {
      if (!supportsCustomFieldFilterFieldsets) return;
      const entityId2 = resolvedEntityIds[0];
      const nextValue = value || null;
      setCfFilterFieldsetSelection((prev) => {
        if (prev[entityId2] === nextValue) return prev;
        return { ...prev, [entityId2]: nextValue };
      });
      if (onCustomFieldFilterFieldsetChange) {
        onCustomFieldFilterFieldsetChange(nextValue, entityId2);
      }
    },
    [onCustomFieldFilterFieldsetChange, resolvedEntityIds, supportsCustomFieldFilterFieldsets]
  );
  const { data: cfFilters = [] } = useCustomFieldFilterDefs(entityKey ? resolvedEntityIds : [], {
    enabled: !!entityKey,
    fieldset: supportsCustomFieldFilterFieldsets ? activeCustomFieldFilterFieldset ?? void 0 : void 0,
    keyExtras: customFieldFilterKeyExtras
  });
  const isAutoAdvancedFilter = Boolean(advancedFilter?.auto);
  const isAutoColumnChooser = Boolean(columnChooser?.auto);
  const needsAutoDiscovery = isAutoAdvancedFilter || isAutoColumnChooser;
  const { data: autoDiscoveryDefs = [] } = useCustomFieldDefs(
    needsAutoDiscovery && entityKey ? resolvedEntityIds : [],
    { enabled: needsAutoDiscovery && !!entityKey }
  );
  const autoDiscovered = useAutoDiscoveredFields({
    columns: needsAutoDiscovery ? mergedColumns : [],
    customFieldDefs: needsAutoDiscovery ? autoDiscoveryDefs : []
  });
  const resolvedAdvancedFilterFields = isAutoAdvancedFilter ? autoDiscovered.advancedFilterFields : advancedFilter?.fields ?? [];
  const advancedFilterRuleCount = React.useMemo(() => {
    if (!advancedFilter) return 0;
    function countRules(group) {
      let n = 0;
      for (const c of group.children) {
        if (c.type === "rule") n += 1;
        else n += countRules(c);
      }
      return n;
    }
    return countRules(advancedFilter.value.root);
  }, [advancedFilter]);
  const resolvedColumnChooserFields = isAutoColumnChooser ? autoDiscovered.columnChooserFields : columnChooser?.availableColumns ?? [];
  const effectiveColumnChooserFields = React.useMemo(() => {
    if (resolvedColumnChooserFields.length > 0) return resolvedColumnChooserFields;
    return table.getAllLeafColumns().map((col) => ({
      key: col.id,
      label: resolveColumnLabel(col),
      group: t("ui.columnChooser.defaultGroup", "Columns"),
      alwaysVisible: !col.getCanHide()
    }));
  }, [resolvedColumnChooserFields, table, resolveColumnLabel, columns, t]);
  const visibleColumnKeys = React.useMemo(
    () => table.getAllLeafColumns().filter((c) => c.getIsVisible()).map((c) => c.id),
    [table, columnVisibility, columns]
  );
  const selectedRows = React.useMemo(() => {
    if (!hasInjectedBulkActions) return [];
    return table.getSelectedRowModel().rows.map((row) => row.original);
  }, [hasInjectedBulkActions, table, rowSelection]);
  const trackedBulkProgressJobIdsRef = React.useRef(/* @__PURE__ */ new Set());
  const clearTrackedBulkProgressJob = React.useCallback((jobId) => {
    if (!jobId) return false;
    return trackedBulkProgressJobIdsRef.current.delete(jobId);
  }, []);
  const refreshAfterBulkProgressCompletion = React.useCallback(() => {
    if (refreshButton?.onRefresh) {
      refreshButton.onRefresh();
      return;
    }
    scheduleRouterRefresh(router);
  }, [refreshButton, router]);
  useAppEvent(
    "progress.job.completed",
    (event) => {
      const payload = event.payload;
      const jobId = typeof payload?.jobId === "string" ? payload.jobId : null;
      if (!clearTrackedBulkProgressJob(jobId)) return;
      refreshAfterBulkProgressCompletion();
    },
    [clearTrackedBulkProgressJob, refreshAfterBulkProgressCompletion]
  );
  useAppEvent(
    "progress.job.failed",
    (event) => {
      const payload = event.payload;
      const jobId = typeof payload?.jobId === "string" ? payload.jobId : null;
      clearTrackedBulkProgressJob(jobId);
    },
    [clearTrackedBulkProgressJob]
  );
  useAppEvent(
    "progress.job.cancelled",
    (event) => {
      const payload = event.payload;
      const jobId = typeof payload?.jobId === "string" ? payload.jobId : null;
      clearTrackedBulkProgressJob(jobId);
    },
    [clearTrackedBulkProgressJob]
  );
  const runBulkAction = React.useCallback(
    async (action) => {
      if (action.requiresSelection !== false && !selectedRows.length) return;
      try {
        const result = await action.onExecute(selectedRows, {
          tableId: extensionTableId,
          navigate: (href) => router.push(href),
          confirm,
          refresh: refreshButton?.onRefresh,
          injectionContext: resolvedInjectionContext,
          translate: t
        });
        const normalized = result;
        if (normalized && normalized.ok === false) {
          if (normalized.message === void 0) return;
          flash(
            normalized.message ?? t("ui.dataTable.bulkAction.error", "Bulk action failed."),
            "error"
          );
          return;
        }
        if (normalized?.progressJobId) {
          trackedBulkProgressJobIdsRef.current.add(normalized.progressJobId);
          setRowSelection({});
          flash(
            normalized.message ?? t("ui.dataTable.bulkAction.started", "Bulk action started. Track progress in the top bar."),
            "success"
          );
          return;
        }
        flash(
          normalized?.message ?? t("ui.dataTable.bulkAction.success", "Bulk action completed."),
          "success"
        );
        setRowSelection({});
        if (refreshButton?.onRefresh) {
          refreshButton.onRefresh();
        } else {
          scheduleRouterRefresh(router);
        }
      } catch (error2) {
        flash(
          error2 instanceof Error ? error2.message : t("ui.dataTable.bulkAction.error", "Bulk action failed."),
          "error"
        );
      }
    },
    [confirm, extensionTableId, refreshButton, resolvedInjectionContext, router, selectedRows, t]
  );
  const runPropBulkAction = React.useCallback(
    async (action) => {
      try {
        const result = await action.onExecute(selectedRows);
        if (result === false) return;
        if (!result || typeof result !== "object") {
          setRowSelection({});
          return;
        }
        if (result.ok === false) {
          if (result.message === void 0) return;
          flash(result.message, "error");
          return;
        }
        setRowSelection({});
        if (result.progressJobId) {
          trackedBulkProgressJobIdsRef.current.add(result.progressJobId);
          flash(
            result.message ?? t("ui.dataTable.bulkAction.started", "Bulk action started. Track progress in the top bar."),
            "success"
          );
          return;
        }
        flash(
          result.message ?? t("ui.dataTable.bulkAction.success", "Bulk action completed."),
          "success"
        );
        if (refreshButton?.onRefresh) {
          refreshButton.onRefresh();
        } else {
          scheduleRouterRefresh(router);
        }
      } catch (error2) {
        flash(
          error2 instanceof Error ? error2.message : t("ui.dataTable.bulkAction.error", "Bulk action failed."),
          "error"
        );
      }
    },
    [refreshButton, router, selectedRows, t]
  );
  const builtToolbar = React.useMemo(() => {
    if (toolbar) return toolbar;
    const anySearch = onSearchChange != null;
    const suppressFilterBarFilters = !!(advancedFilter && advancedFilter.externalPopover);
    const effectiveBaseFilters = suppressFilterBarFilters ? [] : baseFilters;
    const effectiveCfFilters = suppressFilterBarFilters ? [] : cfFilters;
    const effectiveInjectedFilters = suppressFilterBarFilters ? [] : injectedFilters;
    const anyFilters = effectiveBaseFilters && effectiveBaseFilters.length > 0 || effectiveCfFilters && effectiveCfFilters.length > 0 || effectiveInjectedFilters.length > 0;
    const hasBulkButtons = hasInjectedBulkActions || hasPropBulkActions;
    const hasAdvancedFilterButton = Boolean(advancedFilter);
    const hasPerspectiveButton = canUsePerspectives;
    if (!anySearch && !anyFilters && !hasBulkButtons && !hasAdvancedFilterButton && !hasPerspectiveButton) return null;
    const baseList = effectiveBaseFilters || [];
    const existing = new Set(baseList.map((f) => f.id));
    const cfOnly = (effectiveCfFilters || []).filter((f) => !existing.has(f.id));
    const injectedOnly = effectiveInjectedFilters.filter((f) => !existing.has(f.id) && !cfOnly.some((cf) => cf.id === f.id));
    const combined = [...baseList, ...cfOnly, ...injectedOnly];
    const advancedFilterButton = advancedFilter ? /* @__PURE__ */ jsxs(
      Button,
      {
        ref: advancedFilter.triggerRef,
        type: "button",
        variant: advancedFilterRuleCount > 0 ? "default" : "outline",
        size: "default",
        className: advancedFilterRuleCount > 0 ? "bg-foreground text-background hover:bg-foreground/90" : "",
        onClick: () => {
          if (advancedFilter.externalPopover) {
            advancedFilter.onTriggerClick?.();
            return;
          }
          const opening = !isAdvancedFilterOpen;
          if (opening && advancedFilterRuleCount === 0) {
            const defaultField = resolvedAdvancedFilterFields[0];
            const seeded = treeReducer(advancedFilter.value, {
              type: "addRule",
              groupId: advancedFilter.value.root.id,
              defaultField: defaultField?.key,
              defaultOperator: defaultField ? getDefaultOperator(defaultField.type) : void 0
            });
            advancedFilter.onChange(seeded);
          }
          setAdvancedFilterOpen(opening);
        },
        "aria-label": t("ui.advancedFilter.toggle", "Advanced filters"),
        title: t("ui.advancedFilter.toggle", "Advanced filters"),
        "data-testid": "advanced-filter-trigger",
        children: [
          /* @__PURE__ */ jsx(Filter, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsx("span", { children: t("ui.dataTable.filters", "Filters") }),
          advancedFilterRuleCount > 0 ? /* @__PURE__ */ jsx("span", { className: "ml-1 inline-flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full bg-muted-foreground/30 text-background text-xs", children: advancedFilterRuleCount }) : null
        ]
      }
    ) : null;
    const perspectiveButton = canUsePerspectives ? /* @__PURE__ */ jsx(
      ViewSwitcherDropdown,
      {
        activePerspectiveId,
        perspectives: perspectiveData?.perspectives ?? [],
        rolePerspectives: perspectiveData?.rolePerspectives ?? [],
        onClear: () => applyPerspectiveSettings({}, null),
        onActivate: handlePerspectiveActivate,
        onOpenSidebar: () => setPerspectiveOpen(true),
        t
      }
    ) : null;
    const fieldsetSelector = supportsCustomFieldFilterFieldsets && resolvedEntityIds.length === 1 ? /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
      /* @__PURE__ */ jsx("div", { className: "text-xs font-medium uppercase tracking-wide text-muted-foreground", children: t("ui.dataTable.fieldset.label", "Fieldset") }),
      /* @__PURE__ */ jsxs(
        Select,
        {
          value: activeCustomFieldFilterFieldset || void 0,
          onValueChange: (value) => handleCustomFieldFilterFieldsetChange(value),
          children: [
            /* @__PURE__ */ jsx(SelectTrigger, { children: /* @__PURE__ */ jsx(SelectValue, {}) }),
            /* @__PURE__ */ jsx(SelectContent, { children: (cfFilterFieldsetsByEntity[resolvedEntityIds[0]] ?? []).map((fieldset) => /* @__PURE__ */ jsx(SelectItem, { value: fieldset.code, children: fieldset.label }, fieldset.code)) })
          ]
        }
      )
    ] }) : null;
    const perspectiveButtonLeading = perspectiveAlign === "right" ? null : perspectiveButton;
    const saveViewButton = showSaveViewButton && canUsePerspectives ? /* @__PURE__ */ jsxs(
      Button,
      {
        type: "button",
        variant: "outline",
        size: "default",
        disabled: !viewDirtyState.isDirty || savePerspectiveMutation.isPending,
        onClick: () => {
          void handleSaveViewClick();
        },
        title: viewDirtyState.isDirty ? t("ui.dataTable.saveView.title", "Save the current view") : t("ui.dataTable.saveView.noChanges", "No unsaved changes"),
        "data-testid": "save-view-trigger",
        children: [
          savePerspectiveMutation.isPending ? /* @__PURE__ */ jsx(Loader2, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsx(Save, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsx("span", { children: t("ui.dataTable.saveView.button", "Save view") }),
          viewDirtyState.changedCount > 0 ? /* @__PURE__ */ jsx("span", { className: "ml-1 inline-flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full bg-muted-foreground/30 text-background text-xs", children: viewDirtyState.changedCount }) : null
        ]
      }
    ) : null;
    const leadingItems = advancedFilterButton || perspectiveButtonLeading || saveViewButton ? /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
      advancedFilterButton,
      perspectiveButtonLeading,
      saveViewButton
    ] }) : null;
    const trailingItems = hasBulkButtons ? /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
      selectedRows.length > 0 ? /* @__PURE__ */ jsx("span", { className: "text-sm text-muted-foreground", children: t("ui.dataTable.bulkAction.selectedCount", "{count} selected", { count: selectedRows.length }) }) : null,
      injectedBulkActions.map((action) => {
        const label = t(action.label, action.label);
        const iconNode = resolveInjectedIcon(action.icon, "h-4 w-4 shrink-0");
        return /* @__PURE__ */ jsxs(
          Button,
          {
            type: "button",
            variant: "outline",
            title: label,
            "aria-label": label,
            className: iconNode ? "px-2 sm:px-3" : void 0,
            disabled: action.requiresSelection !== false && selectedRows.length === 0,
            onClick: () => void runBulkAction(action),
            children: [
              iconNode,
              /* @__PURE__ */ jsx("span", { className: iconNode ? "hidden sm:inline" : void 0, children: label })
            ]
          },
          action.id
        );
      }),
      selectedRows.length > 0 ? (bulkActionsProp ?? []).map((action) => {
        const ActionIcon = action.icon;
        return /* @__PURE__ */ jsxs(
          Button,
          {
            type: "button",
            variant: action.destructive ? "destructive" : "outline",
            onClick: () => void runPropBulkAction(action),
            children: [
              ActionIcon ? /* @__PURE__ */ jsx(ActionIcon, { className: "h-4 w-4 shrink-0" }) : null,
              /* @__PURE__ */ jsx("span", { children: action.label })
            ]
          },
          action.id
        );
      }) : null
    ] }) : null;
    const searchTrailingNode = searchTrailingInjectionSpotId && onSearchChange ? /* @__PURE__ */ jsx(InjectionSpot, { spotId: searchTrailingInjectionSpotId, context: resolvedInjectionContext }) : null;
    if (perspectiveAlign === "right" && !anySearch && combined.length === 0 && !advancedFilterButton && !saveViewButton && !trailingItems && !fieldsetSelector) return null;
    return /* @__PURE__ */ jsx(
      FilterBar,
      {
        searchValue,
        onSearchChange,
        searchPlaceholder,
        searchAlign,
        filters: combined,
        values: filterValues,
        onApply: onFiltersApply,
        onClear: onFiltersClear,
        leadingItems,
        trailingItems,
        searchTrailing: searchTrailingNode,
        filtersExtraContent: fieldsetSelector,
        layout: embedded ? "inline" : "stacked",
        className: embedded ? "min-h-[2.25rem]" : void 0
      }
    );
  }, [
    toolbar,
    searchValue,
    onSearchChange,
    searchPlaceholder,
    searchAlign,
    baseFilters,
    cfFilters,
    injectedFilters,
    filterValues,
    onFiltersApply,
    onFiltersClear,
    canUsePerspectives,
    perspectiveAlign,
    embedded,
    supportsCustomFieldFilterFieldsets,
    resolvedEntityIds,
    activeCustomFieldFilterFieldset,
    handleCustomFieldFilterFieldsetChange,
    cfFilterFieldsetsByEntity,
    hasInjectedBulkActions,
    hasPropBulkActions,
    injectedBulkActions,
    bulkActionsProp,
    selectedRows.length,
    selectedRows,
    runBulkAction,
    runPropBulkAction,
    searchTrailingInjectionSpotId,
    resolvedInjectionContext,
    advancedFilter,
    advancedFilterRuleCount,
    isAdvancedFilterOpen,
    resolvedAdvancedFilterFields,
    showSaveViewButton,
    viewDirtyState,
    savePerspectiveMutation.isPending,
    handleSaveViewClick,
    t
  ]);
  const hasTitle = title != null;
  const hasActions = actions !== void 0 && actions !== null && actions !== false;
  const shouldReserveActionsSpace = actions === null || actions === false;
  const exportConfig = exporter === false ? null : exporter || null;
  const resolvedExportSections = React.useMemo(() => resolveExportSections(exportConfig, t), [exportConfig, t]);
  const hasExport = resolvedExportSections.length > 0;
  const refreshButtonConfig = refreshButton;
  const hasRefreshButton = Boolean(refreshButtonConfig);
  const hasToolbar = builtToolbar != null;
  const hasToolbarInjection = Boolean(toolbarInjectionSpotId);
  const shouldRenderActionsWrapper = hasActions || hasRefreshButton || shouldReserveActionsSpace || hasExport || hasToolbarInjection;
  const renderToolbarInline = embedded && hasToolbar;
  const shouldRenderToolbarBelow = hasToolbar && !renderToolbarInline;
  const shouldRenderHeader = hasTitle || renderToolbarInline || shouldRenderActionsWrapper || shouldRenderToolbarBelow;
  const containerClassName = embedded ? "" : "rounded-lg border bg-card mx-1 sm:mx-2";
  const headerWrapperClassName = embedded ? "pb-3" : "px-4 py-3 border-b";
  const headerContentClassName = "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between";
  const toolbarWrapperClassName = embedded ? "mt-2" : "mt-3 pt-3 border-t";
  const tableScrollWrapperClassName = embedded ? "isolate" : "isolate overflow-auto";
  const virtualScrollRef = React.useRef(null);
  const [tableScrollEl, setTableScrollEl] = React.useState(null);
  const [emptyStateViewportWidth, setEmptyStateViewportWidth] = React.useState(null);
  const setTableScrollWrapperRef = React.useCallback((node) => {
    setTableScrollEl(node);
    virtualScrollRef.current = node;
  }, []);
  React.useEffect(() => {
    if (!tableScrollEl || typeof ResizeObserver === "undefined") return;
    const update = () => setEmptyStateViewportWidth(tableScrollEl.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(tableScrollEl);
    return () => observer.disconnect();
  }, [tableScrollEl]);
  const allRows = table.getRowModel().rows;
  const rowVirtualizerInstance = useVirtualizer({
    count: virtualized ? allRows.length : 0,
    getScrollElement: () => virtualized ? virtualScrollRef.current : null,
    estimateSize: () => 48,
    overscan: virtualizedOverscan
  });
  const rowVirtualizer = virtualized ? rowVirtualizerInstance : null;
  const virtualMaxHeightStyle = virtualized ? {
    maxHeight: typeof virtualizedMaxHeight === "number" ? `${virtualizedMaxHeight}px` : virtualizedMaxHeight ?? "calc(100vh - 300px)",
    overflow: "auto"
  } : void 0;
  const TitleHeading = titleHeadingLevel === 1 ? "h1" : "h2";
  const titleContent = hasTitle ? /* @__PURE__ */ jsx("div", { className: "text-base font-semibold leading-tight min-h-[2.25rem] flex items-center", children: typeof title === "string" || titleHeadingLevel ? /* @__PURE__ */ jsx(TitleHeading, { className: "text-base font-semibold", children: title }) : title }) : /* @__PURE__ */ jsx("div", { className: "min-h-[2.25rem]" });
  return /* @__PURE__ */ jsx(TooltipProvider, { delayDuration: 300, children: /* @__PURE__ */ jsxs("div", { ref: containerRef, className: containerClassName, "data-component-handle": resolvedReplacementHandle, children: [
    shouldRenderHeader && /* @__PURE__ */ jsxs("div", { className: headerWrapperClassName, children: [
      (hasTitle || shouldRenderActionsWrapper || renderToolbarInline) && /* @__PURE__ */ jsxs("div", { className: headerContentClassName, children: [
        /* @__PURE__ */ jsx("div", { className: "flex-1 min-w-0 sm:basis-48", children: renderToolbarInline ? builtToolbar : titleContent }),
        shouldRenderActionsWrapper ? /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2 min-h-[2.25rem] sm:ml-auto sm:justify-end", children: [
          refreshButtonConfig ? /* @__PURE__ */ jsxs(
            Button,
            {
              type: "button",
              variant: "ghost",
              size: "icon",
              onClick: refreshButtonConfig.onRefresh,
              "aria-label": refreshButtonConfig.label,
              title: refreshButtonConfig.label,
              disabled: refreshButtonConfig.disabled || refreshButtonConfig.isRefreshing,
              children: [
                refreshButtonConfig.isRefreshing ? /* @__PURE__ */ jsx(Loader2, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsx(RefreshCw, { className: "h-4 w-4" }),
                /* @__PURE__ */ jsx("span", { className: "sr-only", children: refreshButtonConfig.label })
              ]
            }
          ) : null,
          canUsePerspectives ? perspectiveAlign === "right" ? /* @__PURE__ */ jsx(
            ViewSwitcherDropdown,
            {
              activePerspectiveId,
              perspectives: perspectiveData?.perspectives ?? [],
              rolePerspectives: perspectiveData?.rolePerspectives ?? [],
              onClear: () => applyPerspectiveSettings({}, null),
              onActivate: handlePerspectiveActivate,
              onOpenSidebar: () => setPerspectiveOpen(true),
              t
            }
          ) : /* @__PURE__ */ jsxs(
            Button,
            {
              type: "button",
              variant: "ghost",
              size: "icon",
              onClick: () => setPerspectiveOpen(true),
              "aria-label": t("ui.dataTable.customizeColumns.ariaLabel", "Customize columns"),
              title: t("ui.dataTable.customizeColumns.title", "Customize columns"),
              children: [
                /* @__PURE__ */ jsx(MoreHorizontal, { className: "h-4 w-4" }),
                /* @__PURE__ */ jsx("span", { className: "sr-only", children: t("ui.dataTable.customizeColumns.srOnly", "Customize columns") })
              ]
            }
          ) : null,
          exportConfig && hasExport ? /* @__PURE__ */ jsx(ExportMenu, { config: exportConfig, sections: resolvedExportSections }) : null,
          toolbarInjectionSpotId ? /* @__PURE__ */ jsx(InjectionSpot, { spotId: toolbarInjectionSpotId, context: resolvedInjectionContext }) : null,
          hasActions ? actions : null
        ] }) : null
      ] }),
      shouldRenderToolbarBelow ? /* @__PURE__ */ jsx("div", { className: toolbarWrapperClassName, children: builtToolbar }) : null,
      headerInjectionSpotId ? /* @__PURE__ */ jsx("div", { className: embedded ? "mt-2" : "mt-3", children: /* @__PURE__ */ jsx(InjectionSpot, { spotId: headerInjectionSpotId, context: resolvedInjectionContext }) }) : null
    ] }),
    advancedFilter && !advancedFilter.externalPopover && isAdvancedFilterOpen ? /* @__PURE__ */ jsx("div", { className: "border-b", children: /* @__PURE__ */ jsx(
      AdvancedFilterBuilder,
      {
        fields: resolvedAdvancedFilterFields,
        value: advancedFilter.value,
        onChange: advancedFilter.onChange,
        onApply: () => {
          advancedFilter.onApply();
          setAdvancedFilterOpen(false);
        },
        onClear: () => {
          advancedFilter.onClear();
          setAdvancedFilterOpen(false);
        }
      }
    ) }) : null,
    advancedFilter && !advancedFilter.externalPopover && advancedFilterRuleCount > 0 && !isAdvancedFilterOpen ? /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 flex-wrap px-4 py-2 border-b text-sm", children: [
      /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: t("ui.advancedFilter.activeCount", "{count} active filters", { count: advancedFilterRuleCount }) }),
      /* @__PURE__ */ jsx(Button, { type: "button", variant: "ghost", size: "sm", className: "h-auto px-1 py-0.5 text-xs", onClick: () => setAdvancedFilterOpen(true), children: t("ui.advancedFilter.edit", "Edit") }),
      /* @__PURE__ */ jsx(Button, { type: "button", variant: "ghost", size: "sm", className: "h-auto px-1 py-0.5 text-xs text-muted-foreground", onClick: advancedFilter.onClear, children: t("ui.advancedFilter.clearAll", "Clear all") })
    ] }) : null,
    activeFilterChips,
    /* @__PURE__ */ jsx(
      HeaderDndWrapper,
      {
        enabled: enableHeaderDnd,
        contextId: `${stableDndContextId}-headers`,
        sensors: dndSensors,
        columnIds: headerColumnIds,
        onDragEnd: handleHeaderDragEnd,
        children: /* @__PURE__ */ jsx("div", { ref: setTableScrollWrapperRef, className: tableScrollWrapperClassName, style: virtualMaxHeightStyle, children: /* @__PURE__ */ jsxs(Table, { className: "min-w-[640px] md:min-w-0", children: [
          /* @__PURE__ */ jsx(TableHeader, { children: table.getHeaderGroups().map((hg) => /* @__PURE__ */ jsxs(TableRow, { children: [
            hasInjectedBulkActions ? /* @__PURE__ */ jsx(TableHead, { className: "w-8", children: /* @__PURE__ */ jsx(
              Checkbox,
              {
                checked: table.getIsAllPageRowsSelected(),
                onCheckedChange: (checked) => {
                  table.toggleAllPageRowsSelected(Boolean(checked));
                },
                "aria-label": t("ui.dataTable.bulkAction.selectAll", "Select all rows")
              }
            ) }) : null,
            hg.headers.map((header, headerIndex) => {
              const columnMeta = header.column.columnDef?.meta;
              const priority = resolvePriority(header.column);
              const isFirstDataColumn = headerIndex === 0;
              const stickyClass = stickyFirstColumn && isFirstDataColumn ? ` md:sticky md:left-0 md:z-10 md:bg-background ${STICKY_LEFT_SHADOW_CLASS}` : "";
              const isColumnSortable = sortable && !!header.column.getCanSort?.();
              const headerContent = header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext());
              const headerCellContent = header.isPlaceholder ? null : isColumnSortable ? /* @__PURE__ */ jsxs(
                Button,
                {
                  variant: "ghost",
                  type: "button",
                  className: "h-auto p-0 has-[>svg]:px-0 font-medium cursor-pointer select-none",
                  onClick: () => header.column.toggleSorting?.(header.column.getIsSorted() === "asc"),
                  children: [
                    headerContent,
                    (() => {
                      const sortState = header.column.getIsSorted();
                      if (sortState === "asc") return /* @__PURE__ */ jsx(ChevronUp, { className: "ml-1 size-3.5 shrink-0 text-foreground", "aria-hidden": "true" });
                      if (sortState === "desc") return /* @__PURE__ */ jsx(ChevronDown, { className: "ml-1 size-3.5 shrink-0 text-foreground", "aria-hidden": "true" });
                      return /* @__PURE__ */ jsx(ChevronsUpDown, { className: "ml-1 size-3.5 shrink-0 text-muted-foreground/50", "aria-hidden": "true" });
                    })()
                  ]
                }
              ) : /* @__PURE__ */ jsx("div", { className: "h-auto p-0 has-[>svg]:px-0 font-medium", children: headerContent });
              const columnId = header.column.id;
              const sizedWidth = enableColumnResize && columnId ? columnSizing[columnId] : void 0;
              const resizeHandle = enableColumnResize && !header.isPlaceholder && columnId ? /* @__PURE__ */ jsx(
                ColumnResizeHandle,
                {
                  columnId,
                  onResize: handleColumnResize,
                  onCommit: commitColumnSizing,
                  onReset: resetColumnSize,
                  ariaLabel: t("ui.dataTable.resizeColumn", "Resize column")
                }
              ) : null;
              return enableHeaderDnd ? /* @__PURE__ */ jsxs(SortableHeaderCell, { id: header.id, width: sizedWidth, ariaSort: ariaSortFor(header.column.getIsSorted()), className: cn("group", responsiveClass(priority, columnMeta?.hidden) + stickyClass), children: [
                headerCellContent,
                resizeHandle
              ] }, header.id) : /* @__PURE__ */ jsxs(
                TableHead,
                {
                  className: cn("group relative", responsiveClass(priority, columnMeta?.hidden) + stickyClass),
                  "aria-sort": ariaSortFor(header.column.getIsSorted()),
                  style: typeof sizedWidth === "number" ? { width: sizedWidth, minWidth: sizedWidth, maxWidth: sizedWidth } : void 0,
                  children: [
                    headerCellContent,
                    resizeHandle
                  ]
                },
                header.id
              );
            }),
            rowActions || injectedRowActions.length > 0 ? /* @__PURE__ */ jsx(
              TableHead,
              {
                className: cn(
                  actionsColumnAlign === "center" ? "w-0 text-center" : "w-0 text-right",
                  stickyActionsColumn && `md:sticky md:right-0 md:z-20 md:bg-background ${STICKY_RIGHT_SHADOW_CLASS}`
                ),
                children: t("ui.dataTable.actionsColumn", "Actions")
              }
            ) : null
          ] }, hg.id)) }),
          /* @__PURE__ */ jsx(TableBody, { children: isLoading ? /* @__PURE__ */ jsx(TableRow, { children: /* @__PURE__ */ jsx(TableCell, { colSpan: mergedColumns.length + (rowActions || injectedRowActions.length > 0 ? 1 : 0) + (hasInjectedBulkActions ? 1 : 0), className: "h-24 text-center", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-center gap-2", children: [
            /* @__PURE__ */ jsx(Spinner, { size: "md" }),
            /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: t("ui.dataTable.loading", "Loading data...") })
          ] }) }) }) : error ? /* @__PURE__ */ jsx(TableRow, { children: /* @__PURE__ */ jsx(TableCell, { colSpan: mergedColumns.length + (rowActions || injectedRowActions.length > 0 ? 1 : 0) + (hasInjectedBulkActions ? 1 : 0), className: "h-24 text-center text-destructive", children: /* @__PURE__ */ jsxs("span", { className: "flex flex-col items-center gap-2", children: [
            /* @__PURE__ */ jsx("img", { src: "/brand/state-error.svg", alt: "", "aria-hidden": true, width: 160, height: 120, className: "opacity-80" }),
            error
          ] }) }) }) : allRows.length ? /* @__PURE__ */ jsxs(Fragment, { children: [
            virtualized && rowVirtualizer ? /* @__PURE__ */ jsx(Fragment, { children: rowVirtualizer.getVirtualItems()[0]?.start > 0 ? /* @__PURE__ */ jsx("tr", { style: { height: `${rowVirtualizer.getVirtualItems()[0].start}px` } }) : null }) : null,
            (virtualized && rowVirtualizer ? rowVirtualizer.getVirtualItems().map((vi) => allRows[vi.index]) : allRows).map((row) => {
              const rowActionsElement = resolvedRowActions(row.original);
              const defaultRowAction = onRowClick ? null : pickDefaultRowAction(rowActionsElement, resolvedRowClickActionIds);
              const isClickable = !disableRowClick && (onRowClick || defaultRowAction);
              return /* @__PURE__ */ jsxs(
                TableRow,
                {
                  "data-state": row.getIsSelected() && "selected",
                  className: isClickable ? "cursor-pointer hover:bg-muted/50 transition-colors" : "",
                  onClick: isClickable ? (e) => {
                    if (e.target.closest("[data-actions-cell]")) {
                      return;
                    }
                    if (onRowClick) {
                      onRowClick(row.original, e);
                    } else if (defaultRowAction) {
                      if (defaultRowAction.href) {
                        router.push(defaultRowAction.href);
                      } else if (defaultRowAction.onSelect) {
                        defaultRowAction.onSelect();
                      }
                    }
                  } : void 0,
                  children: [
                    hasInjectedBulkActions ? /* @__PURE__ */ jsx(TableCell, { className: "w-8", children: /* @__PURE__ */ jsx(
                      Checkbox,
                      {
                        checked: row.getIsSelected(),
                        onCheckedChange: (checked) => row.toggleSelected(Boolean(checked)),
                        "aria-label": t("ui.dataTable.bulkAction.selectRow", "Select row"),
                        onClick: (event) => event.stopPropagation()
                      }
                    ) }) : null,
                    row.getVisibleCells().map((cell, cellIndex) => {
                      const columnMeta = cell.column.columnDef?.meta;
                      const priority = resolvePriority(cell.column);
                      const isStickyCell = stickyFirstColumn && cellIndex === 0;
                      const hasCustomCell = Boolean(cell.column.columnDef.cell);
                      const columnId = String(cell.column.id || "");
                      const accessorKey = String(cell.column.columnDef?.accessorKey || "");
                      const isDateCol = dateColumnIds ? dateColumnIds.has(columnId) : false;
                      let content;
                      if (isDateCol) {
                        const raw = cell.getValue();
                        const d = tryParseDate(raw);
                        content = d ? formatDisplayDateTime(d, dateLocale) ?? raw : raw;
                      } else {
                        content = flexRender(cell.column.columnDef.cell, cell.getContext());
                      }
                      const skipTruncation = shouldSkipTruncation(columnId);
                      const truncateConfig = getColumnTruncateConfig(columnId, accessorKey, columnMeta);
                      const shouldTruncate = truncateConfig.truncate && !skipTruncation;
                      const maxWidth = truncateConfig.maxWidth;
                      const cellValue = cell.getValue();
                      const metaTooltipContent = columnMeta?.tooltipContent;
                      let tooltipText;
                      if (metaTooltipContent) {
                        tooltipText = metaTooltipContent(row.original);
                      } else if (isDateCol && cellValue != null) {
                        const parsedDate = tryParseDate(cellValue);
                        tooltipText = parsedDate ? formatDisplayDateTime(parsedDate, dateLocale) ?? String(cellValue) : String(cellValue);
                      } else {
                        tooltipText = cellValue != null ? String(cellValue) : void 0;
                      }
                      const sizedWidth = enableColumnResize && columnId ? columnSizing[columnId] : void 0;
                      const effectiveMaxWidth = typeof sizedWidth === "number" ? `${sizedWidth}px` : maxWidth;
                      const wrappedContent = shouldTruncate ? /* @__PURE__ */ jsx(TruncatedCell, { maxWidth: effectiveMaxWidth, tooltipContent: tooltipText, children: content }) : content;
                      const expandAffordance = expansionEnabled && cellIndex === 0 ? /* @__PURE__ */ jsx(
                        "span",
                        {
                          className: "inline-flex shrink-0 items-center",
                          style: { paddingLeft: `${row.depth * 1.25}rem` },
                          children: row.getCanExpand() ? /* @__PURE__ */ jsx(
                            IconButton,
                            {
                              type: "button",
                              variant: "ghost",
                              size: "xs",
                              "aria-label": row.getIsExpanded() ? t("ui.dataTable.expand.collapseRow", "Collapse row") : t("ui.dataTable.expand.expandRow", "Expand row"),
                              "aria-expanded": row.getIsExpanded(),
                              onClick: (event) => {
                                event.stopPropagation();
                                row.toggleExpanded();
                              },
                              children: row.getIsExpanded() ? /* @__PURE__ */ jsx(ChevronDown, { className: "size-4", "aria-hidden": "true" }) : /* @__PURE__ */ jsx(ChevronRight, { className: "size-4", "aria-hidden": "true" })
                            }
                          ) : /* @__PURE__ */ jsx("span", { className: "inline-block size-6", "aria-hidden": "true" })
                        }
                      ) : null;
                      return /* @__PURE__ */ jsx(
                        TableCell,
                        {
                          className: responsiveClass(priority, columnMeta?.hidden) + (isStickyCell ? ` md:sticky md:left-0 md:z-10 md:bg-background ${STICKY_LEFT_SHADOW_CLASS}` : ""),
                          style: typeof sizedWidth === "number" ? { width: sizedWidth, minWidth: sizedWidth, maxWidth: sizedWidth } : void 0,
                          children: expandAffordance ? /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
                            expandAffordance,
                            /* @__PURE__ */ jsx("span", { className: "min-w-0 flex-1", children: wrappedContent })
                          ] }) : wrappedContent
                        },
                        cell.id
                      );
                    }),
                    rowActions || injectedRowActions.length > 0 ? /* @__PURE__ */ jsx(
                      TableCell,
                      {
                        className: cn(
                          actionsColumnAlign === "center" ? "text-center whitespace-nowrap" : "text-right whitespace-nowrap",
                          stickyActionsColumn && `md:sticky md:right-0 md:z-10 md:bg-background ${STICKY_RIGHT_SHADOW_CLASS}`
                        ),
                        "data-actions-cell": true,
                        children: rowActionsElement
                      }
                    ) : null
                  ]
                },
                row.id
              );
            }),
            virtualized && rowVirtualizer ? (() => {
              const virtualItems = rowVirtualizer.getVirtualItems();
              const lastItem = virtualItems[virtualItems.length - 1];
              const bottomPadding = lastItem ? rowVirtualizer.getTotalSize() - lastItem.end : 0;
              return bottomPadding > 0 ? /* @__PURE__ */ jsx("tr", { style: { height: `${bottomPadding}px` } }) : null;
            })() : null
          ] }) : /* @__PURE__ */ jsx(TableRow, { children: /* @__PURE__ */ jsx(TableCell, { colSpan: mergedColumns.length + (rowActions || injectedRowActions.length > 0 ? 1 : 0) + (hasInjectedBulkActions ? 1 : 0), className: "p-0", children: /* @__PURE__ */ jsx(
            "div",
            {
              className: cn("sticky left-0 flex justify-center py-6", emptyStateViewportWidth ? "" : "w-fit"),
              style: emptyStateViewportWidth ? { width: emptyStateViewportWidth } : void 0,
              children: filterAwareEmptyState?.active ? /* @__PURE__ */ jsx(
                FilteredEmptyResults,
                {
                  entityNamePlural: filterAwareEmptyState.entityNamePlural,
                  canRemoveLast: filterAwareEmptyState.canRemoveLast,
                  onClearAll: filterAwareEmptyState.onClearAll,
                  onRemoveLast: filterAwareEmptyState.onRemoveLast,
                  onClearSearch: searchValue && searchValue.trim().length > 0 && onSearchChange ? () => onSearchChange("") : void 0
                }
              ) : searchValue && searchValue.trim().length > 0 && onSearchChange ? /* @__PURE__ */ jsx(
                SearchEmptyResults,
                {
                  query: searchValue.trim(),
                  entityNamePlural: filterAwareEmptyState?.entityNamePlural,
                  onClearSearch: () => onSearchChange("")
                }
              ) : emptyState && typeof emptyState !== "string" ? emptyState : /* @__PURE__ */ jsx(
                EmptyState,
                {
                  variant: "subtle",
                  illustration: /* @__PURE__ */ jsx(
                    "img",
                    {
                      src: "/brand/state-empty.svg",
                      alt: "",
                      "aria-hidden": true,
                      width: 160,
                      height: 120,
                      className: "opacity-70 text-muted-foreground"
                    }
                  ),
                  icon: /* @__PURE__ */ jsx(Inbox, { className: "size-6", "aria-hidden": true }),
                  title: typeof emptyState === "string" ? emptyState : t("ui.dataTable.emptyState.default", "No results."),
                  description: typeof emptyState === "string" ? void 0 : t("ui.dataTable.emptyState.defaultDescription", "Items will appear here once added.")
                }
              )
            }
          ) }) }) })
        ] }) })
      }
    ),
    footerInjectionSpotId ? /* @__PURE__ */ jsx("div", { className: embedded ? "mt-3" : "px-4 py-3 border-t", children: /* @__PURE__ */ jsx(InjectionSpot, { spotId: footerInjectionSpotId, context: resolvedInjectionContext }) }) : null,
    paginationNode,
    ConfirmDialogElement,
    canUsePerspectives ? /* @__PURE__ */ jsx(
      PerspectiveSidebar,
      {
        open: isPerspectiveOpen,
        onOpenChange: setPerspectiveOpen,
        loading: perspectiveQuery.isFetching && !perspectiveQuery.data,
        perspectives: perspectiveData?.perspectives ?? [],
        rolePerspectives: perspectiveData?.rolePerspectives ?? [],
        roles: perspectiveData?.roles ?? [],
        activePerspectiveId,
        onActivatePerspective: handlePerspectiveActivate,
        onDeletePerspective: handlePerspectiveDelete,
        onClearRole: handleClearRole,
        onSave: handlePerspectiveSave,
        canApplyToRoles: Boolean(perspectiveData?.canApplyToRoles && canUseRoleDefaultsFeature),
        availableColumns: effectiveColumnChooserFields,
        visibleColumnKeys,
        columnOrder,
        onToggleColumn: handleColumnChooserToggle,
        onReorderColumns: handleColumnChooserReorder,
        saving: savePerspectiveMutation.isPending,
        deletingIds,
        roleClearingIds,
        apiWarning: perspectiveApiWarning
      }
    ) : null
  ] }) });
}
const DataTableFallback = DataTableImpl;
function DataTable(props) {
  const extensionTableId = props.perspective?.tableId ?? props.extensionTableId ?? (props.injectionSpotId?.startsWith("data-table:") ? props.injectionSpotId.slice("data-table:".length) : null);
  const handle = props.replacementHandle ?? ComponentReplacementHandles.dataTable(extensionTableId ?? "unknown");
  const Resolved = useRegisteredComponent(
    handle,
    DataTableFallback
  );
  return /* @__PURE__ */ jsx(Resolved, { ...props });
}
export {
  DataTable,
  clearAllPerspectiveState,
  readPerspectiveSnapshot,
  sanitizePerspectiveSettings,
  withDataTableNamespaces,
  writePerspectiveSnapshot
};
//# sourceMappingURL=DataTable.js.map
