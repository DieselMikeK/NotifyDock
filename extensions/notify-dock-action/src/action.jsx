import {
  AdminAction,
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  DateField,
  Divider,
  Image,
  InlineStack,
  ProgressIndicator,
  Select,
  Text,
  TextField,
  reactExtension,
} from "@shopify/ui-extensions-react/admin";
import {useEffect, useState} from "react";
import {
  canSendComposer,
  EMAIL_TYPES,
  useComposerState,
} from "./composer.jsx";

const TARGET = "admin.order-details.action.render";

export default reactExtension(TARGET, () => <ActionComposer />);

function ActionComposer() {
  const {
    api,
    customerEmail,
    emailType,
    error,
    firstName,
    fromAddress,
    fromOptions,
    fromOptionsLoading,
    handleSend,
    history,
    historyExpanded,
    historyLoading,
    historyNotice,
    launchMode,
    loadingOrder,
    loadingProduct,
    lookupError,
    orderNumber,
    products,
    selectedHistoryId,
    sending,
    setEmailType,
    setFromAddress,
    setHistoryExpanded,
    setShipDate,
    setSku,
    setSubject,
    shipDate,
    sku,
    status,
    subject,
  } = useComposerState(TARGET);

  const canSend = canSendComposer({
    customerEmail,
    emailType,
    fromAddress,
    loadingOrder,
    loadingProduct,
    lookupError,
    products,
    shipDate,
    sku,
    subject,
  });
  const selectedHistoryEntry =
    history.find((entry) => entry.id === selectedHistoryId) || null;
  const previewProducts = buildPreviewProducts(products, sku);
  const [renderedPreviewError, setRenderedPreviewError] = useState("");
  const [renderedPreviewLoading, setRenderedPreviewLoading] = useState(false);
  const [renderedPreviewHref, setRenderedPreviewHref] = useState("");

  useEffect(() => {
    let cancelled = false;
    const payload = buildRenderedPreviewPayload({
      customerEmail,
      emailType,
      firstName,
      orderNumber,
      products,
      shipDate,
      sku,
    });

    if (!payload.emailType) {
      setRenderedPreviewError("");
      setRenderedPreviewLoading(false);
      setRenderedPreviewHref("");
      return;
    }

    const timeoutId = setTimeout(async () => {
      setRenderedPreviewLoading(true);
      setRenderedPreviewError("");

      try {
        const previewHref = await requestPreviewHref(payload);

        if (cancelled) {
          return;
        }

        setRenderedPreviewHref(previewHref);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setRenderedPreviewHref("");
        setRenderedPreviewError(
          error instanceof Error
            ? error.message
            : "Notify Dock could not prepare the rendered preview.",
        );
      } finally {
        if (!cancelled) {
          setRenderedPreviewLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [customerEmail, emailType, firstName, orderNumber, products, shipDate, sku]);

  if (launchMode === "history_email") {
    return (
      <AdminAction
        loading={historyLoading || loadingOrder}
        secondaryAction={<Button onPress={api.close}>Close</Button>}
        title="Email"
      >
        <BlockStack gap="base">
          {historyNotice ? <Text>{historyNotice}</Text> : null}

          {!historyLoading && !loadingOrder && selectedHistoryEntry ? (
            <EmailPreviewContent entry={selectedHistoryEntry} />
          ) : null}

          {!historyLoading && !loadingOrder && !selectedHistoryEntry && !historyNotice ? (
            <Text>This email could not be loaded.</Text>
          ) : null}
        </BlockStack>
      </AdminAction>
    );
  }

  return (
    <AdminAction
      title="Customer Email Composer"
      primaryAction={
        <Button
          disabled={!canSend || sending}
          onPress={handleSend}
          variant="primary"
        >
          {sending ? "Sending..." : "Send email"}
        </Button>
      }
      secondaryAction={<Button onPress={api.close}>Close</Button>}
    >
      <BlockStack gap="base">
        {history.length ? (
          <BlockStack gap="base">
            <InlineStack inlineAlignment="start">
              <Button
                onPress={() => {
                  setHistoryExpanded(!historyExpanded);
                }}
                variant="secondary"
              >
                {historyExpanded
                  ? `Hide history (${history.length})`
                  : `View history (${history.length})`}
              </Button>
            </InlineStack>

            {historyExpanded ? (
              <Box maxBlockSize={1000}>
                <EmailHistoryList
                  history={history}
                />
              </Box>
            ) : null}
          </BlockStack>
        ) : null}

        {historyLoading ? <Text>Loading email history...</Text> : null}

        {historyNotice ? <Text>{historyNotice}</Text> : null}

        {!loadingOrder && !historyLoading && !history.length && !historyNotice ? (
          <Text>No email history yet for this order.</Text>
        ) : null}

        {historyExpanded ? (
          <Box paddingBlock="large base">
            <Divider />
          </Box>
        ) : null}

        {loadingOrder ? (
          <ProgressIndicator size="small" accessibilityLabel="Loading order details" />
        ) : null}

        {error ? <Banner tone="critical">{error}</Banner> : null}

        {status ? <Banner tone={status.tone}>{status.message}</Banner> : null}

        <InlineStack inlineAlignment="space-between">
          <Box inlineSize="48%">
            <Select
              label="Email type"
              options={EMAIL_TYPES}
              value={emailType}
              onChange={setEmailType}
            />
          </Box>

          <Box inlineSize="48%">
            <TextField
              label="Subject"
              value={subject}
              onChange={setSubject}
            />
          </Box>
        </InlineStack>

        <InlineStack inlineAlignment="space-between">
          <Box inlineSize="48%">
            <TextField
              disabled
              label="To"
              value={customerEmail}
            />
          </Box>

          <Box inlineSize="48%">
            <Select
              disabled={fromOptionsLoading || !fromOptions.length}
              label="From"
              options={fromOptions}
              value={fromAddress}
              onChange={setFromAddress}
            />
          </Box>
        </InlineStack>

        <InlineStack inlineAlignment="space-between">
          <Box inlineSize="48%">
            <DateField
              disabled={!showsShipDate(emailType)}
              label="Ship date"
              value={shipDate}
              onChange={setShipDate}
            />
          </Box>

          <Box inlineSize="48%">
            <TextField
              label="SKU"
              value={sku}
              onChange={setSku}
            />
          </Box>
        </InlineStack>

        {loadingProduct ? (
          <ProgressIndicator size="small" accessibilityLabel="Loading product preview" />
        ) : null}

        {lookupError ? <Banner tone="warning">{lookupError}</Banner> : null}

        {renderedPreviewError ? (
          <Banner tone="warning">{renderedPreviewError}</Banner>
        ) : null}

        {previewProducts.length ? <ProductPreviewList products={previewProducts} /> : null}

        <InlineStack inlineAlignment="start" gap="base">
          {renderedPreviewHref ? (
            <Button
              disabled={renderedPreviewLoading}
              href={renderedPreviewHref}
              target="_blank"
              variant="secondary"
            >
              {renderedPreviewLoading ? "Preparing preview..." : "Rendered preview"}
            </Button>
          ) : (
            <Button disabled variant="secondary">
              {renderedPreviewLoading ? "Preparing preview..." : "Rendered preview"}
            </Button>
          )}
        </InlineStack>
      </BlockStack>
    </AdminAction>
  );
}

function EmailHistoryList({history}) {
  return (
    <BlockStack gap="none">
      {history.map((entry, index) => (
        <HistoryTimelineItem
          key={entry.id}
          entry={entry}
          isFirst={index === 0}
          isLast={index === history.length - 1}
        />
      ))}
    </BlockStack>
  );
}

function HistoryTimelineItem({entry, isFirst, isLast}) {
  return (
    <BlockStack gap="none">
      {!isFirst ? (
        <InlineStack blockAlignment="end" gap="base" inlineAlignment="start">
          <HistoryTimelineConnector alignment="end" />
          <Box />
        </InlineStack>
      ) : null}

      <InlineStack blockAlignment="center" gap="base" inlineAlignment="start">
        <HistoryTimelineDot />

        <Box paddingBlockEnd="small">
          <InlineStack inlineAlignment="start">
            <Badge>{buildHistorySummary(entry)}</Badge>
          </InlineStack>
        </Box>
      </InlineStack>

      <InlineStack blockAlignment="start" gap="base" inlineAlignment="start">
        {!isLast ? (
          <HistoryTimelineConnector alignment="start" />
        ) : (
          <HistoryTimelineSpacer />
        )}

        <Box paddingBlockEnd="base">
          <InlineStack inlineAlignment="start">
            <HistoryPreviewButton entry={entry} />
          </InlineStack>
        </Box>
      </InlineStack>
    </BlockStack>
  );
}

function HistoryTimelineConnector({alignment = "center"}) {
  return (
    <Box inlineSize={20} minInlineSize={20}>
      <InlineStack blockAlignment={alignment} inlineAlignment="center">
        <Text>│</Text>
      </InlineStack>
    </Box>
  );
}

function HistoryTimelineDot() {
  return (
    <Box inlineSize={20} minInlineSize={20}>
      <InlineStack inlineAlignment="center">
        <Text>●</Text>
      </InlineStack>
    </Box>
  );
}

function HistoryTimelineSpacer() {
  return (
    <Box inlineSize={20} minInlineSize={20}>
      <InlineStack inlineAlignment="center">
        <Text> </Text>
      </InlineStack>
    </Box>
  );
}

function HistoryPreviewButton({entry}) {
  const [error, setError] = useState("");
  const [href, setHref] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadHistoryPreviewHref() {
      if (!entry?.id) {
        setHref("");
        setError("This saved email could not be opened.");
        return;
      }

      setLoading(true);
      setError("");

      try {
        const previewHref = await requestPreviewHref({
          historyId: entry.id,
        });

        if (cancelled) {
          return;
        }

        setHref(previewHref);
      } catch (previewError) {
        if (cancelled) {
          return;
        }

        setHref("");
        setError(
          previewError instanceof Error
            ? previewError.message
            : "Notify Dock could not prepare this saved email preview.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadHistoryPreviewHref();

    return () => {
      cancelled = true;
    };
  }, [entry?.id]);

  return (
    <BlockStack gap="small">
      {href ? (
        <Button
          disabled={loading}
          href={href}
          target="_blank"
          variant="secondary"
        >
          {loading ? "Preparing preview..." : "View email"}
        </Button>
      ) : (
        <Button disabled variant="secondary">
          {loading ? "Preparing preview..." : "View email"}
        </Button>
      )}

      {error ? <Text>{error}</Text> : null}
    </BlockStack>
  );
}

function ProductPreviewList({products}) {
  return (
    <BlockStack gap="base">
      {products.map((product, index) => (
        <BlockStack key={`${product.sku || "sku"}-${index}`} gap="base">
          <Box padding="base">
            <InlineStack blockAlignment="start" gap="base" inlineAlignment="start">
              <Box
                blockSize={120}
                inlineSize={120}
                maxInlineSize={120}
                minInlineSize={120}
              >
                {product.productImageUrl ? (
                  <Image
                    source={product.productImageUrl}
                    accessibilityLabel={
                      product.productImageAlt || buildProductTitle(product)
                    }
                  />
                ) : (
                  <Box blockSize={120} inlineSize={120} padding="base">
                    <Text>No image</Text>
                  </Box>
                )}
              </Box>

              <Box inlineSize="60%">
                <BlockStack gap="small">
                  <Text fontWeight="bold">{buildProductTitle(product)}</Text>

                  {buildProductVariantTitle(product) ? (
                    <Text>{buildProductVariantTitle(product)}</Text>
                  ) : null}

                  <Text>SKU: {product.sku || "{{ item.sku }}"}</Text>
                </BlockStack>
              </Box>
            </InlineStack>
          </Box>

          {index < products.length - 1 ? <Divider /> : null}
        </BlockStack>
      ))}
    </BlockStack>
  );
}

function EmailPreviewContent({entry}) {
  const paragraphs = buildEmailPreviewParagraphs(entry.message);

  return (
    <BlockStack gap="small">
      <Text fontWeight="bold">{entry.subject}</Text>

      {paragraphs.length ? (
        <BlockStack gap="small">
          {paragraphs.map((paragraph, index) => (
            <Text key={`${entry.id}-paragraph-${index}`}>{paragraph}</Text>
          ))}
        </BlockStack>
      ) : (
        <Text>No email body saved for this email.</Text>
      )}
    </BlockStack>
  );
}

function labelEmailType(emailType) {
  if (emailType === "will_call_in_progress") {
    return "Will Call - In Progress";
  }

  if (emailType === "will_call_ready") {
    return "Will Call Ready";
  }

  if (emailType === "shipping_delay") {
    return "Shipping Delay";
  }

  return "Backorder Notice";
}

function buildHistorySummary(entry) {
  return `${labelEmailType(entry.emailType)} Sent | ${formatHistoryTimestamp(entry.sentAt)} - To: ${entry.customerEmail}`;
}

function formatHistoryTimestamp(sentAt) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(sentAt));
  } catch (_error) {
    return sentAt;
  }
}

function buildProductTitle(product) {
  return product?.productTitle || "{{ item.product_title }}";
}

function buildProductVariantTitle(product) {
  if (!product?.productVariantTitle || product.productVariantTitle === "Default Title") {
    return "";
  }

  return product.productVariantTitle;
}

function buildPreviewProducts(products, sku) {
  if (products.length) {
    return products;
  }

  const requestedSkus = splitSkuInput(sku);

  if (!requestedSkus.length) {
    return [];
  }

  return requestedSkus.map((requestedSku) => ({
    productImageAlt: "",
    productImageUrl: "",
    productTitle: "{{ item.product_title }}",
    productVariantTitle: "",
    sku: requestedSku,
  }));
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

function showsShipDate(emailType) {
  return emailType === "backorder_notice" || emailType === "shipping_delay";
}

function formatEmailPreview(message) {
  return `${message || ""}`
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/center>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .trim();
}

function buildEmailPreviewParagraphs(message) {
  return formatEmailPreview(message)
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" "),
    )
    .filter(Boolean);
}

function buildRenderedPreviewPayload({
  customerEmail,
  emailType,
  firstName,
  orderNumber,
  products,
  shipDate,
  sku,
}) {
  return {
    customerEmail: customerEmail || "",
    emailType: emailType || "",
    firstName: firstName || "",
    orderNumber: orderNumber || "",
    products: products || [],
    shipDate: shipDate || "",
    sku: sku || "",
  };
}

async function requestPreviewHref(payload) {
  const response = await fetch("/api/notify-dock-preview-link", {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result.error || "Notify Dock could not prepare the rendered preview.",
    );
  }

  return buildPreviewHref(result);
}

function buildPreviewHref(result) {
  const embeddedPath = `${result?.embeddedPath || ""}`.trim();
  const fallbackUrl = `${result?.url || ""}`.trim();

  return embeddedPath
    ? `app://${embeddedPath.replace(/^\//, "")}`
    : fallbackUrl;
}
