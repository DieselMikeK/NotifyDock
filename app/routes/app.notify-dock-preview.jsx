import {json} from "@remix-run/node";
import {useLoaderData} from "@remix-run/react";
import {TitleBar} from "@shopify/app-bridge-react";
import {Banner, BlockStack, Card, Layout, Page, Text} from "@shopify/polaris";
import {renderNotifyDockTemplate} from "../klaviyo.server";
import {authenticate} from "../shopify.server";

export async function loader({request}) {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const emailType = `${url.searchParams.get("emailType") || ""}`.trim();
  const customerEmail = `${url.searchParams.get("customerEmail") || ""}`.trim();
  const firstName = `${url.searchParams.get("firstName") || ""}`.trim();
  const orderNumber = `${url.searchParams.get("orderNumber") || ""}`.trim();
  const shipDate = `${url.searchParams.get("shipDate") || ""}`.trim();
  const sku = `${url.searchParams.get("sku") || ""}`.trim();
  const products = parseProducts(url.searchParams.get("products"));

  if (!emailType) {
    return json(
      {
        html: "",
        notice: "emailType is required.",
        templateId: "",
      },
      {status: 400},
    );
  }

  try {
    const rendered = await renderNotifyDockTemplate({
      customerEmail,
      emailType,
      firstName,
      orderNumber,
      products,
      shipDate,
      sku,
    });

    return json({
      html: sanitizeRenderedEmailHtml(rendered.html),
      notice: "",
      templateId: rendered.templateId,
    });
  } catch (error) {
    return json(
      {
        html: "",
        notice:
          error instanceof Error
            ? error.message
            : "Notify Dock could not render the Klaviyo preview.",
        templateId: "",
      },
      {status: error?.status || 500},
    );
  }
}

export default function NotifyDockPreviewPage() {
  const {html, notice, templateId} = useLoaderData();

  return (
    <Page>
      <TitleBar title="Rendered Klaviyo Preview" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {notice ? <Banner tone="critical">{notice}</Banner> : null}

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

function sanitizeRenderedEmailHtml(html) {
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
