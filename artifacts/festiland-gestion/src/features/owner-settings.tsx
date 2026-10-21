import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useChangeOwnerEmail, getGetAuthSessionQueryKey, getListTeamQueryKey, getListAuditLogQueryKey,
  useGetSmtpSettings, getGetSmtpSettingsQueryKey, useUpdateSmtpSettings, useSendTestEmail,
  type AuthSession, type SmtpSettings,
} from '@workspace/api-client-react';
import { AtSign, MailCheck, Send, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ErrorBlock, LoadingBlock, fieldClass, labelClass } from '@/components/states';
import { PasswordInput, useAuth } from './local-auth';

const status = (e: unknown) => (e as { status?: number } | null)?.status;
const apiMessage = (e: unknown) => {
  const d = (e as { data?: unknown } | null)?.data as { error?: unknown; message?: unknown } | undefined;
  const m = typeof d?.error === 'string' ? d.error : typeof d?.message === 'string' ? d.message : null;
  return m && m.length < 200 ? m : null;
};

/** Bloques exclusivos del propietario. No se montan (ni consultan) para otros roles. */
export function OwnerSettings() {
  const { session } = useAuth();
  if (session?.user?.role !== 'owner') return null;
  return <>
    <OwnerEmailCard currentEmail={session.user.email}/>
    <SmtpCard ownerEmail={session.user.email}/>
  </>;
}

function OwnerEmailCard({ currentEmail }: { currentEmail: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const change = useChangeOwnerEmail();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  useEffect(() => () => setPassword(''), []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setNotice(null);
    const next = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(next) || next.length > 254) { setError('Escribe un correo válido.'); return; }
    if (next === currentEmail.toLowerCase()) { setError('Ese ya es tu correo actual.'); return; }
    if (!password) { setError('Confirma con tu contraseña actual.'); return; }
    change.mutate({ data: { newEmail: next, currentPassword: password } }, {
      onSuccess: async res => {
        setPassword(''); setEmail('');
        qc.setQueryData<AuthSession>(getGetAuthSessionQueryKey(), old => ({ setupRequired: old?.setupRequired ?? false, user: res.user }));
        await Promise.all([getListTeamQueryKey(), getListAuditLogQueryKey()].map(queryKey => qc.invalidateQueries({ queryKey })));
        const note = res.notification === 'sent'
          ? { tone: 'ok' as const, text: 'Correo actualizado. Enviamos un aviso al correo anterior.' }
          : res.notification === 'not_configured'
            ? { tone: 'warn' as const, text: 'Correo actualizado. No se envió aviso porque el correo saliente (SMTP) no está configurado.' }
            : { tone: 'warn' as const, text: 'Correo actualizado, pero el aviso por correo no se pudo enviar. Revisa la configuración SMTP.' };
        setNotice(note);
        toast({ title: 'Correo del propietario actualizado', description: 'Las demás sesiones se cerraron.' });
      },
      onError: err => {
        setPassword('');
        const s = status(err);
        setError(s === 409 ? 'Ese correo ya pertenece a otra cuenta.' : s === 429 ? 'Demasiados intentos. Espera unos minutos.' : s === 401 || s === 403 ? 'No se pudo confirmar. Verifica tu contraseña actual.' : apiMessage(err) || 'No se pudo cambiar el correo.');
      },
    });
  };

  return <section className="rounded-2xl border border-[#e8e2d6] bg-white p-6" data-testid="section-owner-email">
    <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f8e5ed] text-[#bd4778]"><AtSign size={18}/></span><div><h3 className="text-xl font-bold">Correo del propietario</h3><p className="text-sm text-[#82908f]">Es el correo con el que entras. Al cambiarlo se cierran las demás sesiones abiertas.</p></div></div>
    <p className="mt-4 text-sm">Actual: <b data-testid="text-owner-email">{currentEmail}</b></p>
    <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
      <label className={labelClass}>Nuevo correo<Input type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} autoComplete="email" className="h-11" data-testid="input-owner-new-email"/></label>
      <label className={labelClass} htmlFor="owner-email-pw">Contraseña actual<PasswordInput id="owner-email-pw" value={password} onChange={setPassword} autoComplete="current-password" testId="input-owner-email-password"/></label>
      {error && <p role="alert" className="rounded-xl bg-[#fff1f4] px-3 py-2.5 text-sm font-semibold text-[#a83968] sm:col-span-2" data-testid="text-owner-email-error">{error}</p>}
      {notice && <p role="status" className={`rounded-xl px-3 py-2.5 text-sm font-semibold sm:col-span-2 ${notice.tone === 'ok' ? 'bg-[#e5f2ec] text-[#2f6f63]' : 'bg-[#fdf6dc] text-[#7a5d12]'}`} data-testid="text-owner-email-notice">{notice.text}</p>}
      <div className="sm:col-span-2"><Button disabled={change.isPending} className="h-11 bg-[#214447]" data-testid="button-change-owner-email">{change.isPending ? 'Guardando…' : 'Cambiar correo'}</Button></div>
    </form>
  </section>;
}

type SmtpForm = { host: string; port: 465 | 587; fromName: string; enabled: boolean };

function SmtpCard({ ownerEmail }: { ownerEmail: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useGetSmtpSettings({ query: { queryKey: getGetSmtpSettingsQueryKey() } });
  const update = useUpdateSmtpSettings();
  const test = useSendTestEmail();
  const [form, setForm] = useState<SmtpForm>({ host: 'smtppro.zoho.com', port: 465, fromName: 'Festiland', enabled: false });
  const [error, setError] = useState<string | null>(null);
  const init = useRef(false);
  const data = q.data;

  useEffect(() => {
    if (data && !init.current) { init.current = true; setForm({ host: data.host, port: data.port === 587 ? 587 : 465, fromName: data.fromName, enabled: data.enabled }); }
  }, [data]);

  if (q.isLoading) return <LoadingBlock/>;
  if (q.isError || !data) return <ErrorBlock retry={q.refetch} message="No se pudo cargar la configuración de correo."/>;

  const dirty = form.host !== data.host || form.port !== data.port || form.fromName !== data.fromName || form.enabled !== data.enabled;
  const canTest = data.credentialsConfigured && data.enabled && !dirty;

  const save = (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    const host = form.host.trim(); const fromName = form.fromName.trim();
    if (host.length < 5 || host.length > 120 || /\s|\//.test(host)) { setError('Escribe un servidor válido, por ejemplo smtppro.zoho.com.'); return; }
    if (!fromName || fromName.length > 80) { setError('Escribe el nombre del remitente (máximo 80 caracteres).'); return; }
    update.mutate({ data: { host, port: form.port, fromName, enabled: form.enabled } }, {
      onSuccess: async (saved: SmtpSettings) => {
        qc.setQueryData(getGetSmtpSettingsQueryKey(), saved);
        setForm({ host: saved.host, port: saved.port === 587 ? 587 : 465, fromName: saved.fromName, enabled: saved.enabled });
        await qc.invalidateQueries({ queryKey: getListAuditLogQueryKey() });
        toast({ title: 'Configuración de correo guardada' });
      },
      onError: err => setError(apiMessage(err) || 'No se pudo guardar la configuración.'),
    });
  };
  const sendTest = () => test.mutate(undefined as never, {
    onSuccess: res => toast({ title: 'Prueba enviada', description: res?.message || `Revisa la bandeja de ${ownerEmail}.` }),
    onError: err => toast({ title: 'La prueba falló', description: apiMessage(err) || 'El servidor no pudo enviar el correo. Revisa servidor, puerto y credenciales.', variant: 'destructive' }),
  });

  return <section className="rounded-2xl border border-[#e8e2d6] bg-white p-6" data-testid="section-smtp">
    <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e3f1ee] text-[#2f6f63]"><MailCheck size={18}/></span><div><h3 className="text-xl font-bold">Correo saliente (Zoho SMTP)</h3><p className="text-sm text-[#82908f]">Se usa para avisos de seguridad, como el cambio de correo del propietario.</p></div></div>

    <div className={`mt-5 flex items-start gap-3 rounded-xl p-4 text-sm ${data.credentialsConfigured ? 'bg-[#e5f2ec] text-[#2f6f63]' : 'bg-[#fdf6dc] text-[#6d5a1d]'}`} data-testid="text-smtp-credentials">
      <ShieldAlert size={18} className="mt-0.5 shrink-0"/>
      {data.credentialsConfigured
        ? <span><b>Credenciales configuradas en el servidor.</b>{data.senderEmail && <> Remitente: <b>{data.senderEmail}</b>.</>} La contraseña nunca se muestra aquí.</span>
        : <span><b>Faltan credenciales.</b> Quien administra el servidor debe definir ZOHO_SMTP_USER y ZOHO_SMTP_PASSWORD como variables de entorno y reiniciar. Por seguridad no se escriben desde esta pantalla.</span>}
    </div>

    <form onSubmit={save} className="mt-5 grid gap-4 sm:grid-cols-2" noValidate>
      <label className={labelClass}>Servidor<Input value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} maxLength={120} className="h-11" data-testid="input-smtp-host"/><span className="text-xs font-normal text-[#83908e]">smtppro.zoho.com por defecto; cámbialo según la región de tu cuenta Zoho.</span></label>
      <label className={labelClass}>Puerto y seguridad<select value={form.port} onChange={e => setForm(f => ({ ...f, port: Number(e.target.value) === 587 ? 587 : 465 }))} className={fieldClass} data-testid="select-smtp-port"><option value={465}>465 · SSL</option><option value={587}>587 · STARTTLS obligatorio</option></select></label>
      <label className={labelClass}>Nombre del remitente<Input value={form.fromName} onChange={e => setForm(f => ({ ...f, fromName: e.target.value }))} maxLength={80} className="h-11" data-testid="input-smtp-from-name"/></label>
      <label className="flex items-center gap-2 self-end pb-3 text-sm font-semibold"><input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} className="h-4 w-4 accent-[#bd4778]" data-testid="checkbox-smtp-enabled"/>Envío de correos activado</label>
      {error && <p role="alert" className="rounded-xl bg-[#fff1f4] px-3 py-2.5 text-sm font-semibold text-[#a83968] sm:col-span-2" data-testid="text-smtp-error">{error}</p>}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button disabled={update.isPending || !dirty} className="h-11 bg-[#214447]" data-testid="button-save-smtp">{update.isPending ? 'Guardando…' : 'Guardar configuración'}</Button>
        <Button type="button" variant="outline" disabled={!canTest || test.isPending} onClick={sendTest} className="h-11 gap-2" data-testid="button-test-smtp"><Send size={15}/>{test.isPending ? 'Enviando…' : 'Enviar correo de prueba'}</Button>
        <span className="text-xs text-[#83908e]">{!data.credentialsConfigured ? 'La prueba requiere credenciales en el servidor.' : !data.enabled ? 'Activa y guarda para poder probar.' : dirty ? 'Guarda los cambios antes de probar.' : `Se enviará a ${ownerEmail}.`}</span>
      </div>
    </form>
  </section>;
}
