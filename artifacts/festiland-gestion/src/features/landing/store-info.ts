/** Datos públicos verificados de la tienda. No agregar datos sin confirmar. */
export const store = {
  name: 'Festiland',
  address: 'C. Rosario 86, Moca 56000, República Dominicana',
  phoneLabel: '(809) 528-0233',
  phoneHref: 'tel:+18095280233',
  instagram: 'https://www.instagram.com/festilandsrl/',
  instagramHandle: '@festilandsrl',
  maps: 'https://maps.app.goo.gl/KzRrf3W35wt9hafi7?g_st=ac',
  rating: { value: '4.8', count: 4 },
  // 0 = domingo. Horario verificado en Google Maps.
  hours: [
    { day: 'Lunes', open: 9, close: 18 },
    { day: 'Martes', open: 9, close: 18 },
    { day: 'Miércoles', open: 9, close: 18 },
    { day: 'Jueves', open: 9, close: 18 },
    { day: 'Viernes', open: 9, close: 18 },
    { day: 'Sábado', open: 9, close: 18 },
    { day: 'Domingo', open: null, close: null },
  ] as { day: string; open: number | null; close: number | null }[],
};

/** Estado actual según la hora de República Dominicana. */
export function openStatus(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santo_Domingo', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now);
  const wd = parts.find(p => p.type === 'weekday')?.value ?? 'Mon';
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  const idx = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(wd);
  const today = store.hours[idx < 0 ? 0 : idx];
  const t = h + m / 60;
  const open = today.open !== null && today.close !== null && t >= today.open && t < today.close;
  return { open, todayIndex: idx < 0 ? 0 : idx };
}
