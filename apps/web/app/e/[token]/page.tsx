'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LoadingState } from '@/components/ui/states';

/**
 * Older link format (/e/<token>). Moves the token into the fragment (/e#<token>), so it stops
 * appearing in request paths from here on, and opens the portal.
 */
export default function LegacyOwnerLink() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/e#${encodeURIComponent(token)}`);
  }, [router, token]);
  return <LoadingState label="Opening your request…" />;
}
