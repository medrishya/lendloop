// convex/loans.ts
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import { mutation, query } from './_generated/server';
import {
  assertCanDecideLoanRequest,
  assertCanReturnLoan,
  getLoanOrThrow,
  getOptionalCurrentUser,
  getToolOrThrow,
  requireUser,
} from './lib/auth';

function rangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return startA <= endB && endA >= startB;
}

export const requestBorrow = mutation({
  args: {
    toolId: v.id('tools'),
    startDate: v.string(), // YYYY-MM-DD
    endDate: v.string(), // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    const borrower = await requireUser(ctx);
    const tool = await getToolOrThrow(ctx, args.toolId);

    if (tool.status === 'inactive') {
      throw new ConvexError({
        code: 'INVALID_STATE',
        message: 'This tool listing is currently inactive.',
      });
    }

    if (tool.ownerId === borrower._id) {
      throw new ConvexError({
        code: 'INVALID_ACTION',
        message: 'You cannot borrow your own listed tool.',
      });
    }

    if (!args.startDate || !args.endDate || args.startDate > args.endDate) {
      throw new ConvexError({
        code: 'INVALID_DATES',
        message: 'Start date must be on or before end date.',
      });
    }

    const existingToolLoans = await ctx.db
      .query('loans')
      .withIndex('by_toolId', (q) => q.eq('toolId', args.toolId))
      .collect();

    const hasConflict = existingToolLoans.some(
      (loan) =>
        loan.status === 'approved' &&
        rangesOverlap(
          args.startDate,
          args.endDate,
          loan.startDate,
          loan.endDate,
        ),
    );

    if (hasConflict) {
      throw new ConvexError({
        code: 'DATE_CONFLICT',
        message:
          'This tool is already approved for an overlapping date range. Please change the date range.',
      });
    }

    const now = Date.now();
    const loanId = await ctx.db.insert('loans', {
      toolId: tool._id,
      ownerId: tool.ownerId,
      borrowerId: borrower._id,
      startDate: args.startDate,
      endDate: args.endDate,
      status: 'pending',
      reminderCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.runMutation(
      internal.notificationsInternal.scheduleLoanNotification,
      {
        loanId,
        eventType: 'request_created',
        actorName: borrower.name ?? 'Neighbor',
        idempotencySuffix: `${now}`,
      },
    );

    return loanId;
  },
});

export const decideBorrowRequest = mutation({
  args: {
    loanId: v.id('loans'),
    decision: v.union(v.literal('approved'), v.literal('declined')),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const loan = await getLoanOrThrow(ctx, args.loanId);
    assertCanDecideLoanRequest(actor, loan);

    if (loan.status !== 'pending') {
      throw new ConvexError({
        code: 'INVALID_STATE',
        message: `Cannot ${args.decision} a loan that is already ${loan.status}.`,
      });
    }

    const tool = await getToolOrThrow(ctx, loan.toolId);
    const now = Date.now();

    if (args.decision === 'approved') {
      const siblingLoans = await ctx.db
        .query('loans')
        .withIndex('by_toolId', (q) => q.eq('toolId', loan.toolId))
        .collect();

      const conflictsWithApproved = siblingLoans.some(
        (other) =>
          other._id !== loan._id &&
          other.status === 'approved' &&
          rangesOverlap(
            loan.startDate,
            loan.endDate,
            other.startDate,
            other.endDate,
          ),
      );

      if (conflictsWithApproved) {
        throw new ConvexError({
          code: 'DATE_CONFLICT',
          message: 'Another approved loan already overlaps with these dates.',
        });
      }

      await ctx.db.patch(loan._id, {
        status: 'approved',
        updatedAt: now,
      });

      if (tool.status !== 'inactive') {
        await ctx.db.patch(tool._id, {
          status: 'borrowed',
          updatedAt: now,
        });
      }

      await ctx.runMutation(
        internal.notificationsInternal.scheduleLoanNotification,
        {
          loanId: loan._id,
          eventType: 'request_approved',
          actorName: actor.name ?? 'Lender',
        },
      );
    } else {
      await ctx.db.patch(loan._id, {
        status: 'declined',
        updatedAt: now,
      });

      await ctx.runMutation(
        internal.notificationsInternal.scheduleLoanNotification,
        {
          loanId: loan._id,
          eventType: 'request_declined',
          actorName: actor.name ?? 'Lender',
        },
      );
    }
  },
});

export const markLoanReturned = mutation({
  args: {
    loanId: v.id('loans'),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const loan = await getLoanOrThrow(ctx, args.loanId);
    assertCanReturnLoan(actor, loan);

    if (loan.status !== 'approved') {
      throw new ConvexError({
        code: 'INVALID_STATE',
        message: 'Only approved active loans can be marked as returned.',
      });
    }

    const now = Date.now();
    await ctx.db.patch(loan._id, {
      status: 'returned',
      returnedAt: now,
      updatedAt: now,
    });

    const tool = await getToolOrThrow(ctx, loan.toolId);
    const toolLoans = await ctx.db
      .query('loans')
      .withIndex('by_toolId', (q) => q.eq('toolId', tool._id))
      .collect();

    const stillBorrowed = toolLoans.some(
      (other) => other._id !== loan._id && other.status === 'approved',
    );

    if (!stillBorrowed && tool.status === 'borrowed') {
      await ctx.db.patch(tool._id, {
        status: 'available',
        updatedAt: now,
      });
    }

    await ctx.runMutation(
      internal.notificationsInternal.scheduleLoanNotification,
      {
        loanId: loan._id,
        eventType: 'loan_returned',
        actorName: actor.name ?? 'Member',
      },
    );
  },
});

export const listMyBorrowRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query('loans')
      .withIndex('by_borrowerId_and_status', (q) =>
        q.eq('borrowerId', user._id),
      )
      .collect();

    return await Promise.all(
      loans.map(async (loan) => {
        const tool = await ctx.db.get(loan.toolId);
        const owner = await ctx.db.get(loan.ownerId);
        return {
          ...loan,
          toolName: tool?.name ?? 'Deleted Tool',
          ownerName: owner?.name ?? 'Neighbor',
        };
      }),
    );
  },
});

export const listIncomingRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query('loans')
      .withIndex('by_ownerId_and_status', (q) => q.eq('ownerId', user._id))
      .collect();

    return await Promise.all(
      loans.map(async (loan) => {
        const tool = await ctx.db.get(loan.toolId);
        const borrower = await ctx.db.get(loan.borrowerId);
        return {
          ...loan,
          toolName: tool?.name ?? 'Deleted Tool',
          borrowerName: borrower?.name ?? 'Neighbor',
        };
      }),
    );
  },
});

export const listAllLoansForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const current = await getOptionalCurrentUser(ctx);
    if (!current || current.role !== 'admin') {
      return [];
    }

    const loans = await ctx.db.query('loans').collect();
    return await Promise.all(
      loans.map(async (loan) => {
        const tool = await ctx.db.get(loan.toolId);
        const owner = await ctx.db.get(loan.ownerId);
        const borrower = await ctx.db.get(loan.borrowerId);
        return {
          ...loan,
          toolName: tool?.name ?? 'Deleted Tool',
          ownerName: owner?.name ?? 'Unknown',
          borrowerName: borrower?.name ?? 'Unknown',
        };
      }),
    );
  },
});

export const getLoanAutomationEvents = query({
  args: {
    loanId: v.id('loans'),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query('automationEvents')
      .withIndex('by_loanId_and_occurredAt', (q) => q.eq('loanId', args.loanId))
      .order('desc')
      .collect();
  },
});

export const listForOwner = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query('loans')
      .withIndex('by_ownerId_and_status', (q) => q.eq('ownerId', user._id))
      .collect();

    return await Promise.all(
      loans.map(async (loan) => {
        const tool = await ctx.db.get(loan.toolId);
        const borrower = await ctx.db.get(loan.borrowerId);
        return {
          ...loan,
          toolName: tool?.name ?? 'Deleted Tool',
          borrowerName: borrower?.name ?? 'Neighbor',
        };
      }),
    );
  },
});
