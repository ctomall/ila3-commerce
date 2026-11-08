"use client";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import * as React from "react";
import { extensionPoints } from "@open-mercato/core/modules/customers/extension-points";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Page, PageBody } from "@open-mercato/ui/backend/Page";
import { DataTable, withDataTableNamespaces } from "@open-mercato/ui/backend/DataTable";
import { createEmptyTree, makeRuleTree, makeMultiRuleTree } from "@open-mercato/shared/lib/query/advanced-filter-tree";
import { deserializeTree, deserializeAdvancedFilter, flatToTree, mapDictionaryColorToTone, serializeTree } from "@open-mercato/shared/lib/query/advanced-filter";
import { useCurrentUserId } from "@open-mercato/ui/backend/utils/useCurrentUserId";
import { useCurrentOrganization } from "@open-mercato/ui/backend/BackendChromeProvider";
import { apiCall, withScopedApiRequestHeaders } from "@open-mercato/ui/backend/utils/apiCall";
import { buildOptimisticLockHeader } from "@open-mercato/ui/backend/utils/optimisticLock";
import { surfaceRecordConflict } from "@open-mercato/ui/backend/conflicts";
import { buildCrudExportUrl, deleteCrud } from "@open-mercato/ui/backend/utils/crud";
import { groupBulkDeleteFailures, runBulkDelete } from "@open-mercato/ui/backend/utils/bulkDelete";
import { useGuardedMutation } from "@open-mercato/ui/backend/injection/useGuardedMutation";
import { coalesceLastOperations } from "@open-mercato/ui/backend/operations/store";
import { flash } from "@open-mercato/ui/backend/FlashMessages";
import { RowActions } from "@open-mercato/ui/backend/RowActions";
import { Button } from "@open-mercato/ui/primitives/button";
import { IconButton } from "@open-mercato/ui/primitives/icon-button";
import { StatusBadge } from "@open-mercato/ui/primitives/status-badge";
import { Avatar, AvatarStack } from "@open-mercato/ui/primitives/avatar";
import { Tag } from "@open-mercato/ui/primitives/tag";
import { SimpleTooltip } from "@open-mercato/ui/primitives/tooltip";
import { Briefcase, AlertTriangle, X } from "lucide-react";
import { isLostDealStatus, isWonDealStatus } from "../../../lib/dealStatus.js";
import { formatRelativeTime } from "@open-mercato/shared/lib/time";
import { useRegisteredComponent } from "@open-mercato/ui/backend/injection/useRegisteredComponent";
import {
  ViewTabsRow,
  VIEW_TABS_ROW_COMPONENT_ID
} from "./pipeline/components/ViewTabsRow.js";
import { DealsKpiStrip } from "../../../components/DealsKpiStrip.js";
import { E } from "../../../../../generated/entities.ids.generated.js";
import { useOrganizationScopeVersion } from "@open-mercato/shared/lib/frontend/useOrganizationScope";
import { useLocale, useT } from "@open-mercato/shared/lib/i18n/context";
import { useConfirmDialog } from "@open-mercato/ui/backend/confirm-dialog";
import { resolveCustomFieldOptionLabel } from "../../../lib/customFieldOptionLabel.js";
import {
  ensureCustomerDictionary,
  invalidateCustomerDictionary
} from "../../../components/detail/hooks/useCustomerDictionary.js";
import {
  useCustomFieldDefs
} from "@open-mercato/ui/backend/utils/customFieldDefs";
import {
  mapCustomFieldKindToFilterType,
  normalizeCustomFieldFilterOptions,
  supportsCustomFieldColumn
} from "@open-mercato/ui/backend/utils/customFieldColumns";
import { CollectionPreviewCell, normalizeCollectionLabels } from "../../../components/list/CollectionPreviewCell.js";
import { useAutoDiscoveredFields } from "@open-mercato/ui/backend/utils/useAutoDiscoveredFields";
import { useAdvancedFilterTree } from "@open-mercato/ui/backend/hooks/useAdvancedFilter";
import { AdvancedFilterPanel } from "@open-mercato/ui/backend/filters/AdvancedFilterPanel";
import { ActiveFilterChips } from "@open-mercato/ui/backend/filters/ActiveFilterChips";
import { ListEmptyState } from "@open-mercato/ui/backend/filters/ListEmptyState";
import {
  ensureCurrentUserFilterOption,
  fetchCurrentUserName,
  fetchAssignableStaffMembers,
  mapAssignableStaffToFilterOptions
} from "../../../lib/assignableStaff.js";
import { createLogger } from "@open-mercato/shared/lib/logger";
import { UserCircle2 } from "lucide-react";
import { ReassignOwnerDialog } from "./components/ReassignOwnerDialog.js";
import { requestBulkOwnerReassignment, buildReassignOwnerSuccess } from "../../../lib/reassignDealOwner.js";
const logger = createLogger("customers");
function makeDealsPresets() {
  return [
    {
      id: "my-deals",
      labelKey: "customers.deals.presets.myDeals",
      requiresUser: true,
      build: ({ userId }) => makeRuleTree({ field: "owner_user_id", operator: "is", value: userId })
    },
    {
      id: "closing-month",
      labelKey: "customers.deals.presets.closingMonth",
      iconName: "clock",
      build: ({ now }) => {
        const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
        return makeRuleTree({ field: "expected_close_at", operator: "between", value: [start, end] });
      }
    },
    // The Deal entity has no dedicated "at risk" or health-score field — `customer_deals`
    // exposes only `status` (open/win/lost/closed/in_progress, dictionary-driven) and
    // `closure_outcome`. Rather than fabricate a mapping, the "At risk" preset is omitted
    // until the data model exposes a first-class signal.
    {
      id: "won-quarter",
      labelKey: "customers.deals.presets.wonQuarter",
      build: ({ now }) => {
        const quarter = Math.floor(now.getMonth() / 3);
        const start = new Date(now.getFullYear(), quarter * 3, 1).toISOString().slice(0, 10);
        return makeMultiRuleTree([
          { field: "status", operator: "is", value: "win" },
          { field: "expected_close_at", operator: "is_after", value: start }
        ], "and");
      }
    }
  ];
}
const PAGE_SIZE = 20;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(value) {
  if (!value) return false;
  return UUID_REGEX.test(value.trim());
}
function normalizeIdCandidates(raw) {
  const set = /* @__PURE__ */ new Set();
  raw.forEach((candidate) => {
    candidate.split(",").map((part) => part.trim()).filter((part) => part.length > 0).forEach((part) => {
      if (isUuid(part)) set.add(part);
    });
  });
  return Array.from(set);
}
function extractIdsFromParams(params, key) {
  if (!params) return [];
  const values = params.getAll(key);
  return normalizeIdCandidates(values);
}
function formatDateValue(value, fallback) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString();
}
const STATUS_BADGE_VARIANTS = /* @__PURE__ */ new Set([
  "success",
  "warning",
  "error",
  "info",
  "neutral"
]);
function coerceStatusBadgeVariant(tone) {
  if (tone && STATUS_BADGE_VARIANTS.has(tone)) {
    return tone;
  }
  return "neutral";
}
const groupedAmountFormatter = new Intl.NumberFormat(void 0, { maximumFractionDigits: 0 });
function formatGroupedAmount(amount) {
  if (typeof amount !== "number" || Number.isNaN(amount)) return null;
  return groupedAmountFormatter.format(amount);
}
function CustomersDealsPage() {
  const t = useT();
  const DealsViewTabsRow = useRegisteredComponent(
    VIEW_TABS_ROW_COMPONENT_ID,
    ViewTabsRow
  );
  const locale = useLocale();
  const { confirm, ConfirmDialogElement } = useConfirmDialog();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scopeVersion = useOrganizationScopeVersion();
  const queryClient = useQueryClient();
  const [rows, setRows] = React.useState([]);
  const [page, setPage] = React.useState(() => {
    const raw = Number(searchParams?.get("page") ?? "1");
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });
  const [pageSize, setPageSize] = React.useState(PAGE_SIZE);
  const [sorting, setSorting] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalIsCapped, setTotalIsCapped] = React.useState(false);
  const [search, setSearch] = React.useState(() => searchParams?.get("search")?.trim() ?? "");
  const [isLoading, setIsLoading] = React.useState(false);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [pendingDeleteId, setPendingDeleteId] = React.useState(null);
  const [needsAttentionOnly, setNeedsAttentionOnly] = React.useState(() => searchParams?.get("needsAttention") === "true");
  const initialFilterTree = React.useMemo(() => {
    if (!searchParams) return createEmptyTree();
    const record = {};
    searchParams.forEach((value, key) => {
      if (key.startsWith("filter[")) record[key] = value;
    });
    const v2 = deserializeTree(record);
    if (v2) return v2;
    const flat = deserializeAdvancedFilter(record);
    if (flat) return flatToTree(flat);
    return createEmptyTree();
  }, []);
  const [panelFields, setPanelFields] = React.useState([]);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const filtersTriggerRef = React.useRef(null);
  const filterPanel = useAdvancedFilterTree({
    initial: initialFilterTree,
    fields: panelFields,
    onApply: () => setPage(1)
  });
  const advancedFilterState = filterPanel.appliedTree;
  const handleAdvancedFilterClear = React.useCallback(() => {
    filterPanel.clear();
    setPage(1);
  }, [filterPanel]);
  const [cacheStatus, setCacheStatus] = React.useState(null);
  const initialPersonIds = React.useMemo(
    () => extractIdsFromParams(searchParams, "personId"),
    [searchParams]
  );
  const initialCompanyIds = React.useMemo(
    () => extractIdsFromParams(searchParams, "companyId"),
    [searchParams]
  );
  const [selectedPersonIds, setSelectedPersonIds] = React.useState(initialPersonIds);
  const [selectedCompanyIds, setSelectedCompanyIds] = React.useState(initialCompanyIds);
  const [dictionaryMaps, setDictionaryMaps] = React.useState({
    "deal-statuses": {},
    "pipeline-stages": {}
  });
  const [pipelineNames, setPipelineNames] = React.useState({});
  const fetchDictionaryEntries = React.useCallback(
    async (kind) => {
      try {
        const data = await ensureCustomerDictionary(queryClient, kind, scopeVersion);
        setDictionaryMaps((prev) => ({ ...prev, [kind]: data.map }));
      } catch {
        setDictionaryMaps((prev) => ({ ...prev, [kind]: {} }));
      }
    },
    [queryClient, scopeVersion]
  );
  React.useEffect(() => {
    let cancelled = false;
    async function loadDictionaries() {
      if (cancelled) return;
      await Promise.all([fetchDictionaryEntries("deal-statuses"), fetchDictionaryEntries("pipeline-stages")]);
    }
    loadDictionaries().catch(() => {
    });
    return () => {
      cancelled = true;
    };
  }, [fetchDictionaryEntries, reloadToken]);
  const dictionaryOptions = React.useMemo(() => {
    const toOptions = (map) => Object.values(map ?? {}).map((entry) => {
      const tone = mapDictionaryColorToTone(entry.color);
      const option = { value: entry.value, label: entry.label };
      if (tone) option.tone = tone;
      return option;
    }).sort((a, b) => a.label.localeCompare(b.label, void 0, { sensitivity: "base" }));
    return {
      dealStatuses: toOptions(dictionaryMaps["deal-statuses"]),
      pipelineStages: toOptions(dictionaryMaps["pipeline-stages"])
    };
  }, [dictionaryMaps]);
  React.useEffect(() => {
    let cancelled = false;
    async function loadPipelines() {
      try {
        const call = await apiCall("/api/customers/pipelines");
        if (cancelled || !call.ok) return;
        const items = Array.isArray(call.result?.items) ? call.result.items : [];
        const map = {};
        items.forEach((p) => {
          if (p.id && p.name) map[p.id] = p.name;
        });
        setPipelineNames(map);
      } catch (err) {
        logger.warn("failed to load pipelines", { component: "deals.list", err });
      }
    }
    loadPipelines().catch((err) => {
      logger.warn("loadPipelines threw", { component: "deals.list", err });
    });
    return () => {
      cancelled = true;
    };
  }, [reloadToken, scopeVersion]);
  const handleSearchChange = React.useCallback((value) => {
    setSearch(value.trim());
    setPage(1);
  }, []);
  const queryParams = React.useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (sorting.length > 0) {
      params.set("sort", sorting[0].id);
      params.set("order", sorting[0].desc ? "desc" : "asc");
    }
    if (search.trim().length) params.set("search", search.trim());
    if (selectedPersonIds.length) params.set("personId", selectedPersonIds.join(","));
    if (selectedCompanyIds.length) params.set("companyId", selectedCompanyIds.join(","));
    if (needsAttentionOnly) params.set("needsAttention", "true");
    const advancedParams = serializeTree(advancedFilterState);
    for (const [key, val] of Object.entries(advancedParams)) {
      params.set(key, val);
    }
    return params.toString();
  }, [advancedFilterState, needsAttentionOnly, page, pageSize, search, selectedCompanyIds, selectedPersonIds, sorting]);
  const currentParams = React.useMemo(
    () => Object.fromEntries(new URLSearchParams(queryParams)),
    [queryParams]
  );
  const exportConfig = React.useMemo(() => ({
    view: {
      getUrl: (format) => buildCrudExportUrl("customers/deals", { ...currentParams, exportScope: "view" }, format)
    },
    full: {
      getUrl: (format) => buildCrudExportUrl("customers/deals", { ...currentParams, exportScope: "full", all: "true" }, format)
    }
  }), [currentParams]);
  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setCacheStatus(null);
      try {
        const fallback = { items: [], total: 0, totalPages: 1 };
        const call = await apiCall(`/api/customers/deals?${queryParams}`, void 0, { fallback });
        if (!call.ok) {
          const message = typeof call.result?.error === "string" ? call.result.error : t("customers.deals.list.error.load");
          flash(message, "error");
          if (!cancelled) setCacheStatus(null);
          return;
        }
        const payload = call.result ?? fallback;
        if (cancelled) return;
        setCacheStatus(call.cacheStatus ?? null);
        const items = Array.isArray(payload.items) ? payload.items : [];
        const mapped = items.map((item) => mapDeal(item)).filter((row) => !!row);
        setRows(mapped);
        setTotal(typeof payload.total === "number" ? payload.total : mapped.length);
        setTotalPages(typeof payload.totalPages === "number" ? payload.totalPages : 1);
        setTotalIsCapped(payload.totalIsCapped === true);
      } catch (err) {
        if (!cancelled) {
          setCacheStatus(null);
          const message = err instanceof Error ? err.message : t("customers.deals.list.error.load");
          flash(message, "error");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [queryParams, reloadToken, scopeVersion, t]);
  React.useEffect(() => {
    if (!totalIsCapped && totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages, totalIsCapped]);
  const queryRef = React.useRef(searchParams?.toString() ?? "");
  React.useEffect(() => {
    if (!pathname) return;
    const params = new URLSearchParams();
    if (search.trim().length) params.set("search", search.trim());
    if (selectedPersonIds.length) selectedPersonIds.forEach((id) => params.append("personId", id));
    if (selectedCompanyIds.length) selectedCompanyIds.forEach((id) => params.append("companyId", id));
    if (needsAttentionOnly) params.set("needsAttention", "true");
    if (page > 1) params.set("page", String(page));
    const advancedParams = serializeTree(advancedFilterState);
    for (const [key, val] of Object.entries(advancedParams)) {
      params.set(key, val);
    }
    const next = params.toString();
    if (queryRef.current === next) return;
    queryRef.current = next;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [pathname, router, page, search, selectedPersonIds, selectedCompanyIds, needsAttentionOnly, advancedFilterState]);
  const handleRefresh = React.useCallback(() => {
    void Promise.all([
      invalidateCustomerDictionary(queryClient, "deal-statuses"),
      invalidateCustomerDictionary(queryClient, "pipeline-stages")
    ]);
    setReloadToken((token) => token + 1);
  }, [queryClient]);
  const bulkMutationContextId = "customers-deals-list:bulk-delete";
  const { runMutation: runBulkMutation, retryLastMutation: retryBulkMutation } = useGuardedMutation({
    contextId: bulkMutationContextId,
    blockedMessage: t("ui.forms.flash.saveBlocked", "Save blocked by validation")
  });
  const singleMutationContextId = "customers-deals-list:single-delete";
  const { runMutation: runSingleMutation, retryLastMutation: retrySingleMutation } = useGuardedMutation({
    contextId: singleMutationContextId,
    blockedMessage: t("ui.forms.flash.saveBlocked", "Save blocked by validation")
  });
  const handleDeleteDeal = React.useCallback(
    async (dealId) => {
      if (pendingDeleteId) return;
      const confirmed = await confirm({
        title: t(
          "customers.deals.list.deleteConfirm",
          "Delete this deal? This action cannot be undone."
        ),
        variant: "destructive"
      });
      if (!confirmed) return;
      const lockVersion = rows.find((row) => row.id === dealId)?.updatedAt ?? null;
      setPendingDeleteId(dealId);
      try {
        await runSingleMutation({
          operation: async () => {
            await withScopedApiRequestHeaders(
              buildOptimisticLockHeader(lockVersion),
              () => deleteCrud("customers/deals", {
                body: { id: dealId },
                errorMessage: t("customers.deals.list.deleteError", "Failed to delete deal.")
              })
            );
          },
          context: {
            formId: singleMutationContextId,
            resourceKind: "customers.deal",
            resourceId: dealId,
            retryLastMutation: retrySingleMutation
          }
        });
        flash(t("customers.deals.list.deleteSuccess", "Deal deleted."), "success");
        setRows((prev) => prev.filter((row) => row.id !== dealId));
        setTotal((prev) => Math.max(0, prev - 1));
        handleRefresh();
      } catch (err) {
        if (surfaceRecordConflict(err, t)) {
          handleRefresh();
          return;
        }
        const message = err instanceof Error && err.message ? err.message : t("customers.deals.list.deleteError", "Failed to delete deal.");
        flash(message, "error");
      } finally {
        setPendingDeleteId(null);
      }
    },
    [confirm, handleRefresh, pendingDeleteId, retrySingleMutation, rows, runSingleMutation, singleMutationContextId, t]
  );
  const handlePageSizeChange = React.useCallback((newSize) => {
    setPageSize(newSize);
    setPage(1);
  }, []);
  const handleNeedsAttentionFilter = React.useCallback(() => {
    setNeedsAttentionOnly(true);
    setPage(1);
  }, []);
  const handleNeedsAttentionClear = React.useCallback(() => {
    setNeedsAttentionOnly(false);
    setPage(1);
  }, []);
  const [reassignOwnerOpen, setReassignOwnerOpen] = React.useState(false);
  const [reassignOwnerRows, setReassignOwnerRows] = React.useState([]);
  const [isReassigningOwner, setIsReassigningOwner] = React.useState(false);
  const reassignOwnerResolver = React.useRef(null);
  const settleReassignOwner = React.useCallback((result) => {
    const resolve = reassignOwnerResolver.current;
    reassignOwnerResolver.current = null;
    resolve?.(result);
  }, []);
  const handleBulkReassignOwner = React.useCallback(
    async (selectedRows) => {
      if (!selectedRows.length) return false;
      settleReassignOwner(false);
      setReassignOwnerRows(selectedRows);
      setReassignOwnerOpen(true);
      return new Promise((resolve) => {
        reassignOwnerResolver.current = resolve;
      });
    },
    [settleReassignOwner]
  );
  const handleReassignOwnerCancel = React.useCallback(() => {
    setReassignOwnerOpen(false);
    settleReassignOwner(false);
  }, [settleReassignOwner]);
  const handleReassignOwnerConfirm = React.useCallback(
    async (ownerUserId) => {
      const ids = reassignOwnerRows.map((row) => row.id);
      if (!ids.length) {
        setReassignOwnerOpen(false);
        settleReassignOwner(false);
        return;
      }
      setIsReassigningOwner(true);
      let progressJobId = null;
      try {
        await runBulkMutation({
          operation: async () => {
            const outcome = await requestBulkOwnerReassignment({
              ids,
              ownerUserId,
              errorMessage: t(
                "customers.deals.list.bulkReassignOwner.error",
                "Failed to start bulk owner update."
              )
            });
            progressJobId = outcome.progressJobId;
          },
          context: {
            formId: bulkMutationContextId,
            resourceKind: "customers.deals.bulk_owner",
            retryLastMutation: retryBulkMutation
          }
        });
      } catch (error) {
        logger.error("customers.deals.list bulk owner update failed", { err: error });
        setIsReassigningOwner(false);
        setReassignOwnerOpen(false);
        settleReassignOwner({ ok: false });
        return;
      }
      setIsReassigningOwner(false);
      setReassignOwnerOpen(false);
      handleRefresh();
      settleReassignOwner(buildReassignOwnerSuccess({
        ids,
        progressJobId,
        message: t("customers.deals.list.bulkReassignOwner.queued", "Bulk owner update started ({count} deals).", {
          count: ids.length
        })
      }));
    },
    [bulkMutationContextId, handleRefresh, reassignOwnerRows, retryBulkMutation, runBulkMutation, settleReassignOwner, t]
  );
  const handleBulkDelete = React.useCallback(async (selectedRows) => {
    const confirmed = await confirm({
      title: t("customers.deals.list.bulkDelete.title", "Delete {count} deals?", { count: selectedRows.length }),
      description: t("customers.deals.list.bulkDelete.description", "This action cannot be undone."),
      variant: "destructive"
    });
    if (!confirmed) return false;
    const { succeeded, failures } = await runBulkMutation({
      operation: async () => runBulkDelete(
        selectedRows,
        async (row) => {
          await deleteCrud("customers/deals", {
            body: { id: row.id },
            errorMessage: t("customers.deals.list.deleteError", "Failed to delete deal.")
          });
        },
        {
          fallbackErrorMessage: t("customers.deals.list.deleteError", "Failed to delete deal."),
          logTag: "customers.deals.list",
          progress: {
            jobType: "customers.deals.bulk_delete",
            name: t("customers.deals.list.bulkDelete.progressName", "Delete selected deals"),
            description: t(
              "customers.deals.list.bulkDelete.progressDescription",
              "{count} deals selected for deletion",
              { count: selectedRows.length }
            ),
            meta: { source: "customers.deals.list" }
          }
        }
      ),
      context: {
        formId: bulkMutationContextId,
        resourceKind: "customers.deal",
        retryLastMutation: retryBulkMutation
      }
    });
    if (succeeded.length > 0) {
      const succeededIds = new Set(succeeded.map((r) => r.id));
      setRows((prev) => prev.filter((r) => !succeededIds.has(r.id)));
      setTotal((prev) => Math.max(0, prev - succeeded.length));
      setReloadToken((prev) => prev + 1);
      if (succeeded.length > 1) {
        coalesceLastOperations(succeeded.length, {
          commandId: "customers.deals.delete",
          actionLabel: t("customers.deals.list.bulkDelete.operationLabel", "Delete {count} deals", { count: succeeded.length }),
          resourceKind: "customers.deal"
        });
      }
      if (failures.length === 0) {
        flash(
          t("customers.deals.list.bulkDelete.success", "{count} deals deleted", { count: succeeded.length }),
          "success"
        );
      } else {
        flash(
          t("customers.deals.list.bulkDelete.partial", "{deleted} of {total} deals deleted; {failed} failed", {
            deleted: succeeded.length,
            total: selectedRows.length,
            failed: failures.length
          }),
          "warning"
        );
      }
    }
    for (const group of groupBulkDeleteFailures(failures)) {
      const message = group.count === 1 ? group.sampleMessage : t(
        "customers.deals.list.bulkDelete.failedGroup",
        "{count} deals could not be deleted: {message}",
        { count: group.count, message: group.sampleMessage }
      );
      flash(message, "error");
    }
    return succeeded.length > 0;
  }, [bulkMutationContextId, confirm, retryBulkMutation, runBulkMutation, t]);
  const { data: customFieldDefs = [] } = useCustomFieldDefs([E.customers.customer_deal], {
    keyExtras: [scopeVersion, reloadToken]
  });
  const currentUserId = useCurrentUserId();
  const activeOrgId = useCurrentOrganization()?.id ?? null;
  const [ownerFilterOptions, setOwnerFilterOptions] = React.useState([]);
  const [ownerNames, setOwnerNames] = React.useState({});
  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    void fetchAssignableStaffMembers("", { pageSize: 100, activeOrgId, signal: controller.signal }).then((items) => {
      if (cancelled) return;
      setOwnerFilterOptions(mapAssignableStaffToFilterOptions(items));
      const names = {};
      for (const item of items) {
        if (item.userId) names[item.userId] = item.displayName;
      }
      setOwnerNames(names);
    }).catch(() => {
      if (cancelled) return;
      setOwnerFilterOptions([]);
      setOwnerNames({});
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeOrgId, scopeVersion]);
  React.useEffect(() => {
    if (!currentUserId || ownerNames[currentUserId]) return;
    const controller = new AbortController();
    let cancelled = false;
    void fetchCurrentUserName({ signal: controller.signal }).then((name) => {
      if (!cancelled && name) {
        setOwnerNames((current) => ({ [currentUserId]: name, ...current }));
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currentUserId, ownerNames]);
  const resolvedOwnerFilterOptions = React.useMemo(
    () => ensureCurrentUserFilterOption(
      ownerFilterOptions,
      currentUserId,
      t("customers.filters.currentUser", "Current user")
    ),
    [currentUserId, ownerFilterOptions, t]
  );
  const loadOwnerFilterOptions = React.useCallback(async (query) => {
    const items = await fetchAssignableStaffMembers(query ?? "", { pageSize: 100, activeOrgId });
    return mapAssignableStaffToFilterOptions(items);
  }, [activeOrgId]);
  const startOfToday = React.useMemo(() => {
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, []);
  const isDealOverdue = React.useCallback(
    (row) => !!row.expectedCloseAt && new Date(row.expectedCloseAt) < startOfToday && row.status === "open",
    [startOfToday]
  );
  const columns = React.useMemo(() => {
    const noValue = /* @__PURE__ */ jsx("span", { className: "text-muted-foreground text-sm", children: t("customers.deals.list.noValue") });
    const unknownOwner = t("customers.deals.list.unknownOwner");
    const customColumns = customFieldDefs.filter((def) => supportsCustomFieldColumn(def)).map((def) => ({
      accessorKey: `cf_${def.key}`,
      header: def.label || def.key,
      meta: {
        columnChooserGroup: def.group?.title ?? t("ui.columnChooser.customFieldsGroup", "Custom Fields"),
        filterGroup: def.group?.title ?? t("ui.columnChooser.customFieldsGroup", "Custom Fields"),
        filterType: mapCustomFieldKindToFilterType(def.kind),
        filterOptions: normalizeCustomFieldFilterOptions(def.options),
        hidden: true,
        maxWidth: "220px"
      },
      cell: ({ getValue }) => {
        const value = getValue();
        if (value == null) return noValue;
        if (Array.isArray(value)) {
          const normalized = normalizeCollectionLabels(
            value.map((item) => {
              if (item == null) return "";
              if (typeof item === "string") return item;
              return String(item);
            })
          );
          if (!normalized.length) return noValue;
          return /* @__PURE__ */ jsx(CollectionPreviewCell, { labels: normalized, maxVisible: 2 });
        }
        if (typeof value === "boolean") {
          return /* @__PURE__ */ jsx("span", { className: "text-sm", children: value ? t("customers.deals.list.booleanYes", "Yes") : t("customers.deals.list.booleanNo", "No") });
        }
        const stringValue = typeof value === "string" ? value.trim() : String(value);
        if (!stringValue) return noValue;
        const optionLabel = resolveCustomFieldOptionLabel(def, stringValue);
        return /* @__PURE__ */ jsx("span", { className: "text-sm", children: optionLabel ?? stringValue });
      }
    }));
    return [
      {
        accessorKey: "title",
        header: t("customers.deals.list.columns.title"),
        meta: {
          alwaysVisible: true,
          columnChooserGroup: "Basic Info",
          filterKey: "title",
          filterGroup: "Deal",
          maxWidth: "280px"
        },
        cell: ({ row }) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
          /* @__PURE__ */ jsx("span", { className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground", children: /* @__PURE__ */ jsx(Briefcase, { className: "h-4 w-4" }) }),
          /* @__PURE__ */ jsx("span", { className: "font-medium text-foreground truncate", children: row.original.title }),
          isDealOverdue(row.original) ? /* @__PURE__ */ jsx(
            AlertTriangle,
            {
              className: "h-4 w-4 shrink-0 text-status-warning-text",
              "aria-label": t("customers.deals.list.close.overdue")
            }
          ) : null
        ] })
      },
      {
        accessorKey: "status",
        header: t("customers.deals.list.columns.status"),
        meta: {
          filterType: "select",
          filterOptions: dictionaryOptions.dealStatuses,
          columnChooserGroup: "Basic Info",
          filterKey: "status",
          filterGroup: "Deal"
        },
        cell: ({ row }) => {
          const status = row.original.status;
          if (!status) return noValue;
          const entry = dictionaryMaps["deal-statuses"]?.[status];
          const label = entry?.label ?? status;
          const variant = coerceStatusBadgeVariant(mapDictionaryColorToTone(entry?.color));
          return /* @__PURE__ */ jsx(StatusBadge, { variant, dot: true, children: label });
        }
      },
      {
        accessorKey: "pipelineStage",
        header: t("customers.deals.list.columns.pipelineStage"),
        meta: {
          hidden: true,
          filterType: "select",
          filterOptions: dictionaryOptions.pipelineStages,
          columnChooserGroup: "Pipeline",
          filterKey: "pipeline_stage",
          filterGroup: "Deal"
        },
        cell: ({ row }) => {
          const stage = row.original.pipelineStage;
          if (!stage) return noValue;
          const label = dictionaryMaps["pipeline-stages"]?.[stage]?.label ?? stage;
          return /* @__PURE__ */ jsx("span", { className: "text-foreground", children: label });
        }
      },
      {
        accessorKey: "pipelineId",
        header: t("customers.deals.list.columns.pipeline", "Pipeline"),
        meta: {
          hidden: true,
          columnChooserGroup: "Pipeline",
          filterKey: "pipeline_id",
          filterGroup: "Deal",
          maxWidth: "220px"
        },
        cell: ({ row }) => {
          const name = row.original.pipelineId ? pipelineNames[row.original.pipelineId] : null;
          return name ? /* @__PURE__ */ jsx("span", { className: "text-sm", children: name }) : noValue;
        }
      },
      {
        accessorKey: "valueAmount",
        header: t("customers.deals.list.columns.value"),
        meta: {
          filterType: "number",
          columnChooserGroup: "Financial",
          filterKey: "value_amount",
          filterGroup: "Deal"
        },
        cell: ({ row }) => {
          const amount = formatGroupedAmount(row.original.valueAmount ?? null);
          if (amount === null) return noValue;
          const currency = row.original.valueCurrency;
          return /* @__PURE__ */ jsxs("div", { className: "flex flex-col", children: [
            /* @__PURE__ */ jsx("span", { className: "font-medium text-foreground", children: amount }),
            currency ? /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: currency }) : null
          ] });
        }
      },
      {
        accessorKey: "probability",
        header: t("customers.deals.list.columns.probability"),
        meta: {
          hidden: true,
          filterType: "number",
          columnChooserGroup: "Financial",
          filterKey: "probability",
          filterGroup: "Deal"
        },
        cell: ({ row }) => {
          const value = row.original.probability;
          if (typeof value === "number" && Number.isFinite(value)) {
            return /* @__PURE__ */ jsx("span", { className: "font-medium text-foreground", children: `${Math.min(Math.max(value, 0), 100)}%` });
          }
          return noValue;
        }
      },
      {
        accessorKey: "expectedCloseAt",
        header: t("customers.deals.list.columns.expectedClose"),
        meta: {
          columnChooserGroup: "Dates",
          filterKey: "expected_close_at",
          filterGroup: "Activity",
          filterIconName: "calendar"
        },
        cell: ({ row }) => {
          const expectedCloseAt = row.original.expectedCloseAt;
          if (!expectedCloseAt) return noValue;
          let subtitle = null;
          if (isDealOverdue(row.original)) {
            subtitle = /* @__PURE__ */ jsx("span", { className: "text-xs text-status-error-text", children: t("customers.deals.list.close.overdue") });
          } else if (isWonDealStatus(row.original.status)) {
            subtitle = /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: t("customers.deals.list.close.won") });
          } else if (isLostDealStatus(row.original.status)) {
            subtitle = /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: t("customers.deals.list.close.lost") });
          } else {
            const relative = formatRelativeTime(expectedCloseAt, { locale, translate: t });
            if (relative) {
              subtitle = /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: relative });
            }
          }
          return /* @__PURE__ */ jsxs("div", { className: "flex flex-col", children: [
            /* @__PURE__ */ jsx("span", { className: "text-foreground", children: formatDateValue(expectedCloseAt, t("customers.deals.list.noValue")) }),
            subtitle
          ] });
        }
      },
      {
        accessorKey: "ownerUserId",
        header: t("customers.deals.list.columns.owner", "Owner"),
        meta: {
          hidden: true,
          columnChooserGroup: "CRM",
          filterType: "select",
          filterOptions: resolvedOwnerFilterOptions,
          filterLoadOptions: loadOwnerFilterOptions,
          filterGroup: "CRM",
          filterIconName: "user-round",
          filterKey: "owner_user_id"
        },
        cell: ({ row }) => {
          const ownerUserId = row.original.ownerUserId;
          if (!ownerUserId) return noValue;
          const label = ownerNames[ownerUserId]?.trim() || unknownOwner;
          return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
            /* @__PURE__ */ jsx(Avatar, { label, size: "sm" }),
            /* @__PURE__ */ jsx("span", { className: "text-foreground truncate", children: label })
          ] });
        }
      },
      {
        accessorKey: "companies",
        header: t("customers.deals.list.columns.companies"),
        meta: {
          hidden: true,
          columnChooserGroup: "Associations",
          filterable: false,
          filterGroup: "CRM",
          filterIconName: "building-2",
          maxWidth: "220px",
          tooltipContent: (row) => normalizeCollectionLabels(
            row.companies.map((entry) => entry.label && entry.label.trim().length ? entry.label : t("customers.deals.list.unnamedCompany"))
          ).join(", ")
        },
        cell: ({ row }) => {
          const companies = row.original.companies;
          if (!companies.length) return noValue;
          const first = companies[0];
          const firstLabel = first.label && first.label.trim().length ? first.label : t("customers.deals.list.unnamedCompany");
          const overflow = companies.length - 1;
          return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 min-w-0", children: [
            /* @__PURE__ */ jsx(Tag, { variant: "neutral", className: "max-w-36", children: /* @__PURE__ */ jsx("span", { className: "truncate", children: firstLabel }) }),
            overflow > 0 ? /* @__PURE__ */ jsx(Tag, { variant: "neutral", children: `+${overflow}` }) : null
          ] });
        }
      },
      {
        accessorKey: "people",
        header: t("customers.deals.list.columns.people"),
        meta: {
          hidden: true,
          columnChooserGroup: "Associations",
          filterable: false,
          filterGroup: "CRM",
          filterIconName: "user-round",
          maxWidth: "220px",
          tooltipContent: (row) => normalizeCollectionLabels(
            row.people.map((entry) => entry.label && entry.label.trim().length ? entry.label : t("customers.deals.list.unnamedPerson"))
          ).join(", ")
        },
        cell: ({ row }) => {
          const people = row.original.people;
          if (!people.length) return noValue;
          const labels = normalizeCollectionLabels(
            people.map((person) => person.label && person.label.trim().length ? person.label : t("customers.deals.list.unnamedPerson"))
          );
          const tooltip = labels.join(", ");
          return /* @__PURE__ */ jsx(SimpleTooltip, { content: tooltip, side: "top", children: /* @__PURE__ */ jsx("span", { className: "inline-flex", children: /* @__PURE__ */ jsx(AvatarStack, { max: 4, size: "sm", children: people.map((person) => /* @__PURE__ */ jsx(
            Avatar,
            {
              label: person.label || t("customers.deals.list.unnamedPerson"),
              size: "sm"
            },
            person.id
          )) }) }) });
        }
      },
      {
        accessorKey: "updatedAt",
        header: t("customers.deals.list.columns.updatedAt"),
        meta: {
          hidden: true,
          columnChooserGroup: "Dates",
          filterKey: "updated_at",
          filterGroup: "Activity",
          filterIconName: "calendar"
        },
        cell: ({ row }) => /* @__PURE__ */ jsx("span", { className: "text-sm", children: formatDateValue(row.original.updatedAt ?? null, t("customers.deals.list.noValue")) })
      },
      ...customColumns
    ];
  }, [customFieldDefs, dictionaryMaps, dictionaryOptions, isDealOverdue, loadOwnerFilterOptions, locale, ownerNames, pipelineNames, resolvedOwnerFilterOptions, t]);
  const { advancedFilterFields } = useAutoDiscoveredFields({ columns, customFieldDefs });
  React.useEffect(() => {
    setPanelFields((prev) => {
      if (prev === advancedFilterFields) return prev;
      if (prev.length === advancedFilterFields.length) {
        let same = true;
        for (let i = 0; i < prev.length; i++) {
          if (prev[i].key !== advancedFilterFields[i].key) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return advancedFilterFields;
    });
  }, [advancedFilterFields]);
  const associationFilterFields = React.useMemo(() => {
    const personLabels = /* @__PURE__ */ new Map();
    const companyLabels = /* @__PURE__ */ new Map();
    for (const row of rows) {
      for (const person of row.people) {
        if (selectedPersonIds.includes(person.id) && person.label.trim().length > 0) {
          personLabels.set(person.id, person.label);
        }
      }
      for (const company of row.companies) {
        if (selectedCompanyIds.includes(company.id) && company.label.trim().length > 0) {
          companyLabels.set(company.id, company.label);
        }
      }
    }
    return [
      {
        key: "people",
        label: t("customers.deals.list.columns.people", "People"),
        type: "select",
        options: selectedPersonIds.map((id) => ({ value: id, label: personLabels.get(id) ?? id }))
      },
      {
        key: "companies",
        label: t("customers.deals.list.columns.companies", "Companies"),
        type: "select",
        options: selectedCompanyIds.map((id) => ({ value: id, label: companyLabels.get(id) ?? id }))
      }
    ];
  }, [rows, selectedCompanyIds, selectedPersonIds, t]);
  const associationFilterTree = React.useMemo(() => {
    const rules = [];
    if (selectedPersonIds.length) rules.push({ field: "people", operator: "is_any_of", value: selectedPersonIds });
    if (selectedCompanyIds.length) rules.push({ field: "companies", operator: "is_any_of", value: selectedCompanyIds });
    return rules.length ? makeMultiRuleTree(rules) : createEmptyTree();
  }, [selectedCompanyIds, selectedPersonIds]);
  const handleAssociationFilterRemove = React.useCallback((nodeId) => {
    const node = associationFilterTree.root.children.find((child) => child.id === nodeId);
    if (!node || node.type !== "rule") return;
    if (node.field === "people") setSelectedPersonIds([]);
    if (node.field === "companies") setSelectedCompanyIds([]);
    setPage(1);
  }, [associationFilterTree.root.children]);
  const dealsPresets = React.useMemo(() => makeDealsPresets(), []);
  return /* @__PURE__ */ jsxs(Page, { children: [
    /* @__PURE__ */ jsxs(PageBody, { children: [
      /* @__PURE__ */ jsx(DealsViewTabsRow, { active: "list", className: "mb-4" }),
      /* @__PURE__ */ jsx(
        DealsKpiStrip,
        {
          ownerNames,
          stageDictionary: dictionaryMaps["pipeline-stages"] ?? {},
          pipelineCount: Object.keys(pipelineNames).length,
          scopeVersion,
          reloadToken,
          onNeedsAttentionClick: handleNeedsAttentionFilter,
          className: "mb-4"
        }
      ),
      /* @__PURE__ */ jsx(
        DataTable,
        {
          stickyFirstColumn: true,
          stickyActionsColumn: true,
          actionsColumnAlign: "center",
          title: t("customers.deals.list.title"),
          titleHeadingLevel: 1,
          actions: /* @__PURE__ */ jsx(Button, { asChild: true, children: /* @__PURE__ */ jsx(Link, { href: "/backend/customers/deals/create", children: t("customers.deals.list.actions.new", "New deal") }) }),
          columns,
          columnChooser: { auto: true },
          data: rows,
          onRowClick: (row) => {
            router.push(`/backend/customers/deals/${row.id}`);
          },
          rowActions: (row) => {
            const isDeleting = pendingDeleteId === row.id;
            return /* @__PURE__ */ jsx(
              RowActions,
              {
                items: [
                  {
                    id: "edit",
                    label: t("customers.deals.list.actions.edit", "Edit"),
                    onSelect: () => {
                      router.push(`/backend/customers/deals/${row.id}`);
                    }
                  },
                  {
                    id: "open-new-tab",
                    label: t("customers.deals.list.actions.openInNewTab", "Open in new tab"),
                    onSelect: () => {
                      if (typeof window !== "undefined") {
                        window.open(`/backend/customers/deals/${row.id}`, "_blank", "noopener");
                      }
                    }
                  },
                  {
                    id: "delete",
                    label: isDeleting ? t("customers.deals.list.actions.deleting", "Deleting\u2026") : t("customers.deals.list.actions.delete", "Delete"),
                    destructive: true,
                    onSelect: () => handleDeleteDeal(row.id)
                  }
                ]
              }
            );
          },
          sortable: true,
          sorting,
          onSortingChange: setSorting,
          bulkActions: [
            {
              id: "reassign-owner",
              label: t("customers.deals.list.actions.reassignOwner", "Reassign owner"),
              icon: UserCircle2,
              onExecute: handleBulkReassignOwner
            },
            {
              id: "delete",
              label: t("customers.deals.list.actions.delete", "Delete"),
              destructive: true,
              onExecute: handleBulkDelete
            }
          ],
          searchValue: search,
          onSearchChange: handleSearchChange,
          searchPlaceholder: t("customers.deals.list.searchPlaceholder"),
          pagination: {
            page,
            pageSize,
            total,
            totalPages,
            totalIsCapped,
            onPageChange: (nextPage) => setPage(nextPage),
            pageSizeOptions: [10, 25, 50, 100],
            onPageSizeChange: handlePageSizeChange,
            cacheStatus
          },
          isLoading,
          refreshButton: {
            label: t("customers.deals.list.refresh"),
            onRefresh: handleRefresh
          },
          exporter: exportConfig,
          entityId: E.customers.customer_deal,
          perspective: { tableId: extensionPoints.hosts.dealsTable.tableId },
          advancedFilter: {
            auto: true,
            value: filterPanel.tree,
            onChange: filterPanel.setTree,
            onApply: () => filterPanel.flush(),
            onClear: handleAdvancedFilterClear,
            triggerRef: filtersTriggerRef,
            externalPopover: true,
            onTriggerClick: () => setFiltersOpen((prev) => !prev),
            onApplyTree: (tree) => {
              filterPanel.replaceTree(tree);
              setPage(1);
            }
          },
          activeFilterChips: /* @__PURE__ */ jsxs(Fragment, { children: [
            needsAttentionOnly ? /* @__PURE__ */ jsx(
              "div",
              {
                className: "flex items-center gap-2 overflow-x-auto border-b border-border bg-background px-4 py-2",
                "data-testid": "active-filter-chips",
                children: /* @__PURE__ */ jsxs(
                  "div",
                  {
                    className: "inline-flex items-center gap-1",
                    "data-testid": "active-filter-chip",
                    "aria-label": t("customers.deals.list.filters.needsAttention"),
                    children: [
                      /* @__PURE__ */ jsx(Tag, { variant: "warning", dot: true, children: t("customers.deals.list.filters.needsAttention") }),
                      /* @__PURE__ */ jsx(
                        IconButton,
                        {
                          type: "button",
                          variant: "ghost",
                          size: "xs",
                          "aria-label": t("customers.deals.list.filters.needsAttentionRemove"),
                          onClick: handleNeedsAttentionClear,
                          children: /* @__PURE__ */ jsx(X, { className: "size-3" })
                        }
                      )
                    ]
                  }
                )
              }
            ) : null,
            /* @__PURE__ */ jsx(
              ActiveFilterChips,
              {
                tree: associationFilterTree,
                fields: associationFilterFields,
                popoverOpen: filtersOpen,
                onRemoveNode: handleAssociationFilterRemove,
                onOpen: () => setFiltersOpen(true)
              }
            ),
            /* @__PURE__ */ jsx(
              ActiveFilterChips,
              {
                tree: filterPanel.appliedTree,
                fields: advancedFilterFields,
                popoverOpen: filtersOpen,
                onRemoveNode: (id) => filterPanel.dispatch({ type: "removeNode", nodeId: id }),
                onOpen: () => setFiltersOpen(true)
              }
            )
          ] }),
          filterAwareEmptyState: {
            active: needsAttentionOnly || associationFilterTree.root.children.length > 0 || advancedFilterState.root.children.length > 0,
            entityNamePlural: t("customers.deals.entityPlural", "deals"),
            canRemoveLast: needsAttentionOnly || associationFilterTree.root.children.length > 0 || filterPanel.tree.root.children.length > 0,
            onClearAll: () => {
              handleAdvancedFilterClear();
              setSelectedPersonIds([]);
              setSelectedCompanyIds([]);
              setNeedsAttentionOnly(false);
            },
            onRemoveLast: () => {
              if (needsAttentionOnly) {
                handleNeedsAttentionClear();
                return;
              }
              if (selectedCompanyIds.length > 0) {
                setSelectedCompanyIds([]);
                setPage(1);
                return;
              }
              if (selectedPersonIds.length > 0) {
                setSelectedPersonIds([]);
                setPage(1);
                return;
              }
              filterPanel.dispatch({ type: "removeLast" });
            }
          },
          emptyState: /* @__PURE__ */ jsx(
            ListEmptyState,
            {
              entityName: t("customers.deals.entityPlural", "deals"),
              createHref: "/backend/customers/deals/create",
              createLabel: t("customers.deals.list.actions.new", "New deal")
            }
          ),
          virtualized: true
        }
      ),
      /* @__PURE__ */ jsx(
        AdvancedFilterPanel,
        {
          fields: advancedFilterFields,
          value: filterPanel.tree,
          onChange: filterPanel.setTree,
          onApply: filterPanel.flush,
          onClear: handleAdvancedFilterClear,
          onFlush: filterPanel.flush,
          pendingErrors: filterPanel.pendingErrors,
          userId: currentUserId,
          presets: dealsPresets,
          open: filtersOpen,
          onOpenChange: setFiltersOpen,
          triggerRef: filtersTriggerRef,
          savedFilterStorageKey: "customers.deals.list"
        }
      )
    ] }),
    /* @__PURE__ */ jsx(
      ReassignOwnerDialog,
      {
        open: reassignOwnerOpen,
        selectedCount: reassignOwnerRows.length,
        isSubmitting: isReassigningOwner,
        onClose: handleReassignOwnerCancel,
        onConfirm: (userId) => {
          void handleReassignOwnerConfirm(userId);
        }
      }
    ),
    ConfirmDialogElement
  ] });
}
function mapDeal(item) {
  const id = typeof item.id === "string" ? item.id : null;
  if (!id) return null;
  const title = typeof item.title === "string" ? item.title : "";
  const status = typeof item.status === "string" ? item.status : null;
  const pipelineStage = typeof item.pipeline_stage === "string" ? item.pipeline_stage : null;
  const pipelineStageId = typeof item.pipeline_stage_id === "string" ? item.pipeline_stage_id : null;
  const pipelineId = typeof item.pipeline_id === "string" ? item.pipeline_id : null;
  const valueAmountRaw = item.value_amount;
  const valueAmount = typeof valueAmountRaw === "number" ? valueAmountRaw : typeof valueAmountRaw === "string" && valueAmountRaw.trim() ? Number(valueAmountRaw) : null;
  const valueCurrency = typeof item.value_currency === "string" && item.value_currency.trim().length ? item.value_currency.trim().toUpperCase() : null;
  const probabilityRaw = item.probability;
  const probability = typeof probabilityRaw === "number" ? probabilityRaw : typeof probabilityRaw === "string" && probabilityRaw.trim().length ? Number(probabilityRaw) : null;
  const expectedCloseAt = typeof item.expected_close_at === "string" ? item.expected_close_at : null;
  const updatedAt = typeof item.updated_at === "string" ? item.updated_at : null;
  const ownerUserId = typeof item.owner_user_id === "string" ? item.owner_user_id : null;
  const peopleRaw = Array.isArray(item.people) ? item.people : [];
  const companiesRaw = Array.isArray(item.companies) ? item.companies : [];
  const people = peopleRaw.map((entry) => {
    if (!entry || typeof entry !== "object") return null;
    const data = entry;
    const pid = typeof data.id === "string" ? data.id : null;
    if (!pid) return null;
    const label = typeof data.label === "string" ? data.label : "";
    return { id: pid, label };
  }).filter((entry) => !!entry);
  const companies = companiesRaw.map((entry) => {
    if (!entry || typeof entry !== "object") return null;
    const data = entry;
    const cid = typeof data.id === "string" ? data.id : null;
    if (!cid) return null;
    const label = typeof data.label === "string" ? data.label : "";
    return { id: cid, label };
  }).filter((entry) => !!entry);
  const customFields = {};
  for (const [key, value] of Object.entries(item)) {
    if (key.startsWith("cf_")) customFields[key] = value;
  }
  return withDataTableNamespaces({
    id,
    title,
    status,
    pipelineStage,
    pipelineStageId,
    pipelineId,
    valueAmount,
    valueCurrency,
    probability,
    expectedCloseAt,
    updatedAt,
    ownerUserId,
    people,
    companies,
    ...customFields
  }, item);
}
export {
  CustomersDealsPage as default
};
//# sourceMappingURL=page.js.map
