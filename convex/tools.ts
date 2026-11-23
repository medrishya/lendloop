import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import {
  assertCanManageTool,
  getOptionalCurrentUser,
  getToolOrThrow,
  requireUser,
  requireAdmin,
} from './lib/auth';
import { toolStatusValidator } from './schema';

export const listPublicAvailableTools = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db
      .query('tools')
      .withIndex('by_status', (q) => q.eq('status', 'available'))
      .collect();

    // Strict data minimization for unauthenticated public board: name + category only
    return tools.map((tool) => ({
      _id: tool._id,
      name: tool.name,
      category: tool.category,
    }));
  },
});

export const listTools = query({
  args: {
    category: v.optional(v.string()),
    status: v.optional(toolStatusValidator),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);

    let tools =
      args.category && args.category !== 'all'
        ? await ctx.db
            .query('tools')
            .withIndex('by_category_and_status', (q) =>
              q.eq('category', args.category!),
            )
            .collect()
        : await ctx.db.query('tools').collect();

    if (args.status) {
      tools = tools.filter((t) => t.status === args.status);
    }

    const enriched = await Promise.all(
      tools.map(async (tool) => {
        const owner = await ctx.db.get(tool.ownerId);
        return {
          ...tool,
          ownerName: owner?.name ?? 'Neighbor',
          ownerTrustedLender: owner?.trustedLender ?? false,
        };
      }),
    );

    return enriched;
  },
});

export const listMyTools = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return await ctx.db
      .query('tools')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', user._id))
      .collect();
  },
});

export const updateTool = mutation({
  args: {
    toolId: v.id('tools'),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    condition: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(toolStatusValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await getToolOrThrow(ctx, args.toolId);
    assertCanManageTool(user, tool);

    const patch: Partial<typeof tool> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.category !== undefined)
      patch.category = args.category.trim().toLowerCase();
    if (args.condition !== undefined) patch.condition = args.condition.trim();
    if (args.description !== undefined)
      patch.description = args.description.trim();
    if (args.status !== undefined) patch.status = args.status;

    await ctx.db.patch(args.toolId, patch);
  },
});

export const deleteTool = mutation({
  args: {
    toolId: v.id('tools'),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await getToolOrThrow(ctx, args.toolId);
    assertCanManageTool(user, tool);

    await ctx.db.delete(args.toolId);
  },
});

export const getCurrentUserRoleInfo = query({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalCurrentUser(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      role: user.role,
      trustedLender: user.trustedLender,
    };
  },
});

// convex/tools.ts
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db.query('tools').order('desc').collect();
    return await Promise.all(
      tools.map(async (tool) => {
        const owner = await ctx.db.get(tool.ownerId);
        return {
          ...tool,
          ownerTrustedLender: owner?.trustedLender,
        };
      }),
    );
  },
});

export const getById = query({
  args: { toolId: v.id('tools') },
  handler: async (ctx, { toolId }) => {
    const tool = await ctx.db.get(toolId);
    if (!tool) return null;
    const owner = await ctx.db.get(tool.ownerId);
    return {
      ...tool,
      ownerName: owner?.name ?? 'Neighbor',
    };
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return await ctx.db
      .query('tools')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', user._id))
      .order('desc')
      .collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    category: v.string(),
    condition: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await ctx.db.insert('tools', {
      ownerId: user._id,
      name: args.name.trim(),
      category: args.category.trim(),
      condition: args.condition?.trim(),
      description: args.description?.trim(),
      status: 'available',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const setStatus = mutation({
  args: {
    toolId: v.id('tools'),
    status: v.union(
      v.literal('available'),
      v.literal('borrowed'),
      v.literal('inactive'),
    ),
  },
  handler: async (ctx, { toolId, status }) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool) throw new Error('Tool not found');
    if (tool.ownerId !== user._id && user.role !== 'admin') {
      throw new Error('Only the tool owner can update availability');
    }
    if (tool.status === 'on_loan' && status !== 'on_loan') {
      throw new Error('Cannot change status while tool is actively on loan');
    }
    await ctx.db.patch(toolId, { status });
  },
});

export const listAllToolsForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const current = await getOptionalCurrentUser(ctx);
    if (!current || current.role !== 'admin') {
      return [];
    }

    const tools = await ctx.db.query('tools').collect();
    return await Promise.all(
      tools.map(async (tool) => {
        const owner = await ctx.db.get(tool.ownerId);
        return {
          ...tool,
          ownerName: owner?.name ?? 'Unknown',
          ownerTrustedLender: owner?.trustedLender ?? false,
        };
      }),
    );
  },
});

export const adminRemoveTool = mutation({
  args: {
    toolId: v.id('tools'),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const tool = await ctx.db.get(args.toolId);
    if (!tool) {
      throw new Error('Tool listing not found.');
    }

    // Cancel any open pending/approved loans tied to this listing
    const relatedLoans = await ctx.db
      .query('loans')
      .withIndex('by_toolId', (q) => q.eq('toolId', args.toolId))
      .collect();

    const now = Date.now();
    for (const loan of relatedLoans) {
      if (loan.status === 'pending' || loan.status === 'approved') {
        await ctx.db.patch(loan._id, {
          status: 'declined',
          updatedAt: now,
        });
      }
    }

    await ctx.db.delete(args.toolId);
  },
});
