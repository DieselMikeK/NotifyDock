import {formatNotifyDockShipDate} from "./ship-date";

const DYNAMIC_SHIPPING_DELAY_EMAIL_TYPE = "dynamic_shipping_delay";

export function buildNotifyDockMessage({
  emailType,
  firstName,
  orderNumber,
  products = [],
  shipDate,
  globalShipDate,
}) {
  const resolvedProducts = Array.isArray(products) ? products.filter(Boolean) : [];
  const productMarkup = buildProductMarkup(resolvedProducts);
  const resolvedShipDate = formatNotifyDockShipDate(shipDate);
  const resolvedGlobalShipDate = formatNotifyDockShipDate(globalShipDate || shipDate);
  const itemLabel = resolvedProducts.length === 1 ? "item" : "items";
  const referenceMarkup = buildReferenceMarkup({
    itemLabel,
    productMarkup,
    products: resolvedProducts,
  });

  if (emailType === "will_call_partially_ready") {
    return [
      "<p><strong>Partial Will Call Order is Ready</strong></p>",
      `<p>Hello ${escapeHtml(firstName || "there")},</p>`,
      `<p>The following ${itemLabel} from your order ${escapeHtml(orderNumber || "#")} ${resolvedProducts.length === 1 ? "is" : "are"} ready for pickup at Will Call:</p>`,
      productMarkup,
      "<p>We will contact you again when the remaining items are ready.</p>",
      "<p>Thank you.</p>",
    ].join("");
  }

  if (emailType === "will_call_ready") {
    return [
      `<p><strong>Pick Up on Location Order ${escapeHtml(orderNumber || "#")}</strong></p>`,
      `<p>Hello ${escapeHtml(firstName || "there")},</p>`,
      "<p>Your order has been processed. We will contact you once your complete order is here and ready for pickup at Will Call.</p>",
      referenceMarkup,
      "<p>Thank you.</p>",
    ].join("");
  }

  if (emailType === "will_call_in_progress") {
    return [
      `<p>Hello ${escapeHtml(firstName || "there")},</p>`,
      "<p>Your order has been processed. We will contact you once your complete order is here and ready for pickup at Will Call.</p>",
      referenceMarkup,
      "<p>Thank you.</p>",
    ].join("");
  }

  if (emailType === "shipping_delay") {
    return [
      "<p>Thanks so much for shopping with Diesel Power Products, we really do appreciate it.</p>",
      `<p>The below product${resolvedProducts.length === 1 ? " is" : "s are"} currently on backorder:</p>`,
      productMarkup,
      `<p>Based upon information from the manufacturer, the current ship date is: <strong>${escapeHtml(resolvedShipDate || "Insert Ship date")}</strong></p>`,
    ].join("");
  }

  if (emailType === DYNAMIC_SHIPPING_DELAY_EMAIL_TYPE) {
    const openingCopy = resolvedGlobalShipDate
      ? "<p>Thanks so much for shopping with Diesel Power Products, we really do appreciate it. We wanted to inform you that the below product(s) you ordered is currently experiencing a shipping delay.</p>"
      : "<p>Thanks so much for shopping with Diesel Power Products, we really do appreciate it.</p>";
    const delayIntroCopy = resolvedGlobalShipDate
      ? ""
      : `<p>We wanted to inform you that the below product${resolvedProducts.length === 1 ? " is" : "s are"} currently experiencing a shipping delay.</p>`;

    return [
      openingCopy,
      delayIntroCopy,
      buildDynamicShippingDelayDetailsHtml({
        globalShipDate: resolvedGlobalShipDate,
        products: resolvedProducts,
      }),
    ].join("");
  }

  return [
    productMarkup,
    `<p>Based upon information from the manufacturer, the current ship date of your part(s) is: <strong>${escapeHtml(resolvedShipDate || "Insert Ship date")}</strong></p>`,
  ].join("");
}

export function buildDynamicShippingDelayDetailsHtml({
  globalShipDate,
  products = [],
}) {
  const resolvedProducts = Array.isArray(products) ? products.filter(Boolean) : [];

  if (!resolvedProducts.length) {
    return buildDynamicEmptyProductTable();
  }

  if (globalShipDate) {
    return [
      resolvedProducts.map((product) => buildDynamicProductTable({product})).join(""),
      buildDynamicGlobalDateTable(globalShipDate),
    ].join("");
  }

  return resolvedProducts
    .map((product) => {
      const resolvedDelayDate = formatNotifyDockShipDate(product.delayDate);

      return [
        buildDynamicProductTable({
          product,
          statusMarkup: buildDynamicDelayStatusText({
            delayDate: resolvedDelayDate,
            delayState: product.delayState,
          }),
        }),
      ].join("");
    })
    .join("");
}

function buildDynamicDelayStatusText({delayDate, delayState}) {
  if (delayState === "specific_date") {
    return `Based on information that we have received from the manufacturer, the current ship date of your part(s) is: <strong>${escapeHtml(delayDate || "Insert Ship date")}</strong>`;
  }

  if (delayState === "business_days_12_15") {
    return "Based on information that we have received from the manufacturer, the current ship date of your part(s) is 12-15 business days.";
  }

  return "Based on information that we have received from the manufacturer, there is not yet a confirmed ship date for this item.";
}

function buildDynamicProductTable({product, statusMarkup = ""}) {
  const productLabel = buildProductLabel(
    product.productTitle,
    product.productVariantTitle,
  );
  const variantTitle =
    product.productVariantTitle && product.productVariantTitle !== "Default Title"
      ? product.productVariantTitle
      : "";

  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse; margin:0 0 16px 0; border:0px;">',
    "<tr>",
    `<td style="width:120px; padding: 0px 16px 0px 0px; vertical-align:top;">${buildDynamicProductImageCell(product)}</td>`,
    '<td style="padding:0; vertical-align:top;">',
    `<p style="margin:0;padding:0; color:#111827; font-size:18px; line-height:20px; font-weight:700;">${escapeHtml(productLabel || "Product")}</p>`,
    variantTitle
      ? `<p style="margin:0;padding:5px 0; color:#374151; font-size:14px; line-height:20px;">${escapeHtml(variantTitle)}</p>`
      : "",
    `<p style="margin:0;padding:0; color:#4b5563; font-size:14px; line-height:20px;">${escapeHtml(product.sku || "SKU")}</p>`,
    "</td>",
    "</tr>",
    statusMarkup
      ? [
          "<tr>",
          '<td colspan="2" style="padding:0 16px 16px 16px;">',
          `<p style="margin:0; color:#111827; font-size:16px; line-height:20px;">${statusMarkup}</p>`,
          "</td>",
          "</tr>",
        ].join("")
      : "",
    "</table>",
  ].join("");
}

function buildDynamicProductImageCell(product) {
  if (product.productImageUrl) {
    return `<img src="${escapeHtml(product.productImageUrl)}" alt="${escapeHtml(product.productImageAlt || buildProductLabel(product.productTitle, product.productVariantTitle) || "Product image")}" width="120" style="display:block; width:120px; max-width:120px; height:auto; border:0; outline:none; text-decoration:none;">`;
  }

  return [
    '<table role="presentation" width="120" cellpadding="0" cellspacing="0" border="0" style="width:120px; border-collapse:collapse; border:1px solid #d1d5db;">',
    "<tr>",
    '<td style="height:120px; padding:12px; color:#6b7280; font-size:12px; line-height:18px; text-align:center; vertical-align:middle;">No image</td>',
    "</tr>",
    "</table>",
  ].join("");
}

function buildDynamicGlobalDateTable(globalShipDate) {
  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse; margin:0px 0 16px 0;">',
    "<tr>",
    '<td style="padding:0; text-align:center;">',
    '<div style="padding:0px;width:80%;text-align:center;margin:0 auto;">',
    '<p style="margin:0; color:#111827; font-size:16px; line-height:20px;">Based on information that we have received from the manufacturer, the current Ship Date of your part(s) is:</p>',
    `<span style="font-weight:bold;font-family:Roboto, Helvetica, Arial, sans-serif;font-size:20px;letter-spacing:.75px;display:inline-block;width:100%;text-align:center;color:green;">${escapeHtml(globalShipDate)}</span>`,
    "</div>",
    "</td>",
    "</tr>",
    "</table>",
  ].join("");
}

function buildDynamicEmptyProductTable() {
  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse; margin:0 0 16px 0; border:1px solid #d1d5db;">',
    "<tr>",
    '<td style="padding:16px; color:#111827; font-size:14px; line-height:20px;"><strong>Product (SKU)</strong></td>',
    "</tr>",
    "</table>",
  ].join("");
}

function buildProductMarkup(products) {
  if (!products.length) {
    return "<p><strong>Product (SKU)</strong></p>";
  }

  return products
    .map((product) => {
      const productLabel = buildProductLabel(
        product.productTitle,
        product.productVariantTitle,
      );

      return `<p><strong>${escapeHtml(productLabel || "Product")} (${escapeHtml(product.sku || "SKU")})</strong></p>`;
    })
    .join("");
}

function buildReferenceMarkup({itemLabel, productMarkup, products}) {
  if (!products.length) {
    return "";
  }

  return [
    `<p><strong>Reference ${itemLabel}:</strong></p>`,
    productMarkup,
  ].join("");
}

function buildProductLabel(productTitle, productVariantTitle) {
  if (!productVariantTitle || productVariantTitle === "Default Title") {
    return `${productTitle || ""}`.trim();
  }

  return `${productTitle || ""} - ${productVariantTitle}`.trim();
}

function escapeHtml(value) {
  return `${value || ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
