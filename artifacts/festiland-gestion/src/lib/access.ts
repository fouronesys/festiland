export type Role = 'owner' | 'manager' | 'cashier' | 'inventory' | 'accountant';

const all: Role[] = ['owner', 'manager', 'cashier', 'inventory', 'accountant'];
const finance: Role[] = ['owner', 'manager', 'accountant'];

/** Rutas visibles por rol (alineado con los permisos del backend). */
export const routeRoles: Record<string, Role[]> = {
  '/dashboard': finance,
  '/pos': ['owner', 'manager', 'cashier'],
  '/orders': ['owner', 'manager', 'cashier', 'accountant'],
  '/sales': all,
  '/products': all,
  '/inventory': ['owner', 'manager', 'inventory', 'accountant'],
  '/customers': all,
  '/suppliers': ['owner', 'manager', 'inventory', 'accountant'],
  '/purchases': ['owner', 'manager', 'inventory', 'accountant'],
  '/expenses': finance,
  '/accounting': finance,
  '/taxes': all,
  '/team': ['owner', 'manager'],
  '/settings': all,
};

/** Pantalla inicial según el rol (evita aterrizar en una ruta sin permiso). */
export const homeFor = (role?: Role) => role === 'cashier' ? '/pos' : role === 'inventory' ? '/products' : '/dashboard';

export const can = {
  route: (role: Role | undefined, path: string) => !!role && (routeRoles[path] ?? all).includes(role),
  editProducts: (r?: Role) => !!r && ['owner', 'manager', 'inventory'].includes(r),
  adjustInventory: (r?: Role) => !!r && ['owner', 'manager', 'inventory'].includes(r),
  sell: (r?: Role) => !!r && ['owner', 'manager', 'cashier'].includes(r),
  refund: (r?: Role) => !!r && ['owner', 'manager'].includes(r),
  createCustomer: (r?: Role) => !!r && ['owner', 'manager', 'cashier'].includes(r),
  createSupplier: (r?: Role) => !!r && ['owner', 'manager', 'inventory', 'accountant'].includes(r),
  purchases: (r?: Role) => !!r && ['owner', 'manager', 'inventory', 'accountant'].includes(r),
  finance: (r?: Role) => !!r && finance.includes(r),
  postJournal: (r?: Role) => !!r && ['owner', 'accountant'].includes(r),
  editTaxes: (r?: Role) => !!r && finance.includes(r),
  team: (r?: Role) => !!r && ['owner', 'manager'].includes(r),
  changeRoles: (r?: Role) => r === 'owner',
  editStore: (r?: Role) => !!r && ['owner', 'manager'].includes(r),
  lockPeriod: (r?: Role) => !!r && ['owner', 'accountant'].includes(r),
  reopenPeriod: (r?: Role) => r === 'owner',
  audit: (r?: Role) => !!r && finance.includes(r),
  cash: (r?: Role) => !!r && ['owner', 'manager', 'cashier'].includes(r),
};

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const raw = v === null || v === undefined ? '' : String(v);
    const s = typeof v === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '\uFEFF' + rows.map(r => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const money = (value?: number | null) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 2 }).format(value || 0);
export const dateLabel = (value?: string | Date | null) => {
  if (!value) return '—';
  const date = value instanceof Date
    ? value
    : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium', timeZone: 'America/Santo_Domingo' }).format(date)
    : '—';
};
export const dateTimeLabel = (value?: string | Date | null) => {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('es-DO', { dateStyle: 'short', timeStyle: 'short', hourCycle: 'h12', timeZone: 'America/Santo_Domingo' }).format(date)
    : '—';
};
export const todayDO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
export const pickupTimeLabel = (value?: string | null) => {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return 'Sin hora';
  const [hours, minutes] = value.split(':').map(Number);
  const period = hours >= 12 ? 'p. m.' : 'a. m.';
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${period}`;
};
export const isPickupScheduleValid = (date: string, time?: string | null) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date || date < todayDO()) return false;
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
  if (date !== todayDO() || !time) return true;
  const now = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Santo_Domingo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date());
  return time > now;
};
