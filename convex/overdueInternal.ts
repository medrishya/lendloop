// convex/overdueInternal.ts
import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import { automationEventTypeValidator } from './schema';

export const getOverdueLoansForDate = internalQuery({
  args: {
    date: v.string(), // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    const approvedLoans = await ctx.db
      .query('loans')
      .withIndex('by_status_and_endDate', (q) =>
        q.eq('status', 'approved').lt('endDate', args.date),
      )
      .collect();

    const overdue = await Promise.all(
      approvedLoans.map(async (loan) => {
        const [tool, borrower] = await Promise.all([
          ctx.db.get(loan.toolId),
          ctx.db.get(loan.borrowerId),
        ]);

        return {
          loanId: loan._id,
          toolId: loan.toolId,
          toolName: tool?.name ?? 'Tool',
          borrowerId: loan.borrowerId,
          borrowerName: borrower?.name ?? 'Borrower',
          borrowerEmail: borrower?.email ?? null,
          startDate: loan.startDate,
          endDate: loan.endDate,
          dueDate: loan.endDate,
          status: loan.status,
          reminderCount: loan.reminderCount ?? 0,
        };
      }),
    );

    return overdue;
  },
});

export const recordOverdueWriteBack = internalMutation({
  args: {
    idempotencyKey: v.string(),
    loanId: v.id('loans'),
    eventType: automationEventTypeValidator,
    channel: v.string(),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('automationEvents')
      .withIndex('by_idempotencyKey', (q) =>
        q.eq('idempotencyKey', args.idempotencyKey),
      )
      .first();

    if (existing) {
      return { deduplicated: true, eventId: existing._id };
    }

    const loan = await ctx.db.get(args.loanId);
    if (!loan) {
      throw new Error(`Loan not found: ${args.loanId}`);
    }

    const now = Date.now();
    const eventId = await ctx.db.insert('automationEvents', {
      idempotencyKey: args.idempotencyKey,
      loanId: loan._id,
      toolId: loan.toolId,
      recipientUserId: loan.borrowerId,
      eventType: args.eventType,
      channel: args.channel,
      summary: args.summary,
      occurredAt: now,
    });

    await ctx.db.patch(loan._id, {
      lastReminderSentAt: now,
      reminderCount: (loan.reminderCount ?? 0) + 1,
      updatedAt: now,
    });

    return { deduplicated: false, eventId };
  },
});
