import { query } from './_generated/server';

export const ping = query({
  args: {},
  handler: async () => {
    return {
      ok: true,
      service: 'lendloop-convex',
    };
  },
});

export const whoAmI = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    return {
      subject: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name ?? null,
      email: identity.email ?? null,
    };
  },
});
