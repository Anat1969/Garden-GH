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


const PT = {
  type: "object",
  additionalProperties: false,
  required: ["x", "y"],
  properties: { x: { type: "number" }, y: { type: "number" } },
};
const POLY = { type: "array", items: PT };

const MAP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["drawings"],
  properties: {
    drawings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "kind", "floor", "scale_den", "box"],
        properties: {
          title: { type: "string" },
          kind: {
            type: "string",
            enum: ["floor_plan", "development_plan", "site_plan", "roof_plan", "basement_plan", "section", "elevation", "area_table", "title_block", "notes", "other"],
          },
          floor: { type: "string" },
          scale_den: { type: "number" },
          box: BOX,
        },
      },
    },
  },
};

const STRUCTURE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["north_angle_deg", "units", "openings", "plot", "zones", "levels", "trees", "retaining_walls"],
  properties: {
    north_angle_deg: { type: "number" },
    units: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "footprint", "wall_thickness_cm", "floor_level_rel", "floor_level_abs"],
        properties: {
          name: { type: "string" },
          footprint: POLY,
          wall_thickness_cm: { type: "number" },
          floor_level_rel: { type: "number" },
          floor_level_abs: { type: "number" },
        },
      },
    },
    openings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "x1", "y1", "x2", "y2"],
        properties: {
          type: { type: "string", enum: ["door", "sliding_door", "window", "opening"] },
          x1: { type: "number" },
          y1: { type: "number" },
          x2: { type: "number" },
          y2: { type: "number" },
        },
      },
    },
    plot: POLY,
    zones: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "label", "polygon", "level_abs", "level_to_abs", "descends_toward"],
        properties: {
          kind: { type: "string", enum: ["lawn", "paving", "planting", "deck", "gravel", "path", "stairs", "ramp", "parking", "pool", "other"] },
          label: { type: "string" },
          polygon: POLY,
          level_abs: { type: "number" },
          level_to_abs: { type: "number" },
          descends_toward: { type: "string", enum: ["up", "down", "left", "right", "none"] },
        },
      },
    },
    levels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "abs", "rel", "has_rel", "x", "y"],
        properties: {
          text: { type: "string" },
          abs: { type: "number" },
          rel: { type: "number" },
          has_rel: { type: "boolean" },
          x: { type: "number" },
          y: { type: "number" },
        },
      },
    },
    trees: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["x", "y", "r", "kind"],
        properties: { x: { type: "number" }, y: { type: "number" }, r: { type: "number" }, kind: { type: "string", enum: ["tree", "palm", "shrub"] } },
      },
    },
    retaining_walls: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["x1", "y1", "x2", "y2", "label"],
        properties: { x1: { type: "number" }, y1: { type: "number" }, x2: { type: "number" }, y2: { type: "number" }, label: { type: "string" } },
      },
    },
  },
};

const HEIGHTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["levels", "roof_type", "roof_pitch_deg", "storeys_above_ground"],
  properties: {
    levels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "rel", "abs", "has_abs", "meaning"],
        properties: {
          text: { type: "string" },
          rel: { type: "number" },
          abs: { type: "number" },
          has_abs: { type: "boolean" },
          meaning: {
            type: "string",
            enum: ["ground_floor", "first_floor", "second_floor", "attic", "basement", "roof_eave", "ridge", "parapet", "flat_roof", "natural_ground", "garden", "street", "window", "other"],
          },
        },
      },
    },
    roof_type: { type: "string", enum: ["gable", "hip", "flat", "shed", "mixed"] },
    roof_pitch_deg: { type: "number" },
    storeys_above_ground: { type: "number" },
  },
};

const MAP_SYSTEM = `You are an architectural draughtsman reading an Israeli building-permit sheet (גיליון היתר). The image is one panel or strip of a scanned sheet that holds several drawings side by side.
List every separate drawing in the image with its bounding box in pixel coordinates of this image (origin top-left). A drawing is one plan, section, elevation, table, title block or notes block, usually with its own title underneath such as "תכנית קומת קרקע ק.מ. 1:100", "חתך א-א", "חזית דרומית", "תכנית פיתוח שטח", "תכנית גג", "תכנית קומת חניה ומסד", "תשריט", "מפה מצבית".
kind: floor_plan (a floor plan of a storey), development_plan (תכנית פיתוח שטח: site works around the house), site_plan (תשריט, מפה מצבית, location map), roof_plan, basement_plan (מרתף, חניה ומסד), section (חתך), elevation (חזית), area_table (טבלת שטחים), title_block, notes, other.
floor: for floor plans the storey in Hebrew as written (קרקע, א, ב, גג, מרתף), else empty. scale_den: the N of 1:N in the title, 0 if none. title: the title as written.
The box must contain the whole drawing including its dimension lines and title. Do not merge two drawings into one box. Skip drawings cut by the image edge so that less than half is visible.`;

const STRUCTURE_SYSTEM = `You read this drawing the way an architect, a draftsman, a 3D modeller and an AutoCAD, Revit and SketchUp expert would: you translate the 2D drawing into the volume of the building and the site. Before answering, understand the logic of the whole: where the street is, how one enters (gates, paths, the main entrance door), how levels step between the street, the yard and the floor (stairs, ramps, retaining walls), which way each part faces, and how the masses relate. Then read the details: every wall line, opening, step, level mark and dimension.
You are reading the ground-floor plan or site-development plan of an Israeli building permit, in order to build a 3D model of the house and garden. Coordinates are pixels of the image you receive (origin top-left).
Return:
- north_angle_deg: direction the north arrow points, in degrees clockwise from straight up in the image (0 = north is up, 90 = north is to the right). 0 if there is no arrow.
- units: each dwelling unit or building mass at ground level. footprint = polygon along the OUTER face of its exterior walls, vertices in order, following steps and corners; approximate curves with several points. Do not include terraces, pergolas, dashed outlines of floors above, or fill areas (מילוי). wall_thickness_cm from the drawing (usually 20-30). floor_level_rel/abs: the ±0.00 level of that unit and its absolute value (e.g. 0 and 699.00).
- openings: doors, sliding doors and windows in the exterior walls of the units, as the segment along the wall between the jambs.
- plot: the plot boundary (קו מגרש, גבול מגרש) polygon. Empty if not shown.
- zones: garden and yard areas outside the house: lawn (דשא), paving (hatched or tiled ריצוף, אבן), planting beds (גינון, ערוגה), deck, gravel, path, stairs, ramp (רמפה), parking, pool. polygon in order. level_abs: the absolute level written inside or at the zone, 0 if none. label: text written in the zone.
  Stairs and ramps: a band of parallel lines (treads) with an arrow. The arrow points UP the stairs (often marked עולה); the lower end is where the arrow starts. level_abs = the level at the TOP of the flight, level_to_abs = the level at the BOTTOM (read the level marks at both ends: the street, a yard, a storage room), 0 if unknown. descends_toward = the image direction in which the flight goes down (up, down, left, right). Every stair drawn in the plan must be returned as its own zone, including short flights to a storage room or a basement. For other zones level_to_abs = 0 and descends_toward = none.
- levels: every level mark (cross or triangle with numbers): text as written, abs (e.g. 698.85, 0 if not written), rel and has_rel when a relative value like ±0.00 or -0.22 is written, and x,y of the mark.
- trees: existing or proposed trees, palms and large shrubs with centre and radius in pixels.
- retaining_walls: walls drawn along the plot or between garden levels (קיר תומך, קיר פיתוח, גדר), as segments with their label.
In a semi-detached house (דו-משפחתי) return each unit as a separate footprint. Hatched cross-diagonal areas are paving; areas marked דשא are lawn; גינון is planting.
Read carefully; prefer fewer accurate polygons over many guessed ones.`;

const HEIGHTS_SYSTEM = `You are an architect reading a section (חתך) or elevation (חזית) of an Israeli building permit. List every level mark with its value: relative levels in metres such as ±0.00, +3.00, +6.00, +8.50, -1.00 (rel) and absolute levels such as 699.00 (abs, has_abs). For each, meaning: ground_floor (finished ground floor), first_floor, second_floor, attic, basement, roof_eave (top of wall where the roof starts), ridge (top of a pitched roof), parapet, flat_roof, natural_ground (קרקע טבעית), garden, street, window, other.
roof_type: gable (two slopes), hip, flat, shed or mixed; roof_pitch_deg if it can be read or estimated, else 0. storeys_above_ground: number of storeys above the ground floor level including the ground floor.`;

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

  let body: { image?: string; media_type?: string; image_url?: string; width?: number; height?: number; hint?: string; task?: string };
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

  const task = body.task === "map" || body.task === "structure" || body.task === "heights" ? body.task : "dims";
  const cfg = {
    dims: { schema: SCHEMA, system: SYSTEM, ask: "Read all dimensions and levels in this drawing." },
    map: { schema: MAP_SCHEMA, system: MAP_SYSTEM, ask: "List the drawings in this sheet image." },
    structure: { schema: STRUCTURE_SCHEMA, system: STRUCTURE_SYSTEM, ask: "Read the house footprint, openings, plot, garden zones, levels and trees in this plan." },
    heights: { schema: HEIGHTS_SCHEMA, system: HEIGHTS_SYSTEM, ask: "Read the levels and roof of this section or elevation." },
  }[task];
  const size = body.width && body.height ? `The image is ${Math.round(body.width)} x ${Math.round(body.height)} pixels.` : "";
  const hint = body.hint ? ` Context: ${String(body.hint).slice(0, 200)}` : "";

  try {
    const stream = client.beta.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: cfg.system,
      output_config: { effort: task === "structure" ? "high" : "medium", format: { type: "json_schema", schema: cfg.schema } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source },
            { type: "text", text: `${cfg.ask} ${size}${hint}` },
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
