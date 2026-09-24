const STROOPS_PER_XLM = 10_000_000n;
const AMOUNT_PATTERN = /^\d+(?:\.\d{1,7})?$/;

export function amountToStroops(amount: string): bigint {
  if (!AMOUNT_PATTERN.test(amount)) {
    throw new Error('El monto debe ser un decimal no negativo con hasta 7 decimales.');
  }

  const [whole = '0', fraction = ''] = amount.split('.');
  return BigInt(whole) * STROOPS_PER_XLM + BigInt(fraction.padEnd(7, '0'));
}

export function stroopsToAmount(stroops: bigint): string {
  const safe = stroops < 0n ? 0n : stroops;
  const whole = safe / STROOPS_PER_XLM;
  const fraction = (safe % STROOPS_PER_XLM).toString().padStart(7, '0');
  return `${whole}.${fraction}`;
}
