const KLAVIYO_API_URL = "https://a.klaviyo.com/api/events/";
const KLAVIYO_API_REVISION = process.env.KLAVIYO_API_REVISION || "2024-07-15";

export const METRIC_NAMES = {
  backorder_notice:
    process.env.KLAVIYO_BACKORDER_METRIC_NAME ||
    "Notify Dock Backorder Email Requested",
  shipping_delay:
    process.env.KLAVIYO_SHIPPING_DELAY_METRIC_NAME ||
    "Notify Dock Shipping Delay Email Requested",
  will_call_in_progress:
    process.env.KLAVIYO_WILL_CALL_IN_PROGRESS_METRIC_NAME ||
    "Notify Dock Will Call In Progress Email Requested",
  will_call_ready:
    process.env.KLAVIYO_WILL_CALL_METRIC_NAME ||
    "Notify Dock Will Call Email Requested",
};

export async function sendNotifyDockEvent({
  customerEmail,
  emailType,
  firstName,
  fromAddress,
  message,
  orderId,
  orderNumber,
  productImageUrl,
  productTitle,
  productVariantTitle,
  products = [],
  sentByEmail,
  shipDate,
  shop,
  sku,
  subject,
}) {
  const privateApiKey = process.env.KLAVIYO_PRIVATE_API_KEY;

  if (!privateApiKey) {
    const error = new Error(
      "KLAVIYO_PRIVATE_API_KEY is not configured on the app backend.",
    );
    error.status = 503;
    throw error;
  }

  const metricName = METRIC_NAMES[emailType];

  if (!metricName) {
    const error = new Error("Unsupported Klaviyo metric for this email type.");
    error.status = 400;
    throw error;
  }

  const response = await fetch(KLAVIYO_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Klaviyo-API-Key ${privateApiKey}`,
      "Content-Type": "application/json",
      revision: KLAVIYO_API_REVISION,
    },
    body: JSON.stringify({
      data: {
        type: "event",
        attributes: {
          properties: {
            email_type: emailType,
            from_address: fromAddress,
            message_html: message,
            order_id: orderId,
            order_number: orderNumber,
            product_image_url: productImageUrl,
            product_title: productTitle,
            product_variant_title: productVariantTitle,
            products: products.map((product) => ({
              product_image_alt: product.productImageAlt,
              product_image_url: product.productImageUrl,
              product_title: product.productTitle,
              product_variant_title: product.productVariantTitle,
              sku: product.sku,
            })),
            sent_by_email: sentByEmail,
            ship_date: shipDate,
            shop,
            sku,
            subject,
          },
          metric: {
            data: {
              type: "metric",
              attributes: {
                name: metricName,
              },
            },
          },
          profile: {
            data: {
              type: "profile",
              attributes: {
                email: customerEmail,
                ...(firstName ? {first_name: firstName} : {}),
              },
            },
          },
          unique_id: crypto.randomUUID(),
        },
      },
    }),
  });

  if (response.ok) {
    return {
      metricName,
    };
  }

  const errorText = await response.text();
  const error = new Error(
    errorText || "Klaviyo rejected the event request from Notify Dock.",
  );
  error.status = response.status;
  throw error;
}

export async function listNotifyDockEventsForOrder({
  customerEmail,
  orderNumber,
}) {
  const profileId = await getProfileIdByEmail(customerEmail);

  if (!profileId) {
    return [];
  }

  const params = new URLSearchParams({
    filter: `equals(profile_id,"${profileId}")`,
    include: "metric,profile",
    "fields[event]": "datetime,timestamp,event_properties",
    "fields[metric]": "name",
    "fields[profile]": "email,first_name",
    "page[size]": "200",
    sort: "-datetime",
  });
  const payload = await fetchKlaviyoJson(`/events/?${params.toString()}`, {
    emptyMessage: "Klaviyo did not return any event history.",
  });
  const includedByType = groupIncludedByType(payload?.included);
  const metricNames = new Set(Object.values(METRIC_NAMES));

  return (payload?.data || [])
    .map((event) => normalizeNotifyDockEvent(event, includedByType))
    .filter((event) => {
      if (!event.metricName || !metricNames.has(event.metricName)) {
        return false;
      }

      return `${event.eventProperties.order_number || ""}`.trim() === orderNumber;
    });
}

async function getProfileIdByEmail(email) {
  const params = new URLSearchParams({
    filter: `equals(email,"${email}")`,
    "fields[profile]": "email",
    "page[size]": "1",
  });
  const payload = await fetchKlaviyoJson(`/profiles/?${params.toString()}`, {
    emptyMessage: "Klaviyo did not return a profile for this customer email.",
  });

  return payload?.data?.[0]?.id || "";
}

async function fetchKlaviyoJson(pathname, {emptyMessage}) {
  const privateApiKey = process.env.KLAVIYO_PRIVATE_API_KEY;

  if (!privateApiKey) {
    const error = new Error(
      "KLAVIYO_PRIVATE_API_KEY is not configured on the app backend.",
    );
    error.status = 503;
    throw error;
  }

  const response = await fetch(`https://a.klaviyo.com/api${pathname}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Klaviyo-API-Key ${privateApiKey}`,
      revision: KLAVIYO_API_REVISION,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(errorText || "Klaviyo rejected the history request.");
    error.status = response.status;
    throw error;
  }

  const payload = await response.json().catch(() => null);

  if (!payload) {
    const error = new Error(emptyMessage);
    error.status = 502;
    throw error;
  }

  return payload;
}

function groupIncludedByType(included = []) {
  return included.reduce((accumulator, resource) => {
    if (!resource?.type || !resource?.id) {
      return accumulator;
    }

    if (!accumulator[resource.type]) {
      accumulator[resource.type] = new Map();
    }

    accumulator[resource.type].set(resource.id, resource);
    return accumulator;
  }, {});
}

function normalizeNotifyDockEvent(event, includedByType) {
  const metricId = event?.relationships?.metric?.data?.id;
  const profileId = event?.relationships?.profile?.data?.id;
  const metric = includedByType.metric?.get(metricId);
  const profile = includedByType.profile?.get(profileId);

  return {
    id: event?.id || "",
    datetime:
      event?.attributes?.datetime ||
      buildIsoStringFromTimestamp(event?.attributes?.timestamp),
    eventProperties: event?.attributes?.event_properties || {},
    metricName: metric?.attributes?.name || "",
    profileEmail: profile?.attributes?.email || "",
    profileFirstName: profile?.attributes?.first_name || "",
  };
}

function buildIsoStringFromTimestamp(timestamp) {
  if (!timestamp) {
    return new Date().toISOString();
  }

  return new Date(Number(timestamp) * 1000).toISOString();
}
