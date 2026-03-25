import {sendNotifyDockEvent} from "./klaviyo.server";

const DELIVERY_PROVIDER =
  process.env.NOTIFY_DOCK_DELIVERY_PROVIDER || "shopify_invoice";

export async function deliverNotifyDockEmail({
  admin,
  customerEmail,
  emailType,
  firstName,
  fromAddress,
  message,
  orderId,
  orderNumber,
  sentByEmail,
  shop,
  sku,
  subject,
}) {
  if (DELIVERY_PROVIDER === "klaviyo") {
    const result = await sendNotifyDockEvent({
      customerEmail,
      emailType,
      firstName,
      fromAddress,
      message,
      orderNumber,
      sentByEmail,
      shop,
      sku,
      subject,
    });

    return {
      message:
        "Klaviyo accepted the Notify Dock event. The matching Klaviyo flow will send the email.",
      provider: "klaviyo",
      metricName: result.metricName,
    };
  }

  return sendShopifyInvoice({
    admin,
    customerEmail,
    fromAddress,
    message,
    orderId,
    subject,
  });
}

async function sendShopifyInvoice({
  admin,
  customerEmail,
  fromAddress,
  message,
  orderId,
  subject,
}) {
  const response = await admin.graphql(
    `#graphql
      mutation OrderInvoiceSend($orderId: ID!, $email: EmailInput) {
        orderInvoiceSend(id: $orderId, email: $email) {
          order {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        orderId,
        email: {
          customMessage: normalizeShopifyMessage(message),
          from: fromAddress,
          subject,
          to: customerEmail,
        },
      },
    },
  );

  const payload = await response.json();
  const result = payload?.data?.orderInvoiceSend;
  const userErrors = result?.userErrors || [];

  if (userErrors.length) {
    const error = new Error(userErrors.map(({message}) => message).join(" "));
    error.status = 400;
    throw error;
  }

  return {
    message:
      "Shopify accepted the Notify Dock email and should log it on the order timeline.",
    provider: "shopify_invoice",
  };
}

function normalizeShopifyMessage(message) {
  return `${message || ""}`
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(center|p|div)>/gi, "\n")
    .replace(/<\/?b>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
