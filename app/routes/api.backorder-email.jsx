import {json} from "@remix-run/node";
import {recordEmailHistory} from "../email-history.server";
import {buildNotifyDockMessage} from "../notify-dock-email-template.server";
import {captureNotifyDockRenderedSnapshot, sendNotifyDockEvent} from "../klaviyo.server";
import {authenticate} from "../shopify.server";

const VALID_EMAIL_TYPES = new Set([
  "backorder_notice",
  "dynamic_shipping_delay",
  "shipping_delay",
  "will_call_partially_ready",
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
  const globalShipDate = `${payload?.global_ship_date || ""}`.trim();
  const orderNumber = `${payload?.order_number || ""}`.trim();
  const firstName = `${payload?.first_name || ""}`.trim();
  const customerEmail = `${payload?.customer_email || ""}`.trim();
  const fromAddress = `${payload?.from_address || ""}`.trim();
  const shopName = `${payload?.shop_name || ""}`.trim();
  const subject =
    `${payload?.subject || buildSubject({emailType, orderNumber})}`.trim();
  const products = normalizeProducts({
    fallbackProduct: {
      product_image_alt: `${payload?.product_image_alt || ""}`.trim(),
      product_image_url: `${payload?.product_image_url || ""}`.trim(),
      product_title: `${payload?.product_title || ""}`.trim(),
      product_variant_title: `${payload?.product_variant_title || ""}`.trim(),
      sku,
    },
    rawProducts: payload?.products,
  });
  const requestedSkus = splitSkuInput(sku);
  const skuRequired = requiresSku(emailType);
  const resolvedProducts = skuRequired ? products : [];
  const primaryProduct = resolvedProducts[0] || null;
  const resolvedSkuValue = skuRequired
    ? resolvedProducts.map((product) => product.sku).filter(Boolean).join(", ") || sku
    : "";
  const message = buildNotifyDockMessage({
    emailType,
    firstName,
    globalShipDate,
    orderNumber,
    products: resolvedProducts,
    shipDate,
  }).trim();
  const renderPayload = {
    customerEmail,
    emailType,
    firstName,
    globalShipDate,
    orderNumber,
    products: resolvedProducts,
    shipDate,
    sku: resolvedSkuValue,
  };

  if (!VALID_EMAIL_TYPES.has(emailType)) {
    return cors(json({error: "Invalid email type."}, {status: 400}));
  }

  if (
    !customerEmail ||
    !orderId ||
    !orderNumber ||
    !subject ||
    !isPayloadAllowed({
      emailType,
      globalShipDate,
      primaryProduct,
      products: resolvedProducts,
      requestedSkus,
      shipDate,
    })
  ) {
    return cors(
      json(
        {
          error:
            "Order, customer email, order number, and subject are required. Ship date is required for legacy shipping-delay emails, and every comma-separated SKU must resolve to a product title. Dynamic Shipping Delay also requires either one global date or a valid delay update on every listed SKU.",
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
      productImageUrl: primaryProduct?.productImageUrl || "",
      productTitle: primaryProduct?.productTitle || "",
      productVariantTitle: primaryProduct?.productVariantTitle || "",
      globalShipDate,
      products: resolvedProducts,
      sentByEmail: session.email || "",
      shipDate,
      shop: shopName || session.shop,
      sku: resolvedSkuValue,
      subject,
    });
    let historyWarning = "";
    let renderedSnapshot = null;

    try {
      renderedSnapshot = await captureNotifyDockRenderedSnapshot(renderPayload);
    } catch (snapshotError) {
      historyWarning =
        snapshotError instanceof Error
          ? `Notify Dock sent the email event, but could not save an HTML snapshot: ${snapshotError.message}`
          : "Notify Dock sent the email event, but could not save an HTML snapshot.";
    }

    try {
      await recordEmailHistory({
        customerEmail,
        emailType,
        firstName,
        fromAddress,
        message: renderedSnapshot?.renderedHtml || message,
        metricName: result.metricName,
        orderId,
        orderNumber,
        sentAt,
        sentByEmail: session.email || "",
        shop: session.shop,
        sku: resolvedSkuValue,
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
            ? "Klaviyo accepted the Notify Dock event, but Notify Dock could not save the full local history snapshot."
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

function requiresSku(emailType) {
  return ![
    "will_call_ready",
    "will_call_in_progress",
  ].includes(emailType);
}

function isPayloadAllowed({
  emailType,
  globalShipDate,
  primaryProduct,
  products,
  requestedSkus,
  shipDate,
}) {
  if (emailType === "dynamic_shipping_delay") {
    return (
      requestedSkus.length > 0 &&
      products.length > 0 &&
      products.length === requestedSkus.length &&
      Boolean(primaryProduct?.productTitle) &&
      isDynamicShippingDelayConfigured({
        globalShipDate,
        products,
      })
    );
  }

  if (requiresShipDate(emailType) && !shipDate) {
    return false;
  }

  if (!requiresSku(emailType)) {
    return true;
  }

  return (
    requestedSkus.length > 0 &&
    products.length > 0 &&
    products.length === requestedSkus.length &&
    Boolean(primaryProduct?.productTitle)
  );
}

function requiresShipDate(emailType) {
  return emailType === "backorder_notice" || emailType === "shipping_delay";
}

function isDynamicShippingDelayConfigured({globalShipDate, products}) {
  if (`${globalShipDate || ""}`.trim()) {
    return true;
  }

  return products.every((product) => {
    const delayState = `${product?.delayState || ""}`.trim();

    if (!delayState) {
      return false;
    }

    if (delayState !== "specific_date") {
      return true;
    }

    return Boolean(`${product?.delayDate || ""}`.trim());
  });
}

function splitSkuInput(value) {
  return Array.from(
    new Set(
      `${value || ""}`
        .split(",")
        .map((entry) => `${entry || ""}`.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeProducts({fallbackProduct, rawProducts}) {
  const products = Array.isArray(rawProducts)
    ? rawProducts
        .map((product) => normalizeProduct(product))
        .filter(Boolean)
    : [];

  if (products.length) {
    return products;
  }

  const fallback = normalizeProduct(fallbackProduct);

  return fallback ? [fallback] : [];
}

function normalizeProduct(product) {
  const sku = `${product?.sku || ""}`.trim();
  const productTitle =
    `${product?.product_title || product?.productTitle || ""}`.trim();

  if (!sku && !productTitle) {
    return null;
  }

  return {
    delayDate: `${product?.delay_date || product?.delayDate || ""}`.trim(),
    delayState: `${product?.delay_state || product?.delayState || ""}`.trim(),
    productImageAlt:
      `${product?.product_image_alt || product?.productImageAlt || ""}`.trim(),
    productImageUrl:
      `${product?.product_image_url || product?.productImageUrl || ""}`.trim(),
    productTitle,
    productVariantTitle:
      `${product?.product_variant_title || product?.productVariantTitle || ""}`.trim(),
    sku,
  };
}
