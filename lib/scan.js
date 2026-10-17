// Shared scan logic: used by the Vercel function (api/scan.js) and the local dev server.
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MODEL = process.env.SCAN_MODEL || 'claude-opus-5-5';
const MAX_IMAGE_BYTES = 3_500_000; // base64 data URL length cap, keeps us under platform body limits
const RATE_PER_MIN = Number(process.env.SCAN_RATE_PER_MIN || 8);

const prices = JSON.parse(readFileSync(join(process.cwd(), 'public/data/prices.json'), 'utf8'));
const byName = new Map(prices.cars.map((c) => [c.car.toLowerCase(), c]));

const TYPES = ['super_treasure_hunt', 'treasure_hunt', 'mainline', 'premium', 'other', 'unknown'];

const SCHEMA = {
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

// Stable text first so it can be cached across scans.
const SYSTEM = [
  'You identify Hot Wheels 1:64 die-cast cars from one photo for a UK collector. The photo usually shows the car in its blister pack on its card, but it may be loose.',
  'Decide the type:',
  '- super_treasure_hunt: Spectraflame (deep shiny metallic) paint, Real Riders rubber tyres, "TH" printed on the car, gold circle-flame logo on the card behind the car.',
  '- treasure_hunt: a circle-flame logo printed on the car, a silver circle-flame logo on the card behind the car, normal paint and plastic wheels.',
  '- mainline: a normal basic single car with none of the above.',
  '- premium: Car Culture, Boulevard, Pop Culture or similar (metal base, rubber tyres, larger premium card). Not a Treasure Hunt.',
  '- other: another brand or toy. unknown: you cannot tell.',
  'Read any text you can see on the card: car name, collector number like "222/250", series and number like "Tooned 5/5", year. Use an empty string for anything you cannot read.',
  'These 2026 cars have price data (type, case letter, name):',
  prices.cars.map((c) => (c.t === 'S' ? 'Super' : 'TH') + ' | case ' + c.cs + ' | ' + c.car).join('\n'),
  'Set "match" to the exact name from this list ONLY if the car is that casting AND the type agrees. Otherwise null. Never guess a match.',
  'If the photo shows no die-cast car, set "found" to false and "type" to "unknown".',
  '"carded" is true if the car is in its pack, false if loose, null if you cannot tell.',
  '"evidence" lists 1 to 4 short things you can actually see. "tip" is one short practical sentence for a collector. Use plain, simple English.',
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

export const handleGet = () => json(200, { enabled: scanEnabled() });

export const handlePost = async (request, ip = 'unknown') => {
  if (!scanEnabled()) return json(503, { error: 'disabled' });
  if (limited(ip)) return json(429, { error: 'rate_limited' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'image_rejected' }); }
  const image = typeof body?.image === 'string' ? body.image : '';
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!m) return json(400, { error: 'image_rejected' });
  if (image.length > MAX_IMAGE_BYTES) return json(413, { error: 'too_large' });

  client ??= new Anthropic();
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2048,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
          { type: 'text', text: 'Identify this car.' },
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

  // Never trust the match blindly: it must be a listed car of the same type.
  const row = result.match ? byName.get(String(result.match).toLowerCase()) : null;
  const typeOk = row && ((row.t === 'S' && result.type === 'super_treasure_hunt') || (row.t === 'T' && result.type === 'treasure_hunt'));
  result.match = typeOk ? row.car : null;
  if (!Array.isArray(result.evidence)) result.evidence = [];
  result.evidence = result.evidence.slice(0, 4);

  return json(200, { result });
};
