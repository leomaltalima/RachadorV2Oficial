export function formatCurrencyInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10);
  if (num === 0) return '';
  const reais = Math.floor(num / 100);
  const centavos = num % 100;
  const reaisStr = reais > 0 ? reais.toLocaleString('pt-BR') : '0';
  return `${reaisStr},${centavos.toString().padStart(2, '0')}`;
}

export function toCurrencyMask(value: number): string {
  const cents = Math.round(value * 100);
  if (cents === 0) return '';
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;
  const reaisStr = reais > 0 ? reais.toLocaleString('pt-BR') : '0';
  return `${reaisStr},${centavos.toString().padStart(2, '0')}`;
}

export function parseCurrencyMask(masked: string): number {
  const digits = masked.replace(/\D/g, '');
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
}

export function distributeCents(totalValue: number, unroundedAmounts: number[], ids: number[]) {
  const totalCents = Math.round(totalValue * 100);
  let sumCents = 0;
  
  const devidos = unroundedAmounts.map(v => {
    const cents = Math.round(v * 100);
    sumCents += cents;
    return cents;
  });
  
  let remainder = totalCents - sumCents;
  
  let i = 0;
  while (remainder !== 0 && devidos.length > 0) {
    if (remainder > 0) {
      devidos[i]++;
      remainder--;
    } else {
      devidos[i]--;
      remainder++;
    }
    i = (i + 1) % devidos.length;
  }
  
  return devidos.map((c, idx) => ({
    participanteId: ids[idx],
    valorDevido: c / 100,
  }));
}
