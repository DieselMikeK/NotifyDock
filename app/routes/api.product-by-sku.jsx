import {json} from "@remix-run/node";
import {authenticate} from "../shopify.server";

const PRODUCT_BY_SKU_QUERY = `#graphql
  query ProductBySku($query: String!) {
    productVariants(first: 5, query: $query) {
      edges {
        node {
          id
          sku
          title
          image {
            url
            altText
          }
          product {
            title
            media(first: 1) {
              edges {
                node {
                  ... on MediaImage {
                    image {
                      url
                      altText
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }`;

export async function loader({request}) {
  const {admin, cors} = await authenticate.admin(request);
  const url = new URL(request.url);
  const skuInput = `${url.searchParams.get("sku") || ""}`.trim();
  const requestedSkus = splitSkuInput(skuInput);

  if (!requestedSkus.length) {
    return cors(json({error: "SKU is required."}, {status: 400}));
  }

  try {
    const results = await Promise.all(
      requestedSkus.map((requestedSku) =>
        lookupProductBySku({
          admin,
          sku: requestedSku,
        }),
      ),
    );
    const products = results.filter(Boolean);
    const missingSkus = requestedSkus.filter(
      (requestedSku) =>
        !products.some(
          (product) => normalizeSku(product?.sku) === normalizeSku(requestedSku),
        ),
    );

    if (!products.length) {
      return cors(
        json(
          {
            error: `No Shopify product matched SKU${requestedSkus.length > 1 ? "s" : ""} ${requestedSkus.join(", ")}.`,
          },
          {status: 404},
        ),
      );
    }

    return cors(
      json({
        ok: missingSkus.length === 0,
        missingSkus,
        product: products[0],
        products,
      }),
    );
  } catch (error) {
    return cors(
      json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to load product details for this SKU.",
        },
        {status: 500},
      ),
    );
  }
}

export async function action({request}) {
  const {cors} = await authenticate.admin(request);

  return cors(json({error: "Method not allowed."}, {status: 405}));
}

function normalizeSku(value) {
  return `${value || ""}`.trim().toUpperCase();
}

function splitSkuInput(value) {
  return Array.from(
    new Set(
      `${value || ""}`
        .split(",")
        .map((entry) => normalizeSku(entry))
        .filter(Boolean),
    ),
  );
}

async function lookupProductBySku({admin, sku}) {
  const response = await admin.graphql(PRODUCT_BY_SKU_QUERY, {
    variables: {
      query: `sku:${JSON.stringify(sku)}`,
    },
  });
  const payload = await response.json();

  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message || "Shopify rejected the SKU lookup.");
  }

  const variants =
    payload.data?.productVariants?.edges?.map(({node}) => node) || [];
  const normalizedSku = normalizeSku(sku);
  const match =
    variants.find((variant) => normalizeSku(variant?.sku) === normalizedSku) ||
    variants[0];

  if (!match) {
    return null;
  }

  const fallbackImage = match.product?.media?.edges?.[0]?.node?.image || null;

  return {
    sku: match.sku || sku,
    title: match.product?.title || "",
    variantTitle:
      match.title && match.title !== "Default Title" ? match.title : "",
    imageUrl: match.image?.url || fallbackImage?.url || "",
    imageAlt:
      match.image?.altText ||
      fallbackImage?.altText ||
      match.product?.title ||
      "",
  };
}
