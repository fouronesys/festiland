import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListCashSessions, getListCashSessionsQueryKey, useOpenCashSession, useCloseCashSession,
  getGetDashboardQueryKey, getListAuditLogQueryKey,
} from '@workspace/api-client-react';
import { History, LockKeyhole, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { EmptyState, ErrorBlock, LoadingBlock, Modal, labelClass } from '@/components/states';
import { dateTimeLabel, money, roundMoney } from '@/lib/access';

/** Barra de estado de caja en el POS. No bloquea la venta: abrir caja es opcional. */
export function CashBar() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useListCashSessions({ query: { queryKey: getListCashSessionsQueryKey() } });
  const openM = useOpenCashSession();
  const closeM = useCloseCashSession();
  const [mode, setMode] = useState<null | 'open' | 'close' | 'history'>(null);
  const sessions = q.data || [];
  const current = sessions.find(s => !s.closedAt);
  const openForm = useForm({ defaultValues: { openingAmount: '' } });
  const closeForm = useForm({ defaultValues: { countedAmount: '', note: '' } });
  const counted = closeForm.watch('countedAmount');
  const diffPreview = current && counted !== '' ? roundMoney(Number(counted) - current.expectedAmount) : null;

  const refresh = () => Promise.all([getListCashSessionsQueryKey(), getGetDashboardQueryKey(), getListAuditLogQueryKey()].map(queryKey => qc.invalidateQueries({ queryKey })));

  const submitOpen = openForm.handleSubmit(v => {
    const amount = roundMoney(Number(v.openingAmount));
    if (v.openingAmount === '' || !(amount >= 0)) { openForm.setError('openingAmount', { message: 'Indica el efectivo inicial (puede ser 0).' }); return; }
    openM.mutate({ data: { openingAmount: amount } }, {
      onSuccess: async () => { await refresh(); setMode(null); openForm.reset(); toast({ title: 'Caja abierta', description: `Fondo inicial ${money(amount)}` }); },
      onError: () => toast({ title: 'No se pudo abrir la caja', description: 'Puede que ya exista una caja abierta.', variant: 'destructive' }),
    });
  });
  const submitClose = closeForm.handleSubmit(v => {
    if (!current) return;
    const amount = roundMoney(Number(v.countedAmount));
    if (v.countedAmount === '' || !(amount >= 0)) { closeForm.setError('countedAmount', { message: 'Indica el efectivo contado.' }); return; }
    closeM.mutate({ sessionId: current.id, data: { countedAmount: amount, note: v.note.trim() || null } }, {
      onSuccess: async s => { await refresh(); setMode('history'); closeForm.reset(); toast({ title: 'Caja cerrada', description: `Diferencia: ${money(s.difference ?? 0)}` }); },
      onError: () => toast({ title: 'No se pudo cerrar la caja', variant: 'destructive' }),
    });
  });

  return <>
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[#e6e0d5] bg-white px-4 py-3 text-sm" data-testid="cash-bar">
      {q.isLoading ? <span className="h-4 w-48 animate-pulse rounded bg-[#eeeae1]"/> : q.isError ? <span className="text-[#bd4778]">No se pudo consultar el estado de caja. <button className="font-bold underline" onClick={() => q.refetch()}>Reintentar</button></span> : current ? <>
        <span className="flex items-center gap-2 font-bold text-[#398477]"><span className="h-2 w-2 rounded-full bg-[#45a18d]"/>Caja abierta</span>
        <span className="text-[#7c8a88]">desde {dateTimeLabel(current.openedAt)} · fondo {money(current.openingAmount)} · esperado <b className="text-[#263d40]" data-testid="text-cash-expected">{money(current.expectedAmount)}</b></span>
      </> : <span className="text-[#7c8a88]">Sin caja abierta. Puedes vender igual; abre caja para controlar el efectivo del turno.</span>}
      <div className="ml-auto flex gap-2">
        {!q.isLoading && !q.isError && (current
          ? <Button size="sm" variant="outline" onClick={() => setMode('close')} className="gap-1.5" data-testid="button-close-cash"><LockKeyhole size={14}/>Cerrar caja</Button>
          : <Button size="sm" onClick={() => setMode('open')} className="gap-1.5 bg-[#214447]" data-testid="button-open-cash"><Unlock size={14}/>Abrir caja</Button>)}
        <Button size="sm" variant="ghost" onClick={() => setMode('history')} className="gap-1.5" data-testid="button-cash-history"><History size={14}/>Historial</Button>
      </div>
    </div>

    {mode === 'open' && <Modal title="Abrir caja" eyebrow="Caja" onClose={() => setMode(null)}>
      <Form {...openForm}><form onSubmit={submitOpen} className="grid gap-4">
        <label className={labelClass}>Efectivo inicial en gaveta (DOP)<Input autoFocus type="number" step="0.01" min="0" {...openForm.register('openingAmount')} className="h-12 text-lg" data-testid="input-opening-amount"/>{openForm.formState.errors.openingAmount && <span role="alert" className="text-xs text-[#bd4778]">{openForm.formState.errors.openingAmount.message}</span>}</label>
        <Button disabled={openM.isPending} className="h-12 bg-[#bd4778] font-bold" data-testid="button-confirm-open-cash">{openM.isPending ? 'Abriendo…' : 'Abrir caja'}</Button>
      </form></Form>
    </Modal>}

    {mode === 'close' && current && <Modal title="Cerrar caja" eyebrow="Conteo de efectivo" onClose={() => setMode(null)}>
      <div className="mb-4 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-[#f6f4ed] p-3"><span className="text-xs text-[#7c8a88]">Fondo inicial</span><b className="block">{money(current.openingAmount)}</b></div><div className="rounded-xl bg-[#f6f4ed] p-3"><span className="text-xs text-[#7c8a88]">Efectivo esperado</span><b className="block">{money(current.expectedAmount)}</b></div></div>
      <Form {...closeForm}><form onSubmit={submitClose} className="grid gap-4">
        <label className={labelClass}>Efectivo contado (DOP)<Input autoFocus type="number" step="0.01" min="0" {...closeForm.register('countedAmount')} className="h-12 text-lg" data-testid="input-counted-amount"/>{closeForm.formState.errors.countedAmount && <span role="alert" className="text-xs text-[#bd4778]">{closeForm.formState.errors.countedAmount.message}</span>}</label>
        {diffPreview !== null && <p className={`rounded-xl p-3 text-sm font-bold ${diffPreview === 0 ? 'bg-[#e5f2ec] text-[#398477]' : 'bg-[#fff1f4] text-[#bd4778]'}`} data-testid="text-cash-diff-preview">{diffPreview === 0 ? 'Cuadra exacto' : diffPreview > 0 ? `Sobrante de ${money(diffPreview)}` : `Faltante de ${money(Math.abs(diffPreview))}`}</p>}
        <label className={labelClass}>Nota<Input {...closeForm.register('note')} placeholder="Opcional" className="h-11" data-testid="input-close-note"/></label>
        <Button disabled={closeM.isPending} className="h-12 bg-[#bd4778] font-bold" data-testid="button-confirm-close-cash">{closeM.isPending ? 'Cerrando…' : 'Cerrar caja'}</Button>
      </form></Form>
    </Modal>}

    {mode === 'history' && <Modal title="Historial de caja" eyebrow="Caja" onClose={() => setMode(null)}>
      {q.isLoading ? <LoadingBlock/> : q.isError ? <ErrorBlock retry={q.refetch}/> : !sessions.length ? <EmptyState title="Sin turnos registrados" body="Los turnos de caja aparecerán aquí."/> :
        <div className="space-y-2">{sessions.map(s => <div key={s.id} className="rounded-xl border border-[#ebe5da] p-3 text-sm" data-testid={`row-cash-session-${s.id}`}>
          <div className="flex justify-between gap-2"><b>{dateTimeLabel(s.openedAt)}</b><span className={s.closedAt ? 'text-[#7c8a88]' : 'font-bold text-[#398477]'}>{s.closedAt ? `Cerrada ${dateTimeLabel(s.closedAt)}` : 'Abierta'}</span></div>
          <div className="mt-1 flex flex-wrap gap-x-4 text-[#7c8a88]"><span>Fondo {money(s.openingAmount)}</span><span>Esperado {money(s.expectedAmount)}</span>{s.countedAmount !== null && <span>Contado {money(s.countedAmount)}</span>}{s.difference !== null && <b className={s.difference === 0 ? 'text-[#398477]' : 'text-[#bd4778]'}>Diferencia {money(s.difference)}</b>}</div>
          {s.note && <p className="mt-1 text-xs text-[#7c8a88]">{s.note}</p>}
        </div>)}</div>}
    </Modal>}
  </>;
}
