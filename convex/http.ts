// convex/http.ts
import { httpRouter } from 'convex/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { httpAction } from './_generated/server';

const http = httpRouter();
const MAX_SKEW_SECONDS = 300;
const encoder = new TextEncoder();

function timingSafeEqualHex(a: string, b: string): boolean {
  const normA = a.trim().toLowerCase();
  const normB = b.trim().toLowerCase();
  if (normA.length !== normB.length) return false;
  let diff = 0;
  for (let i = 0; i < normA.length; i++) {
    diff |= normA.charCodeAt(i) ^ normB.charCodeAt(i);
  }
  return diff === 0;
}

async function computeHmacHex(
  secret: string,
  timestamp: string,
  rawBody: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${timestamp}.${rawBody}`),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function authenticateN8nRequest(
  request: Request,
  rawBody: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const secret = (
    process.env.CONVEX_N8N_API_SECRET ?? process.env.LENDLOOP_CONVEX_API_SECRET
  )?.trim();

  if (!secret) {
    return {
      ok: false,
      status: 500,
      error: 'CONVEX_N8N_API_SECRET is not configured',
    };
  }

  const timestamp = request.headers.get('X-LendLoop-Timestamp')?.trim();
  const signature = request.headers.get('X-LendLoop-Signature')?.trim();

  if (!timestamp || !signature) {
    return {
      ok: false,
      status: 401,
      error: 'Missing signature or timestamp headers',
    };
  }

  const tsNum = Number(timestamp);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(tsNum) || Math.abs(nowSec - tsNum) > MAX_SKEW_SECONDS) {
    return {
      ok: false,
      status: 401,
      error: 'Timestamp outside allowed window',
    };
  }

  const normalizedSig = signature.startsWith('sha256=')
    ? signature.slice('sha256='.length)
    : signature;

  const expectedSig = await computeHmacHex(secret, timestamp, rawBody);
  if (!timingSafeEqualHex(normalizedSig, expectedSig)) {
    return {
      ok: false,
      status: 401,
      error: 'Invalid HMAC signature',
    };
  }

  return { ok: true };
}

http.route({
  path: '/api/n8n/overdue-loans',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const auth = await authenticateN8nRequest(request, '');
    if (!auth.ok) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    const asOfDate =
      url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

    const loans = await ctx.runQuery(internal.workflows.getOverdueLoansData, {
      asOfDate,
    });

    return new Response(JSON.stringify({ asOfDate, loans }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
});

http.route({
  path: '/api/n8n/automation-events',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const rawBody = await request.text();
    const auth = await authenticateN8nRequest(request, rawBody);
    if (!auth.ok) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let parsed: {
      idempotencyKey?: string;
      loanId?: string;
      eventType?:
        | 'request_created'
        | 'request_approved'
        | 'request_declined'
        | 'loan_returned'
        | 'overdue_reminder';
      channel?: string;
      summary?: string;
      occurredAt?: number;
    };

    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!parsed.idempotencyKey || !parsed.loanId || !parsed.eventType) {
      return new Response(
        JSON.stringify({
          error: 'idempotencyKey, loanId, and eventType are required',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const result = await ctx.runMutation(
      internal.workflows.recordAutomationEventIdempotent,
      {
        idempotencyKey: parsed.idempotencyKey,
        loanId: parsed.loanId as Id<'loans'>,
        eventType: parsed.eventType,
        channel: parsed.channel ?? 'n8n',
        summary: parsed.summary ?? `Automation event: ${parsed.eventType}`,
        occurredAt: parsed.occurredAt,
      },
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
});

export default http;
