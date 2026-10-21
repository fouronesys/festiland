import type { ReactNode } from 'react';
import { CircleHelp, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LoadingBlock() {
  return <div className="space-y-3 rounded-2xl border border-[#e8e2d6] bg-white p-5" aria-label="Cargando" aria-busy="true"><div className="h-5 w-40 animate-pulse rounded bg-[#eeeae1]"/><div className="h-12 animate-pulse rounded-xl bg-[#f2efe8]"/><div className="h-12 animate-pulse rounded-xl bg-[#f2efe8]"/><div className="h-12 animate-pulse rounded-xl bg-[#f2efe8]"/></div>;
}

export function ErrorBlock({ retry, message }: { retry: () => void; message?: string }) {
  return <div className="rounded-2xl border border-[#f0d6d8] bg-[#fff6f4] p-8 text-center" role="alert"><CircleHelp className="mx-auto text-[#bd6a6a]"/><h3 className="mt-3 font-bold">No pudimos cargar la información</h3><p className="mt-1 text-sm text-[#87918e]">{message || 'Comprueba tu conexión e inténtalo otra vez.'}</p><Button variant="outline" className="mt-4" onClick={() => retry()} data-testid="button-retry">Volver a intentar</Button></div>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-[#dcd6ca] bg-white/70 px-6 py-14 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f1ec] text-[#398477]"><ShoppingBag size={20}/></span><h3 className="mt-4 text-lg font-bold">{title}</h3><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[#83908e]">{body}</p>{action && <div className="mt-4">{action}</div>}</div>;
}

export function Modal({ title, eyebrow, onClose, children }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#153638]/45 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[24px] bg-[#fffdf8] p-5 shadow-2xl sm:max-w-xl sm:rounded-[24px] sm:p-7" role="dialog" aria-modal="true" aria-label={title}>
      <div className="mb-5 flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#bd4778]">{eyebrow || 'Festiland · Gestión'}</p><h2 className="mt-1 text-2xl font-bold">{title}</h2></div><button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 hover:bg-[#f4f0e7]" data-testid="button-close-modal">×</button></div>
      {children}
    </section>
  </div>;
}

export const fieldClass = 'h-11 rounded-xl border border-[#ded8cc] bg-white px-3 font-normal outline-none focus:border-[#bd4778]';
export const labelClass = 'grid gap-1.5 text-sm font-semibold text-[#43585a]';
