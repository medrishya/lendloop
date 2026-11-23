import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const userRoleValidator = v.union(v.literal('user'), v.literal('admin'));

export const toolStatusValidator = v.union(
  v.literal('available'),
  v.literal('borrowed'),
  v.literal('inactive'),
);

export const loanStatusValidator = v.union(
  v.literal('pending'),
  v.literal('approved'),
  v.literal('declined'),
  v.literal('returned'),
);

export const automationEventTypeValidator = v.union(
  v.literal('request_created'),
  v.literal('request_approved'),
  v.literal('request_declined'),
  v.literal('loan_returned'),
  v.literal('overdue_reminder'),
);

export default defineSchema({
  users: defineTable({
    // Matches Clerk identity `subject` (or `tokenIdentifier`)
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    role: userRoleValidator,
    trustedLender: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_clerkId', ['clerkId'])
    .index('by_email', ['email']),

  tools: defineTable({
    ownerId: v.id('users'),
    name: v.string(),
    category: v.string(), // e.g., "power tools", "garden", "kitchen", "camping"
    condition: v.string(), // e.g., "like new", "good", "fair"
    description: v.string(),
    status: toolStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_ownerId', ['ownerId'])
    .index('by_status', ['status'])
    .index('by_category_and_status', ['category', 'status']),

  loans: defineTable({
    toolId: v.id('tools'),
    ownerId: v.id('users'), // Denormalized from tool for fast incoming-request queries & RBAC
    borrowerId: v.id('users'),
    startDate: v.string(), // ISO YYYY-MM-DD
    endDate: v.string(), // ISO YYYY-MM-DD (due date)
    status: loanStatusValidator,
    lastReminderSentAt: v.optional(v.number()),
    reminderCount: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_toolId', ['toolId'])
    .index('by_ownerId_and_status', ['ownerId', 'status'])
    .index('by_borrowerId_and_status', ['borrowerId', 'status'])
    .index('by_status_and_endDate', ['status', 'endDate']),

  automationEvents: defineTable({
    // Ensures retries from n8n or Convex actions never duplicate records
    idempotencyKey: v.string(),
    loanId: v.id('loans'),
    toolId: v.id('tools'),
    recipientUserId: v.optional(v.id('users')),
    eventType: automationEventTypeValidator,
    channel: v.string(), // e.g., "email", "slack", "mock"
    summary: v.string(), // e.g., "Overdue reminder sent"
    occurredAt: v.number(),
  })
    .index('by_idempotencyKey', ['idempotencyKey'])
    .index('by_loanId_and_occurredAt', ['loanId', 'occurredAt']),
});
