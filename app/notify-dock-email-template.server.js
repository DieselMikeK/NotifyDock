export function buildNotifyDockMessage({
  emailType,
  firstName,
  orderNumber,
  products = [],
  shipDate,
}) {
  const resolvedProducts = Array.isArray(products) ? products.filter(Boolean) : [];
  const productMarkup = buildProductMarkup(resolvedProducts);
  const resolvedShipDate = formatShipDate(shipDate);
  const itemLabel = resolvedProducts.length === 1 ? "item" : "items";

  if (emailType === "will_call_ready") {
    return [
      `<p><strong>Pick Up on Location Order ${escapeHtml(orderNumber || "#")}</strong></p>`,
      `<p>Hello ${escapeHtml(firstName || "there")},</p>`,
      "<p>Your order has been processed. We will contact you once your complete order is here and ready for pickup at Will Call.</p>",
      `<p><strong>Reference ${itemLabel}:</strong></p>`,
      productMarkup,
      "<p>Thank you.</p>",
    ].join("");
  }

  if (emailType === "will_call_in_progress") {
    return [
      `<p>Hello ${escapeHtml(firstName || "there")},</p>`,
      "<p>Your order has been processed. We will contact you once your complete order is here and ready for pickup at Will Call.</p>",
      `<p><strong>Reference ${itemLabel}:</strong></p>`,
      productMarkup,
      "<p>Thank you.</p>",
    ].join("");
  }

  if (emailType === "shipping_delay") {
    return [
      "<p>Thanks so much for shopping with Diesel Power Products, we really do appreciate it.</p>",
      `<p>The below product${resolvedProducts.length === 1 ? " is" : "s are"} currently on backorder:</p>`,
      productMarkup,
      `<p>Based upon information from the manufacturer, the current ship date is: <strong>${escapeHtml(resolvedShipDate || "Insert Ship date")}</strong></p>`,
      "<p><strong>HANG TIGHT:</strong> If you are okay to wait, you are good to go. Once we have tracking, or any other updates, we will forward them to this same email address.</p>",
      "<p><strong>CHECK OPTIONS:</strong> If you would like a comparable option that is on the shelf and ready to ship, our sales technicians can help.</p>",
      "<p><strong>CANCEL:</strong> If the backorder timeline is too long, we can cancel and refund the backordered item(s).</p>",
      "<p><strong>QUESTIONS:</strong> Reply to this email or reach out by phone or website chat, Monday through Friday from 6AM to 6PM Pacific.</p>",
    ].join("");
  }

  return [
    productMarkup,
    `<p>Based upon information from the manufacturer, the current ship date of your part(s) is: <strong>${escapeHtml(resolvedShipDate || "Insert Ship date")}</strong></p>`,
    "<p><strong>HANG TIGHT:</strong> If you are okay to wait, you are good to go. Once we have tracking, or any other updates, we will forward them to this same email address.</p>",
    "<p><strong>CHECK OPTIONS:</strong> If you would like a comparable option that is on the shelf and ready to ship, our sales technicians can help.</p>",
    "<p><strong>CANCEL:</strong> If the backorder timeline is too long, we can cancel and refund the backordered item(s).</p>",
    "<p><strong>QUESTIONS:</strong> Reply to this email or reach out by phone or website chat, Monday through Friday from 6AM to 6PM Pacific.</p>",
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

function buildProductLabel(productTitle, productVariantTitle) {
  if (!productVariantTitle || productVariantTitle === "Default Title") {
    return `${productTitle || ""}`.trim();
  }

  return `${productTitle || ""} - ${productVariantTitle}`.trim();
}

function formatShipDate(value) {
  if (!value) {
    return "";
  }

  const [year, month, day] = `${value}`.split("-").map(Number);

  if (!year || !month || !day) {
    return `${value}`.trim();
  }

  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function escapeHtml(value) {
  return `${value || ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
