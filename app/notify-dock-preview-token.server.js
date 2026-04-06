import crypto from "node:crypto";

const DEFAULT_TOKEN_TTL_MS = 10 * 60 * 1000;

export function createNotifyDockPreviewToken(
  payload,
  {expiresInMs = DEFAULT_TOKEN_TTL_MS} = {},
) {
  const normalizedPayload = normalizePreviewPayload(payload);
  const tokenPayload = {
    ...normalizedPayload,
    exp: Date.now() + expiresInMs,
  };
  const encodedPayload = encodeTokenPayload(tokenPayload);

  return `${encodedPayload}.${signTokenPayload(encodedPayload)}`;
}

export function verifyNotifyDockPreviewToken(token) {
  if (!token || typeof token !== "string") {
    const error = new Error("The Notify Dock preview link is missing a token.");
    error.status = 400;
    throw error;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    const error = new Error("The Notify Dock preview link is invalid.");
    error.status = 400;
    throw error;
  }

  const expectedSignature = signTokenPayload(encodedPayload);
  const receivedSignatureBuffer = Buffer.from(signature, "utf8");
  const expectedSignatureBuffer = Buffer.from(expectedSignature, "utf8");

  if (
    receivedSignatureBuffer.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(receivedSignatureBuffer, expectedSignatureBuffer)
  ) {
    const error = new Error("The Notify Dock preview link signature is invalid.");
    error.status = 401;
    throw error;
  }

  const payload = decodeTokenPayload(encodedPayload);

  if (!payload.exp || payload.exp < Date.now()) {
    const error = new Error("The Notify Dock preview link has expired.");
    error.status = 410;
    throw error;
  }

  return normalizePreviewPayload(payload);
}

export function normalizePreviewPayload(payload) {
  return {
    customerEmail: `${payload?.customerEmail || ""}`.trim(),
    emailType: `${payload?.emailType || ""}`.trim(),
    firstName: `${payload?.firstName || ""}`.trim(),
    globalShipDate: `${payload?.globalShipDate || ""}`.trim(),
    historyId: `${payload?.historyId || ""}`.trim(),
    historyShop: `${payload?.historyShop || ""}`.trim(),
    orderNumber: `${payload?.orderNumber || ""}`.trim(),
    products: normalizePreviewProducts(payload?.products),
    shipDate: `${payload?.shipDate || ""}`.trim(),
    sku: `${payload?.sku || ""}`.trim(),
  };
}

export function sanitizeRenderedEmailHtml(html) {
  return `${html || ""}`
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/\shref="[^"]*"/gi, "")
    .replace(/\shref='[^']*'/gi, "")
    .replace(/\starget="[^"]*"/gi, "")
    .replace(/\starget='[^']*'/gi, "")
    .replace(/\saction="[^"]*"/gi, "")
    .replace(/\saction='[^']*'/gi, "");
}

function normalizePreviewProducts(products) {
  if (!Array.isArray(products)) {
    return [];
  }

  return products
    .map((product) => ({
      delayDate: `${product?.delayDate || ""}`.trim(),
      delayState: `${product?.delayState || ""}`.trim(),
      productImageAlt: `${product?.productImageAlt || ""}`.trim(),
      productImageUrl: `${product?.productImageUrl || ""}`.trim(),
      productTitle: `${product?.productTitle || ""}`.trim(),
      productVariantTitle: `${product?.productVariantTitle || ""}`.trim(),
      sku: `${product?.sku || ""}`.trim(),
    }))
    .filter((product) => product.sku || product.productTitle || product.productImageUrl);
}

function encodeTokenPayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeTokenPayload(value) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch (_error) {
    const error = new Error("The Notify Dock preview link payload is invalid.");
    error.status = 400;
    throw error;
  }
}

function signTokenPayload(value) {
  const secret = process.env.NOTIFY_DOCK_PREVIEW_SECRET || process.env.SHOPIFY_API_SECRET;

  if (!secret) {
    const error = new Error("Notify Dock preview signing is not configured on the app backend.");
    error.status = 503;
    throw error;
  }

  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}
