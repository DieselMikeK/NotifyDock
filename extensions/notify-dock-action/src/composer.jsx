import {useEffect, useState} from "react";
import {useApi} from "@shopify/ui-extensions-react/admin";

export const DYNAMIC_SHIPPING_DELAY_EMAIL_TYPE = "dynamic_shipping_delay";

export const EMAIL_TYPES = [
  {label: "Dynamic Shipping Delay", value: DYNAMIC_SHIPPING_DELAY_EMAIL_TYPE},
  {label: "Will Call - In Progress", value: "will_call_in_progress"},
  {label: "Will Call - Partially Ready", value: "will_call_partially_ready"},
  {label: "Will Call - Ready", value: "will_call_ready"},
];

const DEFAULT_EMAIL_TYPE = DYNAMIC_SHIPPING_DELAY_EMAIL_TYPE;

const DEFAULT_FROM_OPTIONS = [
  {
    label: "\"Orders\" <orders@dieselpowerproducts.com>",
    value: "orders@dieselpowerproducts.com",
  },
];

export function useComposerState(target) {
  const api = useApi(target);
  const {data} = api;
  const launchUrl = getLaunchUrl(api.intents?.launchUrl);
  const launchMode = getLaunchParam(launchUrl, "mode");
  const launchedOrderId = getLaunchParam(launchUrl, "orderId");
  const launchedOrderIdFromPath = getOrderIdFromAdminUrl(launchUrl);
  const launchedHistoryId = getLaunchParam(launchUrl, "historyId");
  const launchNonce = getLaunchParam(launchUrl, "openedAt");
  const launchedShowHistory = getLaunchParam(launchUrl, "showHistory") === "1";
  const shouldShowHistoryOnLaunch =
    launchedShowHistory || Boolean(launchedHistoryId);
  const orderId =
    launchedOrderId || launchedOrderIdFromPath || data?.selected?.[0]?.id || null;
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [error, setError] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [status, setStatus] = useState(null);
  const [sending, setSending] = useState(false);
  const [shopName, setShopName] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [sku, setSku] = useState("");
  const [shipDate, setShipDate] = useState("");
  const [products, setProducts] = useState([]);
  const [emailType, setEmailType] = useState(DEFAULT_EMAIL_TYPE);
  const [fromAddress, setFromAddress] = useState(DEFAULT_FROM_OPTIONS[0].value);
  const [subject, setSubject] = useState(
      buildSubject({
      emailType: DEFAULT_EMAIL_TYPE,
      orderNumber: "",
      shopName: "",
    }),
  );
  const [subjectDirty, setSubjectDirty] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(
    shouldShowHistoryOnLaunch,
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyNotice, setHistoryNotice] = useState("");
  const [historyReloadToken, setHistoryReloadToken] = useState(0);

  useEffect(() => {
    setLoadingOrder(Boolean(orderId));
    setLoadingProduct(false);
    setError("");
    setLookupError("");
    setStatus(null);
    setShopName("");
    setOrderNumber("");
    setFirstName("");
    setCustomerEmail("");
    setSku("");
    setShipDate("");
    setProducts([]);
    setEmailType(DEFAULT_EMAIL_TYPE);
    setFromAddress(DEFAULT_FROM_OPTIONS[0].value);
    setSubjectDirty(false);
    setHistory([]);
    setHistoryHasMore(false);
    setHistoryExpanded(shouldShowHistoryOnLaunch);
    setHistoryLoading(false);
    setHistoryNotice("");
  }, [launchNonce, orderId, shouldShowHistoryOnLaunch]);

  useEffect(() => {
    let cancelled = false;

    async function loadOrder() {
      if (!orderId) {
        setError("Unable to confirm the current order. Close the popup and reopen it from the order page.");
        setLoadingOrder(false);
        return;
      }

      setLoadingOrder(true);
      setError("");

      try {
        const result = await api.query(
          `query OrderEmailPanel($id: ID!) {
            shop {
              name
            }
            order(id: $id) {
              id
              name
              email
              customer {
                firstName
                lastName
                email
              }
              shippingAddress {
                firstName
                lastName
              }
              billingAddress {
                firstName
                lastName
              }
            }
          }`,
          {variables: {id: orderId}},
        );

        if (cancelled) {
          return;
        }

        if (result.errors?.length) {
          setError(buildOrderAutofillError(result.errors));
          setLoadingOrder(false);
          return;
        }

        setShopName(result.data?.shop?.name || "");

        if (!result.data?.order) {
          setError(buildMissingOrderAutofillError());
          setLoadingOrder(false);
          return;
        }

        const order = result.data.order;
        const customerEmail = [order.customer?.email, order.email].find(Boolean) || "";
        const firstName = [
          order.customer?.firstName,
          order.shippingAddress?.firstName,
          order.billingAddress?.firstName,
        ].find(Boolean) || "";

        setOrderNumber(order.name || "");
        setFirstName(firstName);
        setCustomerEmail(customerEmail);
        setLoadingOrder(false);
      } catch (_loadError) {
        if (!cancelled) {
          setError(buildOrderAutofillError(_loadError));
          setLoadingOrder(false);
        }
      }
    }

    loadOrder();

    return () => {
      cancelled = true;
    };
  }, [api, launchNonce, orderId]);

  useEffect(() => {
    if (!subjectDirty) {
      setSubject(
        buildSubject({
          emailType,
          orderNumber,
          shopName,
        }),
      );
    }
  }, [emailType, orderNumber, shopName, subjectDirty]);

  useEffect(() => {
    if (!requiresSku(emailType)) {
      setLoadingProduct(false);
      setLookupError("");
      setProducts([]);
      return;
    }

    const requestedSkus = splitSkuInput(sku);

    if (!requestedSkus.length) {
      setLoadingProduct(false);
      setLookupError("");
      setProducts([]);
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setLoadingProduct(true);
      setLookupError("");

      try {
        const response = await fetch(
          `/api/product-by-sku?sku=${encodeURIComponent(requestedSkus.join(","))}`,
        );
        const payload = await response.json().catch(() => ({}));

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load product details for these SKUs.");
        }

        const resolvedProducts = Array.isArray(payload.products)
          ? payload.products.map((product) => normalizeFetchedProduct(product)).filter(Boolean)
          : [];
        const missingSkus = Array.isArray(payload.missingSkus)
          ? payload.missingSkus.filter(Boolean)
          : [];

        setProducts(resolvedProducts);
        setLookupError(buildMissingSkuMessage(missingSkus));
      } catch (lookupError) {
        if (cancelled) {
          return;
        }

        setProducts([]);
        setLookupError(
          lookupError instanceof Error
            ? lookupError.message
            : "Unable to load product details for these SKUs.",
        );
      } finally {
        if (!cancelled) {
          setLoadingProduct(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [emailType, sku]);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      if (!orderId || loadingOrder) {
        return;
      }

      setHistoryLoading(true);
      setHistoryNotice("");

      try {
        const params = new URLSearchParams({
          orderId,
        });

        if (orderNumber) {
          params.set("orderNumber", orderNumber);
        }

        if (customerEmail) {
          params.set("customerEmail", customerEmail);
        }

        const response = await fetch(`/api/email-history?${params.toString()}`);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            payload.error || "Notify Dock could not load email history.",
          );
        }

        if (cancelled) {
          return;
        }

        setHistory(Array.isArray(payload.history) ? payload.history : []);
        setHistoryHasMore(Boolean(payload.hasMore));
        setHistoryNotice(`${payload.warning || ""}`.trim());
      } catch (historyError) {
        if (!cancelled) {
          setHistory([]);
          setHistoryHasMore(false);
          setHistoryNotice(
            historyError instanceof Error
              ? historyError.message
              : "Notify Dock could not load email history.",
          );
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [customerEmail, historyReloadToken, loadingOrder, orderId, orderNumber]);

  function resetComposer() {
    setSubjectDirty(false);
    setSubject(
      buildSubject({
        emailType,
        orderNumber,
        shopName,
      }),
    );
    setShipDate("");
    setSku("");
    setProducts([]);
    setLookupError("");
    setStatus(null);
  }

  async function handleSend(options = {}) {
    const dynamicGlobalShipDate = `${options?.globalShipDate || ""}`.trim();
    const dynamicProductDelayDetails = Array.isArray(options?.productDelayDetails)
      ? options.productDelayDetails
      : [];
    const selectedProducts = requiresSku(emailType)
      ? attachDynamicDelayDetails({
          delayDetails: dynamicProductDelayDetails,
          emailType,
          products,
        })
      : [];
    const primaryProduct = selectedProducts[0] || null;
    const resolvedSku = requiresSku(emailType)
      ? selectedProducts.map((product) => product.sku).filter(Boolean).join(", ") || sku
      : "";
    const resolvedShipDate = isDynamicShippingDelay(emailType)
      ? dynamicGlobalShipDate
      : shipDate;

    setSending(true);
    setStatus(null);

    try {
      const response = await fetch("/api/backorder-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer_email: customerEmail,
          email_type: emailType,
          first_name: firstName,
          from_address: fromAddress,
          order_id: orderId,
          order_number: orderNumber,
          product_image_alt: primaryProduct?.productImageAlt || "",
          product_image_url: primaryProduct?.productImageUrl || "",
          product_title: primaryProduct?.productTitle || "",
          product_variant_title: primaryProduct?.productVariantTitle || "",
          products: selectedProducts.map((product) => serializeProductPayload(product)),
          global_ship_date: dynamicGlobalShipDate,
          ship_date: resolvedShipDate,
          shop_name: shopName,
          sku: resolvedSku,
          subject,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Notify Dock could not send this email.");
      }

      setStatus({
        tone: payload.historyWarning ? "warning" : "success",
        message:
          payload.message ||
          "Klaviyo accepted the Notify Dock event for delivery.",
      });
      setHistoryReloadToken((value) => value + 1);
    } catch (error) {
      setStatus({
        tone: "critical",
        message:
          error instanceof Error
            ? error.message
            : "Notify Dock could not send this email.",
      });
    } finally {
      setSending(false);
    }
  }

  return {
    api,
    customerEmail,
    emailType,
    error,
    firstName,
    fromAddress,
    fromOptions: DEFAULT_FROM_OPTIONS,
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
    orderId,
    orderNumber,
    products,
    resetComposer,
    selectedHistoryId: launchedHistoryId,
    sending,
    setEmailType: (value) => {
      setEmailType(value);
      setSubjectDirty(false);
      setStatus(null);
    },
    setFromAddress,
    setHistoryExpanded,
    setShipDate: (value) => {
      setShipDate(value);
      setStatus(null);
    },
    setSku: (value) => {
      setSku(value);
      setStatus(null);
    },
    setStatus,
    setSubject: (value) => {
      setSubject(value);
      setSubjectDirty(true);
    },
    shipDate,
    sku,
    status,
    subject,
  };
}

export function canSendComposer({
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
}) {
  const requestedSkus = splitSkuInput(sku);
  const skuRequired = requiresSku(emailType);

  if (
    !customerEmail ||
    !fromAddress ||
    !subject ||
    loadingOrder ||
    (skuRequired && (loadingProduct || Boolean(lookupError)))
  ) {
    return false;
  }

  if (skuRequired) {
    if (!requestedSkus.length || !products.length) {
      return false;
    }

    if (products.length !== requestedSkus.length) {
      return false;
    }

    if (products.some((product) => !product.productTitle)) {
      return false;
    }
  }

  if (requiresShipDate(emailType)) {
    return Boolean(shipDate);
  }

  return true;
}

function buildSubject({emailType, orderNumber, shopName}) {
  if (emailType === "will_call_partially_ready") {
    return "Partial Will Call Order is Ready";
  }

  if (emailType === "will_call_ready") {
    return `Pick Up on Location Order ${orderNumber || "#"}`.trim();
  }

  if (emailType === "will_call_in_progress") {
    return "Hang Tight - Your Will Call Order Is In Progress";
  }

  if (
    emailType === "shipping_delay" ||
    emailType === DYNAMIC_SHIPPING_DELAY_EMAIL_TYPE
  ) {
    return `Shipping delay for order ${orderNumber || "#"}`.trim();
  }

    return `Message from ${shopName || "{{ shop.name }}"}`.trim();
  }

function requiresShipDate(emailType) {
  return emailType === "backorder_notice" || emailType === "shipping_delay";
}

function requiresSku(emailType) {
  return ![
    "will_call_ready",
    "will_call_in_progress",
  ].includes(emailType);
}

function buildOrderAutofillError(errorLike) {
  const messages = extractGraphqlErrorMessages(errorLike);
  const normalizedMessages = messages.join(" ").toLowerCase();

  if (
    normalizedMessages.includes("read_all_orders") ||
    normalizedMessages.includes("60 days") ||
    normalizedMessages.includes("60-day")
  ) {
    return "Unable to auto-fill order details for this older order until Shopify approves Notify Dock's updated all-orders permission. You can still review the template below.";
  }

  if (
    normalizedMessages.includes("access denied") ||
    normalizedMessages.includes("not authorized")
  ) {
    return "Unable to auto-fill order details because Shopify denied access to this order. You can still review the template below.";
  }

  return "Unable to auto-fill order details. You can still review the template below.";
}

function buildMissingOrderAutofillError() {
  return "Unable to auto-fill order details because Shopify did not return this order. If this order is older than 60 days, approve Notify Dock's updated all-orders permission and try again. You can still review the template below.";
}

function extractGraphqlErrorMessages(errorLike) {
  if (Array.isArray(errorLike)) {
    return errorLike
      .map((error) => `${error?.message || ""}`.trim())
      .filter(Boolean);
  }

  if (errorLike instanceof Error) {
    return [`${errorLike.message || ""}`.trim()].filter(Boolean);
  }

  return [];
}

function getLaunchUrl(launchUrl) {
  if (!launchUrl) {
    return "";
  }

  return String(launchUrl);
}

function getLaunchParam(launchUrl, key) {
  if (!launchUrl) {
    return "";
  }

  try {
    return new URL(launchUrl).searchParams.get(key) || "";
  } catch (_error) {
    return "";
  }
}

function getOrderIdFromAdminUrl(launchUrl) {
  if (!launchUrl) {
    return "";
  }

  try {
    const pathname = new URL(launchUrl).pathname;
    const match = pathname.match(/\/orders\/(\d+)/);

    if (!match) {
      return "";
    }

    return `gid://shopify/Order/${match[1]}`;
  } catch (_error) {
    return "";
  }
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

function normalizeFetchedProduct(product) {
  const sku = `${product?.sku || ""}`.trim();
  const productTitle = `${product?.title || ""}`.trim();

  if (!sku && !productTitle) {
    return null;
  }

  return {
    productImageAlt: `${product?.imageAlt || ""}`.trim(),
    productImageUrl: `${product?.imageUrl || ""}`.trim(),
    productTitle,
    productVariantTitle: `${product?.variantTitle || ""}`.trim(),
    sku,
  };
}

function serializeProductPayload(product) {
  return {
    delay_date: product.delayDate || "",
    delay_state: product.delayState || "",
    product_image_alt: product.productImageAlt || "",
    product_image_url: product.productImageUrl || "",
    product_title: product.productTitle || "",
    product_variant_title: product.productVariantTitle || "",
    sku: product.sku || "",
  };
}

function buildMissingSkuMessage(missingSkus) {
  if (!missingSkus.length) {
    return "";
  }

  return `No Shopify product matched SKU${missingSkus.length > 1 ? "s" : ""}: ${missingSkus.join(", ")}.`;
}

function isDynamicShippingDelay(emailType) {
  return emailType === DYNAMIC_SHIPPING_DELAY_EMAIL_TYPE;
}

function attachDynamicDelayDetails({delayDetails, emailType, products}) {
  if (!isDynamicShippingDelay(emailType) || !Array.isArray(products)) {
    return Array.isArray(products) ? products : [];
  }

  const detailsBySku = new Map(
    delayDetails
      .map((detail) => [
        `${detail?.sku || ""}`.trim(),
        {
          delayDate: `${detail?.delayDate || ""}`.trim(),
          delayState: `${detail?.delayState || ""}`.trim(),
        },
      ])
      .filter(([sku]) => sku),
  );

  return products.map((product) => {
    const sku = `${product?.sku || ""}`.trim();
    const detail = detailsBySku.get(sku);

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
