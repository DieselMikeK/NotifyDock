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
  DYNAMIC_SHIPPING_DELAY_EMAIL_TYPE,
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
    handleSend,
    history,
    historyHasMore,
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

  const selectedHistoryEntry =
    history.find((entry) => entry.id === selectedHistoryId) || null;
  const previewProducts = buildPreviewProducts(emailType, products, sku);
  const [dynamicGlobalShipDate, setDynamicGlobalShipDate] = useState("");
  const [dynamicDelayDetails, setDynamicDelayDetails] = useState([]);
  const [renderedPreviewError, setRenderedPreviewError] = useState("");
  const [renderedPreviewLoading, setRenderedPreviewLoading] = useState(false);
  const [renderedPreviewHref, setRenderedPreviewHref] = useState("");
  const canSend =
    canSendComposer({
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
    }) &&
    isDynamicShippingDelayReady({
      dynamicDelayDetails,
      emailType,
      globalShipDate: dynamicGlobalShipDate,
      products,
    });

  useEffect(() => {
    if (!isDynamicShippingDelay(emailType)) {
      setDynamicGlobalShipDate("");
      setDynamicDelayDetails([]);
      return;
    }

    if (!products.length) {
      setDynamicGlobalShipDate("");
      setDynamicDelayDetails([]);
      return;
    }

    setDynamicDelayDetails((current) =>
      synchronizeDynamicDelayDetails(current, products),
    );
  }, [emailType, products]);

  useEffect(() => {
    let cancelled = false;
    const payload = buildRenderedPreviewPayload({
      customerEmail,
      emailType,
      firstName,
      globalShipDate: dynamicGlobalShipDate,
      orderNumber,
      products: decoratePreviewProducts({
        dynamicDelayDetails,
        emailType,
        products,
      }),
      shipDate: resolveRenderedPreviewShipDate({
        emailType,
        globalShipDate: dynamicGlobalShipDate,
        shipDate,
      }),
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
  }, [
    customerEmail,
    dynamicDelayDetails,
    dynamicGlobalShipDate,
    emailType,
    firstName,
    orderNumber,
    products,
    shipDate,
    sku,
  ]);

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
          onPress={() =>
            handleSend({
              globalShipDate: dynamicGlobalShipDate,
              productDelayDetails: dynamicDelayDetails,
            })
          }
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
                  ? `Hide history (${formatHistoryCount(history.length, historyHasMore)})`
                  : `View history (${formatHistoryCount(history.length, historyHasMore)})`}
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
              disabled={!fromOptions.length}
              label="From"
              options={fromOptions}
              value={fromAddress}
              onChange={setFromAddress}
            />
          </Box>
        </InlineStack>

        <InlineStack inlineAlignment="space-between">
          {!isDynamicShippingDelay(emailType) ? (
            <Box inlineSize="48%">
              <DateField
                disabled={!showsShipDate(emailType)}
                label="Ship date"
                value={shipDate}
                onChange={setShipDate}
              />
            </Box>
          ) : null}

          <Box inlineSize={isDynamicShippingDelay(emailType) ? "100%" : "48%"}>
            <TextField
              disabled={!showsSku(emailType)}
              label="SKU"
              value={sku}
              onChange={setSku}
            />
          </Box>
        </InlineStack>

        {showsSku(emailType) && loadingProduct ? (
          <ProgressIndicator size="small" accessibilityLabel="Loading product preview" />
        ) : null}

        {showsSku(emailType) && lookupError ? <Banner tone="warning">{lookupError}</Banner> : null}

        {isDynamicShippingDelay(emailType) ? (
          <Banner tone="info">
            Dynamic Shipping Delay draft: the item-level delay logic is wired in, and you still need to provide the final copy for each condition before we lock the template content.
          </Banner>
        ) : null}

        {renderedPreviewError ? (
          <Banner tone="warning">{renderedPreviewError}</Banner>
        ) : null}

        {previewProducts.length ? (
          <ProductPreviewList
            dynamicDelayDetails={dynamicDelayDetails}
            dynamicGlobalShipDate={dynamicGlobalShipDate}
            emailType={emailType}
            onClearDynamicGlobalShipDate={() => {
              setDynamicGlobalShipDate("");
            }}
            onDynamicDelayDateChange={(sku, value) => {
              setDynamicDelayDetails((current) =>
                updateDynamicDelayDetail(current, sku, {delayDate: value}),
              );
            }}
            onDynamicDelayStateChange={(sku, value) => {
              setDynamicDelayDetails((current) =>
                updateDynamicDelayDetail(current, sku, {
                  delayDate: value === "specific_date"
                    ? getExistingDynamicDelayDate(current, sku)
                    : "",
                  delayState: value,
                }),
              );
            }}
            onDynamicGlobalShipDateChange={(value) => {
              setDynamicGlobalShipDate(value);
            }}
            products={previewProducts}
          />
        ) : null}

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

function ProductPreviewList({
  dynamicDelayDetails,
  dynamicGlobalShipDate,
  emailType,
  onClearDynamicGlobalShipDate,
  onDynamicDelayDateChange,
  onDynamicDelayStateChange,
  onDynamicGlobalShipDateChange,
  products,
}) {
  const dynamicDelayLookup = new Map(
    dynamicDelayDetails.map((detail) => [`${detail?.sku || ""}`.trim(), detail]),
  );
  const globalDelayActive =
    isDynamicShippingDelay(emailType) && Boolean(dynamicGlobalShipDate);
  const hasConfiguredPerItemDelay = dynamicDelayDetails.some(
    (detail) => detail.delayState || detail.delayDate,
  );

  return (
    <BlockStack gap="base">
      {isDynamicShippingDelay(emailType) && hasResolvedDynamicProducts(products) ? (
        <Box padding="base">
          <BlockStack gap="small">
            <Text fontWeight="bold">Global ship date</Text>
            <Text>
              Set one shared date for every listed SKU. Item-level delay controls stay disabled while a global date is set.
            </Text>

            <InlineStack inlineAlignment="space-between">
              <Box inlineSize="72%">
                <DateField
                  disabled={hasConfiguredPerItemDelay && !dynamicGlobalShipDate}
                  label="Global ship date"
                  value={dynamicGlobalShipDate}
                  onChange={onDynamicGlobalShipDateChange}
                />
              </Box>

              <Box inlineSize="24%">
                <Button
                  disabled={!dynamicGlobalShipDate}
                  onPress={onClearDynamicGlobalShipDate}
                  variant="secondary"
                >
                  Clear
                </Button>
              </Box>
            </InlineStack>

            {hasConfiguredPerItemDelay && !dynamicGlobalShipDate ? (
              <Text>Clear item-level delay selections to use one shared date for all SKUs.</Text>
            ) : null}
          </BlockStack>
        </Box>
      ) : null}

      {products.map((product, index) => (
        <BlockStack key={`${product.sku || "sku"}-${index}`} gap="base">
          <Box padding="base">
            <BlockStack gap="base">
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

              {isDynamicShippingDelay(emailType) && !product.isPlaceholder ? (
                <DynamicDelayEditor
                  detail={dynamicDelayLookup.get(product.sku) || EMPTY_DYNAMIC_DELAY_DETAIL}
                  disabled={globalDelayActive}
                  onDelayDateChange={(value) => {
                    onDynamicDelayDateChange(product.sku, value);
                  }}
                  onDelayStateChange={(value) => {
                    onDynamicDelayStateChange(product.sku, value);
                  }}
                />
              ) : null}
            </BlockStack>
          </Box>

          {index < products.length - 1 ? <Divider /> : null}
        </BlockStack>
      ))}
    </BlockStack>
  );
}

function DynamicDelayEditor({
  detail,
  disabled,
  onDelayDateChange,
  onDelayStateChange,
}) {
  return (
    <BlockStack gap="small">
      <Select
        disabled={disabled}
        label="Delay update"
        options={DYNAMIC_DELAY_STATE_OPTIONS}
        placeholder="Choose the update for this SKU"
        value={detail.delayState || ""}
        onChange={onDelayStateChange}
      />

      {detail.delayState === "specific_date" ? (
        <DateField
          disabled={disabled}
          label="Item ship date"
          value={detail.delayDate || ""}
          onChange={onDelayDateChange}
        />
      ) : null}

      {disabled ? (
        <Text>Using the shared global ship date for every listed SKU.</Text>
      ) : null}
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
  if (emailType === "will_call_partially_ready") {
    return "Will Call - Partially Ready";
  }

  if (emailType === "will_call_in_progress") {
    return "Will Call - In Progress";
  }

  if (emailType === "will_call_ready") {
    return "Will Call Ready";
  }

  if (emailType === "shipping_delay") {
    return "Shipping Delay";
  }

  if (emailType === DYNAMIC_SHIPPING_DELAY_EMAIL_TYPE) {
    return "Dynamic Shipping Delay";
  }

  return "Backorder Notice";
}

function buildHistorySummary(entry) {
  return `${labelEmailType(entry.emailType)} Sent | ${formatHistoryTimestamp(entry.sentAt)} - To: ${entry.customerEmail}`;
}

function formatHistoryCount(count, hasMore) {
  if (hasMore && count >= 8) {
    return "8+";
  }

  return `${count}`;
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

function buildPreviewProducts(emailType, products, sku) {
  if (!showsSku(emailType)) {
    return [];
  }

  if (products.length) {
    return products.map((product) => ({
      ...product,
      isPlaceholder: false,
    }));
  }

  const requestedSkus = splitSkuInput(sku);

  if (!requestedSkus.length) {
    return [];
  }

  return requestedSkus.map((requestedSku) => ({
    isPlaceholder: true,
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

function showsSku(emailType) {
  return ![
    "will_call_ready",
    "will_call_in_progress",
  ].includes(emailType);
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
  globalShipDate,
  orderNumber,
  products,
  shipDate,
  sku,
}) {
  return {
    customerEmail: customerEmail || "",
    emailType: emailType || "",
    firstName: firstName || "",
    globalShipDate: globalShipDate || "",
    orderNumber: orderNumber || "",
    products: showsSku(emailType) ? products || [] : [],
    shipDate: shipDate || "",
    sku: showsSku(emailType) ? sku || "" : "",
  };
}

const DYNAMIC_DELAY_STATE_OPTIONS = [
  {label: "Specific date", value: "specific_date"},
  {label: "12-15 business days", value: "business_days_12_15"},
  {label: "No date yet", value: "no_date_yet"},
];

const EMPTY_DYNAMIC_DELAY_DETAIL = {
  delayDate: "",
  delayState: "",
};

function isDynamicShippingDelay(emailType) {
  return emailType === DYNAMIC_SHIPPING_DELAY_EMAIL_TYPE;
}

function synchronizeDynamicDelayDetails(currentDetails, products) {
  const currentBySku = new Map(
    currentDetails.map((detail) => [`${detail?.sku || ""}`.trim(), detail]),
  );

  return products.map((product) => {
    const sku = `${product?.sku || ""}`.trim();
    const currentDetail = currentBySku.get(sku);

    return {
      delayDate: `${currentDetail?.delayDate || ""}`.trim(),
      delayState: `${currentDetail?.delayState || ""}`.trim(),
      sku,
    };
  });
}

function updateDynamicDelayDetail(currentDetails, sku, updates) {
  return currentDetails.map((detail) => {
    if (`${detail?.sku || ""}`.trim() !== `${sku || ""}`.trim()) {
      return detail;
    }

    return {
      ...detail,
      ...updates,
    };
  });
}

function getExistingDynamicDelayDate(currentDetails, sku) {
  return (
    currentDetails.find(
      (detail) => `${detail?.sku || ""}`.trim() === `${sku || ""}`.trim(),
    )?.delayDate || ""
  );
}

function decoratePreviewProducts({dynamicDelayDetails, emailType, products}) {
  if (!isDynamicShippingDelay(emailType) || !Array.isArray(products)) {
    return Array.isArray(products) ? products : [];
  }

  const detailsBySku = new Map(
    dynamicDelayDetails.map((detail) => [
      `${detail?.sku || ""}`.trim(),
      {
        delayDate: `${detail?.delayDate || ""}`.trim(),
        delayState: `${detail?.delayState || ""}`.trim(),
      },
    ]),
  );

  return products.map((product) => {
    const detail = detailsBySku.get(`${product?.sku || ""}`.trim());

    if (!detail) {
      return product;
    }

    return {
      ...product,
      delayDate: detail.delayDate,
      delayState: detail.delayState,
    };
  });
}

function resolveRenderedPreviewShipDate({emailType, globalShipDate, shipDate}) {
  if (isDynamicShippingDelay(emailType)) {
    return globalShipDate || "";
  }

  return shipDate || "";
}

function hasResolvedDynamicProducts(products) {
  return products.some((product) => !product?.isPlaceholder);
}

function isDynamicShippingDelayReady({
  dynamicDelayDetails,
  emailType,
  globalShipDate,
  products,
}) {
  if (!isDynamicShippingDelay(emailType)) {
    return true;
  }

  if (!Array.isArray(products) || !products.length) {
    return false;
  }

  if (`${globalShipDate || ""}`.trim()) {
    return true;
  }

  return dynamicDelayDetails.length === products.length &&
    dynamicDelayDetails.every((detail) => {
      const delayState = `${detail?.delayState || ""}`.trim();

      if (!delayState) {
        return false;
      }

      if (delayState !== "specific_date") {
        return true;
      }

      return Boolean(`${detail?.delayDate || ""}`.trim());
    });
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
