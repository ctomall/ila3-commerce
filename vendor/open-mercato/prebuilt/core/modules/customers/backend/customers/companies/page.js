"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import * as React from "react";
import { extensionPoints } from "@open-mercato/core/modules/customers/extension-points";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Page, PageBody } from "@open-mercato/ui/backend/Page";
import { DataTable, withDataTableNamespaces } from "@open-mercato/ui/backend/DataTable";
import { Button } from "@open-mercato/ui/primitives/button";
import { RowActions } from "@open-mercato/ui/backend/RowActions";
import { apiCall, apiCallOrThrow } from "@open-mercato/ui/backend/utils/apiCall";
import { buildCrudExportUrl } from "@open-mercato/ui/backend/utils/crud";
import { groupBulkDeleteFailures, runBulkDelete } from "@open-mercato/ui/backend/utils/bulkDelete";
import { coalesceLastOperations } from "@open-mercato/ui/backend/operations/store";
import { useGuardedMutation } from "@open-mercato/ui/backend/injection/useGuardedMutation";
import { flash } from "@open-mercato/ui/backend/FlashMessages";
import { E } from "../../../../../generated/entities.ids.generated.js";
import { useOrganizationScopeVersion } from "@open-mercato/shared/lib/frontend/useOrganizationScope";
import { useT } from "@open-mercato/shared/lib/i18n/context";
import { useConfirmDialog } from "@open-mercato/ui/backend/confirm-dialog";
import { createEmptyTree, makeRuleTree } from "@open-mercato/shared/lib/query/advanced-filter-tree";
import { deserializeAdvancedFilter, deserializeTree, flatToTree, mapDictionaryColorToTone, serializeTree } from "@open-mercato/shared/lib/query/advanced-filter";
import { useCurrentUserId } from "@open-mercato/ui/backend/utils/useCurrentUserId";
import { useCurrentOrganization } from "@open-mercato/ui/backend/BackendChromeProvider";
import {
  DictionaryValue,
  createEmptyCustomerDictionaryMaps,
  renderDictionaryColor,
  renderDictionaryIcon
} from "../../../lib/dictionaries.js";
import { resolveCustomFieldOptionLabel } from "../../../lib/customFieldOptionLabel.js";
import {
  useCustomFieldDefs
} from "@open-mercato/ui/backend/utils/customFieldDefs";
import {
  mapCustomFieldKindToFilterType,
  normalizeCustomFieldFilterOptions,
  supportsCustomFieldColumn
} from "@open-mercato/ui/backend/utils/customFieldColumns";
import { useAutoDiscoveredFields } from "@open-mercato/ui/backend/utils/useAutoDiscoveredFields";
import { useAdvancedFilterTree } from "@open-mercato/ui/backend/hooks/useAdvancedFilter";
import { AdvancedFilterPanel } from "@open-mercato/ui/backend/filters/AdvancedFilterPanel";
import { ActiveFilterChips } from "@open-mercato/ui/backend/filters/ActiveFilterChips";
import { ListEmptyState } from "@open-mercato/ui/backend/filters/ListEmptyState";
import { useQueryClient } from "@tanstack/react-query";
import { ensureCustomerDictionary } from "../../../components/detail/hooks/useCustomerDictionary.js";
import {
  ensureCurrentUserFilterOption,
  fetchAssignableStaffMembers,
  mapAssignableStaffToFilterOptions
} from "../../../components/detail/assignableStaff.js";
import { CollectionPreviewCell, normalizeCollectionLabels } from "../../../components/list/CollectionPreviewCell.js";
import { appendCustomerListSortParams } from "../listSorting.js";
function makeCompaniesPresets() {
  return [
    {
      id: "my-accounts",
      labelKey: "customers.companies.presets.myAccounts",
      requiresUser: true,
      build: ({ userId }) => makeRuleTree({ field: "owner_user_id", operator: "is", value: userId })
    },
    {
      id: "recently-created",
      labelKey: "customers.companies.presets.recentlyCreated",
      iconName: "clock",
      build: ({ now }) => {
        const cutoff = new Date(now.getTime() - 7 * 24 * 3600 * 1e3).toISOString().slice(0, 10);
        return makeRuleTree({ field: "created_at", operator: "is_after", value: cutoff });
      }
    },
    {
      id: "inactive-60",
      labelKey: "customers.companies.presets.inactive60",
      build: ({ now }) => {
        const cutoff = new Date(now.getTime() - 60 * 24 * 3600 * 1e3).toISOString().slice(0, 10);
        return makeRuleTree({ field: "next_interaction_at", operator: "is_before", value: cutoff });
      }
    }
  ];
}
function formatDate(value, fallback) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString();
}
function mapApiItem(item) {
  const id = typeof item.id === "string" ? item.id : null;
  if (!id) return null;
  const name = typeof item.display_name === "string" ? item.display_name : "";
  const description = typeof item.description === "string" ? item.description : null;
  const email = typeof item.primary_email === "string" ? item.primary_email : null;
  const phone = typeof item.primary_phone === "string" ? item.primary_phone : null;
  const legalName = typeof item.legal_name === "string" ? item.legal_name : null;
  const brandName = typeof item.brand_name === "string" ? item.brand_name : null;
  const domain = typeof item.domain === "string" ? item.domain : null;
  const websiteUrl = typeof item.website_url === "string" ? item.website_url : null;
  const industry = typeof item.industry === "string" ? item.industry : null;
  const sizeBucket = typeof item.size_bucket === "string" ? item.size_bucket : null;
  const annualRevenue = typeof item.annual_revenue === "string" ? item.annual_revenue : typeof item.annual_revenue === "number" ? String(item.annual_revenue) : null;
  const status = typeof item.status === "string" ? item.status : null;
  const lifecycleStage = typeof item.lifecycle_stage === "string" ? item.lifecycle_stage : null;
  const nextInteractionAt = typeof item.next_interaction_at === "string" ? item.next_interaction_at : null;
  const nextInteractionName = typeof item.next_interaction_name === "string" ? item.next_interaction_name : null;
  const nextInteractionIcon = typeof item.next_interaction_icon === "string" ? item.next_interaction_icon : null;
  const nextInteractionColor = typeof item.next_interaction_color === "string" ? item.next_interaction_color : null;
  const organizationId = typeof item.organization_id === "string" ? item.organization_id : null;
  const source = typeof item.source === "string" ? item.source : null;
  const ownerUserId = typeof item.owner_user_id === "string" ? item.owner_user_id : null;
  const customFields = {};
  for (const [key, value] of Object.entries(item)) {
    if (key.startsWith("cf_")) {
      customFields[key] = value;
    }
  }
  return withDataTableNamespaces({
    id,
    name,
    description,
    email,
    phone,
    legalName,
    brandName,
    domain,
    websiteUrl,
    industry,
    sizeBucket,
    annualRevenue,
    status,
    lifecycleStage,
    nextInteractionAt,
    nextInteractionName,
    nextInteractionIcon,
    nextInteractionColor,
    organizationId,
    source,
    ownerUserId,
    ...customFields
  }, item);
}
function CustomersCompaniesPage() {
  const { confirm, ConfirmDialogElement } = useConfirmDialog();
  const [rows, setRows] = React.useState([]);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [sorting, setSorting] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalIsCapped, setTotalIsCapped] = React.useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = React.useState(() => searchParams?.get("search")?.trim() ?? "");
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
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(null);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [cacheStatus, setCacheStatus] = React.useState(null);
  const [dictionaryMaps, setDictionaryMaps] = React.useState(createEmptyCustomerDictionaryMaps());
  const scopeVersion = useOrganizationScopeVersion();
  const queryClient = useQueryClient();
  const t = useT();
  const router = useRouter();
  const handlePageSizeChange = React.useCallback((newSize) => {
    setPageSize(newSize);
    setPage(1);
  }, []);
  const handleSortingChange = React.useCallback((nextSorting) => {
    setSorting(nextSorting);
    setPage(1);
  }, []);
  const bulkMutationContextId = "customers-companies-list:bulk-delete";
  const { runMutation: runBulkMutation, retryLastMutation: retryBulkMutation } = useGuardedMutation({
    contextId: bulkMutationContextId,
    blockedMessage: t("ui.forms.flash.saveBlocked", "Save blocked by validation")
  });
  const singleMutationContextId = "customers-companies-list:single-delete";
  const { runMutation: runSingleMutation, retryLastMutation: retrySingleMutation } = useGuardedMutation({
    contextId: singleMutationContextId,
    blockedMessage: t("ui.forms.flash.saveBlocked", "Save blocked by validation")
  });
  const fetchDictionaryEntries = React.useCallback(async (kind) => {
    try {
      const data = await ensureCustomerDictionary(queryClient, kind, scopeVersion);
      setDictionaryMaps((prev) => ({
        ...prev,
        [kind]: data.map
      }));
      return data.entries;
    } catch {
      return [];
    }
  }, [queryClient, scopeVersion]);
  const dictionaryOptions = React.useMemo(() => {
    const toOptions = (map) => Object.values(map ?? {}).map((entry) => {
      const tone = mapDictionaryColorToTone(entry.color);
      const option = { value: entry.value, label: entry.label };
      if (tone) option.tone = tone;
      return option;
    }).sort((a, b) => a.label.localeCompare(b.label, void 0, { sensitivity: "base" }));
    return {
      statuses: toOptions(dictionaryMaps.statuses),
      sources: toOptions(dictionaryMaps.sources),
      lifecycleStages: toOptions(dictionaryMaps["lifecycle-stages"])
    };
  }, [dictionaryMaps]);
  React.useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      if (cancelled) return;
      setDictionaryMaps(createEmptyCustomerDictionaryMaps());
      await Promise.all([
        fetchDictionaryEntries("statuses"),
        fetchDictionaryEntries("sources"),
        fetchDictionaryEntries("lifecycle-stages")
      ]);
    }
    loadAll().catch(() => {
    });
    return () => {
      cancelled = true;
    };
  }, [fetchDictionaryEntries, scopeVersion, reloadToken]);
  const { data: customFieldDefs = [] } = useCustomFieldDefs(
    [E.customers.customer_entity, E.customers.customer_company_profile],
    { keyExtras: [scopeVersion, reloadToken] }
  );
  const currentUserId = useCurrentUserId();
  const activeOrgId = useCurrentOrganization()?.id ?? null;
  const [ownerFilterOptions, setOwnerFilterOptions] = React.useState([]);
  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    void fetchAssignableStaffMembers("", { pageSize: 100, activeOrgId, signal: controller.signal }).then((items) => {
      if (!cancelled) setOwnerFilterOptions(mapAssignableStaffToFilterOptions(items));
    }).catch(() => {
      if (!cancelled) setOwnerFilterOptions([]);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeOrgId, scopeVersion]);
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
  const queryParams = React.useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    appendCustomerListSortParams(params, sorting);
    if (search.trim()) params.set("search", search.trim());
    const advancedParams = serializeTree(advancedFilterState);
    for (const [key, val] of Object.entries(advancedParams)) {
      params.set(key, val);
    }
    return params.toString();
  }, [advancedFilterState, page, pageSize, search, sorting]);
  const currentParams = React.useMemo(() => Object.fromEntries(new URLSearchParams(queryParams)), [queryParams]);
  const queryRef = React.useRef(searchParams?.toString() ?? "");
  React.useEffect(() => {
    if (!pathname) return;
    const params = new URLSearchParams();
    if (search.trim().length) params.set("search", search.trim());
    if (page > 1) params.set("page", String(page));
    appendCustomerListSortParams(params, sorting);
    const advancedParams = serializeTree(advancedFilterState);
    for (const [key, val] of Object.entries(advancedParams)) {
      params.set(key, val);
    }
    const next = params.toString();
    if (queryRef.current === next) return;
    queryRef.current = next;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [pathname, router, page, search, sorting, advancedFilterState]);
  const exportConfig = React.useMemo(() => ({
    view: {
      getUrl: (format) => buildCrudExportUrl("customers/companies", { ...currentParams, exportScope: "view" }, format)
    },
    full: {
      getUrl: (format) => buildCrudExportUrl("customers/companies", { ...currentParams, exportScope: "full", all: "true" }, format)
    }
  }), [currentParams]);
  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setCacheStatus(null);
      try {
        const call = await apiCall(`/api/customers/companies?${queryParams}`);
        if (!call.ok) {
          const errorPayload = call.result;
          const message = typeof errorPayload?.error === "string" ? errorPayload.error : t("customers.companies.list.error.load");
          flash(message, "error");
          if (!cancelled) setLoadError(message);
          if (!cancelled) setCacheStatus(null);
          return;
        }
        const payload = call.result ?? {};
        if (cancelled) return;
        setLoadError(null);
        setCacheStatus(call.cacheStatus ?? null);
        const items = Array.isArray(payload.items) ? payload.items : [];
        setRows(items.map((item) => mapApiItem(item)).filter((row) => !!row));
        setTotal(typeof payload.total === "number" ? payload.total : items.length);
        setTotalPages(typeof payload.totalPages === "number" ? payload.totalPages : 1);
        setTotalIsCapped(payload?.totalIsCapped === true);
      } catch (err) {
        if (!cancelled) {
          setCacheStatus(null);
          const message = err instanceof TypeError ? t("customers.companies.list.error.network", "\u65E0\u6CD5\u8FDE\u63A5\u670D\u52A1\u5668\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5") : err instanceof Error ? err.message : t("customers.companies.list.error.load");
          flash(message, "error");
          setLoadError(message);
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
  const handleRefresh = React.useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);
  const handleDelete = React.useCallback(async (company) => {
    if (!company?.id) return;
    const name = company.name || t("customers.companies.list.deleteFallbackName");
    const confirmed = await confirm({
      title: t("customers.companies.list.deleteConfirm", void 0, { name }),
      variant: "destructive"
    });
    if (!confirmed) return;
    try {
      await runSingleMutation({
        operation: async () => {
          await apiCallOrThrow(
            `/api/customers/companies?id=${encodeURIComponent(company.id)}`,
            {
              method: "DELETE",
              headers: { "content-type": "application/json" }
            },
            { errorMessage: t("customers.companies.list.deleteError") }
          );
        },
        context: {
          formId: singleMutationContextId,
          resourceKind: "customers.company",
          resourceId: company.id,
          retryLastMutation: retrySingleMutation
        }
      });
      setRows((prev) => prev.filter((row) => row.id !== company.id));
      setTotal((prev) => Math.max(prev - 1, 0));
      handleRefresh();
      flash(t("customers.companies.list.deleteSuccess"), "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("customers.companies.list.deleteError");
      flash(message, "error");
    }
  }, [confirm, handleRefresh, retrySingleMutation, runSingleMutation, singleMutationContextId, t]);
  const handleBulkDelete = React.useCallback(async (selectedRows) => {
    const confirmed = await confirm({
      title: t("customers.companies.list.bulkDelete.title", "Delete {count} companies?", { count: selectedRows.length }),
      description: t("customers.companies.list.bulkDelete.description", "This action cannot be undone."),
      variant: "destructive"
    });
    if (!confirmed) return false;
    const { succeeded, failures } = await runBulkMutation({
      operation: async () => runBulkDelete(
        selectedRows,
        async (row) => {
          await apiCallOrThrow(`/api/customers/companies?id=${encodeURIComponent(row.id)}`, {
            method: "DELETE",
            headers: { "content-type": "application/json" }
          });
        },
        {
          fallbackErrorMessage: t("customers.companies.list.deleteError", "Failed to delete company."),
          logTag: "customers.companies.list",
          progress: {
            jobType: "customers.companies.bulk_delete",
            name: t("customers.companies.list.bulkDelete.progressName", "Delete selected companies"),
            description: t(
              "customers.companies.list.bulkDelete.progressDescription",
              "{count} companies selected for deletion",
              { count: selectedRows.length }
            ),
            meta: { source: "customers.companies.list" }
          }
        }
      ),
      context: {
        formId: bulkMutationContextId,
        resourceKind: "customers.company",
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
          commandId: "customers.companies.delete",
          actionLabel: t("customers.companies.list.bulkDelete.operationLabel", "Delete {count} companies", { count: succeeded.length }),
          resourceKind: "customers.company"
        });
      }
      if (failures.length === 0) {
        flash(
          t("customers.companies.list.bulkDelete.success", "{count} companies deleted", { count: succeeded.length }),
          "success"
        );
      } else {
        flash(
          t("customers.companies.list.bulkDelete.partial", "{deleted} of {total} companies deleted; {failed} failed", {
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
        "customers.companies.list.bulkDelete.failedGroup",
        "{count} companies could not be deleted: {message}",
        { count: group.count, message: group.sampleMessage }
      );
      flash(message, "error");
    }
    return succeeded.length > 0;
  }, [bulkMutationContextId, confirm, retryBulkMutation, runBulkMutation, t]);
  const columns = React.useMemo(() => {
    const noValue = /* @__PURE__ */ jsx("span", { className: "text-muted-foreground text-sm", children: t("customers.companies.list.noValue") });
    const renderDictionaryCell = (kind, rawValue) => /* @__PURE__ */ jsx(
      DictionaryValue,
      {
        value: rawValue,
        map: dictionaryMaps[kind],
        fallback: rawValue ? /* @__PURE__ */ jsx("span", { children: rawValue }) : noValue,
        className: "text-sm",
        iconWrapperClassName: "inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-card",
        iconClassName: "h-4 w-4",
        colorClassName: "h-3 w-3 rounded-full"
      }
    );
    const renderCustomFieldCell = (value) => {
      if (value == null) return noValue;
      if (Array.isArray(value)) {
        if (!value.length) return noValue;
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
        return /* @__PURE__ */ jsx("span", { className: "text-sm", children: value ? t("customers.companies.list.booleanYes", "Yes") : t("customers.companies.list.booleanNo", "No") });
      }
      const stringValue = typeof value === "string" ? value.trim() : String(value);
      if (!stringValue) return noValue;
      return /* @__PURE__ */ jsx("span", { className: "text-sm", children: stringValue });
    };
    const renderCustomFieldCellForDef = (value, def) => {
      if (typeof value === "string") {
        const label = resolveCustomFieldOptionLabel(def, value);
        if (label) return renderCustomFieldCell(label);
      }
      return renderCustomFieldCell(value);
    };
    const baseColumns = [
      {
        accessorKey: "name",
        header: t("customers.companies.list.columns.name"),
        meta: {
          alwaysVisible: true,
          columnChooserGroup: "Basic Info",
          filterKey: "display_name",
          filterGroup: "CRM",
          maxWidth: "260px"
        },
        cell: ({ row }) => /* @__PURE__ */ jsx(Link, { href: `/backend/customers/companies-v2/${row.original.id}`, className: "font-medium hover:underline", children: row.original.name })
      },
      {
        accessorKey: "email",
        header: t("customers.companies.list.columns.email"),
        meta: {
          hidden: true,
          columnChooserGroup: "Contact",
          filterKey: "primary_email",
          filterGroup: "Contact",
          filterIconName: "mail",
          maxWidth: "220px"
        },
        cell: ({ row }) => row.original.email || noValue
      },
      {
        accessorKey: "phone",
        header: t("customers.companies.detail.highlights.primaryPhone", "Primary phone"),
        meta: {
          columnChooserGroup: "Contact",
          hidden: true,
          filterKey: "primary_phone",
          filterGroup: "Contact",
          filterIconName: "phone",
          maxWidth: "180px"
        },
        cell: ({ row }) => row.original.phone || noValue
      },
      {
        accessorKey: "status",
        header: t("customers.companies.list.columns.status"),
        meta: {
          filterType: "select",
          filterOptions: dictionaryOptions.statuses,
          columnChooserGroup: "Basic Info",
          filterGroup: "CRM"
        },
        cell: ({ row }) => renderDictionaryCell("statuses", row.original.status)
      },
      {
        accessorKey: "lifecycleStage",
        header: t("customers.companies.list.columns.lifecycleStage"),
        meta: {
          filterType: "select",
          filterOptions: dictionaryOptions.lifecycleStages,
          columnChooserGroup: "Basic Info",
          filterKey: "lifecycle_stage",
          filterGroup: "CRM"
        },
        cell: ({ row }) => renderDictionaryCell("lifecycle-stages", row.original.lifecycleStage)
      },
      {
        accessorKey: "nextInteractionAt",
        header: t("customers.companies.list.columns.nextInteraction"),
        meta: {
          hidden: true,
          columnChooserGroup: "Dates",
          filterKey: "next_interaction_at",
          filterGroup: "Activity",
          filterIconName: "calendar"
        },
        cell: ({ row }) => row.original.nextInteractionAt ? /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-2 text-sm", children: [
          row.original.nextInteractionIcon ? /* @__PURE__ */ jsx("span", { className: "mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-card", children: renderDictionaryIcon(row.original.nextInteractionIcon, "h-4 w-4") }) : null,
          /* @__PURE__ */ jsxs("div", { className: "flex flex-col", children: [
            /* @__PURE__ */ jsx("span", { children: formatDate(row.original.nextInteractionAt, t("customers.companies.list.noValue")) }),
            row.original.nextInteractionName ? /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: row.original.nextInteractionName }) : null
          ] }),
          row.original.nextInteractionColor ? /* @__PURE__ */ jsx("span", { className: "mt-1", children: renderDictionaryColor(row.original.nextInteractionColor, "h-3 w-3 rounded-full border border-border") }) : null
        ] }) : noValue
      },
      {
        accessorKey: "source",
        header: t("customers.companies.list.columns.source"),
        meta: {
          hidden: true,
          filterType: "select",
          filterOptions: dictionaryOptions.sources,
          columnChooserGroup: "Basic Info",
          filterGroup: "CRM"
        },
        cell: ({ row }) => renderDictionaryCell("sources", row.original.source)
      },
      {
        accessorKey: "ownerUserId",
        header: t("customers.companies.list.columns.owner", "Owner"),
        meta: {
          columnChooserGroup: "CRM",
          filterType: "select",
          filterOptions: resolvedOwnerFilterOptions,
          filterLoadOptions: loadOwnerFilterOptions,
          filterGroup: "CRM",
          filterIconName: "user-round",
          filterKey: "owner_user_id",
          hidden: true
        },
        cell: ({ row }) => row.original.ownerUserId ?? null
      },
      {
        accessorKey: "legalName",
        header: t("customers.companies.detail.fields.legalName", "Legal name"),
        meta: {
          columnChooserGroup: "Profile",
          hidden: true,
          filterKey: "company_profile.legal_name",
          filterGroup: "Profile"
        },
        cell: ({ row }) => row.original.legalName || noValue
      },
      {
        accessorKey: "brandName",
        header: t("customers.companies.detail.fields.brandName", "Brand name"),
        meta: {
          columnChooserGroup: "Profile",
          hidden: true,
          filterKey: "company_profile.brand_name",
          filterGroup: "Profile"
        },
        cell: ({ row }) => row.original.brandName || noValue
      },
      {
        accessorKey: "domain",
        header: t("customers.companies.detail.fields.domain", "Domain"),
        meta: {
          columnChooserGroup: "Profile",
          hidden: true,
          filterKey: "company_profile.domain",
          filterGroup: "Profile"
        },
        cell: ({ row }) => row.original.domain || noValue
      },
      {
        accessorKey: "websiteUrl",
        header: t("customers.companies.detail.fields.website", "Website"),
        meta: {
          columnChooserGroup: "Profile",
          hidden: true,
          filterKey: "company_profile.website_url",
          filterGroup: "Profile"
        },
        cell: ({ row }) => row.original.websiteUrl || noValue
      },
      {
        accessorKey: "industry",
        header: t("customers.companies.detail.fields.industry", "Industry"),
        meta: {
          columnChooserGroup: "Profile",
          hidden: true,
          filterKey: "company_profile.industry",
          filterGroup: "Profile"
        },
        cell: ({ row }) => row.original.industry || noValue
      },
      {
        accessorKey: "sizeBucket",
        header: t("customers.companies.detail.fields.sizeBucket", "Company size"),
        meta: {
          columnChooserGroup: "Profile",
          hidden: true,
          filterKey: "company_profile.size_bucket",
          filterGroup: "Profile"
        },
        cell: ({ row }) => row.original.sizeBucket || noValue
      },
      {
        accessorKey: "annualRevenue",
        header: t("customers.companies.detail.highlights.annualRevenue", "Annual revenue"),
        meta: {
          columnChooserGroup: "Profile",
          hidden: true,
          filterKey: "company_profile.annual_revenue",
          filterType: "number",
          filterGroup: "Profile"
        },
        cell: ({ row }) => row.original.annualRevenue || noValue
      },
      {
        accessorKey: "description",
        header: t("customers.companies.detail.fields.description", "Description"),
        meta: {
          columnChooserGroup: "Notes",
          hidden: true,
          filterKey: "description",
          filterGroup: "Notes"
        },
        cell: ({ row }) => row.original.description || noValue
      }
    ];
    const customColumns = customFieldDefs.filter((def) => supportsCustomFieldColumn(def)).map((def) => ({
      accessorKey: `cf_${def.key}`,
      header: def.label || def.key,
      enableSorting: true,
      meta: {
        columnChooserGroup: def.group?.title ?? t("ui.columnChooser.customFieldsGroup", "Custom Fields"),
        filterGroup: def.group?.title ?? t("ui.columnChooser.customFieldsGroup", "Custom Fields"),
        filterType: mapCustomFieldKindToFilterType(def.kind),
        filterOptions: normalizeCustomFieldFilterOptions(def.options),
        hidden: def.listVisible === false || def.key !== "relationship_health",
        maxWidth: "220px"
      },
      cell: ({ getValue }) => renderCustomFieldCellForDef(getValue(), def)
    }));
    return [...baseColumns, ...customColumns];
  }, [customFieldDefs, dictionaryMaps, dictionaryOptions, loadOwnerFilterOptions, resolvedOwnerFilterOptions, t]);
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
  const companiesPresets = React.useMemo(() => makeCompaniesPresets(), []);
  return /* @__PURE__ */ jsxs(Page, { children: [
    /* @__PURE__ */ jsxs(PageBody, { children: [
      /* @__PURE__ */ jsx(
        DataTable,
        {
          stickyFirstColumn: true,
          stickyActionsColumn: true,
          title: t("customers.companies.list.title"),
          titleHeadingLevel: 1,
          refreshButton: {
            label: t("customers.companies.list.actions.refresh"),
            onRefresh: () => {
              setSearch("");
              setPage(1);
              handleRefresh();
            }
          },
          actions: /* @__PURE__ */ jsx(Button, { asChild: true, children: /* @__PURE__ */ jsx(Link, { href: "/backend/customers/companies/create", children: t("customers.companies.list.actions.new") }) }),
          columns,
          columnChooser: { auto: true },
          data: rows,
          exporter: exportConfig,
          searchValue: search,
          onSearchChange: (value) => {
            setSearch(value);
            setPage(1);
          },
          searchPlaceholder: t("customers.companies.list.searchPlaceholder"),
          entityIds: [E.customers.customer_entity, E.customers.customer_company_profile],
          onRowClick: (row) => router.push(`/backend/customers/companies-v2/${row.id}`),
          perspective: { tableId: extensionPoints.hosts.companiesTable.tableId },
          sortable: true,
          manualSorting: true,
          sorting,
          onSortingChange: handleSortingChange,
          bulkActions: [
            {
              id: "delete",
              label: t("customers.companies.list.actions.bulkDelete", "Delete selected"),
              destructive: true,
              onExecute: handleBulkDelete
            }
          ],
          rowActions: (row) => /* @__PURE__ */ jsx(
            RowActions,
            {
              items: [
                {
                  id: "view",
                  label: t("customers.companies.list.actions.view"),
                  onSelect: () => {
                    router.push(`/backend/customers/companies-v2/${row.id}`);
                  }
                },
                {
                  id: "open-new-tab",
                  label: t("customers.companies.list.actions.openInNewTab"),
                  onSelect: () => window.open(`/backend/customers/companies-v2/${row.id}`, "_blank", "noopener")
                },
                {
                  id: "delete",
                  label: t("customers.companies.list.actions.delete"),
                  destructive: true,
                  onSelect: () => handleDelete(row)
                }
              ]
            }
          ),
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
          activeFilterChips: /* @__PURE__ */ jsx(
            ActiveFilterChips,
            {
              tree: filterPanel.appliedTree,
              fields: advancedFilterFields,
              popoverOpen: filtersOpen,
              onRemoveNode: (id) => filterPanel.dispatch({ type: "removeNode", nodeId: id }),
              onOpen: () => setFiltersOpen(true)
            }
          ),
          filterAwareEmptyState: {
            active: advancedFilterState.root.children.length > 0,
            entityNamePlural: t("customers.companies.entityPlural", "companies"),
            canRemoveLast: filterPanel.tree.root.children.length > 0,
            onClearAll: handleAdvancedFilterClear,
            onRemoveLast: () => filterPanel.dispatch({ type: "removeLast" })
          },
          emptyState: /* @__PURE__ */ jsx(
            ListEmptyState,
            {
              entityName: t("customers.companies.entityPlural", "companies"),
              createHref: "/backend/customers/companies/create",
              createLabel: t("customers.companies.list.actions.new")
            }
          ),
          virtualized: true,
          pagination: { page, pageSize, total, totalPages, totalIsCapped, onPageChange: setPage, pageSizeOptions: [10, 25, 50, 100], onPageSizeChange: handlePageSizeChange, cacheStatus },
          isLoading,
          error: loadError
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
          presets: companiesPresets,
          open: filtersOpen,
          onOpenChange: setFiltersOpen,
          triggerRef: filtersTriggerRef,
          savedFilterStorageKey: "customers.companies.list"
        }
      )
    ] }),
    ConfirmDialogElement
  ] });
}
export {
  CustomersCompaniesPage as default
};
//# sourceMappingURL=page.js.map
