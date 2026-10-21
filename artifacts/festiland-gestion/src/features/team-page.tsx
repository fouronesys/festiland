import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListTeam, getListTeamQueryKey, useUpdateTeamRole, useCreateTeamAccount, useResetTeamPassword,
  getListAuditLogQueryKey, type TeamUser, type TeamRole,
} from '@workspace/api-client-react';
import { KeyRound, Plus, Search, UserCheck, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { EmptyState, ErrorBlock, LoadingBlock, Modal, fieldClass, labelClass } from '@/components/states';
import { PASSWORD_MAX, PASSWORD_MIN, PasswordInput } from './local-auth';
import type { Role } from '@/lib/access';

export const roleLabel: Record<Role, string> = { owner: 'Propietario', manager: 'Gerencia', cashier: 'Caja', inventory: 'Inventario', accountant: 'Contabilidad' };
const allRoles: Role[] = ['owner', 'manager', 'cashier', 'inventory', 'accountant'];
const staffRoles: Role[] = ['cashier', 'inventory', 'accountant'];

/** Roles que el usuario actual puede crear / a quién puede asignar contraseña temporal. */
const creatableRoles = (me: Role): Role[] => me === 'owner' ? ['manager', ...staffRoles] : me === 'manager' ? staffRoles : [];
const canResetFor = (me: TeamUser, target: TeamUser) => target.id !== me.id && (me.role === 'owner' || (me.role === 'manager' && staffRoles.includes(target.role)));
const errMsg = (e: unknown, fallback: string) => {
  const s = (e as { status?: number } | null)?.status;
  if (s === 409) return 'Ya existe una cuenta con ese correo.';
  if (s === 403) return 'Tu rol no permite esta acción.';
  if (s === 429) return 'Demasiados intentos. Espera unos minutos.';
  return fallback;
};

export function TeamPage({ me }: { me: TeamUser }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const teamQ = useListTeam({ query: { queryKey: getListTeamQueryKey() } });
  const updateRole = useUpdateTeamRole();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<TeamUser | null>(null);
  const isOwner = me.role === 'owner';
  const canCreate = creatableRoles(me.role).length > 0;
  const refresh = () => Promise.all([getListTeamQueryKey(), getListAuditLogQueryKey()].map(queryKey => qc.invalidateQueries({ queryKey })));

  const patch = (u: TeamUser, data: { role: TeamRole; active?: boolean }, ok: string) => updateRole.mutate({ userId: u.id, data }, {
    onSuccess: async () => { await refresh(); toast({ title: ok }); },
    onError: e => toast({ title: 'No se pudo actualizar', description: errMsg(e, 'Inténtalo de nuevo.'), variant: 'destructive' }),
  });
  const toggleActive = (u: TeamUser) => {
    if (u.active && !window.confirm(`¿Desactivar a ${u.name || u.email}? No podrá entrar hasta que la reactives.`)) return;
    patch(u, { role: u.role, active: !u.active }, u.active ? 'Integrante desactivado' : 'Integrante activado');
  };

  const rows = (teamQ.data || []).filter(u => !search || `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase()));

  return <section>
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="text-sm font-medium text-[#82908f]">Cuentas locales del personal</p><h2 className="mt-1 text-3xl font-bold">Equipo</h2></div>
      <div className="flex gap-2"><label className="relative flex-1 sm:w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#879291]" size={17}/><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="h-11 border-[#e3ddd1] bg-white pl-10" data-testid="input-search-team"/></label>
        {canCreate && <Button onClick={() => setCreating(true)} className="h-11 gap-2 bg-[#bd4778] hover:bg-[#a83968]" data-testid="button-create-account"><Plus size={17}/><span className="hidden sm:inline">Crear cuenta</span><span className="sm:hidden">Crear</span></Button>}</div>
    </div>
    <div className="mb-5 rounded-2xl border border-[#d8e8e2] bg-[#f1f8f5] p-4 text-sm leading-6 text-[#3d6660]">Cada cuenta se crea con una contraseña temporal que la persona debe cambiar en su primer acceso. Entrega la temporal en persona; el sistema no envía correos. {isOwner ? 'Como propietario puedes cambiar roles y activar o desactivar cuentas.' : 'Solo el propietario puede cambiar roles o desactivar cuentas; la gerencia gestiona cuentas de caja, inventario y contabilidad.'}</div>
    {teamQ.isLoading ? <LoadingBlock/> : teamQ.isError ? <ErrorBlock retry={teamQ.refetch}/> : !rows.length ? <EmptyState title={search ? 'Sin coincidencias' : 'Aún no hay integrantes'} body={search ? 'Prueba con otro nombre o correo.' : 'Crea la primera cuenta del equipo.'}/> :
      <div className="overflow-x-auto rounded-2xl border border-[#e8e2d6] bg-white"><table className="w-full min-w-[760px] text-left text-sm">
        <thead><tr className="border-b border-[#eee9df] text-xs uppercase tracking-wide text-[#8a9694]"><th className="px-5 py-3">Integrante</th><th className="px-3 py-3">Rol</th><th className="px-3 py-3">Acceso</th><th className="px-3 py-3">Estado</th><th className="px-5 py-3 text-right">Acciones</th></tr></thead>
        <tbody>{rows.map(u => {
          const self = u.id === me.id;
          return <tr key={u.id} className="border-b border-[#f0ede7] last:border-0" data-testid={`row-team-${u.id}`}>
            <td className="px-5 py-3.5"><b className="block">{u.name || u.email}{self && <span className="ml-2 rounded bg-[#f6d76a] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#214447]">Tú</span>}</b><small className="text-[#83908e]">{u.email}</small></td>
            <td className="px-3">{isOwner && !self
              ? <select aria-label={`Rol de ${u.email}`} value={u.role} disabled={updateRole.isPending} onChange={e => patch(u, { role: e.target.value as TeamRole, active: u.active }, 'Rol actualizado')} className="rounded-lg border border-[#e2dbcf] bg-white px-2 py-1.5 text-sm" data-testid={`select-role-${u.id}`}>{allRoles.map(r => <option key={r} value={r}>{roleLabel[r]}</option>)}</select>
              : <span className="font-semibold">{roleLabel[u.role]}</span>}</td>
            <td className="px-3">{!u.hasLocalLogin ? <span className="rounded-full bg-[#fdf6dc] px-2.5 py-1 text-xs font-bold text-[#8a6a1b]">Sin contraseña</span> : u.mustChangePassword ? <span className="rounded-full bg-[#fff1f4] px-2.5 py-1 text-xs font-bold text-[#bd4778]">Temporal pendiente</span> : <span className="rounded-full bg-[#e5f2ec] px-2.5 py-1 text-xs font-bold text-[#2f6f63]">Configurado</span>}</td>
            <td className="px-3"><span className={`font-semibold ${u.active ? 'text-[#2f6f63]' : 'text-[#9a6a6a]'}`}>{u.active ? 'Activo' : 'Inactivo'}</span></td>
            <td className="px-5"><div className="flex justify-end gap-2">
              {canResetFor(me, u) && <Button size="sm" variant="outline" onClick={() => setResetting(u)} className="gap-1.5" data-testid={`button-reset-password-${u.id}`}><KeyRound size={14}/>{u.hasLocalLogin ? 'Temporal' : 'Asignar acceso'}</Button>}
              {isOwner && !self && <Button size="sm" variant="ghost" disabled={updateRole.isPending} onClick={() => toggleActive(u)} className={`gap-1.5 ${u.active ? 'text-[#a83968]' : 'text-[#2f6f63]'}`} data-testid={`button-toggle-active-${u.id}`}>{u.active ? <><UserX size={14}/>Desactivar</> : <><UserCheck size={14}/>Activar</>}</Button>}
            </div></td>
          </tr>;
        })}</tbody>
      </table></div>}
    {creating && <CreateAccountDialog me={me} onClose={() => setCreating(false)} onDone={refresh}/>}
    {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} onDone={refresh}/>}
  </section>;
}

function passwordProblem(pw: string, confirm: string) {
  if (pw.length < PASSWORD_MIN) return `La contraseña temporal debe tener al menos ${PASSWORD_MIN} caracteres.`;
  if (pw.length > PASSWORD_MAX) return `Máximo ${PASSWORD_MAX} caracteres.`;
  if (pw !== confirm) return 'La confirmación no coincide.';
  return null;
}

function CreateAccountDialog({ me, onClose, onDone }: { me: TeamUser; onClose: () => void; onDone: () => Promise<unknown> }) {
  const { toast } = useToast();
  const create = useCreateTeamAccount();
  const roles = creatableRoles(me.role);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>(roles.includes('cashier') ? 'cashier' : roles[0]);
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => { setPw(''); setConfirm(''); }, []);
  const close = () => { setPw(''); setConfirm(''); onClose(); };

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (!name.trim()) { setError('Escribe el nombre.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Escribe un correo válido.'); return; }
    const p = passwordProblem(pw, confirm); if (p) { setError(p); return; }
    create.mutate({ data: { name: name.trim(), email: email.trim().toLowerCase(), role, temporaryPassword: pw } }, {
      onSuccess: async u => { setPw(''); setConfirm(''); await onDone(); toast({ title: 'Cuenta creada', description: `${u.email} deberá cambiar la contraseña al entrar.` }); onClose(); },
      onError: err => setError(errMsg(err, 'No se pudo crear la cuenta. Revisa los datos.')),
    });
  };
  return <Modal title="Crear cuenta del equipo" eyebrow="Equipo" onClose={close}>
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <label className={`${labelClass} sm:col-span-2`}>Nombre<Input value={name} onChange={e => setName(e.target.value)} maxLength={120} className="h-11" autoComplete="off" data-testid="input-team-name"/></label>
      <label className={labelClass}>Correo<Input type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} className="h-11" autoComplete="off" data-testid="input-team-email"/></label>
      <label className={labelClass}>Rol<select value={role} onChange={e => setRole(e.target.value as Role)} className={fieldClass} data-testid="select-team-role">{roles.map(r => <option key={r} value={r}>{roleLabel[r]}</option>)}</select></label>
      <label className={labelClass} htmlFor="team-temp">Contraseña temporal<PasswordInput id="team-temp" value={pw} onChange={setPw} autoComplete="new-password" testId="input-team-temp-password"/></label>
      <label className={labelClass} htmlFor="team-temp2">Confirmar<PasswordInput id="team-temp2" value={confirm} onChange={setConfirm} autoComplete="new-password" testId="input-team-temp-confirm"/></label>
      <p className="text-xs text-[#83908e] sm:col-span-2">Mínimo {PASSWORD_MIN} caracteres. Compártela en persona; se pedirá cambiarla en el primer acceso.</p>
      {error && <p role="alert" className="rounded-xl bg-[#fff1f4] px-3 py-2.5 text-sm font-semibold text-[#a83968] sm:col-span-2" data-testid="text-team-error">{error}</p>}
      <div className="flex gap-3 sm:col-span-2"><Button type="button" variant="outline" onClick={close} className="h-12 flex-1">Cancelar</Button><Button disabled={create.isPending} className="h-12 flex-1 bg-[#bd4778] font-bold" data-testid="button-save-team-account">{create.isPending ? 'Creando…' : 'Crear cuenta'}</Button></div>
    </form>
  </Modal>;
}

function ResetPasswordDialog({ user, onClose, onDone }: { user: TeamUser; onClose: () => void; onDone: () => Promise<unknown> }) {
  const { toast } = useToast();
  const reset = useResetTeamPassword();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => { setPw(''); setConfirm(''); }, []);
  const close = () => { setPw(''); setConfirm(''); onClose(); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    const p = passwordProblem(pw, confirm); if (p) { setError(p); return; }
    reset.mutate({ userId: user.id, data: { temporaryPassword: pw } }, {
      onSuccess: async () => { setPw(''); setConfirm(''); await onDone(); toast({ title: 'Contraseña temporal asignada', description: 'Sus sesiones abiertas se cerraron.' }); onClose(); },
      onError: err => setError(errMsg(err, 'No se pudo asignar la contraseña.')),
    });
  };
  return <Modal title={user.hasLocalLogin ? 'Nueva contraseña temporal' : 'Asignar acceso local'} eyebrow={user.name || user.email} onClose={close}>
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <p className="text-sm leading-6 text-[#738285]">{user.hasLocalLogin ? 'Se reemplazará la contraseña actual y se cerrarán todas sus sesiones.' : 'Esta cuenta aún no tiene contraseña local.'} La persona deberá cambiarla al entrar.</p>
      <label className={labelClass} htmlFor="reset-temp">Contraseña temporal<PasswordInput id="reset-temp" value={pw} onChange={setPw} autoComplete="new-password" testId="input-reset-password"/></label>
      <label className={labelClass} htmlFor="reset-temp2">Confirmar<PasswordInput id="reset-temp2" value={confirm} onChange={setConfirm} autoComplete="new-password" testId="input-reset-confirm"/></label>
      {error && <p role="alert" className="rounded-xl bg-[#fff1f4] px-3 py-2.5 text-sm font-semibold text-[#a83968]" data-testid="text-reset-error">{error}</p>}
      <div className="flex gap-3"><Button type="button" variant="outline" onClick={close} className="h-12 flex-1">Cancelar</Button><Button disabled={reset.isPending} className="h-12 flex-1 bg-[#bd4778] font-bold" data-testid="button-save-reset">{reset.isPending ? 'Guardando…' : 'Asignar'}</Button></div>
    </form>
  </Modal>;
}
