import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  children: ReactNode
  onClose: () => void
  maxWidth?: string
}

export function ModalOverlay({ children, onClose, maxWidth = 'max-w-xl' }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className={`flex w-full ${maxWidth} flex-col rounded-xl bg-crema-50 shadow-2xl`}
        style={{ maxHeight: '88vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botón cerrar — fuera del área scrolleable */}
        <div className="flex shrink-0 justify-end px-4 pt-3 pb-1">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full p-1.5 text-navy-400 hover:bg-crema-200 hover:text-navy-700"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Contenido scrolleable */}
        <div className="overflow-y-auto px-6 pb-6">
          {children}
        </div>
      </div>
    </div>
  )
}
