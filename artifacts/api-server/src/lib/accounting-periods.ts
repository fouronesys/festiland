export function localAccountingDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(now);
}

export function automaticLockedThrough(
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined,
  today = localAccountingDate(),
) {
  return periodStart && periodEnd && periodEnd < today ? periodEnd : null;
}

export function isDateInAutomaticallyClosedPeriod(
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined,
  entryDate: string,
  today = localAccountingDate(),
) {
  return !!periodStart && !!periodEnd && periodEnd < today
    && entryDate >= periodStart && entryDate <= periodEnd;
}
