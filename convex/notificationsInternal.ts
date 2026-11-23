// convex/notificationsInternal.ts
import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { automationEventTypeValidator } from './schema';
import type { Id } from './_generated/dataModel';

const DEFAULT_CHANNEL = 'webhook';

export const recordAutomationEvent = internalMutation({
  args: {
    idempotencyKey: v.string(),
    loanId: v.id('loans'),
    toolId: v.id('tools'),
    recipientUserId: v.optional(v.id('users')),
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
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert('automationEvents', {
      idempotencyKey: args.idempotencyKey,
      loanId: args.loanId,
      toolId: args.toolId,
      recipientUserId: args.recipientUserId,
      eventType: args.eventType,
      channel: args.channel,
      summary: args.summary,
      occurredAt: args.occurredAt ?? Date.now(),
    });
  },
});

export const scheduleLoanNotification = internalMutation({
  args: {
    loanId: v.id('loans'),
    eventType: automationEventTypeValidator,
    actorName: v.optional(v.string()),
    channel: v.optional(v.string()),
    idempotencySuffix: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const loan = await ctx.db.get(args.loanId);
    if (!loan) return null;
    const [tool, owner, borrower] = await Promise.all([
      ctx.db.get(loan.toolId),
      ctx.db.get(loan.ownerId),
      ctx.db.get(loan.borrowerId),
    ]);

    const toolName = tool?.name ?? 'Tool';
    const ownerName = owner?.name ?? 'Lender';
    const borrowerName = borrower?.name ?? 'Borrower';
    const channel = args.channel ?? DEFAULT_CHANNEL;

    const isForLender = args.eventType === 'request_created';
    const recipient = isForLender ? owner : borrower;
    const recipientUserId: Id<'users'> | undefined = recipient?._id;
    const recipientName = isForLender ? ownerName : borrowerName;
    const recipientEmail = recipient?.email;
    const actorName =
      args.actorName ?? (isForLender ? borrowerName : ownerName);

    const summaryByEvent: Record<typeof args.eventType, string> = {
      request_created: `Borrow request created for "${toolName}" (${loan.startDate} to ${loan.endDate})`,
      request_approved: `Borrow request approved for "${toolName}" (${loan.startDate} to ${loan.endDate})`,
      request_declined: `Borrow request declined for "${toolName}" (${loan.startDate} to ${loan.endDate})`,
      loan_returned: `"${toolName}" marked as returned`,
      overdue_reminder: `Overdue return reminder for "${toolName}" (due ${loan.endDate})`,
    };

    const suffix = args.idempotencySuffix ? `:${args.idempotencySuffix}` : '';
    const idempotencyKey = `${loan._id}:${args.eventType}${suffix}`;

    await ctx.scheduler.runAfter(
      0,
      internal.notifications.dispatchWebhookNotification,
      {
        idempotencyKey,
        loanId: loan._id,
        toolId: loan.toolId,
        recipientUserId,
        eventType: args.eventType,
        channel,
        summary: summaryByEvent[args.eventType],
        toolName,
        startDate: loan.startDate,
        endDate: loan.endDate,
        loanStatus: loan.status,
        recipientName,
        recipientEmail,
        actorName,
      },
    );
    return idempotencyKey;
  },
});
