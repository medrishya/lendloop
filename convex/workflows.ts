import { v } from 'convex/values';
import { api, internal } from './_generated/api';
import {
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server';
import { automationEventTypeValidator } from './schema';

async function signPayloadHmacSha256(
  secret: string,
  timestamp: string,
  rawBody: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(`${timestamp}.${rawBody}`);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    messageData,
  );

  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const getLoanNotificationContext = internalQuery({
  args: {
    loanId: v.id('loans'),
  },
  handler: async (ctx, args) => {
    const loan = await ctx.db.get(args.loanId);
    if (!loan) return null;

    const tool = await ctx.db.get(loan.toolId);
    const owner = await ctx.db.get(loan.ownerId);
    const borrower = await ctx.db.get(loan.borrowerId);

    return {
      loanId: loan._id,
      status: loan.status,
      startDate: loan.startDate,
      endDate: loan.endDate,
      toolName: tool?.name ?? 'Tool',
      ownerName: owner?.name ?? 'Lender',
      ownerEmail: owner?.email ?? null,
      borrowerName: borrower?.name ?? 'Borrower',
      borrowerEmail: borrower?.email ?? null,
    };
  },
});

export const notifyLoanEvent = internalAction({
  args: {
    loanId: v.id('loans'),
    eventType: automationEventTypeValidator,
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const webhookUrl = process.env.N8N_LOAN_WEBHOOK_URL;
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET;

    if (!webhookUrl || !webhookSecret) {
      console.warn(
        'Skipping n8n webhook dispatch: N8N_LOAN_WEBHOOK_URL or N8N_WEBHOOK_SECRET is not configured.',
      );
      return;
    }

    const details = await ctx.runQuery(
      internal.workflows.getLoanNotificationContext,
      { loanId: args.loanId },
    );
    if (!details) return;

    // Data minimization: send only fields needed for notification & idempotency
    const isForOwner = args.eventType === 'request_created';
    const payload = {
      idempotencyKey: args.idempotencyKey,
      eventType: args.eventType,
      loanId: details.loanId,
      toolName: details.toolName,
      startDate: details.startDate,
      endDate: details.endDate,
      status: details.status,
      recipient: {
        role: isForOwner ? 'owner' : 'borrower',
        name: isForOwner ? details.ownerName : details.borrowerName,
        email: isForOwner ? details.ownerEmail : details.borrowerEmail,
      },
    };

    const rawBody = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = await signPayloadHmacSha256(
      webhookSecret,
      timestamp,
      rawBody,
    );

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-LendLoop-Timestamp': timestamp,
        'X-LendLoop-Signature': signature,
        'Idempotency-Key': args.idempotencyKey,
      },
      body: rawBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`n8n webhook failed (${response.status}): ${errorText}`);
    }
  },
});

export const getOverdueLoansData = internalQuery({
  args: {
    asOfDate: v.string(), // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    const approvedLoans = await ctx.db
      .query('loans')
      .withIndex('by_status_and_endDate', (q) => q.eq('status', 'approved'))
      .collect();

    const overdue = approvedLoans.filter(
      (loan) => loan.endDate < args.asOfDate,
    );

    return await Promise.all(
      overdue.map(async (loan) => {
        const tool = await ctx.db.get(loan.toolId);
        const borrower = await ctx.db.get(loan.borrowerId);
        return {
          loanId: loan._id,
          toolId: loan.toolId,
          toolName: tool?.name ?? 'Tool',
          startDate: loan.startDate,
          dueDate: loan.endDate,
          borrowerUserId: loan.borrowerId,
          borrowerName: borrower?.name ?? 'Borrower',
          borrowerEmail: borrower?.email ?? null,
          lastReminderSentAt: loan.lastReminderSentAt ?? null,
          reminderCount: loan.reminderCount ?? 0,
        };
      }),
    );
  },
});

export const recordAutomationEventIdempotent = internalMutation({
  args: {
    idempotencyKey: v.string(),
    loanId: v.id('loans'),
    eventType: automationEventTypeValidator,
    channel: v.string(),
    summary: v.string(),
    occurredAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('automationEvents')
      .withIndex('by_idempotencyKey', (q) =>
        q.eq('idempotencyKey', args.idempotencyKey),
      )
      .unique();

    if (existing) {
      return {
        deduplicated: true,
        eventId: existing._id,
      };
    }

    const loan = await ctx.db.get(args.loanId);
    if (!loan) {
      throw new Error(`Loan ${args.loanId} not found`);
    }

    const now = args.occurredAt ?? Date.now();

    const eventId = await ctx.db.insert('automationEvents', {
      idempotencyKey: args.idempotencyKey,
      loanId: loan._id,
      toolId: loan.toolId,
      recipientUserId:
        args.eventType === 'request_created' ? loan.ownerId : loan.borrowerId,
      eventType: args.eventType,
      channel: args.channel,
      summary: args.summary,
      occurredAt: now,
    });

    if (args.eventType === 'overdue_reminder') {
      await ctx.db.patch(loan._id, {
        lastReminderSentAt: now,
        reminderCount: (loan.reminderCount ?? 0) + 1,
        updatedAt: now,
      });
    }

    return {
      deduplicated: false,
      eventId,
    };
  },
});
