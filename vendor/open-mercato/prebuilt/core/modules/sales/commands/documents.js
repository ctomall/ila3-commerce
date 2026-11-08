import { randomUUID } from "crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { registerCommand } from "@open-mercato/shared/lib/commands";
import { withAtomicFlush } from "@open-mercato/shared/lib/commands/flush";
import {
  buildChanges,
  emitCrudSideEffects,
  emitCrudUndoSideEffects,
  requireId
} from "@open-mercato/shared/lib/commands/helpers";
import { LockMode } from "@mikro-orm/core";
import { CrudHttpError, notFound } from "@open-mercato/shared/lib/crud/errors";
import {
  deriveResourceFromCommandId,
  invalidateCrudCache
} from "@open-mercato/shared/lib/crud/cache";
import { resolveTranslations } from "@open-mercato/shared/lib/i18n/server";
import { resolveNotificationService } from "../../notifications/lib/notificationService.js";
import { buildFeatureNotificationFromType } from "../../notifications/lib/notificationBuilder.js";
import { emitSalesEvent } from "../events.js";
import { setRecordCustomFields } from "@open-mercato/core/modules/entities/lib/helpers";
import { loadCustomFieldValues } from "@open-mercato/shared/lib/crud/custom-fields";
import {
  normalizeCustomFieldResponse,
  normalizeCustomFieldValues
} from "@open-mercato/shared/lib/custom-fields/normalize";
import { E } from "../../../generated/entities.ids.generated.js";
import { findWithDecryption, findOneWithDecryption } from "@open-mercato/shared/lib/encryption/find";
import {
  SalesQuote,
  SalesQuoteLine,
  SalesQuoteAdjustment,
  SalesOrder,
  SalesOrderLine,
  SalesOrderAdjustment,
  SalesShipment,
  SalesShipmentItem,
  SalesPayment,
  SalesPaymentAllocation,
  SalesInvoice,
  SalesInvoiceLine,
  SalesCreditMemo,
  SalesCreditMemoLine,
  SalesDocumentAddress,
  SalesNote,
  SalesChannel,
  SalesShippingMethod,
  SalesDeliveryWindow,
  SalesPaymentMethod,
  SalesDocumentTag,
  SalesDocumentTagAssignment,
  SalesReturn
} from "../data/entities.js";
import {
  CatalogProduct,
  CatalogProductUnitConversion
} from "../../catalog/data/entities.js";
import { Dictionary, DictionaryEntry } from "../../dictionaries/data/entities.js";
import { CustomFieldValue } from "@open-mercato/core/modules/entities/data/entities";
import {
  CustomerAddress,
  CustomerEntity,
  CustomerPersonProfile
} from "../../customers/data/entities.js";
import {
  enforceAdjustmentSign,
  validateReturnAdjustmentWithinRemaining,
  RETURN_ADJUSTMENT_EXCEEDS_REMAINING_GROSS_MESSAGE,
  RETURN_ADJUSTMENT_EXCEEDS_REMAINING_NET_MESSAGE,
  quoteCreateSchema,
  quoteLineCreateSchema,
  quoteAdjustmentCreateSchema,
  orderCreateSchema,
  ORDER_PAYMENT_LEDGER_WARNING_CODE,
  resolveSuppliedOrderPaymentLedgerFields,
  orderLineCreateSchema,
  orderAdjustmentCreateSchema,
  invoiceCreateSchema,
  invoiceUpdateSchema,
  creditMemoCreateSchema,
  creditMemoUpdateSchema,
  customerSnapshotSchema
} from "../data/validators.js";
import {
  ensureOrganizationScope,
  ensureTenantScope,
  extractUndoPayload,
  toNumericString,
  reconcileLinePersistedTotals,
  deriveLineNetFromGross,
  enforceSalesDocumentOptimisticLock,
  SALES_RESOURCE_KIND_ORDER,
  SALES_RESOURCE_KIND_QUOTE
} from "./shared.js";
import {
  loadShipmentSnapshot,
  restoreShipmentSnapshot
} from "./shipments.js";
import {
  loadPaymentSnapshot,
  restorePaymentSnapshot
} from "./payments.js";
import {
  mapOrderLineEntityToSnapshot,
  mapQuoteLineEntityToSnapshot,
  resolveUpsertDiscountFields,
  resolveUpsertTotalsOrigin,
  resolveUpsertCalculatedAmounts
} from "../lib/lineSnapshots.js";
import { loadShippedQuantityByLine } from "../lib/shipments/snapshots.js";
import { resolveDictionaryEntryValue, resolveCachedDictionaryEntryValue } from "../lib/dictionaries.js";
import { resolveStatusEntryIdByValue } from "../lib/statusHelpers.js";
import { loadSalesSettings } from "./settings.js";
import { notificationTypes } from "../notifications.js";
import {
  REFERENCE_UNIT_CODES,
  canonicalizeUnitCode,
  toUnitLookupKey
} from "@open-mercato/shared/lib/units/unitCodes";
import { createLogger } from "@open-mercato/shared/lib/logger";
const logger = createLogger("sales");
let warnedDeprecatedOrderPaymentLedgerInput = false;
const orderCrudEvents = {
  module: "sales",
  entity: "order",
  persistent: true,
  buildPayload: (ctx) => ({
    id: ctx.identifiers.id,
    organizationId: ctx.identifiers.organizationId,
    tenantId: ctx.identifiers.tenantId,
    userId: ctx.actorUserId ?? null
  })
};
const quoteCrudEvents = {
  module: "sales",
  entity: "quote",
  persistent: true,
  buildPayload: (ctx) => ({
    id: ctx.identifiers.id,
    organizationId: ctx.identifiers.organizationId,
    tenantId: ctx.identifiers.tenantId,
    userId: ctx.actorUserId ?? null
  })
};
const currencyCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, { message: "currency_code_invalid" });
const dateOnlySchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "invalid_date" }).refine((value) => !Number.isNaN(new Date(value).getTime()), {
  message: "invalid_date"
});
const addressSnapshotSchema = z.record(z.string(), z.unknown()).nullable().optional();
const exchangeRateSchema = z.coerce.number().min(0);
const documentUpdateSchema = z.object({
  id: z.string().uuid(),
  customerEntityId: z.string().uuid().nullable().optional(),
  customerContactId: z.string().uuid().nullable().optional(),
  customerSnapshot: customerSnapshotSchema.nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  customerReference: z.string().nullable().optional(),
  externalReference: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
  // Same names and limits as the create schema (data/validators.ts), so a
  // caller can send one payload shape to create and update. Nullable here
  // because an update — unlike a create — has an existing value to clear.
  comments: z.string().trim().max(4e3).nullable().optional(),
  internalNotes: z.string().trim().max(4e3).nullable().optional(),
  orderNumber: z.string().trim().min(1).max(191).optional(),
  quoteNumber: z.string().trim().min(1).max(191).optional(),
  currencyCode: currencyCodeSchema.optional(),
  // Order-only columns — SalesQuote declares none of them. Declared here
  // because the create schema declares them and a caller reusing its create
  // payload on an update otherwise lost them silently; `applyDocumentUpdate`
  // rejects each with a 400 on a quote rather than dropping it.
  exchangeRate: z.union([z.null(), exchangeRateSchema]).optional(),
  paymentStatusEntryId: z.string().uuid().nullable().optional(),
  fulfillmentStatusEntryId: z.string().uuid().nullable().optional(),
  channelId: z.string().uuid().nullable().optional(),
  statusEntryId: z.string().uuid().nullable().optional(),
  placedAt: z.union([dateOnlySchema, z.null()]).optional(),
  expectedDeliveryAt: z.union([dateOnlySchema, z.null()]).optional(),
  shippingAddressId: z.string().uuid().nullable().optional(),
  billingAddressId: z.string().uuid().nullable().optional(),
  shippingAddressSnapshot: addressSnapshotSchema,
  billingAddressSnapshot: addressSnapshotSchema,
  shippingMethodId: z.string().uuid().nullable().optional(),
  shippingMethodCode: z.string().nullable().optional(),
  shippingMethodSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  paymentMethodId: z.string().uuid().nullable().optional(),
  paymentMethodCode: z.string().nullable().optional(),
  paymentMethodSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  tags: z.array(z.string().uuid()).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  customFieldSetId: z.string().uuid().nullable().optional()
}).refine(
  (input) => typeof input.currencyCode === "string" || input.placedAt !== void 0 || input.expectedDeliveryAt !== void 0 || input.channelId !== void 0 || input.statusEntryId !== void 0 || input.exchangeRate !== void 0 || input.paymentStatusEntryId !== void 0 || input.fulfillmentStatusEntryId !== void 0 || input.shippingAddressId !== void 0 || input.billingAddressId !== void 0 || input.customerEntityId !== void 0 || input.customerContactId !== void 0 || input.customerSnapshot !== void 0 || input.metadata !== void 0 || input.customerReference !== void 0 || input.externalReference !== void 0 || input.comment !== void 0 || input.comments !== void 0 || input.internalNotes !== void 0 || input.orderNumber !== void 0 || input.quoteNumber !== void 0 || input.shippingAddressSnapshot !== void 0 || input.billingAddressSnapshot !== void 0 || input.shippingMethodId !== void 0 || input.shippingMethodCode !== void 0 || input.shippingMethodSnapshot !== void 0 || input.paymentMethodId !== void 0 || input.paymentMethodCode !== void 0 || input.paymentMethodSnapshot !== void 0 || input.tags !== void 0 || input.customFields !== void 0 || input.customFieldSetId !== void 0,
  { message: "update_payload_empty" }
);
function cloneJson(value) {
  if (value === null || value === void 0) return value;
  return JSON.parse(JSON.stringify(value));
}
function toSnapshotCustomFieldWriteValues(values) {
  return normalizeCustomFieldValues(normalizeCustomFieldResponse(values) ?? {});
}
async function setDocumentCustomFieldsIfSupplied(em, params) {
  const { customFields } = params;
  if (customFields === void 0 || customFields === null) return;
  const values = typeof customFields === "object" && !Array.isArray(customFields) ? customFields : {};
  if (!Object.keys(values).length) return;
  await setRecordCustomFields(em, {
    entityId: params.entityId,
    recordId: params.recordId,
    organizationId: params.organizationId,
    tenantId: params.tenantId,
    values: normalizeCustomFieldValues(values)
  });
}
async function resolveCustomerSnapshot(em, organizationId, tenantId, customerEntityId, customerContactId) {
  if (!customerEntityId) return null;
  const customer = await em.findOne(
    CustomerEntity,
    { id: customerEntityId, organizationId, tenantId },
    { populate: ["personProfile", "companyProfile"] }
  );
  if (!customer) return null;
  const contact = customerContactId ? await em.findOne(CustomerPersonProfile, {
    id: customerContactId,
    organizationId,
    tenantId
  }) : null;
  return {
    customer: {
      id: customer.id,
      kind: customer.kind,
      displayName: customer.displayName,
      primaryEmail: customer.primaryEmail ?? null,
      primaryPhone: customer.primaryPhone ?? null,
      personProfile: customer.personProfile ? {
        id: customer.personProfile.id,
        firstName: customer.personProfile.firstName ?? null,
        lastName: customer.personProfile.lastName ?? null,
        preferredName: customer.personProfile.preferredName ?? null
      } : null,
      companyProfile: customer.companyProfile ? {
        id: customer.companyProfile.id,
        legalName: customer.companyProfile.legalName ?? null,
        brandName: customer.companyProfile.brandName ?? null,
        domain: customer.companyProfile.domain ?? null,
        websiteUrl: customer.companyProfile.websiteUrl ?? null
      } : null
    },
    contact: contact ? {
      id: contact.id,
      firstName: contact.firstName ?? null,
      lastName: contact.lastName ?? null,
      preferredName: contact.preferredName ?? null,
      jobTitle: contact.jobTitle ?? null,
      department: contact.department ?? null
    } : null
  };
}
async function resolveAddressSnapshot(em, organizationId, tenantId, addressId) {
  if (!addressId) return null;
  const address = await findOneWithDecryption(
    em,
    CustomerAddress,
    { id: addressId, organizationId, tenantId },
    void 0,
    { tenantId, organizationId }
  );
  if (!address) return null;
  return {
    id: address.id,
    name: address.name ?? null,
    purpose: address.purpose ?? null,
    companyName: address.companyName ?? null,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 ?? null,
    buildingNumber: address.buildingNumber ?? null,
    flatNumber: address.flatNumber ?? null,
    city: address.city ?? null,
    region: address.region ?? null,
    postalCode: address.postalCode ?? null,
    country: address.country ?? null,
    latitude: address.latitude ?? null,
    longitude: address.longitude ?? null,
    isPrimary: address.isPrimary
  };
}
async function resolveDocumentReferences(em, parsed) {
  const [
    resolvedCustomerSnapshot,
    resolvedBillingSnapshot,
    resolvedShippingSnapshot,
    shippingMethod,
    deliveryWindow,
    paymentMethod
  ] = await Promise.all([
    parsed.customerSnapshot ? Promise.resolve(cloneJson(parsed.customerSnapshot)) : resolveCustomerSnapshot(
      em,
      parsed.organizationId,
      parsed.tenantId,
      parsed.customerEntityId ?? null,
      parsed.customerContactId ?? null
    ),
    parsed.billingAddressSnapshot ? Promise.resolve(cloneJson(parsed.billingAddressSnapshot)) : resolveAddressSnapshot(
      em,
      parsed.organizationId,
      parsed.tenantId,
      parsed.billingAddressId ?? null
    ),
    parsed.shippingAddressSnapshot ? Promise.resolve(cloneJson(parsed.shippingAddressSnapshot)) : resolveAddressSnapshot(
      em,
      parsed.organizationId,
      parsed.tenantId,
      parsed.shippingAddressId ?? null
    ),
    parsed.shippingMethodId ? em.findOne(SalesShippingMethod, {
      id: parsed.shippingMethodId,
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId
    }) : Promise.resolve(null),
    parsed.deliveryWindowId ? em.findOne(SalesDeliveryWindow, {
      id: parsed.deliveryWindowId,
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId
    }) : Promise.resolve(null),
    parsed.paymentMethodId ? em.findOne(SalesPaymentMethod, {
      id: parsed.paymentMethodId,
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId
    }) : Promise.resolve(null)
  ]);
  return {
    customerSnapshot: resolvedCustomerSnapshot ? cloneJson(resolvedCustomerSnapshot) : null,
    billingAddressSnapshot: resolvedBillingSnapshot ? cloneJson(resolvedBillingSnapshot) : null,
    shippingAddressSnapshot: resolvedShippingSnapshot ? cloneJson(resolvedShippingSnapshot) : null,
    shippingMethod: shippingMethod ?? null,
    deliveryWindow: deliveryWindow ?? null,
    paymentMethod: paymentMethod ?? null
  };
}
function normalizeStatusValue(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : null;
}
function isConfirmedOrderStatus(status) {
  return status === "confirmed";
}
function isCancelledOrderStatus(status) {
  return status === "canceled" || status === "cancelled";
}
async function emitOrderLifecycleEvent(input) {
  await emitSalesEvent(input.eventId, {
    id: input.order.id,
    orderId: input.order.id,
    orderNumber: input.order.orderNumber,
    previousStatus: input.previousStatus,
    status: normalizeStatusValue(input.order.status),
    tenantId: input.order.tenantId,
    organizationId: input.order.organizationId
  });
}
function emitOrderLifecycleEventsForTransition(input) {
  const nextStatus = normalizeStatusValue(input.order.status);
  if (input.previousStatus === nextStatus) return;
  if (isConfirmedOrderStatus(nextStatus)) {
    void emitOrderLifecycleEvent({
      eventId: "sales.order.confirmed",
      order: input.order,
      previousStatus: input.previousStatus
    }).catch((err) => {
      logger.warn("order lifecycle event emit failed", {
        eventId: "sales.order.confirmed",
        orderId: input.order.id,
        err
      });
    });
  }
  if (isCancelledOrderStatus(nextStatus)) {
    void emitOrderLifecycleEvent({
      eventId: "sales.order.cancelled",
      order: input.order,
      previousStatus: input.previousStatus
    }).catch((err) => {
      logger.warn("order lifecycle event emit failed", {
        eventId: "sales.order.cancelled",
        orderId: input.order.id,
        err
      });
    });
  }
}
function resolveNoteAuthorFromAuth(auth) {
  if (!auth || auth.isApiKey) return null;
  const sub = typeof auth.sub === "string" ? auth.sub.trim() : "";
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  return uuidRegex.test(sub) ? sub : null;
}
function resolveStatusChangeActor(auth, translate) {
  const unknownLabel = translate(
    "sales.orders.status_change.actor_unknown",
    "unknown user"
  );
  if (!auth) return unknownLabel;
  if (auth.isApiKey) {
    const keyName = typeof auth.keyName === "string" ? auth.keyName.trim() : "";
    const keyId = typeof auth.keyId === "string" ? auth.keyId.trim() : "";
    const label = keyName || keyId || (typeof auth.sub === "string" ? auth.sub : "");
    return label ? translate(
      "sales.orders.status_change.actor_api_key",
      "API key {name}",
      { name: label }
    ) : unknownLabel;
  }
  const email = typeof auth.email === "string" ? auth.email.trim() : "";
  if (email) return email;
  const sub = typeof auth.sub === "string" ? auth.sub.trim() : "";
  if (sub) return sub;
  return unknownLabel;
}
function formatStatusLabel(status, translate) {
  if (status && status.trim().length) return status.trim();
  return translate("sales.orders.status_change.empty", "unset");
}
async function appendOrderStatusChangeNote({
  em,
  order,
  previousStatus,
  auth
}) {
  const nextStatus = normalizeStatusValue(order.status);
  if (previousStatus === nextStatus) return null;
  const { translate } = await resolveTranslations();
  const body = translate(
    "sales.orders.status_change.note",
    "Status changed from {from} to {to} by {actor}.",
    {
      from: formatStatusLabel(previousStatus, translate),
      to: formatStatusLabel(nextStatus, translate),
      actor: resolveStatusChangeActor(auth, translate)
    }
  );
  const note = em.create(SalesNote, {
    organizationId: order.organizationId,
    tenantId: order.tenantId,
    contextType: "order",
    contextId: order.id,
    order,
    authorUserId: resolveNoteAuthorFromAuth(auth),
    appearanceIcon: null,
    appearanceColor: null,
    body,
    createdAt: /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date()
  });
  em.persist(note);
  return note;
}
async function applyDocumentUpdate({
  kind,
  entity,
  input,
  em
}) {
  const organizationId = entity.organizationId;
  const tenantId = entity.tenantId;
  const status = typeof entity.status === "string" ? entity.status : null;
  const { translate } = await resolveTranslations();
  const wantsCustomerChange = input.customerEntityId !== void 0 || input.customerContactId !== void 0 || input.customerSnapshot !== void 0 || input.metadata !== void 0;
  const wantsAddressChange = input.shippingAddressId !== void 0 || input.billingAddressId !== void 0 || input.shippingAddressSnapshot !== void 0 || input.billingAddressSnapshot !== void 0;
  let settings = null;
  if (kind === "order" && (wantsCustomerChange || wantsAddressChange)) {
    settings = await loadSalesSettings(em, { organizationId, tenantId });
  }
  const guardStatus = (allowed, errorKey, fallback) => {
    if (!Array.isArray(allowed)) return;
    if (allowed.length === 0) {
      throw new CrudHttpError(400, { error: translate(errorKey, fallback) });
    }
    if (!status || !allowed.includes(status)) {
      throw new CrudHttpError(400, { error: translate(errorKey, fallback) });
    }
  };
  if (kind === "order" && wantsCustomerChange) {
    guardStatus(
      settings?.orderCustomerEditableStatuses ?? null,
      "sales.orders.edit_customer_blocked",
      "Editing the customer is blocked for this status."
    );
  }
  if (kind === "order" && wantsAddressChange) {
    guardStatus(
      settings?.orderAddressEditableStatuses ?? null,
      "sales.orders.edit_addresses_blocked",
      "Editing addresses is blocked for this status."
    );
  }
  if (kind === "order" && typeof input.orderNumber === "string") {
    entity.orderNumber = input.orderNumber;
  }
  if (kind === "quote" && typeof input.quoteNumber === "string") {
    entity.quoteNumber = input.quoteNumber;
  }
  if (input.customerEntityId !== void 0) {
    entity.customerEntityId = input.customerEntityId ?? null;
    entity.customerSnapshot = await resolveCustomerSnapshot(
      em,
      organizationId,
      tenantId,
      input.customerEntityId,
      input.customerContactId ?? entity.customerContactId ?? null
    );
    entity.customerContactId = input.customerContactId ?? null;
    entity.billingAddressId = null;
    entity.shippingAddressId = null;
    entity.billingAddressSnapshot = null;
    entity.shippingAddressSnapshot = null;
  }
  if (input.customerContactId !== void 0) {
    entity.customerContactId = input.customerContactId ?? null;
    if (entity.customerEntityId) {
      entity.customerSnapshot = await resolveCustomerSnapshot(
        em,
        organizationId,
        tenantId,
        entity.customerEntityId,
        input.customerContactId
      );
    }
  }
  if (input.customerSnapshot !== void 0) {
    entity.customerSnapshot = input.customerSnapshot ?? null;
  }
  if (input.metadata !== void 0) {
    entity.metadata = input.metadata ?? null;
  }
  if (input.externalReference !== void 0) {
    const normalized = typeof input.externalReference === "string" ? input.externalReference.trim() : "";
    entity.externalReference = normalized.length ? normalized : null;
  }
  if (input.customerReference !== void 0) {
    const normalized = typeof input.customerReference === "string" ? input.customerReference.trim() : "";
    entity.customerReference = normalized.length ? normalized : null;
  }
  if (input.comment !== void 0) {
    const normalized = typeof input.comment === "string" ? input.comment.trim() : "";
    entity.comments = normalized.length ? normalized : null;
  }
  if (input.comments !== void 0) {
    const normalized = typeof input.comments === "string" ? input.comments.trim() : "";
    entity.comments = normalized.length ? normalized : null;
  }
  if (kind === "quote" && input.internalNotes !== void 0) {
    throw new CrudHttpError(400, {
      error: translate(
        "sales.quotes.internal_notes_unsupported",
        "Internal notes are not available on quotes."
      )
    });
  }
  if (kind === "order" && input.internalNotes !== void 0) {
    const normalized = typeof input.internalNotes === "string" ? input.internalNotes.trim() : "";
    entity.internalNotes = normalized.length ? normalized : null;
  }
  if (typeof input.currencyCode === "string") {
    entity.currencyCode = input.currencyCode;
  }
  if (kind === "quote" && input.exchangeRate !== void 0) {
    throw new CrudHttpError(400, {
      error: translate(
        "sales.quotes.exchange_rate_unsupported",
        "Exchange rate is not available on quotes."
      )
    });
  }
  if (kind === "order" && input.exchangeRate !== void 0) {
    entity.exchangeRate = toNumericString(input.exchangeRate);
  }
  if (input.channelId !== void 0) {
    if (input.channelId === null) {
      entity.channelId = null;
    } else {
      const channel = await findOneWithDecryption(
        em,
        SalesChannel,
        {
          id: input.channelId,
          organizationId,
          tenantId,
          deletedAt: null
        },
        {},
        { tenantId, organizationId }
      );
      if (!channel) {
        throw new CrudHttpError(400, {
          error: translate(
            "sales.documents.detail.channelInvalid",
            "Selected channel could not be found."
          )
        });
      }
      entity.channelId = channel.id;
    }
  }
  if (input.statusEntryId !== void 0) {
    const statusValue = await resolveDictionaryEntryValue(
      em,
      input.statusEntryId,
      { tenantId }
    );
    if (input.statusEntryId && !statusValue) {
      throw new CrudHttpError(400, {
        error: translate(
          "sales.documents.detail.statusInvalid",
          "Selected status could not be found."
        )
      });
    }
    entity.statusEntryId = input.statusEntryId ?? null;
    entity.status = statusValue;
  }
  if (kind === "quote" && input.paymentStatusEntryId !== void 0) {
    throw new CrudHttpError(400, {
      error: translate(
        "sales.quotes.payment_status_unsupported",
        "Payment status is not available on quotes."
      )
    });
  }
  if (kind === "order" && input.paymentStatusEntryId !== void 0) {
    const paymentStatusValue = await resolveDictionaryEntryValue(
      em,
      input.paymentStatusEntryId,
      { tenantId }
    );
    if (input.paymentStatusEntryId && !paymentStatusValue) {
      throw new CrudHttpError(400, {
        error: translate(
          "sales.documents.detail.statusInvalid",
          "Selected status could not be found."
        )
      });
    }
    entity.paymentStatusEntryId = input.paymentStatusEntryId ?? null;
    entity.paymentStatus = paymentStatusValue;
  }
  if (kind === "quote" && input.fulfillmentStatusEntryId !== void 0) {
    throw new CrudHttpError(400, {
      error: translate(
        "sales.quotes.fulfillment_status_unsupported",
        "Fulfillment status is not available on quotes."
      )
    });
  }
  if (kind === "order" && input.fulfillmentStatusEntryId !== void 0) {
    const fulfillmentStatusValue = await resolveDictionaryEntryValue(
      em,
      input.fulfillmentStatusEntryId,
      { tenantId }
    );
    if (input.fulfillmentStatusEntryId && !fulfillmentStatusValue) {
      throw new CrudHttpError(400, {
        error: translate(
          "sales.documents.detail.statusInvalid",
          "Selected status could not be found."
        )
      });
    }
    entity.fulfillmentStatusEntryId = input.fulfillmentStatusEntryId ?? null;
    entity.fulfillmentStatus = fulfillmentStatusValue;
  }
  if (input.placedAt !== void 0) {
    if (input.placedAt === null) {
      entity.placedAt = null;
    } else {
      const parsed = new Date(input.placedAt);
      entity.placedAt = Number.isNaN(parsed.getTime()) ? entity.placedAt : parsed;
    }
  }
  if (input.expectedDeliveryAt !== void 0 && "expectedDeliveryAt" in entity) {
    if (input.expectedDeliveryAt === null) {
      entity.expectedDeliveryAt = null;
    } else {
      const parsed = new Date(input.expectedDeliveryAt);
      entity.expectedDeliveryAt = Number.isNaN(parsed.getTime()) ? entity.expectedDeliveryAt : parsed;
    }
  }
  if (input.shippingAddressId !== void 0) {
    entity.shippingAddressId = input.shippingAddressId ?? null;
    if (input.shippingAddressSnapshot === void 0) {
      entity.shippingAddressSnapshot = await resolveAddressSnapshot(
        em,
        organizationId,
        tenantId,
        input.shippingAddressId
      );
    }
  }
  if (input.billingAddressId !== void 0) {
    entity.billingAddressId = input.billingAddressId ?? null;
    if (input.billingAddressSnapshot === void 0) {
      entity.billingAddressSnapshot = await resolveAddressSnapshot(
        em,
        organizationId,
        tenantId,
        input.billingAddressId
      );
    }
  }
  if (input.shippingAddressSnapshot !== void 0) {
    entity.shippingAddressSnapshot = input.shippingAddressSnapshot ?? null;
  }
  if (input.billingAddressSnapshot !== void 0) {
    entity.billingAddressSnapshot = input.billingAddressSnapshot ?? null;
  }
  if (input.shippingMethodId !== void 0 || input.shippingMethodSnapshot !== void 0 || input.shippingMethodCode !== void 0) {
    let shippingMethod = null;
    if (input.shippingMethodId) {
      shippingMethod = await em.findOne(SalesShippingMethod, {
        id: input.shippingMethodId,
        organizationId,
        tenantId,
        deletedAt: null
      });
      if (!shippingMethod) {
        throw new CrudHttpError(400, {
          error: translate(
            "sales.documents.detail.shippingMethodInvalid",
            "Selected shipping method could not be found."
          )
        });
      }
    }
    entity.shippingMethodId = input.shippingMethodId ?? null;
    entity.shippingMethod = shippingMethod ?? null;
    entity.shippingMethodCode = input.shippingMethodCode ?? shippingMethod?.code ?? null;
    if (input.shippingMethodSnapshot !== void 0) {
      entity.shippingMethodSnapshot = input.shippingMethodSnapshot ?? null;
    } else {
      entity.shippingMethodSnapshot = shippingMethod ? {
        id: shippingMethod.id,
        code: shippingMethod.code,
        name: shippingMethod.name,
        description: shippingMethod.description ?? null,
        carrierCode: shippingMethod.carrierCode ?? null,
        providerKey: shippingMethod.providerKey ?? null,
        serviceLevel: shippingMethod.serviceLevel ?? null,
        estimatedTransitDays: shippingMethod.estimatedTransitDays ?? null,
        baseRateNet: shippingMethod.baseRateNet,
        baseRateGross: shippingMethod.baseRateGross,
        currencyCode: shippingMethod.currencyCode ?? null,
        metadata: shippingMethod.metadata ? cloneJson(shippingMethod.metadata) : null,
        providerSettings: shippingMethod.metadata && typeof shippingMethod.metadata === "object" ? cloneJson(
          shippingMethod.metadata.providerSettings ?? null
        ) : null
      } : null;
    }
  }
  if (input.paymentMethodId !== void 0 || input.paymentMethodSnapshot !== void 0 || input.paymentMethodCode !== void 0) {
    let paymentMethod = null;
    if (input.paymentMethodId) {
      paymentMethod = await em.findOne(SalesPaymentMethod, {
        id: input.paymentMethodId,
        organizationId,
        tenantId,
        deletedAt: null
      });
      if (!paymentMethod) {
        throw new CrudHttpError(400, {
          error: translate(
            "sales.documents.detail.paymentMethodInvalid",
            "Selected payment method could not be found."
          )
        });
      }
    }
    entity.paymentMethodId = input.paymentMethodId ?? null;
    entity.paymentMethod = paymentMethod ?? null;
    entity.paymentMethodCode = input.paymentMethodCode ?? paymentMethod?.code ?? null;
    if (input.paymentMethodSnapshot !== void 0) {
      entity.paymentMethodSnapshot = input.paymentMethodSnapshot ?? null;
    } else {
      entity.paymentMethodSnapshot = paymentMethod ? {
        id: paymentMethod.id,
        code: paymentMethod.code,
        name: paymentMethod.name,
        description: paymentMethod.description ?? null,
        providerKey: paymentMethod.providerKey ?? null,
        terms: paymentMethod.terms ?? null,
        metadata: paymentMethod.metadata ? cloneJson(paymentMethod.metadata) : null,
        providerSettings: paymentMethod.metadata && typeof paymentMethod.metadata === "object" ? cloneJson(
          paymentMethod.metadata.providerSettings ?? null
        ) : null
      } : null;
    }
  }
  if (input.tags !== void 0) {
    await syncSalesDocumentTags(em, {
      documentId: entity.id,
      kind,
      organizationId,
      tenantId,
      tagIds: input.tags
    });
  }
  if (input.customFieldSetId !== void 0) {
    entity.customFieldSetId = input.customFieldSetId ?? null;
  }
  if (input.customFields !== void 0) {
    const values = input.customFields && typeof input.customFields === "object" && !Array.isArray(input.customFields) ? input.customFields : {};
    await setRecordCustomFields(em, {
      entityId: kind === "order" ? E.sales.sales_order : E.sales.sales_quote,
      recordId: entity.id,
      organizationId,
      tenantId,
      values: normalizeCustomFieldValues(values)
    });
  }
}
async function loadQuoteSnapshot(em, id) {
  const quote = await findOneWithDecryption(em, SalesQuote, { id, deletedAt: null });
  if (!quote) return null;
  const decryptionScope = { tenantId: quote.tenantId, organizationId: quote.organizationId };
  const lines = await findWithDecryption(
    em,
    SalesQuoteLine,
    { quote },
    { orderBy: { lineNumber: "asc" } },
    decryptionScope
  );
  const adjustments = await findWithDecryption(
    em,
    SalesQuoteAdjustment,
    { quote },
    { orderBy: { position: "asc" } },
    decryptionScope
  );
  const [
    addresses,
    notes,
    tags,
    quoteCustomFields,
    lineCustomFields,
    adjustmentCustomFields
  ] = await Promise.all([
    findWithDecryption(
      em,
      SalesDocumentAddress,
      { documentId: id, documentKind: "quote" },
      void 0,
      { tenantId: quote.tenantId, organizationId: quote.organizationId }
    ),
    findWithDecryption(
      em,
      SalesNote,
      { contextType: "quote", contextId: id },
      void 0,
      { tenantId: quote.tenantId, organizationId: quote.organizationId }
    ),
    findWithDecryption(
      em,
      SalesDocumentTagAssignment,
      { documentId: id, documentKind: "quote" },
      { populate: ["tag"] },
      { tenantId: quote.tenantId, organizationId: quote.organizationId }
    ),
    loadCustomFieldValues({
      em,
      entityId: E.sales.sales_quote,
      recordIds: [quote.id],
      tenantIdByRecord: { [quote.id]: quote.tenantId },
      organizationIdByRecord: { [quote.id]: quote.organizationId }
    }),
    lines.length ? loadCustomFieldValues({
      em,
      entityId: E.sales.sales_quote_line,
      recordIds: lines.map((line) => line.id),
      tenantIdByRecord: Object.fromEntries(
        lines.map((line) => [line.id, quote.tenantId])
      ),
      organizationIdByRecord: Object.fromEntries(
        lines.map((line) => [line.id, quote.organizationId])
      )
    }) : Promise.resolve({}),
    adjustments.length ? loadCustomFieldValues({
      em,
      entityId: E.sales.sales_quote_adjustment,
      recordIds: adjustments.map((adj) => adj.id),
      tenantIdByRecord: Object.fromEntries(
        adjustments.map((adj) => [adj.id, quote.tenantId])
      ),
      organizationIdByRecord: Object.fromEntries(
        adjustments.map((adj) => [adj.id, quote.organizationId])
      )
    }) : Promise.resolve({})
  ]);
  const addressSnapshots = addresses.map(
    (entry) => ({
      id: entry.id,
      organizationId: entry.organizationId,
      tenantId: entry.tenantId,
      documentId: entry.documentId,
      documentKind: "quote",
      customerAddressId: entry.customerAddressId ?? null,
      name: entry.name ?? null,
      purpose: entry.purpose ?? null,
      companyName: entry.companyName ?? null,
      addressLine1: entry.addressLine1,
      addressLine2: entry.addressLine2 ?? null,
      city: entry.city ?? null,
      region: entry.region ?? null,
      postalCode: entry.postalCode ?? null,
      country: entry.country ?? null,
      buildingNumber: entry.buildingNumber ?? null,
      flatNumber: entry.flatNumber ?? null,
      latitude: entry.latitude ?? null,
      longitude: entry.longitude ?? null
    })
  );
  const noteSnapshots = notes.map((entry) => ({
    id: entry.id,
    organizationId: entry.organizationId,
    tenantId: entry.tenantId,
    contextType: entry.contextType,
    contextId: entry.contextId,
    orderId: entry.order ? typeof entry.order === "string" ? entry.order : entry.order.id : null,
    quoteId: entry.quote ? typeof entry.quote === "string" ? entry.quote : entry.quote.id : null,
    body: entry.body,
    authorUserId: entry.authorUserId ?? null,
    appearanceIcon: entry.appearanceIcon ?? null,
    appearanceColor: entry.appearanceColor ?? null
  }));
  const tagSnapshots = tags.map((assignment) => {
    const tagId = typeof assignment.tag === "string" ? assignment.tag : assignment.tag?.id ?? assignment?.tag_id ?? null;
    if (!tagId) return null;
    return {
      id: assignment.id,
      tagId,
      organizationId: assignment.organizationId,
      tenantId: assignment.tenantId,
      documentId: assignment.documentId,
      documentKind: "quote"
    };
  }).filter((entry) => !!entry);
  return {
    quote: {
      id: quote.id,
      organizationId: quote.organizationId,
      tenantId: quote.tenantId,
      quoteNumber: quote.quoteNumber,
      statusEntryId: quote.statusEntryId ?? null,
      status: quote.status ?? null,
      customerEntityId: quote.customerEntityId ?? null,
      customerContactId: quote.customerContactId ?? null,
      customerSnapshot: quote.customerSnapshot ? cloneJson(quote.customerSnapshot) : null,
      billingAddressId: quote.billingAddressId ?? null,
      shippingAddressId: quote.shippingAddressId ?? null,
      billingAddressSnapshot: quote.billingAddressSnapshot ? cloneJson(quote.billingAddressSnapshot) : null,
      shippingAddressSnapshot: quote.shippingAddressSnapshot ? cloneJson(quote.shippingAddressSnapshot) : null,
      currencyCode: quote.currencyCode,
      validFrom: quote.validFrom ? quote.validFrom.toISOString() : null,
      validUntil: quote.validUntil ? quote.validUntil.toISOString() : null,
      comments: quote.comments ?? null,
      taxInfo: quote.taxInfo ? cloneJson(quote.taxInfo) : null,
      shippingMethodId: quote.shippingMethodId ?? null,
      shippingMethodCode: quote.shippingMethodCode ?? null,
      deliveryWindowId: quote.deliveryWindowId ?? null,
      deliveryWindowCode: quote.deliveryWindowCode ?? null,
      paymentMethodId: quote.paymentMethodId ?? null,
      paymentMethodCode: quote.paymentMethodCode ?? null,
      channelId: quote.channelId ?? null,
      shippingMethodSnapshot: quote.shippingMethodSnapshot ? cloneJson(quote.shippingMethodSnapshot) : null,
      deliveryWindowSnapshot: quote.deliveryWindowSnapshot ? cloneJson(quote.deliveryWindowSnapshot) : null,
      paymentMethodSnapshot: quote.paymentMethodSnapshot ? cloneJson(quote.paymentMethodSnapshot) : null,
      metadata: quote.metadata ? cloneJson(quote.metadata) : null,
      customFieldSetId: quote.customFieldSetId ?? null,
      customFields: quoteCustomFields[quote.id] ? cloneJson(quoteCustomFields[quote.id]) : null,
      subtotalNetAmount: quote.subtotalNetAmount,
      subtotalGrossAmount: quote.subtotalGrossAmount,
      discountTotalAmount: quote.discountTotalAmount,
      taxTotalAmount: quote.taxTotalAmount,
      grandTotalNetAmount: quote.grandTotalNetAmount,
      grandTotalGrossAmount: quote.grandTotalGrossAmount,
      totalsSnapshot: quote.totalsSnapshot ? cloneJson(quote.totalsSnapshot) : null,
      lineItemCount: quote.lineItemCount
    },
    lines: lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      kind: line.kind,
      statusEntryId: line.statusEntryId ?? null,
      status: line.status ?? null,
      productId: line.productId ?? null,
      productVariantId: line.productVariantId ?? null,
      catalogSnapshot: line.catalogSnapshot ? cloneJson(line.catalogSnapshot) : null,
      name: line.name ?? null,
      description: line.description ?? null,
      comment: line.comment ?? null,
      quantity: line.quantity,
      quantityUnit: line.quantityUnit ?? null,
      normalizedQuantity: line.normalizedQuantity ?? line.quantity,
      normalizedUnit: line.normalizedUnit ?? line.quantityUnit ?? null,
      uomSnapshot: line.uomSnapshot ? cloneJson(line.uomSnapshot) : null,
      currencyCode: line.currencyCode,
      unitPriceNet: line.unitPriceNet,
      unitPriceGross: line.unitPriceGross,
      discountAmount: line.discountAmount,
      discountPercent: line.discountPercent,
      taxRate: line.taxRate,
      taxAmount: line.taxAmount,
      totalNetAmount: line.totalNetAmount,
      totalGrossAmount: line.totalGrossAmount,
      configuration: line.configuration ? cloneJson(line.configuration) : null,
      promotionCode: line.promotionCode ?? null,
      promotionSnapshot: line.promotionSnapshot ? cloneJson(line.promotionSnapshot) : null,
      metadata: line.metadata ? cloneJson(line.metadata) : null,
      customFieldSetId: line.customFieldSetId ?? null,
      customFields: lineCustomFields[line.id] ? cloneJson(lineCustomFields[line.id]) : null
    })),
    adjustments: adjustments.map((adj) => ({
      id: adj.id,
      scope: adj.scope,
      kind: adj.kind,
      code: adj.code ?? null,
      label: adj.label ?? null,
      calculatorKey: adj.calculatorKey ?? null,
      promotionId: adj.promotionId ?? null,
      rate: adj.rate,
      amountNet: adj.amountNet,
      amountGross: adj.amountGross,
      currencyCode: adj.currencyCode ?? null,
      metadata: adj.metadata ? cloneJson(adj.metadata) : null,
      position: adj.position,
      quoteLineId: typeof adj.quoteLine === "string" ? adj.quoteLine : adj.quoteLine?.id ?? null,
      customFields: adjustmentCustomFields[adj.id] ? cloneJson(adjustmentCustomFields[adj.id]) : null
    })),
    addresses: addressSnapshots,
    notes: noteSnapshots,
    tags: tagSnapshots
  };
}
async function loadOrderSnapshot(em, id) {
  const order = await findOneWithDecryption(em, SalesOrder, { id, deletedAt: null });
  if (!order) return null;
  const decryptionScope = { tenantId: order.tenantId, organizationId: order.organizationId };
  const lines = await findWithDecryption(
    em,
    SalesOrderLine,
    { order },
    { orderBy: { lineNumber: "asc" } },
    decryptionScope
  );
  const adjustments = await findWithDecryption(
    em,
    SalesOrderAdjustment,
    { order },
    { orderBy: { position: "asc" } },
    decryptionScope
  );
  const [
    addresses,
    notes,
    tags,
    shipments,
    payments,
    orderCustomFields,
    lineCustomFields,
    adjustmentCustomFields
  ] = await Promise.all([
    findWithDecryption(
      em,
      SalesDocumentAddress,
      { documentId: id, documentKind: "order" },
      void 0,
      { tenantId: order.tenantId, organizationId: order.organizationId }
    ),
    findWithDecryption(
      em,
      SalesNote,
      { contextType: "order", contextId: id },
      void 0,
      { tenantId: order.tenantId, organizationId: order.organizationId }
    ),
    findWithDecryption(
      em,
      SalesDocumentTagAssignment,
      { documentId: id, documentKind: "order" },
      { populate: ["tag"] },
      { tenantId: order.tenantId, organizationId: order.organizationId }
    ),
    em.find(SalesShipment, { order }),
    em.find(SalesPayment, { order }),
    loadCustomFieldValues({
      em,
      entityId: E.sales.sales_order,
      recordIds: [order.id],
      tenantIdByRecord: { [order.id]: order.tenantId },
      organizationIdByRecord: { [order.id]: order.organizationId }
    }),
    lines.length ? loadCustomFieldValues({
      em,
      entityId: E.sales.sales_order_line,
      recordIds: lines.map((line) => line.id),
      tenantIdByRecord: Object.fromEntries(
        lines.map((line) => [line.id, order.tenantId])
      ),
      organizationIdByRecord: Object.fromEntries(
        lines.map((line) => [line.id, order.organizationId])
      )
    }) : Promise.resolve({}),
    adjustments.length ? loadCustomFieldValues({
      em,
      entityId: E.sales.sales_order_adjustment,
      recordIds: adjustments.map((adj) => adj.id),
      tenantIdByRecord: Object.fromEntries(
        adjustments.map((adj) => [adj.id, order.tenantId])
      ),
      organizationIdByRecord: Object.fromEntries(
        adjustments.map((adj) => [adj.id, order.organizationId])
      )
    }) : Promise.resolve({})
  ]);
  const shipmentSnapshots = (await Promise.all(
    shipments.map((entry) => loadShipmentSnapshot(em, entry.id))
  )).filter((entry) => !!entry);
  const paymentSnapshots = (await Promise.all(
    payments.map((entry) => loadPaymentSnapshot(em, entry.id))
  )).filter((entry) => !!entry);
  const addressSnapshots = addresses.map(
    (entry) => ({
      id: entry.id,
      organizationId: entry.organizationId,
      tenantId: entry.tenantId,
      documentId: entry.documentId,
      documentKind: "order",
      customerAddressId: entry.customerAddressId ?? null,
      name: entry.name ?? null,
      purpose: entry.purpose ?? null,
      companyName: entry.companyName ?? null,
      addressLine1: entry.addressLine1,
      addressLine2: entry.addressLine2 ?? null,
      city: entry.city ?? null,
      region: entry.region ?? null,
      postalCode: entry.postalCode ?? null,
      country: entry.country ?? null,
      buildingNumber: entry.buildingNumber ?? null,
      flatNumber: entry.flatNumber ?? null,
      latitude: entry.latitude ?? null,
      longitude: entry.longitude ?? null
    })
  );
  const noteSnapshots = notes.map((entry) => ({
    id: entry.id,
    organizationId: entry.organizationId,
    tenantId: entry.tenantId,
    contextType: entry.contextType,
    contextId: entry.contextId,
    orderId: entry.order ? typeof entry.order === "string" ? entry.order : entry.order.id : null,
    quoteId: entry.quote ? typeof entry.quote === "string" ? entry.quote : entry.quote.id : null,
    body: entry.body,
    authorUserId: entry.authorUserId ?? null,
    appearanceIcon: entry.appearanceIcon ?? null,
    appearanceColor: entry.appearanceColor ?? null
  }));
  const tagSnapshots = tags.map((assignment) => {
    const tagId = typeof assignment.tag === "string" ? assignment.tag : assignment.tag?.id ?? assignment?.tag_id ?? null;
    if (!tagId) return null;
    return {
      id: assignment.id,
      tagId,
      organizationId: assignment.organizationId,
      tenantId: assignment.tenantId,
      documentId: assignment.documentId,
      documentKind: "order"
    };
  }).filter((entry) => !!entry);
  return {
    order: {
      id: order.id,
      organizationId: order.organizationId,
      tenantId: order.tenantId,
      orderNumber: order.orderNumber,
      statusEntryId: order.statusEntryId ?? null,
      status: order.status ?? null,
      fulfillmentStatusEntryId: order.fulfillmentStatusEntryId ?? null,
      fulfillmentStatus: order.fulfillmentStatus ?? null,
      paymentStatusEntryId: order.paymentStatusEntryId ?? null,
      paymentStatus: order.paymentStatus ?? null,
      customerEntityId: order.customerEntityId ?? null,
      customerContactId: order.customerContactId ?? null,
      customerSnapshot: order.customerSnapshot ? cloneJson(order.customerSnapshot) : null,
      billingAddressId: order.billingAddressId ?? null,
      shippingAddressId: order.shippingAddressId ?? null,
      billingAddressSnapshot: order.billingAddressSnapshot ? cloneJson(order.billingAddressSnapshot) : null,
      shippingAddressSnapshot: order.shippingAddressSnapshot ? cloneJson(order.shippingAddressSnapshot) : null,
      currencyCode: order.currencyCode,
      exchangeRate: order.exchangeRate ?? null,
      taxStrategyKey: order.taxStrategyKey ?? null,
      discountStrategyKey: order.discountStrategyKey ?? null,
      taxInfo: order.taxInfo ? cloneJson(order.taxInfo) : null,
      shippingMethodId: order.shippingMethodId ?? null,
      shippingMethodCode: order.shippingMethodCode ?? null,
      deliveryWindowId: order.deliveryWindowId ?? null,
      deliveryWindowCode: order.deliveryWindowCode ?? null,
      paymentMethodId: order.paymentMethodId ?? null,
      paymentMethodCode: order.paymentMethodCode ?? null,
      channelId: order.channelId ?? null,
      placedAt: order.placedAt ? order.placedAt.toISOString() : null,
      expectedDeliveryAt: order.expectedDeliveryAt ? order.expectedDeliveryAt.toISOString() : null,
      dueAt: order.dueAt ? order.dueAt.toISOString() : null,
      comments: order.comments ?? null,
      internalNotes: order.internalNotes ?? null,
      shippingMethodSnapshot: order.shippingMethodSnapshot ? cloneJson(order.shippingMethodSnapshot) : null,
      deliveryWindowSnapshot: order.deliveryWindowSnapshot ? cloneJson(order.deliveryWindowSnapshot) : null,
      paymentMethodSnapshot: order.paymentMethodSnapshot ? cloneJson(order.paymentMethodSnapshot) : null,
      metadata: order.metadata ? cloneJson(order.metadata) : null,
      customFieldSetId: order.customFieldSetId ?? null,
      customFields: orderCustomFields[order.id] ? cloneJson(orderCustomFields[order.id]) : null,
      subtotalNetAmount: order.subtotalNetAmount,
      subtotalGrossAmount: order.subtotalGrossAmount,
      discountTotalAmount: order.discountTotalAmount,
      taxTotalAmount: order.taxTotalAmount,
      shippingNetAmount: order.shippingNetAmount,
      shippingGrossAmount: order.shippingGrossAmount,
      surchargeTotalAmount: order.surchargeTotalAmount,
      grandTotalNetAmount: order.grandTotalNetAmount,
      grandTotalGrossAmount: order.grandTotalGrossAmount,
      paidTotalAmount: order.paidTotalAmount,
      refundedTotalAmount: order.refundedTotalAmount,
      outstandingAmount: order.outstandingAmount,
      totalsSnapshot: order.totalsSnapshot ? cloneJson(order.totalsSnapshot) : null,
      lineItemCount: order.lineItemCount
    },
    lines: lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      kind: line.kind,
      statusEntryId: line.statusEntryId ?? null,
      status: line.status ?? null,
      productId: line.productId ?? null,
      productVariantId: line.productVariantId ?? null,
      catalogSnapshot: line.catalogSnapshot ? cloneJson(line.catalogSnapshot) : null,
      name: line.name ?? null,
      description: line.description ?? null,
      comment: line.comment ?? null,
      quantity: line.quantity,
      quantityUnit: line.quantityUnit ?? null,
      normalizedQuantity: line.normalizedQuantity ?? line.quantity,
      normalizedUnit: line.normalizedUnit ?? line.quantityUnit ?? null,
      uomSnapshot: line.uomSnapshot ? cloneJson(line.uomSnapshot) : null,
      reservedQuantity: line.reservedQuantity,
      fulfilledQuantity: line.fulfilledQuantity,
      invoicedQuantity: line.invoicedQuantity,
      returnedQuantity: line.returnedQuantity,
      currencyCode: line.currencyCode,
      unitPriceNet: line.unitPriceNet,
      unitPriceGross: line.unitPriceGross,
      discountAmount: line.discountAmount,
      discountPercent: line.discountPercent,
      taxRate: line.taxRate,
      taxAmount: line.taxAmount,
      totalNetAmount: line.totalNetAmount,
      totalGrossAmount: line.totalGrossAmount,
      configuration: line.configuration ? cloneJson(line.configuration) : null,
      promotionCode: line.promotionCode ?? null,
      promotionSnapshot: line.promotionSnapshot ? cloneJson(line.promotionSnapshot) : null,
      metadata: line.metadata ? cloneJson(line.metadata) : null,
      customFieldSetId: line.customFieldSetId ?? null,
      customFields: lineCustomFields[line.id] ? cloneJson(lineCustomFields[line.id]) : null
    })),
    adjustments: adjustments.map((adj) => ({
      id: adj.id,
      scope: adj.scope,
      kind: adj.kind,
      code: adj.code ?? null,
      label: adj.label ?? null,
      calculatorKey: adj.calculatorKey ?? null,
      promotionId: adj.promotionId ?? null,
      rate: adj.rate,
      amountNet: adj.amountNet,
      amountGross: adj.amountGross,
      currencyCode: adj.currencyCode ?? null,
      metadata: adj.metadata ? cloneJson(adj.metadata) : null,
      position: adj.position,
      orderLineId: typeof adj.orderLine === "string" ? adj.orderLine : adj.orderLine?.id ?? null,
      customFields: adjustmentCustomFields[adj.id] ? cloneJson(adjustmentCustomFields[adj.id]) : null
    })),
    addresses: addressSnapshots,
    notes: noteSnapshots,
    tags: tagSnapshots,
    shipments: shipmentSnapshots,
    payments: paymentSnapshots
  };
}
async function loadInvoiceSnapshot(em, id) {
  const invoice = await em.findOne(SalesInvoice, { id, deletedAt: null });
  if (!invoice) return null;
  const lines = await em.find(
    SalesInvoiceLine,
    { invoice },
    { orderBy: { lineNumber: "asc" } }
  );
  const [invoiceCustomFields] = await Promise.all([
    loadCustomFieldValues({
      em,
      entityId: E.sales.sales_invoice,
      recordIds: [invoice.id],
      tenantIdByRecord: { [invoice.id]: invoice.tenantId },
      organizationIdByRecord: { [invoice.id]: invoice.organizationId }
    })
  ]);
  return {
    invoice: {
      id: invoice.id,
      organizationId: invoice.organizationId,
      tenantId: invoice.tenantId,
      invoiceNumber: invoice.invoiceNumber,
      orderId: invoice.orderId ?? null,
      statusEntryId: invoice.statusEntryId ?? null,
      status: invoice.status ?? null,
      issueDate: invoice.issueDate ?? null,
      dueDate: invoice.dueDate ?? null,
      currencyCode: invoice.currencyCode,
      subtotalNetAmount: String(invoice.subtotalNetAmount),
      subtotalGrossAmount: String(invoice.subtotalGrossAmount),
      discountTotalAmount: String(invoice.discountTotalAmount),
      taxTotalAmount: String(invoice.taxTotalAmount),
      grandTotalNetAmount: String(invoice.grandTotalNetAmount),
      grandTotalGrossAmount: String(invoice.grandTotalGrossAmount),
      paidTotalAmount: String(invoice.paidTotalAmount),
      outstandingAmount: String(invoice.outstandingAmount),
      metadata: invoice.metadata ?? null,
      customFieldSetId: invoice.customFieldSetId ?? null,
      customFields: invoiceCustomFields[invoice.id] ?? null
    },
    lines: lines.map((line) => ({
      id: line.id,
      orderLineId: line.orderLineId ?? null,
      lineNumber: line.lineNumber,
      kind: line.kind ?? "product",
      name: line.name ?? null,
      sku: line.sku ?? null,
      description: line.description ?? null,
      quantity: String(line.quantity),
      quantityUnit: line.quantityUnit ?? null,
      normalizedQuantity: String(line.normalizedQuantity),
      normalizedUnit: line.normalizedUnit ?? null,
      uomSnapshot: line.uomSnapshot ?? null,
      currencyCode: line.currencyCode,
      unitPriceNet: String(line.unitPriceNet),
      unitPriceGross: String(line.unitPriceGross),
      discountAmount: String(line.discountAmount),
      discountPercent: String(line.discountPercent),
      taxRate: String(line.taxRate),
      taxAmount: String(line.taxAmount),
      totalNetAmount: String(line.totalNetAmount),
      totalGrossAmount: String(line.totalGrossAmount),
      metadata: line.metadata ?? null
    }))
  };
}
async function loadCreditMemoSnapshot(em, id) {
  const creditMemo = await em.findOne(SalesCreditMemo, { id, deletedAt: null });
  if (!creditMemo) return null;
  const lines = await em.find(
    SalesCreditMemoLine,
    { creditMemo },
    { orderBy: { lineNumber: "asc" } }
  );
  const [creditMemoCustomFields] = await Promise.all([
    loadCustomFieldValues({
      em,
      entityId: E.sales.sales_credit_memo,
      recordIds: [creditMemo.id],
      tenantIdByRecord: { [creditMemo.id]: creditMemo.tenantId },
      organizationIdByRecord: { [creditMemo.id]: creditMemo.organizationId }
    })
  ]);
  return {
    creditMemo: {
      id: creditMemo.id,
      organizationId: creditMemo.organizationId,
      tenantId: creditMemo.tenantId,
      creditMemoNumber: creditMemo.creditMemoNumber,
      orderId: creditMemo.order?.id ?? null,
      invoiceId: creditMemo.invoice?.id ?? null,
      statusEntryId: creditMemo.statusEntryId ?? null,
      status: creditMemo.status ?? null,
      reason: creditMemo.reason ?? null,
      issueDate: creditMemo.issueDate ?? null,
      currencyCode: creditMemo.currencyCode,
      subtotalNetAmount: String(creditMemo.subtotalNetAmount),
      subtotalGrossAmount: String(creditMemo.subtotalGrossAmount),
      taxTotalAmount: String(creditMemo.taxTotalAmount),
      grandTotalNetAmount: String(creditMemo.grandTotalNetAmount),
      grandTotalGrossAmount: String(creditMemo.grandTotalGrossAmount),
      metadata: creditMemo.metadata ?? null,
      customFieldSetId: creditMemo.customFieldSetId ?? null,
      customFields: creditMemoCustomFields[creditMemo.id] ?? null
    },
    lines: lines.map((line) => ({
      id: line.id,
      orderLineId: line.orderLineId ?? null,
      lineNumber: line.lineNumber,
      name: line.name ?? null,
      sku: line.sku ?? null,
      description: line.description ?? null,
      quantity: String(line.quantity),
      quantityUnit: line.quantityUnit ?? null,
      normalizedQuantity: String(line.normalizedQuantity),
      normalizedUnit: line.normalizedUnit ?? null,
      uomSnapshot: line.uomSnapshot ?? null,
      currencyCode: line.currencyCode,
      unitPriceNet: String(line.unitPriceNet),
      unitPriceGross: String(line.unitPriceGross),
      taxRate: String(line.taxRate),
      taxAmount: String(line.taxAmount),
      totalNetAmount: String(line.totalNetAmount),
      totalGrossAmount: String(line.totalGrossAmount),
      metadata: line.metadata ?? null
    }))
  };
}
async function queueDeletionSideEffects(dataEngine, entities, entityType) {
  if (!entities) return;
  const list = Array.isArray(entities) ? entities : [entities];
  const tasks = [];
  for (const entity of list) {
    if (!entity) continue;
    const id = typeof entity.id === "string" ? entity.id : null;
    if (!id) continue;
    tasks.push(
      emitCrudSideEffects({
        dataEngine,
        action: "deleted",
        entity,
        identifiers: {
          id,
          organizationId: entity.organizationId ?? null,
          tenantId: entity.tenantId ?? null
        },
        indexer: { entityType }
      })
    );
  }
  if (tasks.length) await Promise.all(tasks);
}
function toNumeric(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}
const UNIT_DICTIONARY_KEYS = ["unit", "units", "measurement_units"];
const UOM_REFERENCE_UNITS = new Set(REFERENCE_UNIT_CODES);
const UOM_NORMALIZED_SCALE = 6;
const UOM_NORMALIZED_MAX = 1e12;
const UNIT_PRICE_AUTOCONVERT_SCALE = 4;
function createUomResolver() {
  return {
    dictionaryPromise: null,
    unitExistsCache: /* @__PURE__ */ new Map(),
    productCache: /* @__PURE__ */ new Map()
  };
}
function normalizeUnitCode(value) {
  return canonicalizeUnitCode(value);
}
function unitLookupKey(value) {
  return toUnitLookupKey(value);
}
function roundNormalizedQuantity(value) {
  const factor = 10 ** UOM_NORMALIZED_SCALE;
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * factor) / factor;
}
function assertNormalizedPrecision(value) {
  if (!Number.isFinite(value) || Math.abs(value) >= UOM_NORMALIZED_MAX) {
    throw new CrudHttpError(422, { error: "uom.precision_overflow" });
  }
}
function toOptionalNumber(value) {
  if (value === null || value === void 0) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
function resolveSnapshotToBaseFactor(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return 1;
  const payload = snapshot;
  const factor = toOptionalNumber(payload.toBaseFactor ?? payload.to_base_factor);
  if (!Number.isFinite(factor) || !factor || factor <= 0) return 1;
  return factor;
}
function roundAutoConvertedUnitPrice(value) {
  if (!Number.isFinite(value) || value < 0) return null;
  const factor = 10 ** UNIT_PRICE_AUTOCONVERT_SCALE;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Number.isFinite(rounded) ? rounded : null;
}
function convertLineUnitPricesOnUnitChange(params) {
  if (!params.existingSnapshot) {
    return {
      unitPriceNet: params.unitPriceNet,
      unitPriceGross: params.unitPriceGross,
      didConvert: false
    };
  }
  const existingUnitPriceNet = typeof params.existingSnapshot.unitPriceNet === "number" && Number.isFinite(params.existingSnapshot.unitPriceNet) ? params.existingSnapshot.unitPriceNet : null;
  const existingUnitPriceGross = typeof params.existingSnapshot.unitPriceGross === "number" && Number.isFinite(params.existingSnapshot.unitPriceGross) ? params.existingSnapshot.unitPriceGross : null;
  const sameNumber = (left, right) => {
    if (left === null || right === null) return left === right;
    return Math.abs(left - right) < 1e-6;
  };
  const shouldConvertNet = params.unitPriceNet === null || sameNumber(params.unitPriceNet, existingUnitPriceNet);
  const shouldConvertGross = params.unitPriceGross === null || sameNumber(params.unitPriceGross, existingUnitPriceGross);
  if (!shouldConvertNet && !shouldConvertGross) {
    return {
      unitPriceNet: params.unitPriceNet,
      unitPriceGross: params.unitPriceGross,
      didConvert: false
    };
  }
  const previousUnit = normalizeUnitCode(params.existingSnapshot?.quantityUnit ?? null);
  const nextUnit = normalizeUnitCode(params.nextQuantityUnit);
  if (!previousUnit || !nextUnit || previousUnit === nextUnit) {
    return {
      unitPriceNet: params.unitPriceNet,
      unitPriceGross: params.unitPriceGross,
      didConvert: false
    };
  }
  const previousFactor = resolveSnapshotToBaseFactor(
    params.existingSnapshot?.uomSnapshot ?? null
  );
  const nextFactor = resolveSnapshotToBaseFactor(params.nextUomSnapshot);
  if (!Number.isFinite(previousFactor) || previousFactor <= 0 || !Number.isFinite(nextFactor) || nextFactor <= 0) {
    return {
      unitPriceNet: params.unitPriceNet,
      unitPriceGross: params.unitPriceGross,
      didConvert: false
    };
  }
  const convertAmount = (value, shouldConvert) => {
    if (!shouldConvert) return value;
    if (value === null || !Number.isFinite(value)) return value;
    const converted = roundAutoConvertedUnitPrice(value / previousFactor * nextFactor);
    return converted ?? value;
  };
  const nextUnitPriceNet = convertAmount(params.unitPriceNet, shouldConvertNet);
  const nextUnitPriceGross = convertAmount(
    params.unitPriceGross,
    shouldConvertGross
  );
  const didConvert = nextUnitPriceNet !== params.unitPriceNet || nextUnitPriceGross !== params.unitPriceGross;
  return {
    unitPriceNet: nextUnitPriceNet,
    unitPriceGross: nextUnitPriceGross,
    didConvert
  };
}
function resolveReferenceUnit(value) {
  const normalized = toUnitLookupKey(value);
  if (!normalized) return null;
  if (!UOM_REFERENCE_UNITS.has(normalized)) return null;
  return normalized;
}
async function resolveUnitDictionaryScoped(em, organizationId, tenantId) {
  return findOneWithDecryption(
    em,
    Dictionary,
    {
      organizationId,
      tenantId,
      key: { $in: [...UNIT_DICTIONARY_KEYS] },
      deletedAt: null,
      isActive: true
    },
    { orderBy: { createdAt: "asc" } }
  );
}
async function assertUnitExists(em, resolver, organizationId, tenantId, unitCode) {
  const normalizedCode = unitLookupKey(unitCode);
  if (!normalizedCode) return;
  const rawUnitCode = unitCode.trim();
  if (!resolver.dictionaryPromise) {
    resolver.dictionaryPromise = resolveUnitDictionaryScoped(
      em,
      organizationId,
      tenantId
    );
  }
  const dictionary = await resolver.dictionaryPromise;
  if (!dictionary) {
    throw new CrudHttpError(400, { error: "uom.unit_not_found" });
  }
  const cacheKey = `${dictionary.id}:${normalizedCode}`;
  if (resolver.unitExistsCache.has(cacheKey)) {
    if (!resolver.unitExistsCache.get(cacheKey)) {
      throw new CrudHttpError(400, { error: "uom.unit_not_found" });
    }
    return;
  }
  const entry = await findOneWithDecryption(em, DictionaryEntry, {
    dictionary,
    organizationId: dictionary.organizationId,
    tenantId: dictionary.tenantId,
    $or: [{ normalizedValue: normalizedCode }, { value: rawUnitCode }]
  });
  const exists = !!entry;
  resolver.unitExistsCache.set(cacheKey, exists);
  if (!exists) {
    throw new CrudHttpError(400, { error: "uom.unit_not_found" });
  }
}
async function resolveProductUomState(em, resolver, organizationId, tenantId, productId) {
  if (resolver.productCache.has(productId)) {
    return resolver.productCache.get(productId) ?? null;
  }
  const product = await findOneWithDecryption(em, CatalogProduct, {
    id: productId,
    organizationId,
    tenantId,
    deletedAt: null
  });
  if (!product) {
    resolver.productCache.set(productId, null);
    return null;
  }
  const conversions = await findWithDecryption(em, CatalogProductUnitConversion, {
    product: product.id,
    organizationId,
    tenantId,
    deletedAt: null,
    isActive: true
  });
  const conversionsByUnitKey = /* @__PURE__ */ new Map();
  for (const conversion of conversions) {
    const key = unitLookupKey(conversion.unitCode);
    if (!key) continue;
    conversionsByUnitKey.set(key, conversion);
  }
  const state = {
    productId: product.id,
    baseUnitCode: normalizeUnitCode(product.defaultUnit ?? null),
    defaultSalesUnit: normalizeUnitCode(product.defaultSalesUnit ?? null),
    unitPriceEnabled: Boolean(product.unitPriceEnabled),
    unitPriceReferenceUnit: resolveReferenceUnit(
      product.unitPriceReferenceUnit
    ),
    unitPriceBaseQuantity: product.unitPriceBaseQuantity ?? null,
    conversionsByUnitKey
  };
  resolver.productCache.set(productId, state);
  return state;
}
function buildUnitPriceReferenceSnapshot(params) {
  if (!params.product.unitPriceEnabled) return void 0;
  const baseQuantityNumber = toNumeric(params.product.unitPriceBaseQuantity);
  const output = {
    enabled: true,
    referenceUnitCode: params.product.unitPriceReferenceUnit ?? null,
    baseQuantity: params.product.unitPriceBaseQuantity ?? null
  };
  if (!params.product.unitPriceReferenceUnit || params.toBaseFactor <= 0 || baseQuantityNumber <= 0) {
    return output;
  }
  if (typeof params.unitPriceGross === "number" && Number.isFinite(params.unitPriceGross)) {
    output.grossPerReference = toNumericString(
      params.unitPriceGross / params.toBaseFactor * baseQuantityNumber
    );
  }
  if (typeof params.unitPriceNet === "number" && Number.isFinite(params.unitPriceNet)) {
    output.netPerReference = toNumericString(
      params.unitPriceNet / params.toBaseFactor * baseQuantityNumber
    );
  }
  return output;
}
async function normalizeLineUom(input) {
  const quantity = toNumeric(input.line.quantity);
  const existingSnapshot = input.line.uomSnapshot && typeof input.line.uomSnapshot === "object" ? cloneJson(input.line.uomSnapshot) : null;
  const productId = typeof input.line.productId === "string" ? input.line.productId : null;
  const variantId = typeof input.line.productVariantId === "string" ? input.line.productVariantId : null;
  const enteredUnitInput = normalizeUnitCode(input.line.quantityUnit);
  if (!productId) {
    if (enteredUnitInput) {
      await assertUnitExists(
        input.em,
        input.resolver,
        input.organizationId,
        input.tenantId,
        enteredUnitInput
      );
    }
    const normalizedQuantity2 = toNumeric(
      input.line.normalizedQuantity ?? quantity
    );
    assertNormalizedPrecision(normalizedQuantity2);
    return {
      quantity,
      quantityUnit: enteredUnitInput ?? null,
      normalizedQuantity: normalizedQuantity2,
      normalizedUnit: normalizeUnitCode(input.line.normalizedUnit) ?? enteredUnitInput ?? null,
      uomSnapshot: existingSnapshot ?? {
        version: 1,
        productId: null,
        productVariantId: variantId,
        baseUnitCode: normalizeUnitCode(input.line.normalizedUnit) ?? enteredUnitInput ?? null,
        enteredUnitCode: enteredUnitInput,
        enteredQuantity: toNumericString(quantity) ?? "0",
        toBaseFactor: "1",
        normalizedQuantity: toNumericString(normalizedQuantity2) ?? "0",
        rounding: { mode: "half_up", scale: UOM_NORMALIZED_SCALE },
        source: { conversionId: null, resolvedAt: (/* @__PURE__ */ new Date()).toISOString() }
      }
    };
  }
  const productState = await resolveProductUomState(
    input.em,
    input.resolver,
    input.organizationId,
    input.tenantId,
    productId
  );
  if (!productState) {
    if (enteredUnitInput) {
      await assertUnitExists(
        input.em,
        input.resolver,
        input.organizationId,
        input.tenantId,
        enteredUnitInput
      );
    }
    const normalizedQuantity2 = toNumeric(
      input.line.normalizedQuantity ?? quantity
    );
    assertNormalizedPrecision(normalizedQuantity2);
    return {
      quantity,
      quantityUnit: enteredUnitInput ?? null,
      normalizedQuantity: normalizedQuantity2,
      normalizedUnit: normalizeUnitCode(input.line.normalizedUnit) ?? enteredUnitInput ?? null,
      uomSnapshot: existingSnapshot
    };
  }
  const baseUnitCode = productState.baseUnitCode;
  const enteredUnitCode = enteredUnitInput ?? productState.defaultSalesUnit ?? baseUnitCode ?? normalizeUnitCode(input.line.normalizedUnit);
  if (enteredUnitCode) {
    await assertUnitExists(
      input.em,
      input.resolver,
      input.organizationId,
      input.tenantId,
      enteredUnitCode
    );
  }
  if (baseUnitCode) {
    await assertUnitExists(
      input.em,
      input.resolver,
      input.organizationId,
      input.tenantId,
      baseUnitCode
    );
  }
  if (!baseUnitCode) {
    const requiresBase = Boolean(enteredUnitCode) || productState.conversionsByUnitKey.size > 0 || Boolean(productState.defaultSalesUnit);
    if (requiresBase) {
      throw new CrudHttpError(400, { error: "uom.default_unit_missing" });
    }
    const normalizedQuantity2 = toNumeric(
      input.line.normalizedQuantity ?? quantity
    );
    assertNormalizedPrecision(normalizedQuantity2);
    return {
      quantity,
      quantityUnit: enteredUnitCode ?? null,
      normalizedQuantity: normalizedQuantity2,
      normalizedUnit: normalizeUnitCode(input.line.normalizedUnit) ?? enteredUnitCode ?? null,
      uomSnapshot: existingSnapshot
    };
  }
  const resolvedEnteredUnit = enteredUnitCode ?? baseUnitCode;
  const enteredKey = unitLookupKey(resolvedEnteredUnit);
  const baseKey = unitLookupKey(baseUnitCode);
  let toBaseFactor = 1;
  let conversionId = null;
  if (enteredKey && baseKey && enteredKey !== baseKey) {
    const conversion = productState.conversionsByUnitKey.get(enteredKey);
    if (!conversion) {
      throw new CrudHttpError(400, { error: "uom.conversion_not_found" });
    }
    toBaseFactor = toNumeric(conversion.toBaseFactor);
    conversionId = conversion.id;
  }
  if (!Number.isFinite(toBaseFactor) || toBaseFactor <= 0) {
    throw new CrudHttpError(400, { error: "uom.invalid_factor" });
  }
  const normalizedQuantity = roundNormalizedQuantity(quantity * toBaseFactor);
  assertNormalizedPrecision(normalizedQuantity);
  const unitPriceReference = buildUnitPriceReferenceSnapshot({
    product: productState,
    toBaseFactor,
    unitPriceNet: toOptionalNumber(input.line.unitPriceNet),
    unitPriceGross: toOptionalNumber(input.line.unitPriceGross)
  });
  const snapshot = {
    version: 1,
    productId,
    productVariantId: variantId,
    baseUnitCode,
    enteredUnitCode: resolvedEnteredUnit,
    enteredQuantity: toNumericString(quantity) ?? "0",
    toBaseFactor: toNumericString(toBaseFactor) ?? "1",
    normalizedQuantity: toNumericString(normalizedQuantity) ?? "0",
    rounding: {
      mode: "half_up",
      scale: UOM_NORMALIZED_SCALE
    },
    source: {
      conversionId,
      resolvedAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    ...unitPriceReference ? { unitPriceReference } : {}
  };
  return {
    quantity,
    quantityUnit: resolvedEnteredUnit,
    normalizedQuantity,
    normalizedUnit: baseUnitCode,
    uomSnapshot: snapshot
  };
}
function normalizeShippingMethodContext(snapshot, id, code, currencyCode) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const metadata = snapshot.metadata;
  const providerSettings = snapshot.providerSettings ?? (metadata && typeof metadata === "object" ? metadata.providerSettings ?? null : null);
  return {
    id: snapshot.id ?? id ?? null,
    code: typeof snapshot.code === "string" ? snapshot.code : code ?? null,
    name: typeof snapshot.name === "string" ? snapshot.name : null,
    providerKey: typeof snapshot.providerKey === "string" ? snapshot.providerKey : null,
    currencyCode: typeof snapshot.currencyCode === "string" ? snapshot.currencyCode : currencyCode ?? null,
    baseRateNet: toNumeric(
      snapshot.baseRateNet ?? snapshot.base_rate_net
    ),
    baseRateGross: toNumeric(
      snapshot.baseRateGross ?? snapshot.base_rate_gross
    ),
    metadata: metadata && typeof metadata === "object" ? cloneJson(metadata) : null,
    providerSettings: providerSettings && typeof providerSettings === "object" ? cloneJson(providerSettings) : null
  };
}
function normalizePaymentMethodContext(snapshot, id, code) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const metadata = snapshot.metadata;
  const providerSettings = snapshot.providerSettings ?? (metadata && typeof metadata === "object" ? metadata.providerSettings ?? null : null);
  return {
    id: snapshot.id ?? id ?? null,
    code: typeof snapshot.code === "string" ? snapshot.code : code ?? null,
    name: typeof snapshot.name === "string" ? snapshot.name : null,
    providerKey: typeof snapshot.providerKey === "string" ? snapshot.providerKey : null,
    terms: typeof snapshot.terms === "string" ? snapshot.terms : null,
    metadata: metadata && typeof metadata === "object" ? cloneJson(metadata) : null,
    providerSettings: providerSettings && typeof providerSettings === "object" ? cloneJson(providerSettings) : null
  };
}
function buildProviderContext(params) {
  return {
    shippingMethod: normalizeShippingMethodContext(
      params.shippingSnapshot,
      params.shippingMethodId,
      params.shippingMethodCode,
      params.currencyCode
    ),
    paymentMethod: normalizePaymentMethodContext(
      params.paymentSnapshot,
      params.paymentMethodId,
      params.paymentMethodCode
    )
  };
}
function buildCalculationContext(params) {
  return {
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    currencyCode: params.currencyCode,
    metadata: buildProviderContext({
      shippingSnapshot: params.shippingSnapshot,
      paymentSnapshot: params.paymentSnapshot,
      shippingMethodId: params.shippingMethodId,
      paymentMethodId: params.paymentMethodId,
      shippingMethodCode: params.shippingMethodCode,
      paymentMethodCode: params.paymentMethodCode,
      currencyCode: params.currencyCode
    })
  };
}
function mapOrderAdjustmentToDraft(adjustment) {
  return {
    id: adjustment.id,
    scope: adjustment.scope ?? "order",
    kind: adjustment.kind,
    code: adjustment.code ?? null,
    label: adjustment.label ?? null,
    calculatorKey: adjustment.calculatorKey ?? null,
    promotionId: adjustment.promotionId ?? null,
    rate: toNumeric(adjustment.rate),
    amountNet: toNumeric(adjustment.amountNet),
    amountGross: toNumeric(adjustment.amountGross),
    currencyCode: adjustment.currencyCode ?? null,
    metadata: adjustment.metadata ? cloneJson(adjustment.metadata) : null,
    position: adjustment.position ?? 0
  };
}
function mapQuoteAdjustmentToDraft(adjustment) {
  return {
    id: adjustment.id,
    scope: adjustment.scope ?? "order",
    kind: adjustment.kind,
    code: adjustment.code ?? null,
    label: adjustment.label ?? null,
    calculatorKey: adjustment.calculatorKey ?? null,
    promotionId: adjustment.promotionId ?? null,
    rate: toNumeric(adjustment.rate),
    amountNet: toNumeric(adjustment.amountNet),
    amountGross: toNumeric(adjustment.amountGross),
    currencyCode: adjustment.currencyCode ?? null,
    metadata: adjustment.metadata ? cloneJson(adjustment.metadata) : null,
    position: adjustment.position ?? 0
  };
}
async function emitTotalsCalculated(eventBus, payload) {
  if (!eventBus) return;
  await eventBus.emitEvent("sales.document.totals.calculated", payload);
}
function isStoredRowSourcedLine(line) {
  return line.discountAmountFromStoredRow === true;
}
function isStoredRowSourcedTotalsLine(line) {
  return line.totalsFromStoredRow === true;
}
function createLineSnapshotFromInput(line, lineNumber) {
  const quantity = Number(line.quantity ?? 0);
  const normalizedQuantity = toNumeric(
    line.normalizedQuantity ?? quantity
  );
  return {
    lineNumber,
    kind: line.kind ?? "product",
    productId: line.productId ?? null,
    productVariantId: line.productVariantId ?? null,
    name: line.name ?? null,
    description: line.description ?? null,
    comment: line.comment ?? null,
    quantity,
    quantityUnit: line.quantityUnit ?? null,
    normalizedQuantity,
    normalizedUnit: typeof line.normalizedUnit === "string" ? line.normalizedUnit : line.quantityUnit ?? null,
    uomSnapshot: line.uomSnapshot && typeof line.uomSnapshot === "object" ? cloneJson(line.uomSnapshot) : null,
    currencyCode: line.currencyCode,
    unitPriceNet: line.unitPriceNet ?? null,
    unitPriceGross: line.unitPriceGross ?? null,
    discountAmount: line.discountAmount ?? null,
    // Several callers re-run an already-mapped snapshot through here — the line
    // upsert and delete paths rebuild every line of the document, not just the
    // one being edited. Those inputs already carry a line total from a stored
    // row, so their origin must survive rather than be overwritten with the
    // caller default, or the untouched lines get re-inflated by quantity on
    // every write. Exactly one of the two origin fields is ever set, which is
    // the invariant the calculation engine relies on.
    ...isStoredRowSourcedLine(line) ? { discountAmountFromStoredRow: true } : { discountAmountBasis: line.discountAmountBasis ?? "unit" },
    // Carried independently of the discount origin above: a line upsert can
    // take its discount from the caller while its totals still come off the
    // stored row, and only the caller half is worth reconciling (#5644).
    ...isStoredRowSourcedTotalsLine(line) ? { totalsFromStoredRow: true } : {},
    discountPercent: line.discountPercent ?? null,
    taxRate: line.taxRate ?? null,
    taxAmount: line.taxAmount ?? null,
    totalNetAmount: line.totalNetAmount ?? null,
    totalGrossAmount: line.totalGrossAmount ?? null,
    configuration: line.configuration ? cloneJson(line.configuration) : null,
    promotionCode: line.promotionCode ?? null,
    metadata: line.metadata ? cloneJson(line.metadata) : null,
    customFieldSetId: "customFieldSetId" in line ? line.customFieldSetId ?? null : null,
    customFields: "customFields" in line && line.customFields ? cloneJson(line.customFields) : null
  };
}
function createAdjustmentDraftFromInput(adjustment) {
  const lineRef = "quoteLineId" in adjustment ? adjustment.quoteLineId : adjustment.orderLineId;
  if (adjustment.scope === "line" && lineRef) {
    throw new CrudHttpError(400, {
      error: "Line-scoped adjustments are not supported yet."
    });
  }
  return {
    id: typeof adjustment.id === "string" ? adjustment.id : void 0,
    scope: adjustment.scope ?? "order",
    kind: adjustment.kind ?? "custom",
    code: adjustment.code ?? null,
    label: adjustment.label ?? null,
    calculatorKey: adjustment.calculatorKey ?? null,
    promotionId: adjustment.promotionId ?? null,
    rate: adjustment.rate ?? null,
    amountNet: adjustment.amountNet ?? null,
    amountGross: adjustment.amountGross ?? null,
    currencyCode: adjustment.currencyCode ?? null,
    metadata: adjustment.metadata ? cloneJson(adjustment.metadata) : null,
    position: adjustment.position ?? 0
  };
}
function convertLineCalculationToEntityInput(lineResult, sourceLine, document, index) {
  const line = lineResult.line;
  return reconcileLinePersistedTotals({
    lineNumber: line.lineNumber ?? index + 1,
    kind: line.kind ?? "product",
    statusEntryId: sourceLine.statusEntryId ?? null,
    productId: sourceLine.productId ?? null,
    productVariantId: sourceLine.productVariantId ?? null,
    catalogSnapshot: sourceLine.catalogSnapshot ? cloneJson(sourceLine.catalogSnapshot) : null,
    name: line.name ?? null,
    description: line.description ?? null,
    comment: line.comment ?? null,
    quantity: toNumericString(line.quantity) ?? "0",
    quantityUnit: line.quantityUnit ?? null,
    normalizedQuantity: toNumericString(line.normalizedQuantity ?? line.quantity) ?? "0",
    normalizedUnit: line.normalizedUnit ?? line.quantityUnit ?? null,
    uomSnapshot: line.uomSnapshot && typeof line.uomSnapshot === "object" ? cloneJson(line.uomSnapshot) : null,
    currencyCode: line.currencyCode,
    unitPriceNet: toNumericString(
      line.unitPriceNet ?? lineResult.netAmount / Math.max(line.quantity || 1, 1)
    ) ?? "0",
    unitPriceGross: toNumericString(
      line.unitPriceGross ?? lineResult.grossAmount / Math.max(line.quantity || 1, 1)
    ) ?? "0",
    discountAmount: toNumericString(lineResult.discountAmount) ?? "0",
    discountPercent: toNumericString(line.discountPercent) ?? "0",
    taxRate: toNumericString(line.taxRate) ?? "0",
    taxAmount: toNumericString(lineResult.taxAmount) ?? "0",
    totalNetAmount: toNumericString(lineResult.netAmount) ?? "0",
    totalGrossAmount: toNumericString(lineResult.grossAmount) ?? "0",
    configuration: line.configuration ? cloneJson(line.configuration) : null,
    promotionCode: line.promotionCode ?? null,
    promotionSnapshot: sourceLine.promotionSnapshot ? cloneJson(sourceLine.promotionSnapshot) : null,
    metadata: line.metadata ? cloneJson(line.metadata) : null,
    customFieldSetId: sourceLine.customFieldSetId ?? null,
    organizationId: document.organizationId,
    tenantId: document.tenantId
  });
}
function convertAdjustmentResultToEntityInput(adjustment, sourceAdjustment, document, index) {
  const metadata = adjustment.metadata ? cloneJson(adjustment.metadata) : null;
  const resolvedPosition = sourceAdjustment?.position ?? (adjustment.position !== null && adjustment.position !== void 0 ? adjustment.position : index);
  return {
    scope: adjustment.scope ?? "order",
    kind: adjustment.kind ?? "custom",
    code: adjustment.code ?? null,
    label: adjustment.label ?? null,
    calculatorKey: adjustment.calculatorKey ?? null,
    promotionId: adjustment.promotionId ?? null,
    rate: toNumericString(adjustment.rate) ?? "0",
    amountNet: toNumericString(adjustment.amountNet) ?? "0",
    amountGross: toNumericString(adjustment.amountGross ?? adjustment.amountNet) ?? "0",
    currencyCode: adjustment.currencyCode ?? null,
    metadata,
    position: resolvedPosition,
    organizationId: document.organizationId,
    tenantId: document.tenantId
  };
}
async function applyOrderLineResults(params) {
  const { em, order, calculation, sourceLines, existingLines } = params;
  const existingMap = new Map(existingLines.map((line) => [line.id, line]));
  const persisted = /* @__PURE__ */ new Set();
  const statusCache = /* @__PURE__ */ new Map();
  const resolveStatus = async (entryId) => {
    if (!entryId) return null;
    if (statusCache.has(entryId)) return statusCache.get(entryId) ?? null;
    const value = await resolveDictionaryEntryValue(em, entryId, { tenantId: order.tenantId });
    statusCache.set(entryId, value);
    return value;
  };
  for (let index = 0; index < calculation.lines.length; index += 1) {
    const lineResult = calculation.lines[index];
    const sourceLine = sourceLines[index];
    const statusEntryId = sourceLine.statusEntryId ?? null;
    const statusValue = await resolveStatus(statusEntryId ?? null);
    const payload = convertLineCalculationToEntityInput(
      lineResult,
      sourceLine,
      order,
      index
    );
    const existing = sourceLine.id ? existingMap.get(sourceLine.id) ?? null : null;
    const lineEntity = existing ?? em.create(SalesOrderLine, {
      order,
      id: sourceLine.id ?? void 0,
      reservedQuantity: existing?.reservedQuantity ?? "0",
      fulfilledQuantity: existing?.fulfilledQuantity ?? "0",
      invoicedQuantity: existing?.invoicedQuantity ?? "0",
      returnedQuantity: existing?.returnedQuantity ?? "0",
      createdAt: existing?.createdAt ?? /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    Object.assign(lineEntity, {
      ...payload,
      order,
      statusEntryId,
      status: statusValue
    });
    em.persist(lineEntity);
    const rawCustomFields = sourceLine.customFields;
    if (rawCustomFields !== void 0 && rawCustomFields !== null) {
      const customValues = rawCustomFields && typeof rawCustomFields === "object" ? rawCustomFields : {};
      await setRecordCustomFields(em, {
        entityId: E.sales.sales_order_line,
        recordId: lineEntity.id,
        organizationId: order.organizationId,
        tenantId: order.tenantId,
        values: normalizeCustomFieldValues(customValues)
      });
    }
    persisted.add(lineEntity.id);
  }
  for (const [id, line] of existingMap.entries()) {
    if (!persisted.has(id)) {
      em.remove(line);
    }
  }
}
async function applyQuoteLineResults(params) {
  const { em, quote, calculation, sourceLines, existingLines } = params;
  const existingMap = new Map(existingLines.map((line) => [line.id, line]));
  const persisted = /* @__PURE__ */ new Set();
  const statusCache = /* @__PURE__ */ new Map();
  const resolveStatus = async (entryId) => {
    if (!entryId) return null;
    if (statusCache.has(entryId)) return statusCache.get(entryId) ?? null;
    const value = await resolveDictionaryEntryValue(em, entryId, { tenantId: quote.tenantId });
    statusCache.set(entryId, value);
    return value;
  };
  for (let index = 0; index < calculation.lines.length; index += 1) {
    const lineResult = calculation.lines[index];
    const sourceLine = sourceLines[index];
    const statusEntryId = sourceLine.statusEntryId ?? null;
    const statusValue = await resolveStatus(statusEntryId ?? null);
    const payload = convertLineCalculationToEntityInput(
      lineResult,
      sourceLine,
      quote,
      index
    );
    const existing = sourceLine.id ? existingMap.get(sourceLine.id) ?? null : null;
    const lineEntity = existing ?? em.create(SalesQuoteLine, {
      quote,
      id: sourceLine.id ?? void 0,
      createdAt: existing?.createdAt ?? /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    Object.assign(lineEntity, {
      ...payload,
      quote,
      statusEntryId,
      status: statusValue
    });
    em.persist(lineEntity);
    const rawCustomFields = sourceLine.customFields;
    if (rawCustomFields !== void 0 && rawCustomFields !== null) {
      const customValues = rawCustomFields && typeof rawCustomFields === "object" ? rawCustomFields : {};
      await setRecordCustomFields(em, {
        entityId: E.sales.sales_quote_line,
        recordId: lineEntity.id,
        organizationId: quote.organizationId,
        tenantId: quote.tenantId,
        values: normalizeCustomFieldValues(customValues)
      });
    }
    persisted.add(lineEntity.id);
  }
  for (const [id, line] of existingMap.entries()) {
    if (!persisted.has(id)) {
      em.remove(line);
    }
  }
}
async function replaceQuoteLines(em, quote, calculation, lineInputs) {
  await em.nativeDelete(SalesQuoteLine, { quote: quote.id });
  const statusCache = /* @__PURE__ */ new Map();
  const resolveStatus = async (entryId) => {
    if (!entryId) return null;
    if (statusCache.has(entryId)) return statusCache.get(entryId) ?? null;
    const value = await resolveDictionaryEntryValue(em, entryId, { tenantId: quote.tenantId });
    statusCache.set(entryId, value);
    return value;
  };
  for (let index = 0; index < calculation.lines.length; index += 1) {
    const lineResult = calculation.lines[index];
    const sourceLine = lineInputs[index];
    const entityInput = convertLineCalculationToEntityInput(
      lineResult,
      sourceLine,
      quote,
      index
    );
    const statusValue = await resolveStatus(sourceLine.statusEntryId ?? null);
    const lineEntity = em.create(SalesQuoteLine, {
      quote,
      ...entityInput,
      status: statusValue,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    em.persist(lineEntity);
    const rawCustomFields = sourceLine.customFields;
    if (rawCustomFields !== void 0 && rawCustomFields !== null) {
      const customValues = rawCustomFields && typeof rawCustomFields === "object" ? rawCustomFields : {};
      await setRecordCustomFields(em, {
        entityId: E.sales.sales_quote_line,
        recordId: lineEntity.id,
        organizationId: quote.organizationId,
        tenantId: quote.tenantId,
        values: normalizeCustomFieldValues(customValues)
      });
    }
  }
}
async function replaceQuoteAdjustments(em, quote, calculation, adjustmentInputs) {
  const existing = await em.find(
    SalesQuoteAdjustment,
    { quote },
    { orderBy: { position: "asc" } }
  );
  const existingMap = /* @__PURE__ */ new Map();
  existing.forEach((adj) => existingMap.set(adj.id, adj));
  const seen = /* @__PURE__ */ new Set();
  const adjustmentDrafts = calculation.adjustments;
  for (let index = 0; index < adjustmentDrafts.length; index += 1) {
    const draft = adjustmentDrafts[index];
    const sourceById = adjustmentInputs?.find((adj) => adj.id === draft.id) ?? null;
    const source = sourceById ?? (adjustmentInputs ? adjustmentInputs[index] ?? null : null);
    const entityInput = convertAdjustmentResultToEntityInput(
      draft,
      source,
      quote,
      index
    );
    const adjustmentId = draft.id ?? source?.id ?? randomUUID();
    const existingEntity = existingMap.get(adjustmentId);
    const entity = existingEntity ?? em.create(SalesQuoteAdjustment, {
      id: adjustmentId,
      quote,
      organizationId: quote.organizationId,
      tenantId: quote.tenantId,
      createdAt: /* @__PURE__ */ new Date()
    });
    entity.scope = entityInput.scope;
    entity.kind = entityInput.kind;
    entity.code = entityInput.code ?? null;
    entity.label = entityInput.label ?? null;
    entity.calculatorKey = entityInput.calculatorKey ?? null;
    entity.promotionId = entityInput.promotionId ?? null;
    entity.rate = entityInput.rate ?? "0";
    entity.amountNet = entityInput.amountNet ?? "0";
    entity.amountGross = entityInput.amountGross ?? entityInput.amountNet ?? "0";
    entity.currencyCode = entityInput.currencyCode ?? quote.currencyCode;
    entity.metadata = entityInput.metadata ?? null;
    entity.position = entityInput.position ?? index;
    entity.updatedAt = /* @__PURE__ */ new Date();
    entity.quoteLine = null;
    seen.add(adjustmentId);
    if (source?.customFields !== void 0) {
      await setRecordCustomFields(em, {
        entityId: E.sales.sales_quote_adjustment,
        recordId: adjustmentId,
        organizationId: quote.organizationId,
        tenantId: quote.tenantId,
        values: source.customFields && typeof source.customFields === "object" ? source.customFields : {}
      });
    }
    em.persist(entity);
  }
  existing.forEach((adj) => {
    if (!seen.has(adj.id)) {
      em.remove(adj);
    }
  });
}
async function replaceOrderLines(em, order, calculation, lineInputs) {
  await em.nativeDelete(SalesOrderLine, { order: order.id });
  const statusCache = /* @__PURE__ */ new Map();
  const resolveStatus = async (entryId) => {
    if (!entryId) return null;
    if (statusCache.has(entryId)) return statusCache.get(entryId) ?? null;
    const value = await resolveDictionaryEntryValue(em, entryId, { tenantId: order.tenantId });
    statusCache.set(entryId, value);
    return value;
  };
  for (let index = 0; index < calculation.lines.length; index += 1) {
    const lineResult = calculation.lines[index];
    const sourceLine = lineInputs[index];
    const entityInput = convertLineCalculationToEntityInput(
      lineResult,
      sourceLine,
      order,
      index
    );
    const statusValue = await resolveStatus(sourceLine.statusEntryId ?? null);
    const lineEntity = em.create(SalesOrderLine, {
      order,
      ...entityInput,
      reservedQuantity: "0",
      fulfilledQuantity: "0",
      invoicedQuantity: "0",
      returnedQuantity: "0",
      status: statusValue,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    em.persist(lineEntity);
    const rawCustomFields = sourceLine.customFields;
    if (rawCustomFields !== void 0 && rawCustomFields !== null) {
      const customValues = rawCustomFields && typeof rawCustomFields === "object" ? rawCustomFields : {};
      await setRecordCustomFields(em, {
        entityId: E.sales.sales_order_line,
        recordId: lineEntity.id,
        organizationId: order.organizationId,
        tenantId: order.tenantId,
        values: normalizeCustomFieldValues(customValues)
      });
    }
  }
}
async function replaceOrderAdjustments(em, order, calculation, adjustmentInputs) {
  const existing = await em.find(
    SalesOrderAdjustment,
    { order },
    { orderBy: { position: "asc" } }
  );
  const existingMap = /* @__PURE__ */ new Map();
  existing.forEach((adj) => existingMap.set(adj.id, adj));
  const seen = /* @__PURE__ */ new Set();
  const adjustmentDrafts = calculation.adjustments;
  for (let index = 0; index < adjustmentDrafts.length; index += 1) {
    const draft = adjustmentDrafts[index];
    const sourceById = adjustmentInputs?.find((adj) => adj.id === draft.id) ?? null;
    const source = sourceById ?? (adjustmentInputs ? adjustmentInputs[index] ?? null : null);
    const entityInput = convertAdjustmentResultToEntityInput(
      draft,
      source,
      order,
      index
    );
    const adjustmentId = draft.id ?? source?.id ?? randomUUID();
    const existingEntity = existingMap.get(adjustmentId);
    const entity = existingEntity ?? em.create(SalesOrderAdjustment, {
      id: adjustmentId,
      order,
      organizationId: order.organizationId,
      tenantId: order.tenantId,
      createdAt: /* @__PURE__ */ new Date()
    });
    entity.scope = entityInput.scope;
    entity.kind = entityInput.kind;
    entity.code = entityInput.code ?? null;
    entity.label = entityInput.label ?? null;
    entity.calculatorKey = entityInput.calculatorKey ?? null;
    entity.promotionId = entityInput.promotionId ?? null;
    entity.rate = entityInput.rate ?? "0";
    entity.amountNet = entityInput.amountNet ?? "0";
    entity.amountGross = entityInput.amountGross ?? entityInput.amountNet ?? "0";
    entity.currencyCode = entityInput.currencyCode ?? order.currencyCode;
    entity.metadata = entityInput.metadata ?? null;
    entity.position = entityInput.position ?? index;
    entity.updatedAt = /* @__PURE__ */ new Date();
    entity.orderLine = null;
    seen.add(adjustmentId);
    if (source?.customFields !== void 0) {
      await setRecordCustomFields(em, {
        entityId: E.sales.sales_order_adjustment,
        recordId: adjustmentId,
        organizationId: order.organizationId,
        tenantId: order.tenantId,
        values: source.customFields && typeof source.customFields === "object" ? source.customFields : {}
      });
    }
    em.persist(entity);
  }
  existing.forEach((adj) => {
    if (!seen.has(adj.id)) {
      em.remove(adj);
    }
  });
}
function applyQuoteTotals(quote, totals, lineCount) {
  quote.subtotalNetAmount = toNumericString(totals.subtotalNetAmount) ?? "0";
  quote.subtotalGrossAmount = toNumericString(totals.subtotalGrossAmount) ?? "0";
  quote.discountTotalAmount = toNumericString(totals.discountTotalAmount) ?? "0";
  quote.taxTotalAmount = toNumericString(totals.taxTotalAmount) ?? "0";
  quote.grandTotalNetAmount = toNumericString(totals.grandTotalNetAmount) ?? "0";
  quote.grandTotalGrossAmount = toNumericString(totals.grandTotalGrossAmount) ?? "0";
  quote.totalsSnapshot = cloneJson(totals);
  quote.lineItemCount = lineCount;
}
function applyOrderTotals(order, totals, lineCount) {
  order.subtotalNetAmount = toNumericString(totals.subtotalNetAmount) ?? "0";
  order.subtotalGrossAmount = toNumericString(totals.subtotalGrossAmount) ?? "0";
  order.discountTotalAmount = toNumericString(totals.discountTotalAmount) ?? "0";
  order.taxTotalAmount = toNumericString(totals.taxTotalAmount) ?? "0";
  order.shippingNetAmount = toNumericString(totals.shippingNetAmount) ?? "0";
  order.shippingGrossAmount = toNumericString(totals.shippingGrossAmount) ?? "0";
  order.surchargeTotalAmount = toNumericString(totals.surchargeTotalAmount) ?? "0";
  order.grandTotalNetAmount = toNumericString(totals.grandTotalNetAmount) ?? "0";
  order.grandTotalGrossAmount = toNumericString(totals.grandTotalGrossAmount) ?? "0";
  order.paidTotalAmount = toNumericString(totals.paidTotalAmount) ?? "0";
  order.refundedTotalAmount = toNumericString(totals.refundedTotalAmount) ?? "0";
  order.outstandingAmount = toNumericString(totals.outstandingAmount) ?? "0";
  order.totalsSnapshot = cloneJson(totals);
  order.lineItemCount = lineCount;
}
function normalizePaymentTotal(value) {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.max(value, 0);
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
  }
  return 0;
}
function resolveExistingPaymentTotals(order) {
  return {
    paidTotalAmount: normalizePaymentTotal(order.paidTotalAmount),
    refundedTotalAmount: normalizePaymentTotal(order.refundedTotalAmount)
  };
}
function ensureQuoteScope(ctx, organizationId, tenantId) {
  ensureTenantScope(ctx, tenantId);
  ensureOrganizationScope(ctx, organizationId);
}
function ensureOrderScope(ctx, organizationId, tenantId) {
  ensureTenantScope(ctx, tenantId);
  ensureOrganizationScope(ctx, organizationId);
}
function normalizeTagIds(tags) {
  if (!Array.isArray(tags)) return [];
  const set = /* @__PURE__ */ new Set();
  tags.forEach((id) => {
    if (typeof id === "string" && id.trim().length > 0) set.add(id.trim());
  });
  return Array.from(set);
}
function readAssignmentTagId(assignment) {
  const tag = assignment.tag;
  if (typeof tag === "string") return tag;
  return tag?.id ?? assignment.tag_id ?? null;
}
function buildTagChange(beforeTags, afterTags) {
  const beforeIds = normalizeTagIds(beforeTags?.map((tag) => tag.tagId));
  const afterIds = normalizeTagIds(afterTags?.map((tag) => tag.tagId));
  beforeIds.sort((a, b) => a.localeCompare(b));
  afterIds.sort((a, b) => a.localeCompare(b));
  if (beforeIds.length === afterIds.length && beforeIds.every((id, index) => id === afterIds[index])) {
    return null;
  }
  return { from: beforeIds, to: afterIds };
}
function buildDocumentUpdateChangeKeys(kind, input) {
  const keys = /* @__PURE__ */ new Set();
  if (kind === "order") {
    if (input.orderNumber !== void 0) keys.add("orderNumber");
  } else {
    if (input.quoteNumber !== void 0) keys.add("quoteNumber");
  }
  if (input.statusEntryId !== void 0) {
    keys.add("statusEntryId");
    keys.add("status");
  }
  if (input.customerEntityId !== void 0) {
    keys.add("customerEntityId");
    keys.add("customerContactId");
    keys.add("customerSnapshot");
    keys.add("billingAddressId");
    keys.add("shippingAddressId");
    keys.add("billingAddressSnapshot");
    keys.add("shippingAddressSnapshot");
  }
  if (input.customerContactId !== void 0) {
    keys.add("customerContactId");
    keys.add("customerSnapshot");
  }
  if (input.customerSnapshot !== void 0) keys.add("customerSnapshot");
  if (input.metadata !== void 0) keys.add("metadata");
  if (input.comment !== void 0) keys.add("comments");
  if (input.comments !== void 0) keys.add("comments");
  if (input.currencyCode !== void 0) keys.add("currencyCode");
  if (input.channelId !== void 0) keys.add("channelId");
  if (kind === "order") {
    if (input.internalNotes !== void 0) keys.add("internalNotes");
    if (input.placedAt !== void 0) keys.add("placedAt");
    if (input.expectedDeliveryAt !== void 0) keys.add("expectedDeliveryAt");
    if (input.exchangeRate !== void 0) keys.add("exchangeRate");
    if (input.paymentStatusEntryId !== void 0) {
      keys.add("paymentStatusEntryId");
      keys.add("paymentStatus");
    }
    if (input.fulfillmentStatusEntryId !== void 0) {
      keys.add("fulfillmentStatusEntryId");
      keys.add("fulfillmentStatus");
    }
  }
  if (input.shippingAddressId !== void 0 || input.shippingAddressSnapshot !== void 0) {
    keys.add("shippingAddressId");
    keys.add("shippingAddressSnapshot");
  }
  if (input.billingAddressId !== void 0 || input.billingAddressSnapshot !== void 0) {
    keys.add("billingAddressId");
    keys.add("billingAddressSnapshot");
  }
  if (input.shippingMethodId !== void 0 || input.shippingMethodCode !== void 0 || input.shippingMethodSnapshot !== void 0) {
    keys.add("shippingMethodId");
    keys.add("shippingMethodCode");
    keys.add("shippingMethodSnapshot");
  }
  if (input.paymentMethodId !== void 0 || input.paymentMethodCode !== void 0 || input.paymentMethodSnapshot !== void 0) {
    keys.add("paymentMethodId");
    keys.add("paymentMethodCode");
    keys.add("paymentMethodSnapshot");
  }
  if (input.customFieldSetId !== void 0) keys.add("customFieldSetId");
  if (input.customFields !== void 0) keys.add("customFields");
  return Array.from(keys);
}
async function syncSalesDocumentTags(em, params) {
  if (params.tagIds === void 0) return;
  const tagIds = normalizeTagIds(params.tagIds);
  const byId = /* @__PURE__ */ new Map();
  if (tagIds.length > 0) {
    const tagsInScope = await em.find(SalesDocumentTag, {
      id: { $in: tagIds },
      organizationId: params.organizationId,
      tenantId: params.tenantId
    });
    if (tagsInScope.length !== tagIds.length) {
      throw new CrudHttpError(400, {
        error: "One or more tags not found for this scope"
      });
    }
    tagsInScope.forEach((tag) => byId.set(tag.id, tag));
  }
  const existing = await em.find(SalesDocumentTagAssignment, {
    documentId: params.documentId,
    documentKind: params.kind
  });
  const existingByTagId = /* @__PURE__ */ new Map();
  existing.forEach((assignment) => {
    const tagId = readAssignmentTagId(assignment);
    if (tagId) existingByTagId.set(tagId, assignment);
  });
  const wanted = new Set(tagIds);
  const toRemove = existing.filter((assignment) => {
    const tagId = readAssignmentTagId(assignment);
    return tagId === null || !wanted.has(tagId);
  });
  const toAdd = tagIds.filter((tagId) => !existingByTagId.has(tagId));
  if (toRemove.length === 0 && toAdd.length === 0) return;
  toRemove.forEach((assignment) => em.remove(assignment));
  for (const tagId of toAdd) {
    const tag = byId.get(tagId);
    if (!tag) continue;
    const assignment = em.create(SalesDocumentTagAssignment, {
      organizationId: params.organizationId,
      tenantId: params.tenantId,
      documentId: params.documentId,
      documentKind: params.kind,
      tag,
      order: params.kind === "order" ? em.getReference(SalesOrder, params.documentId) : null,
      quote: params.kind === "quote" ? em.getReference(SalesQuote, params.documentId) : null
    });
    em.persist(assignment);
  }
}
function applyQuoteSnapshot(quote, snapshot) {
  quote.organizationId = snapshot.organizationId;
  quote.tenantId = snapshot.tenantId;
  quote.quoteNumber = snapshot.quoteNumber;
  quote.statusEntryId = snapshot.statusEntryId ?? null;
  quote.status = snapshot.status ?? null;
  quote.customerEntityId = snapshot.customerEntityId ?? null;
  quote.customerContactId = snapshot.customerContactId ?? null;
  quote.customerSnapshot = snapshot.customerSnapshot ? cloneJson(snapshot.customerSnapshot) : null;
  quote.billingAddressId = snapshot.billingAddressId ?? null;
  quote.shippingAddressId = snapshot.shippingAddressId ?? null;
  quote.billingAddressSnapshot = snapshot.billingAddressSnapshot ? cloneJson(snapshot.billingAddressSnapshot) : null;
  quote.shippingAddressSnapshot = snapshot.shippingAddressSnapshot ? cloneJson(snapshot.shippingAddressSnapshot) : null;
  quote.currencyCode = snapshot.currencyCode;
  quote.validFrom = snapshot.validFrom ? new Date(snapshot.validFrom) : null;
  quote.validUntil = snapshot.validUntil ? new Date(snapshot.validUntil) : null;
  quote.comments = snapshot.comments ?? null;
  quote.taxInfo = snapshot.taxInfo ? cloneJson(snapshot.taxInfo) : null;
  quote.shippingMethodId = snapshot.shippingMethodId ?? null;
  quote.shippingMethodCode = snapshot.shippingMethodCode ?? null;
  quote.deliveryWindowId = snapshot.deliveryWindowId ?? null;
  quote.deliveryWindowCode = snapshot.deliveryWindowCode ?? null;
  quote.paymentMethodId = snapshot.paymentMethodId ?? null;
  quote.paymentMethodCode = snapshot.paymentMethodCode ?? null;
  quote.shippingMethodSnapshot = snapshot.shippingMethodSnapshot ? cloneJson(snapshot.shippingMethodSnapshot) : null;
  quote.deliveryWindowSnapshot = snapshot.deliveryWindowSnapshot ? cloneJson(snapshot.deliveryWindowSnapshot) : null;
  quote.paymentMethodSnapshot = snapshot.paymentMethodSnapshot ? cloneJson(snapshot.paymentMethodSnapshot) : null;
  quote.metadata = snapshot.metadata ? cloneJson(snapshot.metadata) : null;
  quote.channelId = snapshot.channelId ?? null;
  quote.customFieldSetId = snapshot.customFieldSetId ?? null;
  quote.subtotalNetAmount = snapshot.subtotalNetAmount;
  quote.subtotalGrossAmount = snapshot.subtotalGrossAmount;
  quote.discountTotalAmount = snapshot.discountTotalAmount;
  quote.taxTotalAmount = snapshot.taxTotalAmount;
  quote.grandTotalNetAmount = snapshot.grandTotalNetAmount;
  quote.grandTotalGrossAmount = snapshot.grandTotalGrossAmount;
  quote.totalsSnapshot = snapshot.totalsSnapshot ? cloneJson(snapshot.totalsSnapshot) : null;
  quote.lineItemCount = snapshot.lineItemCount;
}
function applyOrderSnapshot(order, snapshot) {
  order.organizationId = snapshot.organizationId;
  order.tenantId = snapshot.tenantId;
  order.orderNumber = snapshot.orderNumber;
  order.statusEntryId = snapshot.statusEntryId ?? null;
  order.status = snapshot.status ?? null;
  order.fulfillmentStatusEntryId = snapshot.fulfillmentStatusEntryId ?? null;
  order.fulfillmentStatus = snapshot.fulfillmentStatus ?? null;
  order.paymentStatusEntryId = snapshot.paymentStatusEntryId ?? null;
  order.paymentStatus = snapshot.paymentStatus ?? null;
  order.customerEntityId = snapshot.customerEntityId ?? null;
  order.customerContactId = snapshot.customerContactId ?? null;
  order.customerSnapshot = snapshot.customerSnapshot ? cloneJson(snapshot.customerSnapshot) : null;
  order.billingAddressId = snapshot.billingAddressId ?? null;
  order.shippingAddressId = snapshot.shippingAddressId ?? null;
  order.billingAddressSnapshot = snapshot.billingAddressSnapshot ? cloneJson(snapshot.billingAddressSnapshot) : null;
  order.shippingAddressSnapshot = snapshot.shippingAddressSnapshot ? cloneJson(snapshot.shippingAddressSnapshot) : null;
  order.currencyCode = snapshot.currencyCode;
  order.exchangeRate = snapshot.exchangeRate ?? null;
  order.taxStrategyKey = snapshot.taxStrategyKey ?? null;
  order.discountStrategyKey = snapshot.discountStrategyKey ?? null;
  order.taxInfo = snapshot.taxInfo ? cloneJson(snapshot.taxInfo) : null;
  order.shippingMethodId = snapshot.shippingMethodId ?? null;
  order.shippingMethodCode = snapshot.shippingMethodCode ?? null;
  order.deliveryWindowId = snapshot.deliveryWindowId ?? null;
  order.deliveryWindowCode = snapshot.deliveryWindowCode ?? null;
  order.paymentMethodId = snapshot.paymentMethodId ?? null;
  order.paymentMethodCode = snapshot.paymentMethodCode ?? null;
  order.channelId = snapshot.channelId ?? null;
  order.placedAt = snapshot.placedAt ? new Date(snapshot.placedAt) : null;
  order.expectedDeliveryAt = snapshot.expectedDeliveryAt ? new Date(snapshot.expectedDeliveryAt) : null;
  order.dueAt = snapshot.dueAt ? new Date(snapshot.dueAt) : null;
  order.comments = snapshot.comments ?? null;
  order.internalNotes = snapshot.internalNotes ?? null;
  order.shippingMethodSnapshot = snapshot.shippingMethodSnapshot ? cloneJson(snapshot.shippingMethodSnapshot) : null;
  order.deliveryWindowSnapshot = snapshot.deliveryWindowSnapshot ? cloneJson(snapshot.deliveryWindowSnapshot) : null;
  order.paymentMethodSnapshot = snapshot.paymentMethodSnapshot ? cloneJson(snapshot.paymentMethodSnapshot) : null;
  order.metadata = snapshot.metadata ? cloneJson(snapshot.metadata) : null;
  order.customFieldSetId = snapshot.customFieldSetId ?? null;
  order.subtotalNetAmount = snapshot.subtotalNetAmount;
  order.subtotalGrossAmount = snapshot.subtotalGrossAmount;
  order.discountTotalAmount = snapshot.discountTotalAmount;
  order.taxTotalAmount = snapshot.taxTotalAmount;
  order.shippingNetAmount = snapshot.shippingNetAmount;
  order.shippingGrossAmount = snapshot.shippingGrossAmount;
  order.surchargeTotalAmount = snapshot.surchargeTotalAmount;
  order.grandTotalNetAmount = snapshot.grandTotalNetAmount;
  order.grandTotalGrossAmount = snapshot.grandTotalGrossAmount;
  order.paidTotalAmount = snapshot.paidTotalAmount;
  order.refundedTotalAmount = snapshot.refundedTotalAmount;
  order.outstandingAmount = snapshot.outstandingAmount;
  order.totalsSnapshot = snapshot.totalsSnapshot ? cloneJson(snapshot.totalsSnapshot) : null;
  order.lineItemCount = snapshot.lineItemCount;
}
async function assertQuoteGraphUndoCurrent(em, quoteId, expected) {
  const current = await loadQuoteSnapshot(em, quoteId);
  const unchanged = !!current && sameIds(current.lines, expected.lines) && sameIds(current.adjustments, expected.adjustments) && sameRecords(current.notes, expected.notes) && sameRecords(current.tags, expected.tags) && sameRecords(current.addresses, expected.addresses);
  if (!unchanged) return throwDocumentUndoStale("quote");
}
async function undoQuoteGraph(ctx, before, after) {
  ensureQuoteScope(ctx, before.quote.organizationId, before.quote.tenantId);
  const em = ctx.container.resolve("em").fork();
  let restored;
  await em.transactional(async (tx) => {
    const quote = await findOneWithDecryption(
      tx,
      SalesQuote,
      { id: before.quote.id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
      { tenantId: before.quote.tenantId, organizationId: before.quote.organizationId }
    );
    if (after) {
      if (!quote) return throwDocumentUndoStale("quote");
      await assertQuoteGraphUndoCurrent(tx, quote.id, after);
      tx.clear();
    }
    restored = await restoreQuoteGraph(tx, before, quote && after ? after : null);
    await tx.flush();
  });
  if (!restored) return;
  const dataEngine = ctx.container.resolve("dataEngine");
  await emitCrudUndoSideEffects({
    dataEngine,
    action: "updated",
    entity: restored,
    identifiers: {
      id: restored.id,
      organizationId: restored.organizationId,
      tenantId: restored.tenantId
    },
    indexer: { entityType: E.sales.sales_quote }
  });
}
async function restoreQuoteGraph(em, snapshot, verified = null) {
  let quote = await findOneWithDecryption(
    em,
    SalesQuote,
    { id: snapshot.quote.id },
    {},
    {
      tenantId: snapshot.quote.tenantId,
      organizationId: snapshot.quote.organizationId
    }
  );
  if (!quote) {
    quote = em.create(SalesQuote, {
      id: snapshot.quote.id,
      organizationId: snapshot.quote.organizationId,
      tenantId: snapshot.quote.tenantId,
      quoteNumber: snapshot.quote.quoteNumber,
      statusEntryId: snapshot.quote.statusEntryId ?? null,
      status: snapshot.quote.status ?? null,
      customerEntityId: snapshot.quote.customerEntityId ?? null,
      customerContactId: snapshot.quote.customerContactId ?? null,
      customerSnapshot: snapshot.quote.customerSnapshot ? cloneJson(snapshot.quote.customerSnapshot) : null,
      billingAddressId: snapshot.quote.billingAddressId ?? null,
      shippingAddressId: snapshot.quote.shippingAddressId ?? null,
      billingAddressSnapshot: snapshot.quote.billingAddressSnapshot ? cloneJson(snapshot.quote.billingAddressSnapshot) : null,
      shippingAddressSnapshot: snapshot.quote.shippingAddressSnapshot ? cloneJson(snapshot.quote.shippingAddressSnapshot) : null,
      currencyCode: snapshot.quote.currencyCode,
      validFrom: snapshot.quote.validFrom ? new Date(snapshot.quote.validFrom) : null,
      validUntil: snapshot.quote.validUntil ? new Date(snapshot.quote.validUntil) : null,
      comments: snapshot.quote.comments ?? null,
      taxInfo: snapshot.quote.taxInfo ? cloneJson(snapshot.quote.taxInfo) : null,
      shippingMethodId: snapshot.quote.shippingMethodId ?? null,
      shippingMethodCode: snapshot.quote.shippingMethodCode ?? null,
      deliveryWindowId: snapshot.quote.deliveryWindowId ?? null,
      deliveryWindowCode: snapshot.quote.deliveryWindowCode ?? null,
      paymentMethodId: snapshot.quote.paymentMethodId ?? null,
      paymentMethodCode: snapshot.quote.paymentMethodCode ?? null,
      shippingMethodSnapshot: snapshot.quote.shippingMethodSnapshot ? cloneJson(snapshot.quote.shippingMethodSnapshot) : null,
      deliveryWindowSnapshot: snapshot.quote.deliveryWindowSnapshot ? cloneJson(snapshot.quote.deliveryWindowSnapshot) : null,
      paymentMethodSnapshot: snapshot.quote.paymentMethodSnapshot ? cloneJson(snapshot.quote.paymentMethodSnapshot) : null,
      metadata: snapshot.quote.metadata ? cloneJson(snapshot.quote.metadata) : null,
      channelId: snapshot.quote.channelId ?? null,
      customFieldSetId: snapshot.quote.customFieldSetId ?? null,
      subtotalNetAmount: snapshot.quote.subtotalNetAmount,
      subtotalGrossAmount: snapshot.quote.subtotalGrossAmount,
      discountTotalAmount: snapshot.quote.discountTotalAmount,
      taxTotalAmount: snapshot.quote.taxTotalAmount,
      grandTotalNetAmount: snapshot.quote.grandTotalNetAmount,
      grandTotalGrossAmount: snapshot.quote.grandTotalGrossAmount,
      totalsSnapshot: snapshot.quote.totalsSnapshot ? cloneJson(snapshot.quote.totalsSnapshot) : null,
      lineItemCount: snapshot.quote.lineItemCount,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    em.persist(quote);
  }
  applyQuoteSnapshot(quote, snapshot.quote);
  await em.flush();
  const existingLines = await em.find(
    SalesQuoteLine,
    { quote: quote.id },
    { fields: ["id"] }
  );
  const existingAdjustments = await em.find(
    SalesQuoteAdjustment,
    { quote: quote.id },
    { fields: ["id"] }
  );
  await em.nativeDelete(CustomFieldValue, {
    entityId: E.sales.sales_quote,
    recordId: quote.id
  });
  if (existingLines.length) {
    await em.nativeDelete(CustomFieldValue, {
      entityId: E.sales.sales_quote_line,
      recordId: { $in: existingLines.map((line) => line.id) }
    });
  }
  if (existingAdjustments.length) {
    await em.nativeDelete(CustomFieldValue, {
      entityId: E.sales.sales_quote_adjustment,
      recordId: { $in: existingAdjustments.map((adj) => adj.id) }
    });
  }
  const addressSnapshots = Array.isArray(snapshot.addresses) ? snapshot.addresses : [];
  const noteSnapshots = Array.isArray(snapshot.notes) ? snapshot.notes : [];
  const tagSnapshots = Array.isArray(snapshot.tags) ? snapshot.tags : [];
  const verifiedIds = (entries) => verified ? { id: { $in: (entries ?? []).map((entry) => entry.id) } } : {};
  await em.nativeDelete(SalesDocumentAddress, {
    documentId: quote.id,
    documentKind: "quote",
    ...verifiedIds(verified?.addresses)
  });
  await em.nativeDelete(SalesNote, {
    contextType: "quote",
    contextId: quote.id,
    ...verifiedIds(verified?.notes)
  });
  await em.nativeDelete(SalesDocumentTagAssignment, {
    documentId: quote.id,
    documentKind: "quote",
    ...verifiedIds(verified?.tags)
  });
  await em.nativeDelete(SalesQuoteLine, { quote: quote.id });
  await em.nativeDelete(SalesQuoteAdjustment, { quote: quote.id });
  existingLines.forEach((entry) => em.getUnitOfWork().unsetIdentity(entry));
  existingAdjustments.forEach(
    (entry) => em.getUnitOfWork().unsetIdentity(entry)
  );
  snapshot.lines.forEach((line) => {
    const lineEntity = em.create(SalesQuoteLine, {
      id: line.id,
      quote,
      organizationId: quote.organizationId,
      tenantId: quote.tenantId,
      lineNumber: line.lineNumber,
      kind: line.kind,
      statusEntryId: line.statusEntryId ?? null,
      status: line.status ?? null,
      productId: line.productId ?? null,
      productVariantId: line.productVariantId ?? null,
      catalogSnapshot: line.catalogSnapshot ? cloneJson(line.catalogSnapshot) : null,
      name: line.name ?? null,
      description: line.description ?? null,
      comment: line.comment ?? null,
      quantity: line.quantity,
      quantityUnit: line.quantityUnit ?? null,
      normalizedQuantity: line.normalizedQuantity ?? line.quantity,
      normalizedUnit: line.normalizedUnit ?? line.quantityUnit ?? null,
      uomSnapshot: line.uomSnapshot ? cloneJson(line.uomSnapshot) : null,
      currencyCode: line.currencyCode,
      unitPriceNet: line.unitPriceNet,
      unitPriceGross: line.unitPriceGross,
      discountAmount: line.discountAmount,
      discountPercent: line.discountPercent,
      taxRate: line.taxRate,
      taxAmount: line.taxAmount,
      totalNetAmount: toNumericString(
        deriveLineNetFromGross(line.totalNetAmount, line.totalGrossAmount, line.taxRate)
      ),
      totalGrossAmount: line.totalGrossAmount,
      configuration: line.configuration ? cloneJson(line.configuration) : null,
      promotionCode: line.promotionCode ?? null,
      promotionSnapshot: line.promotionSnapshot ? cloneJson(line.promotionSnapshot) : null,
      metadata: line.metadata ? cloneJson(line.metadata) : null,
      customFieldSetId: line.customFieldSetId ?? null,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    em.persist(lineEntity);
  });
  snapshot.adjustments.forEach((adjustment, index) => {
    const adjustmentEntity = em.create(SalesQuoteAdjustment, {
      id: adjustment.id,
      quote,
      organizationId: quote.organizationId,
      tenantId: quote.tenantId,
      scope: adjustment.scope,
      kind: adjustment.kind,
      code: adjustment.code ?? null,
      label: adjustment.label ?? null,
      calculatorKey: adjustment.calculatorKey ?? null,
      promotionId: adjustment.promotionId ?? null,
      rate: adjustment.rate,
      amountNet: adjustment.amountNet,
      amountGross: adjustment.amountGross,
      currencyCode: adjustment.currencyCode ?? null,
      metadata: adjustment.metadata ? cloneJson(adjustment.metadata) : null,
      position: adjustment.position ?? index,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    adjustmentEntity.quoteLine = null;
    em.persist(adjustmentEntity);
  });
  addressSnapshots.forEach((entry) => {
    const entity = em.create(SalesDocumentAddress, {
      id: entry.id,
      organizationId: entry.organizationId,
      tenantId: entry.tenantId,
      documentId: quote.id,
      documentKind: "quote",
      customerAddressId: entry.customerAddressId ?? null,
      name: entry.name ?? null,
      purpose: entry.purpose ?? null,
      companyName: entry.companyName ?? null,
      addressLine1: entry.addressLine1,
      addressLine2: entry.addressLine2 ?? null,
      city: entry.city ?? null,
      region: entry.region ?? null,
      postalCode: entry.postalCode ?? null,
      country: entry.country ?? null,
      buildingNumber: entry.buildingNumber ?? null,
      flatNumber: entry.flatNumber ?? null,
      latitude: entry.latitude ?? null,
      longitude: entry.longitude ?? null,
      quote,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    em.persist(entity);
  });
  noteSnapshots.forEach((entry) => {
    const entity = em.create(SalesNote, {
      id: entry.id,
      organizationId: entry.organizationId,
      tenantId: entry.tenantId,
      contextType: "quote",
      contextId: quote.id,
      order: null,
      quote,
      body: entry.body,
      authorUserId: entry.authorUserId ?? null,
      appearanceIcon: entry.appearanceIcon ?? null,
      appearanceColor: entry.appearanceColor ?? null,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    em.persist(entity);
  });
  tagSnapshots.forEach((entry) => {
    const tag = em.getReference(SalesDocumentTag, entry.tagId);
    const assignment = em.create(SalesDocumentTagAssignment, {
      id: entry.id,
      organizationId: entry.organizationId,
      tenantId: entry.tenantId,
      documentId: quote.id,
      documentKind: "quote",
      tag,
      quote,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    em.persist(assignment);
  });
  if (snapshot.quote.customFields) {
    await setRecordCustomFields(em, {
      entityId: E.sales.sales_quote,
      recordId: quote.id,
      organizationId: quote.organizationId,
      tenantId: quote.tenantId,
      values: toSnapshotCustomFieldWriteValues(snapshot.quote.customFields)
    });
  }
  for (const line of snapshot.lines) {
    if (!line.customFields) continue;
    await setRecordCustomFields(em, {
      entityId: E.sales.sales_quote_line,
      recordId: line.id,
      organizationId: quote.organizationId,
      tenantId: quote.tenantId,
      values: toSnapshotCustomFieldWriteValues(line.customFields)
    });
  }
  for (const adjustment of snapshot.adjustments) {
    if (!adjustment.customFields) continue;
    await setRecordCustomFields(em, {
      entityId: E.sales.sales_quote_adjustment,
      recordId: adjustment.id,
      organizationId: quote.organizationId,
      tenantId: quote.tenantId,
      values: toSnapshotCustomFieldWriteValues(adjustment.customFields)
    });
  }
  return quote;
}
async function throwDocumentUndoStale(kind) {
  const { translate } = await resolveTranslations();
  throw new CrudHttpError(409, {
    error: kind === "order" ? translate(
      "sales.documents.errors.undoStaleOrder",
      "This change can no longer be undone because the order was changed afterwards."
    ) : translate(
      "sales.documents.errors.undoStaleQuote",
      "This change can no longer be undone because the quote was changed afterwards."
    )
  });
}
function canonicalizeForComparison(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeForComparison).map((entry) => ({ entry, key: JSON.stringify(entry) })).sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0).map(({ entry }) => entry);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort((left, right) => left < right ? -1 : left > right ? 1 : 0).map((key) => [key, canonicalizeForComparison(value[key])])
    );
  }
  return value;
}
function toComparableRecords(entries) {
  const records = /* @__PURE__ */ new Map();
  for (const entry of entries ?? []) {
    records.set(entry.id, canonicalizeForComparison(JSON.parse(JSON.stringify(entry))));
  }
  return records;
}
function withoutAllocationIds(payments) {
  return (payments ?? []).map((payment) => ({
    ...payment,
    allocations: (payment.allocations ?? []).map(
      (allocation) => Object.fromEntries(Object.entries(allocation).filter(([key]) => key !== "id"))
    )
  }));
}
function sameRecords(current, expected) {
  const currentRecords = toComparableRecords(current);
  const expectedRecords = toComparableRecords(expected);
  if (currentRecords.size !== expectedRecords.size) return false;
  for (const [id, record] of expectedRecords) {
    if (!currentRecords.has(id)) return false;
    if (!isDeepStrictEqual(currentRecords.get(id), record)) return false;
  }
  return true;
}
function sameIds(current, expected) {
  const currentIds = new Set((current ?? []).map((entry) => entry.id));
  const expectedIds = (expected ?? []).map((entry) => entry.id);
  return currentIds.size === expectedIds.length && expectedIds.every((id) => currentIds.has(id));
}
function sameLineProgress(current, expected) {
  if (!sameIds(current, expected)) return false;
  const expectedById = new Map((expected ?? []).map((line) => [line.id, line]));
  return current.every((line) => {
    const target = expectedById.get(line.id);
    return !!target && Number(line.fulfilledQuantity ?? 0) === Number(target.fulfilledQuantity ?? 0) && Number(line.returnedQuantity ?? 0) === Number(target.returnedQuantity ?? 0);
  });
}
async function assertOrderGraphUndoCurrent(em, orderId, expected) {
  const current = await loadOrderSnapshot(em, orderId);
  if (!current) return throwDocumentUndoStale("order");
  const lineIds = current.lines.map((line) => line.id);
  const [returnCount, invoiceLineCount, creditMemoLineCount] = await Promise.all([
    em.count(SalesReturn, { order: orderId }),
    lineIds.length ? em.count(SalesInvoiceLine, { orderLine: { $in: lineIds } }) : Promise.resolve(0),
    lineIds.length ? em.count(SalesCreditMemoLine, { orderLine: { $in: lineIds } }) : Promise.resolve(0)
  ]);
  if (returnCount > 0 || invoiceLineCount > 0 || creditMemoLineCount > 0) {
    return throwDocumentUndoStale("order");
  }
  const unchanged = sameLineProgress(current.lines, expected.lines) && sameIds(current.adjustments, expected.adjustments) && sameRecords(current.shipments, expected.shipments) && sameRecords(withoutAllocationIds(current.payments), withoutAllocationIds(expected.payments)) && sameRecords(current.notes, expected.notes) && sameRecords(current.tags, expected.tags) && sameRecords(current.addresses, expected.addresses);
  if (!unchanged) return throwDocumentUndoStale("order");
}
async function lockOrderForUndo(em, orderId, scope) {
  const order = await findOneWithDecryption(
    em,
    SalesOrder,
    { id: orderId },
    { lockMode: LockMode.PESSIMISTIC_WRITE },
    scope
  );
  if (!order) return false;
  await em.find(
    SalesOrderLine,
    { order: orderId },
    { lockMode: LockMode.PESSIMISTIC_WRITE, orderBy: { id: "asc" } }
  );
  return true;
}
async function withVerifiedOrderGraph(ctx, expected, scope, work) {
  const em = ctx.container.resolve("em").fork();
  await em.transactional(async (tx) => {
    const exists = await lockOrderForUndo(tx, scope.orderId, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId
    });
    if (exists && expected) {
      await assertOrderGraphUndoCurrent(tx, scope.orderId, expected);
      tx.clear();
    }
    await work(tx, exists);
  });
}
async function undoOrderGraph(ctx, before, after) {
  ensureOrderScope(ctx, before.order.organizationId, before.order.tenantId);
  let restored;
  await withVerifiedOrderGraph(
    ctx,
    after,
    {
      orderId: before.order.id,
      tenantId: before.order.tenantId,
      organizationId: before.order.organizationId
    },
    async (tx, exists) => {
      if (!exists && after) await throwDocumentUndoStale("order");
      restored = await restoreOrderGraph(tx, before, exists ? after : null);
      await tx.flush();
    }
  );
  if (!restored) return;
  const dataEngine = ctx.container.resolve("dataEngine");
  await emitCrudUndoSideEffects({
    dataEngine,
    action: "updated",
    entity: restored,
    identifiers: {
      id: restored.id,
      organizationId: restored.organizationId,
      tenantId: restored.tenantId
    },
    indexer: { entityType: E.sales.sales_order }
  });
}
async function restoreOrderGraph(em, snapshot, verified = null) {
  let order = await findOneWithDecryption(
    em,
    SalesOrder,
    { id: snapshot.order.id },
    {},
    {
      tenantId: snapshot.order.tenantId,
      organizationId: snapshot.order.organizationId
    }
  );
  let existingLines = [];
  if (order) {
    existingLines = await em.find(
      SalesOrderLine,
      { order },
      { orderBy: { lineNumber: "asc" } }
    );
    await assertShippedOrderGraphRestorable(
      em,
      order,
      existingLines,
      snapshot
    );
  }
  if (!order) {
    order = em.create(SalesOrder, {
      id: snapshot.order.id,
      organizationId: snapshot.order.organizationId,
      tenantId: snapshot.order.tenantId,
      orderNumber: snapshot.order.orderNumber,
      statusEntryId: snapshot.order.statusEntryId ?? null,
      status: snapshot.order.status ?? null,
      fulfillmentStatusEntryId: snapshot.order.fulfillmentStatusEntryId ?? null,
      fulfillmentStatus: snapshot.order.fulfillmentStatus ?? null,
      paymentStatusEntryId: snapshot.order.paymentStatusEntryId ?? null,
      paymentStatus: snapshot.order.paymentStatus ?? null,
      customerEntityId: snapshot.order.customerEntityId ?? null,
      customerContactId: snapshot.order.customerContactId ?? null,
      customerSnapshot: snapshot.order.customerSnapshot ? cloneJson(snapshot.order.customerSnapshot) : null,
      billingAddressId: snapshot.order.billingAddressId ?? null,
      shippingAddressId: snapshot.order.shippingAddressId ?? null,
      billingAddressSnapshot: snapshot.order.billingAddressSnapshot ? cloneJson(snapshot.order.billingAddressSnapshot) : null,
      shippingAddressSnapshot: snapshot.order.shippingAddressSnapshot ? cloneJson(snapshot.order.shippingAddressSnapshot) : null,
      currencyCode: snapshot.order.currencyCode,
      exchangeRate: snapshot.order.exchangeRate ?? null,
      taxStrategyKey: snapshot.order.taxStrategyKey ?? null,
      discountStrategyKey: snapshot.order.discountStrategyKey ?? null,
      taxInfo: snapshot.order.taxInfo ? cloneJson(snapshot.order.taxInfo) : null,
      shippingMethodId: snapshot.order.shippingMethodId ?? null,
      shippingMethodCode: snapshot.order.shippingMethodCode ?? null,
      deliveryWindowId: snapshot.order.deliveryWindowId ?? null,
      deliveryWindowCode: snapshot.order.deliveryWindowCode ?? null,
      paymentMethodId: snapshot.order.paymentMethodId ?? null,
      paymentMethodCode: snapshot.order.paymentMethodCode ?? null,
      channelId: snapshot.order.channelId ?? null,
      placedAt: snapshot.order.placedAt ? new Date(snapshot.order.placedAt) : null,
      expectedDeliveryAt: snapshot.order.expectedDeliveryAt ? new Date(snapshot.order.expectedDeliveryAt) : null,
      dueAt: snapshot.order.dueAt ? new Date(snapshot.order.dueAt) : null,
      comments: snapshot.order.comments ?? null,
      internalNotes: snapshot.order.internalNotes ?? null,
      shippingMethodSnapshot: snapshot.order.shippingMethodSnapshot ? cloneJson(snapshot.order.shippingMethodSnapshot) : null,
      deliveryWindowSnapshot: snapshot.order.deliveryWindowSnapshot ? cloneJson(snapshot.order.deliveryWindowSnapshot) : null,
      paymentMethodSnapshot: snapshot.order.paymentMethodSnapshot ? cloneJson(snapshot.order.paymentMethodSnapshot) : null,
      metadata: snapshot.order.metadata ? cloneJson(snapshot.order.metadata) : null,
      customFieldSetId: snapshot.order.customFieldSetId ?? null,
      subtotalNetAmount: snapshot.order.subtotalNetAmount,
      subtotalGrossAmount: snapshot.order.subtotalGrossAmount,
      discountTotalAmount: snapshot.order.discountTotalAmount,
      taxTotalAmount: snapshot.order.taxTotalAmount,
      shippingNetAmount: snapshot.order.shippingNetAmount,
      shippingGrossAmount: snapshot.order.shippingGrossAmount,
      surchargeTotalAmount: snapshot.order.surchargeTotalAmount,
      grandTotalNetAmount: snapshot.order.grandTotalNetAmount,
      grandTotalGrossAmount: snapshot.order.grandTotalGrossAmount,
      paidTotalAmount: snapshot.order.paidTotalAmount,
      refundedTotalAmount: snapshot.order.refundedTotalAmount,
      outstandingAmount: snapshot.order.outstandingAmount,
      totalsSnapshot: snapshot.order.totalsSnapshot ? cloneJson(snapshot.order.totalsSnapshot) : null,
      lineItemCount: snapshot.order.lineItemCount,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    em.persist(order);
  }
  applyOrderSnapshot(order, snapshot.order);
  await em.flush();
  const existingAdjustments = await em.find(
    SalesOrderAdjustment,
    { order: order.id },
    { fields: ["id"] }
  );
  await em.nativeDelete(CustomFieldValue, {
    entityId: E.sales.sales_order,
    recordId: order.id
  });
  if (existingLines.length) {
    await em.nativeDelete(CustomFieldValue, {
      entityId: E.sales.sales_order_line,
      recordId: { $in: existingLines.map((line) => line.id) }
    });
  }
  if (existingAdjustments.length) {
    await em.nativeDelete(CustomFieldValue, {
      entityId: E.sales.sales_order_adjustment,
      recordId: { $in: existingAdjustments.map((adj) => adj.id) }
    });
  }
  const addressSnapshots = Array.isArray(snapshot.addresses) ? snapshot.addresses : [];
  const noteSnapshots = Array.isArray(snapshot.notes) ? snapshot.notes : [];
  const tagSnapshots = Array.isArray(snapshot.tags) ? snapshot.tags : [];
  const shipmentSnapshots = Array.isArray(snapshot.shipments) ? snapshot.shipments : [];
  const paymentSnapshots = Array.isArray(snapshot.payments) ? snapshot.payments : [];
  const existingShipments = await em.find(SalesShipment, { order: order.id });
  const shipmentIds = existingShipments.map((entry) => entry.id);
  if (shipmentIds.length) {
    await em.nativeDelete(SalesShipmentItem, {
      shipment: { $in: shipmentIds }
    });
    await em.nativeDelete(SalesShipment, { id: { $in: shipmentIds } });
    existingShipments.forEach(
      (entry) => em.getUnitOfWork().unsetIdentity(entry)
    );
  }
  await em.nativeDelete(SalesPaymentAllocation, { order: order.id });
  await em.nativeDelete(SalesPayment, { order: order.id });
  const verifiedIds = (entries) => verified ? { id: { $in: (entries ?? []).map((entry) => entry.id) } } : {};
  await em.nativeDelete(SalesDocumentAddress, {
    documentId: order.id,
    documentKind: "order",
    ...verifiedIds(verified?.addresses)
  });
  await em.nativeDelete(SalesNote, {
    contextType: "order",
    contextId: order.id,
    ...verifiedIds(verified?.notes)
  });
  await em.nativeDelete(SalesDocumentTagAssignment, {
    documentId: order.id,
    documentKind: "order",
    ...verifiedIds(verified?.tags)
  });
  await em.nativeDelete(SalesOrderAdjustment, { order: order.id });
  await em.nativeDelete(SalesOrderLine, { order: order.id });
  existingLines.forEach((entry) => em.getUnitOfWork().unsetIdentity(entry));
  existingAdjustments.forEach(
    (entry) => em.getUnitOfWork().unsetIdentity(entry)
  );
  snapshot.lines.forEach((line) => {
    const lineEntity = em.create(SalesOrderLine, {
      id: line.id,
      order,
      organizationId: order.organizationId,
      tenantId: order.tenantId,
      lineNumber: line.lineNumber,
      kind: line.kind,
      statusEntryId: line.statusEntryId ?? null,
      status: line.status ?? null,
      productId: line.productId ?? null,
      productVariantId: line.productVariantId ?? null,
      catalogSnapshot: line.catalogSnapshot ? cloneJson(line.catalogSnapshot) : null,
      name: line.name ?? null,
      description: line.description ?? null,
      comment: line.comment ?? null,
      quantity: line.quantity,
      quantityUnit: line.quantityUnit ?? null,
      normalizedQuantity: line.normalizedQuantity ?? line.quantity,
      normalizedUnit: line.normalizedUnit ?? line.quantityUnit ?? null,
      uomSnapshot: line.uomSnapshot ? cloneJson(line.uomSnapshot) : null,
      reservedQuantity: line.reservedQuantity,
      fulfilledQuantity: line.fulfilledQuantity,
      invoicedQuantity: line.invoicedQuantity,
      returnedQuantity: line.returnedQuantity,
      currencyCode: line.currencyCode,
      unitPriceNet: line.unitPriceNet,
      unitPriceGross: line.unitPriceGross,
      discountAmount: line.discountAmount,
      discountPercent: line.discountPercent,
      taxRate: line.taxRate,
      taxAmount: line.taxAmount,
      totalNetAmount: toNumericString(
        deriveLineNetFromGross(line.totalNetAmount, line.totalGrossAmount, line.taxRate)
      ),
      totalGrossAmount: line.totalGrossAmount,
      configuration: line.configuration ? cloneJson(line.configuration) : null,
      promotionCode: line.promotionCode ?? null,
      promotionSnapshot: line.promotionSnapshot ? cloneJson(line.promotionSnapshot) : null,
      metadata: line.metadata ? cloneJson(line.metadata) : null,
      customFieldSetId: line.customFieldSetId ?? null,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    em.persist(lineEntity);
  });
  snapshot.adjustments.forEach((adjustment, index) => {
    const adjustmentEntity = em.create(SalesOrderAdjustment, {
      id: adjustment.id,
      order,
      organizationId: order.organizationId,
      tenantId: order.tenantId,
      scope: adjustment.scope,
      kind: adjustment.kind,
      code: adjustment.code ?? null,
      label: adjustment.label ?? null,
      calculatorKey: adjustment.calculatorKey ?? null,
      promotionId: adjustment.promotionId ?? null,
      rate: adjustment.rate,
      amountNet: adjustment.amountNet,
      amountGross: adjustment.amountGross,
      currencyCode: adjustment.currencyCode ?? null,
      metadata: adjustment.metadata ? cloneJson(adjustment.metadata) : null,
      position: adjustment.position ?? index,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    adjustmentEntity.orderLine = null;
    em.persist(adjustmentEntity);
  });
  addressSnapshots.forEach((entry) => {
    const entity = em.create(SalesDocumentAddress, {
      id: entry.id,
      organizationId: entry.organizationId,
      tenantId: entry.tenantId,
      documentId: order.id,
      documentKind: "order",
      customerAddressId: entry.customerAddressId ?? null,
      name: entry.name ?? null,
      purpose: entry.purpose ?? null,
      companyName: entry.companyName ?? null,
      addressLine1: entry.addressLine1,
      addressLine2: entry.addressLine2 ?? null,
      city: entry.city ?? null,
      region: entry.region ?? null,
      postalCode: entry.postalCode ?? null,
      country: entry.country ?? null,
      buildingNumber: entry.buildingNumber ?? null,
      flatNumber: entry.flatNumber ?? null,
      latitude: entry.latitude ?? null,
      longitude: entry.longitude ?? null,
      order,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    em.persist(entity);
  });
  noteSnapshots.forEach((entry) => {
    const entity = em.create(SalesNote, {
      id: entry.id,
      organizationId: entry.organizationId,
      tenantId: entry.tenantId,
      contextType: "order",
      contextId: order.id,
      order,
      quote: null,
      body: entry.body,
      authorUserId: entry.authorUserId ?? null,
      appearanceIcon: entry.appearanceIcon ?? null,
      appearanceColor: entry.appearanceColor ?? null,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    em.persist(entity);
  });
  tagSnapshots.forEach((entry) => {
    const tag = em.getReference(SalesDocumentTag, entry.tagId);
    const assignment = em.create(SalesDocumentTagAssignment, {
      id: entry.id,
      organizationId: entry.organizationId,
      tenantId: entry.tenantId,
      documentId: order.id,
      documentKind: "order",
      tag,
      order,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    em.persist(assignment);
  });
  if (snapshot.order.customFields) {
    await setRecordCustomFields(em, {
      entityId: E.sales.sales_order,
      recordId: order.id,
      organizationId: order.organizationId,
      tenantId: order.tenantId,
      values: toSnapshotCustomFieldWriteValues(snapshot.order.customFields)
    });
  }
  for (const line of snapshot.lines) {
    if (!line.customFields) continue;
    await setRecordCustomFields(em, {
      entityId: E.sales.sales_order_line,
      recordId: line.id,
      organizationId: order.organizationId,
      tenantId: order.tenantId,
      values: toSnapshotCustomFieldWriteValues(line.customFields)
    });
  }
  for (const adjustment of snapshot.adjustments) {
    if (!adjustment.customFields) continue;
    await setRecordCustomFields(em, {
      entityId: E.sales.sales_order_adjustment,
      recordId: adjustment.id,
      organizationId: order.organizationId,
      tenantId: order.tenantId,
      values: toSnapshotCustomFieldWriteValues(adjustment.customFields)
    });
  }
  for (const shipment of shipmentSnapshots) {
    await restoreShipmentSnapshot(em, shipment);
  }
  for (const payment of paymentSnapshots) {
    await restorePaymentSnapshot(em, payment);
  }
  return order;
}
const createQuoteCommand = {
  id: "sales.quotes.create",
  async execute(rawInput, ctx) {
    const generator = ctx.container.resolve(
      "salesDocumentNumberGenerator"
    );
    const initial = quoteCreateSchema.parse(rawInput ?? {});
    const quoteNumber = typeof initial.quoteNumber === "string" && initial.quoteNumber.trim().length ? initial.quoteNumber.trim() : (await generator.generate({
      kind: "quote",
      organizationId: initial.organizationId,
      tenantId: initial.tenantId
    })).number;
    const parsed = quoteCreateSchema.parse({ ...initial, quoteNumber });
    const ensuredQuoteNumber = parsed.quoteNumber ?? quoteNumber;
    if (!ensuredQuoteNumber) {
      throw new CrudHttpError(400, { error: "Quote number is required." });
    }
    ensureQuoteScope(ctx, parsed.organizationId, parsed.tenantId);
    const em = ctx.container.resolve("em").fork();
    const {
      customerSnapshot: resolvedCustomerSnapshot,
      billingAddressSnapshot: resolvedBillingSnapshot,
      shippingAddressSnapshot: resolvedShippingSnapshot,
      shippingMethod,
      deliveryWindow,
      paymentMethod
    } = await resolveDocumentReferences(em, parsed);
    const quoteStatus = await resolveDictionaryEntryValue(
      em,
      parsed.statusEntryId ?? null,
      { tenantId: parsed.tenantId }
    );
    const quoteId = randomUUID();
    const quote = em.create(SalesQuote, {
      id: quoteId,
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      quoteNumber: ensuredQuoteNumber,
      statusEntryId: parsed.statusEntryId ?? null,
      status: quoteStatus,
      customerEntityId: parsed.customerEntityId ?? null,
      customerContactId: parsed.customerContactId ?? null,
      customerSnapshot: resolvedCustomerSnapshot ? cloneJson(resolvedCustomerSnapshot) : null,
      billingAddressId: parsed.billingAddressId ?? null,
      shippingAddressId: parsed.shippingAddressId ?? null,
      billingAddressSnapshot: resolvedBillingSnapshot ? cloneJson(resolvedBillingSnapshot) : null,
      shippingAddressSnapshot: resolvedShippingSnapshot ? cloneJson(resolvedShippingSnapshot) : null,
      currencyCode: parsed.currencyCode,
      validFrom: parsed.validFrom ?? null,
      validUntil: parsed.validUntil ?? null,
      comments: parsed.comments ?? null,
      taxInfo: parsed.taxInfo ? cloneJson(parsed.taxInfo) : null,
      shippingMethodId: parsed.shippingMethodId ?? null,
      shippingMethod: shippingMethod ?? null,
      shippingMethodCode: parsed.shippingMethodCode ?? shippingMethod?.code ?? null,
      deliveryWindowId: parsed.deliveryWindowId ?? null,
      deliveryWindow: deliveryWindow ?? null,
      deliveryWindowCode: parsed.deliveryWindowCode ?? deliveryWindow?.code ?? null,
      paymentMethodId: parsed.paymentMethodId ?? null,
      paymentMethod: paymentMethod ?? null,
      paymentMethodCode: parsed.paymentMethodCode ?? paymentMethod?.code ?? null,
      shippingMethodSnapshot: parsed.shippingMethodSnapshot ? cloneJson(parsed.shippingMethodSnapshot) : shippingMethod ? {
        id: shippingMethod.id,
        code: shippingMethod.code,
        name: shippingMethod.name,
        description: shippingMethod.description ?? null,
        carrierCode: shippingMethod.carrierCode ?? null,
        providerKey: shippingMethod.providerKey ?? null,
        serviceLevel: shippingMethod.serviceLevel ?? null,
        estimatedTransitDays: shippingMethod.estimatedTransitDays ?? null,
        baseRateNet: shippingMethod.baseRateNet,
        baseRateGross: shippingMethod.baseRateGross,
        currencyCode: shippingMethod.currencyCode ?? null,
        metadata: shippingMethod.metadata ? cloneJson(shippingMethod.metadata) : null,
        providerSettings: shippingMethod.metadata && typeof shippingMethod.metadata === "object" ? cloneJson(
          shippingMethod.metadata.providerSettings ?? null
        ) : null
      } : null,
      deliveryWindowSnapshot: parsed.deliveryWindowSnapshot ? cloneJson(parsed.deliveryWindowSnapshot) : deliveryWindow ? {
        id: deliveryWindow.id,
        code: deliveryWindow.code,
        name: deliveryWindow.name,
        description: deliveryWindow.description ?? null,
        leadTimeDays: deliveryWindow.leadTimeDays ?? null,
        cutoffTime: deliveryWindow.cutoffTime ?? null,
        timezone: deliveryWindow.timezone ?? null
      } : null,
      paymentMethodSnapshot: parsed.paymentMethodSnapshot ? cloneJson(parsed.paymentMethodSnapshot) : paymentMethod ? {
        id: paymentMethod.id,
        code: paymentMethod.code,
        name: paymentMethod.name,
        description: paymentMethod.description ?? null,
        providerKey: paymentMethod.providerKey ?? null,
        terms: paymentMethod.terms ?? null,
        metadata: paymentMethod.metadata ? cloneJson(paymentMethod.metadata) : null,
        providerSettings: paymentMethod.metadata && typeof paymentMethod.metadata === "object" ? cloneJson(
          paymentMethod.metadata.providerSettings ?? null
        ) : null
      } : null,
      metadata: parsed.metadata ? cloneJson(parsed.metadata) : null,
      channelId: parsed.channelId ?? null,
      customFieldSetId: parsed.customFieldSetId ?? null,
      subtotalNetAmount: "0",
      subtotalGrossAmount: "0",
      discountTotalAmount: "0",
      taxTotalAmount: "0",
      grandTotalNetAmount: "0",
      grandTotalGrossAmount: "0",
      lineItemCount: 0,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    const lineInputs = (parsed.lines ?? []).map(
      (line, index) => quoteLineCreateSchema.parse({
        ...line,
        organizationId: parsed.organizationId,
        tenantId: parsed.tenantId,
        quoteId: quote.id,
        lineNumber: line.lineNumber ?? index + 1
      })
    );
    const uomResolver = createUomResolver();
    const normalizedLineInputs = await Promise.all(
      lineInputs.map(async (line) => {
        const normalized = await normalizeLineUom({
          em,
          resolver: uomResolver,
          organizationId: parsed.organizationId,
          tenantId: parsed.tenantId,
          line
        });
        return {
          ...line,
          quantity: normalized.quantity,
          quantityUnit: normalized.quantityUnit,
          normalizedQuantity: normalized.normalizedQuantity,
          normalizedUnit: normalized.normalizedUnit,
          uomSnapshot: normalized.uomSnapshot
        };
      })
    );
    const adjustmentInputs = parsed.adjustments ? parsed.adjustments.map(
      (adj) => quoteAdjustmentCreateSchema.parse({
        ...adj,
        organizationId: parsed.organizationId,
        tenantId: parsed.tenantId,
        quoteId: quote.id
      })
    ) : null;
    const lineSnapshots = normalizedLineInputs.map(
      (line, index) => createLineSnapshotFromInput(line, line.lineNumber ?? index + 1)
    );
    const adjustmentDrafts = adjustmentInputs ? adjustmentInputs.map((adj) => createAdjustmentDraftFromInput(adj)) : [];
    const salesCalculationService = ctx.container.resolve("salesCalculationService");
    const calculationContext = buildCalculationContext({
      tenantId: quote.tenantId,
      organizationId: quote.organizationId,
      currencyCode: quote.currencyCode,
      shippingSnapshot: quote.shippingMethodSnapshot,
      paymentSnapshot: quote.paymentMethodSnapshot,
      shippingMethodId: quote.shippingMethodId ?? null,
      paymentMethodId: quote.paymentMethodId ?? null,
      shippingMethodCode: quote.shippingMethodCode ?? null,
      paymentMethodCode: quote.paymentMethodCode ?? null
    });
    const calculation = await salesCalculationService.calculateDocumentTotals({
      documentKind: "quote",
      lines: lineSnapshots,
      adjustments: adjustmentDrafts,
      context: calculationContext
    });
    let eventBus = null;
    try {
      eventBus = ctx.container.resolve("eventBus");
    } catch {
      eventBus = null;
    }
    await withAtomicFlush(
      em,
      [
        async () => {
          em.persist(quote);
          await replaceQuoteLines(em, quote, calculation, normalizedLineInputs);
          await replaceQuoteAdjustments(
            em,
            quote,
            calculation,
            adjustmentInputs
          );
          applyQuoteTotals(quote, calculation.totals, calculation.lines.length);
          await emitTotalsCalculated(eventBus, {
            documentKind: "quote",
            documentId: quote.id,
            organizationId: quote.organizationId,
            tenantId: quote.tenantId,
            customerId: quote.customerEntityId ?? null,
            totals: calculation.totals,
            lineCount: calculation.lines.length
          });
          await syncSalesDocumentTags(em, {
            documentId: quote.id,
            kind: "quote",
            organizationId: quote.organizationId,
            tenantId: quote.tenantId,
            tagIds: parsed.tags
          });
          await setDocumentCustomFieldsIfSupplied(em, {
            entityId: E.sales.sales_quote,
            recordId: quote.id,
            organizationId: quote.organizationId,
            tenantId: quote.tenantId,
            customFields: parsed.customFields
          });
        }
      ],
      { transaction: true }
    );
    try {
      const notificationService = resolveNotificationService(ctx.container);
      const typeDef = notificationTypes.find(
        (type) => type.type === "sales.quote.created"
      );
      if (typeDef) {
        const totalAmount = quote.grandTotalGrossAmount && quote.currencyCode ? `${quote.grandTotalGrossAmount} ${quote.currencyCode}` : "";
        const totalDisplay = totalAmount ? ` (${totalAmount})` : "";
        const notificationInput = buildFeatureNotificationFromType(typeDef, {
          requiredFeature: "sales.quotes.manage",
          bodyVariables: {
            quoteNumber: quote.quoteNumber,
            total: totalDisplay,
            totalAmount
          },
          sourceEntityType: "sales:quote",
          sourceEntityId: quote.id,
          linkHref: `/backend/sales/quotes/${quote.id}`
        });
        if (!ctx.bulkImport?.skipNotifications) {
          await notificationService.createForFeature(notificationInput, {
            tenantId: quote.tenantId,
            organizationId: quote.organizationId ?? null
          });
        }
      }
    } catch (err) {
      logger.error("sales.quotes.create failed to create notification", { err });
    }
    const dataEngine = ctx.container.resolve("dataEngine");
    await emitCrudSideEffects({
      dataEngine,
      action: "created",
      entity: quote,
      identifiers: {
        id: quote.id,
        organizationId: quote.organizationId,
        tenantId: quote.tenantId
      },
      events: quoteCrudEvents,
      indexer: { entityType: E.sales.sales_quote },
      actorUserId: ctx.auth?.sub ?? null
    });
    const resourceKind = deriveResourceFromCommandId(createQuoteCommand.id) ?? "sales.quote";
    await invalidateCrudCache(
      ctx.container,
      resourceKind,
      {
        id: quote.id,
        organizationId: quote.organizationId,
        tenantId: quote.tenantId
      },
      ctx.auth?.tenantId ?? null,
      "created"
    );
    return { quoteId: quote.id };
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve("em").fork();
    return loadQuoteSnapshot(em, result.quoteId);
  },
  buildLog: async ({ result, snapshots }) => {
    const after = snapshots.after;
    if (!after) return null;
    const { translate } = await resolveTranslations();
    return {
      actionLabel: translate("sales.audit.quotes.create", "Create sales quote"),
      resourceKind: "sales.quote",
      resourceId: result.quoteId,
      tenantId: after.quote.tenantId,
      organizationId: after.quote.organizationId,
      snapshotAfter: after,
      payload: {
        undo: {
          after
        }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const after = payload?.after;
    if (!after) return;
    ensureQuoteScope(ctx, after.quote.organizationId, after.quote.tenantId);
    const em = ctx.container.resolve("em").fork();
    await em.transactional(async (tx) => {
      const quote = await findOneWithDecryption(
        tx,
        SalesQuote,
        { id: after.quote.id },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
        {
          tenantId: after.quote.tenantId,
          organizationId: after.quote.organizationId
        }
      );
      if (!quote) return;
      await assertQuoteGraphUndoCurrent(tx, quote.id, after);
      await tx.nativeDelete(SalesQuoteAdjustment, { quote: quote.id });
      await tx.nativeDelete(SalesQuoteLine, { quote: quote.id });
      tx.remove(quote);
      await tx.flush();
    });
  }
};
const deleteQuoteCommand = {
  id: "sales.quotes.delete",
  async prepare(input, ctx) {
    const id = requireId(input, "Quote id is required");
    const em = ctx.container.resolve("em");
    const snapshot = await loadQuoteSnapshot(em, id);
    if (snapshot) {
      ensureQuoteScope(
        ctx,
        snapshot.quote.organizationId,
        snapshot.quote.tenantId
      );
    }
    return snapshot ? { before: snapshot } : {};
  },
  async execute(input, ctx) {
    const id = requireId(input, "Quote id is required");
    const em = ctx.container.resolve("em").fork();
    const quote = await findOneWithDecryption(em, SalesQuote, { id });
    if (!quote)
      throw notFound("Sales quote not found");
    ensureQuoteScope(ctx, quote.organizationId, quote.tenantId);
    const [addresses, notes, tags, adjustments, lines] = await Promise.all([
      findWithDecryption(
        em,
        SalesDocumentAddress,
        {
          documentId: quote.id,
          documentKind: "quote"
        },
        void 0,
        { tenantId: quote.tenantId, organizationId: quote.organizationId }
      ),
      findWithDecryption(
        em,
        SalesNote,
        { contextType: "quote", contextId: quote.id },
        void 0,
        { tenantId: quote.tenantId, organizationId: quote.organizationId }
      ),
      em.find(SalesDocumentTagAssignment, {
        documentId: quote.id,
        documentKind: "quote"
      }),
      em.find(SalesQuoteAdjustment, { quote: quote.id }),
      em.find(SalesQuoteLine, { quote: quote.id })
    ]);
    await withAtomicFlush(
      em,
      [
        async () => {
          await em.nativeDelete(SalesDocumentAddress, {
            documentId: quote.id,
            documentKind: "quote"
          });
          await em.nativeDelete(SalesNote, {
            contextType: "quote",
            contextId: quote.id
          });
          await em.nativeDelete(SalesDocumentTagAssignment, {
            documentId: quote.id,
            documentKind: "quote"
          });
          await em.nativeDelete(SalesQuoteAdjustment, { quote: quote.id });
          await em.nativeDelete(SalesQuoteLine, { quote: quote.id });
          em.remove(quote);
        }
      ],
      { transaction: true }
    );
    const dataEngine = ctx.container.resolve("dataEngine");
    await Promise.all([
      queueDeletionSideEffects(dataEngine, quote, E.sales.sales_quote),
      queueDeletionSideEffects(dataEngine, lines, E.sales.sales_quote_line),
      queueDeletionSideEffects(
        dataEngine,
        adjustments,
        E.sales.sales_quote_adjustment
      ),
      queueDeletionSideEffects(
        dataEngine,
        addresses,
        E.sales.sales_document_address
      ),
      queueDeletionSideEffects(dataEngine, notes, E.sales.sales_note),
      queueDeletionSideEffects(
        dataEngine,
        tags,
        E.sales.sales_document_tag_assignment
      )
    ]);
    return { quoteId: id };
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before;
    if (!before) return null;
    const { translate } = await resolveTranslations();
    return {
      actionLabel: translate("sales.audit.quotes.delete", "Delete sales quote"),
      resourceKind: "sales.quote",
      resourceId: before.quote.id,
      tenantId: before.quote.tenantId,
      organizationId: before.quote.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before
        }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const before = payload?.before;
    if (!before) return;
    await undoQuoteGraph(ctx, before, payload?.after);
  }
};
const updateQuoteCommand = {
  id: "sales.quotes.update",
  async prepare(input, ctx) {
    const parsed = documentUpdateSchema.parse(input ?? {});
    const em = ctx.container.resolve("em");
    const snapshot = await loadQuoteSnapshot(em, parsed.id);
    if (snapshot) {
      ensureQuoteScope(
        ctx,
        snapshot.quote.organizationId,
        snapshot.quote.tenantId
      );
    }
    return snapshot ? { before: snapshot } : {};
  },
  async execute(rawInput, ctx) {
    const parsed = documentUpdateSchema.parse(rawInput ?? {});
    const em = ctx.container.resolve("em").fork();
    const quote = await findOneWithDecryption(em, SalesQuote, {
      id: parsed.id,
      deletedAt: null
    });
    if (!quote)
      throw notFound("Sales quote not found");
    ensureQuoteScope(ctx, quote.organizationId, quote.tenantId);
    await enforceSalesDocumentOptimisticLock(ctx, quote, SALES_RESOURCE_KIND_QUOTE);
    const shouldInvalidateSentToken = (quote.status ?? null) === "sent";
    const shouldRecalculateTotals = parsed.shippingMethodId !== void 0 || parsed.shippingMethodSnapshot !== void 0 || parsed.shippingMethodCode !== void 0 || parsed.paymentMethodId !== void 0 || parsed.paymentMethodSnapshot !== void 0 || parsed.paymentMethodCode !== void 0 || parsed.currencyCode !== void 0;
    await withAtomicFlush(
      em,
      [
        async () => {
          await applyDocumentUpdate({
            kind: "quote",
            entity: quote,
            input: parsed,
            em
          });
          if (shouldInvalidateSentToken) {
            quote.acceptanceToken = null;
            quote.sentAt = null;
            quote.status = "draft";
            quote.statusEntryId = await resolveStatusEntryIdByValue(em, {
              tenantId: quote.tenantId,
              organizationId: quote.organizationId,
              value: "draft"
            });
          }
        },
        // Scalar mutations above are persisted by withAtomicFlush's per-phase
        // flush boundary before the recalc reads below run any query on the same
        // EntityManager. MikroORM v7 would otherwise silently discard pending
        // scalar changes on `quote` when the `em.find` line/adjustment lookups
        // reset the changeset (see SPEC-018).
        async () => {
          if (shouldRecalculateTotals) {
            const [existingLines, adjustments] = await Promise.all([
              em.find(
                SalesQuoteLine,
                { quote },
                { orderBy: { lineNumber: "asc" } }
              ),
              em.find(
                SalesQuoteAdjustment,
                { quote },
                { orderBy: { position: "asc" } }
              )
            ]);
            const lineSnapshots = existingLines.map(mapQuoteLineEntityToSnapshot);
            const calcLines = lineSnapshots.map(
              (line, index) => createLineSnapshotFromInput(
                {
                  ...line,
                  organizationId: quote.organizationId,
                  tenantId: quote.tenantId,
                  quoteId: quote.id,
                  lineNumber: line.lineNumber ?? index + 1,
                  statusEntryId: line.statusEntryId ?? null,
                  catalogSnapshot: line.catalogSnapshot ?? null,
                  promotionSnapshot: line.promotionSnapshot ?? null
                },
                line.lineNumber ?? index + 1
              )
            );
            const adjustmentDrafts = adjustments.map(mapQuoteAdjustmentToDraft);
            const salesCalculationService = ctx.container.resolve(
              "salesCalculationService"
            );
            const calculationContext = buildCalculationContext({
              tenantId: quote.tenantId,
              organizationId: quote.organizationId,
              currencyCode: quote.currencyCode,
              shippingSnapshot: quote.shippingMethodSnapshot,
              paymentSnapshot: quote.paymentMethodSnapshot,
              shippingMethodId: quote.shippingMethodId ?? null,
              paymentMethodId: quote.paymentMethodId ?? null,
              shippingMethodCode: quote.shippingMethodCode ?? null,
              paymentMethodCode: quote.paymentMethodCode ?? null
            });
            const calculation = await salesCalculationService.calculateDocumentTotals({
              documentKind: "quote",
              lines: calcLines,
              adjustments: adjustmentDrafts,
              context: calculationContext
            });
            const adjustmentInputs = adjustmentDrafts.map((adj, index) => ({
              organizationId: quote.organizationId,
              tenantId: quote.tenantId,
              quoteId: quote.id,
              scope: adj.scope ?? "order",
              kind: adj.kind ?? "custom",
              code: adj.code ?? void 0,
              label: adj.label ?? void 0,
              calculatorKey: adj.calculatorKey ?? void 0,
              promotionId: adj.promotionId ?? void 0,
              rate: adj.rate ?? void 0,
              amountNet: adj.amountNet ?? void 0,
              amountGross: adj.amountGross ?? void 0,
              currencyCode: adj.currencyCode ?? quote.currencyCode,
              metadata: adj.metadata ?? void 0,
              position: adj.position ?? index
            }));
            await replaceQuoteAdjustments(
              em,
              quote,
              calculation,
              adjustmentInputs
            );
            applyQuoteTotals(quote, calculation.totals, calculation.lines.length);
            let eventBus = null;
            try {
              eventBus = ctx.container.resolve("eventBus");
            } catch {
              eventBus = null;
            }
            await emitTotalsCalculated(eventBus, {
              documentKind: "quote",
              documentId: quote.id,
              organizationId: quote.organizationId,
              tenantId: quote.tenantId,
              customerId: quote.customerEntityId ?? null,
              totals: calculation.totals,
              lineCount: calculation.lines.length
            });
          }
          quote.updatedAt = /* @__PURE__ */ new Date();
        }
      ],
      { transaction: true }
    );
    const dataEngine = ctx.container.resolve("dataEngine");
    await emitCrudSideEffects({
      dataEngine,
      action: "updated",
      entity: quote,
      identifiers: {
        id: quote.id,
        organizationId: quote.organizationId,
        tenantId: quote.tenantId
      },
      indexer: { entityType: E.sales.sales_quote },
      actorUserId: ctx.auth?.sub ?? null
    });
    const resourceKind = deriveResourceFromCommandId(updateQuoteCommand.id) ?? "sales.quote";
    await invalidateCrudCache(
      ctx.container,
      resourceKind,
      {
        id: quote.id,
        organizationId: quote.organizationId,
        tenantId: quote.tenantId
      },
      ctx.auth?.tenantId ?? null,
      "updated"
    );
    return { quote };
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve("em").fork();
    return loadQuoteSnapshot(em, result.quote.id);
  },
  buildLog: async ({ input, snapshots, result }) => {
    const parsed = documentUpdateSchema.parse(input ?? {});
    const before = snapshots.before;
    const after = snapshots.after;
    if (!after) return null;
    const { translate } = await resolveTranslations();
    const changes = before ? buildChanges(
      before.quote,
      after.quote,
      buildDocumentUpdateChangeKeys("quote", parsed)
    ) : {};
    if (parsed.tags !== void 0) {
      const tagChange = buildTagChange(before?.tags, after.tags);
      if (tagChange) changes.tags = tagChange;
    }
    return {
      actionLabel: translate("sales.audit.quotes.update", "Update sales quote"),
      resourceKind: "sales.quote",
      resourceId: result.quote.id,
      tenantId: after.quote.tenantId,
      organizationId: after.quote.organizationId,
      snapshotBefore: before ?? null,
      snapshotAfter: after,
      changes: Object.keys(changes).length ? changes : null,
      payload: {
        undo: {
          before,
          after
        }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const before = payload?.before;
    if (!before) return;
    await undoQuoteGraph(ctx, before, payload?.after);
  }
};
const orderEntityOutputSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  orderNumber: z.string(),
  channelId: z.string().uuid().nullable().optional(),
  customerEntityId: z.string().uuid().nullable().optional(),
  currencyCode: z.string(),
  status: z.string().nullable().optional(),
  statusEntryId: z.string().uuid().nullable().optional(),
  fulfillmentStatus: z.string().nullable().optional(),
  paymentStatus: z.string().nullable().optional(),
  subtotalNetAmount: z.string(),
  subtotalGrossAmount: z.string(),
  discountTotalAmount: z.string(),
  taxTotalAmount: z.string(),
  grandTotalNetAmount: z.string(),
  grandTotalGrossAmount: z.string(),
  paidTotalAmount: z.string(),
  outstandingAmount: z.string(),
  lineItemCount: z.number(),
  placedAt: z.date().nullable().optional(),
  dueAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});
const orderUpdateOutputSchema = z.object({ order: orderEntityOutputSchema });
const orderIdOutputSchema = z.object({ orderId: z.string().uuid() });
const updateOrderCommand = {
  id: "sales.orders.update",
  outputSchema: orderUpdateOutputSchema,
  async prepare(input, ctx) {
    const parsed = documentUpdateSchema.parse(input ?? {});
    const em = ctx.container.resolve("em");
    const snapshot = await loadOrderSnapshot(em, parsed.id);
    if (snapshot) {
      ensureOrderScope(
        ctx,
        snapshot.order.organizationId,
        snapshot.order.tenantId
      );
    }
    return snapshot ? { before: snapshot } : {};
  },
  async execute(rawInput, ctx) {
    const parsed = documentUpdateSchema.parse(rawInput ?? {});
    const em = ctx.container.resolve("em").fork();
    const order = await findOneWithDecryption(em, SalesOrder, {
      id: parsed.id,
      deletedAt: null
    });
    if (!order)
      throw notFound("Sales order not found");
    ensureOrderScope(ctx, order.organizationId, order.tenantId);
    await enforceSalesDocumentOptimisticLock(ctx, order, SALES_RESOURCE_KIND_ORDER);
    const previousStatus = normalizeStatusValue(order.status);
    let statusChangeNote = null;
    const shouldRecalculateTotals = parsed.shippingMethodId !== void 0 || parsed.shippingMethodSnapshot !== void 0 || parsed.shippingMethodCode !== void 0 || parsed.paymentMethodId !== void 0 || parsed.paymentMethodSnapshot !== void 0 || parsed.paymentMethodCode !== void 0 || parsed.currencyCode !== void 0;
    await withAtomicFlush(
      em,
      [
        async () => {
          await applyDocumentUpdate({
            kind: "order",
            entity: order,
            input: parsed,
            em
          });
        },
        // Scalar mutations above are persisted by withAtomicFlush's per-phase
        // flush boundary before the recalc reads and the status-change-note
        // lookup below run any query on the same EntityManager. MikroORM v7 would
        // otherwise silently discard pending scalar changes on `order` when the
        // `em.find` lines/adjustments or appendOrderStatusChangeNote queries
        // reset the changeset (see SPEC-018).
        async () => {
          if (shouldRecalculateTotals) {
            const [existingLines, adjustments] = await Promise.all([
              em.find(
                SalesOrderLine,
                { order },
                { orderBy: { lineNumber: "asc" } }
              ),
              em.find(
                SalesOrderAdjustment,
                { order },
                { orderBy: { position: "asc" } }
              )
            ]);
            const lineSnapshots = existingLines.map(mapOrderLineEntityToSnapshot);
            const calcLines = lineSnapshots.map(
              (line, index) => createLineSnapshotFromInput(
                {
                  ...line,
                  organizationId: order.organizationId,
                  tenantId: order.tenantId,
                  orderId: order.id,
                  lineNumber: line.lineNumber ?? index + 1,
                  statusEntryId: line.statusEntryId ?? null,
                  catalogSnapshot: line.catalogSnapshot ?? null,
                  promotionSnapshot: line.promotionSnapshot ?? null
                },
                line.lineNumber ?? index + 1
              )
            );
            const adjustmentDrafts = adjustments.map(mapOrderAdjustmentToDraft);
            const salesCalculationService = ctx.container.resolve(
              "salesCalculationService"
            );
            const calculationContext = buildCalculationContext({
              tenantId: order.tenantId,
              organizationId: order.organizationId,
              currencyCode: order.currencyCode,
              shippingSnapshot: order.shippingMethodSnapshot,
              paymentSnapshot: order.paymentMethodSnapshot,
              shippingMethodId: order.shippingMethodId ?? null,
              paymentMethodId: order.paymentMethodId ?? null,
              shippingMethodCode: order.shippingMethodCode ?? null,
              paymentMethodCode: order.paymentMethodCode ?? null
            });
            const calculation = await salesCalculationService.calculateDocumentTotals({
              documentKind: "order",
              lines: calcLines,
              adjustments: adjustmentDrafts,
              context: calculationContext,
              existingTotals: resolveExistingPaymentTotals(order)
            });
            const adjustmentInputs = adjustmentDrafts.map((adj, index) => ({
              organizationId: order.organizationId,
              tenantId: order.tenantId,
              orderId: order.id,
              scope: adj.scope ?? "order",
              kind: adj.kind ?? "custom",
              code: adj.code ?? void 0,
              label: adj.label ?? void 0,
              calculatorKey: adj.calculatorKey ?? void 0,
              promotionId: adj.promotionId ?? void 0,
              rate: adj.rate ?? void 0,
              amountNet: adj.amountNet ?? void 0,
              amountGross: adj.amountGross ?? void 0,
              currencyCode: adj.currencyCode ?? order.currencyCode,
              metadata: adj.metadata ?? void 0,
              position: adj.position ?? index
            }));
            await replaceOrderAdjustments(
              em,
              order,
              calculation,
              adjustmentInputs
            );
            applyOrderTotals(order, calculation.totals, calculation.lines.length);
            let eventBus = null;
            try {
              eventBus = ctx.container.resolve("eventBus");
            } catch {
              eventBus = null;
            }
            await emitTotalsCalculated(eventBus, {
              documentKind: "order",
              documentId: order.id,
              organizationId: order.organizationId,
              tenantId: order.tenantId,
              customerId: order.customerEntityId ?? null,
              totals: calculation.totals,
              lineCount: calculation.lines.length
            });
          }
          statusChangeNote = await appendOrderStatusChangeNote({
            em,
            order,
            previousStatus,
            auth: ctx.auth ?? null
          });
          order.updatedAt = /* @__PURE__ */ new Date();
        }
      ],
      { transaction: true }
    );
    emitOrderLifecycleEventsForTransition({ order, previousStatus });
    const dataEngine = ctx.container.resolve("dataEngine");
    await emitCrudSideEffects({
      dataEngine,
      action: "updated",
      entity: order,
      identifiers: {
        id: order.id,
        organizationId: order.organizationId,
        tenantId: order.tenantId
      },
      indexer: { entityType: E.sales.sales_order },
      actorUserId: ctx.auth?.sub ?? null
    });
    if (statusChangeNote) {
      await emitCrudSideEffects({
        dataEngine,
        action: "created",
        entity: statusChangeNote,
        identifiers: {
          id: statusChangeNote.id,
          organizationId: statusChangeNote.organizationId,
          tenantId: statusChangeNote.tenantId
        },
        indexer: { entityType: E.sales.sales_note }
      });
    }
    const resourceKind = deriveResourceFromCommandId(updateOrderCommand.id) ?? "sales.order";
    await invalidateCrudCache(
      ctx.container,
      resourceKind,
      {
        id: order.id,
        organizationId: order.organizationId,
        tenantId: order.tenantId
      },
      ctx.auth?.tenantId ?? null,
      "updated"
    );
    return { order };
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve("em").fork();
    return loadOrderSnapshot(em, result.order.id);
  },
  buildLog: async ({ input, snapshots, result }) => {
    const parsed = documentUpdateSchema.parse(input ?? {});
    const before = snapshots.before;
    const after = snapshots.after;
    if (!after) return null;
    const { translate } = await resolveTranslations();
    const changes = before ? buildChanges(
      before.order,
      after.order,
      buildDocumentUpdateChangeKeys("order", parsed)
    ) : {};
    if (parsed.tags !== void 0) {
      const tagChange = buildTagChange(before?.tags, after.tags);
      if (tagChange) changes.tags = tagChange;
    }
    return {
      actionLabel: translate("sales.audit.orders.update", "Update sales order"),
      resourceKind: "sales.order",
      resourceId: result.order.id,
      tenantId: after.order.tenantId,
      organizationId: after.order.organizationId,
      snapshotBefore: before ?? null,
      snapshotAfter: after,
      changes: Object.keys(changes).length ? changes : null,
      payload: {
        undo: {
          before,
          after
        }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const before = payload?.before;
    if (!before) return;
    await undoOrderGraph(ctx, before, payload?.after);
  }
};
const createOrderCommand = {
  id: "sales.orders.create",
  outputSchema: orderIdOutputSchema,
  async execute(rawInput, ctx) {
    const generator = ctx.container.resolve(
      "salesDocumentNumberGenerator"
    );
    const deprecatedPaymentLedgerFields = resolveSuppliedOrderPaymentLedgerFields(rawInput);
    const initial = orderCreateSchema.parse(rawInput ?? {});
    if (deprecatedPaymentLedgerFields.length && !warnedDeprecatedOrderPaymentLedgerInput) {
      warnedDeprecatedOrderPaymentLedgerInput = true;
      logger.warn("sales.orders.create ignored deprecated payment ledger input", {
        code: ORDER_PAYMENT_LEDGER_WARNING_CODE,
        fields: deprecatedPaymentLedgerFields
      });
    }
    const orderNumber = typeof initial.orderNumber === "string" && initial.orderNumber.trim().length ? initial.orderNumber.trim() : (await generator.generate({
      kind: "order",
      organizationId: initial.organizationId,
      tenantId: initial.tenantId
    })).number;
    const parsed = orderCreateSchema.parse({ ...initial, orderNumber });
    const ensuredOrderNumber = parsed.orderNumber ?? orderNumber;
    if (!ensuredOrderNumber) {
      throw new CrudHttpError(400, { error: "Order number is required." });
    }
    ensureOrderScope(ctx, parsed.organizationId, parsed.tenantId);
    const em = ctx.container.resolve("em").fork();
    const dictionaryCache = ctx.container.resolve("cache", { allowUnregistered: true });
    const [status, fulfillmentStatus, paymentStatus] = await Promise.all([
      resolveCachedDictionaryEntryValue(em, parsed.statusEntryId ?? null, { tenantId: parsed.tenantId }, dictionaryCache),
      resolveCachedDictionaryEntryValue(em, parsed.fulfillmentStatusEntryId ?? null, { tenantId: parsed.tenantId }, dictionaryCache),
      resolveCachedDictionaryEntryValue(em, parsed.paymentStatusEntryId ?? null, { tenantId: parsed.tenantId }, dictionaryCache)
    ]);
    const {
      customerSnapshot: resolvedCustomerSnapshot,
      billingAddressSnapshot: resolvedBillingSnapshot,
      shippingAddressSnapshot: resolvedShippingSnapshot,
      shippingMethod,
      deliveryWindow,
      paymentMethod
    } = await resolveDocumentReferences(em, parsed);
    const orderId = randomUUID();
    const order = em.create(SalesOrder, {
      id: orderId,
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      orderNumber: ensuredOrderNumber,
      externalReference: parsed.externalReference ?? null,
      customerReference: parsed.customerReference ?? null,
      statusEntryId: parsed.statusEntryId ?? null,
      status,
      fulfillmentStatusEntryId: parsed.fulfillmentStatusEntryId ?? null,
      fulfillmentStatus,
      paymentStatusEntryId: parsed.paymentStatusEntryId ?? null,
      paymentStatus,
      customerEntityId: parsed.customerEntityId ?? null,
      customerContactId: parsed.customerContactId ?? null,
      customerSnapshot: resolvedCustomerSnapshot ? cloneJson(resolvedCustomerSnapshot) : null,
      billingAddressId: parsed.billingAddressId ?? null,
      shippingAddressId: parsed.shippingAddressId ?? null,
      billingAddressSnapshot: resolvedBillingSnapshot ? cloneJson(resolvedBillingSnapshot) : null,
      shippingAddressSnapshot: resolvedShippingSnapshot ? cloneJson(resolvedShippingSnapshot) : null,
      currencyCode: parsed.currencyCode,
      exchangeRate: typeof parsed.exchangeRate === "number" ? toNumericString(parsed.exchangeRate) : null,
      taxStrategyKey: parsed.taxStrategyKey ?? null,
      discountStrategyKey: parsed.discountStrategyKey ?? null,
      taxInfo: parsed.taxInfo ? cloneJson(parsed.taxInfo) : null,
      shippingMethodId: parsed.shippingMethodId ?? null,
      shippingMethod: shippingMethod ?? null,
      shippingMethodCode: parsed.shippingMethodCode ?? shippingMethod?.code ?? null,
      deliveryWindowId: parsed.deliveryWindowId ?? null,
      deliveryWindow: deliveryWindow ?? null,
      deliveryWindowCode: parsed.deliveryWindowCode ?? deliveryWindow?.code ?? null,
      paymentMethodId: parsed.paymentMethodId ?? null,
      paymentMethod: paymentMethod ?? null,
      paymentMethodCode: parsed.paymentMethodCode ?? paymentMethod?.code ?? null,
      channelId: parsed.channelId ?? null,
      placedAt: parsed.placedAt ?? null,
      expectedDeliveryAt: parsed.expectedDeliveryAt ?? null,
      dueAt: parsed.dueAt ?? null,
      comments: parsed.comments ?? null,
      internalNotes: parsed.internalNotes ?? null,
      shippingMethodSnapshot: parsed.shippingMethodSnapshot ? cloneJson(parsed.shippingMethodSnapshot) : shippingMethod ? {
        id: shippingMethod.id,
        code: shippingMethod.code,
        name: shippingMethod.name,
        description: shippingMethod.description ?? null,
        carrierCode: shippingMethod.carrierCode ?? null,
        providerKey: shippingMethod.providerKey ?? null,
        serviceLevel: shippingMethod.serviceLevel ?? null,
        estimatedTransitDays: shippingMethod.estimatedTransitDays ?? null,
        baseRateNet: shippingMethod.baseRateNet,
        baseRateGross: shippingMethod.baseRateGross,
        currencyCode: shippingMethod.currencyCode ?? null,
        metadata: shippingMethod.metadata ? cloneJson(shippingMethod.metadata) : null,
        providerSettings: shippingMethod.metadata && typeof shippingMethod.metadata === "object" ? cloneJson(
          shippingMethod.metadata.providerSettings ?? null
        ) : null
      } : null,
      deliveryWindowSnapshot: parsed.deliveryWindowSnapshot ? cloneJson(parsed.deliveryWindowSnapshot) : deliveryWindow ? {
        id: deliveryWindow.id,
        code: deliveryWindow.code,
        name: deliveryWindow.name,
        description: deliveryWindow.description ?? null,
        leadTimeDays: deliveryWindow.leadTimeDays ?? null,
        cutoffTime: deliveryWindow.cutoffTime ?? null,
        timezone: deliveryWindow.timezone ?? null
      } : null,
      paymentMethodSnapshot: parsed.paymentMethodSnapshot ? cloneJson(parsed.paymentMethodSnapshot) : paymentMethod ? {
        id: paymentMethod.id,
        code: paymentMethod.code,
        name: paymentMethod.name,
        description: paymentMethod.description ?? null,
        providerKey: paymentMethod.providerKey ?? null,
        terms: paymentMethod.terms ?? null,
        metadata: paymentMethod.metadata ? cloneJson(paymentMethod.metadata) : null,
        providerSettings: paymentMethod.metadata && typeof paymentMethod.metadata === "object" ? cloneJson(
          paymentMethod.metadata.providerSettings ?? null
        ) : null
      } : null,
      metadata: parsed.metadata ? cloneJson(parsed.metadata) : null,
      customFieldSetId: parsed.customFieldSetId ?? null,
      subtotalNetAmount: "0",
      subtotalGrossAmount: "0",
      discountTotalAmount: "0",
      taxTotalAmount: "0",
      shippingNetAmount: "0",
      shippingGrossAmount: "0",
      surchargeTotalAmount: "0",
      grandTotalNetAmount: "0",
      grandTotalGrossAmount: "0",
      paidTotalAmount: "0",
      refundedTotalAmount: "0",
      outstandingAmount: "0",
      lineItemCount: 0,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    const lineInputs = (parsed.lines ?? []).map(
      (line, index) => orderLineCreateSchema.parse({
        ...line,
        organizationId: parsed.organizationId,
        tenantId: parsed.tenantId,
        orderId: order.id,
        lineNumber: line.lineNumber ?? index + 1
      })
    );
    const uomResolver = createUomResolver();
    const normalizedLineInputs = await Promise.all(
      lineInputs.map(async (line) => {
        const normalized = await normalizeLineUom({
          em,
          resolver: uomResolver,
          organizationId: parsed.organizationId,
          tenantId: parsed.tenantId,
          line
        });
        return {
          ...line,
          quantity: normalized.quantity,
          quantityUnit: normalized.quantityUnit,
          normalizedQuantity: normalized.normalizedQuantity,
          normalizedUnit: normalized.normalizedUnit,
          uomSnapshot: normalized.uomSnapshot
        };
      })
    );
    const adjustmentInputs = parsed.adjustments ? parsed.adjustments.map(
      (adj) => orderAdjustmentCreateSchema.parse({
        ...adj,
        organizationId: parsed.organizationId,
        tenantId: parsed.tenantId,
        orderId: order.id
      })
    ) : null;
    const lineSnapshots = normalizedLineInputs.map(
      (line, index) => createLineSnapshotFromInput(line, line.lineNumber ?? index + 1)
    );
    const adjustmentDrafts = adjustmentInputs ? adjustmentInputs.map((adj) => createAdjustmentDraftFromInput(adj)) : [];
    const salesCalculationService = ctx.container.resolve("salesCalculationService");
    const calculationContext = buildCalculationContext({
      tenantId: order.tenantId,
      organizationId: order.organizationId,
      currencyCode: order.currencyCode,
      shippingSnapshot: order.shippingMethodSnapshot,
      paymentSnapshot: order.paymentMethodSnapshot,
      shippingMethodId: order.shippingMethodId ?? null,
      paymentMethodId: order.paymentMethodId ?? null,
      shippingMethodCode: order.shippingMethodCode ?? null,
      paymentMethodCode: order.paymentMethodCode ?? null
    });
    const calculation = await salesCalculationService.calculateDocumentTotals({
      documentKind: "order",
      lines: lineSnapshots,
      adjustments: adjustmentDrafts,
      context: calculationContext,
      existingTotals: resolveExistingPaymentTotals(order)
    });
    let eventBus = null;
    try {
      eventBus = ctx.container.resolve("eventBus");
    } catch {
      eventBus = null;
    }
    await withAtomicFlush(
      em,
      [
        async () => {
          em.persist(order);
          await replaceOrderLines(em, order, calculation, normalizedLineInputs);
          await replaceOrderAdjustments(
            em,
            order,
            calculation,
            adjustmentInputs
          );
          applyOrderTotals(order, calculation.totals, calculation.lines.length);
          await emitTotalsCalculated(eventBus, {
            documentKind: "order",
            documentId: order.id,
            organizationId: order.organizationId,
            tenantId: order.tenantId,
            customerId: order.customerEntityId ?? null,
            totals: calculation.totals,
            lineCount: calculation.lines.length
          });
          await syncSalesDocumentTags(em, {
            documentId: order.id,
            kind: "order",
            organizationId: order.organizationId,
            tenantId: order.tenantId,
            tagIds: parsed.tags
          });
          await setDocumentCustomFieldsIfSupplied(em, {
            entityId: E.sales.sales_order,
            recordId: order.id,
            organizationId: order.organizationId,
            tenantId: order.tenantId,
            customFields: parsed.customFields
          });
        }
      ],
      { transaction: true }
    );
    try {
      const notificationService = resolveNotificationService(ctx.container);
      const typeDef = notificationTypes.find(
        (type) => type.type === "sales.order.created"
      );
      if (typeDef) {
        const totalAmount = order.grandTotalGrossAmount && order.currencyCode ? `${order.grandTotalGrossAmount} ${order.currencyCode}` : "";
        const totalDisplay = totalAmount ? ` (${totalAmount})` : "";
        const notificationInput = buildFeatureNotificationFromType(typeDef, {
          requiredFeature: "sales.orders.manage",
          bodyVariables: {
            orderNumber: order.orderNumber,
            total: totalDisplay,
            totalAmount
          },
          sourceEntityType: "sales:order",
          sourceEntityId: order.id,
          linkHref: `/backend/sales/orders/${order.id}`
        });
        if (!ctx.bulkImport?.skipNotifications) {
          await notificationService.createForFeature(notificationInput, {
            tenantId: order.tenantId,
            organizationId: order.organizationId ?? null
          });
        }
      }
    } catch (err) {
      logger.error("sales.orders.create failed to create notification", { err });
    }
    const dataEngine = ctx.container.resolve("dataEngine");
    await emitCrudSideEffects({
      dataEngine,
      action: "created",
      entity: order,
      identifiers: {
        id: order.id,
        organizationId: order.organizationId,
        tenantId: order.tenantId
      },
      events: orderCrudEvents,
      indexer: { entityType: E.sales.sales_order },
      actorUserId: ctx.auth?.sub ?? null
    });
    const resourceKind = deriveResourceFromCommandId(createOrderCommand.id) ?? "sales.order";
    await invalidateCrudCache(
      ctx.container,
      resourceKind,
      {
        id: order.id,
        organizationId: order.organizationId,
        tenantId: order.tenantId
      },
      ctx.auth?.tenantId ?? null,
      "created"
    );
    emitOrderLifecycleEventsForTransition({
      order,
      previousStatus: null
    });
    return {
      orderId: order.id,
      ...deprecatedPaymentLedgerFields.length ? {
        warnings: [
          {
            code: ORDER_PAYMENT_LEDGER_WARNING_CODE,
            fields: deprecatedPaymentLedgerFields
          }
        ]
      } : {}
    };
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve("em").fork();
    return loadOrderSnapshot(em, result.orderId);
  },
  buildLog: async ({ result, snapshots }) => {
    const after = snapshots.after;
    if (!after) return null;
    const { translate } = await resolveTranslations();
    return {
      actionLabel: translate("sales.audit.orders.create", "Create sales order"),
      resourceKind: "sales.order",
      resourceId: result.orderId,
      tenantId: after.order.tenantId,
      organizationId: after.order.organizationId,
      snapshotAfter: after,
      payload: {
        undo: {
          after
        }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const after = payload?.after;
    if (!after) return;
    ensureOrderScope(ctx, after.order.organizationId, after.order.tenantId);
    await withVerifiedOrderGraph(
      ctx,
      after,
      {
        orderId: after.order.id,
        tenantId: after.order.tenantId,
        organizationId: after.order.organizationId
      },
      async (tx, exists) => {
        if (!exists) return;
        const order = await findOneWithDecryption(
          tx,
          SalesOrder,
          { id: after.order.id },
          {},
          {
            tenantId: after.order.tenantId,
            organizationId: after.order.organizationId
          }
        );
        if (!order) return;
        await tx.nativeDelete(SalesOrderAdjustment, { order: order.id });
        await tx.nativeDelete(SalesOrderLine, { order: order.id });
        tx.remove(order);
        await tx.flush();
      }
    );
  }
};
const deleteOrderCommand = {
  id: "sales.orders.delete",
  outputSchema: orderIdOutputSchema,
  async prepare(input, ctx) {
    const id = requireId(input, "Order id is required");
    const em = ctx.container.resolve("em");
    const snapshot = await loadOrderSnapshot(em, id);
    if (snapshot) {
      ensureOrderScope(
        ctx,
        snapshot.order.organizationId,
        snapshot.order.tenantId
      );
    }
    return snapshot ? { before: snapshot } : {};
  },
  async execute(input, ctx) {
    const id = requireId(input, "Order id is required");
    const em = ctx.container.resolve("em").fork();
    const order = await findOneWithDecryption(em, SalesOrder, { id });
    if (!order)
      throw notFound("Sales order not found");
    ensureOrderScope(ctx, order.organizationId, order.tenantId);
    const shipments = await em.find(SalesShipment, { order: order.id });
    const shipmentIds = shipments.map((entry) => entry.id);
    const [
      shipmentItems,
      payments,
      paymentAllocations,
      addresses,
      notes,
      tags,
      adjustments,
      lines
    ] = await Promise.all([
      shipmentIds.length ? em.find(SalesShipmentItem, { shipment: { $in: shipmentIds } }) : Promise.resolve([]),
      em.find(SalesPayment, { order: order.id }),
      em.find(SalesPaymentAllocation, { order: order.id }),
      findWithDecryption(
        em,
        SalesDocumentAddress,
        {
          documentId: order.id,
          documentKind: "order"
        },
        void 0,
        { tenantId: order.tenantId, organizationId: order.organizationId }
      ),
      findWithDecryption(
        em,
        SalesNote,
        { contextType: "order", contextId: order.id },
        void 0,
        { tenantId: order.tenantId, organizationId: order.organizationId }
      ),
      em.find(SalesDocumentTagAssignment, {
        documentId: order.id,
        documentKind: "order"
      }),
      em.find(SalesOrderAdjustment, { order: order.id }),
      em.find(SalesOrderLine, { order: order.id })
    ]);
    await withAtomicFlush(
      em,
      [
        async () => {
          if (shipmentIds.length) {
            await em.nativeDelete(SalesShipmentItem, {
              shipment: { $in: shipmentIds }
            });
            await em.nativeDelete(SalesShipment, { id: { $in: shipmentIds } });
          }
          await em.nativeDelete(SalesPaymentAllocation, { order: order.id });
          await em.nativeDelete(SalesPayment, { order: order.id });
          await em.nativeDelete(SalesDocumentAddress, {
            documentId: order.id,
            documentKind: "order"
          });
          await em.nativeDelete(SalesNote, {
            contextType: "order",
            contextId: order.id
          });
          await em.nativeDelete(SalesDocumentTagAssignment, {
            documentId: order.id,
            documentKind: "order"
          });
          await em.nativeDelete(SalesOrderAdjustment, { order: order.id });
          await em.nativeDelete(SalesOrderLine, { order: order.id });
          em.remove(order);
        }
      ],
      { transaction: true }
    );
    const dataEngine = ctx.container.resolve("dataEngine");
    await Promise.all([
      queueDeletionSideEffects(dataEngine, order, E.sales.sales_order),
      queueDeletionSideEffects(dataEngine, lines, E.sales.sales_order_line),
      queueDeletionSideEffects(
        dataEngine,
        adjustments,
        E.sales.sales_order_adjustment
      ),
      queueDeletionSideEffects(dataEngine, shipments, E.sales.sales_shipment),
      queueDeletionSideEffects(
        dataEngine,
        shipmentItems,
        E.sales.sales_shipment_item
      ),
      queueDeletionSideEffects(dataEngine, payments, E.sales.sales_payment),
      queueDeletionSideEffects(
        dataEngine,
        paymentAllocations,
        E.sales.sales_payment_allocation
      ),
      queueDeletionSideEffects(
        dataEngine,
        addresses,
        E.sales.sales_document_address
      ),
      queueDeletionSideEffects(dataEngine, notes, E.sales.sales_note),
      queueDeletionSideEffects(
        dataEngine,
        tags,
        E.sales.sales_document_tag_assignment
      )
    ]);
    return { orderId: id };
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before;
    if (!before) return null;
    const { translate } = await resolveTranslations();
    return {
      actionLabel: translate("sales.audit.orders.delete", "Delete sales order"),
      resourceKind: "sales.order",
      resourceId: before.order.id,
      tenantId: before.order.tenantId,
      organizationId: before.order.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before
        }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const before = payload?.before;
    if (!before) return;
    await undoOrderGraph(ctx, before, payload?.after);
  }
};
const quoteConvertToOrderSchema = z.object({
  quoteId: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  orderNumber: z.string().trim().max(191).optional()
});
function assertConvertibleStatus(quote, translate) {
  const status = typeof quote.status === "string" ? quote.status.trim().toLowerCase() : "";
  if (status === "sent" || status === "accepted") return;
  throw new CrudHttpError(409, {
    error: translate(
      "sales.documents.detail.convertNotAccepted",
      status ? `\u62A5\u4EF7\u5355\u5F53\u524D\u72B6\u6001\u4E3A\u300C${quote.status}\u300D\uFF0C\u9700\u5148\u53D1\u9001\u5E76\u786E\u8BA4\u540E\u624D\u80FD\u8F6C\u8BA2\u5355\u3002` : "\u62A5\u4EF7\u5355\u5C1A\u672A\u53D1\u9001\uFF0C\u9700\u5148\u53D1\u9001\u5E76\u786E\u8BA4\u540E\u624D\u80FD\u8F6C\u8BA2\u5355\u3002"
    )
  });
}
const convertQuoteToOrderCommand = {
  id: "sales.quotes.convert_to_order",
  async prepare(input, ctx) {
    const parsed = quoteConvertToOrderSchema.safeParse(input ?? {});
    const quoteId = parsed.success ? parsed.data.quoteId : typeof input?.quoteId === "string" ? input.quoteId : null;
    if (!quoteId) return {};
    const em = ctx.container.resolve("em");
    const snapshot = await loadQuoteSnapshot(em, quoteId);
    if (snapshot)
      ensureQuoteScope(
        ctx,
        snapshot.quote.organizationId,
        snapshot.quote.tenantId
      );
    return snapshot ? { before: snapshot } : {};
  },
  async execute(rawInput, ctx) {
    const payload = quoteConvertToOrderSchema.parse(rawInput ?? {});
    const callerEm = ctx.transactionalEm;
    const rootEm = callerEm ?? ctx.container.resolve("em").fork();
    const transactionalEm = rootEm;
    const runConversion = async (em) => {
      const quote = await findOneWithDecryption(
        em,
        SalesQuote,
        {
          id: payload.quoteId,
          deletedAt: null
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE }
      );
      const { translate } = await resolveTranslations();
      if (!quote)
        throw notFound(translate(
          "sales.documents.detail.error",
          "Document not found or inaccessible."
        ));
      ensureQuoteScope(ctx, quote.organizationId, quote.tenantId);
      await enforceSalesDocumentOptimisticLock(ctx, quote, SALES_RESOURCE_KIND_QUOTE);
      const snapshot = await loadQuoteSnapshot(em, payload.quoteId);
      if (!snapshot)
        throw notFound(translate(
          "sales.documents.detail.error",
          "Document not found or inaccessible."
        ));
      assertConvertibleStatus(quote, translate);
      const orderId = payload.orderId ?? quote.id;
      const existingOrder = await findOneWithDecryption(em, SalesOrder, {
        id: orderId,
        deletedAt: null
      }, void 0, { tenantId: quote.tenantId, organizationId: quote.organizationId });
      if (existingOrder) {
        throw new CrudHttpError(409, {
          error: translate(
            "sales.documents.detail.convertExists",
            "Order already exists for this quote."
          )
        });
      }
      const generator = ctx.container.resolve(
        "salesDocumentNumberGenerator"
      );
      const generatedNumber = (await generator.generate({
        kind: "order",
        organizationId: snapshot.quote.organizationId,
        tenantId: snapshot.quote.tenantId
      })).number;
      const orderNumber = typeof payload.orderNumber === "string" && payload.orderNumber.trim().length ? payload.orderNumber.trim() : generatedNumber;
      const [quoteCustomFields, quoteLineCustomFields] = await Promise.all([
        loadCustomFieldValues({
          em,
          entityId: E.sales.sales_quote,
          recordIds: [snapshot.quote.id],
          tenantIdByRecord: { [snapshot.quote.id]: snapshot.quote.tenantId },
          organizationIdByRecord: {
            [snapshot.quote.id]: snapshot.quote.organizationId
          }
        }),
        snapshot.lines.length ? loadCustomFieldValues({
          em,
          entityId: E.sales.sales_quote_line,
          recordIds: snapshot.lines.map((line) => line.id),
          tenantIdByRecord: Object.fromEntries(
            snapshot.lines.map((line) => [line.id, snapshot.quote.tenantId])
          ),
          organizationIdByRecord: Object.fromEntries(
            snapshot.lines.map((line) => [
              line.id,
              snapshot.quote.organizationId
            ])
          )
        }) : Promise.resolve({})
      ]);
      const order = em.create(SalesOrder, {
        id: orderId,
        organizationId: snapshot.quote.organizationId,
        tenantId: snapshot.quote.tenantId,
        orderNumber,
        statusEntryId: snapshot.quote.statusEntryId ?? null,
        status: snapshot.quote.status ?? null,
        fulfillmentStatusEntryId: null,
        fulfillmentStatus: null,
        paymentStatusEntryId: null,
        paymentStatus: null,
        customerEntityId: snapshot.quote.customerEntityId ?? null,
        customerContactId: snapshot.quote.customerContactId ?? null,
        customerSnapshot: snapshot.quote.customerSnapshot ? cloneJson(snapshot.quote.customerSnapshot) : null,
        billingAddressId: snapshot.quote.billingAddressId ?? null,
        shippingAddressId: snapshot.quote.shippingAddressId ?? null,
        billingAddressSnapshot: snapshot.quote.billingAddressSnapshot ? cloneJson(snapshot.quote.billingAddressSnapshot) : null,
        shippingAddressSnapshot: snapshot.quote.shippingAddressSnapshot ? cloneJson(snapshot.quote.shippingAddressSnapshot) : null,
        currencyCode: snapshot.quote.currencyCode,
        exchangeRate: null,
        taxStrategyKey: null,
        discountStrategyKey: null,
        taxInfo: snapshot.quote.taxInfo ? cloneJson(snapshot.quote.taxInfo) : null,
        shippingMethodId: snapshot.quote.shippingMethodId ?? null,
        shippingMethodCode: snapshot.quote.shippingMethodCode ?? null,
        deliveryWindowId: snapshot.quote.deliveryWindowId ?? null,
        deliveryWindowCode: snapshot.quote.deliveryWindowCode ?? null,
        paymentMethodId: snapshot.quote.paymentMethodId ?? null,
        paymentMethodCode: snapshot.quote.paymentMethodCode ?? null,
        channelId: snapshot.quote.channelId ?? null,
        placedAt: snapshot.quote.validFrom ? new Date(snapshot.quote.validFrom) : quote.createdAt,
        expectedDeliveryAt: snapshot.quote.validUntil ? new Date(snapshot.quote.validUntil) : null,
        dueAt: null,
        comments: snapshot.quote.comments ?? null,
        internalNotes: null,
        shippingMethodSnapshot: snapshot.quote.shippingMethodSnapshot ? cloneJson(snapshot.quote.shippingMethodSnapshot) : null,
        deliveryWindowSnapshot: snapshot.quote.deliveryWindowSnapshot ? cloneJson(snapshot.quote.deliveryWindowSnapshot) : null,
        paymentMethodSnapshot: snapshot.quote.paymentMethodSnapshot ? cloneJson(snapshot.quote.paymentMethodSnapshot) : null,
        metadata: snapshot.quote.metadata ? cloneJson(snapshot.quote.metadata) : null,
        customFieldSetId: snapshot.quote.customFieldSetId ?? null,
        subtotalNetAmount: snapshot.quote.subtotalNetAmount,
        subtotalGrossAmount: snapshot.quote.subtotalGrossAmount,
        discountTotalAmount: snapshot.quote.discountTotalAmount,
        taxTotalAmount: snapshot.quote.taxTotalAmount,
        shippingNetAmount: "0",
        shippingGrossAmount: "0",
        surchargeTotalAmount: "0",
        grandTotalNetAmount: snapshot.quote.grandTotalNetAmount,
        grandTotalGrossAmount: snapshot.quote.grandTotalGrossAmount,
        paidTotalAmount: "0",
        refundedTotalAmount: "0",
        outstandingAmount: snapshot.quote.grandTotalGrossAmount,
        totalsSnapshot: snapshot.quote.totalsSnapshot ? cloneJson(snapshot.quote.totalsSnapshot) : null,
        lineItemCount: snapshot.quote.lineItemCount,
        createdAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
      });
      em.persist(order);
      const orderLineMap = /* @__PURE__ */ new Map();
      snapshot.lines.forEach((line, index) => {
        const orderLine = em.create(SalesOrderLine, {
          id: line.id,
          order,
          organizationId: snapshot.quote.organizationId,
          tenantId: snapshot.quote.tenantId,
          lineNumber: line.lineNumber ?? index + 1,
          kind: line.kind,
          statusEntryId: line.statusEntryId ?? null,
          status: line.status ?? null,
          productId: line.productId ?? null,
          productVariantId: line.productVariantId ?? null,
          catalogSnapshot: line.catalogSnapshot ? cloneJson(line.catalogSnapshot) : null,
          name: line.name ?? null,
          description: line.description ?? null,
          comment: line.comment ?? null,
          quantity: line.quantity,
          quantityUnit: line.quantityUnit ?? null,
          normalizedQuantity: line.normalizedQuantity ?? line.quantity,
          normalizedUnit: line.normalizedUnit ?? line.quantityUnit ?? null,
          uomSnapshot: line.uomSnapshot ? cloneJson(line.uomSnapshot) : null,
          reservedQuantity: "0",
          fulfilledQuantity: "0",
          invoicedQuantity: "0",
          returnedQuantity: "0",
          currencyCode: line.currencyCode,
          unitPriceNet: line.unitPriceNet,
          unitPriceGross: line.unitPriceGross,
          discountAmount: line.discountAmount,
          discountPercent: line.discountPercent,
          taxRate: line.taxRate,
          taxAmount: line.taxAmount,
          totalNetAmount: toNumericString(
            deriveLineNetFromGross(line.totalNetAmount, line.totalGrossAmount, line.taxRate)
          ),
          totalGrossAmount: line.totalGrossAmount,
          configuration: line.configuration ? cloneJson(line.configuration) : null,
          promotionCode: line.promotionCode ?? null,
          promotionSnapshot: line.promotionSnapshot ? cloneJson(line.promotionSnapshot) : null,
          metadata: line.metadata ? cloneJson(line.metadata) : null,
          customFieldSetId: line.customFieldSetId ?? null,
          createdAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date()
        });
        em.persist(orderLine);
        orderLineMap.set(orderLine.id, orderLine);
      });
      snapshot.adjustments.forEach((adj, index) => {
        const orderLineId = adj.quoteLineId ?? null;
        const orderLine = orderLineId ? orderLineMap.get(orderLineId) ?? null : null;
        const entity = em.create(SalesOrderAdjustment, {
          id: adj.id,
          order,
          orderLine: orderLine ?? null,
          organizationId: snapshot.quote.organizationId,
          tenantId: snapshot.quote.tenantId,
          scope: adj.scope,
          kind: adj.kind,
          code: adj.code ?? null,
          label: adj.label ?? null,
          calculatorKey: adj.calculatorKey ?? null,
          promotionId: adj.promotionId ?? null,
          rate: adj.rate,
          amountNet: adj.amountNet,
          amountGross: adj.amountGross,
          currencyCode: adj.currencyCode ?? null,
          metadata: adj.metadata ? cloneJson(adj.metadata) : null,
          position: adj.position ?? index,
          createdAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date()
        });
        em.persist(entity);
      });
      const [addresses, notes, tags] = await Promise.all([
        findWithDecryption(
          em,
          SalesDocumentAddress,
          {
            documentId: snapshot.quote.id,
            documentKind: "quote"
          },
          {},
          {
            tenantId: snapshot.quote.tenantId,
            organizationId: snapshot.quote.organizationId
          }
        ),
        findWithDecryption(
          em,
          SalesNote,
          {
            contextType: "quote",
            contextId: snapshot.quote.id
          },
          {},
          {
            tenantId: snapshot.quote.tenantId,
            organizationId: snapshot.quote.organizationId
          }
        ),
        em.find(SalesDocumentTagAssignment, {
          documentId: snapshot.quote.id,
          documentKind: "quote"
        })
      ]);
      addresses.forEach((entry) => {
        entry.documentKind = "order";
        entry.documentId = order.id;
        entry.order = order;
        entry.quote = null;
        entry.updatedAt = /* @__PURE__ */ new Date();
      });
      notes.forEach((note) => {
        note.contextType = "order";
        note.contextId = order.id;
        note.order = order;
        note.quote = null;
        note.updatedAt = /* @__PURE__ */ new Date();
      });
      tags.forEach((assignment) => {
        assignment.documentKind = "order";
        assignment.documentId = order.id;
        assignment.order = order;
        assignment.quote = null;
        assignment.updatedAt = /* @__PURE__ */ new Date();
      });
      const documentCustomValues = quoteCustomFields[snapshot.quote.id];
      if (documentCustomValues && Object.keys(documentCustomValues).length) {
        await setRecordCustomFields(em, {
          entityId: E.sales.sales_order,
          recordId: order.id,
          organizationId: snapshot.quote.organizationId,
          tenantId: snapshot.quote.tenantId,
          values: documentCustomValues
        });
      }
      const lineCustomEntries = quoteLineCustomFields;
      if (lineCustomEntries && Object.keys(lineCustomEntries).length) {
        for (const [lineId, values] of Object.entries(lineCustomEntries)) {
          if (!values || !Object.keys(values).length) continue;
          if (!orderLineMap.has(lineId)) continue;
          await setRecordCustomFields(em, {
            entityId: E.sales.sales_order_line,
            recordId: lineId,
            organizationId: snapshot.quote.organizationId,
            tenantId: snapshot.quote.tenantId,
            values
          });
        }
      }
      await em.nativeDelete(SalesQuoteAdjustment, { quote: snapshot.quote.id });
      await em.nativeDelete(SalesQuoteLine, { quote: snapshot.quote.id });
      em.remove(quote);
      await em.flush();
      return { orderId: order.id };
    };
    if (callerEm) {
      return runConversion(callerEm);
    }
    return typeof transactionalEm.transactional === "function" ? transactionalEm.transactional((trx) => runConversion(trx)) : runConversion(rootEm);
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.transactionalEm ?? ctx.container.resolve("em").fork();
    return loadOrderSnapshot(em, result.orderId);
  },
  buildLog: async ({ snapshots, result }) => {
    const before = snapshots.before;
    const after = snapshots.after;
    if (!before) return null;
    const { translate } = await resolveTranslations();
    return {
      actionLabel: translate(
        "sales.audit.quotes.convert",
        "Convert quote to order"
      ),
      resourceKind: "sales.order",
      resourceId: result.orderId,
      tenantId: before.quote.tenantId,
      organizationId: before.quote.organizationId,
      snapshotBefore: before,
      snapshotAfter: after ?? null,
      payload: {
        undo: {
          quote: before,
          order: after ?? null
        }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const quoteSnapshot = payload?.quote;
    const orderSnapshot = payload?.order;
    if (!quoteSnapshot) return;
    ensureQuoteScope(
      ctx,
      quoteSnapshot.quote.organizationId,
      quoteSnapshot.quote.tenantId
    );
    const revertConversion = async (em2, orderExists) => {
      if (orderSnapshot) {
        const orderId = orderSnapshot.order.id;
        const orderLineIds = orderSnapshot.lines.map((line) => line.id);
        const existingOrder = orderExists ? await findOneWithDecryption(em2, SalesOrder, { id: orderId }, void 0, { tenantId: quoteSnapshot.quote.tenantId, organizationId: quoteSnapshot.quote.organizationId }) : null;
        if (existingOrder) {
          const shipments = await em2.find(SalesShipment, { order: orderId });
          const shipmentIds = shipments.map((entry) => entry.id);
          if (shipmentIds.length) {
            await em2.nativeDelete(SalesShipmentItem, {
              shipment: { $in: shipmentIds }
            });
            await em2.nativeDelete(SalesShipment, { id: { $in: shipmentIds } });
          }
          await em2.nativeDelete(SalesPaymentAllocation, { order: orderId });
          await em2.nativeDelete(SalesPayment, { order: orderId });
          await em2.nativeDelete(SalesDocumentAddress, {
            documentId: orderId,
            documentKind: "order"
          });
          await em2.nativeDelete(SalesDocumentTagAssignment, {
            documentId: orderId,
            documentKind: "order"
          });
          await em2.nativeDelete(SalesOrderAdjustment, { order: orderId });
          await em2.nativeDelete(SalesOrderLine, { order: orderId });
          em2.remove(existingOrder);
        }
        await em2.nativeDelete(CustomFieldValue, {
          entityId: E.sales.sales_order,
          recordId: orderId
        });
        if (orderLineIds.length) {
          await em2.nativeDelete(CustomFieldValue, {
            entityId: E.sales.sales_order_line,
            recordId: { $in: orderLineIds }
          });
        }
      }
      const noteIds = quoteSnapshot.notes.map((note) => note.id);
      if (noteIds.length) {
        await em2.nativeDelete(SalesNote, { id: { $in: noteIds } });
      }
      await restoreQuoteGraph(em2, quoteSnapshot);
      await em2.flush();
    };
    if (orderSnapshot) {
      await withVerifiedOrderGraph(
        ctx,
        orderSnapshot,
        {
          orderId: orderSnapshot.order.id,
          tenantId: orderSnapshot.order.tenantId,
          organizationId: orderSnapshot.order.organizationId
        },
        revertConversion
      );
      return;
    }
    const em = ctx.container.resolve("em").fork();
    await em.transactional((tx) => revertConversion(tx, false));
  }
};
const orderLineUpsertSchema = orderLineCreateSchema.extend({
  id: z.string().uuid().optional()
});
const orderLineDeleteSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid()
});
const quoteLineUpsertSchema = quoteLineCreateSchema.extend({
  id: z.string().uuid().optional()
});
const quoteLineDeleteSchema = z.object({
  id: z.string().uuid(),
  quoteId: z.string().uuid()
});
const orderAdjustmentUpsertSchema = orderAdjustmentCreateSchema.extend({
  id: z.string().uuid().optional()
}).superRefine(enforceAdjustmentSign);
const orderAdjustmentDeleteSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid()
});
const quoteAdjustmentUpsertSchema = quoteAdjustmentCreateSchema.extend({
  id: z.string().uuid().optional()
}).superRefine(enforceAdjustmentSign);
const quoteAdjustmentDeleteSchema = z.object({
  id: z.string().uuid(),
  quoteId: z.string().uuid()
});
const SHIPPED_QUANTITY_TOLERANCE = 1e-6;
const SHIPPED_LINE_NUMERIC_PRICING_FIELDS = [
  "unitPriceNet",
  "unitPriceGross",
  "discountAmount",
  "discountPercent",
  "taxRate"
];
const SHIPPED_LINE_DERIVED_TOTAL_FIELDS = [
  "totalNetAmount",
  "totalGrossAmount"
];
const hasNumericChange = (next, previous) => {
  if (next === void 0 || next === null) return false;
  if (previous === void 0 || previous === null) return true;
  return Math.abs(next - previous) > SHIPPED_QUANTITY_TOLERANCE;
};
const hasExactNumericChange = (next, previous) => {
  if (next === void 0 || next === null) {
    return previous !== void 0 && previous !== null;
  }
  if (previous === void 0 || previous === null) return true;
  return Math.abs(next - previous) > SHIPPED_QUANTITY_TOLERANCE;
};
const hasUnitChange = (next, previous) => {
  if (next === void 0 || next === null) return false;
  const normalizedPrevious = (previous ?? "").trim().toLowerCase();
  if (!normalizedPrevious) return false;
  return next.trim().toLowerCase() !== normalizedPrevious;
};
const hasExactUnitChange = (next, previous) => (next ?? "").trim().toLowerCase() !== (previous ?? "").trim().toLowerCase();
function hasShippedLineTotalChange(next, previous, nextQuantity, exact) {
  const numericChange = exact ? hasExactNumericChange : hasNumericChange;
  const previousQuantity = previous.quantity;
  const canScale = typeof previousQuantity === "number" && Math.abs(previousQuantity) > SHIPPED_QUANTITY_TOLERANCE && typeof nextQuantity === "number";
  return SHIPPED_LINE_DERIVED_TOTAL_FIELDS.some((field) => {
    const nextTotal = next[field];
    const previousTotal = previous[field];
    if (!canScale || typeof previousTotal !== "number") {
      return numericChange(nextTotal, previousTotal);
    }
    if (nextTotal === void 0 || nextTotal === null) {
      return exact ? numericChange(nextTotal, previousTotal) : false;
    }
    const expectedTotal = previousTotal / previousQuantity * nextQuantity;
    const tolerance = Math.max(
      SHIPPED_QUANTITY_TOLERANCE,
      Math.abs(expectedTotal) * 1e-9
    );
    return Math.abs(nextTotal - expectedTotal) > tolerance;
  });
}
function hasShippedLinePricingChange(next, previous, nextQuantity, exact) {
  const numericChange = exact ? hasExactNumericChange : hasNumericChange;
  return SHIPPED_LINE_NUMERIC_PRICING_FIELDS.some(
    (field) => numericChange(next[field], previous[field])
  ) || hasShippedLineTotalChange(next, previous, nextQuantity, exact) || (exact ? hasExactUnitChange(next.quantityUnit, previous.quantityUnit) : hasUnitChange(next.quantityUnit, previous.quantityUnit));
}
async function assertShippedOrderLineChangeAllowed(existingSnapshot, nextSnapshot, shippedQuantity, exact) {
  if (shippedQuantity <= 0) return;
  const nextQuantity = nextSnapshot ? exact ? nextSnapshot.quantity : nextSnapshot.quantity ?? existingSnapshot.quantity : 0;
  const quantityInvalid = nextQuantity === void 0 || nextQuantity < shippedQuantity - SHIPPED_QUANTITY_TOLERANCE;
  const pricingChanged = nextSnapshot !== null && hasShippedLinePricingChange(
    nextSnapshot,
    existingSnapshot,
    nextQuantity,
    exact
  );
  if (!quantityInvalid && !pricingChanged) return;
  const { translate } = await resolveTranslations();
  if (quantityInvalid) {
    throw new CrudHttpError(409, {
      error: translate(
        "sales.documents.items.errorQuantityBelowShipped",
        "You cannot lower the quantity below the {{shipped}} already shipped.",
        { shipped: shippedQuantity }
      )
    });
  }
  throw new CrudHttpError(409, {
    error: translate(
      "sales.documents.items.errorPriceShipped",
      "You cannot change the price or unit of a line that has shipped items."
    )
  });
}
async function assertShippedOrderLineEditable(em, order, existingSnapshot, parsed) {
  const lineId = existingSnapshot?.id;
  if (!existingSnapshot || !lineId) return;
  const shippedByLine = await loadShippedQuantityByLine(em, order.id, {
    tenantId: order.tenantId,
    organizationId: order.organizationId
  });
  const shippedQuantity = shippedByLine.get(lineId) ?? 0;
  await assertShippedOrderLineChangeAllowed(
    existingSnapshot,
    parsed,
    shippedQuantity,
    false
  );
}
async function assertShippedOrderGraphRestorable(em, order, existingLines, snapshot) {
  const shippedByLine = await loadShippedQuantityByLine(em, order.id, {
    tenantId: order.tenantId,
    organizationId: order.organizationId
  });
  if (shippedByLine.size === 0) return;
  const snapshotLinesById = new Map(
    snapshot.lines.flatMap((line) => line.id ? [[line.id, line]] : [])
  );
  for (const line of existingLines) {
    const shippedQuantity = shippedByLine.get(line.id) ?? 0;
    if (shippedQuantity <= 0) continue;
    await assertShippedOrderLineChangeAllowed(
      mapOrderLineEntityToSnapshot(line),
      snapshotLinesById.get(line.id) ?? null,
      shippedQuantity,
      true
    );
  }
}
const FULFILLED_ORDER_STATUS = "fulfilled";
const isFulfilledOrder = (order) => {
  const normalize = (value) => (value ?? "").trim().toLowerCase();
  return normalize(order.status) === FULFILLED_ORDER_STATUS || normalize(order.fulfillmentStatus) === FULFILLED_ORDER_STATUS;
};
async function assertOrderAcceptsNewLine(order, existingSnapshot) {
  if (existingSnapshot) return;
  if (!isFulfilledOrder(order)) return;
  const { translate } = await resolveTranslations();
  throw new CrudHttpError(409, {
    error: translate(
      "sales.documents.items.errorAddToFulfilled",
      "You cannot add a new item to a fulfilled order. Change the order status first."
    )
  });
}
const orderLineUpsertCommand = {
  id: "sales.orders.lines.upsert",
  async prepare(input, ctx) {
    const raw = input?.body ?? {};
    const orderId = typeof raw.orderId === "string" ? raw.orderId : null;
    if (!orderId) return {};
    const em = ctx.container.resolve("em");
    const snapshot = await loadOrderSnapshot(em, orderId);
    if (snapshot)
      ensureOrderScope(
        ctx,
        snapshot.order.organizationId,
        snapshot.order.tenantId
      );
    return snapshot ? { before: snapshot } : {};
  },
  async execute(input, ctx) {
    const rawBody = input?.body ?? {};
    const parsed = orderLineUpsertSchema.parse(rawBody);
    const em = ctx.container.resolve("em").fork();
    const order = await findOneWithDecryption(em, SalesOrder, {
      id: parsed.orderId,
      deletedAt: null
    });
    if (!order)
      throw notFound("Sales order not found");
    ensureOrderScope(ctx, order.organizationId, order.tenantId);
    await enforceSalesDocumentOptimisticLock(ctx, order, SALES_RESOURCE_KIND_ORDER);
    const [existingLines, adjustments] = await Promise.all([
      em.find(SalesOrderLine, { order }, { orderBy: { lineNumber: "asc" } }),
      em.find(
        SalesOrderAdjustment,
        { order },
        { orderBy: { position: "asc" } }
      )
    ]);
    const lineSnapshots = existingLines.map(mapOrderLineEntityToSnapshot);
    const existingSnapshot = parsed.id ? lineSnapshots.find((line) => line.id === parsed.id) ?? null : null;
    await assertOrderAcceptsNewLine(order, existingSnapshot);
    await assertShippedOrderLineEditable(em, order, existingSnapshot, parsed);
    const priceMode = parsed.priceMode === "gross" ? "gross" : parsed.priceMode === "net" ? "net" : null;
    let unitPriceNet = parsed.unitPriceNet ?? existingSnapshot?.unitPriceNet ?? null;
    let unitPriceGross = parsed.unitPriceGross ?? existingSnapshot?.unitPriceGross ?? null;
    let taxRate = parsed.taxRate ?? existingSnapshot?.taxRate ?? null;
    if (priceMode && (unitPriceNet === null || unitPriceGross === null)) {
      let taxService = null;
      try {
        taxService = ctx.container.resolve(
          "taxCalculationService"
        );
      } catch {
        taxService = null;
      }
      if (taxService) {
        const taxResult = await taxService.calculateUnitAmounts({
          amount: priceMode === "gross" ? unitPriceGross ?? unitPriceNet ?? 0 : unitPriceNet ?? unitPriceGross ?? 0,
          mode: priceMode,
          organizationId: parsed.organizationId,
          tenantId: parsed.tenantId,
          taxRateId: parsed.taxRateId ?? void 0,
          taxRate: taxRate ?? void 0
        });
        unitPriceNet = unitPriceNet ?? taxResult.netAmount;
        unitPriceGross = unitPriceGross ?? taxResult.grossAmount;
        taxRate = taxResult.taxRate ?? taxRate;
      }
    }
    const metadata = typeof parsed.metadata === "object" && parsed.metadata ? { ...parsed.metadata } : existingSnapshot?.metadata ? cloneJson(existingSnapshot.metadata) : {};
    if (parsed.priceId) metadata.priceId = parsed.priceId;
    if (priceMode) metadata.priceMode = priceMode;
    const statusEntryId = parsed.statusEntryId ?? existingSnapshot?.statusEntryId ?? null;
    const lineId = parsed.id ?? existingSnapshot?.id ?? randomUUID();
    const lineUomInput = {
      productId: parsed.productId ?? existingSnapshot?.productId ?? null,
      productVariantId: parsed.productVariantId ?? existingSnapshot?.productVariantId ?? null,
      quantity: parsed.quantity ?? existingSnapshot?.quantity ?? 0,
      quantityUnit: parsed.quantityUnit ?? existingSnapshot?.quantityUnit ?? null,
      normalizedQuantity: existingSnapshot?.normalizedQuantity ?? null,
      normalizedUnit: existingSnapshot?.normalizedUnit ?? null,
      uomSnapshot: existingSnapshot?.uomSnapshot ?? null
    };
    const uomResolver = createUomResolver();
    let normalizedUom = await normalizeLineUom({
      em,
      resolver: uomResolver,
      organizationId: order.organizationId,
      tenantId: order.tenantId,
      line: {
        ...lineUomInput,
        unitPriceNet: unitPriceNet ?? 0,
        unitPriceGross: unitPriceGross ?? unitPriceNet ?? 0
      }
    });
    const convertedPrices = convertLineUnitPricesOnUnitChange({
      existingSnapshot,
      nextQuantityUnit: normalizedUom.quantityUnit,
      nextUomSnapshot: normalizedUom.uomSnapshot,
      unitPriceNet,
      unitPriceGross
    });
    if (convertedPrices.didConvert) {
      unitPriceNet = convertedPrices.unitPriceNet;
      unitPriceGross = convertedPrices.unitPriceGross;
      normalizedUom = await normalizeLineUom({
        em,
        resolver: uomResolver,
        organizationId: order.organizationId,
        tenantId: order.tenantId,
        line: {
          ...lineUomInput,
          unitPriceNet: unitPriceNet ?? 0,
          unitPriceGross: unitPriceGross ?? unitPriceNet ?? 0
        }
      });
    }
    const updatedSnapshot = {
      id: lineId,
      lineNumber: parsed.lineNumber ?? existingSnapshot?.lineNumber ?? lineSnapshots.length + 1,
      kind: parsed.kind ?? existingSnapshot?.kind ?? "product",
      productId: parsed.productId ?? existingSnapshot?.productId ?? null,
      productVariantId: parsed.productVariantId ?? existingSnapshot?.productVariantId ?? null,
      name: parsed.name ?? existingSnapshot?.name ?? null,
      description: parsed.description ?? existingSnapshot?.description ?? null,
      comment: parsed.comment ?? existingSnapshot?.comment ?? null,
      quantity: normalizedUom.quantity,
      quantityUnit: normalizedUom.quantityUnit,
      normalizedQuantity: normalizedUom.normalizedQuantity,
      normalizedUnit: normalizedUom.normalizedUnit,
      uomSnapshot: normalizedUom.uomSnapshot ? cloneJson(normalizedUom.uomSnapshot) : null,
      currencyCode: parsed.currencyCode ?? existingSnapshot?.currencyCode ?? order.currencyCode,
      unitPriceNet: unitPriceNet ?? 0,
      unitPriceGross: unitPriceGross ?? unitPriceNet ?? 0,
      ...resolveUpsertDiscountFields(
        parsed.discountAmount,
        parsed.discountAmountBasis,
        existingSnapshot
      ),
      discountPercent: parsed.discountPercent ?? existingSnapshot?.discountPercent ?? 0,
      taxRate: taxRate ?? 0,
      totalNetAmount: parsed.totalNetAmount ?? existingSnapshot?.totalNetAmount ?? null,
      ...resolveUpsertTotalsOrigin(parsed.totalNetAmount, existingSnapshot),
      configuration: parsed.configuration ?? existingSnapshot?.configuration ?? null,
      promotionCode: parsed.promotionCode ?? existingSnapshot?.promotionCode ?? null,
      metadata,
      customFieldSetId: parsed.customFieldSetId ?? existingSnapshot?.customFieldSetId ?? null,
      customFields: parsed.customFields && typeof parsed.customFields === "object" ? cloneJson(parsed.customFields) : existingSnapshot?.customFields ?? null
    };
    Object.assign(
      updatedSnapshot,
      resolveUpsertCalculatedAmounts(parsed, updatedSnapshot, existingSnapshot)
    );
    updatedSnapshot.statusEntryId = statusEntryId;
    updatedSnapshot.catalogSnapshot = parsed.catalogSnapshot ?? existingSnapshot?.catalogSnapshot ?? null;
    updatedSnapshot.promotionSnapshot = parsed.promotionSnapshot ?? existingSnapshot?.promotionSnapshot ?? null;
    let nextLines = parsed.id ? lineSnapshots.map(
      (line) => line.id === parsed.id ? updatedSnapshot : line
    ) : [...lineSnapshots, updatedSnapshot];
    nextLines = nextLines.sort((a, b) => (a.lineNumber ?? 0) - (b.lineNumber ?? 0)).map((line, index) => ({ ...line, lineNumber: index + 1 }));
    const sourceInputs = nextLines.map((line, index) => ({
      ...line,
      statusEntryId: line.statusEntryId ?? null,
      catalogSnapshot: line.catalogSnapshot ?? null,
      promotionSnapshot: line.promotionSnapshot ?? null,
      organizationId: order.organizationId,
      tenantId: order.tenantId,
      orderId: order.id,
      lineNumber: line.lineNumber ?? index + 1
    }));
    const calcLines = sourceInputs.map(
      (line, index) => createLineSnapshotFromInput(line, line.lineNumber ?? index + 1)
    );
    const adjustmentDrafts = adjustments.map(mapOrderAdjustmentToDraft);
    const salesCalculationService = ctx.container.resolve("salesCalculationService");
    const calculationContext = buildCalculationContext({
      tenantId: order.tenantId,
      organizationId: order.organizationId,
      currencyCode: order.currencyCode,
      shippingSnapshot: order.shippingMethodSnapshot,
      paymentSnapshot: order.paymentMethodSnapshot,
      shippingMethodId: order.shippingMethodId ?? null,
      paymentMethodId: order.paymentMethodId ?? null,
      shippingMethodCode: order.shippingMethodCode ?? null,
      paymentMethodCode: order.paymentMethodCode ?? null
    });
    const calculation = await salesCalculationService.calculateDocumentTotals({
      documentKind: "order",
      lines: calcLines,
      adjustments: adjustmentDrafts,
      context: calculationContext,
      existingTotals: resolveExistingPaymentTotals(order)
    });
    let eventBus = null;
    try {
      eventBus = ctx.container.resolve("eventBus");
    } catch {
      eventBus = null;
    }
    await withAtomicFlush(
      em,
      [
        async () => {
          await applyOrderLineResults({
            em,
            order,
            calculation,
            sourceLines: sourceInputs,
            existingLines
          });
          applyOrderTotals(order, calculation.totals, calculation.lines.length);
          await emitTotalsCalculated(eventBus, {
            documentKind: "order",
            documentId: order.id,
            organizationId: order.organizationId,
            tenantId: order.tenantId,
            customerId: order.customerEntityId ?? null,
            totals: calculation.totals,
            lineCount: calculation.lines.length
          });
        }
      ],
      { transaction: true }
    );
    return { orderId: order.id, lineId };
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve("em").fork();
    return loadOrderSnapshot(em, result.orderId);
  },
  buildLog: async ({ result, snapshots }) => {
    const before = snapshots.before;
    const after = snapshots.after;
    if (!after) return null;
    const { translate } = await resolveTranslations();
    return {
      actionLabel: translate(
        "sales.audit.orders.lines.upsert",
        "Upsert order line"
      ),
      resourceKind: "sales.order",
      resourceId: result.orderId,
      tenantId: after.order.tenantId,
      organizationId: after.order.organizationId,
      snapshotBefore: before ?? null,
      snapshotAfter: after,
      payload: {
        undo: { before, after }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const before = payload?.before;
    if (!before) return;
    await undoOrderGraph(ctx, before, payload?.after);
  }
};
const orderLineDeleteCommand = {
  id: "sales.orders.lines.delete",
  async prepare(input, ctx) {
    const raw = input?.body ?? {};
    const orderId = typeof raw.orderId === "string" ? raw.orderId : null;
    if (!orderId) return {};
    const em = ctx.container.resolve("em");
    const snapshot = await loadOrderSnapshot(em, orderId);
    if (snapshot)
      ensureOrderScope(
        ctx,
        snapshot.order.organizationId,
        snapshot.order.tenantId
      );
    return snapshot ? { before: snapshot } : {};
  },
  async execute(input, ctx) {
    const { translate } = await resolveTranslations();
    const parsed = orderLineDeleteSchema.parse(
      input?.body ?? {}
    );
    const em = ctx.container.resolve("em").fork();
    const order = await findOneWithDecryption(em, SalesOrder, {
      id: parsed.orderId,
      deletedAt: null
    });
    if (!order)
      throw notFound(translate(
        "sales.documents.detail.error",
        "Document not found or inaccessible."
      ));
    ensureOrderScope(ctx, order.organizationId, order.tenantId);
    await enforceSalesDocumentOptimisticLock(ctx, order, SALES_RESOURCE_KIND_ORDER);
    const shipmentCount = await em.count(SalesShipmentItem, {
      orderLine: parsed.id,
      shipment: { deletedAt: null }
    });
    if (shipmentCount > 0) {
      throw new CrudHttpError(409, {
        error: translate(
          "sales.documents.items.errorDeleteShipped",
          "Cannot delete a line that has shipped items."
        )
      });
    }
    const existingLines = await em.find(
      SalesOrderLine,
      { order },
      { orderBy: { lineNumber: "asc" } }
    );
    const adjustments = await em.find(
      SalesOrderAdjustment,
      { order },
      { orderBy: { position: "asc" } }
    );
    const filtered = existingLines.filter((line) => line.id !== parsed.id);
    if (filtered.length === existingLines.length) {
      throw notFound(translate(
        "sales.documents.detail.error",
        "Document not found or inaccessible."
      ));
    }
    if (filtered.length === 0) {
      throw new CrudHttpError(409, {
        error: translate(
          "sales.documents.items.errorDeleteLast",
          "An order must contain at least one line item."
        )
      });
    }
    const sourceInputs = filtered.map((line, index) => ({
      ...mapOrderLineEntityToSnapshot(line),
      statusEntryId: line.statusEntryId ?? null,
      catalogSnapshot: line.catalogSnapshot ? cloneJson(line.catalogSnapshot) : null,
      promotionSnapshot: line.promotionSnapshot ? cloneJson(line.promotionSnapshot) : null,
      organizationId: order.organizationId,
      tenantId: order.tenantId,
      orderId: order.id,
      lineNumber: index + 1
    }));
    const calcLines = sourceInputs.map(
      (line, index) => createLineSnapshotFromInput(line, line.lineNumber ?? index + 1)
    );
    const adjustmentDrafts = adjustments.map(mapOrderAdjustmentToDraft);
    const salesCalculationService = ctx.container.resolve("salesCalculationService");
    const calculationContext = buildCalculationContext({
      tenantId: order.tenantId,
      organizationId: order.organizationId,
      currencyCode: order.currencyCode,
      shippingSnapshot: order.shippingMethodSnapshot,
      paymentSnapshot: order.paymentMethodSnapshot,
      shippingMethodId: order.shippingMethodId ?? null,
      paymentMethodId: order.paymentMethodId ?? null,
      shippingMethodCode: order.shippingMethodCode ?? null,
      paymentMethodCode: order.paymentMethodCode ?? null
    });
    const calculation = await salesCalculationService.calculateDocumentTotals({
      documentKind: "order",
      lines: calcLines,
      adjustments: adjustmentDrafts,
      context: calculationContext,
      existingTotals: resolveExistingPaymentTotals(order)
    });
    let eventBus = null;
    try {
      eventBus = ctx.container.resolve("eventBus");
    } catch {
      eventBus = null;
    }
    await withAtomicFlush(
      em,
      [
        async () => {
          await applyOrderLineResults({
            em,
            order,
            calculation,
            sourceLines: sourceInputs,
            existingLines
          });
          applyOrderTotals(order, calculation.totals, calculation.lines.length);
          await emitTotalsCalculated(eventBus, {
            documentKind: "order",
            documentId: order.id,
            organizationId: order.organizationId,
            tenantId: order.tenantId,
            customerId: order.customerEntityId ?? null,
            totals: calculation.totals,
            lineCount: calculation.lines.length
          });
        }
      ],
      { transaction: true }
    );
    return { orderId: order.id, lineId: parsed.id };
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve("em").fork();
    return loadOrderSnapshot(em, result.orderId);
  },
  buildLog: async ({ result, snapshots }) => {
    const before = snapshots.before;
    const after = snapshots.after;
    if (!after) return null;
    const { translate } = await resolveTranslations();
    return {
      actionLabel: translate(
        "sales.audit.orders.lines.delete",
        "Delete order line"
      ),
      resourceKind: "sales.order",
      resourceId: result.orderId,
      tenantId: after.order.tenantId,
      organizationId: after.order.organizationId,
      snapshotBefore: before ?? null,
      snapshotAfter: after,
      payload: {
        undo: { before, after }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const before = payload?.before;
    if (!before) return;
    await undoOrderGraph(ctx, before, payload?.after);
  }
};
const quoteLineUpsertCommand = {
  id: "sales.quotes.lines.upsert",
  async prepare(input, ctx) {
    const raw = input?.body ?? {};
    const quoteId = typeof raw.quoteId === "string" ? raw.quoteId : null;
    if (!quoteId) return {};
    const em = ctx.container.resolve("em");
    const snapshot = await loadQuoteSnapshot(em, quoteId);
    if (snapshot)
      ensureQuoteScope(
        ctx,
        snapshot.quote.organizationId,
        snapshot.quote.tenantId
      );
    return snapshot ? { before: snapshot } : {};
  },
  async execute(input, ctx) {
    const rawBody = input?.body ?? {};
    const parsed = quoteLineUpsertSchema.parse(rawBody);
    const em = ctx.container.resolve("em").fork();
    const quote = await findOneWithDecryption(em, SalesQuote, {
      id: parsed.quoteId,
      deletedAt: null
    });
    if (!quote)
      throw notFound("Sales quote not found");
    ensureQuoteScope(ctx, quote.organizationId, quote.tenantId);
    await enforceSalesDocumentOptimisticLock(ctx, quote, SALES_RESOURCE_KIND_QUOTE);
    const [existingLines, adjustments] = await Promise.all([
      em.find(SalesQuoteLine, { quote }, { orderBy: { lineNumber: "asc" } }),
      em.find(
        SalesQuoteAdjustment,
        { quote },
        { orderBy: { position: "asc" } }
      )
    ]);
    const lineSnapshots = existingLines.map(mapQuoteLineEntityToSnapshot);
    const existingSnapshot = parsed.id ? lineSnapshots.find((line) => line.id === parsed.id) ?? null : null;
    const priceMode = parsed.priceMode === "gross" ? "gross" : parsed.priceMode === "net" ? "net" : null;
    let unitPriceNet = parsed.unitPriceNet ?? existingSnapshot?.unitPriceNet ?? null;
    let unitPriceGross = parsed.unitPriceGross ?? existingSnapshot?.unitPriceGross ?? null;
    let taxRate = parsed.taxRate ?? existingSnapshot?.taxRate ?? null;
    if (priceMode && (unitPriceNet === null || unitPriceGross === null)) {
      let taxService = null;
      try {
        taxService = ctx.container.resolve(
          "taxCalculationService"
        );
      } catch {
        taxService = null;
      }
      if (taxService) {
        const taxResult = await taxService.calculateUnitAmounts({
          amount: priceMode === "gross" ? unitPriceGross ?? unitPriceNet ?? 0 : unitPriceNet ?? unitPriceGross ?? 0,
          mode: priceMode,
          organizationId: parsed.organizationId,
          tenantId: parsed.tenantId,
          taxRateId: parsed.taxRateId ?? void 0,
          taxRate: taxRate ?? void 0
        });
        unitPriceNet = unitPriceNet ?? taxResult.netAmount;
        unitPriceGross = unitPriceGross ?? taxResult.grossAmount;
        taxRate = taxResult.taxRate ?? taxRate;
      }
    }
    const metadata = typeof parsed.metadata === "object" && parsed.metadata ? { ...parsed.metadata } : existingSnapshot?.metadata ? cloneJson(existingSnapshot.metadata) : {};
    if (parsed.priceId) metadata.priceId = parsed.priceId;
    if (priceMode) metadata.priceMode = priceMode;
    const statusEntryId = parsed.statusEntryId ?? existingSnapshot?.statusEntryId ?? null;
    const lineId = parsed.id ?? existingSnapshot?.id ?? randomUUID();
    const lineUomInput = {
      productId: parsed.productId ?? existingSnapshot?.productId ?? null,
      productVariantId: parsed.productVariantId ?? existingSnapshot?.productVariantId ?? null,
      quantity: parsed.quantity ?? existingSnapshot?.quantity ?? 0,
      quantityUnit: parsed.quantityUnit ?? existingSnapshot?.quantityUnit ?? null,
      normalizedQuantity: existingSnapshot?.normalizedQuantity ?? null,
      normalizedUnit: existingSnapshot?.normalizedUnit ?? null,
      uomSnapshot: existingSnapshot?.uomSnapshot ?? null
    };
    const uomResolver = createUomResolver();
    let normalizedUom = await normalizeLineUom({
      em,
      resolver: uomResolver,
      organizationId: quote.organizationId,
      tenantId: quote.tenantId,
      line: {
        ...lineUomInput,
        unitPriceNet: unitPriceNet ?? 0,
        unitPriceGross: unitPriceGross ?? unitPriceNet ?? 0
      }
    });
    const convertedPrices = convertLineUnitPricesOnUnitChange({
      existingSnapshot,
      nextQuantityUnit: normalizedUom.quantityUnit,
      nextUomSnapshot: normalizedUom.uomSnapshot,
      unitPriceNet,
      unitPriceGross
    });
    if (convertedPrices.didConvert) {
      unitPriceNet = convertedPrices.unitPriceNet;
      unitPriceGross = convertedPrices.unitPriceGross;
      normalizedUom = await normalizeLineUom({
        em,
        resolver: uomResolver,
        organizationId: quote.organizationId,
        tenantId: quote.tenantId,
        line: {
          ...lineUomInput,
          unitPriceNet: unitPriceNet ?? 0,
          unitPriceGross: unitPriceGross ?? unitPriceNet ?? 0
        }
      });
    }
    const updatedSnapshot = {
      id: lineId,
      lineNumber: parsed.lineNumber ?? existingSnapshot?.lineNumber ?? lineSnapshots.length + 1,
      kind: parsed.kind ?? existingSnapshot?.kind ?? "product",
      productId: parsed.productId ?? existingSnapshot?.productId ?? null,
      productVariantId: parsed.productVariantId ?? existingSnapshot?.productVariantId ?? null,
      name: parsed.name ?? existingSnapshot?.name ?? null,
      description: parsed.description ?? existingSnapshot?.description ?? null,
      comment: parsed.comment ?? existingSnapshot?.comment ?? null,
      quantity: normalizedUom.quantity,
      quantityUnit: normalizedUom.quantityUnit,
      normalizedQuantity: normalizedUom.normalizedQuantity,
      normalizedUnit: normalizedUom.normalizedUnit,
      uomSnapshot: normalizedUom.uomSnapshot ? cloneJson(normalizedUom.uomSnapshot) : null,
      currencyCode: parsed.currencyCode ?? existingSnapshot?.currencyCode ?? quote.currencyCode,
      unitPriceNet: unitPriceNet ?? 0,
      unitPriceGross: unitPriceGross ?? unitPriceNet ?? 0,
      ...resolveUpsertDiscountFields(
        parsed.discountAmount,
        parsed.discountAmountBasis,
        existingSnapshot
      ),
      discountPercent: parsed.discountPercent ?? existingSnapshot?.discountPercent ?? 0,
      taxRate: taxRate ?? 0,
      totalNetAmount: parsed.totalNetAmount ?? existingSnapshot?.totalNetAmount ?? null,
      ...resolveUpsertTotalsOrigin(parsed.totalNetAmount, existingSnapshot),
      configuration: parsed.configuration ?? existingSnapshot?.configuration ?? null,
      promotionCode: parsed.promotionCode ?? existingSnapshot?.promotionCode ?? null,
      metadata,
      customFieldSetId: parsed.customFieldSetId ?? existingSnapshot?.customFieldSetId ?? null,
      customFields: parsed.customFields && typeof parsed.customFields === "object" ? cloneJson(parsed.customFields) : existingSnapshot?.customFields ?? null
    };
    Object.assign(
      updatedSnapshot,
      resolveUpsertCalculatedAmounts(parsed, updatedSnapshot, existingSnapshot)
    );
    updatedSnapshot.statusEntryId = statusEntryId;
    updatedSnapshot.catalogSnapshot = parsed.catalogSnapshot ?? existingSnapshot?.catalogSnapshot ?? null;
    updatedSnapshot.promotionSnapshot = parsed.promotionSnapshot ?? existingSnapshot?.promotionSnapshot ?? null;
    let nextLines = parsed.id ? lineSnapshots.map(
      (line) => line.id === parsed.id ? updatedSnapshot : line
    ) : [...lineSnapshots, updatedSnapshot];
    nextLines = nextLines.sort((a, b) => (a.lineNumber ?? 0) - (b.lineNumber ?? 0)).map((line, index) => ({ ...line, lineNumber: index + 1 }));
    const sourceInputs = nextLines.map((line, index) => ({
      ...line,
      statusEntryId: line.statusEntryId ?? null,
      catalogSnapshot: line.catalogSnapshot ?? null,
      promotionSnapshot: line.promotionSnapshot ?? null,
      organizationId: quote.organizationId,
      tenantId: quote.tenantId,
      quoteId: quote.id,
      lineNumber: line.lineNumber ?? index + 1
    }));
    const calcLines = sourceInputs.map(
      (line, index) => createLineSnapshotFromInput(line, line.lineNumber ?? index + 1)
    );
    const adjustmentDrafts = adjustments.map(mapQuoteAdjustmentToDraft);
    const salesCalculationService = ctx.container.resolve("salesCalculationService");
    const calculationContext = buildCalculationContext({
      tenantId: quote.tenantId,
      organizationId: quote.organizationId,
      currencyCode: quote.currencyCode,
      shippingSnapshot: quote.shippingMethodSnapshot,
      paymentSnapshot: quote.paymentMethodSnapshot,
      shippingMethodId: quote.shippingMethodId ?? null,
      paymentMethodId: quote.paymentMethodId ?? null,
      shippingMethodCode: quote.shippingMethodCode ?? null,
      paymentMethodCode: quote.paymentMethodCode ?? null
    });
    const calculation = await salesCalculationService.calculateDocumentTotals({
      documentKind: "quote",
      lines: calcLines,
      adjustments: adjustmentDrafts,
      context: calculationContext
    });
    let eventBus = null;
    try {
      eventBus = ctx.container.resolve("eventBus");
    } catch {
      eventBus = null;
    }
    await withAtomicFlush(
      em,
      [
        async () => {
          await applyQuoteLineResults({
            em,
            quote,
            calculation,
            sourceLines: sourceInputs,
            existingLines
          });
          applyQuoteTotals(quote, calculation.totals, calculation.lines.length);
          await emitTotalsCalculated(eventBus, {
            documentKind: "quote",
            documentId: quote.id,
            organizationId: quote.organizationId,
            tenantId: quote.tenantId,
            customerId: quote.customerEntityId ?? null,
            totals: calculation.totals,
            lineCount: calculation.lines.length
          });
        }
      ],
      { transaction: true }
    );
    return { quoteId: quote.id, lineId };
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve("em").fork();
    return loadQuoteSnapshot(em, result.quoteId);
  },
  buildLog: async ({ result, snapshots }) => {
    const before = snapshots.before;
    const after = snapshots.after;
    if (!after) return null;
    const { translate } = await resolveTranslations();
    return {
      actionLabel: translate(
        "sales.audit.quotes.lines.upsert",
        "Upsert quote line"
      ),
      resourceKind: "sales.quote",
      resourceId: result.quoteId,
      tenantId: after.quote.tenantId,
      organizationId: after.quote.organizationId,
      snapshotBefore: before ?? null,
      snapshotAfter: after,
      payload: {
        undo: { before, after }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const before = payload?.before;
    if (!before) return;
    await undoQuoteGraph(ctx, before, payload?.after);
  }
};
const quoteLineDeleteCommand = {
  id: "sales.quotes.lines.delete",
  async prepare(input, ctx) {
    const raw = input?.body ?? {};
    const quoteId = typeof raw.quoteId === "string" ? raw.quoteId : null;
    if (!quoteId) return {};
    const em = ctx.container.resolve("em");
    const snapshot = await loadQuoteSnapshot(em, quoteId);
    if (snapshot)
      ensureQuoteScope(
        ctx,
        snapshot.quote.organizationId,
        snapshot.quote.tenantId
      );
    return snapshot ? { before: snapshot } : {};
  },
  async execute(input, ctx) {
    const parsed = quoteLineDeleteSchema.parse(
      input?.body ?? {}
    );
    const em = ctx.container.resolve("em").fork();
    const quote = await findOneWithDecryption(em, SalesQuote, {
      id: parsed.quoteId,
      deletedAt: null
    });
    if (!quote)
      throw notFound("Sales quote not found");
    ensureQuoteScope(ctx, quote.organizationId, quote.tenantId);
    await enforceSalesDocumentOptimisticLock(ctx, quote, SALES_RESOURCE_KIND_QUOTE);
    const existingLines = await em.find(
      SalesQuoteLine,
      { quote },
      { orderBy: { lineNumber: "asc" } }
    );
    const adjustments = await em.find(
      SalesQuoteAdjustment,
      { quote },
      { orderBy: { position: "asc" } }
    );
    const filtered = existingLines.filter((line) => line.id !== parsed.id);
    if (filtered.length === existingLines.length) {
      throw notFound("Quote line not found");
    }
    const sourceInputs = filtered.map((line, index) => ({
      ...mapQuoteLineEntityToSnapshot(line),
      statusEntryId: line.statusEntryId ?? null,
      catalogSnapshot: line.catalogSnapshot ? cloneJson(line.catalogSnapshot) : null,
      promotionSnapshot: line.promotionSnapshot ? cloneJson(line.promotionSnapshot) : null,
      organizationId: quote.organizationId,
      tenantId: quote.tenantId,
      quoteId: quote.id,
      lineNumber: index + 1
    }));
    const calcLines = sourceInputs.map(
      (line, index) => createLineSnapshotFromInput(line, line.lineNumber ?? index + 1)
    );
    const adjustmentDrafts = adjustments.map(mapQuoteAdjustmentToDraft);
    const salesCalculationService = ctx.container.resolve("salesCalculationService");
    const calculationContext = buildCalculationContext({
      tenantId: quote.tenantId,
      organizationId: quote.organizationId,
      currencyCode: quote.currencyCode,
      shippingSnapshot: quote.shippingMethodSnapshot,
      paymentSnapshot: quote.paymentMethodSnapshot,
      shippingMethodId: quote.shippingMethodId ?? null,
      paymentMethodId: quote.paymentMethodId ?? null,
      shippingMethodCode: quote.shippingMethodCode ?? null,
      paymentMethodCode: quote.paymentMethodCode ?? null
    });
    const calculation = await salesCalculationService.calculateDocumentTotals({
      documentKind: "quote",
      lines: calcLines,
      adjustments: adjustmentDrafts,
      context: calculationContext
    });
    let eventBus = null;
    try {
      eventBus = ctx.container.resolve("eventBus");
    } catch {
      eventBus = null;
    }
    await withAtomicFlush(
      em,
      [
        async () => {
          await applyQuoteLineResults({
            em,
            quote,
            calculation,
            sourceLines: sourceInputs,
            existingLines
          });
          applyQuoteTotals(quote, calculation.totals, calculation.lines.length);
          await emitTotalsCalculated(eventBus, {
            documentKind: "quote",
            documentId: quote.id,
            organizationId: quote.organizationId,
            tenantId: quote.tenantId,
            customerId: quote.customerEntityId ?? null,
            totals: calculation.totals,
            lineCount: calculation.lines.length
          });
        }
      ],
      { transaction: true }
    );
    return { quoteId: quote.id, lineId: parsed.id };
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve("em").fork();
    return loadQuoteSnapshot(em, result.quoteId);
  },
  buildLog: async ({ result, snapshots }) => {
    const before = snapshots.before;
    const after = snapshots.after;
    if (!after) return null;
    const { translate } = await resolveTranslations();
    return {
      actionLabel: translate(
        "sales.audit.quotes.lines.delete",
        "Delete quote line"
      ),
      resourceKind: "sales.quote",
      resourceId: result.quoteId,
      tenantId: after.quote.tenantId,
      organizationId: after.quote.organizationId,
      snapshotBefore: before ?? null,
      snapshotAfter: after,
      payload: {
        undo: { before, after }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const before = payload?.before;
    if (!before) return;
    await undoQuoteGraph(ctx, before, payload?.after);
  }
};
const orderAdjustmentUpsertCommand = {
  id: "sales.orders.adjustments.upsert",
  async prepare(input, ctx) {
    const raw = input?.body ?? {};
    const orderId = typeof raw.orderId === "string" ? raw.orderId : null;
    if (!orderId) return {};
    const em = ctx.container.resolve("em");
    const snapshot = await loadOrderSnapshot(em, orderId);
    if (snapshot)
      ensureOrderScope(
        ctx,
        snapshot.order.organizationId,
        snapshot.order.tenantId
      );
    return snapshot ? { before: snapshot } : {};
  },
  async execute(input, ctx) {
    const parsed = orderAdjustmentUpsertSchema.parse(
      input?.body ?? {}
    );
    const em = ctx.container.resolve("em").fork();
    const order = await findOneWithDecryption(em, SalesOrder, {
      id: parsed.orderId,
      deletedAt: null
    });
    if (!order)
      throw notFound("Sales order not found");
    ensureOrderScope(ctx, order.organizationId, order.tenantId);
    await enforceSalesDocumentOptimisticLock(ctx, order, SALES_RESOURCE_KIND_ORDER);
    if (parsed.scope === "line") {
      throw new CrudHttpError(400, {
        error: "Line-scoped adjustments are not supported yet."
      });
    }
    const [existingLines, existingAdjustments] = await Promise.all([
      em.find(SalesOrderLine, { order }, { orderBy: { lineNumber: "asc" } }),
      em.find(
        SalesOrderAdjustment,
        { order },
        { orderBy: { position: "asc" } }
      )
    ]);
    const lineSnapshots = existingLines.map(mapOrderLineEntityToSnapshot);
    const adjustmentDrafts = existingAdjustments.map(mapOrderAdjustmentToDraft);
    const existingSnapshot = parsed.id ? adjustmentDrafts.find((adj) => adj.id === parsed.id) ?? null : null;
    const adjustmentId = parsed.id ?? existingSnapshot?.id ?? randomUUID();
    let metadata = typeof parsed.metadata === "object" && parsed.metadata ? cloneJson(parsed.metadata) : existingSnapshot?.metadata ? cloneJson(existingSnapshot.metadata) : null;
    const calculatorKey = parsed.calculatorKey ?? existingSnapshot?.calculatorKey ?? null;
    if (parsed.id && calculatorKey && (calculatorKey.startsWith("shipping-provider:") || calculatorKey.startsWith("payment-provider:"))) {
      metadata = { ...metadata ?? {}, manualOverride: true };
    }
    let nextAdjustments = parsed.id ? adjustmentDrafts.map(
      (adj) => adj.id === parsed.id ? {
        ...adj,
        id: adjustmentId,
        scope: parsed.scope ?? adj.scope ?? "order",
        kind: parsed.kind ?? adj.kind ?? "custom",
        code: parsed.code ?? adj.code ?? null,
        label: parsed.label ?? adj.label ?? null,
        calculatorKey: parsed.calculatorKey ?? adj.calculatorKey ?? null,
        promotionId: parsed.promotionId ?? adj.promotionId ?? null,
        rate: parsed.rate ?? adj.rate ?? null,
        amountNet: parsed.amountNet ?? adj.amountNet ?? null,
        amountGross: parsed.amountGross ?? adj.amountGross ?? null,
        currencyCode: parsed.currencyCode ?? adj.currencyCode ?? order.currencyCode,
        metadata,
        customFields: parsed.customFields !== void 0 ? parsed.customFields : adj.customFields ?? null,
        position: parsed.position ?? adj.position ?? adjustmentDrafts.length
      } : adj
    ) : [
      ...adjustmentDrafts,
      {
        id: adjustmentId,
        scope: parsed.scope ?? "order",
        kind: parsed.kind ?? "custom",
        code: parsed.code ?? null,
        label: parsed.label ?? null,
        calculatorKey: parsed.calculatorKey ?? null,
        promotionId: parsed.promotionId ?? null,
        rate: parsed.rate ?? null,
        amountNet: parsed.amountNet ?? null,
        amountGross: parsed.amountGross ?? null,
        currencyCode: parsed.currencyCode ?? order.currencyCode,
        metadata,
        customFields: parsed.customFields ?? null,
        position: parsed.position ?? adjustmentDrafts.length
      }
    ];
    nextAdjustments = nextAdjustments.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((adj, index) => ({ ...adj, position: adj.position ?? index }));
    const sourceLines = lineSnapshots.map((line, index) => ({
      ...line,
      statusEntryId: line.statusEntryId ?? null,
      catalogSnapshot: line.catalogSnapshot ?? null,
      promotionSnapshot: line.promotionSnapshot ?? null,
      organizationId: order.organizationId,
      tenantId: order.tenantId,
      orderId: order.id,
      lineNumber: line.lineNumber ?? index + 1
    }));
    const calcLines = sourceLines.map(
      (line, index) => createLineSnapshotFromInput(line, line.lineNumber ?? index + 1)
    );
    const salesCalculationService = ctx.container.resolve("salesCalculationService");
    const calculationContext = buildCalculationContext({
      tenantId: order.tenantId,
      organizationId: order.organizationId,
      currencyCode: order.currencyCode,
      shippingSnapshot: order.shippingMethodSnapshot,
      paymentSnapshot: order.paymentMethodSnapshot,
      shippingMethodId: order.shippingMethodId ?? null,
      paymentMethodId: order.paymentMethodId ?? null,
      shippingMethodCode: order.shippingMethodCode ?? null,
      paymentMethodCode: order.paymentMethodCode ?? null
    });
    const effectiveAdjustment = nextAdjustments.find(
      (adj) => adj.id === adjustmentId
    );
    if (effectiveAdjustment?.kind === "return") {
      const baselineAdjustments = nextAdjustments.filter(
        (adj) => adj.id !== adjustmentId
      );
      const baselineCalculation = await salesCalculationService.calculateDocumentTotals({
        documentKind: "order",
        lines: calcLines,
        adjustments: baselineAdjustments,
        context: calculationContext,
        existingTotals: resolveExistingPaymentTotals(order)
      });
      const issues = validateReturnAdjustmentWithinRemaining({
        kind: "return",
        amountNet: effectiveAdjustment.amountNet ?? effectiveAdjustment.amountGross ?? 0,
        amountGross: effectiveAdjustment.amountGross ?? effectiveAdjustment.amountNet ?? 0,
        remainingNet: Number(
          baselineCalculation.totals?.grandTotalNetAmount ?? 0
        ),
        remainingGross: Number(
          baselineCalculation.totals?.grandTotalGrossAmount ?? 0
        )
      });
      if (issues.length > 0) {
        const { translate } = await resolveTranslations();
        const grossIssue = issues.find((issue) => issue.path === "amountGross");
        const netIssue = issues.find((issue) => issue.path === "amountNet");
        const fieldErrors = {};
        if (grossIssue) {
          fieldErrors.amountGross = translate(
            "sales.adjustments.error.returnExceedsRemainingGrandTotalGross",
            RETURN_ADJUSTMENT_EXCEEDS_REMAINING_GROSS_MESSAGE
          );
        }
        if (netIssue) {
          fieldErrors.amountNet = translate(
            "sales.adjustments.error.returnExceedsRemainingGrandTotalNet",
            RETURN_ADJUSTMENT_EXCEEDS_REMAINING_NET_MESSAGE
          );
        }
        throw new CrudHttpError(400, {
          error: fieldErrors.amountGross ?? fieldErrors.amountNet ?? translate(
            "sales.adjustments.error.returnExceedsRemainingGrandTotalGross",
            RETURN_ADJUSTMENT_EXCEEDS_REMAINING_GROSS_MESSAGE
          ),
          fieldErrors
        });
      }
    }
    const calculation = await salesCalculationService.calculateDocumentTotals({
      documentKind: "order",
      lines: calcLines,
      adjustments: nextAdjustments,
      context: calculationContext,
      existingTotals: resolveExistingPaymentTotals(order)
    });
    const adjustmentInputs = nextAdjustments.map((adj, index) => ({
      organizationId: order.organizationId,
      tenantId: order.tenantId,
      orderId: order.id,
      scope: adj.scope ?? "order",
      kind: adj.kind ?? "custom",
      code: adj.code ?? void 0,
      label: adj.label ?? void 0,
      calculatorKey: adj.calculatorKey ?? void 0,
      promotionId: adj.promotionId ?? void 0,
      rate: adj.rate ?? void 0,
      amountNet: adj.amountNet ?? void 0,
      amountGross: adj.amountGross ?? void 0,
      currencyCode: adj.currencyCode ?? order.currencyCode,
      metadata: adj.metadata ?? void 0,
      customFields: adj.customFields ?? void 0,
      position: adj.position ?? index
    }));
    let eventBus = null;
    try {
      eventBus = ctx.container.resolve("eventBus");
    } catch {
      eventBus = null;
    }
    await withAtomicFlush(
      em,
      [
        async () => {
          await replaceOrderAdjustments(em, order, calculation, adjustmentInputs);
          applyOrderTotals(order, calculation.totals, calculation.lines.length);
          order.updatedAt = /* @__PURE__ */ new Date();
          await emitTotalsCalculated(eventBus, {
            documentKind: "order",
            documentId: order.id,
            organizationId: order.organizationId,
            tenantId: order.tenantId,
            customerId: order.customerEntityId ?? null,
            totals: calculation.totals,
            lineCount: calculation.lines.length
          });
        }
      ],
      { transaction: true }
    );
    return { orderId: order.id, adjustmentId };
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve("em").fork();
    return loadOrderSnapshot(em, result.orderId);
  },
  buildLog: async ({ snapshots, result }) => {
    const before = snapshots.before;
    const after = snapshots.after;
    if (!after) return null;
    const { translate } = await resolveTranslations();
    return {
      actionLabel: translate(
        "sales.audit.orders.adjustments.upsert",
        "Upsert order adjustment"
      ),
      resourceKind: "sales.order",
      resourceId: result.orderId,
      tenantId: after.order.tenantId,
      organizationId: after.order.organizationId,
      snapshotBefore: before ?? null,
      snapshotAfter: after,
      payload: {
        undo: { before, after }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const before = payload?.before;
    if (!before) return;
    await undoOrderGraph(ctx, before, payload?.after);
  }
};
const orderAdjustmentDeleteCommand = {
  id: "sales.orders.adjustments.delete",
  async prepare(input, ctx) {
    const raw = input?.body ?? {};
    const orderId = typeof raw.orderId === "string" ? raw.orderId : null;
    if (!orderId) return {};
    const em = ctx.container.resolve("em");
    const snapshot = await loadOrderSnapshot(em, orderId);
    if (snapshot)
      ensureOrderScope(
        ctx,
        snapshot.order.organizationId,
        snapshot.order.tenantId
      );
    return snapshot ? { before: snapshot } : {};
  },
  async execute(input, ctx) {
    const parsed = orderAdjustmentDeleteSchema.parse(
      input?.body ?? {}
    );
    const em = ctx.container.resolve("em").fork();
    const order = await findOneWithDecryption(em, SalesOrder, {
      id: parsed.orderId,
      deletedAt: null
    });
    if (!order)
      throw notFound("Sales order not found");
    ensureOrderScope(ctx, order.organizationId, order.tenantId);
    await enforceSalesDocumentOptimisticLock(ctx, order, SALES_RESOURCE_KIND_ORDER);
    const [existingLines, adjustments] = await Promise.all([
      em.find(SalesOrderLine, { order }, { orderBy: { lineNumber: "asc" } }),
      em.find(
        SalesOrderAdjustment,
        { order },
        { orderBy: { position: "asc" } }
      )
    ]);
    const filtered = adjustments.filter((adj) => adj.id !== parsed.id);
    if (filtered.length === adjustments.length) {
      throw notFound("Adjustment not found");
    }
    const lineSnapshots = existingLines.map(mapOrderLineEntityToSnapshot);
    const calcLines = lineSnapshots.map(
      (line, index) => createLineSnapshotFromInput(
        {
          ...line,
          organizationId: order.organizationId,
          tenantId: order.tenantId,
          orderId: order.id,
          lineNumber: line.lineNumber ?? index + 1,
          statusEntryId: line.statusEntryId ?? null,
          catalogSnapshot: line.catalogSnapshot ?? null,
          promotionSnapshot: line.promotionSnapshot ?? null
        },
        line.lineNumber ?? index + 1
      )
    );
    const adjustmentDrafts = filtered.map(mapOrderAdjustmentToDraft);
    const salesCalculationService = ctx.container.resolve("salesCalculationService");
    const calculationContext = buildCalculationContext({
      tenantId: order.tenantId,
      organizationId: order.organizationId,
      currencyCode: order.currencyCode,
      shippingSnapshot: order.shippingMethodSnapshot,
      paymentSnapshot: order.paymentMethodSnapshot,
      shippingMethodId: order.shippingMethodId ?? null,
      paymentMethodId: order.paymentMethodId ?? null,
      shippingMethodCode: order.shippingMethodCode ?? null,
      paymentMethodCode: order.paymentMethodCode ?? null
    });
    const calculation = await salesCalculationService.calculateDocumentTotals({
      documentKind: "order",
      lines: calcLines,
      adjustments: adjustmentDrafts,
      context: calculationContext,
      existingTotals: resolveExistingPaymentTotals(order)
    });
    const adjustmentInputs = adjustmentDrafts.map((adj, index) => ({
      organizationId: order.organizationId,
      tenantId: order.tenantId,
      orderId: order.id,
      scope: adj.scope ?? "order",
      kind: adj.kind ?? "custom",
      code: adj.code ?? void 0,
      label: adj.label ?? void 0,
      calculatorKey: adj.calculatorKey ?? void 0,
      promotionId: adj.promotionId ?? void 0,
      rate: adj.rate ?? void 0,
      amountNet: adj.amountNet ?? void 0,
      amountGross: adj.amountGross ?? void 0,
      currencyCode: adj.currencyCode ?? order.currencyCode,
      metadata: adj.metadata ?? void 0,
      position: adj.position ?? index
    }));
    let eventBus = null;
    try {
      eventBus = ctx.container.resolve("eventBus");
    } catch {
      eventBus = null;
    }
    await withAtomicFlush(
      em,
      [
        async () => {
          await replaceOrderAdjustments(em, order, calculation, adjustmentInputs);
          applyOrderTotals(order, calculation.totals, calculation.lines.length);
          order.updatedAt = /* @__PURE__ */ new Date();
          await emitTotalsCalculated(eventBus, {
            documentKind: "order",
            documentId: order.id,
            organizationId: order.organizationId,
            tenantId: order.tenantId,
            customerId: order.customerEntityId ?? null,
            totals: calculation.totals,
            lineCount: calculation.lines.length
          });
        }
      ],
      { transaction: true }
    );
    return { orderId: order.id, adjustmentId: parsed.id };
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve("em").fork();
    return loadOrderSnapshot(em, result.orderId);
  },
  buildLog: async ({ snapshots, result }) => {
    const before = snapshots.before;
    const after = snapshots.after;
    if (!after) return null;
    const { translate } = await resolveTranslations();
    return {
      actionLabel: translate(
        "sales.audit.orders.adjustments.delete",
        "Delete order adjustment"
      ),
      resourceKind: "sales.order",
      resourceId: result.orderId,
      tenantId: after.order.tenantId,
      organizationId: after.order.organizationId,
      snapshotBefore: before ?? null,
      snapshotAfter: after,
      payload: {
        undo: { before, after }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const before = payload?.before;
    if (!before) return;
    await undoOrderGraph(ctx, before, payload?.after);
  }
};
const quoteAdjustmentUpsertCommand = {
  id: "sales.quotes.adjustments.upsert",
  async prepare(input, ctx) {
    const raw = input?.body ?? {};
    const quoteId = typeof raw.quoteId === "string" ? raw.quoteId : null;
    if (!quoteId) return {};
    const em = ctx.container.resolve("em");
    const snapshot = await loadQuoteSnapshot(em, quoteId);
    if (snapshot)
      ensureQuoteScope(
        ctx,
        snapshot.quote.organizationId,
        snapshot.quote.tenantId
      );
    return snapshot ? { before: snapshot } : {};
  },
  async execute(input, ctx) {
    const parsed = quoteAdjustmentUpsertSchema.parse(
      input?.body ?? {}
    );
    const em = ctx.container.resolve("em").fork();
    const quote = await findOneWithDecryption(em, SalesQuote, {
      id: parsed.quoteId,
      deletedAt: null
    });
    if (!quote)
      throw notFound("Sales quote not found");
    ensureQuoteScope(ctx, quote.organizationId, quote.tenantId);
    await enforceSalesDocumentOptimisticLock(ctx, quote, SALES_RESOURCE_KIND_QUOTE);
    if (parsed.scope === "line") {
      throw new CrudHttpError(400, {
        error: "Line-scoped adjustments are not supported yet."
      });
    }
    const [existingLines, existingAdjustments] = await Promise.all([
      em.find(SalesQuoteLine, { quote }, { orderBy: { lineNumber: "asc" } }),
      em.find(
        SalesQuoteAdjustment,
        { quote },
        { orderBy: { position: "asc" } }
      )
    ]);
    const lineSnapshots = existingLines.map(mapQuoteLineEntityToSnapshot);
    const adjustmentDrafts = existingAdjustments.map(mapQuoteAdjustmentToDraft);
    const existingSnapshot = parsed.id ? adjustmentDrafts.find((adj) => adj.id === parsed.id) ?? null : null;
    const adjustmentId = parsed.id ?? existingSnapshot?.id ?? randomUUID();
    let metadata = typeof parsed.metadata === "object" && parsed.metadata ? cloneJson(parsed.metadata) : existingSnapshot?.metadata ? cloneJson(existingSnapshot.metadata) : null;
    const calculatorKey = parsed.calculatorKey ?? existingSnapshot?.calculatorKey ?? null;
    if (parsed.id && calculatorKey && (calculatorKey.startsWith("shipping-provider:") || calculatorKey.startsWith("payment-provider:"))) {
      metadata = { ...metadata ?? {}, manualOverride: true };
    }
    let nextAdjustments = parsed.id ? adjustmentDrafts.map(
      (adj) => adj.id === parsed.id ? {
        ...adj,
        id: adjustmentId,
        scope: parsed.scope ?? adj.scope ?? "order",
        kind: parsed.kind ?? adj.kind ?? "custom",
        code: parsed.code ?? adj.code ?? null,
        label: parsed.label ?? adj.label ?? null,
        calculatorKey: parsed.calculatorKey ?? adj.calculatorKey ?? null,
        promotionId: parsed.promotionId ?? adj.promotionId ?? null,
        rate: parsed.rate ?? adj.rate ?? null,
        amountNet: parsed.amountNet ?? adj.amountNet ?? null,
        amountGross: parsed.amountGross ?? adj.amountGross ?? null,
        currencyCode: parsed.currencyCode ?? adj.currencyCode ?? quote.currencyCode,
        metadata,
        customFields: parsed.customFields !== void 0 ? parsed.customFields : adj.customFields ?? null,
        position: parsed.position ?? adj.position ?? adjustmentDrafts.length
      } : adj
    ) : [
      ...adjustmentDrafts,
      {
        id: adjustmentId,
        scope: parsed.scope ?? "order",
        kind: parsed.kind ?? "custom",
        code: parsed.code ?? null,
        label: parsed.label ?? null,
        calculatorKey: parsed.calculatorKey ?? null,
        promotionId: parsed.promotionId ?? null,
        rate: parsed.rate ?? null,
        amountNet: parsed.amountNet ?? null,
        amountGross: parsed.amountGross ?? null,
        currencyCode: parsed.currencyCode ?? quote.currencyCode,
        metadata,
        customFields: parsed.customFields ?? null,
        position: parsed.position ?? adjustmentDrafts.length
      }
    ];
    nextAdjustments = nextAdjustments.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((adj, index) => ({ ...adj, position: adj.position ?? index }));
    const sourceLines = lineSnapshots.map((line, index) => ({
      ...line,
      statusEntryId: line.statusEntryId ?? null,
      catalogSnapshot: line.catalogSnapshot ?? null,
      promotionSnapshot: line.promotionSnapshot ?? null,
      organizationId: quote.organizationId,
      tenantId: quote.tenantId,
      quoteId: quote.id,
      lineNumber: line.lineNumber ?? index + 1
    }));
    const calcLines = sourceLines.map(
      (line, index) => createLineSnapshotFromInput(line, line.lineNumber ?? index + 1)
    );
    const salesCalculationService = ctx.container.resolve("salesCalculationService");
    const calculationContext = buildCalculationContext({
      tenantId: quote.tenantId,
      organizationId: quote.organizationId,
      currencyCode: quote.currencyCode,
      shippingSnapshot: quote.shippingMethodSnapshot,
      paymentSnapshot: quote.paymentMethodSnapshot,
      shippingMethodId: quote.shippingMethodId ?? null,
      paymentMethodId: quote.paymentMethodId ?? null,
      shippingMethodCode: quote.shippingMethodCode ?? null,
      paymentMethodCode: quote.paymentMethodCode ?? null
    });
    const effectiveAdjustment = nextAdjustments.find(
      (adj) => adj.id === adjustmentId
    );
    if (effectiveAdjustment?.kind === "return") {
      const baselineAdjustments = nextAdjustments.filter(
        (adj) => adj.id !== adjustmentId
      );
      const baselineCalculation = await salesCalculationService.calculateDocumentTotals({
        documentKind: "quote",
        lines: calcLines,
        adjustments: baselineAdjustments,
        context: calculationContext
      });
      const issues = validateReturnAdjustmentWithinRemaining({
        kind: "return",
        amountNet: effectiveAdjustment.amountNet ?? effectiveAdjustment.amountGross ?? 0,
        amountGross: effectiveAdjustment.amountGross ?? effectiveAdjustment.amountNet ?? 0,
        remainingNet: Number(
          baselineCalculation.totals?.grandTotalNetAmount ?? 0
        ),
        remainingGross: Number(
          baselineCalculation.totals?.grandTotalGrossAmount ?? 0
        )
      });
      if (issues.length > 0) {
        const { translate } = await resolveTranslations();
        const grossIssue = issues.find((issue) => issue.path === "amountGross");
        const netIssue = issues.find((issue) => issue.path === "amountNet");
        const fieldErrors = {};
        if (grossIssue) {
          fieldErrors.amountGross = translate(
            "sales.adjustments.error.returnExceedsRemainingGrandTotalGross",
            RETURN_ADJUSTMENT_EXCEEDS_REMAINING_GROSS_MESSAGE
          );
        }
        if (netIssue) {
          fieldErrors.amountNet = translate(
            "sales.adjustments.error.returnExceedsRemainingGrandTotalNet",
            RETURN_ADJUSTMENT_EXCEEDS_REMAINING_NET_MESSAGE
          );
        }
        throw new CrudHttpError(400, {
          error: fieldErrors.amountGross ?? fieldErrors.amountNet ?? translate(
            "sales.adjustments.error.returnExceedsRemainingGrandTotalGross",
            RETURN_ADJUSTMENT_EXCEEDS_REMAINING_GROSS_MESSAGE
          ),
          fieldErrors
        });
      }
    }
    const calculation = await salesCalculationService.calculateDocumentTotals({
      documentKind: "quote",
      lines: calcLines,
      adjustments: nextAdjustments,
      context: calculationContext
    });
    const adjustmentInputs = nextAdjustments.map((adj, index) => ({
      organizationId: quote.organizationId,
      tenantId: quote.tenantId,
      quoteId: quote.id,
      scope: adj.scope ?? "order",
      kind: adj.kind ?? "custom",
      code: adj.code ?? void 0,
      label: adj.label ?? void 0,
      calculatorKey: adj.calculatorKey ?? void 0,
      promotionId: adj.promotionId ?? void 0,
      rate: adj.rate ?? void 0,
      amountNet: adj.amountNet ?? void 0,
      amountGross: adj.amountGross ?? void 0,
      currencyCode: adj.currencyCode ?? quote.currencyCode,
      metadata: adj.metadata ?? void 0,
      customFields: adj.customFields ?? void 0,
      position: adj.position ?? index
    }));
    let eventBus = null;
    try {
      eventBus = ctx.container.resolve("eventBus");
    } catch {
      eventBus = null;
    }
    await withAtomicFlush(
      em,
      [
        async () => {
          await replaceQuoteAdjustments(em, quote, calculation, adjustmentInputs);
          applyQuoteTotals(quote, calculation.totals, calculation.lines.length);
          quote.updatedAt = /* @__PURE__ */ new Date();
          await emitTotalsCalculated(eventBus, {
            documentKind: "quote",
            documentId: quote.id,
            organizationId: quote.organizationId,
            tenantId: quote.tenantId,
            customerId: quote.customerEntityId ?? null,
            totals: calculation.totals,
            lineCount: calculation.lines.length
          });
        }
      ],
      { transaction: true }
    );
    return { quoteId: quote.id, adjustmentId };
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve("em").fork();
    return loadQuoteSnapshot(em, result.quoteId);
  },
  buildLog: async ({ snapshots, result }) => {
    const before = snapshots.before;
    const after = snapshots.after;
    if (!after) return null;
    const { translate } = await resolveTranslations();
    return {
      actionLabel: translate(
        "sales.audit.quotes.adjustments.upsert",
        "Upsert quote adjustment"
      ),
      resourceKind: "sales.quote",
      resourceId: result.quoteId,
      tenantId: after.quote.tenantId,
      organizationId: after.quote.organizationId,
      snapshotBefore: before ?? null,
      snapshotAfter: after,
      payload: {
        undo: { before, after }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const before = payload?.before;
    if (!before) return;
    await undoQuoteGraph(ctx, before, payload?.after);
  }
};
const quoteAdjustmentDeleteCommand = {
  id: "sales.quotes.adjustments.delete",
  async prepare(input, ctx) {
    const raw = input?.body ?? {};
    const quoteId = typeof raw.quoteId === "string" ? raw.quoteId : null;
    if (!quoteId) return {};
    const em = ctx.container.resolve("em");
    const snapshot = await loadQuoteSnapshot(em, quoteId);
    if (snapshot)
      ensureQuoteScope(
        ctx,
        snapshot.quote.organizationId,
        snapshot.quote.tenantId
      );
    return snapshot ? { before: snapshot } : {};
  },
  async execute(input, ctx) {
    const parsed = quoteAdjustmentDeleteSchema.parse(
      input?.body ?? {}
    );
    const em = ctx.container.resolve("em").fork();
    const quote = await findOneWithDecryption(em, SalesQuote, {
      id: parsed.quoteId,
      deletedAt: null
    });
    if (!quote)
      throw notFound("Sales quote not found");
    ensureQuoteScope(ctx, quote.organizationId, quote.tenantId);
    await enforceSalesDocumentOptimisticLock(ctx, quote, SALES_RESOURCE_KIND_QUOTE);
    const [existingLines, adjustments] = await Promise.all([
      em.find(SalesQuoteLine, { quote }, { orderBy: { lineNumber: "asc" } }),
      em.find(
        SalesQuoteAdjustment,
        { quote },
        { orderBy: { position: "asc" } }
      )
    ]);
    const filtered = adjustments.filter((adj) => adj.id !== parsed.id);
    if (filtered.length === adjustments.length) {
      throw notFound("Adjustment not found");
    }
    const lineSnapshots = existingLines.map(mapQuoteLineEntityToSnapshot);
    const calcLines = lineSnapshots.map(
      (line, index) => createLineSnapshotFromInput(
        {
          ...line,
          organizationId: quote.organizationId,
          tenantId: quote.tenantId,
          quoteId: quote.id,
          lineNumber: line.lineNumber ?? index + 1,
          statusEntryId: line.statusEntryId ?? null,
          catalogSnapshot: line.catalogSnapshot ?? null,
          promotionSnapshot: line.promotionSnapshot ?? null
        },
        line.lineNumber ?? index + 1
      )
    );
    const adjustmentDrafts = filtered.map(mapQuoteAdjustmentToDraft);
    const salesCalculationService = ctx.container.resolve("salesCalculationService");
    const calculationContext = buildCalculationContext({
      tenantId: quote.tenantId,
      organizationId: quote.organizationId,
      currencyCode: quote.currencyCode,
      shippingSnapshot: quote.shippingMethodSnapshot,
      paymentSnapshot: quote.paymentMethodSnapshot,
      shippingMethodId: quote.shippingMethodId ?? null,
      paymentMethodId: quote.paymentMethodId ?? null,
      shippingMethodCode: quote.shippingMethodCode ?? null,
      paymentMethodCode: quote.paymentMethodCode ?? null
    });
    const calculation = await salesCalculationService.calculateDocumentTotals({
      documentKind: "quote",
      lines: calcLines,
      adjustments: adjustmentDrafts,
      context: calculationContext
    });
    const adjustmentInputs = adjustmentDrafts.map((adj, index) => ({
      organizationId: quote.organizationId,
      tenantId: quote.tenantId,
      quoteId: quote.id,
      scope: adj.scope ?? "order",
      kind: adj.kind ?? "custom",
      code: adj.code ?? void 0,
      label: adj.label ?? void 0,
      calculatorKey: adj.calculatorKey ?? void 0,
      promotionId: adj.promotionId ?? void 0,
      rate: adj.rate ?? void 0,
      amountNet: adj.amountNet ?? void 0,
      amountGross: adj.amountGross ?? void 0,
      currencyCode: adj.currencyCode ?? quote.currencyCode,
      metadata: adj.metadata ?? void 0,
      position: adj.position ?? index
    }));
    let eventBus = null;
    try {
      eventBus = ctx.container.resolve("eventBus");
    } catch {
      eventBus = null;
    }
    await withAtomicFlush(
      em,
      [
        async () => {
          await replaceQuoteAdjustments(em, quote, calculation, adjustmentInputs);
          applyQuoteTotals(quote, calculation.totals, calculation.lines.length);
          quote.updatedAt = /* @__PURE__ */ new Date();
          await emitTotalsCalculated(eventBus, {
            documentKind: "quote",
            documentId: quote.id,
            organizationId: quote.organizationId,
            tenantId: quote.tenantId,
            customerId: quote.customerEntityId ?? null,
            totals: calculation.totals,
            lineCount: calculation.lines.length
          });
        }
      ],
      { transaction: true }
    );
    return { quoteId: quote.id, adjustmentId: parsed.id };
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve("em").fork();
    return loadQuoteSnapshot(em, result.quoteId);
  },
  buildLog: async ({ snapshots, result }) => {
    const before = snapshots.before;
    const after = snapshots.after;
    if (!after) return null;
    const { translate } = await resolveTranslations();
    return {
      actionLabel: translate(
        "sales.audit.quotes.adjustments.delete",
        "Delete quote adjustment"
      ),
      resourceKind: "sales.quote",
      resourceId: result.quoteId,
      tenantId: after.quote.tenantId,
      organizationId: after.quote.organizationId,
      snapshotBefore: before ?? null,
      snapshotAfter: after,
      payload: {
        undo: { before, after }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const before = payload?.before;
    if (!before) return;
    await undoQuoteGraph(ctx, before, payload?.after);
  }
};
const invoiceCrudEvents = {
  module: "sales",
  entity: "invoice",
  persistent: true,
  buildPayload: (ctx) => ({
    id: ctx.identifiers.id,
    organizationId: ctx.identifiers.organizationId,
    tenantId: ctx.identifiers.tenantId
  })
};
const createInvoiceCommand = {
  id: "sales.invoices.create",
  async execute(rawInput, ctx) {
    const generator = ctx.container.resolve(
      "salesDocumentNumberGenerator"
    );
    const initial = invoiceCreateSchema.parse(rawInput ?? {});
    const invoiceNumber = typeof initial.invoiceNumber === "string" && initial.invoiceNumber.trim().length ? initial.invoiceNumber.trim() : (await generator.generate({
      kind: "invoice",
      organizationId: initial.organizationId,
      tenantId: initial.tenantId
    })).number;
    const parsed = invoiceCreateSchema.parse({ ...initial, invoiceNumber });
    const ensuredInvoiceNumber = parsed.invoiceNumber ?? invoiceNumber;
    if (!ensuredInvoiceNumber) {
      throw new CrudHttpError(400, { error: "Invoice number is required." });
    }
    ensureOrganizationScope(ctx, parsed.organizationId);
    ensureTenantScope(ctx, parsed.tenantId);
    const em = ctx.container.resolve("em").fork();
    const status = await resolveDictionaryEntryValue(
      em,
      parsed.statusEntryId ?? null,
      { tenantId: parsed.tenantId }
    );
    if (parsed.orderId) {
      const orderExists = await findOneWithDecryption(
        em,
        SalesOrder,
        {
          id: parsed.orderId,
          organizationId: parsed.organizationId,
          tenantId: parsed.tenantId,
          deletedAt: null
        },
        {},
        {
          tenantId: parsed.tenantId,
          organizationId: parsed.organizationId
        }
      );
      if (!orderExists) {
        throw new CrudHttpError(400, { error: "Referenced order not found in current scope." });
      }
    }
    const invoiceId = randomUUID();
    const invoice = em.create(SalesInvoice, {
      id: invoiceId,
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      invoiceNumber: ensuredInvoiceNumber,
      orderId: parsed.orderId ?? null,
      statusEntryId: parsed.statusEntryId ?? null,
      status,
      issueDate: parsed.issueDate ?? /* @__PURE__ */ new Date(),
      dueDate: parsed.dueDate ?? null,
      currencyCode: parsed.currencyCode,
      subtotalNetAmount: toNumericString(parsed.subtotalNetAmount ?? 0),
      subtotalGrossAmount: toNumericString(parsed.subtotalGrossAmount ?? 0),
      discountTotalAmount: toNumericString(parsed.discountTotalAmount ?? 0),
      taxTotalAmount: toNumericString(parsed.taxTotalAmount ?? 0),
      grandTotalNetAmount: toNumericString(parsed.grandTotalNetAmount ?? 0),
      grandTotalGrossAmount: toNumericString(parsed.grandTotalGrossAmount ?? 0),
      paidTotalAmount: toNumericString(parsed.paidTotalAmount ?? 0),
      outstandingAmount: toNumericString(parsed.outstandingAmount ?? 0),
      metadata: parsed.metadata ?? null,
      customFieldSetId: parsed.customFieldSetId ?? null,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    await withAtomicFlush(
      em,
      [
        async () => {
          em.persist(invoice);
          if (parsed.lines?.length) {
            for (let i = 0; i < parsed.lines.length; i++) {
              const line = parsed.lines[i];
              em.persist(
                em.create(SalesInvoiceLine, {
                  id: randomUUID(),
                  invoice,
                  orderLineId: line.orderLineId ?? null,
                  organizationId: parsed.organizationId,
                  tenantId: parsed.tenantId,
                  lineNumber: line.lineNumber ?? i + 1,
                  kind: line.kind ?? "product",
                  name: line.name ?? null,
                  sku: line.sku ?? null,
                  description: line.description ?? null,
                  quantity: toNumericString(line.quantity ?? 0),
                  quantityUnit: line.quantityUnit ?? null,
                  normalizedQuantity: toNumericString(line.normalizedQuantity ?? 0),
                  normalizedUnit: line.normalizedUnit ?? null,
                  uomSnapshot: line.uomSnapshot ?? null,
                  currencyCode: line.currencyCode ?? parsed.currencyCode,
                  unitPriceNet: toNumericString(line.unitPriceNet ?? 0),
                  unitPriceGross: toNumericString(line.unitPriceGross ?? 0),
                  discountAmount: toNumericString(line.discountAmount ?? 0),
                  discountPercent: toNumericString(line.discountPercent ?? 0),
                  taxRate: toNumericString(line.taxRate ?? 0),
                  taxAmount: toNumericString(line.taxAmount ?? 0),
                  totalNetAmount: toNumericString(
                    deriveLineNetFromGross(line.totalNetAmount ?? 0, line.totalGrossAmount ?? 0, line.taxRate ?? 0)
                  ),
                  totalGrossAmount: toNumericString(line.totalGrossAmount ?? 0),
                  metadata: line.metadata ?? null
                })
              );
            }
          }
          if (parsed.customFieldSetId) {
            await setRecordCustomFields(em, {
              entityId: E.sales.sales_invoice,
              recordId: invoiceId,
              organizationId: parsed.organizationId,
              tenantId: parsed.tenantId,
              values: normalizeCustomFieldValues(
                parsed.customFields ?? {}
              )
            });
          }
        }
      ],
      { transaction: true }
    );
    const dataEngine = ctx.container.resolve("dataEngine");
    await emitCrudSideEffects({
      dataEngine,
      action: "created",
      entity: invoice,
      identifiers: {
        id: invoice.id,
        organizationId: invoice.organizationId,
        tenantId: invoice.tenantId
      },
      events: invoiceCrudEvents,
      indexer: { entityType: E.sales.sales_invoice }
    });
    await invalidateCrudCache(
      ctx.container,
      "sales.invoice",
      {
        id: invoice.id,
        organizationId: invoice.organizationId,
        tenantId: invoice.tenantId
      },
      ctx.auth?.tenantId ?? null,
      "created"
    );
    return { invoiceId: invoice.id };
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve("em").fork();
    return loadInvoiceSnapshot(em, result.invoiceId);
  },
  buildLog: async ({ result, snapshots }) => {
    const after = snapshots.after;
    if (!after) return null;
    const { translate } = await resolveTranslations();
    return {
      actionLabel: translate("sales.audit.invoices.create", "Create invoice"),
      resourceKind: "sales.invoice",
      resourceId: result.invoiceId,
      tenantId: after.invoice.tenantId,
      organizationId: after.invoice.organizationId,
      snapshotAfter: after,
      payload: {
        undo: { after }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const after = payload?.after;
    if (!after) return;
    const em = ctx.container.resolve("em").fork();
    const invoice = await em.findOne(SalesInvoice, { id: after.invoice.id });
    if (!invoice) return;
    ensureOrganizationScope(ctx, invoice.organizationId);
    ensureTenantScope(ctx, invoice.tenantId);
    await em.nativeDelete(SalesInvoiceLine, { invoice: invoice.id });
    em.remove(invoice);
    await em.flush();
  }
};
const invoiceUpdateChangeKeys = [
  "invoiceNumber",
  "statusEntryId",
  "status",
  "issueDate",
  "dueDate",
  "currencyCode",
  "subtotalNetAmount",
  "subtotalGrossAmount",
  "discountTotalAmount",
  "taxTotalAmount",
  "grandTotalNetAmount",
  "grandTotalGrossAmount",
  "paidTotalAmount",
  "outstandingAmount",
  "metadata"
];
function toAuditISOString(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}
function auditValuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (left instanceof Date || right instanceof Date) {
    const leftIso = toAuditISOString(left);
    const rightIso = toAuditISOString(right);
    return leftIso !== null && rightIso !== null && leftIso === rightIso;
  }
  return isDeepStrictEqual(left, right);
}
function buildAuditChanges(before, after, keys) {
  const changedKeys = keys.filter((key) => !auditValuesEqual(before[key], after[key]));
  return buildChanges(before, after, changedKeys);
}
function selectInvoiceUpdateChangeKeys(input) {
  return invoiceUpdateChangeKeys.filter(
    (key) => key === "status" ? input.statusEntryId !== void 0 : input[key] !== void 0
  );
}
function applyInvoiceHeaderUpdate(invoice, input, resolvedStatus) {
  if (input.invoiceNumber !== void 0) invoice.invoiceNumber = input.invoiceNumber;
  if (input.statusEntryId !== void 0) {
    invoice.statusEntryId = input.statusEntryId;
    invoice.status = resolvedStatus ?? null;
  }
  if (input.issueDate !== void 0) invoice.issueDate = input.issueDate;
  if (input.dueDate !== void 0) invoice.dueDate = input.dueDate;
  if (input.currencyCode !== void 0) invoice.currencyCode = input.currencyCode;
  if (input.subtotalNetAmount !== void 0) invoice.subtotalNetAmount = toNumericString(input.subtotalNetAmount);
  if (input.subtotalGrossAmount !== void 0) invoice.subtotalGrossAmount = toNumericString(input.subtotalGrossAmount);
  if (input.discountTotalAmount !== void 0) invoice.discountTotalAmount = toNumericString(input.discountTotalAmount);
  if (input.taxTotalAmount !== void 0) invoice.taxTotalAmount = toNumericString(input.taxTotalAmount);
  if (input.grandTotalNetAmount !== void 0) invoice.grandTotalNetAmount = toNumericString(input.grandTotalNetAmount);
  if (input.grandTotalGrossAmount !== void 0) invoice.grandTotalGrossAmount = toNumericString(input.grandTotalGrossAmount);
  if (input.paidTotalAmount !== void 0) invoice.paidTotalAmount = toNumericString(input.paidTotalAmount);
  if (input.outstandingAmount !== void 0) invoice.outstandingAmount = toNumericString(input.outstandingAmount);
  if (input.metadata !== void 0) invoice.metadata = input.metadata;
}
const updateInvoiceCommand = {
  id: "sales.invoices.update",
  async prepare(input, ctx) {
    const id = requireId(input);
    const em = ctx.container.resolve("em");
    const snapshot = await loadInvoiceSnapshot(em, id);
    if (snapshot) {
      ensureOrganizationScope(ctx, snapshot.invoice.organizationId);
      ensureTenantScope(ctx, snapshot.invoice.tenantId);
    }
    return snapshot ? { before: snapshot } : {};
  },
  async execute(rawInput, ctx) {
    const parsed = invoiceUpdateSchema.parse(rawInput ?? {});
    const id = requireId(parsed);
    ensureOrganizationScope(ctx, parsed.organizationId);
    ensureTenantScope(ctx, parsed.tenantId);
    const em = ctx.container.resolve("em").fork();
    const invoice = await em.findOneOrFail(SalesInvoice, {
      id,
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      deletedAt: null
    });
    let resolvedStatus;
    if (parsed.statusEntryId !== void 0) {
      resolvedStatus = await resolveDictionaryEntryValue(em, parsed.statusEntryId ?? null, { tenantId: invoice.tenantId });
    }
    applyInvoiceHeaderUpdate(invoice, parsed, resolvedStatus);
    invoice.updatedAt = /* @__PURE__ */ new Date();
    await em.flush();
    const dataEngine = ctx.container.resolve("dataEngine");
    await emitCrudSideEffects({
      dataEngine,
      action: "updated",
      entity: invoice,
      identifiers: {
        id: invoice.id,
        organizationId: invoice.organizationId,
        tenantId: invoice.tenantId
      },
      events: invoiceCrudEvents,
      indexer: { entityType: E.sales.sales_invoice }
    });
    await invalidateCrudCache(
      ctx.container,
      "sales.invoice",
      {
        id: invoice.id,
        organizationId: invoice.organizationId,
        tenantId: invoice.tenantId
      },
      ctx.auth?.tenantId ?? null,
      "updated"
    );
    return { invoiceId: invoice.id };
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve("em").fork();
    return loadInvoiceSnapshot(em, result.invoiceId);
  },
  buildLog: async ({ input, result, snapshots }) => {
    const before = snapshots.before;
    const after = snapshots.after;
    if (!after) return null;
    const { translate } = await resolveTranslations();
    const changes = before ? buildAuditChanges(
      before.invoice,
      after.invoice,
      selectInvoiceUpdateChangeKeys(input)
    ) : {};
    return {
      actionLabel: translate("sales.audit.invoices.update", "Update invoice"),
      resourceKind: "sales.invoice",
      resourceId: result.invoiceId,
      tenantId: after.invoice.tenantId,
      organizationId: after.invoice.organizationId,
      snapshotBefore: before,
      snapshotAfter: after,
      changes: Object.keys(changes).length ? changes : null,
      payload: {
        undo: { before, after }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const before = payload?.before;
    if (!before) return;
    const em = ctx.container.resolve("em").fork();
    const invoice = await em.findOne(SalesInvoice, { id: before.invoice.id });
    if (!invoice) return;
    ensureOrganizationScope(ctx, invoice.organizationId);
    ensureTenantScope(ctx, invoice.tenantId);
    invoice.invoiceNumber = before.invoice.invoiceNumber;
    invoice.orderId = before.invoice.orderId;
    invoice.statusEntryId = before.invoice.statusEntryId;
    invoice.status = before.invoice.status;
    invoice.issueDate = before.invoice.issueDate ? new Date(before.invoice.issueDate) : null;
    invoice.dueDate = before.invoice.dueDate ? new Date(before.invoice.dueDate) : null;
    invoice.currencyCode = before.invoice.currencyCode;
    invoice.subtotalNetAmount = before.invoice.subtotalNetAmount;
    invoice.subtotalGrossAmount = before.invoice.subtotalGrossAmount;
    invoice.discountTotalAmount = before.invoice.discountTotalAmount;
    invoice.taxTotalAmount = before.invoice.taxTotalAmount;
    invoice.grandTotalNetAmount = before.invoice.grandTotalNetAmount;
    invoice.grandTotalGrossAmount = before.invoice.grandTotalGrossAmount;
    invoice.paidTotalAmount = before.invoice.paidTotalAmount;
    invoice.outstandingAmount = before.invoice.outstandingAmount;
    invoice.metadata = before.invoice.metadata;
    invoice.updatedAt = /* @__PURE__ */ new Date();
    await em.flush();
  }
};
const deleteInvoiceCommand = {
  id: "sales.invoices.delete",
  async prepare(input, ctx) {
    const id = requireId(input);
    const em = ctx.container.resolve("em");
    const snapshot = await loadInvoiceSnapshot(em, id);
    if (snapshot) {
      ensureOrganizationScope(ctx, snapshot.invoice.organizationId);
      ensureTenantScope(ctx, snapshot.invoice.tenantId);
    }
    return snapshot ? { before: snapshot } : {};
  },
  async execute(rawInput, ctx) {
    const id = requireId(rawInput);
    ensureOrganizationScope(ctx, rawInput.organizationId);
    ensureTenantScope(ctx, rawInput.tenantId);
    const em = ctx.container.resolve("em").fork();
    const invoice = await em.findOneOrFail(SalesInvoice, {
      id,
      organizationId: rawInput.organizationId,
      tenantId: rawInput.tenantId,
      deletedAt: null
    });
    invoice.deletedAt = /* @__PURE__ */ new Date();
    invoice.updatedAt = /* @__PURE__ */ new Date();
    await em.flush();
    const dataEngine = ctx.container.resolve("dataEngine");
    await emitCrudSideEffects({
      dataEngine,
      action: "deleted",
      entity: invoice,
      identifiers: {
        id: invoice.id,
        organizationId: invoice.organizationId,
        tenantId: invoice.tenantId
      },
      events: invoiceCrudEvents,
      indexer: { entityType: E.sales.sales_invoice }
    });
    await invalidateCrudCache(
      ctx.container,
      "sales.invoice",
      {
        id: invoice.id,
        organizationId: invoice.organizationId,
        tenantId: invoice.tenantId
      },
      ctx.auth?.tenantId ?? null,
      "deleted"
    );
    return { invoiceId: invoice.id };
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before;
    if (!before) return null;
    const { translate } = await resolveTranslations();
    return {
      actionLabel: translate("sales.audit.invoices.delete", "Delete invoice"),
      resourceKind: "sales.invoice",
      resourceId: before.invoice.id,
      tenantId: before.invoice.tenantId,
      organizationId: before.invoice.organizationId,
      snapshotBefore: before,
      payload: {
        undo: { before }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const before = payload?.before;
    if (!before) return;
    const em = ctx.container.resolve("em").fork();
    ensureOrganizationScope(ctx, before.invoice.organizationId);
    ensureTenantScope(ctx, before.invoice.tenantId);
    const restored = em.create(SalesInvoice, {
      id: before.invoice.id,
      organizationId: before.invoice.organizationId,
      tenantId: before.invoice.tenantId,
      invoiceNumber: before.invoice.invoiceNumber,
      orderId: before.invoice.orderId,
      statusEntryId: before.invoice.statusEntryId,
      status: before.invoice.status,
      issueDate: before.invoice.issueDate ? new Date(before.invoice.issueDate) : /* @__PURE__ */ new Date(),
      dueDate: before.invoice.dueDate ? new Date(before.invoice.dueDate) : null,
      currencyCode: before.invoice.currencyCode,
      subtotalNetAmount: before.invoice.subtotalNetAmount,
      subtotalGrossAmount: before.invoice.subtotalGrossAmount,
      discountTotalAmount: before.invoice.discountTotalAmount,
      taxTotalAmount: before.invoice.taxTotalAmount,
      grandTotalNetAmount: before.invoice.grandTotalNetAmount,
      grandTotalGrossAmount: before.invoice.grandTotalGrossAmount,
      paidTotalAmount: before.invoice.paidTotalAmount,
      outstandingAmount: before.invoice.outstandingAmount,
      metadata: before.invoice.metadata,
      customFieldSetId: before.invoice.customFieldSetId,
      deletedAt: null,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    em.persist(restored);
    for (const line of before.lines) {
      em.persist(em.create(SalesInvoiceLine, {
        id: line.id,
        invoice: restored,
        orderLineId: line.orderLineId,
        organizationId: before.invoice.organizationId,
        tenantId: before.invoice.tenantId,
        lineNumber: line.lineNumber,
        kind: line.kind,
        name: line.name,
        sku: line.sku,
        description: line.description,
        quantity: line.quantity,
        quantityUnit: line.quantityUnit,
        normalizedQuantity: line.normalizedQuantity,
        normalizedUnit: line.normalizedUnit,
        uomSnapshot: line.uomSnapshot,
        currencyCode: line.currencyCode,
        unitPriceNet: line.unitPriceNet,
        unitPriceGross: line.unitPriceGross,
        discountAmount: line.discountAmount,
        discountPercent: line.discountPercent,
        taxRate: line.taxRate,
        taxAmount: line.taxAmount,
        totalNetAmount: toNumericString(
          deriveLineNetFromGross(line.totalNetAmount, line.totalGrossAmount, line.taxRate)
        ),
        totalGrossAmount: line.totalGrossAmount,
        metadata: line.metadata
      }));
    }
    await em.flush();
  }
};
const creditMemoCrudEvents = {
  module: "sales",
  entity: "credit_memo",
  persistent: true,
  buildPayload: (ctx) => ({
    id: ctx.identifiers.id,
    organizationId: ctx.identifiers.organizationId,
    tenantId: ctx.identifiers.tenantId
  })
};
const createCreditMemoCommand = {
  id: "sales.credit_memos.create",
  async execute(rawInput, ctx) {
    const generator = ctx.container.resolve(
      "salesDocumentNumberGenerator"
    );
    const initial = creditMemoCreateSchema.parse(rawInput ?? {});
    const creditMemoNumber = typeof initial.creditMemoNumber === "string" && initial.creditMemoNumber.trim().length ? initial.creditMemoNumber.trim() : (await generator.generate({
      kind: "credit_memo",
      organizationId: initial.organizationId,
      tenantId: initial.tenantId
    })).number;
    const parsed = creditMemoCreateSchema.parse({ ...initial, creditMemoNumber });
    const ensuredCreditMemoNumber = parsed.creditMemoNumber ?? creditMemoNumber;
    if (!ensuredCreditMemoNumber) {
      throw new CrudHttpError(400, { error: "Credit memo number is required." });
    }
    ensureOrganizationScope(ctx, parsed.organizationId);
    ensureTenantScope(ctx, parsed.tenantId);
    const em = ctx.container.resolve("em").fork();
    const status = await resolveDictionaryEntryValue(
      em,
      parsed.statusEntryId ?? null,
      { tenantId: parsed.tenantId }
    );
    if (parsed.orderId) {
      const orderExists = await findOneWithDecryption(
        em,
        SalesOrder,
        {
          id: parsed.orderId,
          organizationId: parsed.organizationId,
          tenantId: parsed.tenantId,
          deletedAt: null
        },
        {},
        {
          tenantId: parsed.tenantId,
          organizationId: parsed.organizationId
        }
      );
      if (!orderExists) {
        throw new CrudHttpError(400, { error: "Referenced order not found in current scope." });
      }
    }
    if (parsed.invoiceId) {
      const invoiceExists = await em.findOne(SalesInvoice, {
        id: parsed.invoiceId,
        organizationId: parsed.organizationId,
        tenantId: parsed.tenantId,
        deletedAt: null
      });
      if (!invoiceExists) {
        throw new CrudHttpError(400, { error: "Referenced invoice not found in current scope." });
      }
    }
    const creditMemoId = randomUUID();
    const creditMemo = em.create(SalesCreditMemo, {
      id: creditMemoId,
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      creditMemoNumber: ensuredCreditMemoNumber,
      order: parsed.orderId ? em.getReference(SalesOrder, parsed.orderId) : null,
      invoice: parsed.invoiceId ? em.getReference(SalesInvoice, parsed.invoiceId) : null,
      statusEntryId: parsed.statusEntryId ?? null,
      status,
      reason: parsed.reason ?? null,
      issueDate: parsed.issueDate ?? /* @__PURE__ */ new Date(),
      currencyCode: parsed.currencyCode,
      subtotalNetAmount: toNumericString(parsed.subtotalNetAmount ?? 0),
      subtotalGrossAmount: toNumericString(parsed.subtotalGrossAmount ?? 0),
      taxTotalAmount: toNumericString(parsed.taxTotalAmount ?? 0),
      grandTotalNetAmount: toNumericString(parsed.grandTotalNetAmount ?? 0),
      grandTotalGrossAmount: toNumericString(parsed.grandTotalGrossAmount ?? 0),
      metadata: parsed.metadata ?? null,
      customFieldSetId: parsed.customFieldSetId ?? null,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    await withAtomicFlush(
      em,
      [
        async () => {
          em.persist(creditMemo);
          if (parsed.lines?.length) {
            for (let i = 0; i < parsed.lines.length; i++) {
              const line = parsed.lines[i];
              em.persist(
                em.create(SalesCreditMemoLine, {
                  id: randomUUID(),
                  creditMemo,
                  orderLineId: line.orderLineId ?? null,
                  organizationId: parsed.organizationId,
                  tenantId: parsed.tenantId,
                  lineNumber: line.lineNumber ?? i + 1,
                  name: line.name ?? null,
                  sku: line.sku ?? null,
                  description: line.description ?? null,
                  quantity: toNumericString(line.quantity ?? 0),
                  quantityUnit: line.quantityUnit ?? null,
                  normalizedQuantity: toNumericString(line.normalizedQuantity ?? 0),
                  normalizedUnit: line.normalizedUnit ?? null,
                  uomSnapshot: line.uomSnapshot ?? null,
                  currencyCode: line.currencyCode ?? parsed.currencyCode,
                  unitPriceNet: toNumericString(line.unitPriceNet ?? 0),
                  unitPriceGross: toNumericString(line.unitPriceGross ?? 0),
                  taxRate: toNumericString(line.taxRate ?? 0),
                  taxAmount: toNumericString(line.taxAmount ?? 0),
                  totalNetAmount: toNumericString(
                    deriveLineNetFromGross(line.totalNetAmount ?? 0, line.totalGrossAmount ?? 0, line.taxRate ?? 0)
                  ),
                  totalGrossAmount: toNumericString(line.totalGrossAmount ?? 0),
                  metadata: line.metadata ?? null
                })
              );
            }
          }
          if (parsed.customFieldSetId) {
            await setRecordCustomFields(em, {
              entityId: E.sales.sales_credit_memo,
              recordId: creditMemoId,
              organizationId: parsed.organizationId,
              tenantId: parsed.tenantId,
              values: normalizeCustomFieldValues(
                parsed.customFields ?? {}
              )
            });
          }
        }
      ],
      { transaction: true }
    );
    const dataEngine = ctx.container.resolve("dataEngine");
    await emitCrudSideEffects({
      dataEngine,
      action: "created",
      entity: creditMemo,
      identifiers: {
        id: creditMemo.id,
        organizationId: creditMemo.organizationId,
        tenantId: creditMemo.tenantId
      },
      events: creditMemoCrudEvents,
      indexer: { entityType: E.sales.sales_credit_memo }
    });
    await invalidateCrudCache(
      ctx.container,
      "sales.credit_memo",
      {
        id: creditMemo.id,
        organizationId: creditMemo.organizationId,
        tenantId: creditMemo.tenantId
      },
      ctx.auth?.tenantId ?? null,
      "created"
    );
    return { creditMemoId: creditMemo.id };
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve("em").fork();
    return loadCreditMemoSnapshot(em, result.creditMemoId);
  },
  buildLog: async ({ result, snapshots }) => {
    const after = snapshots.after;
    if (!after) return null;
    const { translate } = await resolveTranslations();
    return {
      actionLabel: translate("sales.audit.credit_memos.create", "Create credit memo"),
      resourceKind: "sales.credit_memo",
      resourceId: result.creditMemoId,
      tenantId: after.creditMemo.tenantId,
      organizationId: after.creditMemo.organizationId,
      snapshotAfter: after,
      payload: {
        undo: { after }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const after = payload?.after;
    if (!after) return;
    const em = ctx.container.resolve("em").fork();
    const creditMemo = await em.findOne(SalesCreditMemo, { id: after.creditMemo.id });
    if (!creditMemo) return;
    ensureOrganizationScope(ctx, creditMemo.organizationId);
    ensureTenantScope(ctx, creditMemo.tenantId);
    await em.nativeDelete(SalesCreditMemoLine, { creditMemo: creditMemo.id });
    em.remove(creditMemo);
    await em.flush();
  }
};
const creditMemoUpdateChangeKeys = [
  "creditMemoNumber",
  "statusEntryId",
  "status",
  "reason",
  "issueDate",
  "currencyCode",
  "subtotalNetAmount",
  "subtotalGrossAmount",
  "taxTotalAmount",
  "grandTotalNetAmount",
  "grandTotalGrossAmount",
  "metadata"
];
function selectCreditMemoUpdateChangeKeys(input) {
  return creditMemoUpdateChangeKeys.filter(
    (key) => key === "status" ? input.statusEntryId !== void 0 : input[key] !== void 0
  );
}
function applyCreditMemoHeaderUpdate(creditMemo, input, resolvedStatus) {
  if (input.creditMemoNumber !== void 0) creditMemo.creditMemoNumber = input.creditMemoNumber;
  if (input.statusEntryId !== void 0) {
    creditMemo.statusEntryId = input.statusEntryId;
    creditMemo.status = resolvedStatus ?? null;
  }
  if (input.reason !== void 0) creditMemo.reason = input.reason;
  if (input.issueDate !== void 0) creditMemo.issueDate = input.issueDate;
  if (input.currencyCode !== void 0) creditMemo.currencyCode = input.currencyCode;
  if (input.subtotalNetAmount !== void 0) creditMemo.subtotalNetAmount = toNumericString(input.subtotalNetAmount);
  if (input.subtotalGrossAmount !== void 0) creditMemo.subtotalGrossAmount = toNumericString(input.subtotalGrossAmount);
  if (input.taxTotalAmount !== void 0) creditMemo.taxTotalAmount = toNumericString(input.taxTotalAmount);
  if (input.grandTotalNetAmount !== void 0) creditMemo.grandTotalNetAmount = toNumericString(input.grandTotalNetAmount);
  if (input.grandTotalGrossAmount !== void 0) creditMemo.grandTotalGrossAmount = toNumericString(input.grandTotalGrossAmount);
  if (input.metadata !== void 0) creditMemo.metadata = input.metadata;
}
const updateCreditMemoCommand = {
  id: "sales.credit_memos.update",
  async prepare(input, ctx) {
    const id = requireId(input);
    const em = ctx.container.resolve("em");
    const snapshot = await loadCreditMemoSnapshot(em, id);
    if (snapshot) {
      ensureOrganizationScope(ctx, snapshot.creditMemo.organizationId);
      ensureTenantScope(ctx, snapshot.creditMemo.tenantId);
    }
    return snapshot ? { before: snapshot } : {};
  },
  async execute(rawInput, ctx) {
    const parsed = creditMemoUpdateSchema.parse(rawInput ?? {});
    const id = requireId(parsed);
    ensureOrganizationScope(ctx, parsed.organizationId);
    ensureTenantScope(ctx, parsed.tenantId);
    const em = ctx.container.resolve("em").fork();
    const creditMemo = await em.findOneOrFail(SalesCreditMemo, {
      id,
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      deletedAt: null
    });
    let resolvedStatus;
    if (parsed.statusEntryId !== void 0) {
      resolvedStatus = await resolveDictionaryEntryValue(em, parsed.statusEntryId ?? null, { tenantId: creditMemo.tenantId });
    }
    applyCreditMemoHeaderUpdate(creditMemo, parsed, resolvedStatus);
    creditMemo.updatedAt = /* @__PURE__ */ new Date();
    await em.flush();
    const dataEngine = ctx.container.resolve("dataEngine");
    await emitCrudSideEffects({
      dataEngine,
      action: "updated",
      entity: creditMemo,
      identifiers: {
        id: creditMemo.id,
        organizationId: creditMemo.organizationId,
        tenantId: creditMemo.tenantId
      },
      events: creditMemoCrudEvents,
      indexer: { entityType: E.sales.sales_credit_memo }
    });
    await invalidateCrudCache(
      ctx.container,
      "sales.credit_memo",
      {
        id: creditMemo.id,
        organizationId: creditMemo.organizationId,
        tenantId: creditMemo.tenantId
      },
      ctx.auth?.tenantId ?? null,
      "updated"
    );
    return { creditMemoId: creditMemo.id };
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve("em").fork();
    return loadCreditMemoSnapshot(em, result.creditMemoId);
  },
  buildLog: async ({ input, result, snapshots }) => {
    const before = snapshots.before;
    const after = snapshots.after;
    if (!after) return null;
    const { translate } = await resolveTranslations();
    const changes = before ? buildAuditChanges(
      before.creditMemo,
      after.creditMemo,
      selectCreditMemoUpdateChangeKeys(input)
    ) : {};
    return {
      actionLabel: translate("sales.audit.credit_memos.update", "Update credit memo"),
      resourceKind: "sales.credit_memo",
      resourceId: result.creditMemoId,
      tenantId: after.creditMemo.tenantId,
      organizationId: after.creditMemo.organizationId,
      snapshotBefore: before,
      snapshotAfter: after,
      changes: Object.keys(changes).length ? changes : null,
      payload: {
        undo: { before, after }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const before = payload?.before;
    if (!before) return;
    const em = ctx.container.resolve("em").fork();
    const creditMemo = await em.findOne(SalesCreditMemo, { id: before.creditMemo.id });
    if (!creditMemo) return;
    ensureOrganizationScope(ctx, creditMemo.organizationId);
    ensureTenantScope(ctx, creditMemo.tenantId);
    creditMemo.creditMemoNumber = before.creditMemo.creditMemoNumber;
    creditMemo.order = before.creditMemo.orderId ? em.getReference(SalesOrder, before.creditMemo.orderId) : null;
    creditMemo.invoice = before.creditMemo.invoiceId ? em.getReference(SalesInvoice, before.creditMemo.invoiceId) : null;
    creditMemo.statusEntryId = before.creditMemo.statusEntryId;
    creditMemo.status = before.creditMemo.status;
    creditMemo.reason = before.creditMemo.reason;
    creditMemo.issueDate = before.creditMemo.issueDate ? new Date(before.creditMemo.issueDate) : null;
    creditMemo.currencyCode = before.creditMemo.currencyCode;
    creditMemo.subtotalNetAmount = before.creditMemo.subtotalNetAmount;
    creditMemo.subtotalGrossAmount = before.creditMemo.subtotalGrossAmount;
    creditMemo.taxTotalAmount = before.creditMemo.taxTotalAmount;
    creditMemo.grandTotalNetAmount = before.creditMemo.grandTotalNetAmount;
    creditMemo.grandTotalGrossAmount = before.creditMemo.grandTotalGrossAmount;
    creditMemo.metadata = before.creditMemo.metadata;
    creditMemo.updatedAt = /* @__PURE__ */ new Date();
    await em.flush();
  }
};
const deleteCreditMemoCommand = {
  id: "sales.credit_memos.delete",
  async prepare(input, ctx) {
    const id = requireId(input);
    const em = ctx.container.resolve("em");
    const snapshot = await loadCreditMemoSnapshot(em, id);
    if (snapshot) {
      ensureOrganizationScope(ctx, snapshot.creditMemo.organizationId);
      ensureTenantScope(ctx, snapshot.creditMemo.tenantId);
    }
    return snapshot ? { before: snapshot } : {};
  },
  async execute(rawInput, ctx) {
    const id = requireId(rawInput);
    ensureOrganizationScope(ctx, rawInput.organizationId);
    ensureTenantScope(ctx, rawInput.tenantId);
    const em = ctx.container.resolve("em").fork();
    const creditMemo = await em.findOneOrFail(SalesCreditMemo, {
      id,
      organizationId: rawInput.organizationId,
      tenantId: rawInput.tenantId,
      deletedAt: null
    });
    creditMemo.deletedAt = /* @__PURE__ */ new Date();
    creditMemo.updatedAt = /* @__PURE__ */ new Date();
    await em.flush();
    const dataEngine = ctx.container.resolve("dataEngine");
    await emitCrudSideEffects({
      dataEngine,
      action: "deleted",
      entity: creditMemo,
      identifiers: {
        id: creditMemo.id,
        organizationId: creditMemo.organizationId,
        tenantId: creditMemo.tenantId
      },
      events: creditMemoCrudEvents,
      indexer: { entityType: E.sales.sales_credit_memo }
    });
    await invalidateCrudCache(
      ctx.container,
      "sales.credit_memo",
      {
        id: creditMemo.id,
        organizationId: creditMemo.organizationId,
        tenantId: creditMemo.tenantId
      },
      ctx.auth?.tenantId ?? null,
      "deleted"
    );
    return { creditMemoId: creditMemo.id };
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before;
    if (!before) return null;
    const { translate } = await resolveTranslations();
    return {
      actionLabel: translate("sales.audit.credit_memos.delete", "Delete credit memo"),
      resourceKind: "sales.credit_memo",
      resourceId: before.creditMemo.id,
      tenantId: before.creditMemo.tenantId,
      organizationId: before.creditMemo.organizationId,
      snapshotBefore: before,
      payload: {
        undo: { before }
      }
    };
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload(logEntry);
    const before = payload?.before;
    if (!before) return;
    const em = ctx.container.resolve("em").fork();
    ensureOrganizationScope(ctx, before.creditMemo.organizationId);
    ensureTenantScope(ctx, before.creditMemo.tenantId);
    const restored = em.create(SalesCreditMemo, {
      id: before.creditMemo.id,
      organizationId: before.creditMemo.organizationId,
      tenantId: before.creditMemo.tenantId,
      creditMemoNumber: before.creditMemo.creditMemoNumber,
      order: before.creditMemo.orderId ? em.getReference(SalesOrder, before.creditMemo.orderId) : null,
      invoice: before.creditMemo.invoiceId ? em.getReference(SalesInvoice, before.creditMemo.invoiceId) : null,
      statusEntryId: before.creditMemo.statusEntryId,
      status: before.creditMemo.status,
      reason: before.creditMemo.reason,
      issueDate: before.creditMemo.issueDate ? new Date(before.creditMemo.issueDate) : /* @__PURE__ */ new Date(),
      currencyCode: before.creditMemo.currencyCode,
      subtotalNetAmount: before.creditMemo.subtotalNetAmount,
      subtotalGrossAmount: before.creditMemo.subtotalGrossAmount,
      taxTotalAmount: before.creditMemo.taxTotalAmount,
      grandTotalNetAmount: before.creditMemo.grandTotalNetAmount,
      grandTotalGrossAmount: before.creditMemo.grandTotalGrossAmount,
      metadata: before.creditMemo.metadata,
      customFieldSetId: before.creditMemo.customFieldSetId,
      deletedAt: null,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    em.persist(restored);
    for (const line of before.lines) {
      em.persist(em.create(SalesCreditMemoLine, {
        id: line.id,
        creditMemo: restored,
        orderLineId: line.orderLineId,
        organizationId: before.creditMemo.organizationId,
        tenantId: before.creditMemo.tenantId,
        lineNumber: line.lineNumber,
        name: line.name,
        sku: line.sku,
        description: line.description,
        quantity: line.quantity,
        quantityUnit: line.quantityUnit,
        normalizedQuantity: line.normalizedQuantity,
        normalizedUnit: line.normalizedUnit,
        uomSnapshot: line.uomSnapshot,
        currencyCode: line.currencyCode,
        unitPriceNet: line.unitPriceNet,
        unitPriceGross: line.unitPriceGross,
        taxRate: line.taxRate,
        taxAmount: line.taxAmount,
        totalNetAmount: toNumericString(
          deriveLineNetFromGross(line.totalNetAmount, line.totalGrossAmount, line.taxRate)
        ),
        totalGrossAmount: line.totalGrossAmount,
        metadata: line.metadata
      }));
    }
    await em.flush();
  }
};
registerCommand(updateQuoteCommand);
registerCommand(createQuoteCommand);
registerCommand(deleteQuoteCommand);
registerCommand(convertQuoteToOrderCommand);
registerCommand(updateOrderCommand);
registerCommand(createOrderCommand);
registerCommand(deleteOrderCommand);
registerCommand(orderLineUpsertCommand);
registerCommand(orderLineDeleteCommand);
registerCommand(quoteLineUpsertCommand);
registerCommand(quoteLineDeleteCommand);
registerCommand(orderAdjustmentUpsertCommand);
registerCommand(orderAdjustmentDeleteCommand);
registerCommand(quoteAdjustmentUpsertCommand);
registerCommand(quoteAdjustmentDeleteCommand);
registerCommand(createInvoiceCommand);
registerCommand(updateInvoiceCommand);
registerCommand(deleteInvoiceCommand);
registerCommand(createCreditMemoCommand);
registerCommand(updateCreditMemoCommand);
registerCommand(deleteCreditMemoCommand);
export {
  documentUpdateSchema
};
//# sourceMappingURL=documents.js.map
