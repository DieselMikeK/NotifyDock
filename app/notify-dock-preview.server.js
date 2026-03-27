import {getEmailHistoryById} from "./email-history.server";
import {
  buildNotifyDockRenderPayloadForHistory,
  renderNotifyDockTemplate,
} from "./klaviyo.server";
import {sanitizeRenderedEmailHtml} from "./notify-dock-preview-token.server";

export async function buildNotifyDockPreview(payload) {
  if (payload?.historyId) {
    return buildHistoryEmailPreview(payload);
  }

  if (!payload?.emailType) {
    const error = new Error("emailType is required.");
    error.status = 400;
    throw error;
  }

  const rendered = await renderNotifyDockTemplate(payload);

  return {
    html: sanitizeRenderedEmailHtml(rendered.html),
    sourceLabel: "Live render",
    templateId: rendered.templateId,
    title: "Rendered Klaviyo Preview",
  };
}

async function buildHistoryEmailPreview({historyId, historyShop}) {
  if (!historyShop) {
    const error = new Error("The Notify Dock preview link is missing the shop.");
    error.status = 400;
    throw error;
  }

  const historyEntry = await getEmailHistoryById({
    id: historyId,
    shop: historyShop,
  });

  if (!historyEntry) {
    const error = new Error("This saved Notify Dock email could not be found.");
    error.status = 404;
    throw error;
  }

  if (looksLikeSavedSnapshot(historyEntry.message)) {
    return {
      html: sanitizeRenderedEmailHtml(historyEntry.message),
      sourceLabel: "Saved snapshot",
      templateId: "",
      title: "Saved Email Snapshot",
    };
  }

  const renderPayload = await buildNotifyDockRenderPayloadForHistory(historyEntry);

  if (renderPayload) {
    const rendered = await renderNotifyDockTemplate(renderPayload);

    return {
      html: sanitizeRenderedEmailHtml(rendered.html),
      sourceLabel: "Live render",
      templateId: rendered.templateId,
      title: "Rendered Klaviyo Preview",
    };
  }

  return {
    html: buildSavedEmailPreviewHtml(historyEntry),
    sourceLabel: "Legacy saved body",
    templateId: "",
    title: "Saved Email Preview",
  };
}

function buildSavedEmailPreviewHtml(historyEntry) {
  const subject = escapeHtml(historyEntry?.subject || "Notify Dock Email");
  const customerEmail = escapeHtml(historyEntry?.customerEmail || "");
  const sentAt = escapeHtml(formatSentAt(historyEntry?.sentAt));
  const messageHtml = sanitizeRenderedEmailHtml(historyEntry?.message || "");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${subject}</title>
    <style>
      body {
        background: #f6f6f7;
        color: #202223;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        padding: 24px;
      }

      .shell {
        background: #ffffff;
        border: 1px solid #d8d8d8;
        border-radius: 16px;
        margin: 0 auto;
        max-width: 760px;
        overflow: hidden;
      }

      .header {
        border-bottom: 1px solid #e1e3e5;
        padding: 24px;
      }

      .subject {
        font-size: 24px;
        font-weight: 600;
        margin: 0;
      }

      .meta {
        color: #6d7175;
        font-size: 14px;
        margin: 8px 0 0;
      }

      .body {
        padding: 24px;
      }

      .body img {
        height: auto;
        max-width: 100%;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="header">
        <p class="subject">${subject}</p>
        ${
          customerEmail || sentAt
            ? `<p class="meta">${customerEmail ? `To: ${customerEmail}` : ""}${customerEmail && sentAt ? " | " : ""}${sentAt ? `Sent: ${sentAt}` : ""}</p>`
            : ""
        }
      </div>
      <div class="body">
        ${messageHtml || "<p>No email body saved for this email.</p>"}
      </div>
    </div>
  </body>
</html>`;
}

function formatSentAt(value) {
  if (!value) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch (_error) {
    return `${value}`;
  }
}

function escapeHtml(value) {
  return `${value || ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function looksLikeSavedSnapshot(message) {
  const normalizedMessage = `${message || ""}`.trim().toLowerCase();

  return (
    normalizedMessage.startsWith("<!doctype html") ||
    normalizedMessage.startsWith("<html") ||
    normalizedMessage.includes("<body")
  );
}
