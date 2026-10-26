import Link from 'next/link';
import { deleteStatement, matchTransaction, runAutoMatch, unmatchTransaction, uploadStatement } from '@/app/actions/finance';
import { EmptyState } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { Pill } from '@/components/ui/Badges';
import { getMatchCandidates, listBankTransactions, listStatements } from '@/lib/bank';
import { getCategories } from '@/lib/budget';
import { formatDate, formatIDR } from '@/lib/format';
import { requireBudgetUnlocked } from '@/lib/session';

export default async function BankPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireBudgetUnlocked();
  const { status = 'unmatched' } = await searchParams;
  const [txns, statements, categories] = await Promise.all([listBankTransactions(status), listStatements(), getCategories()]);
  const candidates = new Map(
    await Promise.all(txns.filter((t) => t.status === 'unmatched').map(async (t) => [t.id, await getMatchCandidates(t)] as const))
  );
  const revenueCats = categories.filter((c) => c.kind === 'revenue');
  const expenseCats = categories.filter((c) => c.kind === 'expense');

  return (
    <div>
      <p className="card-title">Budget tracker</p>
      <h1 className="page-title mb-6 mt-1">Bank statements</h1>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="card-title mb-1">Upload a statement</h2>
          <p className="mb-4 text-sm text-ink-soft">
            Download the CSV or Excel export from internet banking (BCA, Mandiri, BNI, BRI, Wise and most others work). PDF statements are read automatically when
            the statement reader is switched on. Lines already imported from an overlapping statement are skipped.
          </p>
          <ActionForm action={uploadStatement} submitLabel="Import statement" submitClassName="btn-clay" resetOnSuccess>
            <input className="input py-2 text-sm" name="statement" type="file" accept=".csv,.xlsx,.xls,.pdf" required aria-label="Statement file" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="auto_match" defaultChecked className="h-4 w-4 accent-teal" /> Match obvious payments automatically (exact amount and a name or invoice number)
            </label>
          </ActionForm>
        </section>
        <section className="card">
          <h2 className="card-title mb-3">Imported statements</h2>
          {statements.length === 0 ? (
            <p className="text-sm text-ink-soft">None yet.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {statements.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{s.account_label ?? `Statement #${s.id}`}</p>
                    <p className="text-xs text-ink-soft">
                      {formatDate(s.period_start)} – {formatDate(s.period_end)} · {s.txns} lines · {s.unmatched} to match
                      {s.file_id ? <> · <a href={`/api/files/${s.file_id}`} target="_blank" rel="noreferrer" className="text-teal underline">file</a></> : null}
                    </p>
                  </div>
                  <ActionForm action={deleteStatement} submitLabel="Remove" submitClassName="text-xs text-ink-soft underline hover:text-red-700" inline confirm="Remove this statement and its unmatched lines?">
                    <input type="hidden" name="id" value={s.id} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {[{ v: 'unmatched', l: 'To match' }, { v: 'matched', l: 'Matched' }, { v: 'ignored', l: 'Ignored' }, { v: 'all', l: 'All' }].map((f) => (
          <Link key={f.v} href={`/dashboard/budget/bank?status=${f.v}`} className={`rounded-full px-3.5 py-1.5 font-label text-xs font-bold ${status === f.v ? 'bg-teal text-cream' : 'border border-line bg-white text-ink-soft hover:border-teal'}`}>{f.l}</Link>
        ))}
        {status === 'unmatched' && txns.length ? (
          <div className="ml-auto">
            <ActionForm action={runAutoMatch} submitLabel="Auto-match" submitClassName="btn-ghost btn-sm" inline />
          </div>
        ) : null}
      </div>

      {txns.length === 0 ? (
        <EmptyState>{status === 'unmatched' ? 'Everything is matched. 🎉' : 'Nothing here.'}</EmptyState>
      ) : (
        <div className="space-y-3">
          {txns.map((t) => {
            const cands = candidates.get(t.id) ?? [];
            // Preselect only a confident match (same rule as auto-match): exact amount plus a name or invoice-number hit.
            const confident = cands.filter((c) => c.amount === t.amount && c.score >= 11);
            return (
              <div key={t.id} className={`card ${t.status !== 'unmatched' ? 'opacity-80' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-ink-soft">{formatDate(t.txn_date)}{t.counterparty ? ` · ${t.counterparty}` : ''}</p>
                    <p className="break-words font-mono text-xs">{t.description}</p>
                  </div>
                  <p className={`font-headline text-lg font-extrabold ${t.direction === 'credit' ? 'text-teal' : 'text-red-700'}`}>
                    {t.direction === 'credit' ? '+' : '−'} {formatIDR(t.amount)}
                  </p>
                </div>
                {t.status === 'unmatched' ? (
                  <div className="mt-3 border-t border-line pt-3">
                    <ActionForm action={matchTransaction} submitLabel="Save" submitClassName="btn-primary btn-sm" inline>
                      <input type="hidden" name="txn_id" value={t.id} />
                      <select name="target" className="input max-w-xl py-1.5" defaultValue={confident.length === 1 ? `${confident[0].kind}:${confident[0].id}` : ''} aria-label="What is this transaction?" required>
                        <option value="">What is this?</option>
                        {cands.length ? (
                          <optgroup label="Suggested matches">
                            {cands.map((c) => (
                              <option key={`${c.kind}:${c.id}`} value={`${c.kind}:${c.id}`}>
                                {c.amount === t.amount ? '✓ ' : ''}{c.label} · {c.detail} · {formatIDR(c.amount)}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                        {t.direction === 'credit' ? (
                          <optgroup label="Other income">
                            {revenueCats.map((c) => <option key={c.id} value={`income:${c.id}`}>Income · {c.name}</option>)}
                          </optgroup>
                        ) : (
                          <optgroup label="Expense with no bill on file">
                            {expenseCats.map((c) => <option key={c.id} value={`expense:${c.id}`}>Expense · {c.name}</option>)}
                          </optgroup>
                        )}
                        <option value="ignore">Ignore (transfer between own accounts, not clinic business…)</option>
                      </select>
                      {t.direction === 'debit' ? <input name="vendor" className="input w-44 py-1.5" placeholder="Paid to (optional)" aria-label="Paid to" /> : null}
                    </ActionForm>
                    {cands.length === 0 ? (
                      <p className="mt-2 text-xs text-ink-soft">
                        No invoice or bill matches this amount. {t.direction === 'credit' ? 'If it’s a patient payment, check the invoice was issued first.' : 'Upload the bill first, or record it as an expense.'}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                    <span>{t.status === 'matched' ? <Pill tone="teal">Matched</Pill> : <Pill>Ignored</Pill>} {t.matched_note}</span>
                    <ActionForm action={unmatchTransaction} submitLabel="Undo" submitClassName="btn-ghost btn-sm" inline confirm="Undo this match? Any payment or expense it created is removed.">
                      <input type="hidden" name="txn_id" value={t.id} />
                    </ActionForm>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
