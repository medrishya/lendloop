// convex/users.ts
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getOptionalCurrentUser, requireAdmin, requireUser } from './lib/auth';

export const ensureCurrentUser = mutation({
  args: {
    clerkId: v.optional(v.string()),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('Unauthorized');
    }

    const clerkUserId = identity.subject;
    const now = Date.now();

    const existing = await ctx.db
      .query('users')
      .withIndex('by_clerkId', (q) => q.eq('clerkId', clerkUserId))
      .unique();

    const resolvedName =
      args.name?.trim() || identity.name || identity.email || 'Neighbor';
    const resolvedEmail = args.email?.trim() || identity.email || undefined;

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: existing.name ?? resolvedName,
        email: existing.email ?? resolvedEmail,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert('users', {
      clerkId: clerkUserId,
      name: resolvedName,
      email: resolvedEmail,
      role: 'user',
      trustedLender: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const currentProfile = query({
  args: {},
  handler: async (ctx) => {
    return await getOptionalCurrentUser(ctx);
  },
});

export const setTrustedLender = mutation({
  args: {
    targetUserId: v.id('users'),
    trustedLender: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const target = await ctx.db.get(args.targetUserId);
    if (!target) {
      throw new Error('Target user not found');
    }

    await ctx.db.patch(args.targetUserId, {
      trustedLender: args.trustedLender,
      updatedAt: Date.now(),
    });
  },
});

export const listAllUsersForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const current = await getOptionalCurrentUser(ctx);
    if (!current || current.role !== 'admin') {
      return [];
    }
    return await ctx.db.query('users').collect();
  },
});
