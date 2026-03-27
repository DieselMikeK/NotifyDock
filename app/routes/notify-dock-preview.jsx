import {json} from "@remix-run/node";
import {useLoaderData} from "@remix-run/react";
import {buildNotifyDockPreview} from "../notify-dock-preview.server";
import {
  verifyNotifyDockPreviewToken,
} from "../notify-dock-preview-token.server";

export async function loader({request}) {
  const url = new URL(request.url);
  const token = `${url.searchParams.get("token") || ""}`.trim();

  let payload;

  try {
    payload = verifyNotifyDockPreviewToken(token);
  } catch (error) {
    return json(
      {
        html: "",
        notice:
          error instanceof Error
            ? error.message
            : "The Notify Dock preview link is invalid.",
        sourceLabel: "",
        templateId: "",
        title: "Rendered Klaviyo Preview",
      },
      {status: error?.status || 400},
    );
  }

  try {
    const rendered = await buildNotifyDockPreview(payload);

    return json({
      html: rendered.html,
      notice: "",
      sourceLabel: rendered.sourceLabel || "",
      templateId: rendered.templateId,
      title: rendered.title,
    });
  } catch (error) {
    return json(
      {
        html: "",
        notice:
          error instanceof Error
            ? error.message
            : "Notify Dock could not render the Klaviyo preview.",
        sourceLabel: "",
        templateId: "",
        title: "Rendered Klaviyo Preview",
      },
      {status: error?.status || 500},
    );
  }
}

export default function NotifyDockPreviewPage() {
  const {html, notice, sourceLabel, templateId, title} = useLoaderData();

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{title || "Rendered Klaviyo Preview"}</h1>
          {sourceLabel ? <p style={styles.meta}>Preview source: {sourceLabel}</p> : null}
          {templateId ? <p style={styles.meta}>Template ID: {templateId}</p> : null}
        </div>
      </div>

      {notice ? <div style={styles.notice}>{notice}</div> : null}

      {html ? (
        <iframe
          title="Rendered Klaviyo email preview"
          srcDoc={html}
          style={styles.frame}
          sandbox="allow-same-origin"
        />
      ) : (
        <div style={styles.emptyState}>No rendered preview is available.</div>
      )}
    </main>
  );
}

const styles = {
  emptyState: {
    background: "#ffffff",
    border: "1px solid #d8d8d8",
    borderRadius: "12px",
    color: "#4a4a4a",
    padding: "24px",
  },
  frame: {
    background: "#ffffff",
    border: "1px solid #d8d8d8",
    borderRadius: "12px",
    minHeight: "900px",
    width: "100%",
  },
  header: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "16px",
  },
  meta: {
    color: "#6d7175",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: "14px",
    margin: "4px 0 0",
  },
  notice: {
    background: "#fff4f4",
    border: "1px solid #e0b3b3",
    borderRadius: "12px",
    color: "#8a1f1f",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    marginBottom: "16px",
    padding: "16px",
  },
  page: {
    background: "#f6f6f7",
    minHeight: "100vh",
    padding: "24px",
  },
  title: {
    color: "#202223",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: "24px",
    margin: 0,
  },
};
