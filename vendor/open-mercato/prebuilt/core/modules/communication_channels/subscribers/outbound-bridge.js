import { findOneWithDecryption } from "@open-mercato/shared/lib/encryption/find";
import { ChannelThreadMapping, CommunicationChannel, MessageChannelLink } from "../data/entities.js";
import { Message } from "../../messages/data/entities.js";
import { SEND_AS_USER_SOURCE_ENTITY_TYPE } from "../../messages/lib/messageSourceEntityTypes.js";
import { isIngestedInboundMessage } from "../lib/inbound-message-origin.js";
import { isOutboundDeliveryIntended } from "../lib/outbound-delivery-intent.js";
import { createLogger } from "@open-mercato/shared/lib/logger";
import { COMMUNICATION_CHANNELS_QUEUES, getCommunicationChannelsQueue } from "../lib/queue.js";
const logger = createLogger("communication_channels");
async function auditRefusal(ctx, em, input) {
  try {
    const service = resolveFromCtx(ctx, "actionLogService");
    await service.log(
      {
        tenantId: input.tenantId,
        organizationId: input.organizationId ?? null,
        actorUserId: input.actorUserId ?? null,
        commandId: input.commandId,
        actionLabel: input.actionLabel,
        resourceKind: "communication_channel",
        resourceId: input.channelId ?? void 0,
        executionState: "failed",
        context: { messageId: input.messageId, ...input.context }
      },
      em
    );
  } catch (error) {
    logger.warn("outbound_bridge.audit_failed", {
      messageId: input.messageId,
      reason: String(error).slice(0, 200)
    });
  }
}
const metadata = {
  event: "messages.message.sent",
  persistent: true,
  id: "communication_channels:outbound-bridge"
};
function resolveFromCtx(ctx, name) {
  if (typeof ctx?.resolve === "function") return ctx.resolve(name);
  if (ctx?.container && typeof ctx.container.resolve === "function") {
    return ctx.container.resolve(name);
  }
  throw new Error(`outbound-bridge: subscriber context has no resolver (looking for '${name}')`);
}
async function handler(payload, ctx) {
  if (!payload?.messageId || !payload.tenantId) {
    return;
  }
  const em = resolveFromCtx(ctx, "em").fork();
  const dscope = {
    tenantId: payload.tenantId,
    organizationId: payload.organizationId ?? null
  };
  const message = await findOneWithDecryption(
    em,
    Message,
    {
      id: payload.messageId,
      tenantId: payload.tenantId,
      organizationId: payload.organizationId ?? null,
      deletedAt: null
    },
    void 0,
    dscope
  );
  if (!message) return;
  if (message.sourceEntityType === SEND_AS_USER_SOURCE_ENTITY_TYPE) {
    return;
  }
  if (!isOutboundDeliveryIntended({ message, forwardedFromMessageId: payload.forwardedFrom })) {
    return;
  }
  if (!message.threadId) return;
  const mapping = await findOneWithDecryption(
    em,
    ChannelThreadMapping,
    {
      messageThreadId: message.threadId,
      tenantId: payload.tenantId,
      organizationId: payload.organizationId ?? null
    },
    void 0,
    dscope
  );
  if (!mapping) return;
  const existingLink = await findOneWithDecryption(
    em,
    MessageChannelLink,
    {
      messageId: message.id,
      tenantId: payload.tenantId,
      organizationId: payload.organizationId ?? null
    },
    void 0,
    dscope
  );
  if (await isIngestedInboundMessage(em, { message, existingLink, tenantId: payload.tenantId })) {
    return;
  }
  if (existingLink && (existingLink.deliveryStatus === "queued" || existingLink.deliveryStatus === "pending" || existingLink.deliveryStatus === "sent" || existingLink.deliveryStatus === "delivered" || existingLink.deliveryStatus === "read")) {
    return;
  }
  const channel = await findOneWithDecryption(
    em,
    CommunicationChannel,
    {
      id: mapping.channelId,
      tenantId: payload.tenantId,
      organizationId: payload.organizationId ?? null,
      deletedAt: null
    },
    void 0,
    dscope
  );
  if (!channel) {
    logger.warn("outbound_bridge.channel_missing", {
      messageId: message.id,
      channelId: mapping.channelId,
      tenantId: payload.tenantId
    });
    await auditRefusal(ctx, em, {
      commandId: "communication_channels.outbound_blocked",
      actionLabel: "Outbound blocked: channel mapping without a live channel",
      tenantId: payload.tenantId,
      organizationId: payload.organizationId ?? null,
      actorUserId: message.senderUserId ?? null,
      channelId: mapping.channelId,
      messageId: message.id,
      context: { reason: "channel_missing" }
    });
    return;
  }
  if (channel.userId != null && channel.userId !== message.senderUserId) {
    logger.warn("outbound_bridge.ownership_rejected", {
      messageId: message.id,
      channelId: channel.id,
      senderUserId: message.senderUserId ?? null,
      channelOwnerUserId: channel.userId,
      tenantId: payload.tenantId
    });
    await auditRefusal(ctx, em, {
      commandId: "communication_channels.outbound_blocked",
      actionLabel: "Outbound blocked: sender does not own the channel",
      tenantId: payload.tenantId,
      organizationId: payload.organizationId ?? null,
      actorUserId: message.senderUserId ?? null,
      channelId: channel.id,
      messageId: message.id,
      context: { reason: "ownership_mismatch", channelOwnerUserId: channel.userId }
    });
    return;
  }
  const queue = getCommunicationChannelsQueue(COMMUNICATION_CHANNELS_QUEUES.outbound);
  const job = {
    messageId: message.id,
    scope: {
      tenantId: payload.tenantId,
      organizationId: payload.organizationId ?? null
    },
    attempt: 1
  };
  await queue.enqueue(job);
}
export {
  handler as default,
  metadata
};
//# sourceMappingURL=outbound-bridge.js.map
