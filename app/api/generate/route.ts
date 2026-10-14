import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { MAX_UPLOAD_BYTES, sniffImageType, validateImageFile } from '@/lib/images';
import { clientIp } from '@/lib/clientIp';
import { rateLimit } from '@/lib/rateLimit';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPSTREAM_TIMEOUT_MS = 120000;
// Two images plus multipart overhead
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES * 2 + 64 * 1024;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 1000;

function jsonError(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('N8N_WEBHOOK_URL is not set');
    return jsonError('The service is not configured.', 500);
  }

  // Blocks other websites from using this endpoint through a visitor's browser
  if (!isSameOrigin(request)) {
    return jsonError('Forbidden.', 403);
  }

  // Only signed-in users may generate (and so reach the n8n webhook)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return jsonError('Please log in.', 401);
  }

  const { allowed, retryAfterSeconds } = rateLimit(clientIp(request.headers), RATE_LIMIT, RATE_WINDOW_MS);
  if (!allowed) {
    return jsonError('Too many requests. Please wait a moment and try again.', 429, {
      'Retry-After': String(retryAfterSeconds),
    });
  }

  // Reject oversized bodies before buffering them
  const contentLength = Number(request.headers.get('content-length'));
  if (!contentLength) {
    return jsonError('Missing request body.', 411);
  }
  if (contentLength > MAX_BODY_BYTES) {
    return jsonError('Upload is too large.', 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError('Invalid form data.', 400);
  }

  const upstreamForm = new FormData();
  for (const field of ['image1', 'image2'] as const) {
    const file = form.get(field);
    if (!(file instanceof File)) {
      return jsonError(`Missing ${field}.`, 400);
    }
    const problem = validateImageFile(file);
    if (problem) {
      return jsonError(`${field}: ${problem}`, 400);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sniffedType = sniffImageType(bytes);
    if (!sniffedType) {
      return jsonError(`${field}: File content is not a valid JPEG, PNG or WEBP image.`, 400);
    }
    // Forward with a server-chosen name and the detected type rather than client-supplied values
    const ext = sniffedType.split('/')[1];
    upstreamForm.append(field, new Blob([bytes], { type: sniffedType }), `${field}.${ext}`);
  }

  const headers: HeadersInit = {};
  if (process.env.N8N_WEBHOOK_SECRET) {
    headers['X-Webhook-Secret'] = process.env.N8N_WEBHOOK_SECRET;
  }

  let upstream: Response;
  try {
    upstream = await fetch(webhookUrl, {
      method: 'POST',
      body: upstreamForm,
      headers,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]),
      cache: 'no-store',
      redirect: 'error',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return jsonError('Image generation timed out. Please try again.', 504);
    }
    console.error('Webhook request failed:', error);
    return jsonError('Image generation failed. Please try again.', 502);
  }

  if (!upstream.ok) {
    // Upstream details stay in the server log, not in the response
    console.error(`Webhook returned ${upstream.status}: ${(await upstream.text()).slice(0, 500)}`);
    return jsonError('Image generation failed. Please try again.', 502);
  }

  const imageBytes = new Uint8Array(await upstream.arrayBuffer());
  if (imageBytes.byteLength > MAX_RESPONSE_BYTES) {
    console.error(`Webhook returned an oversized response (${imageBytes.byteLength} bytes)`);
    return jsonError('Image generation failed. Please try again.', 502);
  }
  // Trust the bytes, not the upstream Content-Type, so only real images reach the browser
  const imageType = sniffImageType(imageBytes);
  if (!imageType) {
    console.error(`Webhook returned non-image content (${upstream.headers.get('content-type')})`);
    return jsonError('Image generation failed. Please try again.', 502);
  }

  return new NextResponse(imageBytes, {
    status: 200,
    headers: {
      'Content-Type': imageType,
      'Content-Length': String(imageBytes.byteLength),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
