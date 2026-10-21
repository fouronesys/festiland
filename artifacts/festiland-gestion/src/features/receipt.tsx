import { useEffect } from 'react';
import { useGetStoreSettings, getGetStoreSettingsQueryKey } from '@workspace/api-client-react';
import { dateTimeLabel, money } from '@/lib/access';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const paperWidth = (paper?: string) => paper === 'A4' ? '190mm' : paper === '58mm' ? '58mm' : '80mm';

export function useStoreSettings() {
  return useGetStoreSettings({ query: { queryKey: getGetStoreSettingsQueryKey(), staleTime: 60_000 } });
}

export function Receipt({ sale }: { sale: any }) {
  const { data: store } = useStoreSettings();
  useEffect(() => {
    document.documentElement.style.setProperty('--receipt-width', paperWidth(store?.receiptPaper));
  }, [store?.receiptPaper]);
  return <article className="mx-auto rounded-2xl border border-[#e8e2d6] bg-white p-7 shadow-sm" data-testid="receipt">
    <div className="border-b border-dashed border-[#d9d2c5] pb-5 text-center">
      <img src={`${basePath}/brand/festiland-logo.png`} className="mx-auto mb-2 h-14 w-14 rounded-full object-cover" alt=""/>
      <h3 className="font-display text-xl font-bold" data-testid="text-receipt-store">{store?.name || 'Festiland'}</h3>
      {store?.taxId && <p className="text-xs">RNC: {store.taxId}</p>}
      {store?.address && <p className="text-xs text-[#81908e]">{store.address}</p>}
      {store?.phone && <p className="text-xs text-[#81908e]">Tel. {store.phone}</p>}
      <p className="mt-3 text-xs">RECIBO {sale.receiptNumber}</p>
      <p className="mt-1 text-xs">{dateTimeLabel(sale.createdAt)}</p>
      {sale.customerName && <p className="mt-1 text-xs">Cliente: {sale.customerName}</p>}
    </div>
    <div className="space-y-3 py-5">{sale.items?.map((item: any, i: number) => <div className="flex justify-between gap-4 text-sm" key={item.productId || i}><span>{item.quantity} × {item.name}</span><b>{money(item.lineTotal)}</b></div>)}</div>
    <div className="space-y-2 border-t border-dashed border-[#d9d2c5] pt-4 text-sm">
      <div className="flex justify-between"><span>Subtotal</span><span>{money(sale.subtotal)}</span></div>
      <div className="flex justify-between"><span>Descuento</span><span>{money(sale.discountAmount)}</span></div>
      <div className="flex justify-between"><span>Impuestos</span><span>{money(sale.taxAmount)}</span></div>
      <div className="flex justify-between border-t border-[#ebe6de] pt-3 text-lg font-bold"><span>Total</span><span>{money(sale.total)}</span></div>
    </div>
    <p className="mt-5 text-center text-xs text-[#83908e]">Pago: {sale.paymentSummary}</p>
    <p className="mt-2 whitespace-pre-line text-center text-xs text-[#83908e]">{store?.receiptFooter || 'Gracias por su compra.'}</p>
    <p className="mt-2 text-center text-[10px] text-[#a0a9a7]">Documento interno; no es comprobante fiscal electrónico.</p>
  </article>;
}
