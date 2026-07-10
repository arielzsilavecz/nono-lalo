import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from '../context/AuthContext'

export const PUSH_SUPPORTED = typeof window !== 'undefined'
  && 'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output
}

function keyToBase64(key: ArrayBuffer | null): string {
  if (!key) return ''
  return btoa(String.fromCharCode(...new Uint8Array(key)))
}

/**
 * Suscripción Web Push del admin logueado en este dispositivo/navegador.
 * Usada desde Ajustes para activar/desactivar el aviso de pedidos nuevos.
 */
export function usePushNotifications() {
  const { session } = useAuth()
  const [permission, setPermission] = useState<NotificationPermission>(
    PUSH_SUPPORTED ? Notification.permission : 'denied',
  )
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!PUSH_SUPPORTED) {
      setLoading(false)
      return
    }
    let cancelled = false
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setSubscribed(sub !== null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const subscribe = useCallback(async () => {
    if (!PUSH_SUPPORTED || !session) return
    setError('')
    setLoading(true)
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') return

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
      })
      const { error: upsertError } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: session.user.id,
          endpoint: sub.endpoint,
          p256dh: keyToBase64(sub.getKey('p256dh')),
          auth_key: keyToBase64(sub.getKey('auth')),
        },
        { onConflict: 'endpoint' },
      )
      if (upsertError) throw upsertError
      setSubscribed(true)
    } catch {
      setError('No se pudieron activar las notificaciones.')
    } finally {
      setLoading(false)
    }
  }, [session])

  const unsubscribe = useCallback(async () => {
    if (!PUSH_SUPPORTED) return
    setError('')
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        await sub.unsubscribe()
      }
      setSubscribed(false)
    } catch {
      setError('No se pudieron desactivar las notificaciones.')
    } finally {
      setLoading(false)
    }
  }, [])

  return { supported: PUSH_SUPPORTED, permission, subscribed, loading, error, subscribe, unsubscribe }
}
