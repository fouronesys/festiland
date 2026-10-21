type PickupTimeFieldProps = {
  value: string;
  onChange: (value: string) => void;
  testId: string;
};

export function PickupTimeField({ value, onChange, testId }: PickupTimeFieldProps) {
  const parsed = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  const hour24 = parsed ? Number(parsed[1]) : null;
  const hour12 = hour24 === null ? '' : String(hour24 % 12 || 12);
  const minute = parsed?.[2] ?? '';
  const period = hour24 === null ? '' : hour24 >= 12 ? 'PM' : 'AM';

  const update = (nextHour: string, nextMinute = minute || '00', nextPeriod = period || 'AM') => {
    if (!nextHour) {
      onChange('');
      return;
    }
    const hour12Value = Number(nextHour);
    const hour24Value = (hour12Value % 12) + (nextPeriod === 'PM' ? 12 : 0);
    onChange(`${String(hour24Value).padStart(2, '0')}:${nextMinute}`);
  };

  const selectClass = 'h-11 min-w-0 rounded-xl border border-[#ded8cc] bg-white px-2 text-sm font-normal text-[#263d40] outline-none focus:border-[#bd4778]';
  return <div className="grid grid-cols-[1fr_1fr_1.1fr] gap-2" data-testid={testId}>
    <label className="sr-only" htmlFor={`${testId}-hour`}>Hora</label>
    <select id={`${testId}-hour`} aria-label="Hora (12 horas)" value={hour12} onChange={event => update(event.target.value)} className={selectClass} data-testid={`${testId}-hour`}>
      <option value="">Sin hora</option>
      {Array.from({ length: 12 }, (_, index) => String(index + 1)).map(hour => <option key={hour} value={hour}>{hour}</option>)}
    </select>
    <label className="sr-only" htmlFor={`${testId}-minute`}>Minutos</label>
    <select id={`${testId}-minute`} aria-label="Minutos" value={minute} disabled={!hour12} onChange={event => update(hour12, event.target.value)} className={selectClass} data-testid={`${testId}-minute`}>
      {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0')).map(value => <option key={value} value={value}>{value}</option>)}
    </select>
    <label className="sr-only" htmlFor={`${testId}-period`}>AM o PM</label>
    <select id={`${testId}-period`} aria-label="AM o PM" value={period} disabled={!hour12} onChange={event => update(hour12, minute || '00', event.target.value)} className={selectClass} data-testid={`${testId}-period`}>
      <option value="AM">AM</option><option value="PM">PM</option>
    </select>
  </div>;
}
