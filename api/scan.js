// Vercel serverless function: GET reports whether scanning is on, POST scans one photo.
import { handleGet, handlePost } from '../lib/scan.js';

export const maxDuration = 60;

export function GET() {
  return handleGet();
}

export function POST(request) {
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  return handlePost(request, ip);
}
