'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// /app has no content of its own — send people to My Items.
// Client-side so it works under the client-guarded app layout.
export default function AppIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/app/items');
  }, [router]);
  return null;
}
