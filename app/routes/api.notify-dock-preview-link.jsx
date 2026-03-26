import {json} from "@remix-run/node";
import {authenticate} from "../shopify.server";
import {createNotifyDockPreviewToken, normalizePreviewPayload} from "../notify-dock-preview-token.server";

export async function loader({request}) {
  const {cors} = await authenticate.admin(request);

  if (request.method === "OPTIONS") {
    return cors(new Response(null, {status: 204}));
  }

  return cors(json({error: "Method not allowed.", url: ""}, {status: 405}));
}

export async function action({request}) {
  const {cors} = await authenticate.admin(request);

  if (request.method === "OPTIONS") {
    return cors(new Response(null, {status: 204}));
  }

  const payload = await request.json().catch(() => null);
  const previewPayload = normalizePreviewPayload(payload);

  if (!previewPayload.emailType) {
    return cors(
      json(
        {
          error: "emailType is required.",
          url: "",
        },
        {status: 400},
      ),
    );
  }

  const token = createNotifyDockPreviewToken(previewPayload);
  const previewUrl = new URL(
    "/notify-dock-preview",
    process.env.SHOPIFY_APP_URL || request.url,
  );

  previewUrl.searchParams.set("token", token);

  return cors(
    json({
      url: previewUrl.toString(),
    }),
  );
}
