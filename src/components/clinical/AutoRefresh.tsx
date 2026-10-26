'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Re-fetches server data periodically so the clinic board stays current on a wall screen. */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
