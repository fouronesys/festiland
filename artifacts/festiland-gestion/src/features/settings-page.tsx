import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import {
  useUpdateStoreSettings, getGetStoreSettingsQueryKey,
  useListAuditLog, getListAuditLogQueryKey, getListJournalEntriesQueryKey,
} from '@workspace/api-client-react';
import { Lock, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { EmptyState, ErrorBlock, LoadingBlock, fieldClass, labelClass } from '@/components/states';
import { can, dateLabel, dateTimeLabel, todayDO, type Role } from '@/lib/access';
import { useStoreSettings } from './receipt';
import { ChangePasswordForm } from './local-auth';
import { OwnerSettings } from './owner-settings';

type StoreForm = { name: string; taxId: string; address: string; phone: string; receiptFooter: string; receiptPaper: '58mm' | '80mm' | 'A4' };

function nextCalendarDay(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export function SettingsPage({ role }: { role?: Role }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const settingsQ = useStoreSettings();
  const update = useUpdateStoreSettings();
  const canEdit = can.editStore(role);
  const canLock = can.lockPeriod(role);
  const form = useForm<StoreForm>({ defaultValues: { name: '', taxId: '', address: '', phone: '', receiptFooter: '', receiptPaper: '80mm' } });
  const [lockDate, setLockDate] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const initialized = useRef(false);
  const store = settingsQ.data;

  useEffect(() => {
    if (store && !initialized.current) {
      initialized.current = true;
      form.reset({ name: store.name, taxId: store.taxId || '', address: store.address || '', phone: store.phone || '', receiptFooter: store.receiptFooter || '', receiptPaper: store.receiptPaper });
      setLockDate(store.lockedThrough || '');
      setPeriodStart(store.accountingPeriodStart || '');
      setPeriodEnd(store.accountingPeriodEnd || '');
    }
  }, [store, form]);

  const afterSave = async (data: any, msg: string) => {
    qc.setQueryData(getGetStoreSettingsQueryKey(), data);
    await qc.invalidateQueries({ queryKey: getListAuditLogQueryKey() });
    toast({ title: msg });
  };
  const fail = (error: unknown) => {
    const data = error && typeof error === 'object' && 'data' in error
      ? (error as { data?: unknown }).data
      : null;
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : 'Revisa los datos o tus permisos.';
    toast({ title: 'No se pudo guardar', description: message, variant: 'destructive' });
  };

  const saveStore = form.handleSubmit(values => {
    if (!values.name.trim()) { form.setError('name', { message: 'El nombre es obligatorio.' }); return; }
    update.mutate({ data: { name: values.name.trim(), taxId: values.taxId.trim() || null, address: values.address.trim() || null, phone: values.phone.trim() || null, receiptFooter: values.receiptFooter, receiptPaper: values.receiptPaper } }, {
      onSuccess: data => afterSave(data, 'Preferencias guardadas'), onError: fail,
    });
  });
  const saveLock = (value: string | null) => update.mutate({ data: { lockedThrough: value } }, {
    onSuccess: async data => { setLockDate(data.lockedThrough || ''); await qc.invalidateQueries({ queryKey: getListJournalEntriesQueryKey() }); await afterSave(data, value ? 'Bloqueo manual aplicado' : 'Bloqueo manual retirado'); },
    onError: fail,
  });
  const savePeriod = () => {
    if (!!periodStart !== !!periodEnd) {
      toast({ title: 'Completa el período', description: 'Indica tanto la fecha de inicio como la fecha de cierre.', variant: 'destructive' });
      return;
    }
    if (periodStart && periodEnd && periodStart > periodEnd) {
      toast({ title: 'Revisa las fechas', description: 'El inicio debe ser anterior o igual al cierre.', variant: 'destructive' });
      return;
    }
    update.mutate({ data: { accountingPeriodStart: periodStart || null, accountingPeriodEnd: periodEnd || null } }, {
      onSuccess: async data => {
        setPeriodStart(data.accountingPeriodStart || '');
        setPeriodEnd(data.accountingPeriodEnd || '');
        setLockDate(data.lockedThrough || '');
        await qc.invalidateQueries({ queryKey: getListJournalEntriesQueryKey() });
        await afterSave(data, 'Período contable guardado');
      },
      onError: fail,
    });
  };
  const periodChanged = !!store && (periodStart !== (store.accountingPeriodStart || '') || periodEnd !== (store.accountingPeriodEnd || ''));
  const closedPeriodEditDenied = !!store?.automaticLockedThrough && role !== 'owner';
  const autoLockDate = store?.accountingPeriodEnd ? nextCalendarDay(store.accountingPeriodEnd) : null;

  if (settingsQ.isLoading) return <LoadingBlock/>;
  if (settingsQ.isError) return <ErrorBlock retry={settingsQ.refetch}/>;

  return <div className="grid max-w-5xl gap-6">
    <div><p className="text-sm text-[#82908f]">Configuración del comercio</p><h2 className="text-3xl font-bold">Preferencias</h2></div>
    <section className="rounded-2xl border border-[#e8e2d6] bg-white p-6">
      <p className="text-xs font-bold uppercase tracking-[.15em] text-[#bd4778]">Datos del comercio</p>
      <h3 className="mt-1 text-xl font-bold">Así aparece en tus recibos</h3>
      {!canEdit && <p className="mt-2 text-sm text-[#82908f]">Solo el propietario o la gerencia pueden modificar estos datos.</p>}
      <Form {...form}><form onSubmit={saveStore} className="mt-5 grid gap-4 sm:grid-cols-2">
        <fieldset disabled={!canEdit || update.isPending} className="contents">
          <label className={labelClass}>Nombre comercial *<Input {...form.register('name')} className="h-11" data-testid="input-store-name"/>{form.formState.errors.name && <span role="alert" className="text-xs text-[#bd4778]">{form.formState.errors.name.message}</span>}</label>
          <label className={labelClass}>RNC<Input {...form.register('taxId')} className="h-11" placeholder="Opcional" data-testid="input-store-taxid"/></label>
          <label className={labelClass}>Teléfono<Input {...form.register('phone')} className="h-11" data-testid="input-store-phone"/></label>
          <label className={labelClass}>Papel de recibo<select {...form.register('receiptPaper')} className={fieldClass} data-testid="select-receipt-paper"><option value="58mm">Térmico · 58 mm</option><option value="80mm">Térmico · 80 mm</option><option value="A4">A4</option></select></label>
          <label className={`${labelClass} sm:col-span-2`}>Dirección<Input {...form.register('address')} className="h-11" data-testid="input-store-address"/></label>
          <label className={`${labelClass} sm:col-span-2`}>Pie del recibo<Textarea {...form.register('receiptFooter')} rows={3} placeholder="Ej. Gracias por celebrar con nosotros." data-testid="input-store-footer"/></label>
          {canEdit && <div className="sm:col-span-2"><Button type="submit" className="gap-2 bg-[#bd4778] hover:bg-[#a83968]" data-testid="button-save-settings"><Save size={16}/>{update.isPending ? 'Guardando…' : 'Guardar preferencias'}</Button></div>}
        </fieldset>
      </form></Form>
      <div className="mt-6 grid gap-3 sm:grid-cols-3 text-sm">
        <Info label="Moneda" value="Peso dominicano · DOP"/><Info label="Zona horaria" value="America/Santo_Domingo"/><Info label="Facturación electrónica" value="No integrada"/>
      </div>
      <p className="mt-4 text-xs leading-5 text-[#83908e]">Los recibos se imprimen con el navegador. En el diálogo de impresión elige la impresora y el tamaño de papel que coincida con el formato seleccionado. Los recibos son documentos internos, no comprobantes fiscales.</p>
    </section>

    <section className="rounded-2xl border border-[#e8e2d6] bg-white p-6" data-testid="section-accounting-period">
      <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fcf2d2] text-[#967422]"><Lock size={18}/></span><div><h3 className="text-xl font-bold">Período contable</h3><p className="text-sm text-[#82908f]">Define el inicio y el último día. El sistema bloqueará automáticamente los asientos del período al comenzar el día siguiente al cierre, según la hora de República Dominicana.</p></div></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>Inicio del período<Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} disabled={!canLock || update.isPending || closedPeriodEditDenied} className="h-11" data-testid="input-accounting-period-start"/></label>
        <label className={labelClass}>Último día del período<Input type="date" value={periodEnd} min={periodStart || undefined} onChange={e => setPeriodEnd(e.target.value)} disabled={!canLock || update.isPending || closedPeriodEditDenied} className="h-11" data-testid="input-accounting-period-end"/></label>
      </div>
      {periodEnd && periodEnd < todayDO() && periodEnd !== store?.accountingPeriodEnd && <p className="mt-3 rounded-xl bg-[#fff7e8] p-3 text-sm text-[#8b6526]">Este período ya terminó. Al guardarlo, el bloqueo automático se aplicará de inmediato hasta {dateLabel(periodEnd + 'T12:00:00')}.</p>}
      {closedPeriodEditDenied && <p className="mt-3 text-sm text-[#967422]">El período ya está cerrado. Solo el propietario puede cambiar su configuración.</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {canLock && <Button disabled={update.isPending || !periodChanged || !!closedPeriodEditDenied} onClick={savePeriod} className="h-11 gap-2 bg-[#214447]" data-testid="button-save-accounting-period"><Save size={16}/>{update.isPending ? 'Guardando…' : 'Guardar período'}</Button>}
        {!canLock && <p className="text-sm text-[#82908f]">Solo propietario o contable pueden definir el período.</p>}
      </div>
      <p className="mt-3 text-sm" data-testid="text-accounting-period-status"><b>Estado del período:</b> {!store?.accountingPeriodStart || !store?.accountingPeriodEnd ? 'sin definir; indica el inicio y el cierre para activar el bloqueo automático.' : store.automaticLockedThrough ? `cerrado automáticamente hasta ${dateLabel(store.automaticLockedThrough + 'T12:00:00')}.` : `abierto; el bloqueo se activará el ${autoLockDate ? dateLabel(autoLockDate + 'T12:00:00') : 'día siguiente al cierre'}.`}</p>
      <p className="mt-1 text-sm" data-testid="text-locked-through"><b>Bloqueo manual vigente:</b> {store?.lockedThrough ? `hasta ${dateLabel(store.lockedThrough + 'T12:00:00')}` : 'ninguno'}.</p>
      <div className="mt-6 border-t border-[#eee8dd] pt-5">
        <h4 className="font-bold">Bloqueo manual adicional</h4>
        <p className="mt-1 text-sm text-[#82908f]">Para bloquear registros antes de que termine el período; solo admite hoy o una fecha anterior.</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className={labelClass}>Bloquear hasta<Input type="date" value={lockDate} max={todayDO()} onChange={e => setLockDate(e.target.value)} disabled={!canLock || update.isPending} className="h-11 w-48" data-testid="input-locked-through"/></label>
          {canLock ? <>
            <Button disabled={!lockDate || update.isPending || lockDate === (store?.lockedThrough || '') || (!can.reopenPeriod(role) && !!store?.lockedThrough && lockDate < store.lockedThrough)} onClick={() => saveLock(lockDate)} className="h-11 bg-[#214447]" data-testid="button-save-lock">Aplicar bloqueo</Button>
            {store?.lockedThrough && can.reopenPeriod(role) && <Button variant="outline" disabled={update.isPending} onClick={() => saveLock(null)} className="h-11" data-testid="button-clear-lock">Quitar bloqueo manual</Button>}
          </> : null}
        </div>
        {canLock && !can.reopenPeriod(role) && store?.lockedThrough && <p className="mt-2 text-xs text-[#967422]" data-testid="text-reopen-owner-only">Solo el propietario puede retirar o retroceder el bloqueo manual.</p>}
      </div>
    </section>

    <section className="rounded-2xl border border-[#e8e2d6] bg-white p-6" data-testid="section-change-password">
      <h3 className="text-xl font-bold">Tu contraseña</h3>
      <p className="mb-4 text-sm text-[#82908f]">Cámbiala cuando quieras. Las contraseñas no se guardan en este navegador.</p>
      <ChangePasswordForm compact/>
    </section>

    <OwnerSettings/>

    {can.audit(role) && <AuditLog/>}
  </div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[#f6f4ed] p-4"><span className="text-xs font-bold uppercase text-[#85918f]">{label}</span><p className="mt-1 font-bold">{value}</p></div>;
}

function AuditLog() {
  const q = useListAuditLog({ query: { queryKey: getListAuditLogQueryKey() } });
  return <section className="rounded-2xl border border-[#e8e2d6] bg-white p-6">
    <h3 className="text-xl font-bold">Bitácora de actividad</h3>
    <p className="mb-4 text-sm text-[#82908f]">Registro de acciones del equipo.</p>
    {q.isLoading ? <LoadingBlock/> : q.isError ? <ErrorBlock retry={q.refetch}/> : !(q.data || []).length ? <EmptyState title="Sin actividad registrada" body="Las acciones del equipo aparecerán aquí."/> :
      <div className="max-h-[480px] overflow-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="sticky top-0 bg-white"><tr className="border-b text-xs uppercase text-[#8a9694]"><th className="pb-3">Fecha</th><th className="pb-3">Persona</th><th className="pb-3">Acción</th><th className="pb-3">Detalle</th></tr></thead>
        <tbody>{q.data!.map(row => <tr key={row.id} className="border-b border-[#f0ede7] last:border-0" data-testid={`row-audit-${row.id}`}><td className="py-3 whitespace-nowrap">{dateTimeLabel(row.createdAt)}</td><td className="font-semibold">{row.actorName}</td><td>{row.action} · <span className="text-[#7c8a88]">{row.entity}</span></td><td className="text-[#7c8a88]">{row.details || '—'}</td></tr>)}</tbody></table></div>}
  </section>;
}
