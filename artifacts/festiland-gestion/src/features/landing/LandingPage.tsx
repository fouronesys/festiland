import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ArrowUpRight, Clock, Instagram, MapPin, Menu, Phone, Star, X } from 'lucide-react';
import { openStatus, store } from './store-info';
import './landing.css';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const img = (name: string) => `${basePath}/brand/${name}`;

const nav = [
  { id: 'detalles', label: 'Lo que hacemos' },
  { id: 'trabajos', label: 'Trabajos' },
  { id: 'tienda', label: 'La tienda' },
  { id: 'pedir', label: 'Cómo pedir' },
  { id: 'visitanos', label: 'Visítanos' },
];

const ribbon = ['Globos personalizados', 'Arreglos con nombre', 'Cumpleaños', 'Baby shower', 'Bienvenida al bebé', 'Regalos y detalles', 'Artículos de fiesta', 'Aniversarios'];

const offers = [
  { n: '01', title: 'Globos y bouquets', body: 'Números, figuras, burbujas transparentes con nombre y bouquets combinados en los colores de tu fiesta.', tone: 'bg-[var(--fl-pink-soft)]' },
  { n: '02', title: 'Arreglos personalizados', body: 'Composiciones armadas a mano para cumpleaños, nacimientos, graduaciones o simplemente para decir te quiero.', tone: 'bg-[#d8f0ec]' },
  { n: '03', title: 'Regalos y detalles', body: 'Peluches, cajas, bolsas de regalo y pequeños detalles para acompañar el globo o regalar solos.', tone: 'bg-[#fdf1c8]' },
  { n: '04', title: 'Todo para celebrar', body: 'Artículos de fiesta y decoración para que la celebración en casa también se vea bonita.', tone: 'bg-[#dcedf5]' },
];

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.fl-landing .fl-reveal');
    if (!('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function CallButton({ className = '' }: { className?: string }) {
  return <a href={store.phoneHref} className={`fl-btn fl-btn-pink ${className}`} data-testid="link-call"><Phone size={18}/>Llamar {store.phoneLabel}</a>;
}

function OpenBadge() {
  const [status, setStatus] = useState(() => openStatus());
  useEffect(() => { const t = setInterval(() => setStatus(openStatus()), 60_000); return () => clearInterval(t); }, []);
  return <span className={`fl-tag ${status.open ? 'bg-[#d8f0ec] text-[var(--fl-teal-deep)]' : 'bg-[var(--fl-pink-soft)] text-[#9c2f58]'}`} data-testid="badge-open-status">
    <span className={`h-2 w-2 rounded-full ${status.open ? 'bg-[var(--fl-teal)]' : 'bg-[var(--fl-pink)]'}`}/>
    {status.open ? 'Abierto ahora · hasta las 6:00 p. m.' : 'Cerrado ahora · lunes a sábado 9:00 a. m. – 6:00 p. m.'}
  </span>;
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  useReveal();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuOpen(false); menuBtn.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [menuOpen]);

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
  };
  const { todayIndex } = openStatus();

  return <div className="fl-landing min-h-[100dvh]">
    <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-full focus:bg-[var(--fl-paper)] focus:px-4 focus:py-2 focus:font-bold">Saltar al contenido</a>

    {/* NAV */}
    <header className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${scrolled ? 'bg-[var(--fl-cream)]/92 shadow-[0_8px_30px_-20px_rgba(23,65,63,.5)] backdrop-blur-md' : 'bg-transparent'}`}>
      <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-4 px-5 md:px-8">
        <a href="#inicio" onClick={go('inicio')} className="shrink-0" aria-label="Festiland, ir al inicio" data-testid="link-landing-logo"><img src={img('festiland-wordmark.png')} alt="Festiland" className="h-11 w-auto md:h-12"/></a>
        <nav aria-label="Secciones" className="hidden items-center gap-1 lg:flex">{nav.map(n => <a key={n.id} href={`#${n.id}`} onClick={go(n.id)} className="rounded-full px-4 py-2 text-[15px] font-semibold text-[var(--fl-teal-ink)] transition hover:bg-[var(--fl-paper)]" data-testid={`nav-landing-${n.id}`}>{n.label}</a>)}</nav>
        <div className="flex items-center gap-2">
          <a href={store.phoneHref} className="fl-btn fl-btn-pink hidden !py-2.5 sm:inline-flex" data-testid="link-call-header"><Phone size={16}/>Llamar</a>
          <button ref={menuBtn} type="button" onClick={() => setMenuOpen(o => !o)} className="grid h-11 w-11 place-items-center rounded-full bg-[var(--fl-paper)] text-[var(--fl-teal-ink)] shadow-sm lg:hidden" aria-expanded={menuOpen} aria-controls="fl-mobile-menu" aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} data-testid="button-landing-menu">{menuOpen ? <X size={20}/> : <Menu size={20}/>}</button>
        </div>
      </div>
      <div id="fl-mobile-menu" hidden={!menuOpen} className="fl-mobile-menu border-t border-[#ecdcc9] bg-[var(--fl-cream)] lg:hidden">
        <nav aria-label="Secciones (móvil)" className="mx-auto flex max-w-7xl flex-col px-5 pb-6 pt-3">
          {nav.map(n => <a key={n.id} href={`#${n.id}`} onClick={go(n.id)} className="fl-serif border-b border-[#efe2d1] py-4 text-2xl text-[var(--fl-teal-ink)]" data-testid={`nav-mobile-${n.id}`}>{n.label}</a>)}
          <div className="mt-5 grid gap-3"><CallButton/><a href={store.instagram} target="_blank" rel="noopener noreferrer" className="fl-btn fl-btn-ghost"><Instagram size={18}/>{store.instagramHandle}</a></div>
        </nav>
      </div>
    </header>

    <main id="contenido">
      {/* HERO */}
      <section id="inicio" className="relative overflow-hidden pt-[76px]">
        <div className="fl-strings pointer-events-none absolute inset-x-0 top-0 h-[340px] opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent)]"/>
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-10 md:px-8 lg:grid-cols-[1.05fr_.95fr] lg:pb-24 lg:pt-16">
          <div>
            <p className="fl-load text-sm font-bold uppercase tracking-[.22em] text-[var(--fl-pink)]">Globos · Arreglos · Regalos · Moca</p>
            <h1 className="fl-serif fl-load mt-5 text-[clamp(2.7rem,7vw,5.6rem)] font-bold leading-[.95] text-[var(--fl-teal-ink)]" style={{ animationDelay: '.08s' }}>
              Cada celebración<br/>merece su <em className="font-medium text-[var(--fl-pink)]">globo</em><br/>con nombre.
            </h1>
            <p className="fl-load mt-6 max-w-lg text-lg leading-8 text-[var(--fl-muted)]" style={{ animationDelay: '.16s' }}>Somos una tienda de detalles en Moca. Armamos globos y arreglos personalizados, y tenemos regalos y artículos para que tu fiesta se sienta especial desde que entras por la puerta.</p>
            <div className="fl-load mt-8 flex flex-wrap gap-3" style={{ animationDelay: '.24s' }}>
              <CallButton/>
              <a href={store.maps} target="_blank" rel="noopener noreferrer" className="fl-btn fl-btn-ghost" data-testid="link-maps-hero"><MapPin size={18}/>Cómo llegar</a>
            </div>
            <div className="fl-load mt-7" style={{ animationDelay: '.32s' }}><OpenBadge/></div>
          </div>

          <div className="relative mx-auto w-full max-w-[560px] lg:mx-0">
            <div className="fl-photo fl-load aspect-[4/3] rotate-[1.5deg]" style={{ animationDelay: '.2s' }}><img src={img('maps-1.jpg')} alt="Arreglo de globos multicolor para el cumpleaños número 9 de Sofía, con patín, número rosado y bola disco" fetchPriority="high"/></div>
            <div className="fl-photo fl-load absolute -bottom-12 -left-4 w-[38%] -rotate-[5deg] sm:-left-10" style={{ animationDelay: '.35s' }}><div className="aspect-[3/4]"><img src={img('maps-2.jpg')} alt="Arreglo de bienvenida al bebé con oso de peluche, regalos y globo transparente azul personalizado" loading="eager"/></div></div>
            <span className="fl-float fl-serif absolute -right-2 -top-6 rounded-full bg-[var(--fl-sun)] px-5 py-3 text-lg font-bold italic text-[var(--fl-teal-ink)] shadow-lg sm:-right-6">hecho a mano</span>
          </div>
        </div>
      </section>

      {/* CINTA */}
      <div className="relative -rotate-1 overflow-hidden bg-[var(--fl-teal)] py-4 text-[var(--fl-paper)]" aria-hidden="true">
        <div className="fl-marquee">{[...ribbon, ...ribbon].map((t, i) => <span key={i} className="fl-serif flex items-center gap-6 px-6 text-xl italic md:text-2xl">{t}<span className="h-2.5 w-2.5 rounded-full bg-[var(--fl-sun)]"/></span>)}</div>
      </div>

      {/* LO QUE HACEMOS */}
      <section id="detalles" className="mx-auto max-w-7xl px-5 py-24 md:px-8 md:py-32">
        <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]">
          <div className="fl-reveal lg:sticky lg:top-28 lg:self-start">
            <p className="text-sm font-bold uppercase tracking-[.22em] text-[var(--fl-pink)]">Lo que hacemos</p>
            <h2 className="fl-serif mt-4 text-4xl font-bold leading-[1.02] text-[var(--fl-teal-ink)] md:text-6xl">Detalles que se notan desde lejos.</h2>
            <p className="mt-5 max-w-sm text-lg leading-8 text-[var(--fl-muted)]">Cuéntanos para quién es y qué se celebra. Lo demás lo armamos contigo.</p>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2">{offers.map((o, i) => <li key={o.n} className={`fl-reveal rounded-[26px] ${o.tone} p-7 ${i % 2 ? 'sm:translate-y-10' : ''}`} style={{ transitionDelay: `${i * 70}ms` }}>
            <span className="fl-serif text-5xl font-bold italic text-[var(--fl-teal-ink)]/25">{o.n}</span>
            <h3 className="fl-serif mt-6 text-2xl font-bold text-[var(--fl-teal-ink)]">{o.title}</h3>
            <p className="mt-3 leading-7 text-[var(--fl-ink)]/75">{o.body}</p>
          </li>)}</ol>
        </div>
      </section>

      {/* TRABAJOS */}
      <section id="trabajos" className="relative bg-[var(--fl-teal-ink)] py-24 text-[var(--fl-paper)] md:py-32">
        <div className="fl-strings pointer-events-none absolute inset-0 opacity-30"/>
        <div className="relative mx-auto max-w-7xl px-5 md:px-8">
          <div className="fl-reveal flex flex-wrap items-end justify-between gap-6">
            <div><p className="text-sm font-bold uppercase tracking-[.22em] text-[var(--fl-sun)]">Salidos de la tienda</p><h2 className="fl-serif mt-4 max-w-2xl text-4xl font-bold leading-[1.02] md:text-6xl">Cada nombre, <em className="font-medium text-[#f6a9c3]">una historia</em>.</h2></div>
            <a href={store.instagram} target="_blank" rel="noopener noreferrer" className="fl-btn bg-[var(--fl-paper)] text-[var(--fl-teal-ink)]" data-testid="link-instagram-works"><Instagram size={18}/>Ver más en Instagram</a>
          </div>
          <div className="mt-14 grid gap-8 md:grid-cols-[1.35fr_1fr] md:gap-10">
            <figure className="fl-reveal">
              <div className="fl-photo aspect-[4/3] !shadow-[0_30px_60px_-28px_rgba(0,0,0,.6),0_0_0_8px_#1f4f4c]"><img src={img('maps-1.jpg')} alt="Arreglo de globos para los 9 años de Sofía" loading="lazy"/></div>
              <figcaption className="mt-5 flex items-baseline gap-4"><span className="fl-serif text-4xl font-bold italic text-[var(--fl-sun)]">9</span><span className="text-white/75">Los nueve años de Sofía: patín con su nombre, número rosado, bola disco y un mar de globos en sus colores.</span></figcaption>
            </figure>
            <figure className="fl-reveal md:mt-24" style={{ transitionDelay: '120ms' }}>
              <div className="fl-photo aspect-[3/4] !shadow-[0_30px_60px_-28px_rgba(0,0,0,.6),0_0_0_8px_#1f4f4c]"><img src={img('maps-2.jpg')} alt="Arreglo de bienvenida para José Paul con oso y globo transparente" loading="lazy" className="object-[50%_30%]"/></div>
              <figcaption className="mt-5 flex items-baseline gap-4"><span className="fl-serif text-4xl font-bold italic text-[var(--fl-sky)]">1ª</span><span className="text-white/75">La primera semana de José Paul: globo burbuja con su nombre, oso y regalos envueltos en azul.</span></figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* LA TIENDA */}
      <section id="tienda" className="mx-auto max-w-7xl px-5 py-24 md:px-8 md:py-32">
        <div className="grid items-center gap-14 lg:grid-cols-[1fr_1fr]">
          <div className="relative order-2 grid grid-cols-[1.15fr_.85fr] gap-4 lg:order-1">
            <div className="fl-reveal fl-photo aspect-[3/4]"><img src={img('interior.jpg')} alt="Interior de Festiland: pared turquesa, mostrador rosado, taburetes amarillos y estantes con regalos" loading="lazy" className="object-[50%_60%]"/></div>
            <div className="fl-reveal fl-photo mt-16 aspect-[3/4] self-start" style={{ transitionDelay: '120ms' }}><img src={img('storefront.jpg')} alt="Fachada de cristal de Festiland con su logo y dibujos de regalos" loading="lazy" className="object-[50%_45%]"/></div>
          </div>
          <div className="fl-reveal order-1 lg:order-2">
            <p className="text-sm font-bold uppercase tracking-[.22em] text-[var(--fl-pink)]">La tienda</p>
            <h2 className="fl-serif mt-4 text-4xl font-bold leading-[1.02] text-[var(--fl-teal-ink)] md:text-6xl">Turquesa, rosado y un poquito de amarillo.</h2>
            <p className="mt-6 text-lg leading-8 text-[var(--fl-muted)]">Así se ve Festiland por dentro: estantes llenos de regalos, un mostrador rosado donde armamos los pedidos y la pared turquesa con nuestro nombre. Pasa a ver, elegir colores en persona y llevarte algo bonito.</p>
            <p className="mt-4 text-lg leading-8 text-[var(--fl-muted)]">Nos encuentras en la calle Rosario, en Moca, detrás de la vitrina con los regalos dibujados.</p>
          </div>
        </div>
      </section>

      {/* COMO PEDIR */}
      <section id="pedir" className="bg-[var(--fl-pink-soft)] py-24 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="fl-reveal max-w-2xl"><p className="text-sm font-bold uppercase tracking-[.22em] text-[var(--fl-pink)]">Cómo pedir</p><h2 className="fl-serif mt-4 text-4xl font-bold leading-[1.02] text-[var(--fl-teal-ink)] md:text-6xl">Tres pasos y listo.</h2></div>
          <ol className="mt-14 grid gap-px overflow-hidden rounded-[28px] bg-[#e9b9ca] md:grid-cols-3">
            {[
              ['Llámanos o escríbenos', <>Llama al <a href={store.phoneHref} className="font-bold text-[var(--fl-pink)] underline decoration-2 underline-offset-4">{store.phoneLabel}</a> o envíanos un mensaje por <a href={store.instagram} target="_blank" rel="noopener noreferrer" className="font-bold text-[var(--fl-pink)] underline decoration-2 underline-offset-4">Instagram</a>.</>],
              ['Cuéntanos los detalles', 'Para quién es, el nombre o la edad, los colores y para cuándo lo necesitas. Te orientamos con las opciones disponibles.'],
              ['Pasa por la tienda', 'Te avisamos cuando esté listo para recogerlo en la calle Rosario. Si necesitas algo distinto, pregúntanos por teléfono.'],
            ].map(([t, b], i) => <li key={i} className="fl-reveal bg-[var(--fl-paper)] p-8 md:p-10" style={{ transitionDelay: `${i * 90}ms` }}>
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--fl-teal)] text-lg font-bold text-[var(--fl-paper)]">{i + 1}</span>
              <h3 className="fl-serif mt-6 text-2xl font-bold text-[var(--fl-teal-ink)]">{t}</h3>
              <p className="mt-3 leading-7 text-[var(--fl-muted)]">{b}</p>
            </li>)}
          </ol>
        </div>
      </section>

      {/* VISITANOS */}
      <section id="visitanos" className="mx-auto max-w-7xl px-5 py-24 md:px-8 md:py-32">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_.9fr]">
          <div className="fl-reveal">
            <p className="text-sm font-bold uppercase tracking-[.22em] text-[var(--fl-pink)]">Visítanos</p>
            <h2 className="fl-serif mt-4 text-4xl font-bold leading-[1.02] text-[var(--fl-teal-ink)] md:text-6xl">Te esperamos en Moca.</h2>
            <address className="mt-8 not-italic">
              <a href={store.maps} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-4" data-testid="link-maps-address">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#d8f0ec] text-[var(--fl-teal-deep)]"><MapPin size={20}/></span>
                <span><span className="block text-xl font-bold text-[var(--fl-teal-ink)] group-hover:text-[var(--fl-pink)]">{store.address}</span><span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-[var(--fl-muted)]">Abrir en Google Maps <ArrowUpRight size={14}/></span></span>
              </a>
              <a href={store.phoneHref} className="group mt-6 flex items-center gap-4" data-testid="link-call-visit">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--fl-pink-soft)] text-[var(--fl-pink)]"><Phone size={20}/></span>
                <span className="text-xl font-bold text-[var(--fl-teal-ink)] group-hover:text-[var(--fl-pink)]">{store.phoneLabel}</span>
              </a>
              <a href={store.instagram} target="_blank" rel="noopener noreferrer" className="group mt-6 flex items-center gap-4" data-testid="link-instagram-visit">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#fdf1c8] text-[#8a6a10]"><Instagram size={20}/></span>
                <span className="text-xl font-bold text-[var(--fl-teal-ink)] group-hover:text-[var(--fl-pink)]">{store.instagramHandle}</span>
              </a>
            </address>
            <div className="mt-9 flex flex-wrap gap-3"><CallButton/><a href={store.maps} target="_blank" rel="noopener noreferrer" className="fl-btn fl-btn-ghost" data-testid="link-maps-visit"><MapPin size={18}/>Cómo llegar</a></div>
            <a href={store.maps} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex items-center gap-2 text-sm text-[var(--fl-muted)] hover:text-[var(--fl-teal-ink)]" data-testid="link-google-rating">
              <span className="flex text-[var(--fl-sun)]" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <Star key={i} size={15} fill="currentColor" strokeWidth={0}/>)}</span>
              <span><b className="text-[var(--fl-teal-ink)]">{store.rating.value}</b> en Google · {store.rating.count} reseñas</span>
            </a>
          </div>

          <div className="fl-reveal relative rounded-[30px] bg-[var(--fl-teal)] p-8 text-[var(--fl-paper)] md:p-10" style={{ transitionDelay: '100ms' }}>
            <div className="fl-strings pointer-events-none absolute inset-0 rounded-[30px] opacity-40 mix-blend-overlay"/>
            <div className="relative">
              <div className="flex items-center gap-3"><Clock size={22}/><h3 className="fl-serif text-3xl font-bold">Horario</h3></div>
              <ul className="mt-7 divide-y divide-white/20">{store.hours.map((h, i) => <li key={h.day} className={`flex justify-between py-3.5 text-[17px] ${i === todayIndex ? 'font-bold' : 'text-white/85'}`}>
                <span className="flex items-center gap-2">{h.day}{i === todayIndex && <span className="rounded-full bg-[var(--fl-sun)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[var(--fl-teal-ink)]">Hoy</span>}</span>
                <span>{h.open === null ? 'Cerrado' : '9:00 a. m. – 6:00 p. m.'}</span>
              </li>)}</ul>
              <div className="mt-7"><OpenBadge/></div>
            </div>
          </div>
        </div>
      </section>
    </main>

    {/* FOOTER */}
    <footer className="border-t border-[#ecdcc9] bg-[var(--fl-paper)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-12 md:flex-row md:items-end md:justify-between md:px-8">
        <div>
          <img src={img('festiland-wordmark.png')} alt="Festiland" className="h-14 w-auto"/>
          <p className="mt-4 max-w-xs text-sm leading-6 text-[var(--fl-muted)]">Globos, arreglos personalizados, regalos y artículos de celebración. {store.address}.</p>
        </div>
        <div className="flex flex-col gap-3 text-sm md:items-end">
          <div className="flex flex-wrap gap-x-6 gap-y-2 font-semibold text-[var(--fl-teal-ink)]">
            <a href={store.phoneHref} className="hover:text-[var(--fl-pink)]">{store.phoneLabel}</a>
            <a href={store.instagram} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--fl-pink)]">Instagram</a>
            <a href={store.maps} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--fl-pink)]">Google Maps</a>
          </div>
          <p className="text-xs text-[var(--fl-muted)]">© {new Date().getFullYear()} Festiland · Moca, República Dominicana · <Link href="/sign-in" className="underline-offset-4 hover:text-[var(--fl-teal-ink)] hover:underline" data-testid="link-team-access">Acceso del equipo</Link></p>
        </div>
      </div>
    </footer>
  </div>;
}
