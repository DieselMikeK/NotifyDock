import {useEffect, useState} from "react";
import {useApi} from "@shopify/ui-extensions-react/admin";

export const EMAIL_TYPES = [
  {label: "Backorder Notice", value: "backorder_notice"},
  {label: "Will Call Ready", value: "will_call_ready"},
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
  const launchedOrderId = getLaunchParam(launchUrl, "orderId");
  const launchedOrderIdFromPath = getOrderIdFromAdminUrl(launchUrl);
  const launchNonce = getLaunchParam(launchUrl, "openedAt");
  const orderId =
    launchedOrderId || launchedOrderIdFromPath || data?.selected?.[0]?.id || null;
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);
  const [sending, setSending] = useState(false);
  const [shopName, setShopName] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [sku, setSku] = useState("");
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
  const [message, setMessage] = useState("");
  const [messageDirty, setMessageDirty] = useState(false);

  useEffect(() => {
    setLoadingOrder(Boolean(orderId));
    setError("");
    setStatus(null);
    setShopName("");
    setOrderNumber("");
    setFirstName("");
    setCustomerEmail("");
    setSku("");
    setEmailType("backorder_notice");
    setFromAddress(FROM_OPTIONS[0].value);
    setSubjectDirty(false);
    setMessageDirty(false);
  }, [launchNonce, orderId]);

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
        const skus = Array.from(
          new Set(
            order.lineItems.edges
              .map(({node}) => node.sku || node.title)
              .filter(Boolean),
          ),
        );
        const customerEmail = [
          order.customer?.email,
          order.email,
        ].find(Boolean) || "";
        const firstName = [
          order.customer?.firstName,
          order.shippingAddress?.firstName,
          order.billingAddress?.firstName,
        ].find(Boolean) || "";

        setOrderNumber(order.name || "");
        setFirstName(firstName);
        setCustomerEmail(customerEmail);
        setSku(skus.join(", "));
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
    if (!messageDirty) {
      setMessage(
        buildMessage({
          emailType,
          orderNumber,
          sku,
        }),
      );
    }
  }, [emailType, orderNumber, sku, messageDirty]);

  function resetTemplate() {
    setSubjectDirty(false);
    setSubject(
      buildSubject({
        emailType,
        orderNumber,
        shopName,
      }),
    );
    setMessageDirty(false);
    setMessage(
      buildMessage({
        emailType,
        orderNumber,
        sku,
      }),
    );
  }

  async function handleSend() {
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
          message,
          order_id: orderId,
          order_number: orderNumber,
          shop_name: shopName,
          sku,
          subject,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Notify Dock could not send this email.");
      }

      setStatus({
        tone: "success",
        message:
          payload.message ||
          "Klaviyo accepted the Notify Dock event for delivery.",
      });
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
    fromAddress,
    handleSend,
    loadingOrder,
    message,
    resetTemplate,
    sending,
    setEmailType: (value) => {
      setEmailType(value);
      setSubjectDirty(false);
      setMessageDirty(false);
    },
    setFromAddress,
    setMessage: (value) => {
      setMessage(value);
      setMessageDirty(true);
    },
    setStatus,
    setSubject: (value) => {
      setSubject(value);
      setSubjectDirty(true);
    },
    status,
    subject,
  };
}

export function canSendComposer({customerEmail, message, subject}) {
  return Boolean(customerEmail && message && subject);
}

function buildSubject({emailType, orderNumber, shopName}) {
  if (emailType === "will_call_ready") {
    return `Pick Up on Location Order ${orderNumber || "#"}`.trim();
  }

  return `Message from ${shopName || "{{ shop.name }}"}`.trim();
}

function buildMessage({emailType, orderNumber, sku}) {
  if (emailType === "will_call_ready") {
    return [
      `Hello,`,
      `Your order has been processed. We will contact you once your complete order is here and ready for pick up at our Will Call.`,
      `Thank You.`,
    ].join("\n");
  }

  return [
    `<center><b>${sku || "SKU"}</b></center>`,
    ``,
    `Based upon information from the manufacturer, the current ship date of your part(s) is: <b>ETA</b>`,
    ``,
    `OPTIONS:`,
    ``,
    `HANG TIGHT: If you are okay to wait, you are good to go! Once we have tracking, or any other updates we will forward them to this same email address.`,
    ``,
    `CHECK OPTIONS: If you would like to have one of our sales technicians look into another comparable option, which is on the shelf, ready to ship, we can help. The fastest way to check options is a phone call. Otherwise, feel free to respond to this e-mail and we will have someone get in contact with you within 1-2 business days. Keep in mind, some of the items we sell may not have another similar option. If that is the case, we will let you know.`,
    ``,
    `CANCEL: This is obviously our least favorite option; however, we totally understand. If the backorder timeline is too long, we have no problem cancelling and refunding the backordered item(s). Just let us know and we will make it happen. Refunds typically take 2-3 business days to hit your account.`,
    ``,
    `QUESTIONS? If you have questions on anything, please feel free to respond to this e-mail. You can also reach us by phone or Chat through the website, M-F 6AM-6PM PST.`,
  ].join("\n");
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
