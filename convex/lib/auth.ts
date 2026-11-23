import { ConvexError } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

export type UserDoc = Doc<'users'>;
export type ToolDoc = Doc<'tools'>;
export type LoanDoc = Doc<'loans'>;

/**
 * Returns the current user record if signed in and already synced in `users`,
 * or `null` if unauthenticated or not yet provisioned. Safe for queries.
 */
export async function getOptionalCurrentUser(
  ctx: QueryCtx | MutationCtx,
): Promise<UserDoc | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }

  return await ctx.db
    .query('users')
    .withIndex('by_clerkId', (q) => q.eq('clerkId', identity.subject))
    .unique();
}

/**
 * Requires an authenticated user in `users`. Throws a structured ConvexError
 * when signed out or missing a user record.
 */
export async function requireUser(
  ctx: QueryCtx | MutationCtx,
): Promise<UserDoc> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: 'UNAUTHENTICATED',
      message: 'You must be signed in to perform this action.',
    });
  }

  const user = await ctx.db
    .query('users')
    .withIndex('by_clerkId', (q) => q.eq('clerkId', identity.subject))
    .unique();

  if (!user) {
    throw new ConvexError({
      code: 'USER_NOT_PROVISIONED',
      message: 'User profile has not been initialized yet.',
    });
  }

  return user;
}

/**
 * Requires a signed-in user with the `admin` role.
 */
export async function requireAdmin(
  ctx: QueryCtx | MutationCtx,
): Promise<UserDoc> {
  const user = await requireUser(ctx);
  if (user.role !== 'admin') {
    throw new ConvexError({
      code: 'FORBIDDEN',
      message: 'Admin privileges are required for this action.',
    });
  }
  return user;
}

/**
 * Ensures the caller owns the tool or is an admin.
 */
export function assertCanManageTool(user: UserDoc, tool: ToolDoc): void {
  if (user.role === 'admin' || tool.ownerId === user._id) {
    return;
  }
  throw new ConvexError({
    code: 'FORBIDDEN',
    message: 'You do not have permission to modify or delete this listing.',
  });
}

/**
 * Ensures the caller is the tool owner or borrower on the loan (or an admin).
 */
export function assertCanAccessLoan(user: UserDoc, loan: LoanDoc): void {
  if (
    user.role === 'admin' ||
    loan.ownerId === user._id ||
    loan.borrowerId === user._id
  ) {
    return;
  }
  throw new ConvexError({
    code: 'FORBIDDEN',
    message: 'You do not have permission to view or act on this loan.',
  });
}

/**
 * Ensures only the tool owner (or admin) can approve/decline a borrow request.
 */
export function assertCanDecideLoanRequest(user: UserDoc, loan: LoanDoc): void {
  if (user.role === 'admin' || loan.ownerId === user._id) {
    return;
  }
  throw new ConvexError({
    code: 'FORBIDDEN',
    message: 'Only the tool owner can approve or decline this request.',
  });
}

/**
 * Ensures only the tool owner or borrower (or admin) can mark a loan returned.
 */
export function assertCanReturnLoan(user: UserDoc, loan: LoanDoc): void {
  if (
    user.role === 'admin' ||
    loan.ownerId === user._id ||
    loan.borrowerId === user._id
  ) {
    return;
  }
  throw new ConvexError({
    code: 'FORBIDDEN',
    message: 'Only the lender or borrower can mark this loan as returned.',
  });
}

export async function getToolOrThrow(
  ctx: QueryCtx | MutationCtx,
  toolId: Id<'tools'>,
): Promise<ToolDoc> {
  const tool = await ctx.db.get(toolId);
  if (!tool) {
    throw new ConvexError({
      code: 'NOT_FOUND',
      message: 'Tool listing not found.',
    });
  }
  return tool;
}

export async function getLoanOrThrow(
  ctx: QueryCtx | MutationCtx,
  loanId: Id<'loans'>,
): Promise<LoanDoc> {
  const loan = await ctx.db.get(loanId);
  if (!loan) {
    throw new ConvexError({
      code: 'NOT_FOUND',
      message: 'Loan record not found.',
    });
  }
  return loan;
}
