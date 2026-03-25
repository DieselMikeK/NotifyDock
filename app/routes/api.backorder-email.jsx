import {json} from "@remix-run/node";
import {authenticate} from "../shopify.server";
import {deliverNotifyDockEmail} from "../email-delivery.server";

const VALID_EMAIL_TYPES = new Set(["backorder_notice", "will_call_ready"]);

export async function loader({request}) {
  const {cors} = await authenticate.admin(request);

  return cors(json({error: "Method not allowed."}, {status: 405}));
}

export async function action({request}) {
  const {admin, cors, session} = await authenticate.admin(request);

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

  if (!customerEmail || !orderId || !orderNumber || !message || !subject) {
    return cors(
      json(
        {
          error:
            "Customer email, order ID, order number, subject, and message are required.",
        },
        {status: 400},
      ),
    );
  }

  try {
    const result = await deliverNotifyDockEmail({
      admin,
      customerEmail,
      emailType,
      firstName,
      fromAddress,
      message,
      orderId,
      orderNumber,
      sentByEmail: session.email || "",
      shop: shopName || session.shop,
      sku,
      subject,
    });

    return cors(
      json({
        ok: true,
        message: result.message,
        provider: result.provider,
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

  return `Backorder status for order ${orderNumber}`.trim();
}
