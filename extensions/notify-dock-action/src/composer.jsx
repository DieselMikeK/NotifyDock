import {useEffect, useState} from "react";
import {useApi} from "@shopify/ui-extensions-react/admin";

export const EMAIL_TYPES = [
  {label: "Backorder Notice", value: "backorder_notice"},
  {label: "Shipping Delay", value: "shipping_delay"},
  {label: "Will Call - Ready", value: "will_call_ready"},
  {label: "Will Call - In Progress", value: "will_call_in_progress"},
];

export const FROM_OPTIONS = [
  {
    label: "orders@dieselpowerproducts.com",
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
  const [defaultSku, setDefaultSku] = useState("");
  const [defaultProducts, setDefaultProducts] = useState([]);
  const [sku, setSku] = useState("");
  const [shipDate, setShipDate] = useState("");
  const [products, setProducts] = useState([]);
  const [emailType, setEmailType] = useState("backorder_notice");
  const [fromAddress, setFromAddress] = useState(FROM_OPTIONS[0].value);
  const [subject, setSubject] = useState(
    buildSubject({
      emailType: "backorder_notice",
      orderNumber: "",
      shopName: "",
    }),
  );
  const [subjectDirty, setSubjectDirty] = useState(false);
  const [history, setHistory] = useState([]);
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
    setDefaultSku("");
    setDefaultProducts([]);
    setSku("");
    setShipDate("");
    setProducts([]);
    setEmailType("backorder_notice");
    setFromAddress(FROM_OPTIONS[0].value);
    setSubjectDirty(false);
    setHistory([]);
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
              lineItems(first: 50) {
                edges {
                  node {
                    currentQuantity
                    title
                    sku
                  }
                }
              }
            }
          }`,
          {variables: {id: orderId}},
        );

        if (cancelled) {
          return;
        }

        if (result.errors?.length) {
          setError("Unable to auto-fill order details. You can still review the template below.");
          setLoadingOrder(false);
          return;
        }

        setShopName(result.data?.shop?.name || "");

        if (!result.data?.order) {
          setError("Unable to auto-fill order details. You can still review the template below.");
          setLoadingOrder(false);
          return;
        }

        const order = result.data.order;
        const activeLineItems = order.lineItems.edges
          .map(({node}) => ({
            currentQuantity: Number(node?.currentQuantity || 0),
            title: node?.title || "",
            sku: node?.sku || "",
          }))
          .filter(({currentQuantity, title, sku}) =>
            currentQuantity > 0 && (title || sku),
          );
        const uniqueSkus = Array.from(
          new Set(activeLineItems.map(({sku, title}) => sku || title).filter(Boolean)),
        );
        const primaryLineItem =
          activeLineItems.find(({sku}) => sku) || activeLineItems[0];
        const customerEmail = [order.customer?.email, order.email].find(Boolean) || "";
        const firstName = [
          order.customer?.firstName,
          order.shippingAddress?.firstName,
          order.billingAddress?.firstName,
        ].find(Boolean) || "";
        const resolvedSku = primaryLineItem?.sku || uniqueSkus[0] || "";
        const fallbackProducts = buildFallbackProducts(primaryLineItem);

        setOrderNumber(order.name || "");
        setFirstName(firstName);
        setCustomerEmail(customerEmail);
        setDefaultSku(resolvedSku);
        setDefaultProducts(fallbackProducts);
        setSku(resolvedSku);
        setProducts(fallbackProducts);
        setLoadingOrder(false);
      } catch (_loadError) {
        if (!cancelled) {
          setError("Unable to auto-fill order details. You can still review the template below.");
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

        setProducts(
          resolvedProducts.length
            ? resolvedProducts
            : shouldUseDefaultFallback({
                defaultProducts,
                defaultSku,
                requestedSkus,
              })
              ? defaultProducts
              : [],
        );
        setLookupError(buildMissingSkuMessage(missingSkus));
      } catch (lookupError) {
        if (cancelled) {
          return;
        }

        setProducts(
          shouldUseDefaultFallback({
            defaultProducts,
            defaultSku,
            requestedSkus,
          })
            ? defaultProducts
            : [],
        );
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
  }, [defaultProducts, defaultSku, sku]);

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
        setHistoryNotice(`${payload.warning || ""}`.trim());
      } catch (historyError) {
        if (!cancelled) {
          setHistory([]);
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
    setSku(defaultSku);
    setProducts(defaultProducts);
    setLookupError("");
    setStatus(null);
  }

  async function handleSend() {
    const primaryProduct = products[0] || null;

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
          products: products.map((product) => serializeProductPayload(product)),
          ship_date: shipDate,
          shop_name: shopName,
          sku: products.map((product) => product.sku).filter(Boolean).join(", ") || sku,
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
    handleSend,
    history,
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
  loadingOrder,
  loadingProduct,
  lookupError,
  products,
  shipDate,
  sku,
  subject,
}) {
  const requestedSkus = splitSkuInput(sku);

  if (
    !customerEmail ||
    !subject ||
    !requestedSkus.length ||
    !products.length ||
    loadingOrder ||
    loadingProduct ||
    Boolean(lookupError)
  ) {
    return false;
  }

  if (products.length !== requestedSkus.length) {
    return false;
  }

  if (products.some((product) => !product.productTitle)) {
    return false;
  }

  if (requiresShipDate(emailType)) {
    return Boolean(shipDate);
  }

  return true;
}

function buildSubject({emailType, orderNumber, shopName}) {
  if (emailType === "will_call_ready") {
    return `Pick Up on Location Order ${orderNumber || "#"}`.trim();
  }

  if (emailType === "will_call_in_progress") {
    return "Hang Tight - Your Will Call Order Is In Progress";
  }

  if (emailType === "shipping_delay") {
    return `Shipping delay for order ${orderNumber || "#"}`.trim();
  }

  return `Message from ${shopName || "{{ shop.name }}"}`.trim();
}

function requiresShipDate(emailType) {
  return emailType === "backorder_notice" || emailType === "shipping_delay";
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

function normalizeSku(value) {
  return `${value || ""}`.trim().toUpperCase();
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

function buildFallbackProducts(primaryLineItem) {
  if (!primaryLineItem?.sku && !primaryLineItem?.title) {
    return [];
  }

  return [
    {
      productImageAlt: primaryLineItem?.title || "",
      productImageUrl: "",
      productTitle: primaryLineItem?.title || "",
      productVariantTitle: "",
      sku: primaryLineItem?.sku || primaryLineItem?.title || "",
    },
  ];
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
    product_image_alt: product.productImageAlt || "",
    product_image_url: product.productImageUrl || "",
    product_title: product.productTitle || "",
    product_variant_title: product.productVariantTitle || "",
    sku: product.sku || "",
  };
}

function shouldUseDefaultFallback({defaultProducts, defaultSku, requestedSkus}) {
  return (
    requestedSkus.length === 1 &&
    normalizeSku(requestedSkus[0]) === normalizeSku(defaultSku) &&
    defaultProducts.length > 0
  );
}

function buildMissingSkuMessage(missingSkus) {
  if (!missingSkus.length) {
    return "";
  }

  return `No Shopify product matched SKU${missingSkus.length > 1 ? "s" : ""}: ${missingSkus.join(", ")}.`;
}
