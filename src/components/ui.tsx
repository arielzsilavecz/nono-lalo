import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-tomate-500 text-white hover:bg-tomate-600 disabled:bg-tomate-300 shadow-sm',
  secondary:
    'bg-navy-700 text-crema-50 hover:bg-navy-800 disabled:bg-navy-300 shadow-sm',
  danger:
    'bg-white text-tomate-700 border border-tomate-300 hover:bg-tomate-100 disabled:opacity-50',
  ghost:
    'bg-transparent text-navy-700 hover:bg-crema-200 disabled:opacity-50',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({ variant = 'primary', className = '', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  )
}

const FIELD_STYLES =
  'w-full rounded-lg border border-crema-300 bg-white px-3 py-2 text-sm text-navy-900 placeholder:text-navy-300 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200'

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD_STYLES} ${className}`} {...props} />
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${FIELD_STYLES} ${className}`} {...props} />
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${FIELD_STYLES} ${className}`} {...props} />
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-navy-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-navy-500">{hint}</span>}
    </label>
  )
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-crema-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

type BadgeTone = 'navy' | 'green' | 'amber' | 'red' | 'gray'

const BADGE_STYLES: Record<BadgeTone, string> = {
  navy: 'bg-navy-100 text-navy-800',
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-tomate-100 text-tomate-700',
  gray: 'bg-gray-100 text-gray-600',
}

export function Badge({ tone = 'navy', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${BADGE_STYLES[tone]}`}>
      {children}
    </span>
  )
}

export function Spinner() {
  return (
    <div
      className="h-8 w-8 animate-spin rounded-full border-4 border-crema-300 border-t-tomate-500"
      role="status"
      aria-label="Cargando"
    />
  )
}

export function LoadingBlock() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-crema-300 px-6 py-12 text-center">
      <p className="font-script text-3xl text-navy-600">{title}</p>
      {children && <div className="mt-2 text-sm text-navy-500">{children}</div>}
    </div>
  )
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-script text-3xl font-bold text-navy-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full px-2 text-2xl leading-none text-navy-400 hover:bg-crema-200 hover:text-navy-700"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function PageTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-script text-4xl font-bold text-navy-800">{title}</h1>
      {action}
    </div>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-tomate-100 px-3 py-2 text-sm font-semibold text-tomate-700">{children}</p>
}
