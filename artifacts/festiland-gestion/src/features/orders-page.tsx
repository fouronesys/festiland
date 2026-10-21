import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetDashboardQueryKey, getListOrdersQueryKey, getListProductsQueryKey, getListSalesQueryKey,
  useCancelOrder, useConvertOrder, useListOrders, useMarkOrderReady, useUpdateOrderSchedule,
} from '@workspace/api-client-react';
import { CalendarClock, Check, FileText, Pencil, Printer, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/states';
import { dateLabel, dateTimeLabel, money, roundMoney, type Role } from '@/lib/access';
import { Receipt } from '@/features/receipt';
import { useToast } from '@/hooks/use-toast';

type PaymentLine = { method: 'cash' | 'card' | 'transfer' | 'credit'; amount: string };
type OrderStatusFilter = '' | 'pending' | 'ready' | 'converted' | 'cancelled';
const statusLabels: Record<string, string> = { pending: 'Pendiente', ready: 'Listo para retirar', converted: 'Convertido a venta', cancelled: 'Cancelado' };
const methodLabels: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', credit: 'Crédito' };
const dateValue = (value: string | Date) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
};

export function OrdersPage({ role }: { role: Role }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OrderStatusFilter>('');
  const [selected, setSelected] = useState<any>(null);
  const [scheduleOrder, setScheduleOrder] = useState<any>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleNote, setScheduleNote] = useState('');
  const [convertOrder, setConvertOrder] = useState<any>(null);
  const [saleReceipt, setSaleReceipt] = useState<any>(null);
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(false);
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [cancelOrder, setCancelOrder] = useState<any>(null);
  const queryParams = useMemo(() => ({ search: search.trim() || undefined, status: status || undefined }), [search, status]);
  const query = useListOrders(queryParams, { query: { queryKey: getListOrdersQueryKey(queryParams), staleTime: 15_000 } });
  const updateSchedule = useUpdateOrderSchedule();
  const markReady = useMarkOrderReady();
  const cancel = useCancelOrder();
  const convert = useConvertOrder();
  const canOperate = ['owner', 'manager', 'cashier'].includes(role);
  const canCancel = ['owner', 'manager'].includes(role);
  const orders = query.data || [];
  useEffect(() => {
    if (!saleReceipt || !autoPrintReceipt) return;
    const timer = window.setTimeout(() => {
      window.print();
      setAutoPrintReceipt(false);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [saleReceipt, autoPrintReceipt]);

  const invalidateRelated = async () => Promise.all([
    getListOrdersQueryKey(), getListProductsQueryKey(), getListSalesQueryKey(), getGetDashboardQueryKey(),
  ].map(queryKey => qc.invalidateQueries({ queryKey })));

  const notifyError = (description: string) => toast({ title: 'No se pudo completar la acción', description, variant: 'destructive' });
  const beginSchedule = (order: any) => {
    setScheduleOrder(order);
    setScheduleDate(dateValue(order.pickupDate));
    setScheduleTime(order.pickupTime || '');
    setScheduleNote(order.note || '');
  };
  const saveSchedule = async (event: FormEvent) => {
    event.preventDefault();
    if (!scheduleOrder || !scheduleDate) return;
    try {
      await updateSchedule.mutateAsync({ orderId: scheduleOrder.id, data: { pickupDate: scheduleDate, pickupTime: scheduleTime || null, note: scheduleNote || null } } as any);
      await invalidateRelated();
      setScheduleOrder(null);
      setSelected(null);
      toast({ title: 'Pedido actualizado', description: 'La fecha, hora y nota quedaron guardadas.' });
    } catch { notifyError('Revisa la fecha, la hora y la conexión.'); }
  };
  const readyOrder = async (order: any) => {
    try {
      await markReady.mutateAsync({ orderId: order.id });
      await invalidateRelated();
      setSelected(null);
      toast({ title: 'Pedido listo', description: `${order.orderNumber} ya está preparado para retirar.` });
    } catch { notifyError('Inténtalo de nuevo en unos momentos.'); }
  };
  const confirmCancel = async () => {
    if (!cancelOrder) return;
    try {
      await cancel.mutateAsync({ orderId: cancelOrder.id, data: { confirmDepositRefund: true } });
      await invalidateRelated();
      setSelected(null);
      setCancelOrder(null);
      toast({ title: 'Pedido cancelado', description: 'El pedido y su reserva de existencias fueron actualizados.' });
    } catch { notifyError('No se pudo cancelar el pedido.'); }
  };
  const beginConvert = (order: any) => {
    setConvertOrder(order);
    setPayments(order.balanceDue > 0 ? [{ method: 'cash', amount: Number(order.balanceDue).toFixed(2) }] : []);
  };
  const paymentTotal = roundMoney(payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0));
  const paymentLinesValid = payments.every(payment => Number(payment.amount) > 0);
  const convertOrderToSale = async (event: FormEvent) => {
    event.preventDefault();
    if (!convertOrder) return;
    const due = Number(convertOrder.balanceDue) || 0;
    if (Math.abs(paymentTotal - due) > 0.005 || !paymentLinesValid) {
      notifyError(`Los pagos deben sumar exactamente ${money(due)}.`);
      return;
    }
    try {
      const sale = await convert.mutateAsync({
        orderId: convertOrder.id,
        data: { payments: payments.filter(line => Number(line.amount) > 0).map(line => ({ method: line.method, amount: roundMoney(Number(line.amount)) })) },
      } as any);
      await invalidateRelated();
      setConvertOrder(null);
      setSelected(null);
      setSaleReceipt(sale);
      setAutoPrintReceipt(true);
      toast({ title: 'Venta registrada', description: `Recibo ${sale.receiptNumber} listo para imprimir.` });
    } catch { notifyError('Verifica que el total de pagos sea igual al saldo pendiente.'); }
  };
  const printOrder = (order: any) => {
    setSelected(order);
    window.setTimeout(() => window.print(), 100);
  };
  const emptyBody = status ? `No hay pedidos en estado “${statusLabels[status]}”.` : 'Los pedidos programados aparecerán aquí al guardarlos desde Caja rápida.';

  if (saleReceipt) return <div className="mx-auto max-w-3xl" data-testid="converted-sale-receipt">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm text-[#82908f]">Venta finalizada</p><h2 className="text-3xl font-bold">Recibo {saleReceipt.receiptNumber}</h2></div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => window.print()} className="gap-2" data-testid="button-print-converted-sale"><Printer size={16}/> Imprimir recibo</Button>
        <Button onClick={() => setSaleReceipt(null)} className="bg-[#bd4778]" data-testid="button-return-orders">Volver a pedidos</Button>
      </div>
    </div>
    <Receipt sale={saleReceipt}/>
    <div className="receipt-print"><Receipt sale={saleReceipt}/></div>
  </div>;

  return <div data-testid="page-orders">
    <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
      <div><p className="text-sm font-medium text-[#82908f]">Agenda de recogidas · Moca</p><h2 className="mt-1 text-3xl font-bold">Pedidos programados</h2><p className="mt-2 max-w-2xl text-sm text-[#788684]">Prepara cada celebración con fecha clara, saldo visible y el siguiente paso a mano.</p></div>
      <div className="flex flex-wrap gap-2 rounded-2xl border border-[#e8e2d6] bg-white p-3 text-xs">
        {(['pending', 'ready', 'converted', 'cancelled'] as const).map(key => <div key={key} className="px-2"><span className="block text-[#899492]">{statusLabels[key]}</span><b className="mt-1 block text-lg text-[#214447]">{orders.filter((order: any) => order.status === key).length}</b></div>)}
      </div>
    </div>
    <div className="mb-4 flex flex-col gap-3 sm:flex-row">
      <label className="relative flex-1"><span className="sr-only">Buscar pedidos</span><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#879291]" size={17}/><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por número o cliente..." className="h-11 border-[#e3ddd1] bg-white pl-10" data-testid="input-orders-search"/></label>
      <label className="sm:w-56"><span className="sr-only">Filtrar por estado</span><select value={status} onChange={event => setStatus(event.target.value as OrderStatusFilter)} className="h-11 w-full rounded-xl border border-[#e3ddd1] bg-white px-3 text-sm font-semibold text-[#43585a] outline-none focus:border-[#bd4778]" data-testid="select-orders-status"><option value="">Todos los estados</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    {query.isLoading ? <LoadingBlock/> : query.isError ? <ErrorBlock retry={query.refetch}/> : !orders.length ? <EmptyState title={search ? 'No hay coincidencias' : 'Todavía no hay pedidos'} body={search ? 'Prueba con otro nombre o número de pedido.' : emptyBody}/> :
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,.85fr)]">
        <section className="space-y-3" aria-label="Lista de pedidos">
          {orders.map((order: any) => <button key={order.id} type="button" onClick={() => setSelected(order)} className={`w-full rounded-2xl border bg-white p-4 text-left transition hover:border-[#d7a3b8] hover:shadow-sm sm:p-5 ${selected?.id === order.id ? 'border-[#bd4778] ring-1 ring-[#bd4778]/20' : 'border-[#e8e2d6]'}`} data-testid={`card-order-${order.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#f8e8ef] text-[#bd4778]"><CalendarClock size={20}/></span><div><b className="block text-lg">{order.orderNumber}</b><span className="text-sm text-[#778583]">{order.customerName || 'Venta al detalle'}</span></div></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${order.status === 'ready' ? 'bg-[#e4f2ec] text-[#327567]' : order.status === 'pending' ? 'bg-[#fcf2d2] text-[#8a6a1b]' : order.status === 'converted' ? 'bg-[#eaf0f2] text-[#4f6f7a]' : 'bg-[#f6e7e7] text-[#a24c4c]'}`} data-testid={`status-order-${order.id}`}>{statusLabels[order.status] || order.status}</span></div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#f0ede7] pt-3 text-sm sm:grid-cols-4"><div><span className="block text-xs text-[#899492]">Recogida</span><b>{dateLabel(order.pickupDate)}</b></div><div><span className="block text-xs text-[#899492]">Hora</span><b>{order.pickupTime || 'Sin hora'}</b></div><div><span className="block text-xs text-[#899492]">Total</span><b>{money(order.total)}</b></div><div><span className="block text-xs text-[#899492]">Pendiente</span><b className={order.balanceDue > 0 ? 'text-[#bd4778]' : 'text-[#327567]'}>{money(order.balanceDue)}</b></div></div>
          </button>)}
        </section>
        {selected && <OrderDetail order={selected} canOperate={canOperate} canCancel={canCancel} onEdit={() => beginSchedule(selected)} onReady={() => readyOrder(selected)} onConvert={() => beginConvert(selected)} onCancel={() => setCancelOrder(selected)} onPrint={() => printOrder(selected)} busy={markReady.isPending} />}
      </div>
    }
    {scheduleOrder && <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#153638]/45 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget) setScheduleOrder(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="schedule-title" className="w-full rounded-t-[24px] bg-[#fffdf8] p-5 shadow-2xl sm:max-w-lg sm:rounded-[24px] sm:p-7" data-testid="dialog-edit-order">
        <div className="mb-5 flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#bd4778]">{scheduleOrder.orderNumber}</p><h3 id="schedule-title" className="mt-1 text-2xl font-bold">Actualizar pedido</h3></div><button type="button" onClick={() => setScheduleOrder(null)} className="rounded-lg p-2 hover:bg-[#f4f0e7]" aria-label="Cerrar" data-testid="button-close-order-edit"><X size={18}/></button></div>
        <form onSubmit={saveSchedule} className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold">Fecha de recogida<Input required type="date" value={scheduleDate} onChange={event => setScheduleDate(event.target.value)} className="h-11" data-testid="input-order-date"/></label>
          <label className="grid gap-1.5 text-sm font-semibold">Hora opcional<Input type="time" value={scheduleTime} onChange={event => setScheduleTime(event.target.value)} className="h-11" data-testid="input-order-time"/></label>
          <label className="grid gap-1.5 text-sm font-semibold sm:col-span-2">Nota<Input maxLength={1000} value={scheduleNote} onChange={event => setScheduleNote(event.target.value)} placeholder="Detalles para preparar el pedido" className="h-11" data-testid="input-order-note"/></label>
          <div className="flex gap-3 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setScheduleOrder(null)} className="h-11 flex-1" data-testid="button-dismiss-order-edit">Volver</Button><Button type="submit" disabled={updateSchedule.isPending || !scheduleDate} className="h-11 flex-1 bg-[#bd4778] hover:bg-[#a83968]" data-testid="button-save-order-edit">{updateSchedule.isPending ? 'Guardando…' : 'Guardar cambios'}</Button></div>
        </form>
      </section>
    </div>}
    {convertOrder && <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#153638]/45 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget) setConvertOrder(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="convert-title" className="w-full rounded-t-[24px] bg-[#fffdf8] p-5 shadow-2xl sm:max-w-lg sm:rounded-[24px] sm:p-7" data-testid="dialog-convert-order">
        <div className="mb-5"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#bd4778]">{convertOrder.orderNumber}</p><h3 id="convert-title" className="mt-1 text-2xl font-bold">Completar venta</h3><p className="mt-2 text-sm text-[#788684]">El depósito ya aplicado es {money(convertOrder.depositAmount)}. Registra exactamente el saldo restante.</p></div>
        <div className="mb-4 flex items-center justify-between rounded-xl bg-[#f3f6f1] p-4"><span className="text-sm font-semibold text-[#657572]">Saldo por cobrar</span><b className="text-xl text-[#214447]" data-testid="text-convert-balance">{money(convertOrder.balanceDue)}</b></div>
        {Number(convertOrder.balanceDue) > 0 ? <form onSubmit={convertOrderToSale} className="space-y-3">
          {payments.map((payment, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2"><label className="grid gap-1 text-xs font-bold text-[#73817f]">Método<select value={payment.method} onChange={event => setPayments(current => current.map((line, i) => i === index ? { ...line, method: event.target.value as PaymentLine['method'] } : line))} className="h-10 rounded-lg border border-[#ded8cc] bg-white px-2 text-sm font-normal text-[#263d40]" data-testid={`select-convert-method-${index}`}>{['cash', 'card', 'transfer', 'credit'].map(method => <option key={method} value={method}>{methodLabels[method]}</option>)}</select></label><label className="grid gap-1 text-xs font-bold text-[#73817f]">Monto<Input type="number" min="0" step="0.01" value={payment.amount} onChange={event => setPayments(current => current.map((line, i) => i === index ? { ...line, amount: event.target.value } : line))} className="h-10" data-testid={`input-convert-amount-${index}`}/></label><button type="button" className="mt-5 grid h-10 w-9 place-items-center rounded-lg text-[#9a777f] hover:bg-[#f8e8ef]" aria-label="Quitar método de pago" onClick={() => setPayments(current => current.filter((_, i) => i !== index))} data-testid={`button-remove-convert-payment-${index}`}><X size={16}/></button></div>)}
          <button type="button" onClick={() => setPayments(current => [...current, { method: 'cash', amount: '' }])} className="text-sm font-bold text-[#bd4778]" data-testid="button-add-convert-payment">+ Agregar otro método</button>
          <div className={`flex justify-between rounded-lg px-3 py-2 text-sm ${Math.abs(paymentTotal - Number(convertOrder.balanceDue)) <= 0.005 ? 'bg-[#e5f2ec] text-[#327567]' : 'bg-[#fff2e9] text-[#9b5d37]'}`} data-testid="text-convert-payment-total"><span>Total recibido</span><b>{money(paymentTotal)} / {money(convertOrder.balanceDue)}</b></div>
          <div className="flex gap-3 pt-2"><Button type="button" variant="outline" onClick={() => setConvertOrder(null)} className="h-11 flex-1" data-testid="button-dismiss-convert">Cancelar</Button><Button type="submit" disabled={convert.isPending || !paymentLinesValid || Math.abs(paymentTotal - roundMoney(Number(convertOrder.balanceDue))) > 0.005} className="h-11 flex-1 bg-[#bd4778] hover:bg-[#a83968]" data-testid="button-confirm-convert">{convert.isPending ? 'Registrando…' : 'Convertir a venta'}</Button></div>
        </form> : <div><p className="mb-4 text-sm text-[#327567]">El pedido está totalmente prepagado. No se requiere otro cobro.</p><div className="flex gap-3"><Button variant="outline" onClick={() => setConvertOrder(null)} className="h-11 flex-1" data-testid="button-dismiss-convert">Cancelar</Button><Button disabled={convert.isPending} onClick={() => convertOrderToSale({ preventDefault() {} } as FormEvent)} className="h-11 flex-1 bg-[#bd4778] hover:bg-[#a83968]" data-testid="button-confirm-convert">{convert.isPending ? 'Registrando…' : 'Convertir a venta'}</Button></div></div>}
      </section>
    </div>}
    {cancelOrder && <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#153638]/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <section role="alertdialog" aria-modal="true" aria-labelledby="cancel-title" className="w-full rounded-t-[24px] bg-[#fffdf8] p-5 shadow-2xl sm:max-w-md sm:rounded-[24px] sm:p-7" data-testid="dialog-cancel-order">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[#bd4778]">Confirmación necesaria</p><h3 id="cancel-title" className="mt-1 text-2xl font-bold">Cancelar {cancelOrder.orderNumber}?</h3>
        <p className="mt-3 rounded-xl border border-[#efd4d4] bg-[#fff2f1] p-4 text-sm leading-6 text-[#754b4a]" data-testid="text-refund-confirmation">El depósito de {money(cancelOrder.depositAmount)} ya fue devuelto por el método de pago original. Esta acción libera la reserva de existencias y no vuelve a procesar el reembolso.</p>
        <div className="mt-5 flex gap-3"><Button variant="outline" onClick={() => setCancelOrder(null)} className="h-11 flex-1" data-testid="button-dismiss-cancel">Conservar pedido</Button><Button disabled={cancel.isPending} onClick={confirmCancel} className="h-11 flex-1 bg-[#a4474d] hover:bg-[#8e3d43]" data-testid="button-confirm-cancel">{cancel.isPending ? 'Cancelando…' : 'Confirmar cancelación'}</Button></div>
      </section>
    </div>}
    {selected && <div className="order-print"><PrintableOrder order={selected}/></div>}
  </div>;
}

function OrderDetail({ order, canOperate, canCancel, onEdit, onReady, onConvert, onCancel, onPrint, busy }: any) {
  return <aside className="rounded-2xl border border-[#e8e2d6] bg-[#fffdf8] p-5 shadow-sm xl:sticky xl:top-[94px] xl:max-h-[calc(100dvh-120px)] xl:overflow-y-auto" data-testid={`panel-order-${order.id}`}>
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-[#bd4778]">Detalle del pedido</p><h3 className="mt-1 text-2xl font-bold">{order.orderNumber}</h3><p className="mt-1 text-sm text-[#7b8987]">{order.customerName || 'Venta al detalle'}</p></div><span className="rounded-full bg-[#fcf2d2] px-3 py-1 text-xs font-bold text-[#8a6a1b]">{statusLabels[order.status]}</span></div>
    <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[#f5f3ec] p-3 text-sm"><div><span className="block text-xs text-[#87918f]">Recogida</span><b>{dateLabel(order.pickupDate)}</b></div><div><span className="block text-xs text-[#87918f]">Hora</span><b>{order.pickupTime || 'Sin hora'}</b></div><div><span className="block text-xs text-[#87918f]">Creado</span><b>{dateTimeLabel(order.createdAt)}</b></div><div><span className="block text-xs text-[#87918f]">Depósito</span><b>{money(order.depositAmount)}</b></div></div>
    <div className="my-4 divide-y divide-[#efebe3] border-y border-[#e8e2d6]">{(order.items || []).map((item: any, index: number) => <div key={`${item.productId}-${index}`} className="flex justify-between gap-4 py-3 text-sm" data-testid={`row-order-item-${index}`}><span className="min-w-0"><b>{item.quantity} × {item.name}</b><small className="mt-1 block text-[#899492]">{item.productType === 'service' ? 'Servicio' : 'Producto'} · {money(item.unitPrice)} c/u</small></span><b className="shrink-0">{money(item.lineTotal)}</b></div>)}</div>
    <dl className="space-y-2 text-sm"><div className="flex justify-between text-[#788684]"><dt>Subtotal</dt><dd>{money(order.subtotal)}</dd></div><div className="flex justify-between text-[#788684]"><dt>Descuento</dt><dd>{money(order.discountAmount)}</dd></div><div className="flex justify-between text-[#788684]"><dt>Impuestos</dt><dd>{money(order.taxAmount)}</dd></div><div className="flex justify-between border-t border-[#e9e4da] pt-2 text-base font-bold"><dt>Total pedido</dt><dd>{money(order.total)}</dd></div><div className="flex justify-between font-bold text-[#bd4778]"><dt>Saldo pendiente</dt><dd>{money(order.balanceDue)}</dd></div></dl>
    {order.depositPayments?.length > 0 && <div className="mt-4 rounded-xl bg-[#f1f8f5] p-3"><b className="text-xs uppercase tracking-wide text-[#4b746b]">Abonos registrados</b>{order.depositPayments.map((payment: any, index: number) => <div key={index} className="mt-2 flex justify-between text-sm"><span>{methodLabels[payment.method]} · {dateTimeLabel(payment.createdAt)}</span><b>{money(payment.amount)}</b></div>)}</div>}
    <div className="mt-4 rounded-xl border border-[#eee8dc] bg-white p-3"><b className="flex items-center gap-2 text-xs uppercase tracking-wide text-[#71807d]"><FileText size={14}/>Nota de preparación</b><p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-[#566664]">{order.note || 'Sin nota.'}</p></div>
    <div className="mt-4 grid grid-cols-2 gap-2">
      <Button variant="outline" onClick={onPrint} className="gap-2" data-testid={`button-print-order-${order.id}`}><Printer size={15}/>Imprimir pedido</Button>
      {canOperate && ['pending', 'ready'].includes(order.status) && <Button variant="outline" onClick={onEdit} className="gap-2" data-testid={`button-edit-order-${order.id}`}><Pencil size={15}/>Reprogramar</Button>}
      {canOperate && order.status === 'pending' && <Button onClick={onReady} disabled={busy} className="gap-2 bg-[#398477] hover:bg-[#2e6e63]" data-testid={`button-ready-order-${order.id}`}><Check size={15}/>Marcar listo</Button>}
      {canOperate && ['pending', 'ready'].includes(order.status) && <Button onClick={onConvert} className="col-span-2 bg-[#bd4778] hover:bg-[#a83968]" data-testid={`button-convert-order-${order.id}`}>Cobrar saldo y convertir a venta</Button>}
      {canCancel && ['pending', 'ready'].includes(order.status) && <Button variant="outline" onClick={onCancel} className="col-span-2 border-[#e4caca] text-[#a4474d] hover:bg-[#fff2f1]" data-testid={`button-cancel-order-${order.id}`}>Cancelar pedido</Button>}
    </div>
  </aside>;
}

function PrintableOrder({ order }: { order: any }) {
  return <article className="mx-auto max-w-[80mm] bg-white p-4 text-[#172d2d]" data-testid="printable-order">
    <p className="mb-3 border-2 border-[#172d2d] p-2 text-center text-[10px] font-black leading-4">PEDIDO / PREFACTURA — NO ES FACTURA NI COMPROBANTE FISCAL</p>
    <div className="border-b border-dashed border-[#999] pb-3 text-center"><h2 className="text-lg font-bold">Festiland</h2><p className="text-xs">Moca, República Dominicana</p><p className="mt-2 text-sm font-bold">{order.orderNumber}</p><p className="text-xs">Recogida: {dateLabel(order.pickupDate)}{order.pickupTime ? ` · ${order.pickupTime}` : ''}</p><p className="text-xs">Cliente: {order.customerName || 'Venta al detalle'}</p></div>
    <div className="space-y-2 py-3 text-xs">{order.items?.map((item: any, index: number) => <div key={index} className="flex justify-between gap-2"><span>{item.quantity} × {item.name}</span><b>{money(item.lineTotal)}</b></div>)}</div>
    <div className="space-y-1 border-t border-dashed border-[#999] pt-2 text-xs"><div className="flex justify-between"><span>Subtotal</span><span>{money(order.subtotal)}</span></div><div className="flex justify-between"><span>Descuento</span><span>{money(order.discountAmount)}</span></div><div className="flex justify-between"><span>Impuestos</span><span>{money(order.taxAmount)}</span></div><div className="flex justify-between border-t border-[#999] pt-2 text-sm font-bold"><span>Total</span><span>{money(order.total)}</span></div><div className="flex justify-between"><span>Abono</span><span>{money(order.depositAmount)}</span></div><div className="flex justify-between font-bold"><span>Saldo</span><span>{money(order.balanceDue)}</span></div></div>
    {order.note && <p className="mt-3 border-t border-dashed border-[#999] pt-2 text-xs">Nota: {order.note}</p>}
    <p className="mt-4 text-center text-[10px]">Documento interno para control de pedido. No es comprobante fiscal.</p>
  </article>;
}
