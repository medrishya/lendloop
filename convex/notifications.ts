// convex/notifications.ts
'use node';

import crypto from 'node:crypto';
import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { automationEventTypeValidator } from './schema';

export const dispatchWebhookNotification = internalAction({
  args: {
    idempotencyKey: v.string(),
    loanId: v.id('loans'),
    toolId: v.id('tools'),
    recipientUserId: v.optional(v.id('users')),
    eventType: automationEventTypeValidator,
    channel: v.string(),
    summary: v.string(),
    toolName: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    loanStatus: v.string(),
    recipientName: v.string(),
    recipientEmail: v.optional(v.string()),
    actorName: v.string(),
  },
  handler: async (ctx, args) => {
    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET;

    if (!webhookUrl) {
      await ctx.runMutation(
        internal.notificationsInternal.recordAutomationEvent,
        {
          idempotencyKey: `${args.idempotencyKey}:failed`,
          loanId: args.loanId,
          toolId: args.toolId,
          recipientUserId: args.recipientUserId,
          eventType: args.eventType,
          channel: args.channel,
          summary: `${args.summary} (failed: N8N_WEBHOOK_URL not configured)`,
        },
      );
      return;
    }

    // Minimal payload with only fields needed by n8n
    const payload = {
      idempotencyKey: args.idempotencyKey,
      eventType: args.eventType,
      loanId: args.loanId,
      toolId: args.toolId,
      toolName: args.toolName,
      startDate: args.startDate,
      endDate: args.endDate,
      status: args.loanStatus,
      recipient: {
        userId: args.recipientUserId ?? null,
        name: args.recipientName,
        email: args.recipientEmail ?? null,
      },
      actorName: args.actorName,
      summary: args.summary,
      sentAt: new Date().toISOString(),
    };
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const rawBody = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': args.idempotencyKey,
      'X-LendLoop-Timestamp': timestamp,
    };

    if (webhookSecret) {
      const signature = crypto
        .createHmac('sha256', webhookSecret.trim())
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');
      headers['X-LendLoop-Signature'] = `sha256=${signature}`;
    }

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: rawBody,
      });

      if (!res.ok) {
        await ctx.runMutation(
          internal.notificationsInternal.recordAutomationEvent,
          {
            idempotencyKey: `${args.idempotencyKey}:http_${res.status}`,
            loanId: args.loanId,
            toolId: args.toolId,
            recipientUserId: args.recipientUserId,
            eventType: args.eventType,
            channel: args.channel,
            summary: `${args.summary} (n8n HTTP ${res.status})`,
          },
        );
        return;
      }

      await ctx.runMutation(
        internal.notificationsInternal.recordAutomationEvent,
        {
          idempotencyKey: args.idempotencyKey,
          loanId: args.loanId,
          toolId: args.toolId,
          recipientUserId: args.recipientUserId,
          eventType: args.eventType,
          channel: args.channel,
          summary: args.summary,
        },
      );
    } catch (err) {
      const detail =
        err instanceof Error ? err.message : 'Webhook request failed';
      await ctx.runMutation(
        internal.notificationsInternal.recordAutomationEvent,
        {
          idempotencyKey: `${args.idempotencyKey}:error`,
          loanId: args.loanId,
          toolId: args.toolId,
          recipientUserId: args.recipientUserId,
          eventType: args.eventType,
          channel: args.channel,
          summary: `${args.summary} (${detail.slice(0, 120)})`,
        },
      );
    }
  },
});
