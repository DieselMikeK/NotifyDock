import {json} from "@remix-run/node";
import {authenticate} from "../shopify.server";

const SHOP_QUERY = `#graphql
  query NotifyDockShopSender {
    shop {
      contactEmail
      email
      name
    }
  }`;

const STAFF_QUERY = `#graphql
  query NotifyDockStaffSenders {
    staffMembers(first: 100, sortKey: NAME) {
      nodes {
        active
        email
        name
      }
    }
  }`;

export async function loader({request}) {
  const {admin, cors} = await authenticate.admin(request);

  if (request.method === "OPTIONS") {
    return cors(new Response(null, {status: 204}));
  }

  try {
    const shop = await loadShop(admin);
    const staffResult = await loadStaffMembers(admin).catch((error) => ({
      options: [],
      warning:
        error instanceof Error
          ? error.message
          : "Notify Dock could not load Shopify staff sender emails.",
    }));

    return cors(
      json({
        options: buildFromOptions({
          shop,
          staffOptions: staffResult.options,
        }),
        warning: staffResult.warning || "",
      }),
    );
  } catch (error) {
    return cors(
      json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Notify Dock could not load sender emails.",
          options: [],
        },
        {status: 500},
      ),
    );
  }
}

export async function action({request}) {
  const {cors} = await authenticate.admin(request);

  if (request.method === "OPTIONS") {
    return cors(new Response(null, {status: 204}));
  }

  return cors(json({error: "Method not allowed.", options: []}, {status: 405}));
}

async function loadShop(admin) {
  const response = await admin.graphql(SHOP_QUERY);
  const payload = await response.json();

  if (payload.errors?.length) {
    throw new Error(
      payload.errors[0]?.message || "Shopify rejected the shop sender lookup.",
    );
  }

  const shop = payload.data?.shop;

  if (!shop) {
    throw new Error("Shopify did not return shop sender details.");
  }

  return {
    contactEmail: `${shop.contactEmail || ""}`.trim(),
    email: `${shop.email || ""}`.trim(),
    name: `${shop.name || ""}`.trim(),
  };
}

async function loadStaffMembers(admin) {
  const response = await admin.graphql(STAFF_QUERY);
  const payload = await response.json();

  if (payload.errors?.length) {
    throw new Error(
      payload.errors[0]?.message ||
        "Shopify rejected the staff sender lookup. The app may need read_users access.",
    );
  }

  const staffNodes = Array.isArray(payload.data?.staffMembers?.nodes)
    ? payload.data.staffMembers.nodes
    : [];

  return {
    options: staffNodes
      .filter((staffMember) => staffMember?.active && `${staffMember?.email || ""}`.trim())
      .map((staffMember) => ({
        label: formatSenderLabel({
          email: staffMember.email,
          name: staffMember.name,
        }),
        value: `${staffMember.email || ""}`.trim(),
      })),
    warning: "",
  };
}

function buildFromOptions({shop, staffOptions}) {
  const options = [];
  const seen = new Set();
  const shopEmail = shop.contactEmail || shop.email;

  if (shopEmail) {
    options.push({
      label: formatSenderLabel({
        email: shopEmail,
        name: shop.name || "Shop",
      }),
      value: shopEmail,
    });
    seen.add(shopEmail.toLowerCase());
  }

  for (const option of staffOptions) {
    const email = `${option?.value || ""}`.trim().toLowerCase();

    if (!email || seen.has(email)) {
      continue;
    }

    options.push(option);
    seen.add(email);
  }

  return options;
}

function formatSenderLabel({email, name}) {
  const resolvedEmail = `${email || ""}`.trim();
  const resolvedName = `${name || ""}`.trim();

  if (resolvedName) {
    return `"${resolvedName}" <${resolvedEmail}>`;
  }

  return resolvedEmail;
}
