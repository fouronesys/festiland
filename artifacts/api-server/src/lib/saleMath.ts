export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Price is tax-inclusive only when explicitly configured on the assigned active rate. */
export function calculateSaleLine(input: {
  price: number; quantity: number; subtotal: number; discount: number;
  rate?: number; inclusive?: boolean;
}) {
  const base = input.price * input.quantity;
  const allocatedDiscount = input.subtotal > 0 ? input.discount * base / input.subtotal : 0;
  const net = Math.max(0, base - allocatedDiscount);
  const rate = input.rate ?? 0;
  const tax = input.inclusive ? net * rate / (100 + rate) : net * rate / 100;
  return {
    base,
    taxAmount: roundMoney(tax),
    lineTotal: roundMoney(input.inclusive ? net : net + tax),
  };
}
