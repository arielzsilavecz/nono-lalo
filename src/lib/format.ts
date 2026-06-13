export function formatQty(n: number, decimals = 2): string {
  return n.toFixed(decimals).replace(/\.?0+$/, '').replace('.', ',')
}

export function formatARS(amount: number): string {
  const negative = amount < 0
  const [int, dec] = Math.abs(amount).toFixed(2).split('.')
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const formatted = dec === '00' ? intFormatted : `${intFormatted},${dec}`
  return `${negative ? '-' : ''}$ ${formatted}`
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Formatea una fecha 'YYYY-MM-DD' sin corrimientos de zona horaria. */
export function formatDateOnly(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const formatted = new Date(year, month - 1, day).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return capitalize(formatted)
}

export function formatDateTime(iso: string): string {
  const formatted = new Date(iso).toLocaleString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${capitalize(formatted)} hs`
}

export function formatShortDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** ISO -> valor para <input type="datetime-local"> en hora local. */
export function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Valor de <input type="datetime-local"> -> ISO (UTC). */
export function fromDatetimeLocal(value: string): string {
  return new Date(value).toISOString()
}

export function todayDateValue(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Normaliza un teléfono argentino para wa.me: deja solo dígitos y antepone
 * 549 si parece un número local de 10 dígitos (cód. de área + número).
 */
export function normalizePhoneForWa(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('54')) return digits
  if (digits.length === 10) return `549${digits}`
  return digits
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${normalizePhoneForWa(phone)}?text=${encodeURIComponent(text)}`
}
