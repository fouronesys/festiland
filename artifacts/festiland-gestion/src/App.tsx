import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Route, Switch, Redirect, Router as WouterRouter, Link, useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import {
  useGetDashboard, getGetDashboardQueryKey,
  useListProducts, getListProductsQueryKey,
  useListSales, getListSalesQueryKey, useCreateSale, useRefundSale,
  useListInventoryAdjustments, getListInventoryAdjustmentsQueryKey, useCreateInventoryAdjustment,
  useListCustomers, getListCustomersQueryKey, useCreateCustomer,
  useListSuppliers, getListSuppliersQueryKey, useCreateSupplier,
  useListTaxRates, getListTaxRatesQueryKey, useUpdateTaxRate,
  useListExpenses, getListExpensesQueryKey, useCreateExpense,
  useListAccounts, getListAccountsQueryKey, useCreateAccount,
  useListJournalEntries, getListJournalEntriesQueryKey, useCreateJournalEntry,
  useListPurchases, getListPurchasesQueryKey, useCreatePurchase,
  useGetFinancialReport, getGetFinancialReportQueryKey,
  type TeamUser,
  useListSettlements, getListSettlementsQueryKey, useCreateSettlement,
} from '@workspace/api-client-react';
import {
  Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, Banknote, BarChart3, Boxes,
  BriefcaseBusiness, CalendarDays, Check, ClipboardList,
  FileBarChart, Gift, LayoutDashboard, LogOut, Menu,
  Package, Plus, Printer, Search, Settings, ShieldCheck, ShoppingBag, ShoppingCart,
  Tags, Users, Wallet, X, Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form } from '@/components/ui/form';
import { LoadingBlock, ErrorBlock, EmptyState } from '@/components/states';
import { can, homeFor, downloadCsv, todayDO, roundMoney, money, dateLabel, type Role } from '@/lib/access';
import { Receipt, useStoreSettings } from '@/features/receipt';
import { SettingsPage } from '@/features/settings-page';
import { CashBar } from '@/features/cash-panel';
import { ProductEditor, TaxEditor } from '@/features/editors';
import { useToast } from '@/hooks/use-toast';
import { AuthProvider, AuthGate, SignInScreen, SignUpNotice, useAuth } from '@/features/local-auth';
import { TeamPage } from '@/features/team-page';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
type Field = { name: string; label: string; type?: string; options?: string[]; required?: boolean; placeholder?: string };
const routes = [
  { path: '/dashboard', label: 'Resumen', icon: LayoutDashboard, group: 'Inicio' },
  { path: '/pos', label: 'Caja rápida', icon: ShoppingCart, group: 'Ventas' },
  { path: '/sales', label: 'Ventas', icon: ShoppingBag, group: 'Ventas' },
  { path: '/products', label: 'Productos', icon: Package, group: 'Catálogo' },
  { path: '/inventory', label: 'Inventario', icon: Boxes, group: 'Catálogo' },
  { path: '/customers', label: 'Clientes', icon: Users, group: 'Contactos' },
  { path: '/suppliers', label: 'Proveedores', icon: BriefcaseBusiness, group: 'Contactos' },
  { path: '/purchases', label: 'Compras', icon: ClipboardList, group: 'Operación' },
  { path: '/expenses', label: 'Gastos', icon: Wallet, group: 'Operación' },
  { path: '/accounting', label: 'Contabilidad', icon: FileBarChart, group: 'Finanzas' },
  { path: '/taxes', label: 'Impuestos', icon: Tags, group: 'Finanzas' },
  { path: '/team', label: 'Equipo', icon: ShieldCheck, group: 'Administración' },
  { path: '/settings', label: 'Preferencias', icon: Settings, group: 'Administración' },
];
const fieldSet: Record<string, Field[]> = {
  '/customers': [{ name: 'name', label: 'Nombre', required: true }, { name: 'phone', label: 'Teléfono' }, { name: 'email', label: 'Correo' }, { name: 'taxId', label: 'RNC / Cédula' }, { name: 'address', label: 'Dirección' }, { name: 'notes', label: 'Notas' }],
  '/suppliers': [{ name: 'name', label: 'Nombre del proveedor', required: true }, { name: 'phone', label: 'Teléfono' }, { name: 'email', label: 'Correo' }, { name: 'taxId', label: 'RNC' }, { name: 'address', label: 'Dirección' }, { name: 'notes', label: 'Notas' }],
  '/inventory': [{ name: 'productId', label: 'Producto', options: [] }, { name: 'quantityChange', label: 'Cantidad (+/-)', type: 'number', required: true }, { name: 'reason', label: 'Motivo', options: ['count', 'damage', 'loss', 'correction', 'return'] }, { name: 'note', label: 'Nota' }],
  '/expenses': [{ name: 'description', label: 'Descripción', required: true }, { name: 'accountId', label: 'Cuenta contable', options: [] }, { name: 'amount', label: 'Monto (DOP)', type: 'number', required: true }, { name: 'paymentMethod', label: 'Método de pago', options: ['cash', 'card', 'transfer', 'payable'] }, { name: 'supplierId', label: 'Proveedor (opcional)', options: [] }, { name: 'note', label: 'Nota' }],
  '/accounting': [{ name: 'code', label: 'Código de cuenta', required: true }, { name: 'name', label: 'Nombre de cuenta', required: true }, { name: 'type', label: 'Tipo', options: ['asset', 'liability', 'equity', 'revenue', 'expense'] }],
  '/purchases': [{ name: 'supplierId', label: 'Proveedor', options: [] }, { name: 'productId', label: 'Producto', options: [] }, { name: 'quantity', label: 'Cantidad', type: 'number', required: true }, { name: 'unitCost', label: 'Costo unitario (DOP)', type: 'number', required: true }, { name: 'paymentMethod', label: 'Pago', options: ['cash', 'card', 'transfer', 'payable'] }, { name: 'note', label: 'Nota' }],
};

function Home() {
  return <main className="min-h-[100dvh] bg-[#f8f5ed] text-[#263d40]">
    <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
      <img src={`${basePath}/brand/festiland-logo.png`} className="h-14 w-14 object-cover rounded-full" alt="Festiland" />
      <div className="flex gap-3"><Link href="/sign-in" className="rounded-xl bg-[#bd4778] px-4 py-2 text-sm font-bold text-white" data-testid="link-signin">Iniciar sesión</Link></div>
    </header>
    <section className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-16 pt-6 md:grid-cols-[1.02fr_.98fr] md:pb-28">
      <div className="page-enter">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#d8e4df] bg-white/75 px-4 py-2 text-xs font-bold uppercase tracking-[.16em] text-[#398477]"><Gift size={15}/> La tienda detrás de cada celebración</div>
        <h1 className="max-w-2xl text-5xl font-bold leading-[1.02] md:text-7xl">Tu tienda, lista para <span className="text-[#bd4778]">celebrar.</span></h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-[#657577]">Ventas ágiles, inventario en orden y números claros. Festiland Gestión reúne lo esencial para que cada detalle de tu negocio brille.</p>
        <div className="mt-8 flex flex-wrap gap-3"><Link href="/sign-in" className="inline-flex items-center gap-3 rounded-xl bg-[#bd4778] px-6 py-4 font-bold text-white shadow-lg shadow-[#bd4778]/20" data-testid="link-get-started">Entrar a mi comercio <ArrowRight size={18}/></Link><a href="#herramientas" className="rounded-xl border border-[#d9d4c8] bg-white px-6 py-4 font-bold">Conoce las herramientas</a></div>
        <div className="mt-10 flex items-center gap-6 text-sm text-[#647678]"><span className="flex items-center gap-2"><Check size={16} className="text-[#388477]"/> Diseñado para el día a día</span><span>Precios en DOP</span></div>
      </div>
      <div className="relative">
        <div className="absolute -right-4 -top-4 h-32 w-32 rounded-full bg-[#f6d56a] opacity-60 blur-2xl"/>
        <div className="relative overflow-hidden rounded-[2rem] border-[10px] border-white shadow-2xl shadow-[#415552]/15">
          <img src={`${basePath}/brand/interior.jpg`} alt="Interior de la tienda Festiland" className="h-[430px] w-full object-cover object-center"/>
          <div className="absolute inset-x-4 bottom-4 flex items-center justify-between rounded-2xl bg-[#fffdf4]/95 p-4 shadow-lg backdrop-blur"><div><p className="text-xs font-semibold uppercase tracking-wider text-[#7c8987]">Todo bajo control</p><p className="mt-1 font-bold">Caja · Inventario · Compras</p></div><div className="grid h-12 w-12 place-items-center rounded-xl bg-[#f8e5ed] text-[#bd4778]"><BarChart3/></div></div>
        </div>
        <div className="absolute -bottom-8 -left-6 hidden w-48 overflow-hidden rounded-2xl border-4 border-white shadow-xl md:block"><img src={`${basePath}/brand/storefront.jpg`} alt="Fachada de Festiland" className="h-36 w-full object-cover"/></div>
      </div>
    </section>
    <section id="herramientas" className="bg-[#214447] px-6 py-16 text-white">
      <div className="mx-auto max-w-7xl"><p className="text-xs font-bold uppercase tracking-[.22em] text-[#f1d25d]">Un negocio que fluye</p><h2 className="mt-3 max-w-2xl text-4xl font-bold">Menos vueltas en la caja. Más tiempo para lo importante.</h2><div className="mt-10 grid gap-5 md:grid-cols-3"><Feature icon={<ShoppingCart/>} title="Venta sin fricción" body="Busca, escanea y cobra. Un flujo claro para todo el equipo."/><Feature icon={<Boxes/>} title="Existencias al día" body="Movimientos y alertas para saber qué reponer antes de que falte."/><Feature icon={<FileBarChart/>} title="Cuentas claras" body="Compras, gastos e informes financieros en un solo lugar."/></div></div>
    </section>
    <footer className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-8 text-sm text-[#687779] md:flex-row md:justify-between"><span>Festiland Gestión · Santo Domingo, República Dominicana</span><span>Hecho para que cada celebración comience bien.</span></footer>
  </main>;
}
function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <article className="rounded-2xl border border-white/10 bg-white/[.06] p-6"><div className="grid h-11 w-11 place-items-center rounded-xl bg-[#f1d25d] text-[#214447]">{icon}</div><h3 className="mt-5 text-xl font-bold">{title}</h3><p className="mt-2 leading-6 text-white/65">{body}</p></article>;
}

function AppShell({ me }: { me: TeamUser }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { logout, loggingOut } = useAuth();
  const role: Role = me.role;
  const fin = can.finance(role);
  const [editingProduct, setEditingProduct] = useState<any>(undefined);
  const [editingTax, setEditingTax] = useState<any>(undefined);
  const { data: dashboard, isLoading: dashLoading, isError: dashError, refetch: retryDash } = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey(), enabled: can.route(role, '/dashboard') } });
  const searchParams = useMemo(() => ({ search: search || undefined }), [search]);
  const productsQ = useListProducts(searchParams, { query: { queryKey: getListProductsQueryKey(searchParams) } });
  const salesQ = useListSales(searchParams, { query: { queryKey: getListSalesQueryKey(searchParams) } });
  const adjustmentsQ = useListInventoryAdjustments({ query: { queryKey: getListInventoryAdjustmentsQueryKey(), enabled: can.route(role, '/inventory') } });
  const customersQ = useListCustomers(searchParams, { query: { queryKey: getListCustomersQueryKey(searchParams) } });
  const suppliersQ = useListSuppliers(searchParams, { query: { queryKey: getListSuppliersQueryKey(searchParams), enabled: can.route(role, '/suppliers') } });
  const taxesQ = useListTaxRates({ query: { queryKey: getListTaxRatesQueryKey() } });
  const expensesQ = useListExpenses({ query: { queryKey: getListExpensesQueryKey(), enabled: fin } });
  const accountsQ = useListAccounts({ query: { queryKey: getListAccountsQueryKey(), enabled: fin } });
  const journalQ = useListJournalEntries({ query: { queryKey: getListJournalEntriesQueryKey(), enabled: fin } });
  const purchasesQ = useListPurchases({ query: { queryKey: getListPurchasesQueryKey(), enabled: can.purchases(role) } });
  const [range, setRange] = useState(() => ({ from: todayDO().slice(0, 8) + '01', to: todayDO() }));
  const reportQ = useGetFinancialReport(range, { query: { queryKey: getGetFinancialReportQueryKey(range), enabled: fin && !!range.from && !!range.to && range.from <= range.to } });
  
  const createSale = useCreateSale(); const refundSale = useRefundSale();
  const createAdjustment = useCreateInventoryAdjustment(); const createCustomer = useCreateCustomer();
  const createSupplier = useCreateSupplier(); const updateTax = useUpdateTaxRate();
  const createExpense = useCreateExpense(); const createAccount = useCreateAccount();
  const createJournal = useCreateJournalEntry(); const createPurchase = useCreatePurchase();
 
  const invalidate = async (...keys: (readonly unknown[])[]) => Promise.all(keys.map(queryKey => qc.invalidateQueries({ queryKey })));
  const activePath = location === '/' ? homeFor(role) : location;
  const title = routes.find(item => item.path === activePath)?.label || 'Festiland';
  const form = useForm<Record<string, any>>({ defaultValues: { productType: 'product', unit: 'unidad', reason: 'count', paymentMethod: 'cash', type: 'asset', role: 'cashier' } });
  const currentFields = fieldSet[activePath] || [];
  const addLabel: Record<string, string> = { '/products': 'Agregar producto', '/inventory': 'Registrar movimiento', '/customers': 'Nuevo cliente', '/suppliers': 'Nuevo proveedor', '/taxes': 'Crear tasa', '/expenses': 'Registrar gasto', '/accounting': 'Nueva cuenta', '/purchases': 'Nueva compra' };
  const allowedAdd: Record<string, boolean> = { '/products': can.editProducts(role), '/inventory': can.adjustInventory(role), '/customers': can.createCustomer(role), '/suppliers': can.createSupplier(role), '/taxes': can.editTaxes(role), '/expenses': fin, '/accounting': can.postJournal(role), '/purchases': can.purchases(role) };

  const submitModal = form.handleSubmit(async values => {
    try {
      if (activePath === '/inventory') {
        await createAdjustment.mutateAsync({ data: { ...values, quantityChange: Number(values.quantityChange), note: values.note || null } } as any);
        await invalidate(getListInventoryAdjustmentsQueryKey(), getListProductsQueryKey());
      } else if (activePath === '/customers') {
        await createCustomer.mutateAsync({ data: { ...values, email: values.email || null, phone: values.phone || null, taxId: values.taxId || null, address: values.address || null, notes: values.notes || null } } as any);
        await invalidate(getListCustomersQueryKey());
      } else if (activePath === '/suppliers') {
        await createSupplier.mutateAsync({ data: { ...values, email: values.email || null, phone: values.phone || null, taxId: values.taxId || null, address: values.address || null, notes: values.notes || null } } as any);
        await invalidate(getListSuppliersQueryKey());
      } else if (activePath === '/expenses') {
        await createExpense.mutateAsync({ data: { ...values, amount: Number(values.amount), supplierId: values.supplierId || null } } as any);
        await invalidate(getListExpensesQueryKey(), getListAccountsQueryKey(), getGetFinancialReportQueryKey(), getGetDashboardQueryKey());
      } else if (activePath === '/accounting') {
        await createAccount.mutateAsync({ data: values } as any);
        await invalidate(getListAccountsQueryKey());
      } else if (activePath === '/purchases') {
        await createPurchase.mutateAsync({ data: { supplierId: values.supplierId, items: [{ productId: values.productId, quantity: Number(values.quantity), unitCost: Number(values.unitCost) }], paymentMethod: values.paymentMethod || 'cash', note: values.note || null } } as any);
        await invalidate(getListPurchasesQueryKey(), getListProductsQueryKey(), getListAccountsQueryKey());
      }
      toast({ title: 'Cambios guardados', description: 'La información quedó actualizada.' });
      setModal(false); form.reset();
    } catch {
      toast({ title: 'No se pudo guardar', description: 'Revisa los datos e inténtalo de nuevo.', variant: 'destructive' });
    }
  });
  const busy = createAdjustment.isPending || createCustomer.isPending || createSupplier.isPending || createExpense.isPending || createAccount.isPending || createPurchase.isPending;
  const openModal = () => {
    if (activePath === '/products') { setEditingProduct(null); return; }
    if (activePath === '/taxes') { setEditingTax(null); return; }
    form.reset({ productType: 'product', unit: 'unidad', reason: 'count', paymentMethod: 'cash', type: 'asset', role: 'cashier', inclusive: 'No' });
    setModal(true);
  };
  const products = productsQ.data || [];
  const customers = customersQ.data || [];
  const suppliers = suppliersQ.data || [];
  const accounts = accountsQ.data || [];
  const dataForPage = () => {
    switch (activePath) {
      case '/products': return { query: productsQ, rows: products, columns: ['Producto', 'SKU', 'Categoría', 'Precio', 'Existencia', 'Estado'] };
      case '/sales': return { query: salesQ, rows: salesQ.data || [], columns: ['Recibo', 'Cliente', 'Fecha', 'Artículos', 'Total', 'Estado'] };
      case '/inventory': return { query: adjustmentsQ, rows: adjustmentsQ.data || [], columns: ['Producto', 'Motivo', 'Cambio', 'Fecha', 'Nota'] };
      case '/customers': return { query: customersQ, rows: customers, columns: ['Cliente', 'Teléfono', 'Correo', 'Por cobrar'] };
      case '/suppliers': return { query: suppliersQ, rows: suppliers, columns: ['Proveedor', 'Teléfono', 'Correo', 'Por pagar'] };
      case '/purchases': return { query: purchasesQ, rows: purchasesQ.data || [], columns: ['Proveedor', 'Fecha', 'Artículos', 'Total', 'Estado'] };
      case '/expenses': return { query: expensesQ, rows: expensesQ.data || [], columns: ['Descripción', 'Proveedor', 'Cuenta', 'Fecha', 'Monto', 'Estado'] };
      case '/taxes': return { query: taxesQ, rows: taxesQ.data || [], columns: ['Tasa', 'Porcentaje', 'Modalidad', 'Estado'] };
      default: return null;
    }
  };

  const renderRows = (rows: any[]) => rows.map((row: any, i: number) => {
    if (activePath === '/products') return <tr key={row.id} data-testid={`row-product-${row.id}`}><td><b>{row.name}</b><small>{row.barcode || 'Sin código de barras'}</small></td><td>{row.sku || '—'}</td><td>{row.category}</td><td className="font-semibold">{money(row.price)}</td><td><span className={row.stock <= row.minStock ? 'text-[#bd4778] font-bold' : ''}>{row.stock} {row.unit}</span></td><td><div className="flex items-center gap-3"><Status text={row.active ? 'Activo' : 'Inactivo'} positive={row.active}/>{can.editProducts(role) && <button className="text-xs font-bold text-[#bd4778]" onClick={() => setEditingProduct(row)} data-testid={`button-edit-product-${row.id}`}>Editar</button>}</div></td></tr>;
    if (activePath === '/sales') return <tr key={row.id}><td><b>{row.receiptNumber}</b></td><td>{row.customerName || 'Venta al detalle'}</td><td>{dateLabel(row.createdAt)}</td><td>{row.items?.length || 0}</td><td className="font-semibold">{money(row.total)}</td><td><div className="flex items-center gap-2"><Status text={row.status === 'completed' ? 'Completada' : row.status === 'refunded' ? 'Devuelta' : 'Parcial'} positive={row.status === 'completed'}/>{row.status === 'completed' && can.refund(role) && <button className="text-xs font-bold text-[#bd4778]" onClick={() => { const reason = window.prompt('Motivo de la devolución'); if (reason) refundSale.mutate({ saleId: row.id, data: { reason } } as any, { onSuccess: () => invalidate(getListSalesQueryKey(), getGetDashboardQueryKey(), getListProductsQueryKey()) }); }} data-testid={`button-refund-${row.id}`}>Devolver</button>}</div></td></tr>;
    if (activePath === '/inventory') return <tr key={row.id}><td><b>{row.productName}</b></td><td>{reasonText(row.reason)}</td><td className={row.quantityChange > 0 ? 'text-[#398477] font-bold' : 'text-[#bd4778] font-bold'}>{row.quantityChange > 0 ? '+' : ''}{row.quantityChange}</td><td>{dateLabel(row.createdAt)}</td><td>{row.note || '—'}</td></tr>;
    if (activePath === '/customers' || activePath === '/suppliers') return <tr key={row.id}><td><b>{row.name}</b><small>{row.taxId || 'Sin RNC / cédula'}</small></td><td>{row.phone || '—'}</td><td>{row.email || '—'}</td><td>{money(row.balance)}</td></tr>;
    if (activePath === '/purchases') return <tr key={row.id}><td><b>{row.supplierName}</b></td><td>{dateLabel(row.createdAt)}</td><td>{row.itemCount}</td><td className="font-semibold">{money(row.total)}</td><td><Status text={row.status === 'paid' ? 'Pagada' : 'Pendiente'} positive={row.status === 'paid'}/></td></tr>;
    if (activePath === '/expenses') return <tr key={row.id}><td><b>{row.description}</b></td><td>{row.supplierName || '—'}</td><td>{accounts.find((a: any) => a.id === row.accountId)?.name || '—'}</td><td>{dateLabel(row.createdAt)}</td><td>{money(row.amount)}</td><td><Status text={row.status === 'paid' ? 'Pagado' : 'Pendiente'} positive={row.status === 'paid'}/></td></tr>;
    if (activePath === '/taxes') return <tr key={row.id}><td><b>{row.name}</b></td><td>{row.rate}%</td><td>{row.inclusive ? 'Incluido en precio' : 'Adicional'}</td><td><div className="flex items-center gap-3">{can.editTaxes(role) ? <button className="text-xs font-bold" onClick={() => updateTax.mutate({ taxRateId: row.id, data: { active: !row.active } }, { onSuccess: () => invalidate(getListTaxRatesQueryKey(), getListProductsQueryKey()) })} aria-label={row.active ? 'Desactivar tasa' : 'Activar tasa'} data-testid={`button-toggle-tax-${row.id}`}><Status text={row.active ? 'Activa' : 'Inactiva'} positive={row.active}/></button> : <Status text={row.active ? 'Activa' : 'Inactiva'} positive={row.active}/>}{can.editTaxes(role) && <button className="text-xs font-bold text-[#bd4778]" onClick={() => setEditingTax(row)} data-testid={`button-edit-tax-${row.id}`}>Editar</button>}</div></td></tr>;
    return <tr key={row.id || i}><td>{row.name || '—'}</td></tr>;
  });

  return <div className="min-h-[100dvh] bg-[#f6f4ed] text-[#263d40]">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[258px] flex-col bg-[#214447] text-[#f6f3e9] transition-transform duration-300 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[82px] items-center justify-between border-b border-white/10 px-5"><Link href={homeFor(role)} className="flex items-center gap-3" data-testid="link-brand"><img src={`${basePath}/brand/festiland-logo.png`} alt="Festiland" className="h-12 w-12 rounded-full bg-white object-cover"/><span><strong className="block font-display text-lg leading-5">Festiland</strong><small className="text-xs text-white/55">GESTIÓN</small></span></Link><button className="md:hidden" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú"><X/></button></div>
      <nav className="flex-1 overflow-y-auto px-3 py-5">{['Inicio', 'Ventas', 'Catálogo', 'Contactos', 'Operación', 'Finanzas', 'Administración'].filter(group => routes.some(r => r.group === group && can.route(role, r.path))).map(group => <div key={group} className="mb-5"><p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.18em] text-white/40">{group}</p>{routes.filter(item => item.group === group && can.route(role, item.path)).map(item => <Link key={item.path} href={item.path} onClick={() => setMobileOpen(false)} data-testid={`nav-${item.path.slice(1)}`} className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${activePath === item.path ? 'bg-[#f6d76a] text-[#214447]' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}><item.icon size={18} strokeWidth={1.8}/>{item.label}{item.path === '/pos' && <span className="ml-auto rounded-md bg-[#bd4778] px-1.5 py-0.5 text-[9px] text-white">POS</span>}</Link>)}</div>)}</nav>
      <div className="border-t border-white/10 p-4"><div className="mb-3 flex items-center gap-3 rounded-xl bg-white/[.07] p-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-[#d96891] font-bold text-white">{(me.name || me.email || 'F').slice(0, 1).toUpperCase()}</div><div className="min-w-0"><b className="block truncate text-sm">{me.name || me.email}</b><small className="text-white/55">{roleName(role)}</small></div></div><button disabled={loggingOut} onClick={() => logout()} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/65 hover:bg-white/10" data-testid="button-signout"><LogOut size={16}/>Cerrar sesión</button></div>
    </aside>
    {mobileOpen && <button aria-label="Cerrar navegación" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-[#143437]/40 md:hidden"/>}
    <div className="min-h-[100dvh] md:pl-[258px]">
      <header className="sticky top-0 z-20 flex h-[74px] items-center justify-between border-b border-[#e7e1d5] bg-[#f9f7f1]/95 px-4 backdrop-blur md:px-8">
        <div className="flex items-center gap-3"><button onClick={() => setMobileOpen(true)} aria-label="Abrir menú" className="rounded-lg p-2 hover:bg-white md:hidden"><Menu/></button><div><p className="text-xs text-[#899392]">Festiland <span className="px-1">/</span> {title}</p><h1 className="font-display text-xl font-bold">{title}</h1></div></div>
        <div className="flex items-center gap-2"><div className="hidden items-center gap-2 rounded-full border border-[#e6e0d4] bg-white px-3 py-2 text-xs font-semibold text-[#667779] sm:flex"><CalendarDays size={14}/> {new Intl.DateTimeFormat('es-DO', { dateStyle: 'full', timeZone: 'America/Santo_Domingo' }).format(new Date())}</div>{can.sell(role) && <Link href="/pos" className="flex h-10 items-center gap-2 rounded-xl bg-[#bd4778] px-4 text-sm font-bold text-white shadow-sm" data-testid="button-header-pos"><ShoppingCart size={16}/><span className="hidden sm:inline">Nueva venta</span><span className="sm:hidden">Venta</span></Link>}</div>
      </header>
      <main className="page-enter mx-auto max-w-[1500px] p-4 md:p-8">
        {activePath === '/dashboard' && !can.route(role, '/dashboard') && <Redirect to={homeFor(role)}/>}
        {!can.route(role, activePath) ? <EmptyState title="Esta sección no está disponible para tu rol" body={`Tu rol actual es ${roleName(role)}. Si necesitas acceso, pídelo al propietario.`} action={<Link href={homeFor(role)} className="font-bold text-[#bd4778]">Ir a mi pantalla de inicio</Link>}/> : <>
        {activePath === '/dashboard' && <DashboardPage dashboard={dashboard} loading={dashLoading} error={dashError} retry={retryDash} sales={salesQ.data || []}/>}
        {activePath === '/pos' && <PosPage products={products} productsLoading={productsQ.isLoading} customers={customers} taxRates={taxesQ.data || []} createSale={createSale} invalidate={invalidate} toast={toast}/>}
        {activePath === '/accounting' && <AccountingPage role={role} accounts={accounts} journals={journalQ.data || []} report={reportQ.data} reportQ={reportQ} range={range} setRange={setRange} loading={accountsQ.isLoading} accountsError={accountsQ.isError} retry={accountsQ.refetch} onAdd={openModal} createJournal={createJournal} invalidate={invalidate}/>}
        {activePath === '/settings' && <SettingsPage role={role}/>}
        {activePath === '/team' && <TeamPage me={me}/>}
        {dataForPage() && <section>
          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-[#82908f]">{subtitle(activePath)}</p><h2 className="mt-1 text-3xl font-bold">{title}</h2></div><div className="flex gap-2"><label className="relative flex-1 sm:w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#879291]" size={17}/><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="h-11 border-[#e3ddd1] bg-white pl-10" data-testid="input-search"/></label>{addLabel[activePath] && allowedAdd[activePath] && <Button onClick={openModal} className="h-11 gap-2 bg-[#bd4778] hover:bg-[#a83968]" data-testid="button-create"><Plus size={17}/><span className="hidden sm:inline">{addLabel[activePath]}</span><span className="sm:hidden">Agregar</span></Button>}</div></div>
          {activePath === '/products' && <div className="mb-5 grid gap-3 sm:grid-cols-3"><MiniStat label="Productos activos" value={String(products.filter((p: any) => p.active).length)}/><MiniStat label="Por reponer" value={String(products.filter((p: any) => p.stock <= p.minStock).length)} tone="pink"/><MiniStat label="Categorías" value={String(new Set(products.map((p: any) => p.category)).size)}/></div>}
          {(activePath === '/customers' || activePath === '/suppliers') && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d8e8e2] bg-[#f1f8f5] p-4 text-sm text-[#3d6660]"><span>Saldos calculados por el sistema. {activePath === '/customers' ? 'Registra abonos de clientes' : 'Registra pagos a proveedores'} en Contabilidad, pestaña Cobros y pagos.</span><Link href="/accounting" className="font-bold text-[#bd4778]" data-testid="link-settlements">Ir a cobros y pagos</Link></div>}
          {activePath === '/inventory' && <div className="mb-5 rounded-2xl border border-[#f0d9e2] bg-[#fff4f7] p-4 text-sm text-[#76515e]"><b>Control de existencias</b> · Registra conteos, pérdidas, daños y correcciones. Los cambios quedan en el historial.</div>}
          <DataTable data={dataForPage()!} renderRows={renderRows} />
        </section>}
        </>}
      </main>
    </div>
    {modal && <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#153638]/45 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) setModal(false); }}>
      <section className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[24px] bg-[#fffdf8] p-5 shadow-2xl sm:max-w-xl sm:rounded-[24px] sm:p-7" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="mb-5 flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#bd4778]">Festiland · Gestión</p><h2 id="modal-title" className="mt-1 text-2xl font-bold">{addLabel[activePath]}</h2></div><button onClick={() => setModal(false)} aria-label="Cerrar" className="rounded-lg p-2 hover:bg-[#f4f0e7]" data-testid="button-close-modal"><X size={20}/></button></div>
        <Form {...form}><form onSubmit={submitModal} className="grid gap-4 sm:grid-cols-2">{currentFields.map(field => {
          let options = field.options || [];
          if (field.name === 'productId') options = products.map((p: any) => `${p.id}|${p.name}`);
          if (field.name === 'supplierId') options = suppliers.map((p: any) => `${p.id}|${p.name}`);
          if (field.name === 'accountId') options = accounts.map((a: any) => `${a.id}|${a.code} · ${a.name}`);
          const span = ['description', 'address', 'notes', 'note'].includes(field.name);
          return <label key={field.name} className={`${span ? 'sm:col-span-2' : ''} grid gap-1.5 text-sm font-semibold text-[#43585a]`}><span>{field.label}{field.required && <em className="text-[#bd4778]"> *</em>}</span>{options.length ? <select {...form.register(field.name, { required: field.required })} className="h-11 rounded-xl border border-[#ded8cc] bg-white px-3 font-normal outline-none focus:border-[#bd4778]" data-testid={`select-${field.name}`}><option value="">Selecciona...</option>{options.map(option => { const [val, label] = option.includes('|') ? option.split('|') : [option, option]; return <option key={val} value={val}>{field.name === 'productType' ? val === 'product' ? 'Producto' : 'Servicio' : field.name === 'reason' ? reasonText(val) : field.name === 'role' ? roleName(val) : field.name === 'paymentMethod' ? paymentName(val) : label}</option>; })}</select> : <Input {...form.register(field.name, { required: field.required, valueAsNumber: field.type === 'number' })} type={field.type || 'text'} step={field.type === 'number' ? '0.01' : undefined} placeholder={field.placeholder || ''} className="h-11 border-[#ded8cc] bg-white" data-testid={`input-${field.name}`}/>}</label>;
        })}<div className="mt-2 flex gap-3 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setModal(false)} className="h-12 flex-1" data-testid="button-cancel">Cancelar</Button><Button disabled={busy} type="submit" className="h-12 flex-1 bg-[#bd4778] font-bold hover:bg-[#a83968]" data-testid="button-save">{busy ? 'Guardando…' : 'Guardar'}</Button></div></form></Form>
      </section>
    </div>}
    {editingProduct !== undefined && <ProductEditor product={editingProduct} taxRates={taxesQ.data || []} onClose={() => setEditingProduct(undefined)}/>}
    {editingTax !== undefined && <TaxEditor tax={editingTax} onClose={() => setEditingTax(undefined)}/>}
  </div>;
}

function DashboardPage({ dashboard, loading, error, retry, sales }: any) {
  if (loading) return <LoadingBlock/>;
  if (error) return <ErrorBlock retry={retry}/>;
  const cards = [
    { label: 'Ventas de hoy', value: money(dashboard?.todaySales), icon: Banknote, accent: 'rose', note: `${dashboard?.todayTransactions || 0} transacciones` },
    { label: 'Caja disponible', value: money(dashboard?.cashBalance), icon: Wallet, accent: 'teal', note: 'Balance en caja' },
    { label: 'Por cobrar', value: money(dashboard?.accountsReceivable), icon: ArrowDownLeft, accent: 'gold', note: 'Cuentas de clientes' },
    { label: 'Por pagar', value: money(dashboard?.accountsPayable), icon: ArrowUpRight, accent: 'blue', note: `${dashboard?.lowStockCount || 0} productos por reponer` },
  ];
  return <div><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-[#7e8d8d]">Tu operación en una mirada</p><h2 className="mt-1 text-3xl font-bold">Buenos días, que fluya la celebración.</h2></div><Link href="/pos" className="flex items-center gap-2 rounded-xl bg-[#bd4778] px-5 py-3 font-bold text-white shadow-md shadow-[#bd4778]/15" data-testid="button-start-sale"><ShoppingCart size={17}/> Iniciar venta <ArrowRight size={16}/></Link></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card, i) => <article key={card.label} className="rounded-2xl border border-[#e8e2d6] bg-white p-5 shadow-sm" data-testid={`card-metric-${i}`}><div className="flex items-center justify-between"><span className="text-sm font-semibold text-[#70807f]">{card.label}</span><span className={`grid h-10 w-10 place-items-center rounded-xl ${card.accent === 'rose' ? 'bg-[#f9e8ef] text-[#bd4778]' : card.accent === 'teal' ? 'bg-[#e3f1ed] text-[#398477]' : card.accent === 'gold' ? 'bg-[#fcf2d2] text-[#967422]' : 'bg-[#e8f0f4] text-[#557b8c]'}`}><card.icon size={19}/></span></div><strong className="mt-4 block font-display text-3xl">{card.value}</strong><p className="mt-2 text-xs text-[#8a9694]">{card.note}</p></article>)}</div>
    <div className="mt-6 grid gap-5 xl:grid-cols-[1.4fr_.8fr]"><section className="rounded-2xl border border-[#e8e2d6] bg-white p-5"><div className="mb-5 flex items-center justify-between"><div><h3 className="text-xl font-bold">Ventas recientes</h3><p className="text-sm text-[#84918f]">Los últimos recibos de caja</p></div><Link href="/sales" className="text-sm font-bold text-[#bd4778]" data-testid="link-all-sales">Ver todas <ArrowRight size={14} className="inline"/></Link></div>{(dashboard?.recentSales || sales).length ? <div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wider text-[#899593]"><th className="pb-3">Recibo</th><th className="pb-3">Cliente</th><th className="pb-3">Hora</th><th className="pb-3 text-right">Total</th></tr></thead><tbody>{(dashboard?.recentSales || sales).slice(0, 6).map((sale: any) => <tr className="border-b border-[#f0ede7] last:border-0" key={sale.id} data-testid={`row-recent-sale-${sale.id}`}><td className="py-3 font-semibold">{sale.receiptNumber}</td><td>{sale.customerName || 'Venta al detalle'}</td><td>{dateLabel(sale.createdAt)}</td><td className="text-right font-bold">{money(sale.total)}</td></tr>)}</tbody></table></div> : <EmptyState title="Aún no hay ventas" body="Cuando registres la primera, aparecerá aquí." action={<Link href="/pos" className="font-bold text-[#bd4778]">Abrir caja</Link>}/>}</section>
      <section className="rounded-2xl bg-[#214447] p-5 text-white"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#f1d25d]">Movimiento</p><h3 className="mt-2 text-2xl font-bold">Lo que más se mueve</h3></div><Activity className="text-[#f1d25d]"/></div>{(dashboard?.topProducts || []).length ? <div className="mt-5 space-y-4">{dashboard.topProducts.slice(0, 5).map((item: any, i: number) => <div key={item.productId} className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 font-bold text-[#f1d25d]">{String(i + 1).padStart(2, '0')}</span><div className="min-w-0 flex-1"><b className="block truncate text-sm">{item.name}</b><span className="text-xs text-white/55">{item.quantity} vendidos</span></div><b className="text-sm">{money(item.revenue)}</b></div>)}</div> : <p className="mt-5 text-sm leading-6 text-white/65">Los productos más vendidos aparecerán aquí con la actividad de la tienda.</p>}<Link href="/inventory" className="mt-6 flex items-center justify-between border-t border-white/15 pt-4 text-sm font-semibold"><span>{dashboard?.lowStockCount || 0} productos requieren atención</span><ArrowRight size={16}/></Link></section></div>
    <div className="mt-5 rounded-2xl border border-[#e9e2d5] bg-[#fffcf5] p-4 text-sm text-[#788786]"><span className="font-bold text-[#43585a]">Un dato importante:</span> las tasas de impuestos se configuran por comercio; no se aplica ninguna tasa hasta que la actives.</div>
  </div>;
}

function PosPage({ products, productsLoading, customers, taxRates, createSale, invalidate, toast }: any) {
  const [query, setQuery] = useState(''); const [cart, setCart] = useState<Record<string, number>>({});
  const [customerId, setCustomerId] = useState(''); const [discount, setDiscount] = useState(''); const [payment, setPayment] = useState('cash');
  const [receipt, setReceipt] = useState<any>(null);
  const visible = products.filter((p: any) => p.active && (!query || `${p.name} ${p.sku || ''} ${p.barcode || ''}`.toLowerCase().includes(query.toLowerCase())));
  const items = products.filter((p: any) => cart[p.id]).map((p: any) => ({ ...p, quantity: cart[p.id] }));
  const subtotal = roundMoney(items.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0));
  const discountAmount = roundMoney(Math.min(Math.max(Number(discount) || 0, 0), subtotal));
  const lines = items.map((item: any) => {
    const rate = taxRates.find((t: any) => t.id === item.taxRateId && t.active);
    const base = item.price * item.quantity;
    const discounted = Math.max(0, base - (subtotal > 0 ? (discountAmount * base) / subtotal : 0));
    const tax = rate ? (rate.inclusive ? discounted * (rate.rate / (100 + rate.rate)) : discounted * (rate.rate / 100)) : 0;
    return { tax: roundMoney(tax), total: roundMoney(rate?.inclusive ? discounted : discounted + tax), inclusive: !!rate?.inclusive };
  });
  const taxTotal = roundMoney(lines.reduce((n: number, l: any) => n + l.tax, 0));
  const inclusiveTax = roundMoney(lines.filter((l: any) => l.inclusive).reduce((n: number, l: any) => n + l.tax, 0));
  const grandTotal = roundMoney(lines.reduce((n: number, l: any) => n + l.total, 0));
  const needsCustomer = payment === 'credit' && !customerId;
  const removeItem = (id: string) => setCart(current => { const next = { ...current }; delete next[id]; return next; });
  const checkout = () => {
    if (!items.length || grandTotal <= 0 || needsCustomer) return;
    createSale.mutate({ data: { customerId: customerId || null, items: items.map((item: any) => ({ productId: item.id, quantity: item.quantity })), discountAmount, payments: [{ method: payment, amount: grandTotal }] } } as any, {
      onSuccess: async (sale: any) => { setReceipt(sale); setCart({}); setDiscount(''); await invalidate(getListSalesQueryKey(), getGetDashboardQueryKey(), getListProductsQueryKey()); toast({ title: 'Venta completada', description: `Recibo ${sale.receiptNumber} listo para imprimir.` }); },
      onError: () => toast({ title: 'No se pudo completar la venta', description: 'Verifica el pago y las existencias.', variant: 'destructive' }),
    });
  };
  if (receipt) return <div className="mx-auto max-w-3xl"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-[#82908f]">Venta finalizada</p><h2 className="text-3xl font-bold">Recibo {receipt.receiptNumber}</h2></div><div className="flex gap-2"><Button variant="outline" onClick={() => window.print()} className="gap-2" data-testid="button-print"><Printer size={16}/> Imprimir</Button><Button onClick={() => setReceipt(null)} className="bg-[#bd4778]" data-testid="button-new-sale">Nueva venta</Button></div></div><Receipt sale={receipt}/><div className="receipt-print"><Receipt sale={receipt}/></div></div>;
  return <div><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-[#82908f]">Atención rápida · DOP</p><h2 className="text-3xl font-bold">Caja rápida</h2></div><div className="flex items-center gap-2 rounded-xl bg-[#e4f1ed] px-3 py-2 text-xs font-bold text-[#398477]"><span className="h-2 w-2 rounded-full bg-[#45a18d]"/> Caja lista</div></div>
    <CashBar/>
    <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
      <section className="min-w-0"><label className="relative mb-4 block"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#81908e]" size={19}/><Input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Busca o escanea el código de barras..." className="h-14 border-[#e5dfd3] bg-white pl-12 text-base shadow-sm" data-testid="input-pos-search"/><span className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md bg-[#f4f0e7] px-2 py-1 text-[10px] text-[#899492] sm:block">LECTOR USB · TECLADO</span></label>
        {productsLoading ? <LoadingBlock/> : visible.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.slice(0, 48).map((p: any) => <button key={p.id} onClick={() => setCart(current => ({ ...current, [p.id]: (current[p.id] || 0) + 1 }))} className="group rounded-2xl border border-[#e7e1d6] bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[#d9a6bb] hover:shadow-md" data-testid={`button-add-cart-${p.id}`}><div className="flex items-start justify-between gap-2"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f9e9ef] text-[#bd4778]"><Package size={18}/></span><span className="text-[11px] text-[#899391]">{p.stock} disponibles</span></div><b className="mt-3 block line-clamp-2 min-h-10">{p.name}</b><div className="mt-2 flex items-center justify-between"><strong className="text-lg text-[#bd4778]">{money(p.price)}</strong><span className="grid h-7 w-7 place-items-center rounded-full bg-[#eff5f1] text-[#398477]"><Plus size={16}/></span></div></button>)}</div> : <EmptyState title={query ? 'No encontramos ese producto' : 'No hay productos disponibles'} body={query ? 'Revisa el nombre o el código de barras.' : 'Agrega productos al catálogo para iniciar la venta.'}/>}</section>
      <aside className="rounded-2xl border border-[#e6e0d5] bg-white p-5 shadow-sm xl:sticky xl:top-[94px] xl:self-start"><div className="flex items-center justify-between"><h3 className="text-xl font-bold">Venta actual</h3><span className="rounded-full bg-[#f4f0e7] px-2.5 py-1 text-xs font-bold">{items.reduce((n: number, x: any) => n + x.quantity, 0)} artículos</span></div>
        <label className="mt-4 grid gap-1.5 text-xs font-bold text-[#748381]">CLIENTE<select value={customerId} onChange={e => setCustomerId(e.target.value)} className="h-10 rounded-lg border border-[#e2dbcf] bg-white px-3 text-sm font-normal text-[#263d40]" data-testid="select-pos-customer"><option value="">Venta al detalle</option>{customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <div className="my-4 max-h-[34vh] min-h-[110px] space-y-3 overflow-y-auto border-y border-dashed border-[#e3ddd2] py-4">{items.length ? items.map((item: any) => <div className="flex items-center gap-2" key={item.id}><div className="min-w-0 flex-1"><b className="block truncate text-sm">{item.name}</b><small className="text-[#8a9694]">{money(item.price)} c/u</small></div><div className="flex items-center gap-1"><button onClick={() => setCart(current => ({ ...current, [item.id]: Math.max(0, Math.round((current[item.id] - 1) * 100) / 100) }))} className="grid h-7 w-7 place-items-center rounded-md bg-[#f2efe8]" aria-label={`Quitar uno de ${item.name}`} data-testid={`button-minus-${item.id}`}>−</button><input type="number" inputMode="decimal" step="0.01" min="0" value={item.quantity} onChange={e => { const q = Math.max(0, Math.round(Number(e.target.value) * 100) / 100); setCart(current => ({ ...current, [item.id]: q })); }} className="h-7 w-14 rounded-md border border-[#e2dbcf] text-center text-sm font-bold" aria-label={`Cantidad de ${item.name}`} data-testid={`input-qty-${item.id}`}/><button onClick={() => setCart(current => ({ ...current, [item.id]: current[item.id] + 1 }))} className="grid h-7 w-7 place-items-center rounded-md bg-[#f2efe8]" aria-label={`Agregar uno de ${item.name}`} data-testid={`button-plus-${item.id}`}>+</button></div><b className="w-[76px] text-right text-sm">{money(item.price * item.quantity)}</b><button onClick={() => removeItem(item.id)} className="p-1 text-[#a1aaa7] hover:text-[#bd4778]" aria-label={`Eliminar ${item.name}`} data-testid={`button-remove-${item.id}`}><X size={15}/></button></div>) : <div className="grid h-24 place-items-center text-center text-sm text-[#8a9694]">Tu venta está vacía.<br/>Agrega productos para empezar.</div>}</div>
        <div className="space-y-2 text-sm"><div className="flex justify-between text-[#788684]"><span>Subtotal</span><span>{money(subtotal)}</span></div><label className="flex items-center justify-between text-[#788684]"><span>Descuento (DOP)</span><Input type="number" min="0" value={discount} onChange={e => setDiscount(e.target.value)} className="h-8 w-28 text-right" placeholder="0.00" data-testid="input-discount"/></label><div className="flex justify-between text-[#788684]"><span>Impuestos{inclusiveTax > 0 ? ` (incl. ${money(inclusiveTax)})` : ''}</span><span data-testid="text-pos-tax">{money(taxTotal)}</span></div><div className="flex justify-between border-t border-[#e9e4da] pt-3 text-lg font-bold"><span>Total</span><span className="text-[#bd4778]" data-testid="text-pos-total">{money(grandTotal)}</span></div></div>
        <label className="mt-4 grid gap-1.5 text-xs font-bold text-[#748381]">FORMA DE PAGO<select value={payment} onChange={e => setPayment(e.target.value)} className="h-10 rounded-lg border border-[#e2dbcf] bg-white px-3 text-sm font-normal text-[#263d40]" data-testid="select-payment">{['cash', 'card', 'transfer', 'credit'].map(k => <option key={k} value={k}>{paymentName(k)}</option>)}</select></label>
        <Button disabled={!items.length || grandTotal <= 0 || needsCustomer || createSale.isPending} onClick={checkout} className="mt-4 h-12 w-full bg-[#bd4778] text-base font-bold hover:bg-[#a83968]" data-testid="button-checkout">{createSale.isPending ? 'Procesando…' : 'Cobrar ' + money(grandTotal)}</Button>{needsCustomer && <p role="alert" className="mt-2 text-center text-xs font-semibold text-[#bd4778]" data-testid="text-credit-needs-customer">Para vender a crédito, selecciona un cliente.</p>}<p className="mt-3 text-center text-[11px] text-[#8d9896]">Total calculado con las tasas activas asignadas a cada producto; el servidor confirma el monto final.</p>
      </aside>
    </div>
  </div>;
}

const sumBal = (rows: any[]) => roundMoney(rows.reduce((n, r) => n + Number(r.balance || 0), 0));

function BalanceSheet({ report }: { report: any }) {
  const rows: any[] = report.accountBalances || [];
  const of = (t: string) => rows.filter(r => r.type === t);
  const assets = of('asset'), liabilities = of('liability'), equity = of('equity');
  const earnings = roundMoney(sumBal(of('revenue')) - sumBal(of('expense')));
  const totalAssets = sumBal(assets), totalLiab = sumBal(liabilities), totalEquity = roundMoney(sumBal(equity) + earnings);
  const totalLE = roundMoney(totalLiab + totalEquity);
  const diff = roundMoney(totalAssets - totalLE);
  const exportCsv = () => downloadCsv(`balance-general_${report.to}.csv`, [
    ['Balance general al', report.to], [], ['Sección', 'Código', 'Cuenta', 'Saldo DOP'],
    ...assets.map(a => ['Activos', a.code, a.name, a.balance]), ['Total activos', '', '', totalAssets],
    ...liabilities.map(a => ['Pasivos', a.code, a.name, a.balance]), ['Total pasivos', '', '', totalLiab],
    ...equity.map(a => ['Patrimonio', a.code, a.name, a.balance]), ['Patrimonio', '', 'Resultado acumulado al corte', earnings], ['Total patrimonio', '', '', totalEquity],
    ['Total pasivos + patrimonio', '', '', totalLE], ['Diferencia', '', '', diff],
  ]);
  const Section = ({ title, items, extra, total }: any) => <section className="rounded-2xl border border-[#e8e2d6] bg-white p-5"><h3 className="mb-2 text-lg font-bold">{title}</h3>{items.map((a: any) => <div key={a.accountId} className="flex justify-between border-b border-[#f0ede7] py-2 text-sm"><span><span className="text-[#87928f]">{a.code}</span> {a.name}</span><span>{money(a.balance)}</span></div>)}{extra}{!items.length && !extra && <p className="py-2 text-sm text-[#87928f]">Sin cuentas.</p>}<div className="mt-2 flex justify-between pt-2 font-bold"><span>Total</span><span>{money(total)}</span></div></section>;
  return <div data-testid="balance-sheet">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[#87928f]">Balance general al {dateLabel(report.to + 'T12:00:00')}</p><Button variant="outline" size="sm" onClick={exportCsv} className="gap-2" data-testid="button-export-balance"><Download size={15}/>Exportar CSV</Button></div>
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Activos" items={assets} total={totalAssets}/>
      <div className="grid gap-5"><Section title="Pasivos" items={liabilities} total={totalLiab}/><Section title="Patrimonio" items={equity} total={totalEquity} extra={<div className="flex justify-between border-b border-[#f0ede7] py-2 text-sm italic"><span>Resultado acumulado al corte</span><span>{money(earnings)}</span></div>}/></div>
    </div>
    <div className={`mt-5 flex flex-wrap justify-between gap-2 rounded-2xl p-4 text-sm font-bold ${diff === 0 ? 'bg-[#e5f2ec] text-[#2f6f63]' : 'bg-[#fff1f4] text-[#bd4778]'}`} data-testid="text-balance-check"><span>Activos {money(totalAssets)} · Pasivos + patrimonio {money(totalLE)}</span><span>{diff === 0 ? 'Cuadra' : `Diferencia ${money(diff)}`}</span></div>
  </div>;
}

function TrialBalance({ report }: { report: any }) {
  const rows = (report.accountBalances || []).map((a: any) => {
    const debitNormal = a.type === 'asset' || a.type === 'expense';
    const b = Number(a.balance || 0);
    const debit = debitNormal ? (b >= 0 ? b : 0) : (b < 0 ? -b : 0);
    const credit = debitNormal ? (b < 0 ? -b : 0) : (b >= 0 ? b : 0);
    return { ...a, debit: roundMoney(debit), credit: roundMoney(credit) };
  });
  const td = roundMoney(rows.reduce((n: number, r: any) => n + r.debit, 0));
  const tc = roundMoney(rows.reduce((n: number, r: any) => n + r.credit, 0));
  const diff = roundMoney(td - tc);
  const exportCsv = () => downloadCsv(`balanza-comprobacion_${report.to}.csv`, [
    ['Balanza de comprobación al', report.to], [], ['Código', 'Cuenta', 'Tipo', 'Débito', 'Crédito'],
    ...rows.map((r: any) => [r.code, r.name, typeName(r.type), r.debit || '', r.credit || '']),
    ['', 'Sumas', '', td, tc], ['', 'Diferencia', '', diff, ''],
  ]);
  return <div className="overflow-x-auto rounded-2xl border border-[#e8e2d6] bg-white p-5" data-testid="trial-balance">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[#87928f]">Saldos al {dateLabel(report.to + 'T12:00:00')}</p><Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length} className="gap-2" data-testid="button-export-trial"><Download size={15}/>Exportar CSV</Button></div>
    {!rows.length ? <EmptyState title="Sin cuentas" body="Aún no hay saldos para mostrar."/> : <table className="w-full min-w-[600px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-[#8a9694]"><th className="pb-3">Código</th><th className="pb-3">Cuenta</th><th className="pb-3">Tipo</th><th className="pb-3 text-right">Débito</th><th className="pb-3 text-right">Crédito</th></tr></thead>
      <tbody>{rows.map((r: any) => <tr key={r.accountId} className="border-b border-[#f0ede7]"><td className="py-2.5">{r.code}</td><td className="font-semibold">{r.name}</td><td>{typeName(r.type)}</td><td className="text-right">{r.debit ? money(r.debit) : '—'}</td><td className="text-right">{r.credit ? money(r.credit) : '—'}</td></tr>)}</tbody>
      <tfoot><tr className="font-bold"><td className="pt-3" colSpan={3}>Sumas</td><td className="pt-3 text-right">{money(td)}</td><td className="pt-3 text-right">{money(tc)}</td></tr><tr className={diff === 0 ? 'text-[#2f6f63]' : 'text-[#bd4778]'}><td colSpan={3} className="pt-1 font-bold">Diferencia</td><td colSpan={2} className="pt-1 text-right font-bold" data-testid="text-trial-diff">{diff === 0 ? 'Cuadra' : money(diff)}</td></tr></tfoot></table>}
  </div>;
}

function AccountingPage({ role, accounts, journals, report, reportQ, range, setRange, loading, accountsError, retry, onAdd, createJournal, invalidate }: any) {
  const [tab, setTab] = useState('informe');
  if (loading) return <LoadingBlock/>;
  if (accountsError) return <ErrorBlock retry={retry}/>;
  const badRange = !range.from || !range.to || range.from > range.to;
  const exportReport = () => downloadCsv(`estado-financiero_${report.from}_${report.to}.csv`, [
    ['Concepto', 'Monto DOP'], ['Desde', report.from], ['Hasta', report.to],
    ['Ingresos', report.revenue], ['Gastos', report.expenses], ['Costo de mercancía', report.costOfGoods], ['Ganancia bruta', report.grossProfit], ['Resultado neto', report.netIncome],
    ['Caja y bancos', report.cashBalance], ['Cuentas por cobrar', report.accountsReceivable], ['Cuentas por pagar', report.accountsPayable],
    [], ['Código', 'Cuenta', 'Tipo', 'Balance'], ...report.accountBalances.map((a: any) => [a.code, a.name, typeName(a.type), a.balance]),
  ]);
  const exportAccounts = () => downloadCsv(`cuentas_${todayDO()}.csv`, [['Código', 'Cuenta', 'Tipo', 'Balance', 'Activa'], ...accounts.map((a: any) => [a.code, a.name, typeName(a.type), a.balance, a.active ? 'Sí' : 'No'])]);
  const exportJournal = () => downloadCsv(`diario_${todayDO()}.csv`, [['Fecha', 'Asiento', 'Descripción', 'Origen', 'Cuenta', 'Debe', 'Haber', 'Memo'], ...journals.flatMap((e: any) => e.lines.map((l: any) => [e.date, e.id, e.description, e.source, l.accountName, l.debit, l.credit, l.memo || '']))]);
  const ExportBtn = ({ onClick, disabled, id }: any) => <Button variant="outline" size="sm" disabled={disabled} onClick={onClick} className="gap-2" data-testid={id}><Download size={15}/>Exportar CSV</Button>;
  return <div><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-[#82908f]">Registros financieros del comercio</p><h2 className="text-3xl font-bold">Contabilidad</h2></div>{can.postJournal(role) && <Button onClick={onAdd} className="gap-2 bg-[#bd4778]" data-testid="button-create-account"><Plus size={17}/> Nueva cuenta</Button>}</div><div className="mb-5 flex w-full gap-1 overflow-x-auto rounded-xl bg-[#eae6dc] p-1 sm:w-fit">{['informe', 'balance general', 'balanza', 'cuentas', 'diario', 'cobros y pagos'].map(key => <button key={key} onClick={() => setTab(key)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold capitalize ${tab === key ? 'bg-white text-[#214447] shadow-sm' : 'text-[#7f8c89]'}`} data-testid={`tab-${key}`}>{key}</button>)}</div>
    {tab === 'informe' && <>
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-[#e8e2d6] bg-white p-4">
        <label className="grid gap-1 text-xs font-bold text-[#748381]">DESDE<Input type="date" value={range.from} max={range.to} onChange={e => setRange((r: any) => ({ ...r, from: e.target.value }))} className="h-10" data-testid="input-report-from"/></label>
        <label className="grid gap-1 text-xs font-bold text-[#748381]">HASTA<Input type="date" value={range.to} min={range.from} onChange={e => setRange((r: any) => ({ ...r, to: e.target.value }))} className="h-10" data-testid="input-report-to"/></label>
        <div className="flex gap-1">{[['Este mes', () => setRange({ from: todayDO().slice(0, 8) + '01', to: todayDO() })], ['Este año', () => setRange({ from: todayDO().slice(0, 4) + '-01-01', to: todayDO() })]].map(([l, fn]: any) => <Button key={l} type="button" variant="ghost" size="sm" onClick={fn} data-testid={`button-range-${l}`}>{l}</Button>)}</div>
        <div className="ml-auto"><ExportBtn id="button-export-report" disabled={!report || badRange} onClick={exportReport}/></div>
        {badRange && <p role="alert" className="w-full text-xs font-semibold text-[#bd4778]">La fecha inicial debe ser anterior o igual a la final.</p>}
      </div>
      {reportQ.isLoading ? <LoadingBlock/> : reportQ.isError ? <ErrorBlock retry={reportQ.refetch}/> : report && <>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Ingresos', report.revenue], ['Costo de mercancía', report.costOfGoods], ['Ganancia bruta', report.grossProfit], ['Resultado neto', report.netIncome]].map(([label, amount]: any) => <MiniStat key={label} label={label} value={money(amount)}/>)}</div><div className="grid gap-5 lg:grid-cols-[1fr_1fr]"><section className="rounded-2xl border border-[#e8e2d6] bg-white p-5"><h3 className="text-xl font-bold">Estado de resultados</h3><p className="mb-4 text-sm text-[#87928f]">Del {report.from} al {report.to}</p>{[['Ingresos', report.revenue], ['Gastos', report.expenses], ['Costo de mercancía', report.costOfGoods], ['Ganancia bruta', report.grossProfit], ['Resultado neto', report.netIncome]].map(([label, amount]: any) => <div className="flex justify-between border-b border-[#f0ede7] py-3 text-sm last:border-0" key={label}><span>{label}</span><b>{money(amount)}</b></div>)}</section><section className="rounded-2xl border border-[#e8e2d6] bg-white p-5"><h3 className="text-xl font-bold">Saldos clave</h3>{[['Caja y bancos', report.cashBalance], ['Cuentas por cobrar', report.accountsReceivable], ['Cuentas por pagar', report.accountsPayable]].map(([label, amount]: any) => <div className="flex justify-between border-b border-[#f0ede7] py-4 text-sm last:border-0" key={label}><span>{label}</span><b>{money(amount)}</b></div>)}</section></div>
      <p className="mt-4 text-xs text-[#87928f]">Informe de gestión interna generado con los registros del sistema. Revísalo con tu contador antes de usarlo para declaraciones fiscales.</p></>}
    </>}
    {(tab === 'balance general' || tab === 'balanza') && <>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-[#e8e2d6] bg-white p-4"><label className="grid gap-1 text-xs font-bold text-[#748381]">SALDOS AL CORTE<Input type="date" value={range.to} min={range.from} onChange={e => setRange((r: any) => ({ ...r, to: e.target.value }))} className="h-10" data-testid="input-statement-to"/></label><p className="text-xs text-[#87928f]">Usa la fecha final del rango del informe.</p></div>
      {reportQ.isLoading ? <LoadingBlock/> : reportQ.isError ? <ErrorBlock retry={reportQ.refetch}/> : !report ? <EmptyState title="Sin datos" body="Elige un rango de fechas válido."/> : tab === 'balance general' ? <BalanceSheet report={report}/> : <TrialBalance report={report}/>}
    </>}
    {tab === 'cuentas' && <div className="overflow-x-auto rounded-2xl border border-[#e8e2d6] bg-white p-5"><div className="mb-3 flex justify-end"><ExportBtn id="button-export-accounts" disabled={!accounts.length} onClick={exportAccounts}/></div><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-[#8a9694]"><th className="pb-3">Código</th><th className="pb-3">Cuenta</th><th className="pb-3">Tipo</th><th className="pb-3 text-right">Balance</th></tr></thead><tbody>{accounts.map((a: any) => <tr key={a.id} className="border-b border-[#f0ede7] last:border-0"><td className="py-3">{a.code}</td><td className="font-semibold">{a.name}</td><td>{typeName(a.type)}</td><td className="text-right">{money(a.balance)}</td></tr>)}</tbody></table>{!accounts.length && <EmptyState title="Aún no hay cuentas" body="Crea las cuentas contables del comercio."/>}</div>}
    {tab === 'cobros y pagos' && <SettlementsPanel/>}
    {tab === 'diario' && <div><div className="mb-4 flex justify-end gap-2"><ExportBtn id="button-export-journal" disabled={!journals.length} onClick={exportJournal}/>{can.postJournal(role) && <JournalComposer accounts={accounts} createJournal={createJournal} invalidate={invalidate}/>}</div><div className="space-y-3">{journals.length ? journals.map((entry: any) => <details key={entry.id} className="rounded-2xl border border-[#e8e2d6] bg-white p-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4"><div><b>{entry.description}</b><p className="text-xs text-[#87928f]">{dateLabel(entry.date)} · {entry.source}</p></div><b>{money(entry.total)}</b></summary><div className="mt-4 space-y-2 border-t pt-3">{entry.lines?.map((line: any, i: number) => <div key={i} className="flex justify-between text-sm"><span>{line.accountName}</span><span>Debe {money(line.debit)} · Haber {money(line.credit)}</span></div>)}</div></details>) : <EmptyState title="Diario sin movimientos" body="Los asientos contables aparecerán aquí."/>}</div></div>}
  </div>;
}

function SettlementsPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [direction, setDirection] = useState<'receivable' | 'payable'>('receivable');
  const params = useMemo(() => ({ direction }), [direction]);
  const history = useListSettlements(params, { query: { queryKey: getListSettlementsQueryKey(params) } });
  const customersQ = useListCustomers(undefined, { query: { queryKey: getListCustomersQueryKey() } });
  const suppliersQ = useListSuppliers(undefined, { query: { queryKey: getListSuppliersQueryKey() } });
  const createSettlement = useCreateSettlement();
  const contactsQ = direction === 'receivable' ? customersQ : suppliersQ;
  const contacts = contactsQ.data || [];
  const withBalance = contacts.filter((c: any) => c.balance > 0.004);
  const form = useForm({ defaultValues: { contactId: '', amount: '', paymentMethod: 'cash', note: '' } });
  const contactId = form.watch('contactId');
  const selected = contacts.find((c: any) => c.id === contactId);
  const available = roundMoney(selected?.balance || 0);
  const isReceivable = direction === 'receivable';
  const switchDirection = (value: 'receivable' | 'payable') => { setDirection(value); form.reset({ contactId: '', amount: '', paymentMethod: 'cash', note: '' }); };
  const submit = form.handleSubmit(async values => {
    const amount = roundMoney(Number(values.amount));
    if (!values.contactId) { form.setError('contactId', { message: 'Selecciona un contacto.' }); return; }
    if (!(amount > 0)) { form.setError('amount', { message: 'El monto debe ser mayor que cero.' }); return; }
    if (amount > available + 0.001) { form.setError('amount', { message: `No puede superar el saldo pendiente de ${money(available)}.` }); return; }
    try {
      await createSettlement.mutateAsync({ data: { direction, contactId: values.contactId, amount, paymentMethod: values.paymentMethod as any, note: values.note || null } } as any);
      await Promise.all([getListSettlementsQueryKey(), getListCustomersQueryKey(), getListSuppliersQueryKey(), getListAccountsQueryKey(), getListJournalEntriesQueryKey(), getGetDashboardQueryKey(), getGetFinancialReportQueryKey()].map(queryKey => qc.invalidateQueries({ queryKey })));
      toast({ title: isReceivable ? 'Cobro registrado' : 'Pago registrado', description: `${money(amount)} · ${selected?.name || ''}` });
      form.reset({ contactId: '', amount: '', paymentMethod: 'cash', note: '' });
    } catch {
      toast({ title: 'No se pudo registrar', description: 'Revisa el saldo y vuelve a intentarlo.', variant: 'destructive' });
    }
  });
  const errors = form.formState.errors;
  return <div>
    <div className="mb-5 flex w-fit gap-1 rounded-xl bg-white p-1 shadow-sm">{([['receivable', 'Cobros a clientes'], ['payable', 'Pagos a proveedores']] as const).map(([key, label]) => <button key={key} onClick={() => switchDirection(key)} className={`rounded-lg px-4 py-2 text-sm font-bold ${direction === key ? 'bg-[#214447] text-white' : 'text-[#6f7f7d]'}`} data-testid={`tab-settlement-${key}`}>{label}</button>)}</div>
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <section className="rounded-2xl border border-[#e8e2d6] bg-white p-5 lg:self-start">
        <h3 className="text-xl font-bold">{isReceivable ? 'Registrar cobro' : 'Registrar pago'}</h3>
        <p className="mb-4 text-sm text-[#82908f]">{isReceivable ? 'Abono de un cliente a su cuenta por cobrar.' : 'Abono a la cuenta por pagar de un proveedor.'}</p>
        {contactsQ.isLoading ? <LoadingBlock/> : contactsQ.isError ? <ErrorBlock retry={contactsQ.refetch}/> : !withBalance.length ? <EmptyState title="Sin saldos pendientes" body={isReceivable ? 'Ningún cliente tiene saldo por cobrar.' : 'No hay saldos por pagar a proveedores.'}/> :
        <Form {...form}><form onSubmit={submit} className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-semibold">{isReceivable ? 'Cliente' : 'Proveedor'}<select {...form.register('contactId')} className="h-11 rounded-xl border border-[#ded8cc] bg-white px-3 font-normal" data-testid="select-settlement-contact"><option value="">Seleccionar...</option>{withBalance.map((c: any) => <option key={c.id} value={c.id}>{c.name} · {money(c.balance)}</option>)}</select>{errors.contactId && <span role="alert" className="text-xs text-[#bd4778]">{String(errors.contactId.message)}</span>}</label>
          {selected && <div className="flex items-center justify-between rounded-xl bg-[#f6f4ed] px-4 py-3 text-sm"><span className="text-[#6f7f7d]">Saldo pendiente</span><b data-testid="text-settlement-available">{money(available)}</b></div>}
          <label className="grid gap-1.5 text-sm font-semibold"><span className="flex justify-between">Monto (DOP){selected && <button type="button" className="text-xs font-bold text-[#bd4778]" onClick={() => form.setValue('amount', String(available))} data-testid="button-settlement-full">Saldar todo</button>}</span><Input type="number" step="0.01" min="0.01" {...form.register('amount')} className="h-11" data-testid="input-settlement-amount"/>{errors.amount && <span role="alert" className="text-xs text-[#bd4778]">{String(errors.amount.message)}</span>}</label>
          <label className="grid gap-1.5 text-sm font-semibold">Método<select {...form.register('paymentMethod')} className="h-11 rounded-xl border border-[#ded8cc] bg-white px-3 font-normal" data-testid="select-settlement-method">{['cash', 'card', 'transfer'].map(m => <option key={m} value={m}>{paymentName(m)}</option>)}</select></label>
          <label className="grid gap-1.5 text-sm font-semibold">Nota<Input {...form.register('note')} placeholder="Opcional" className="h-11" data-testid="input-settlement-note"/></label>
          <Button disabled={createSettlement.isPending} className="h-12 bg-[#bd4778] font-bold hover:bg-[#a83968]" data-testid="button-save-settlement">{createSettlement.isPending ? 'Registrando…' : isReceivable ? 'Registrar cobro' : 'Registrar pago'}</Button>
        </form></Form>}
      </section>
      <section className="rounded-2xl border border-[#e8e2d6] bg-white p-5">
        <h3 className="mb-4 text-xl font-bold">Historial</h3>
        {history.isLoading ? <LoadingBlock/> : history.isError ? <ErrorBlock retry={history.refetch}/> : !(history.data || []).length ? <EmptyState title="Sin registros" body={isReceivable ? 'Los cobros registrados aparecerán aquí.' : 'Los pagos registrados aparecerán aquí.'}/> :
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-[#8a9694]"><th className="pb-3">Fecha</th><th className="pb-3">{isReceivable ? 'Cliente' : 'Proveedor'}</th><th className="pb-3">Método</th><th className="pb-3">Nota</th><th className="pb-3 text-right">Monto</th></tr></thead><tbody>{(history.data || []).map((st: any) => <tr key={st.id} className="border-b border-[#f0ede7] last:border-0" data-testid={`row-settlement-${st.id}`}><td className="py-3">{dateLabel(st.createdAt)}</td><td className="font-semibold">{st.contactName}</td><td>{paymentName(st.paymentMethod)}</td><td className="text-[#7c8a88]">{st.note || '—'}</td><td className="text-right font-bold">{money(st.amount)}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  </div>;
}

function JournalComposer({ accounts, createJournal, invalidate }: any) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const form = useForm({ defaultValues: { date: todayDO(), description: '', debitAccount: '', creditAccount: '', amount: '' } });
  const { data: store } = useStoreSettings();
  const locked = store?.lockedThrough || null;
  const submit = form.handleSubmit(async values => {
    if (locked && values.date <= locked) { setMessage(`El período está cerrado hasta ${locked}. Usa una fecha posterior.`); return; }
    const amount = Number(values.amount);
    if (!values.debitAccount || !values.creditAccount || values.debitAccount === values.creditAccount || amount <= 0) {
      setMessage('Selecciona dos cuentas distintas y un monto mayor que cero.');
      return;
    }
    try {
      await createJournal.mutateAsync({ data: { date: values.date, description: values.description, lines: [{ accountId: values.debitAccount, debit: amount, credit: 0 }, { accountId: values.creditAccount, debit: 0, credit: amount }] } } as any);
      await invalidate(getListJournalEntriesQueryKey(), getListAccountsQueryKey(), getGetFinancialReportQueryKey(), getGetDashboardQueryKey());
      setOpen(false); setMessage('');
    } catch { setMessage('No se pudo guardar el asiento. Revisa la información e inténtalo otra vez.'); }
  });
  return <><Button onClick={() => { setMessage(''); setOpen(true); }} className="gap-2 bg-[#bd4778]" data-testid="button-create-journal"><Plus size={16}/> Nuevo asiento</Button>{open && <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#153638]/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"><section className="w-full rounded-t-3xl bg-[#fffdf8] p-6 shadow-2xl sm:max-w-lg sm:rounded-3xl"><div className="mb-5 flex justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-[#bd4778]">Contabilidad</p><h3 className="mt-1 text-2xl font-bold">Nuevo asiento</h3></div><button onClick={() => setOpen(false)} aria-label="Cerrar" data-testid="button-close-journal"><X/></button></div><Form {...form}><form onSubmit={submit} className="grid gap-4"><label className="grid gap-1 text-sm font-semibold">Fecha<Input type="date" min={locked || undefined} {...form.register('date', { required: true })} data-testid="input-journal-date"/></label><label className="grid gap-1 text-sm font-semibold">Descripción<Input {...form.register('description', { required: true })} placeholder="Ej. Aporte a caja" data-testid="input-journal-description"/></label><label className="grid gap-1 text-sm font-semibold">Cuenta al debe<select {...form.register('debitAccount', { required: true })} className="h-11 rounded-xl border border-[#ded8cc] bg-white px-3" data-testid="select-journal-debit"><option value="">Seleccionar cuenta</option>{accounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label><label className="grid gap-1 text-sm font-semibold">Cuenta al haber<select {...form.register('creditAccount', { required: true })} className="h-11 rounded-xl border border-[#ded8cc] bg-white px-3" data-testid="select-journal-credit"><option value="">Seleccionar cuenta</option>{accounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label><label className="grid gap-1 text-sm font-semibold">Monto (DOP)<Input type="number" min="0.01" step="0.01" {...form.register('amount', { required: true })} data-testid="input-journal-amount"/></label>{message && <p role="alert" className="text-sm font-semibold text-[#bd4778]">{message}</p>}<div className="flex gap-3"><Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1" data-testid="button-cancel-journal">Cancelar</Button><Button disabled={createJournal.isPending} className="flex-1 bg-[#bd4778]" data-testid="button-save-journal">{createJournal.isPending ? 'Guardando…' : 'Guardar asiento'}</Button></div></form></Form></section></div>}</>;
}

function DataTable({ data, renderRows }: any) {
  if (data.query.isLoading) return <LoadingBlock/>;
  if (data.query.isError) return <ErrorBlock retry={data.query.refetch}/>;
  if (!data.rows.length) return <EmptyState title="Todavía no hay registros" body="Aquí aparecerá la información cuando registres el primer elemento."/>;
  return <div className="overflow-x-auto rounded-2xl border border-[#e8e2d6] bg-white shadow-sm"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b border-[#ebe6dc] bg-[#fbfaf6] text-[10px] font-bold uppercase tracking-[.14em] text-[#84908e]">{data.columns.map((column: string) => <th key={column} className="px-5 py-4">{column}</th>)}</tr></thead><tbody>{renderRows(data.rows)}</tbody></table><div className="border-t border-[#f0ede7] px-5 py-3 text-xs text-[#899492]">{data.rows.length} registro{data.rows.length === 1 ? '' : 's'}</div></div>;
}
function Status({ text, positive }: { text: string; positive: boolean }) { return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${positive ? 'bg-[#e5f2ec] text-[#398477]' : 'bg-[#f6ece4] text-[#9c7042]'}`}>{text}</span>; }
function MiniStat({ label, value, tone }: { label: string; value: string; tone?: string }) { return <div className={`rounded-2xl border p-4 ${tone === 'pink' ? 'border-[#f0dae3] bg-[#fff8fa]' : 'border-[#e8e2d6] bg-white'}`}><p className="text-xs font-semibold text-[#84908e]">{label}</p><b className="mt-1 block font-display text-2xl">{value}</b></div>; }
function reasonText(value: string) { return ({ count: 'Conteo', damage: 'Daño', loss: 'Pérdida', correction: 'Corrección', return: 'Devolución' } as any)[value] || value; }
function roleName(value: string) { return ({ owner: 'Propietario', manager: 'Gerente', cashier: 'Cajero', inventory: 'Inventario', accountant: 'Contable' } as any)[value] || value; }
function paymentName(value: string) { return ({ cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', credit: 'Crédito', payable: 'Por pagar' } as any)[value] || value; }
function typeName(value: string) { return ({ asset: 'Activo', liability: 'Pasivo', equity: 'Patrimonio', revenue: 'Ingreso', expense: 'Gasto' } as any)[value] || value; }
function subtitle(path: string) { return ({ '/products': 'Un catálogo organizado, listo para la caja', '/sales': 'Recibos y devoluciones', '/inventory': 'Existencias y movimientos', '/customers': 'Personas que celebran contigo', '/suppliers': 'Socios que hacen posible la tienda', '/purchases': 'Abastecimiento y recepción', '/expenses': 'Salidas de caja del comercio', '/taxes': 'Configura las tasas aplicables', '/team': 'Accesos y responsabilidades' } as any)[path] || 'Operación del comercio'; }

function RootRoute() {
  const { session, loading } = useAuth();
  if (loading) return <div className="min-h-[100dvh] bg-[#f8f5ed]"/>;
  return session?.user ? <Redirect to="/dashboard" replace/> : <Home/>;
}
function ProtectedShell() {
  return <AuthGate>{user => <AppShell me={user}/>}</AuthGate>;
}
function AppRoutes() {
  return <AuthProvider>
    <Switch>
      <Route path="/" component={RootRoute}/>
      <Route path="/sign-in/*?" component={SignInScreen}/>
      <Route path="/sign-up/*?" component={SignUpNotice}/>
      {routes.map(route => <Route key={route.path} path={route.path} component={ProtectedShell}/>)}
      <Route component={() => <main className="grid min-h-[100dvh] place-items-center bg-[#f6f4ed] p-5"><div className="text-center"><h1 className="text-4xl font-bold">Esta página no está aquí</h1><p className="my-3 text-[#788684]">Vuelve al inicio de Festiland.</p><Link href="/" className="font-bold text-[#bd4778]">Ir al inicio</Link></div></main>}/>
    </Switch>
  </AuthProvider>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><ErrorBoundary><AppRoutes/></ErrorBoundary></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;
