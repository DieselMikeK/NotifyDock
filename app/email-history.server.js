import prisma from "./db.server";
import {METRIC_NAMES, listNotifyDockEventsForOrder} from "./klaviyo.server";

const EMAIL_TYPE_BY_METRIC_NAME = Object.fromEntries(
  Object.entries(METRIC_NAMES).map(([emailType, metricName]) => [metricName, emailType]),
);
const EMAIL_HISTORY_SETUP_ERROR =
  "Notify Dock email history is not ready yet. Run prisma generate and apply the latest migration.";
const MAX_VISIBLE_HISTORY_ITEMS = 8;

export async function listEmailHistory({orderId, shop}) {
  const historyModel = getHistoryModel();
  const history = await historyModel.findMany({
    where: {
      orderId,
      shop,
    },
    orderBy: {
      sentAt: "desc",
    },
    take: MAX_VISIBLE_HISTORY_ITEMS + 1,
  });

  return {
    hasMore: history.length > MAX_VISIBLE_HISTORY_ITEMS,
    history: history.slice(0, MAX_VISIBLE_HISTORY_ITEMS),
  };
}

export async function getEmailHistoryById({id, shop}) {
  const historyModel = getHistoryModel();

  return historyModel.findFirst({
    where: {
      id,
      shop,
    },
  });
}

export async function recordEmailHistory({
  customerEmail,
  emailType,
  firstName,
  fromAddress,
  message,
  metricName,
  orderId,
  orderNumber,
  sentAt,
  sentByEmail,
  shop,
  sku,
  source = "app",
  sourceEventId,
  subject,
}) {
  const historyModel = getHistoryModel();

  return historyModel.create({
    data: {
      customerEmail,
      emailType,
      firstName,
      fromAddress,
      message,
      metricName,
      orderId,
      orderNumber,
      sentAt,
      sentByEmail,
      shop,
      sku,
      source,
      sourceEventId,
      subject,
    },
  });
}

export async function backfillEmailHistoryFromKlaviyo({
  customerEmail,
  orderId,
  orderNumber,
  shop,
}) {
  if (!customerEmail || !orderNumber) {
    return {importedCount: 0};
  }

  const events = await listNotifyDockEventsForOrder({
    customerEmail,
    orderNumber,
  });

  if (!events.length) {
    return {importedCount: 0};
  }

  const historyModel = getHistoryModel();

  await Promise.all(
    events.map((event) =>
      historyModel.upsert({
        where: {
          sourceEventId: event.id,
        },
        update: buildHistoryUpsertData({
          customerEmail,
          event,
          orderId,
          orderNumber,
          shop,
        }),
        create: buildHistoryUpsertData({
          customerEmail,
          event,
          orderId,
          orderNumber,
          shop,
        }),
      }),
    ),
  );

  return {importedCount: events.length};
}

export function serializeEmailHistory(historyEntry) {
  return {
    customerEmail: historyEntry.customerEmail,
    emailType: historyEntry.emailType,
    firstName: historyEntry.firstName,
    fromAddress: historyEntry.fromAddress,
    id: historyEntry.id,
    message: historyEntry.message,
    orderId: historyEntry.orderId,
    orderNumber: historyEntry.orderNumber,
    sentAt: historyEntry.sentAt.toISOString(),
    sentByEmail: historyEntry.sentByEmail,
    source: historyEntry.source,
    subject: historyEntry.subject,
  };
}

function buildHistoryUpsertData({
  customerEmail,
  event,
  orderId,
  orderNumber,
  shop,
}) {
  const eventProperties = event.eventProperties || {};
  const emailType =
    `${eventProperties.email_type || ""}`.trim() ||
    EMAIL_TYPE_BY_METRIC_NAME[event.metricName] ||
    "backorder_notice";

  return {
    customerEmail:
      `${event.profileEmail || ""}`.trim() || customerEmail,
    emailType,
    firstName: `${event.profileFirstName || ""}`.trim() || null,
    fromAddress: `${eventProperties.from_address || ""}`.trim() || null,
    message: `${eventProperties.message_html || ""}`.trim(),
    metricName: event.metricName || null,
    orderId,
    orderNumber:
      `${eventProperties.order_number || ""}`.trim() || orderNumber,
    sentAt: new Date(event.datetime),
    sentByEmail: `${eventProperties.sent_by_email || ""}`.trim() || null,
    shop,
    sku: `${eventProperties.sku || ""}`.trim() || null,
    source: "klaviyo_backfill",
    sourceEventId: event.id,
    subject:
      `${eventProperties.subject || ""}`.trim() ||
      buildFallbackSubject({
        emailType,
        orderNumber:
          `${eventProperties.order_number || ""}`.trim() || orderNumber,
      }),
  };
}

function buildFallbackSubject({emailType, orderNumber}) {
  if (emailType === "will_call_partially_ready") {
    return "Partial Will Call Order is Ready";
  }

  if (emailType === "will_call_ready") {
    return `Pick Up on Location Order ${orderNumber}`.trim();
  }

  if (emailType === "will_call_in_progress") {
    return "Hang Tight - Your Will Call Order Is In Progress";
  }

  if (emailType === "shipping_delay") {
    return `Shipping delay for order ${orderNumber}`.trim();
  }

  if (emailType === "dynamic_shipping_delay") {
    return `Shipping delay for order ${orderNumber}`.trim();
  }

  return `Backorder status for order ${orderNumber}`.trim();
}

function getHistoryModel() {
  const historyModel = prisma.notifyDockEmailHistory;

  if (historyModel) {
    return historyModel;
  }

  const error = new Error(EMAIL_HISTORY_SETUP_ERROR);
  error.status = 503;
  throw error;
}
