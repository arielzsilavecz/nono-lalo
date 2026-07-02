import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatShortDateTime } from '../lib/format'
import { Check, X } from 'lucide-react'
import { Button, ErrorText, LoadingBlock } from './ui'
import { ModalOverlay } from './ModalOverlay'

interface BugReport {
  id: string
  description: string
  page: string
  image_data: string | null
  resolved: boolean
  created_at: string
}

const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4 MB (frontend limit)
const MAX_BASE64_SIZE = 8 * 1024 * 1024 // 8 MB (backend limit)

export function BugReportsModal({ onClose }: { onClose: () => void }) {
  const location = useLocation()

  const [reports, setReports] = useState<BugReport[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [description, setDescription] = useState('')
  const [imageData, setImageData] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('bug_reports')
      .select('*')
      .order('resolved', { ascending: true })
      .order('created_at', { ascending: false })
    setReports((data ?? []) as BugReport[])
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!creating) return
    function handlePasteGlobal(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            readFile(file)
            e.preventDefault()
          }
          break
        }
      }
    }
    document.addEventListener('paste', handlePasteGlobal)
    return () => document.removeEventListener('paste', handlePasteGlobal)
  }, [creating])

  function readFile(file: File | null) {
    if (!file || !file.type.startsWith('image/')) {
      setError('Solo se aceptan imágenes.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(`La imagen no puede superar ${MAX_FILE_SIZE / 1024 / 1024} MB.`)
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      if (result.length > MAX_BASE64_SIZE) {
        setError(`La imagen convertida es muy grande (máx ${MAX_BASE64_SIZE / 1024 / 1024} MB base64).`)
        return
      }
      setImageData(result)
      setError('')
    }
    reader.onerror = () => setError('Error al leer la imagen.')
    reader.readAsDataURL(file)
  }


  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) {
      setError('Describí el problema.')
      return
    }
    setSaving(true)
    setError('')

    const { error: insertError } = await supabase.from('bug_reports').insert({
      description: description.trim(),
      page: location.pathname,
      image_data: imageData,
    })

    if (insertError) {
      setError('No se pudo guardar el reporte.')
      setSaving(false)
      return
    }

    setDescription('')
    setImageData(null)
    setCreating(false)
    setSaving(false)
    load()
  }

  async function toggleResolved(report: BugReport) {
    await supabase.from('bug_reports').update({ resolved: !report.resolved }).eq('id', report.id)
    load()
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-script text-3xl font-bold text-navy-800">Reportes</h2>
          {!creating && (
            <Button onClick={() => setCreating(true)}>+ Nuevo reporte</Button>
          )}
        </div>

        {creating && (
          <form onSubmit={submit} className="space-y-3 rounded-xl border border-crema-300 bg-white p-4">
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describí el problema…"
              className="w-full resize-none rounded-lg border border-crema-300 bg-crema-50 px-3 py-2 text-sm text-navy-800 placeholder-navy-400 focus:border-navy-400 focus:outline-none"
            />

            <div className="space-y-2 rounded-lg border-2 border-dashed border-crema-300 bg-crema-50 p-4">
              <div className="text-center">
                <span className="text-xs font-semibold text-navy-600">Imagen (opcional)</span>
                <p className="mt-1 text-xs text-navy-500">Pegá una captura (Ctrl+V) o seleccioná un archivo</p>
              </div>

              {imageData ? (
                <div className="space-y-2">
                  <img src={imageData} alt="Preview" className="max-h-48 max-w-full rounded-lg object-contain mx-auto" />
                  <button
                    type="button"
                    onClick={() => setImageData(null)}
                    className="flex items-center justify-center gap-1 mx-auto rounded-full border border-crema-300 bg-crema-100 px-3 py-1 text-xs font-semibold text-navy-700 hover:bg-crema-200"
                  >
                    <X size={12} /> Quitar imagen
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center">
                  <span className="inline-block rounded-full border border-crema-300 bg-crema-100 px-3 py-1 text-xs font-semibold text-navy-700 hover:bg-crema-200">
                    Seleccionar archivo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => readFile(e.target.files?.[0] ?? null)}
                    />
                  </span>
                </label>
              )}
            </div>

            {error && <ErrorText>{error}</ErrorText>}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Enviando…' : 'Enviar reporte'}
              </Button>
              <Button variant="ghost" type="button" onClick={() => { setCreating(false); setError('') }}>
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {reports === null ? (
          <LoadingBlock />
        ) : reports.length === 0 ? (
          <p className="py-4 text-center text-sm text-navy-400">Sin reportes todavía.</p>
        ) : (
          <ul className="space-y-2">
            {reports.map((r) => (
              <li
                key={r.id}
                className={`rounded-xl border p-3 ${r.resolved ? 'border-crema-200 bg-crema-100 opacity-60' : 'border-crema-300 bg-white'}`}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${r.resolved ? 'line-through text-navy-400' : 'text-navy-800'}`}>
                      {r.description}
                    </p>
                    {r.image_data && (
                      <img src={r.image_data} alt="" className="mt-2 max-h-40 rounded-lg object-contain" />
                    )}
                    <p className="mt-1 text-xs text-navy-400">
                      {formatShortDateTime(r.created_at)} · {r.page}
                    </p>
                  </div>
                  <button
                    type="button"
                    title={r.resolved ? 'Marcar como pendiente' : 'Marcar como resuelto'}
                    onClick={() => toggleResolved(r)}
                    className={`shrink-0 cursor-pointer rounded-full p-1.5 transition-colors ${
                      r.resolved
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-crema-200 hover:text-navy-400'
                        : 'bg-crema-100 text-navy-400 hover:bg-emerald-100 hover:text-emerald-700'
                    }`}
                  >
                    <Check size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModalOverlay>
  )
}
