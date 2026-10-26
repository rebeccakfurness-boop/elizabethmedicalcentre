'use client';

import { useOptimistic, useTransition } from 'react';
import { setChecklistItemDone } from '@/app/actions/projects';

/** A checkbox that saves as soon as it's ticked. */
export function ChecklistToggle({ id, done, label }: { id: number; done: boolean; label: string }) {
  const [optimistic, setOptimistic] = useOptimistic(done);
  const [, start] = useTransition();
  return (
    <input
      type="checkbox"
      checked={optimistic}
      aria-label={label}
      className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-teal"
      onChange={(e) => {
        const next = e.target.checked;
        start(async () => {
          setOptimistic(next);
          await setChecklistItemDone(id, next);
        });
      }}
    />
  );
}
