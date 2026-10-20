// GARDEN-GH: קריאת מידות מתוכנית היתר (סריקה, תמונה או עמוד PDF) עם Claude vision.
// מקבל תמונה אחת (אריח של הגיליון) ומחזיר מידות ומפלסים עם קואורדינטות בפיקסלים של התמונה.
// משתמש בסוד ANTHROPIC_API_KEY הקיים בפרויקט. לא שומר דבר.
import Anthropic from "npm:@anthropic-ai/sdk";

const ALLOWED_ORIGINS = [/^https:\/\/garden-gh[a-z0-9-]*\.vercel\.app$/, /^http:\/\/localhost:\d+$/];
const IMAGE_URL_HOSTS = [/^garden-gh[a-z0-9-]*\.vercel\.app$/];
const MEDIA = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_B64 = 7_000_000;

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.some((r) => r.test(origin)) ? origin : "https://garden-gh.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
});

const BOX = {
  type: "object",
  additionalProperties: false,
  required: ["x0", "y0", "x1", "y1"],
  properties: { x0: { type: "number" }, y0: { type: "number" }, x1: { type: "number" }, y1: { type: "number" } },
};
const LINE = {
  type: "object",
  additionalProperties: false,
  required: ["x1", "y1", "x2", "y2"],
  properties: { x1: { type: "number" }, y1: { type: "number" }, x2: { type: "number" }, y2: { type: "number" } },
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scale_text", "sheet_title", "dimensions"],
  properties: {
    scale_text: { type: "string" },
    sheet_title: { type: "string" },
    dimensions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "value", "unit", "kind", "relative", "orientation", "text_box", "has_line", "line", "confidence"],
        properties: {
          text: { type: "string" },
          value: { type: "number" },
          unit: { type: "string", enum: ["cm", "m", "mm"] },
          kind: { type: "string", enum: ["length", "level"] },
          relative: { type: "boolean" },
          orientation: { type: "string", enum: ["horizontal", "vertical", "other"] },
          text_box: BOX,
          has_line: { type: "boolean" },
          line: LINE,
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
  },
};

const SYSTEM = `You read Israeli building-permit drawings (תוכנית היתר): floor plans, site plans, elevations and sections, scanned or exported.
Return every dimension annotation and level mark you can read in the image, as JSON matching the schema. Coordinates are pixel coordinates of the image you receive (origin top-left).

Conventions in these drawings:
- Length dimensions are written in centimetres without a unit (526 = 5.26 m). A small raised digit after a number is half-centimetres or millimetres (526 with a small 5 = 526.5 cm): include it in value.
- Dimension lines have tick marks or dots at both ends; the number sits on or beside the line, rotated with it. Chains of consecutive dimensions are common: report each number separately.
- Level marks: "±0.00", "+0.40", "-0.45" are relative levels in metres (relative=true). Numbers like 699.25 or +698.80 next to a cross or triangle symbol are absolute levels in metres (relative=false). Levels have no dimension line.
- Ignore: window or door size tags written as a fraction or stacked pair (60/120, 160 over 160), room areas (m², מ"ר), grid labels, sheet scale text, text in the title block, notes, and anything you cannot read with confidence.

For each item:
- text: exactly what is written. value: the number in the stated unit (cm for lengths unless the drawing clearly uses metres). kind: length or level.
- orientation: direction of the dimension line (horizontal, vertical, other).
- text_box: tight box around the written number.
- has_line and line: for lengths, the two end points of the dimension line, at the tick marks or extension lines that bound it. If you cannot see both ends, has_line=false and line = all zeros.
- confidence: high only when every digit is clearly legible and the extent is clear.
Also return scale_text if a scale such as 1:100 (ק.מ. / קנ"מ) appears, and sheet_title if a sheet title appears, else empty strings.
Do not guess digits. Missing an unreadable dimension is better than inventing one.`;

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  // הגנה בסיסית מפני שימוש מאתרים זרים. קריאה ללא Origin מותרת רק עם image_url מהאתר עצמו.
  if (origin && !ALLOWED_ORIGINS.some((r) => r.test(origin))) return json({ error: "origin not allowed" }, 403);

  let body: { image?: string; media_type?: string; image_url?: string; width?: number; height?: number; hint?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  let source: Record<string, string>;
  if (body.image_url) {
    let u: URL;
    try {
      u = new URL(body.image_url);
    } catch {
      return json({ error: "bad image_url" }, 400);
    }
    if (u.protocol !== "https:" || !IMAGE_URL_HOSTS.some((r) => r.test(u.hostname))) return json({ error: "image_url host not allowed" }, 403);
    source = { type: "url", url: u.toString() };
  } else {
    if (!origin) return json({ error: "origin required" }, 403);
    const media = body.media_type ?? "";
    if (!body.image || !MEDIA.has(media)) return json({ error: "image and media_type are required" }, 400);
    if (body.image.length > MAX_B64) return json({ error: "image too large" }, 413);
    source = { type: "base64", media_type: media, data: body.image };
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")?.trim();
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY is not configured" }, 500);
  const client = new Anthropic({ apiKey });

  const size = body.width && body.height ? `The image is ${Math.round(body.width)} x ${Math.round(body.height)} pixels.` : "";
  const hint = body.hint ? ` Context: ${String(body.hint).slice(0, 200)}` : "";

  try {
    const stream = client.beta.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source },
            { type: "text", text: `Read all dimensions and levels in this drawing. ${size}${hint}` },
          ],
        },
      ],
    } as never);
    const response = await stream.finalMessage();
    if (response.stop_reason === "refusal") return json({ error: "הקריאה נדחתה" }, 422);
    if (response.stop_reason === "max_tokens") return json({ error: "התשובה נקטעה, נסו אריח קטן יותר" }, 502);
    const text = response.content
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");
    const result = JSON.parse(text);
    return json({ result, model: response.model, usage: response.usage });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: "עומס זמני, נסו שוב בעוד דקה" }, 429);
    if (err instanceof Anthropic.BadRequestError) return json({ error: `Claude API 400: ${err.message}` }, 400);
    if (err instanceof Anthropic.APIError) return json({ error: `Claude API ${err.status}: ${err.message}` }, 502);
    if (err instanceof SyntaxError) return json({ error: "תשובה לא תקינה מהמודל" }, 502);
    return json({ error: String(err) }, 500);
  }
});
