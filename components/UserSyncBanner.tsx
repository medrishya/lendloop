// components/UserSyncBanner.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Show, useUser } from '@clerk/nextjs';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { getFriendlyErrorMessage } from '@/lib/errors';

export function useProvisionCurrentUser() {
  const { isLoaded, isSignedIn, user } = useUser();
  const ensureUser = useMutation(api.users.ensureCurrentUser);
  const syncedUserIdRef = useRef<string | null>(null);

  const [isProvisioned, setIsProvisioned] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !user) {
      syncedUserIdRef.current = null;
      setIsProvisioned(false);
      setSyncError(null);
      return;
    }

    if (syncedUserIdRef.current === user.id) {
      return;
    }

    let cancelled = false;
    setIsProvisioned(false);
    setSyncError(null);

    const fullName =
      user.fullName ||
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      'Neighbor';
    const email = user.primaryEmailAddress?.emailAddress;

    void ensureUser({
      clerkId: user.id,
      name: fullName,
      email,
    })
      .then(() => {
        if (cancelled) return;
        syncedUserIdRef.current = user.id;
        setIsProvisioned(true);
      })
      .catch((err) => {
        if (cancelled) return;
        syncedUserIdRef.current = null;
        setIsProvisioned(false);
        setSyncError(
          getFriendlyErrorMessage(
            err,
            'Could not initialize your user profile.',
          ),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, user, ensureUser]);

  return { isLoaded, isSignedIn, isProvisioned, syncError };
}

export function UserSyncBanner() {
  const { isSignedIn, syncError } = useProvisionCurrentUser();

  return (
    <Show when="signed-in">
      {isSignedIn && syncError && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900">
          Profile sync notice: {syncError}
        </div>
      )}
    </Show>
  );
}
