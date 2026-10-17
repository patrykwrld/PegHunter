// Shared scan logic: used by the Vercel function (api/scan.js) and the local dev server.
// Two modes: "card" (one car, full detail) and "sweep" (every card on a peg wall, with boxes).
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MODEL = process.env.SCAN_MODEL || 'claude-opus-5-5';
const MAX_IMAGE_BYTES = 3_500_000; // base64 data URL length cap, keeps us under platform body limits
const RATE_PER_MIN = Number(process.env.SCAN_RATE_PER_MIN || 8);

const catalog = JSON.parse(readFileSync(join(process.cwd(), 'public/data/catalog.json'), 'utf8'));
const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

const TYPES = ['super_treasure_hunt', 'treasure_hunt', 'mainline', 'premium', 'other', 'unknown'];
const HUNT = (c) => c.type !== 'mainline';
const hunts2026 = catalog.cars.filter((c) => c.y === 2026 && HUNT(c));
const castings = [...new Set(catalog.cars.map((c) => c.name))].sort();

// Pick the catalog row a model-reported name points to, preferring the same type and year.
const resolve = (name, type) => {
  const n = norm(name);
  if (!n) return null;
  const same = catalog.cars.filter((c) => norm(c.name) === n);
  if (!same.length) return null;
  const rank = (c) => (c.type === type ? 0 : 4) + (c.y === 2026 ? 0 : 2) + (c.v === 1 ? 0 : 1);
  const best = same.sort((a, b) => rank(a) - rank(b))[0];
  // A hunt match only counts when the model also saw a hunt of that kind.
  if (HUNT(best) && best.type !== type) return same.find((c) => !HUNT(c)) || null;
  return best;
};

const CARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['found', 'type', 'name', 'match', 'carded', 'colour', 'collector_number', 'series', 'year', 'confidence', 'evidence', 'tip'],
  properties: {
    found: { type: 'boolean' },
    type: { type: 'string', enum: TYPES },
    name: { type: 'string' },
    match: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    carded: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
    colour: { type: 'string' },
    collector_number: { type: 'string' },
    series: { type: 'string' },
    year: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    evidence: { type: 'array', items: { type: 'string' } },
    tip: { type: 'string' },
  },
};

const SWEEP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['found', 'cards'],
  properties: {
    found: { type: 'boolean' },
    cards: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['x', 'y', 'w', 'h', 'type', 'name', 'match', 'confidence'],
        properties: {
          x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' },
          type: { type: 'string', enum: TYPES },
          name: { type: 'string' },
          match: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
};

// Stable text first so it is cached across scans.
const SYSTEM = [
  'You identify Hot Wheels 1:64 die-cast cars from photos for a UK collector, usually taken in a shop: cars in blister packs on cards, often many on a peg wall.',
  'Types:',
  '- super_treasure_hunt: Spectraflame (deep shiny metallic) paint, Real Riders rubber tyres, "TH" printed on the car, gold circle-flame logo on the card behind the car.',
  '- treasure_hunt: a circle-flame logo printed on the car, a silver circle-flame logo on the card behind the car, normal paint and plastic wheels.',
  '- mainline: a normal basic single car with none of the above.',
  '- premium: Car Culture, Boulevard, Pop Culture or similar (metal base, rubber tyres, larger premium card). Not a Treasure Hunt.',
  '- other: another brand or toy. unknown: you cannot tell.',
  'The 2026 Treasure Hunts and Supers (type | case letter | name):',
  hunts2026.map((c) => (c.type === 'super_treasure_hunt' ? 'Super' : 'TH') + ' | case ' + (c.case || '?') + ' | ' + c.name).join('\n'),
  'Known Hot Wheels mainline castings for 2026 and 2027:',
  castings.join('; '),
  'Set "match" to the exact casting name from these lists ONLY when you can read the name on the card or are sure of the casting. Otherwise null. Never guess.',
  'Never call a car a Treasure Hunt or Super unless you can see the flame logo or the Super features. When unsure, use the lower type and lower confidence.',
  'Use plain, simple English.',
].join('\n');

const CARD_TASK = [
  'Identify the one main car in this photo.',
  'Read any text on the card: name, collector number like "222/250", series and number like "Tooned 5/5", year. Use an empty string for anything you cannot read.',
  'If there is no die-cast car, set "found" false and "type" "unknown".',
  '"carded": true in its pack, false loose, null if you cannot tell.',
  '"evidence": 1 to 4 short things you can actually see. "tip": one short practical sentence for a collector.',
].join('\n');

const SWEEP_TASK = [
  'This photo shows a peg wall or shelf of cards. Find every Hot Wheels card you can see, up to 24.',
  'For each card give its box as fractions of the image: x and y of the top-left corner, w and h, all between 0 and 1.',
  'Give its type, the car name if you can read it (else an empty string), the casting match or null, and your confidence.',
  'Look hard for Treasure Hunts and Supers: those matter most. If there are no cards, set "found" false and return an empty list.',
].join('\n');

let client;
export const scanEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

// Best-effort per-instance limiter. Serverless instances do not share memory,
// so this slows abuse rather than stopping it; see README for a hard cap.
const hits = new Map();
const limited = (ip) => {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE_PER_MIN;
};

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

const clamp = (v) => Math.min(1, Math.max(0, Number(v) || 0));

const shapeCard = (r) => {
  const row = resolve(r.match, r.type);
  return { ...r, match: row ? row.name : null, catalogId: row ? row.id : null, evidence: (Array.isArray(r.evidence) ? r.evidence : []).slice(0, 4) };
};

const shapeSweep = (r) => ({
  found: Boolean(r.found),
  cards: (Array.isArray(r.cards) ? r.cards : []).slice(0, 24).map((c) => {
    const row = resolve(c.match, c.type);
    return {
      x: clamp(c.x), y: clamp(c.y), w: clamp(c.w), h: clamp(c.h),
      type: TYPES.includes(c.type) ? c.type : 'unknown',
      name: row ? row.name : String(c.name || ''),
      catalogId: row ? row.id : null,
      confidence: c.confidence,
    };
  }),
});

export const handleGet = () => json(200, { enabled: scanEnabled() });

export const handlePost = async (request, ip = 'unknown') => {
  if (!scanEnabled()) return json(503, { error: 'disabled' });
  if (limited(ip)) return json(429, { error: 'rate_limited' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'image_rejected' }); }
  const mode = body?.mode === 'sweep' ? 'sweep' : 'card';
  const image = typeof body?.image === 'string' ? body.image : '';
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!m) return json(400, { error: 'image_rejected' });
  if (image.length > MAX_IMAGE_BYTES) return json(413, { error: 'too_large' });

  client ??= new Anthropic();
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: mode === 'sweep' ? 6000 : 2048,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: mode === 'sweep' ? SWEEP_SCHEMA : CARD_SCHEMA } },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
          { type: 'text', text: mode === 'sweep' ? SWEEP_TASK : CARD_TASK },
        ],
      }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json(429, { error: 'rate_limited' });
    if (err instanceof Anthropic.BadRequestError) return json(400, { error: 'image_rejected' });
    console.error('scan failed', err?.status, err?.message);
    return json(502, { error: 'server' });
  }

  if (response.stop_reason === 'refusal') return json(422, { error: 'refused' });
  const text = response.content.find((b) => b.type === 'text')?.text;
  let result;
  try { result = JSON.parse(text); } catch { return json(502, { error: 'invalid_json' }); }

  return json(200, { mode, result: mode === 'sweep' ? shapeSweep(result) : shapeCard(result) });
};
