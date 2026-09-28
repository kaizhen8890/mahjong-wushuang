'use client';

import { useCallback, useState } from 'react';
import type { ControllerRealtimeEvent } from '@/lib/lan-protocol';

// Functional updates preserve simultaneous messages even when React batches them.
// Each player owns one stable slot; fast repeats cannot evict another player.
export function useRealtimeEvents() {
  const [realtimeEvent, setLatest] = useState<ControllerRealtimeEvent | null>(null);
  const [emoteEvents, setEmotes] = useState<ControllerRealtimeEvent[]>([]);
  const setRealtimeEvent = useCallback((event: ControllerRealtimeEvent | null) => {
    setLatest(event);
    setEmotes((previous) => {
      if (!event) return [];
      if (event.kind !== 'emote') return previous;
      const slot = previous.findIndex((item) => item.actorPlayerId === event.actorPlayerId);
      if (slot >= 0) return previous.map((item, index) => index === slot ? event : item);
      if (previous.length < 4) return [...previous, event];
      const oldest = previous.reduce((a, b) => a.createdAt <= b.createdAt ? a : b);
      return previous.map((item) => item === oldest ? event : item);
    });
  }, []);
  return { realtimeEvent, emoteEvents, setRealtimeEvent };
}
