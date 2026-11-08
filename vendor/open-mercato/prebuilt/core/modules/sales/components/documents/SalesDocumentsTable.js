"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import * as React from "react";
import { extensionPoints } from "@open-mercato/core/modules/sales/extension-points";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Page, PageBody } from "@open-mercato/ui/backend/Page";
import { DataTable, withDataTableNamespaces } from "@open-mercato/ui/backend/DataTable";
import { RowActions } from "@open-mercato/ui/backend/RowActions";
import { Button } from "@open-mercato/ui/primitives/button";
import { apiCall, withScopedApiRequestHeaders } from "@open-mercato/ui/backend/utils/apiCall";
import { getFormatLocale } from "@open-mercato/ui/utils/format-locale";
import { buildOptimisticLockHeader } from "@open-mercato/ui/backend/utils/optimisticLock";
import { buildCrudExportUrl, deleteCrud } from "@open-mercato/ui/backend/utils/crud";
import { flash } from "@open-mercato/ui/backend/FlashMessages";
import { useOrganizationScopeVersion } from "@open-mercato/shared/lib/frontend/useOrganizationScope";
import { useT } from "@open-mercato/shared/lib/i18n/context";
import { useConfirmDialog } from "@open-mercato/ui/backend/confirm-dialog";
import { E } from "../../../../generated/entities.ids.generated.js";
import {
  DictionaryValue,
  createDictionaryMap,
  normalizeDictionaryEntries
} from "@open-mercato/core/modules/dictionaries/components/dictionaryAppearance";
import { SALES_DOCUMENT_NUMBER_COLUMN_META } from "./salesDocumentsColumns.js";
import { useSalesChannelsEnabled } from "../useSalesChannelsEnabled.js";
import { createLogger } from "@open-mercato/shared/lib/logger";
const logger = createLogger("sales");
const PAGE_SIZE = 20;
const UNASSIGNED_CHANNEL_VALUE = "__unassigned__";
function normalizeChannelSelection(value) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return raw.map((entry) => typeof entry === "string" ? entry.trim() : String(entry || "").trim()).filter((entry) => entry.length > 0);
}
function resolveCustomerName(snapshot, fallback) {
  if (!snapshot) return fallback ?? null;
  const base = snapshot.customer?.displayName ?? null;
  if (base) return base;
  const contact = snapshot.contact;
  if (contact) {
    const parts = [contact.preferredName, contact.firstName, contact.lastName].filter(
      (part) => part && part.trim().length
    );
    if (parts.length) return parts.join(" ");
  }
  return fallback ?? null;
}
function resolveCustomerEmail(snapshot) {
  if (!snapshot) return null;
  if (snapshot.customer?.primaryEmail) return snapshot.customer.primaryEmail;
  return null;
}
function toNumber(value) {
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
function formatCurrency(amount, currency, fallback = "\u2014") {
  if (amount == null || Number.isNaN(amount)) return fallback;
  try {
    if (currency && currency.trim().length) {
      const formatter = new Intl.NumberFormat(getFormatLocale(), { style: "currency", currency });
      return formatter.format(amount);
    }
    return new Intl.NumberFormat(getFormatLocale(), { style: "decimal", maximumFractionDigits: 2 }).format(amount);
  } catch {
    return String(amount);
  }
}
function mergeOptions(existing, next) {
  const map = /* @__PURE__ */ new Map();
  existing.forEach((opt) => map.set(opt.value, opt));
  next.forEach((opt) => map.set(opt.value, opt));
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}
function normalizeNumberInput(value) {
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
function SalesDocumentsTable({ kind }) {
  const t = useT();
  const { enabled: channelsEnabled } = useSalesChannelsEnabled();
  const router = useRouter();
  const scopeVersion = useOrganizationScopeVersion();
  const { confirm, ConfirmDialogElement } = useConfirmDialog();
  const [rows, setRows] = React.useState([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalIsCapped, setTotalIsCapped] = React.useState(false);
  const [sorting, setSorting] = React.useState([{ id: "createdAt", desc: true }]);
  const [search, setSearch] = React.useState("");
  const [filterValues, setFilterValues] = React.useState({});
  const [isLoading, setLoading] = React.useState(false);
  const [cacheStatus, setCacheStatus] = React.useState(null);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [channelOptions, setChannelOptions] = React.useState([]);
  const [tagOptions, setTagOptions] = React.useState([]);
  const [customerOptions, setCustomerOptions] = React.useState([]);
  const [statusMap, setStatusMap] = React.useState({});
  const resource = kind === "order" ? "orders" : "quotes";
  const entityId = kind === "order" ? E.sales.sales_order : E.sales.sales_quote;
  const title = kind === "order" ? t("sales.documents.list.ordersTitle", "Sales orders") : t("sales.documents.list.quotesTitle", "Sales quotes");
  const subtitle = t(
    "sales.documents.list.subtitle",
    "Review documents with customer context, totals, and channels."
  );
  const fetchChannelOptionsBy = React.useCallback(async (params) => {
    try {
      const call = await apiCall(`/api/sales/channels?${params.toString()}`);
      if (!call.ok) return [];
      const items = Array.isArray(call.result?.items) ? call.result.items : [];
      return items.map((item) => {
        const id = typeof item?.id === "string" ? item.id : null;
        const name = typeof item?.name === "string" ? item.name : null;
        if (!id || !name) return null;
        return { value: id, label: name };
      }).filter((opt) => opt !== null);
    } catch {
      return [];
    }
  }, []);
  const fetchChannelOptions = React.useCallback(
    (query) => {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (query && query.trim()) params.set("search", query.trim());
      return fetchChannelOptionsBy(params);
    },
    [fetchChannelOptionsBy]
  );
  const seedChannelOptionsForIds = React.useCallback(
    async (ids) => {
      const missing = ids.filter((id) => id !== UNASSIGNED_CHANNEL_VALUE);
      if (!missing.length) return;
      const params = new URLSearchParams({ page: "1", pageSize: String(missing.length) });
      params.set("ids", missing.join(","));
      const opts = await fetchChannelOptionsBy(params);
      if (opts.length) setChannelOptions((prev) => mergeOptions(prev, opts));
    },
    [fetchChannelOptionsBy]
  );
  const fetchTagOptions = React.useCallback(async (query) => {
    const params = new URLSearchParams({ page: "1", pageSize: "50" });
    if (query && query.trim()) params.set("search", query.trim());
    try {
      const call = await apiCall(`/api/sales/tags?${params.toString()}`);
      if (!call.ok) return [];
      const items = Array.isArray(call.result?.items) ? call.result.items : [];
      return items.map((item) => {
        const id = typeof item?.id === "string" ? item.id : null;
        const label = typeof item?.label === "string" ? item.label : null;
        if (!id || !label) return null;
        const description = typeof item?.description === "string" ? item.description : null;
        return { value: id, label, description };
      }).filter((opt) => opt !== null);
    } catch {
      return [];
    }
  }, []);
  const fetchCustomerOptions = React.useCallback(async (query) => {
    const params = new URLSearchParams({ page: "1", pageSize: "20" });
    if (query && query.trim().length) params.set("search", query.trim());
    try {
      const [people, companies] = await Promise.all([
        apiCall(`/api/customers/people?${params.toString()}`),
        apiCall(`/api/customers/companies?${params.toString()}`)
      ]);
      const peopleItems = Array.isArray(people.result?.items) ? people.result?.items ?? [] : [];
      const companyItems = Array.isArray(companies.result?.items) ? companies.result?.items ?? [] : [];
      const parseOption = (item, kind2) => {
        const id = typeof item?.id === "string" ? item.id : null;
        if (!id) return null;
        const name = typeof item?.display_name === "string" && item.display_name.trim().length ? item.display_name : typeof item?.name === "string" && item.name.trim().length ? item.name : id;
        const email = typeof item?.primary_email === "string" && item.primary_email.trim().length ? item.primary_email.trim() : null;
        const label = email ? `${name} (${email})` : name;
        return { value: id, label };
      };
      const options = [...peopleItems.map((i) => parseOption(i, "person")), ...companyItems.map((i) => parseOption(i, "company"))].filter((opt) => !!opt);
      return options;
    } catch {
      return [];
    }
  }, []);
  const loadStatusMap = React.useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "100" });
      const response = await apiCall(
        `/api/sales/order-statuses?${params.toString()}`,
        void 0,
        { fallback: { items: [] } }
      );
      const entries = normalizeDictionaryEntries(response.result?.items ?? [], { sort: false });
      setStatusMap(createDictionaryMap(entries));
    } catch (err) {
      logger.error("sales.documents.statuses.load", { err });
      setStatusMap({});
    }
  }, []);
  const loadChannelOptions = React.useCallback(
    async (query) => {
      const opts = await fetchChannelOptions(query);
      if (opts.length) setChannelOptions((prev) => mergeOptions(prev, opts));
      return opts;
    },
    [fetchChannelOptions]
  );
  const unassignedChannelOption = React.useMemo(
    () => ({
      value: UNASSIGNED_CHANNEL_VALUE,
      label: t("sales.documents.list.filters.channelUnassigned", "(No channel)")
    }),
    [t]
  );
  const channelFilterOptions = React.useMemo(
    () => [unassignedChannelOption, ...channelOptions],
    [channelOptions, unassignedChannelOption]
  );
  const loadChannelFilterOptions = React.useCallback(
    async (query) => {
      const opts = await loadChannelOptions(query);
      return query && query.trim() ? opts : [unassignedChannelOption, ...opts];
    },
    [loadChannelOptions, unassignedChannelOption]
  );
  const loadTagOptions = React.useCallback(
    async (query) => {
      const opts = await fetchTagOptions(query);
      if (opts.length) setTagOptions((prev) => mergeOptions(prev, opts));
      return opts;
    },
    [fetchTagOptions]
  );
  const loadCustomerOptions = React.useCallback(
    async (query) => {
      const opts = await fetchCustomerOptions(query);
      if (opts.length) setCustomerOptions((prev) => mergeOptions(prev, opts));
      return opts;
    },
    [fetchCustomerOptions]
  );
  React.useEffect(() => {
    if (channelsEnabled) loadChannelOptions().catch(() => {
    });
    loadTagOptions().catch(() => {
    });
    loadCustomerOptions().catch(() => {
    });
    loadStatusMap().catch(() => setStatusMap({}));
  }, [channelsEnabled, loadChannelOptions, loadCustomerOptions, loadStatusMap, loadTagOptions, scopeVersion]);
  const filters = React.useMemo(() => [
    ...channelsEnabled ? [{
      id: "channelId",
      label: t("sales.documents.list.filters.channel", "Channel"),
      type: "tags",
      options: channelFilterOptions,
      loadOptions: loadChannelFilterOptions,
      placeholder: t("sales.documents.list.filters.channelPlaceholder", "Search channels"),
      formatValue: (val) => val === UNASSIGNED_CHANNEL_VALUE ? t("sales.documents.list.filters.channelUnassigned", "(No channel)") : channelOptions.find((opt) => opt.value === val)?.label ?? val
    }] : [],
    {
      id: "date",
      label: t("sales.documents.list.filters.date", "Date"),
      type: "dateRange"
    },
    {
      id: "lineItemCountMin",
      label: t("sales.documents.list.filters.itemsMin", "Min items"),
      type: "text"
    },
    {
      id: "lineItemCountMax",
      label: t("sales.documents.list.filters.itemsMax", "Max items"),
      type: "text"
    },
    {
      id: "totalNetMin",
      label: t("sales.documents.list.filters.totalNetMin", "Min total (net)"),
      type: "text"
    },
    {
      id: "totalNetMax",
      label: t("sales.documents.list.filters.totalNetMax", "Max total (net)"),
      type: "text"
    },
    {
      id: "totalGrossMin",
      label: t("sales.documents.list.filters.totalGrossMin", "Min total (gross)"),
      type: "text"
    },
    {
      id: "totalGrossMax",
      label: t("sales.documents.list.filters.totalGrossMax", "Max total (gross)"),
      type: "text"
    },
    {
      id: "customerId",
      label: t("sales.documents.list.filters.customer", "Customer"),
      type: "tags",
      options: customerOptions,
      loadOptions: loadCustomerOptions,
      placeholder: t("sales.documents.list.filters.customerPlaceholder", "Search customers"),
      formatValue: (val) => {
        const match = customerOptions.find((opt) => opt.value === val);
        return match?.label ?? val;
      }
    },
    {
      id: "tagIds",
      label: t("sales.documents.list.filters.tags", "Tags"),
      type: "tags",
      options: tagOptions,
      loadOptions: loadTagOptions,
      formatValue: (val) => tagOptions.find((o) => o.value === val)?.label ?? val,
      formatDescription: (val) => tagOptions.find((o) => o.value === val)?.description ?? null
    }
  ], [channelsEnabled, channelFilterOptions, channelOptions, loadChannelFilterOptions, customerOptions, loadCustomerOptions, loadTagOptions, tagOptions, t]);
  const queryParams = React.useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (search.trim()) params.set("search", search.trim());
    const sort = sorting[0];
    if (sort?.id) {
      params.set("sortField", sort.id);
      params.set("sortDir", sort.desc ? "desc" : "asc");
    }
    const channelSelection = normalizeChannelSelection(filterValues.channelId);
    const channelIds = channelSelection.filter((value) => value !== UNASSIGNED_CHANNEL_VALUE);
    if (channelIds.length > 0) params.set("channelIds", channelIds.join(","));
    if (channelSelection.includes(UNASSIGNED_CHANNEL_VALUE)) params.set("channelIdsEmpty", "true");
    const customerIds = Array.isArray(filterValues.customerId) ? filterValues.customerId.map((value) => typeof value === "string" ? value.trim() : String(value || "").trim()).filter((value) => value.length > 0) : [];
    if (customerIds.length > 0) {
      params.set("customerId", customerIds[0]);
    }
    const date = filterValues.date;
    if (date && typeof date === "object") {
      if (date.from) params.set("dateFrom", date.from);
      if (date.to) params.set("dateTo", date.to);
    }
    const numberFilters = [
      ["lineItemCountMin", "lineItemCountMin"],
      ["lineItemCountMax", "lineItemCountMax"],
      ["totalNetMin", "totalNetMin"],
      ["totalNetMax", "totalNetMax"],
      ["totalGrossMin", "totalGrossMin"],
      ["totalGrossMax", "totalGrossMax"]
    ];
    numberFilters.forEach(([key, queryKey]) => {
      const value = normalizeNumberInput(filterValues[key]);
      if (value != null) params.set(queryKey, String(value));
    });
    const tagIds = Array.isArray(filterValues.tagIds) ? filterValues.tagIds.map((value) => typeof value === "string" ? value.trim() : String(value || "").trim()).filter((v) => v.length > 0) : [];
    if (tagIds.length > 0) {
      params.set("tagIds", tagIds.join(","));
    }
    Object.entries(filterValues).forEach(([key, value]) => {
      if (!key.startsWith("cf_") || value == null) return;
      if (Array.isArray(value)) {
        const normalized = value.map((item) => {
          if (item == null) return "";
          if (typeof item === "string") return item.trim();
          return String(item).trim();
        }).filter((item) => item.length > 0);
        if (normalized.length) params.set(key, normalized.join(","));
      } else if (typeof value === "object") {
        return;
      } else if (value !== "") {
        const stringValue = typeof value === "string" ? value.trim() : String(value);
        if (stringValue) params.set(key, stringValue);
      }
    });
    return params.toString();
  }, [filterValues, page, search, sorting]);
  const currentParams = React.useMemo(() => Object.fromEntries(new URLSearchParams(queryParams)), [queryParams]);
  const exportConfig = React.useMemo(() => ({
    view: {
      getUrl: (format) => buildCrudExportUrl(`sales/${resource}`, { ...currentParams, exportScope: "view" }, format)
    },
    full: {
      getUrl: (format) => buildCrudExportUrl(`sales/${resource}`, { ...currentParams, exportScope: "full", all: "true" }, format)
    }
  }), [currentParams, resource]);
  const mapApiDocument = React.useCallback(
    (item) => {
      const doc = item;
      const id = typeof doc.id === "string" ? doc.id : "";
      const number = kind === "order" ? doc.orderNumber ?? item?.order_number ?? id : doc.quoteNumber ?? item?.quote_number ?? id;
      const customerSnapshot = doc.customerSnapshot ?? null;
      const customerName = resolveCustomerName(customerSnapshot, doc.customerEntityId ?? null);
      const customerEmail = resolveCustomerEmail(customerSnapshot);
      const totalNet = toNumber(doc.grandTotalNetAmount);
      const totalGross = toNumber(doc.grandTotalGrossAmount);
      const placedAt = doc.placedAt ?? null;
      const validUntil = doc.validUntil ?? null;
      const createdAt = doc.createdAt ?? null;
      const date = placedAt ?? validUntil ?? createdAt ?? null;
      return withDataTableNamespaces({
        id,
        number,
        status: doc.status ?? null,
        customerName,
        customerEmail,
        channelId: doc.channelId ?? null,
        channelName: doc.channelName ?? null,
        lineItemCount: doc.lineItemCount ?? null,
        totalNet,
        totalGross,
        currency: doc.currencyCode ?? null,
        date,
        updatedAt: doc.updatedAt ?? null
      }, item);
    },
    [kind]
  );
  const loadDocuments = React.useCallback(async () => {
    setLoading(true);
    setCacheStatus(null);
    try {
      const call = await apiCall(`/api/sales/${resource}?${queryParams}`);
      if (!call.ok) {
        flash(t("sales.documents.list.errors.load", "Failed to load documents."), "error");
        setRows([]);
        setTotal(0);
        setTotalPages(1);
        setTotalIsCapped(false);
        return;
      }
      const payload = call.result ?? {};
      const items = Array.isArray(payload.items) ? payload.items : [];
      setRows(items.map((item) => mapApiDocument(item)));
      const count = typeof payload.total === "number" ? payload.total : items.length;
      setTotal(count);
      const pages = typeof payload.totalPages === "number" ? payload.totalPages : Math.max(1, Math.ceil(count / PAGE_SIZE));
      setTotalPages(pages);
      setTotalIsCapped(payload.totalIsCapped === true);
      setCacheStatus(call.cacheStatus ?? null);
    } catch (err) {
      logger.error("sales.documents.list", { err });
      flash(t("sales.documents.list.errors.load", "Failed to load documents."), "error");
    } finally {
      setLoading(false);
    }
  }, [mapApiDocument, queryParams, resource, t]);
  React.useEffect(() => {
    void loadDocuments();
  }, [loadDocuments, reloadToken, scopeVersion]);
  const handleFiltersApply = React.useCallback((values) => {
    if (values.channelId === void 0) {
      setFilterValues(values);
    } else {
      const channelSelection = normalizeChannelSelection(values.channelId);
      setFilterValues({ ...values, channelId: channelSelection });
      void seedChannelOptionsForIds(channelSelection);
    }
    setPage(1);
  }, [seedChannelOptionsForIds]);
  const handleFiltersClear = React.useCallback(() => {
    setFilterValues({});
    setPage(1);
  }, []);
  const handleSearchChange = React.useCallback((value) => {
    setSearch(value);
    setPage(1);
  }, []);
  const handleRefresh = React.useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);
  const handleDelete = React.useCallback(
    async (row) => {
      const confirmMessage = kind === "order" ? t(
        "sales.documents.list.table.deleteOrderConfirm",
        "Delete this sales order? Related shipments, payments, addresses, and items will be removed."
      ) : t(
        "sales.documents.list.table.deleteQuoteConfirm",
        "Delete this sales quote? Related addresses, comments, and items will be removed."
      );
      const confirmed = await confirm({
        title: confirmMessage,
        variant: "destructive"
      });
      if (!confirmed) return;
      try {
        const result = await withScopedApiRequestHeaders(
          buildOptimisticLockHeader(row.updatedAt),
          () => deleteCrud(`sales/${resource}`, row.id, {
            errorMessage: t("sales.documents.list.table.deleteError", "Failed to delete document.")
          })
        );
        if (result.ok) {
          flash(
            kind === "order" ? t("sales.documents.list.table.orderDeleted", "Sales order deleted.") : t("sales.documents.list.table.quoteDeleted", "Sales quote deleted."),
            "success"
          );
          handleRefresh();
        }
      } catch (err) {
        logger.error("sales.documents.delete", { err });
        flash(t("sales.documents.list.table.deleteError", "Failed to delete document."), "error");
      }
    },
    [confirm, handleRefresh, kind, resource, t]
  );
  const handleRowClick = React.useCallback((row) => {
    router.push(`/backend/sales/${resource}/${row.id}?kind=${kind}`);
  }, [kind, resource, router]);
  const columns = React.useMemo(() => [
    {
      id: "number",
      accessorKey: "number",
      header: kind === "order" ? t("sales.documents.list.table.order", "Order") : t("sales.documents.list.table.quote", "Quote"),
      cell: ({ row }) => /* @__PURE__ */ jsxs("div", { className: "flex flex-col", children: [
        /* @__PURE__ */ jsx("span", { className: "font-semibold", children: row.original.number }),
        row.original.status ? /* @__PURE__ */ jsx(
          DictionaryValue,
          {
            value: row.original.status,
            map: statusMap,
            fallback: /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: row.original.status }),
            className: "text-xs text-muted-foreground font-medium",
            iconWrapperClassName: "inline-flex h-5 w-5 items-center justify-center rounded bg-muted text-muted-foreground",
            iconClassName: "h-3.5 w-3.5",
            colorClassName: "h-3 w-3 rounded-full border border-border/70"
          }
        ) : null
      ] }),
      meta: SALES_DOCUMENT_NUMBER_COLUMN_META
    },
    {
      accessorKey: "customerName",
      header: t("sales.documents.list.table.customer", "Customer"),
      cell: ({ row }) => /* @__PURE__ */ jsxs("div", { className: "flex flex-col", children: [
        /* @__PURE__ */ jsx("span", { className: "text-sm font-medium", children: row.original.customerName ?? t("sales.documents.list.table.noCustomer", "No customer") }),
        /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: row.original.customerEmail ?? t("sales.documents.list.table.noEmail", "No email") })
      ] }),
      enableSorting: false
    },
    ...channelsEnabled ? [{
      accessorKey: "channelId",
      header: t("sales.documents.list.table.channel", "Channel"),
      cell: ({ row }) => {
        const channelId = row.original.channelId;
        if (!channelId) return /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: t("sales.documents.list.table.unassigned", "Unassigned") });
        return /* @__PURE__ */ jsx("span", { className: "text-sm", children: row.original.channelName ?? channelId });
      },
      enableSorting: false
    }] : [],
    {
      id: "lineItemCount",
      accessorKey: "lineItemCount",
      header: /* @__PURE__ */ jsx("span", { className: "block text-right", children: t("sales.documents.list.table.items", "Items") }),
      cell: ({ row }) => /* @__PURE__ */ jsx("span", { className: "text-sm font-semibold text-right tabular-nums", children: typeof row.original.lineItemCount === "number" ? row.original.lineItemCount : "\u2014" })
    },
    {
      id: "grandTotalNetAmount",
      accessorKey: "totalNet",
      header: /* @__PURE__ */ jsx("span", { className: "block text-right", children: t("sales.documents.list.table.totalNet", "Total (net)") }),
      cell: ({ row }) => /* @__PURE__ */ jsx("span", { className: "text-sm text-right tabular-nums", children: formatCurrency(row.original.totalNet ?? null, row.original.currency) })
    },
    {
      id: "grandTotalGrossAmount",
      accessorKey: "totalGross",
      header: /* @__PURE__ */ jsx("span", { className: "block text-right", children: t("sales.documents.list.table.totalGross", "Total (gross)") }),
      cell: ({ row }) => /* @__PURE__ */ jsx("span", { className: "text-sm text-right tabular-nums", children: formatCurrency(row.original.totalGross ?? null, row.original.currency) })
    },
    {
      id: "createdAt",
      accessorKey: "date",
      header: t("sales.documents.list.table.date", "Date"),
      cell: ({ row }) => row.original.date ? /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: new Date(row.original.date).toLocaleString(getFormatLocale()) }) : /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: "\u2014" })
    }
  ], [channelsEnabled, kind, statusMap, t]);
  const emptyLabel = kind === "order" ? t("sales.documents.list.table.emptyOrders", "No orders yet.") : t("sales.documents.list.table.emptyQuotes", "No quotes yet.");
  return /* @__PURE__ */ jsxs(Page, { children: [
    /* @__PURE__ */ jsx(PageBody, { children: /* @__PURE__ */ jsx(
      DataTable,
      {
        stickyFirstColumn: true,
        stickyActionsColumn: true,
        title: /* @__PURE__ */ jsxs("span", { className: "flex flex-col", children: [
          /* @__PURE__ */ jsx("span", { children: title }),
          /* @__PURE__ */ jsx("span", { className: "text-sm font-normal text-muted-foreground", children: subtitle })
        ] }),
        titleHeadingLevel: 1,
        actions: /* @__PURE__ */ jsx(Button, { asChild: true, children: /* @__PURE__ */ jsx(Link, { href: `/backend/sales/documents/create?kind=${kind}`, children: t("sales.documents.create.title", "Create sales document") }) }),
        columns,
        data: rows,
        sorting,
        onSortingChange: setSorting,
        isLoading,
        searchValue: search,
        onSearchChange: handleSearchChange,
        searchPlaceholder: kind === "order" ? t("sales.documents.list.search.orders", "Search orders\u2026") : t("sales.documents.list.search.quotes", "Search quotes\u2026"),
        filters,
        filterValues,
        onFiltersApply: handleFiltersApply,
        onFiltersClear: handleFiltersClear,
        entityId,
        exporter: exportConfig,
        pagination: {
          page,
          pageSize: PAGE_SIZE,
          total,
          totalPages,
          totalIsCapped,
          onPageChange: setPage,
          cacheStatus
        },
        refreshButton: {
          label: t("sales.documents.list.table.refresh", "Refresh"),
          onRefresh: handleRefresh,
          isRefreshing: isLoading
        },
        rowActions: (row) => /* @__PURE__ */ jsx(
          RowActions,
          {
            items: [
              {
                id: "open",
                label: t("sales.documents.list.table.open", "Open"),
                href: `/backend/sales/${resource}/${row.id}?kind=${kind}`
              },
              {
                id: "delete",
                label: kind === "order" ? t("sales.documents.list.table.deleteOrder", "Delete order") : t("sales.documents.list.table.deleteQuote", "Delete quote"),
                onSelect: () => handleDelete(row)
              }
            ]
          }
        ),
        perspective: {
          tableId: kind === "order" ? extensionPoints.hosts.ordersTable.tableId : extensionPoints.hosts.quotesTable.tableId
        },
        onRowClick: handleRowClick,
        emptyState: /* @__PURE__ */ jsx("div", { className: "py-10 text-center text-sm text-muted-foreground", children: emptyLabel })
      }
    ) }),
    ConfirmDialogElement
  ] });
}
var SalesDocumentsTable_default = SalesDocumentsTable;
export {
  SalesDocumentsTable,
  SalesDocumentsTable_default as default
};
//# sourceMappingURL=SalesDocumentsTable.js.map
