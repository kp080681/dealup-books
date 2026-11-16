'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseAction } from '../app/actions';
import EntryForm from './EntryForm';

export default function EntryBox({ accounts, categories, today }) {
  const router = useRouter();
  const [parsed, parse, parsing] = useActionState(parseAction, null);
  const [mode, setMode] = useState('text'); // 'text' | 'form'
  const [doneNonce, setDoneNonce] = useState(null);
  const [saved, setSaved] = useState(null);
  const [formKey, setFormKey] = useState(0);

  const proposal = parsed?.proposal && parsed.nonce !== doneNonce ? parsed.proposal : null;
  const onSaved = (res) => {
    setSaved(res.id);
    setDoneNonce(parsed?.nonce ?? null);
    setFormKey((k) => k + 1);
    router.refresh();
  };

  return (
    <section>
      <div className="tabs">
        <button type="button" className={mode === 'text' ? 'tab on' : 'tab'} onClick={() => setMode('text')}>Type it</button>
        <button type="button" className={mode === 'form' ? 'tab on' : 'tab'} onClick={() => setMode('form')}>Fill a form</button>
      </div>

      {saved ? <p className="ok">Saved as entry #{saved}.</p> : null}

      {mode === 'text' ? (
        <>
          <form action={(fd) => { setSaved(null); parse(fd); }} className="card">
            <label>What was paid or received?
              <textarea key={doneNonce || 'first'} name="text" rows={2} required
                placeholder="paid Preethesh 20,000 from HDFC for September" />
            </label>
            {parsed?.error ? <p className="error">{parsed.error}</p> : null}
            <button disabled={parsing}>{parsing ? 'Reading…' : 'Make the entry'}</button>
          </form>
          {proposal ? (
            <div>
              <h3>Check this entry</h3>
              <p className="source">From your message: “{proposal.source_text}”</p>
              {proposal.question ? <p className="ask">One thing is missing: {proposal.question}</p> : null}
              <EntryForm key={parsed.nonce} accounts={accounts} categories={categories} onSaved={onSaved}
                initial={{ ...proposal, ca_flags: proposal.flags.join('\n'), source_type: 'message' }} />
            </div>
          ) : null}
        </>
      ) : (
        <EntryForm key={formKey} accounts={accounts} categories={categories} onSaved={onSaved}
          initial={{ entry_date: today, source_type: 'form' }} submitLabel="Save entry" />
      )}
    </section>
  );
}
