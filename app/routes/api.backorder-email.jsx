import {json} from "@remix-run/node";
import {recordEmailHistory} from "../email-history.server";
import {authenticate} from "../shopify.server";
import {sendNotifyDockEvent} from "../klaviyo.server";

const VALID_EMAIL_TYPES = new Set([
  "backorder_notice",
  "shipping_delay",
  "will_call_in_progress",
  "will_call_ready",
]);

export async function loader({request}) {
  const {cors} = await authenticate.admin(request);

  return cors(json({error: "Method not allowed."}, {status: 405}));
}

export async function action({request}) {
  const {cors, session} = await authenticate.admin(request);

  if (request.method === "OPTIONS") {
    return cors(new Response(null, {status: 204}));
  }

  let payload;

  try {
    payload = await request.json();
  } catch (_error) {
    return cors(json({error: "Invalid JSON payload."}, {status: 400}));
  }

  const emailType = payload?.email_type;
  const orderId = `${payload?.order_id || ""}`.trim();
  const sku = `${payload?.sku || ""}`.trim();
  const shipDate = `${payload?.ship_date || ""}`.trim();
  const orderNumber = `${payload?.order_number || ""}`.trim();
  const firstName = `${payload?.first_name || ""}`.trim();
  const customerEmail = `${payload?.customer_email || ""}`.trim();
  const fromAddress = `${payload?.from_address || ""}`.trim();
  const message = `${payload?.message || ""}`.trim();
  const shopName = `${payload?.shop_name || ""}`.trim();
  const subject =
    `${payload?.subject || buildSubject({emailType, orderNumber})}`.trim();

  if (!VALID_EMAIL_TYPES.has(emailType)) {
    return cors(json({error: "Invalid email type."}, {status: 400}));
  }

  if (
    !customerEmail ||
    !orderId ||
    !orderNumber ||
    !subject ||
    !isMessageAllowed({emailType, message})
  ) {
    return cors(
      json(
        {
          error:
            "Order, customer email, order number, and subject are required. Message is required for this email type.",
        },
        {status: 400},
      ),
    );
  }

  try {
    const sentAt = new Date();
    const result = await sendNotifyDockEvent({
      customerEmail,
      emailType,
      firstName,
      fromAddress,
      message,
      orderId,
      orderNumber,
      sentByEmail: session.email || "",
      shipDate,
      shop: shopName || session.shop,
      sku,
      subject,
    });
    let historyWarning = "";

    try {
      await recordEmailHistory({
        customerEmail,
        emailType,
        firstName,
        fromAddress,
        message,
        metricName: result.metricName,
        orderId,
        orderNumber,
        sentAt,
        sentByEmail: session.email || "",
        shop: session.shop,
        sku,
        subject,
      });
    } catch (historyError) {
      historyWarning =
        historyError instanceof Error
          ? historyError.message
          : "Notify Dock could not save this email to history.";
    }

    return cors(
      json({
        ok: true,
        message:
          historyWarning
            ? "Klaviyo accepted the Notify Dock event, but Notify Dock could not save the local history entry."
            : "Klaviyo accepted the Notify Dock event. The matching Klaviyo flow will send the email.",
        historyWarning,
        metricName: result.metricName,
      }),
    );
  } catch (error) {
    return cors(
      json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Notify Dock could not hand the email off to Klaviyo.",
        },
        {status: error?.status || 500},
      ),
    );
  }
}

function buildSubject({emailType, orderNumber}) {
  if (emailType === "will_call_ready") {
    return `Pick Up on Location Order ${orderNumber}`.trim();
  }

  if (emailType === "will_call_in_progress") {
    return "Hang Tight - Your Will Call Order Is In Progress";
  }

  if (emailType === "shipping_delay") {
    return `Shipping delay for order ${orderNumber}`.trim();
  }

  return `Backorder status for order ${orderNumber}`.trim();
}

function isMessageAllowed({emailType, message}) {
  return emailType !== "will_call_in_progress" || Boolean(message);
}
