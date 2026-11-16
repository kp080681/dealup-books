'use client';

import { useActionState, startTransition } from 'react';

// A small form wrapper that shows the action's error or success message.
export default function SimpleForm({ action, children, button, className = 'card form' }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form className={className} onSubmit={(ev) => {
      // Submit without React's automatic form reset, so typed values survive an error.
      ev.preventDefault();
      const fd = new FormData(ev.currentTarget);
      startTransition(() => run(fd));
    }}>
      {children}
      {state?.error ? <p className="error">{state.error}</p> : null}
      {state?.ok && typeof state.ok === 'string' ? <p className="ok">{state.ok}</p> : null}
      <button disabled={pending}>{pending ? 'Please wait…' : button}</button>
    </form>
  );
}
