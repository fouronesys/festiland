import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, useLocation } from 'wouter';
import {
  useGetAuthSession, getGetAuthSessionQueryKey, useLogin, useLogout, useChangePassword,
  type AuthSession, type TeamUser,
} from '@workspace/api-client-react';
import { Eye, EyeOff, KeyRound, LockKeyhole, LogOut, ServerCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingBlock } from '@/components/states';
import { useToast } from '@/hooks/use-toast';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
const sessionKey = getGetAuthSessionQueryKey();

type AuthCtx = { session: AuthSession | undefined; loading: boolean; error: boolean; retry: () => void; logout: () => Promise<void>; loggingOut: boolean };
const Ctx = createContext<AuthCtx | null>(null);
export const useAuth = () => { const c = useContext(Ctx); if (!c) throw new Error('useAuth fuera de AuthProvider'); return c; };

/** Elimina todos los datos del usuario en caché excepto la sesión. */
function clearUserData(qc: ReturnType<typeof useQueryClient>) {
  qc.removeQueries({ predicate: q => JSON.stringify(q.queryKey) !== JSON.stringify(sessionKey) });
  qc.getMutationCache().clear();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const q = useGetAuthSession({ query: { queryKey: sessionKey, retry: 1, refetchOnWindowFocus: true, refetchInterval: 60_000, staleTime: 15_000 } });
  const logoutM = useLogout();
  const { toast } = useToast();
  const prevUserId = useRef<string | null | undefined>(undefined);

  // Si cambia o desaparece el usuario de la sesión, nada de su información puede quedar en memoria.
  useEffect(() => {
    if (!q.data) return;
    const id = q.data.user?.id ?? null;
    if (prevUserId.current !== undefined && prevUserId.current !== id) clearUserData(qc);
    prevUserId.current = id;
  }, [q.data, qc]);

  useEffect(() => {
    const onUnauthorized = () => {
      clearUserData(qc);
      qc.invalidateQueries({ queryKey: sessionKey });
    };
    window.addEventListener('festiland:unauthorized', onUnauthorized);
    return () => window.removeEventListener('festiland:unauthorized', onUnauthorized);
  }, [qc]);

  const logout = useCallback(async () => {
    try { await logoutM.mutateAsync(); } catch {
      toast({ title: 'No se pudo cerrar la sesión', description: 'El servidor no confirmó el cierre. Comprueba la conexión y vuelve a intentarlo.', variant: 'destructive' });
      return;
    }
    await qc.cancelQueries({ queryKey: sessionKey });
    const setupRequired = qc.getQueryData<AuthSession>(sessionKey)?.setupRequired ?? false;
    clearUserData(qc);
    qc.setQueryData<AuthSession>(sessionKey, { user: null, setupRequired });
    prevUserId.current = null;
    setLocation('/sign-in', { replace: true });
  }, [qc, setLocation, logoutM.mutateAsync, toast]);

  return <Ctx.Provider value={{ session: q.data, loading: q.isLoading, error: q.isError && !q.data, retry: () => { q.refetch(); }, logout, loggingOut: logoutM.isPending }}>{children}</Ctx.Provider>;
}

function AuthFrame({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <main className="relative flex min-h-[100dvh] flex-col items-center justify-center gap-6 overflow-hidden bg-[#f6f2e8] px-4 py-10 text-[#263d40]">
    <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#f6d76a]/40 blur-3xl"/>
    <div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-[#bd4778]/10 blur-3xl"/>
    <Link href="/" className="relative flex items-center gap-3 font-bold text-[#214447]" data-testid="link-auth-home"><img src={`${basePath}/brand/festiland-logo.png`} className="h-14 w-14 rounded-full object-cover shadow-md" alt="Festiland"/><span className="font-display text-xl">Festiland <span className="text-sm font-semibold text-[#7c8a88]">Gestión</span></span></Link>
    <section className={`page-enter relative w-full ${wide ? 'max-w-lg' : 'max-w-[440px]'} rounded-[24px] border border-[#ebe4d6] bg-[#fffdf8] p-7 shadow-xl shadow-[#415552]/10 sm:p-8`}>{children}</section>
    <p className="relative text-xs text-[#8a9593]">Acceso privado para el equipo de Festiland · Santo Domingo</p>
  </main>;
}

export function PasswordInput({ value, onChange, id, autoComplete, testId, placeholder }: { value: string; onChange: (v: string) => void; id: string; autoComplete: string; testId: string; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return <div className="relative"><Input id={id} type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} autoComplete={autoComplete} maxLength={PASSWORD_MAX} placeholder={placeholder} className="h-12 border-[#ded8cc] bg-white pr-11" data-testid={testId}/><button type="button" onClick={() => setShow(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[#7c8a88] hover:bg-[#f4f0e7]" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} data-testid={`${testId}-toggle`}>{show ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>;
}

const errStatus = (e: unknown) => (e as { status?: number } | null)?.status;

export function SignInScreen() {
  const qc = useQueryClient();
  const { session, loading } = useAuth();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => setPassword(''), []);
  if (session?.user) return <Redirect to="/" replace/>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) { setError('Escribe tu correo y tu contraseña.'); return; }
    login.mutate({ data: { email: email.trim().toLowerCase(), password } }, {
      onSuccess: async s => {
        setPassword('');
        await qc.cancelQueries({ queryKey: sessionKey });
        clearUserData(qc);
        qc.setQueryData(sessionKey, s);
      },
      onError: err => { setPassword(''); setError(errStatus(err) === 429 ? 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.' : 'No pudimos iniciar sesión. Revisa el correo y la contraseña.'); },
    });
  };

  return <AuthFrame>
    <p className="text-xs font-bold uppercase tracking-[.16em] text-[#bd4778]">Acceso del equipo</p>
    <h1 className="mt-1 text-3xl font-bold">Qué bueno verte</h1>
    <p className="mt-1 text-sm text-[#738285]">Inicia sesión para continuar con la tienda.</p>
    {session?.setupRequired && <SetupNotice/>}
    <form onSubmit={submit} className="mt-6 grid gap-4" noValidate>
      <label className="grid gap-1.5 text-sm font-semibold text-[#43585a]" htmlFor="login-email">Correo<Input id="login-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} className="h-12 border-[#ded8cc] bg-white" data-testid="input-login-email"/></label>
      <label className="grid gap-1.5 text-sm font-semibold text-[#43585a]" htmlFor="login-password">Contraseña<PasswordInput id="login-password" value={password} onChange={setPassword} autoComplete="current-password" testId="input-login-password"/></label>
      {error && <p role="alert" className="rounded-xl bg-[#fff1f4] px-3 py-2.5 text-sm font-semibold text-[#a83968]" data-testid="text-login-error">{error}</p>}
      <Button disabled={login.isPending || loading} className="h-12 bg-[#bd4778] text-base font-bold hover:bg-[#a83968]" data-testid="button-login">{login.isPending ? 'Entrando…' : 'Entrar'}</Button>
    </form>
    <p className="mt-5 text-center text-xs leading-5 text-[#83908e]">¿Olvidaste tu contraseña? Pide al propietario o a la gerencia que te asigne una contraseña temporal.</p>
  </AuthFrame>;
}

function SetupNotice() {
  return <div className="mt-5 flex gap-3 rounded-2xl border border-[#f0e2b4] bg-[#fdf6dc] p-4 text-sm text-[#6d5a1d]" data-testid="notice-setup-required"><ServerCog size={20} className="mt-0.5 shrink-0"/><div><b>Configuración inicial pendiente en el servidor.</b><p className="mt-1 leading-5">La cuenta del propietario aún no está preparada. Quien administra el despliegue debe definir el correo del propietario y su contraseña inicial en la configuración del servidor y reiniciar la aplicación.</p></div></div>;
}

export function SignUpNotice() {
  return <AuthFrame>
    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f1ec] text-[#398477]"><LockKeyhole size={20}/></span>
    <h1 className="mt-4 text-2xl font-bold">No hay registro público</h1>
    <p className="mt-2 text-sm leading-6 text-[#738285]">Festiland Gestión es privado. Las cuentas las crea el propietario o la gerencia desde la sección Equipo, con una contraseña temporal que cambiarás en tu primer acceso.</p>
    <Link href="/sign-in" className="mt-6 flex h-12 items-center justify-center rounded-xl bg-[#bd4778] font-bold text-white" data-testid="link-go-signin">Ir a iniciar sesión</Link>
  </AuthFrame>;
}

/** Formulario de cambio de contraseña. Las contraseñas se limpian al terminar o desmontar. */
export function ChangePasswordForm({ onDone, compact }: { onDone?: () => void; compact?: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reset = () => { setCurrent(''); setNext(''); setConfirm(''); };
  useEffect(() => () => reset(), []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!current) { setError('Escribe tu contraseña actual.'); return; }
    if (next.length < PASSWORD_MIN) { setError(`La nueva contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`); return; }
    if (next.length > PASSWORD_MAX) { setError(`Máximo ${PASSWORD_MAX} caracteres.`); return; }
    if (next !== confirm) { setError('La confirmación no coincide.'); return; }
    if (next === current) { setError('La nueva contraseña debe ser distinta de la actual.'); return; }
    change.mutate({ data: { currentPassword: current, newPassword: next } }, {
      onSuccess: s => { reset(); qc.setQueryData(sessionKey, s); toast({ title: 'Contraseña actualizada' }); onDone?.(); },
      onError: err => { setCurrent(''); setError(errStatus(err) === 429 ? 'Demasiados intentos. Espera unos minutos.' : 'No se pudo cambiar. Verifica tu contraseña actual e inténtalo de nuevo.'); },
    });
  };
  const lbl = 'grid gap-1.5 text-sm font-semibold text-[#43585a]';
  return <form onSubmit={submit} className={`grid gap-4 ${compact ? 'sm:max-w-md' : ''}`} noValidate>
    <label className={lbl} htmlFor="pw-current">Contraseña actual<PasswordInput id="pw-current" value={current} onChange={setCurrent} autoComplete="current-password" testId="input-current-password"/></label>
    <label className={lbl} htmlFor="pw-new">Nueva contraseña<PasswordInput id="pw-new" value={next} onChange={setNext} autoComplete="new-password" testId="input-new-password"/><span className={`text-xs font-normal ${next && next.length < PASSWORD_MIN ? 'text-[#bd4778]' : 'text-[#83908e]'}`}>Mínimo {PASSWORD_MIN} caracteres{next ? ` · ${next.length}` : ''}. Una frase larga es más segura y fácil de recordar.</span></label>
    <label className={lbl} htmlFor="pw-confirm">Confirmar nueva contraseña<PasswordInput id="pw-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" testId="input-confirm-password"/></label>
    {error && <p role="alert" className="rounded-xl bg-[#fff1f4] px-3 py-2.5 text-sm font-semibold text-[#a83968]" data-testid="text-password-error">{error}</p>}
    <Button disabled={change.isPending} className="h-12 gap-2 bg-[#bd4778] font-bold hover:bg-[#a83968]" data-testid="button-change-password"><KeyRound size={16}/>{change.isPending ? 'Guardando…' : 'Cambiar contraseña'}</Button>
  </form>;
}

function ForcePasswordChange({ user }: { user: TeamUser }) {
  const { logout, loggingOut } = useAuth();
  return <AuthFrame wide>
    <p className="text-xs font-bold uppercase tracking-[.16em] text-[#bd4778]">Primer acceso</p>
    <h1 className="mt-1 text-2xl font-bold">Crea tu contraseña personal</h1>
    <p className="mb-5 mt-1 text-sm leading-6 text-[#738285]">Hola, {user.name || user.email}. Entraste con una contraseña temporal; cámbiala para continuar. Nadie más debe conocerla.</p>
    <ChangePasswordForm/>
    <button onClick={() => logout()} disabled={loggingOut} className="mx-auto mt-4 flex items-center gap-2 text-sm font-semibold text-[#7c8a88] hover:text-[#263d40]" data-testid="button-signout-forced"><LogOut size={15}/>Cerrar sesión</button>
  </AuthFrame>;
}

/** Protege las rutas internas: sesión válida, cuenta activa y contraseña definitiva. */
export function AuthGate({ children }: { children: (user: TeamUser) => ReactNode }) {
  const { session, loading, error, retry, logout } = useAuth();
  if (loading) return <div className="grid min-h-[100dvh] place-items-center bg-[#f6f4ed]"><div className="w-full max-w-md p-6"><LoadingBlock/></div></div>;
  if (error) return <AuthFrame><h1 className="text-2xl font-bold">No pudimos verificar tu sesión</h1><p className="mt-2 text-sm text-[#738285]">Comprueba tu conexión con el servidor de la tienda.</p><Button onClick={retry} className="mt-5 w-full bg-[#bd4778]" data-testid="button-retry-session">Reintentar</Button></AuthFrame>;
  const user = session?.user;
  if (!user) return <Redirect to="/sign-in" replace/>;
  if (!user.active) return <AuthFrame><h1 className="text-2xl font-bold">Cuenta desactivada</h1><p className="mt-2 text-sm text-[#738285]">Tu acceso fue desactivado. Contacta al propietario del comercio.</p><Button variant="outline" className="mt-5 w-full" onClick={() => logout()} data-testid="button-signout-inactive">Cerrar sesión</Button></AuthFrame>;
  if (user.mustChangePassword) return <ForcePasswordChange user={user}/>;
  return <>{children(user)}</>;
}
