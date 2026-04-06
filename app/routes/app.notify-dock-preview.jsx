import {json} from "@remix-run/node";
import {useLoaderData} from "@remix-run/react";
import {TitleBar} from "@shopify/app-bridge-react";
import {Banner, BlockStack, Card, Layout, Page, Text} from "@shopify/polaris";
import {buildNotifyDockPreview} from "../notify-dock-preview.server";
import {
  normalizePreviewPayload,
  verifyNotifyDockPreviewToken,
} from "../notify-dock-preview-token.server";
import {authenticate} from "../shopify.server";

export async function loader({request}) {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const token = `${url.searchParams.get("token") || ""}`.trim();
  const payload = token
    ? verifyNotifyDockPreviewToken(token)
    : normalizePreviewPayload({
        customerEmail: `${url.searchParams.get("customerEmail") || ""}`.trim(),
        emailType: `${url.searchParams.get("emailType") || ""}`.trim(),
        firstName: `${url.searchParams.get("firstName") || ""}`.trim(),
        globalShipDate: `${url.searchParams.get("globalShipDate") || ""}`.trim(),
        orderNumber: `${url.searchParams.get("orderNumber") || ""}`.trim(),
        products: parseProducts(url.searchParams.get("products")),
        shipDate: `${url.searchParams.get("shipDate") || ""}`.trim(),
        sku: `${url.searchParams.get("sku") || ""}`.trim(),
      });

  if (!payload.emailType) {
    if (!payload.historyId) {
      return json(
        {
          html: "",
          notice: "emailType is required.",
          sourceLabel: "",
          templateId: "",
          title: "Rendered Klaviyo Preview",
        },
        {status: 400},
      );
    }
  }

  try {
    const rendered = await buildNotifyDockPreview(payload);

    return json(
      {
        html: rendered.html,
        notice: "",
        sourceLabel: rendered.sourceLabel || "",
        templateId: rendered.templateId,
        title: rendered.title,
      },
    );
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
    <Page>
      <TitleBar title={title || "Rendered Klaviyo Preview"} />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {notice ? <Banner tone="critical">{notice}</Banner> : null}

              {sourceLabel ? (
                <Text as="p" variant="bodyMd">
                  Preview source: {sourceLabel}
                </Text>
              ) : null}

              {templateId ? (
                <Text as="p" variant="bodyMd">
                  Template ID: {templateId}
                </Text>
              ) : null}

              {html ? (
                <iframe
                  title="Rendered Klaviyo email preview"
                  srcDoc={html}
                  style={{
                    border: "1px solid #d8d8d8",
                    borderRadius: "12px",
                    minHeight: "900px",
                    width: "100%",
                  }}
                  sandbox="allow-same-origin"
                />
              ) : (
                <Text as="p" variant="bodyMd">
                  No rendered preview is available.
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function parseProducts(value) {
  if (!value) {
    return [];
  }

  try {
    const products = JSON.parse(value);

    return Array.isArray(products)
      ? products
          .map((product) => ({
            delayDate: `${product?.delayDate || ""}`.trim(),
            delayState: `${product?.delayState || ""}`.trim(),
            productImageAlt: `${product?.productImageAlt || ""}`.trim(),
            productImageUrl: `${product?.productImageUrl || ""}`.trim(),
            productTitle: `${product?.productTitle || ""}`.trim(),
            productVariantTitle: `${product?.productVariantTitle || ""}`.trim(),
            sku: `${product?.sku || ""}`.trim(),
          }))
          .filter((product) => product.sku || product.productTitle)
      : [];
  } catch (_error) {
    return [];
  }
}
