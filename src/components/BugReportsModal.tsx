import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatShortDateTime } from '../lib/format'
import { Check } from 'lucide-react'
import { Button, ErrorText, LoadingBlock } from './ui'
import { ModalOverlay } from './ModalOverlay'

interface BugReport {
  id: string
  description: string
  image_url: string | null
  resolved: boolean
  created_at: string
}

export function BugReportsModal({ onClose }: { onClose: () => void }) {
  const [reports, setReports] = useState<BugReport[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [description, setDescription] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
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

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) { setError('Describí el problema.'); return }
    setSaving(true)
    setError('')

    let imageUrl: string | null = null
    if (pendingFile) {
      const ext = pendingFile.name.split('.').pop()
      const path = `${Date.now()}.${ext}`
      const { error: storageError } = await supabase.storage
        .from('bug-reports')
        .upload(path, pendingFile, { contentType: pendingFile.type })
      if (!storageError) {
        const { data: { publicUrl } } = supabase.storage.from('bug-reports').getPublicUrl(path)
        imageUrl = publicUrl
      }
    }

    const { error: insertError } = await supabase.from('bug_reports').insert({
      description: description.trim(),
      image_url: imageUrl,
    })
    if (insertError) { setError('No se pudo guardar el reporte.'); setSaving(false); return }
    setDescription('')
    setPendingFile(null)
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
            <div>
              <span className="text-xs font-semibold text-navy-600">Imagen (opcional)</span>
              <div className="mt-1 flex items-center gap-2">
                <label className="shrink-0 cursor-pointer rounded-full border border-crema-300 bg-crema-100 px-3 py-1 text-xs font-semibold text-navy-700 hover:bg-crema-200">
                  Seleccionar archivo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {pendingFile && (
                  <span className="min-w-0 truncate text-xs text-navy-400">{pendingFile.name}</span>
                )}
              </div>
            </div>
            {error && <ErrorText>{error}</ErrorText>}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>{saving ? 'Enviando…' : 'Enviar reporte'}</Button>
              <Button variant="ghost" type="button" onClick={() => { setCreating(false); setError('') }}>Cancelar</Button>
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
                    {r.image_url && (
                      <a href={r.image_url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                        <img src={r.image_url} alt="" className="max-h-40 rounded-lg object-contain" />
                      </a>
                    )}
                    <p className="mt-1 text-xs text-navy-400">{formatShortDateTime(r.created_at)}</p>
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
