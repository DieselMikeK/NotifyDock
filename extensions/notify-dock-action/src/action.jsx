import {
  AdminAction,
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  DateField,
  DatePicker,
  Divider,
  Image,
  InlineStack,
  Pressable,
  ProgressIndicator,
  Select,
  Text,
  TextField,
  reactExtension,
} from "@shopify/ui-extensions-react/admin";
import {useEffect, useState} from "react";
import {
  BUSINESS_DAYS_RANGE_DELAY_STATE,
  canSendComposer,
  DYNAMIC_SHIPPING_DELAY_EMAIL_TYPE,
  EMAIL_TYPES,
  SPECIFIC_DATE_DELAY_STATE,
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
    orderSkuReferences,
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

        {showsSku(emailType) && orderSkuReferences.length ? (
          <InlineStack gap="small" inlineAlignment="start">
            {orderSkuReferences.map(({quantity, sku: referenceSku}) => (
              <Pressable
                key={referenceSku}
                accessibilityLabel={`Add SKU ${referenceSku}`}
                onPress={() => {
                  setSku(appendSkuValue(sku, referenceSku));
                }}
              >
                <Badge>
                  {quantity > 1 ? `${referenceSku} x${quantity}` : referenceSku}
                </Badge>
              </Pressable>
            ))}
          </InlineStack>
        ) : null}

        {showsSku(emailType) && loadingProduct ? (
          <ProgressIndicator size="small" accessibilityLabel="Loading product preview" />
        ) : null}

        {showsSku(emailType) && lookupError ? <Banner tone="warning">{lookupError}</Banner> : null}

        {renderedPreviewError ? (
          <Banner tone="warning">{renderedPreviewError}</Banner>
        ) : null}

        {previewProducts.length ? (
          <Box paddingBlockStart="base">
            <ProductPreviewList
              dynamicDelayDetails={dynamicDelayDetails}
              dynamicGlobalShipDate={dynamicGlobalShipDate}
              emailType={emailType}
              onDynamicDelayDateChange={(sku, value) => {
                setDynamicDelayDetails((current) =>
                  updateDynamicDelayDetail(current, sku, {
                    delayDate: value,
                    delayRangeEnd: "",
                    delayRangeStart: "",
                    delayState: value ? SPECIFIC_DATE_DELAY_STATE : "",
                  }),
                );
              }}
              onDynamicDelayRangeChange={(sku, value) => {
                setDynamicDelayDetails((current) =>
                  updateDynamicDelayDetail(current, sku, {
                    delayDate: "",
                    delayRangeEnd: value.end,
                    delayRangeStart: value.start,
                    delayState:
                      value.start && value.end
                        ? BUSINESS_DAYS_RANGE_DELAY_STATE
                        : "",
                  }),
                );
              }}
              onDynamicGlobalShipDateChange={(value) => {
                setDynamicGlobalShipDate(value);
              }}
              products={previewProducts}
            />
          </Box>
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
  onDynamicDelayDateChange,
  onDynamicDelayRangeChange,
  onDynamicGlobalShipDateChange,
  products,
}) {
  const dynamicDelayLookup = new Map(
    dynamicDelayDetails.map((detail) => [`${detail?.sku || ""}`.trim(), detail]),
  );
  const globalDelayActive =
    isDynamicShippingDelay(emailType) && Boolean(dynamicGlobalShipDate);
  const hasConfiguredPerItemDelay = dynamicDelayDetails.some((detail) =>
    detailHasDynamicDelay(detail),
  );
  const showDynamicGlobalSection =
    isDynamicShippingDelay(emailType) && hasResolvedDynamicProducts(products);
  const [activeEditor, setActiveEditor] = useState(EMPTY_DYNAMIC_DELAY_EDITOR);
  const [draftDelayDate, setDraftDelayDate] = useState("");
  const [draftDelayRange, setDraftDelayRange] = useState(EMPTY_DYNAMIC_DELAY_RANGE);

  useEffect(() => {
    if (!activeEditor.sku) {
      return;
    }

    if (globalDelayActive) {
      setActiveEditor(EMPTY_DYNAMIC_DELAY_EDITOR);
      setDraftDelayDate("");
      setDraftDelayRange(EMPTY_DYNAMIC_DELAY_RANGE);
      return;
    }

    if (!products.some((product) => `${product?.sku || ""}`.trim() === activeEditor.sku)) {
      setActiveEditor(EMPTY_DYNAMIC_DELAY_EDITOR);
      setDraftDelayDate("");
      setDraftDelayRange(EMPTY_DYNAMIC_DELAY_RANGE);
    }
  }, [activeEditor.sku, globalDelayActive, products]);

  function openDynamicDelayEditor(sku, mode) {
    const normalizedSku = `${sku || ""}`.trim();
    const detail = dynamicDelayLookup.get(normalizedSku) || EMPTY_DYNAMIC_DELAY_DETAIL;

    setActiveEditor({
      mode,
      sku: normalizedSku,
    });
    setDraftDelayDate(
      detail.delayState === SPECIFIC_DATE_DELAY_STATE
        ? `${detail.delayDate || ""}`.trim()
        : "",
    );
    setDraftDelayRange(
      isBusinessDaysDynamicDelay(detail)
        ? normalizeDynamicDelayRange(detail)
        : EMPTY_DYNAMIC_DELAY_RANGE,
    );
  }

  function closeDynamicDelayEditor() {
    setActiveEditor(EMPTY_DYNAMIC_DELAY_EDITOR);
    setDraftDelayDate("");
    setDraftDelayRange(EMPTY_DYNAMIC_DELAY_RANGE);
  }

  return (
    <BlockStack gap="base">
      {showDynamicGlobalSection ? (
        <BlockStack gap="base">
          <Divider />
          <Text>Global Ship Date - Enter if all products share the same date</Text>
          <DateField
            disabled={hasConfiguredPerItemDelay && !dynamicGlobalShipDate}
            label=""
            value={dynamicGlobalShipDate}
            onChange={onDynamicGlobalShipDateChange}
          />
          <Divider />
        </BlockStack>
      ) : null}

      {products.map((product, index) => (
        <BlockStack key={`${product.sku || "sku"}-${index}`} gap="base">
          {showDynamicGlobalSection && index === 0 ? null : <Divider />}
          <Box padding="small">
            {isDynamicShippingDelay(emailType) &&
             !product.isPlaceholder &&
             `${product.sku || ""}`.trim() === activeEditor.sku ? (
               <DynamicDelayEditorCard
                 delayRange={draftDelayRange}
                 delayDate={draftDelayDate}
                 mode={activeEditor.mode}
                 onDelayDateChange={(value) => {
                   setDraftDelayDate(value);
                   onDynamicDelayDateChange(product.sku, value);
                   closeDynamicDelayEditor();
                 }}
                 onDelayRangeChange={(value) => {
                   const normalizedValue = normalizeDynamicDelayRange(value);

                   setDraftDelayRange(normalizedValue);

                   if (normalizedValue.start && normalizedValue.end) {
                     onDynamicDelayRangeChange(product.sku, normalizedValue);
                     closeDynamicDelayEditor();
                   }
                 }}
               />
             ) : (
               <BlockStack gap="small">
                <InlineStack blockAlignment="start" gap="small" inlineAlignment="start">
                  <Box
                    blockSize={50}
                    inlineSize={50}
                    maxInlineSize={50}
                    minInlineSize={50}
                  >
                    {product.productImageUrl ? (
                      <Image
                        source={product.productImageUrl}
                        accessibilityLabel={
                          product.productImageAlt || buildProductTitle(product)
                        }
                      />
                    ) : (
                      <Box blockSize={50} inlineSize={50} padding="small">
                        <Text>No image</Text>
                      </Box>
                    )}
                  </Box>

                  <Box inlineSize="72%">
                    <BlockStack gap="small">
                      <Text fontWeight="bold">
                        {buildCompactProductTitle(product)}
                      </Text>

                      <Text>SKU: {product.sku || "{{ item.sku }}"}</Text>

                      {isUnresolvedStoreSku(product) ? (
                        <Text>This SKU isn't found on our store. The email will use the SKU only.</Text>
                      ) : null}
                    </BlockStack>
                  </Box>
                </InlineStack>

                {isDynamicShippingDelay(emailType) && !product.isPlaceholder ? (
                  <DynamicDelaySummary
                    detail={dynamicDelayLookup.get(product.sku) || EMPTY_DYNAMIC_DELAY_DETAIL}
                    disabled={globalDelayActive}
                    onBuiltToOrderEdit={() => {
                      openDynamicDelayEditor(
                        product.sku || `${index}`,
                        BUILT_TO_ORDER_EDITOR_MODE,
                      );
                    }}
                    onShipDateEdit={() => {
                      openDynamicDelayEditor(
                        product.sku || `${index}`,
                        ITEM_SHIP_DATE_EDITOR_MODE,
                      );
                    }}
                  />
                ) : null}
              </BlockStack>
            )}
          </Box>
        </BlockStack>
      ))}

      {products.length ? <Divider /> : null}
    </BlockStack>
  );
}

function DynamicDelaySummary({
  detail,
  disabled,
  onBuiltToOrderEdit,
  onShipDateEdit,
}) {
  return (
    <InlineStack blockAlignment="center" gap="small" inlineAlignment="start">
      <Pressable
        accessibilityLabel={buildDynamicDelayShipDateSummaryLabel(detail)}
        onPress={disabled ? undefined : onShipDateEdit}
      >
        <Badge size="small-100">
          {buildDynamicDelayShipDateSummaryLabel(detail)}
        </Badge>
      </Pressable>

      <Pressable
        accessibilityLabel={buildDynamicDelayBuiltToOrderSummaryLabel(detail)}
        onPress={disabled ? undefined : onBuiltToOrderEdit}
      >
        <Badge size="small-100">
          {buildDynamicDelayBuiltToOrderSummaryLabel(detail)}
        </Badge>
      </Pressable>
    </InlineStack>
  );
}

function DynamicDelayEditorCard({
  delayRange,
  delayDate,
  mode,
  onDelayDateChange,
  onDelayRangeChange,
}) {
  return (
    <BlockStack gap="small">
      <Text>
        {mode === BUILT_TO_ORDER_EDITOR_MODE
          ? "Select built-to-order date range"
          : "Select item ship date"}
      </Text>

      <Box inlineSize="100%" maxInlineSize="100%" minInlineSize="100%">
        <DatePicker
          selected={
            mode === BUILT_TO_ORDER_EDITOR_MODE
              ? buildDatePickerRangeSelection(delayRange)
              : delayDate || undefined
          }
          onChange={(value) => {
            if (mode === BUILT_TO_ORDER_EDITOR_MODE) {
              if (!value || Array.isArray(value) || typeof value === "string") {
                return;
              }

              onDelayRangeChange(value);
              return;
            }

            if (typeof value !== "string") {
              return;
            }

            onDelayDateChange(value);
          }}
        />
      </Box>
    </BlockStack>
  );
}

function buildDynamicDelayShipDateSummaryLabel(detail) {
  if (
    detail.delayState === SPECIFIC_DATE_DELAY_STATE &&
    `${detail.delayDate || ""}`.trim()
  ) {
    return detail.delayDate;
  }

  return "Set Item Ship Date";
}

function buildDynamicDelayBuiltToOrderSummaryLabel(detail) {
  if (isBusinessDaysDynamicDelay(detail) && detail.delayRangeStart && detail.delayRangeEnd) {
    return `Built to Order ${formatDynamicDelayRangeLabel(detail)}`;
  }

  return "Built to Order";
}

function sanitizeFieldToken(value) {
  return `${value || "item"}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
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
    return "Shipping Delay";
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
  if (isUnresolvedStoreSku(product)) {
    return `SKU ${product.sku}`;
  }

  return product?.productTitle || "{{ item.product_title }}";
}

function buildCompactProductTitle(product) {
  return truncateText(buildProductTitle(product), 56);
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

function truncateText(value, maxLength) {
  const normalizedValue = `${value || ""}`.trim();

  if (!normalizedValue || normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
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

function appendSkuValue(currentValue, nextSku) {
  const normalizedNextSku = `${nextSku || ""}`.trim();

  if (!normalizedNextSku) {
    return `${currentValue || ""}`;
  }

  const requestedSkus = splitSkuInput(currentValue);

  if (requestedSkus.includes(normalizedNextSku)) {
    return requestedSkus.join(", ");
  }

  return [...requestedSkus, normalizedNextSku].join(", ");
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

const EMPTY_DYNAMIC_DELAY_DETAIL = {
  delayDate: "",
  delayRangeEnd: "",
  delayRangeStart: "",
  delayState: "",
};
const EMPTY_DYNAMIC_DELAY_RANGE = {
  end: "",
  start: "",
};
const EMPTY_DYNAMIC_DELAY_EDITOR = {
  mode: "",
  sku: "",
};
const ITEM_SHIP_DATE_EDITOR_MODE = "item_ship_date";
const BUILT_TO_ORDER_EDITOR_MODE = "built_to_order";

function isDynamicShippingDelay(emailType) {
  return emailType === DYNAMIC_SHIPPING_DELAY_EMAIL_TYPE;
}

function buildDatePickerRangeSelection(value) {
  const normalizedRange = normalizeDynamicDelayRange(value);

  return normalizedRange.start || normalizedRange.end ? normalizedRange : {};
}

function detailHasDynamicDelay(detail) {
  return Boolean(
    `${detail?.delayDate || ""}`.trim() ||
      `${detail?.delayRangeStart || ""}`.trim() ||
      `${detail?.delayRangeEnd || ""}`.trim() ||
      `${detail?.delayState || ""}`.trim(),
  );
}

function formatCompactDelayDate(value) {
  const [year, month, day] = `${value || ""}`.trim().split("-").map(Number);

  if (!year || !month || !day) {
    return `${value || ""}`.trim();
  }

  return `${month}/${day}`;
}

function formatDynamicDelayRangeLabel(detail) {
  const startLabel = formatCompactDelayDate(detail.delayRangeStart);
  const endLabel = formatCompactDelayDate(detail.delayRangeEnd);

  if (startLabel && endLabel) {
    return `${startLabel}-${endLabel}`;
  }

  return startLabel || endLabel || "";
}

function isBusinessDaysDynamicDelay(detail) {
  const delayState = `${detail?.delayState || ""}`.trim();

  return (
    delayState === BUSINESS_DAYS_RANGE_DELAY_STATE ||
    delayState === "business_days_12_15"
  );
}

function normalizeDynamicDelayRange(value) {
  return {
    end: `${value?.end || ""}`.trim(),
    start: `${value?.start || ""}`.trim(),
  };
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
      delayRangeEnd: `${currentDetail?.delayRangeEnd || ""}`.trim(),
      delayRangeStart: `${currentDetail?.delayRangeStart || ""}`.trim(),
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

function decoratePreviewProducts({dynamicDelayDetails, emailType, products}) {
  if (!isDynamicShippingDelay(emailType) || !Array.isArray(products)) {
    return Array.isArray(products) ? products : [];
  }

  const detailsBySku = new Map(
    dynamicDelayDetails.map((detail) => [
      `${detail?.sku || ""}`.trim(),
      {
        delayDate: `${detail?.delayDate || ""}`.trim(),
        delayRangeEnd: `${detail?.delayRangeEnd || ""}`.trim(),
        delayRangeStart: `${detail?.delayRangeStart || ""}`.trim(),
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
      delayRangeEnd: detail.delayRangeEnd,
      delayRangeStart: detail.delayRangeStart,
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

  return dynamicDelayDetails.length === products.length;
}

function isUnresolvedStoreSku(product) {
  return Boolean(`${product?.sku || ""}`.trim()) && !`${product?.productTitle || ""}`.trim();
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
