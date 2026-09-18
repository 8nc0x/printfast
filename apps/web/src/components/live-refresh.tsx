'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Live refresh via SSE. Mount on any dashboard; when the server signals that
 * data changed, re-render the server component tree. Silent no-op when SSE
 * is unavailable (proxies, old agents) — those keep using manual refresh.
 */
export function LiveRefresh({ channel = 'auto' }: { channel?: 'auto' }) {
  const router = useRouter();
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (closed) return;
      const es = new EventSource('/api/events');
      sourceRef.current = es;

      es.addEventListener('changed', () => {
        router.refresh();
      });
      es.addEventListener('ping', () => {
        /* keepalive */
      });
      es.onerror = () => {
        es.close();
        if (!closed) {
          reconnectTimer = setTimeout(connect, 5000); // reconnect with backoff window
        }
      };
    }

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      sourceRef.current?.close();
    };
  }, [router]);

  return null; // renders nothing
}
