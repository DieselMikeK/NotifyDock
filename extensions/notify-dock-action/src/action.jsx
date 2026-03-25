import {
  AdminAction,
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  InlineStack,
  Link,
  ProgressIndicator,
  Select,
  Text,
  TextArea,
  TextField,
  reactExtension,
} from "@shopify/ui-extensions-react/admin";
import {useEffect, useState} from "react";
import {
  canSendComposer,
  EMAIL_TYPES,
  FROM_OPTIONS,
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
    fromAddress,
    handleSend,
    history,
    historyExpanded,
    historyLoading,
    historyNotice,
    launchMode,
    loadingOrder,
    message,
    resetTemplate,
    selectedHistoryId,
    sending,
    setShipDate,
    setEmailType,
    setFromAddress,
    setHistoryExpanded,
    setMessage,
    setStatus,
    setSubject,
    shipDate,
    status,
    subject,
  } = useComposerState(TARGET);

  const canSend = canSendComposer({customerEmail, emailType, message, subject});
  const selectedHistoryEntry =
    history.find((entry) => entry.id === selectedHistoryId) || null;

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
      title="Notify Dock"
      primaryAction={
        <Button
          disabled={!canSend || loadingOrder || sending}
          onPress={handleSend}
          variant="primary"
        >
          {sending ? "Sending..." : "Send email"}
        </Button>
      }
      secondaryAction={<Button onPress={api.close}>Close</Button>}
    >
      <BlockStack gap="base">
        <Text>
          Compose a backorder, shipping delay, or will-call email to keep the customer up to date.
        </Text>

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
              <EmailHistoryList
                history={history}
                selectedHistoryId={selectedHistoryId}
              />
            ) : null}
          </BlockStack>
        ) : null}

        {historyLoading ? <Text>Loading email history...</Text> : null}

        {historyNotice ? <Text>{historyNotice}</Text> : null}

        {!loadingOrder && !historyLoading && !history.length && !historyNotice ? (
          <Text>No email history yet for this order.</Text>
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
              label="From"
              options={FROM_OPTIONS}
              value={fromAddress}
              onChange={setFromAddress}
            />
          </Box>
        </InlineStack>

        {showsShipDate(emailType) ? (
          <TextField
            label="Ship date"
            placeholder="Insert Ship date"
            value={shipDate}
            onChange={setShipDate}
          />
        ) : null}

        <TextArea
          label="Message"
          rows={18}
          value={message}
          onChange={setMessage}
        />

        <InlineStack inlineAlignment="start" gap="base">
          <Button onPress={resetTemplate} variant="secondary">
            Reset template
          </Button>

          <Button
            onPress={() => {
              setStatus(null);
            }}
            variant="tertiary"
          >
            Clear notice
          </Button>
        </InlineStack>
      </BlockStack>
    </AdminAction>
  );
}

function EmailHistoryList({history, selectedHistoryId}) {
  return (
    <BlockStack gap="small">
      {history.map((entry, index) => (
        <BlockStack key={entry.id} gap="small">
          <EmailHistoryItem
            entry={entry}
            isSelected={entry.id === selectedHistoryId}
          />
          {index < history.length - 1 ? <CenteredSeparator /> : null}
        </BlockStack>
      ))}
    </BlockStack>
  );
}

function EmailHistoryItem({entry, isSelected}) {
  const [expanded, setExpanded] = useState(isSelected);

  useEffect(() => {
    if (isSelected) {
      setExpanded(true);
    }
  }, [isSelected]);

  return (
    <BlockStack gap="small">
      <InlineStack inlineAlignment="start">
        <Badge>{buildHistorySummary(entry)}</Badge>
      </InlineStack>

      <InlineStack inlineAlignment="start">
        <Link
          onPress={() => {
            setExpanded(!expanded);
          }}
        >
          {expanded ? "Hide email" : "View email"}
        </Link>
      </InlineStack>

      {expanded ? (
        <EmailPreviewContent entry={entry} />
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

function buildHistorySummary(entry) {
  return `${labelEmailType(entry.emailType)} Sent | ${formatHistoryTimestamp(entry.sentAt)} - To: ${entry.customerEmail}`;
}

function showsShipDate(emailType) {
  return (
    emailType === "backorder_notice" ||
    emailType === "shipping_delay"
  );
}

function CenteredSeparator() {
  return (
    <InlineStack inlineAlignment="center">
      <Text>-</Text>
    </InlineStack>
  );
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
