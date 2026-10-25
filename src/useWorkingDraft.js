import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

/**
 * Keeps an unfinished form on-device immediately and synchronizes it to
 * Supabase for recovery on another signed-in device. The draft row is scoped
 * to the authenticated user, store, module, and logical draft key.
 *
 * Cleared drafts are represented by a timestamped tombstone. This prevents a
 * stale local copy on another device from resurrecting a bill after it was
 * completed on the first device.
 */
const withoutMetadata = (payload) => {
  if (!payload || typeof payload !== 'object') return {}
  const { savedAt, __cleared, ...value } = payload
  return value
}

const valueSignature = (payload) => JSON.stringify(withoutMetadata(payload))

export function useWorkingDraft({
  storeId,
  moduleKey,
  draftKey = 'default',
  value,
  onRestore,
  hasWork,
  enabled = true,
  localStorageKey = null,
}) {
  const [ready, setReady] = useState(false)
  const restoreIdentityRef = useRef(null)
  const [scopedLocalKey, setScopedLocalKey] = useState(null)
  const restoreRef = useRef(onRestore)
  const latestValueRef = useRef(value)
  const latestHasWorkRef = useRef(hasWork)
  const saveTimerRef = useRef(null)
  const generationRef = useRef(0)
  const lastSyncedValueRef = useRef(null)
  const baseLocalKey = localStorageKey || `pharmdesk:working-draft:${storeId || 'no-store'}:${moduleKey}:${draftKey}`
  const localKey = scopedLocalKey || baseLocalKey

  useEffect(() => { restoreRef.current = onRestore }, [onRestore])
  useEffect(() => { latestValueRef.current = value }, [value])
  useEffect(() => { latestHasWorkRef.current = hasWork }, [hasWork])

  useEffect(() => {
    let cancelled = false
    let channel = null
    const identity = `${storeId || ''}|${moduleKey || ''}|${draftKey}|${baseLocalKey}`
    restoreIdentityRef.current = null
    setReady(false)
    lastSyncedValueRef.current = null
    if (!enabled || !storeId || !moduleKey) {
      restoreIdentityRef.current = identity
      setReady(true)
      return () => { cancelled = true }
    }

    const restore = async () => {
      let localDraft = null
      let cloudDraft = null
      let userId = null
      try {
        const { data: { user } } = await supabase.auth.getUser()
        userId = user?.id || null
      } catch {}

      // Local recovery is user-scoped too. Never restore another employee's
      // draft on a shared pharmacy terminal.
      const resolvedLocalKey = `${baseLocalKey}:user:${userId || 'guest'}`
      try {
        const raw = window.localStorage.getItem(resolvedLocalKey)
        if (raw) localDraft = JSON.parse(raw)
      } catch (error) {
        console.warn('Could not read local working draft:', error)
      }

      try {
        if (userId) {
          const { data, error } = await supabase
            .from('pharmdesk_working_drafts')
            .select('payload,updated_at')
            .eq('store_id', storeId)
            .eq('user_id', userId)
            .eq('module_key', moduleKey)
            .eq('draft_key', draftKey)
            .maybeSingle()
          if (error) throw error
          cloudDraft = data ? { ...data.payload, savedAt: data.updated_at } : null
        }
      } catch (error) {
        // Local recovery remains available if the draft table is unavailable
        // or the network is temporarily down.
        console.warn('Cloud draft unavailable; keeping local recovery:', error?.message || error)
      }

      if (cancelled) return
      setScopedLocalKey(resolvedLocalKey)
      restoreIdentityRef.current = identity
      const localTime = Date.parse(localDraft?.savedAt || 0) || 0
      const cloudTime = Date.parse(cloudDraft?.savedAt || 0) || 0
      const cloudIsNewer = Boolean(cloudDraft && cloudTime >= localTime)

      if (cloudIsNewer && cloudDraft.__cleared) {
        try { window.localStorage.removeItem(localKey) } catch {}
        restoreRef.current?.({})
        lastSyncedValueRef.current = null
      } else {
        const chosen = cloudIsNewer ? cloudDraft : localDraft || cloudDraft
        if (chosen && typeof chosen === 'object' && !chosen.__cleared) {
          try { restoreRef.current?.(chosen) } catch (error) {
            console.warn('Could not restore working draft:', error)
          }
          lastSyncedValueRef.current = valueSignature(chosen)
        } else {
          lastSyncedValueRef.current = valueSignature(latestValueRef.current)
        }
      }

      // Live updates allow a draft changed on another signed-in device to
      // appear here without refreshing. Never overwrite unsaved local edits.
      if (userId) {
        channel = supabase
          .channel(`working-draft:${storeId}:${moduleKey}:${draftKey}:${userId}`)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'pharmdesk_working_drafts',
            filter: `store_id=eq.${storeId}`,
          }, (event) => {
            const row = event.new
            const oldRow = event.old
            const matches = row &&
              row.user_id === userId &&
              row.module_key === moduleKey &&
              row.draft_key === draftKey
            if (!matches) return

            const currentSignature = valueSignature(latestValueRef.current)
            if (lastSyncedValueRef.current === null ||
                currentSignature !== lastSyncedValueRef.current) return

            const remotePayload = row.payload || {}
            if (remotePayload.__cleared) {
              try { window.localStorage.removeItem(localKey) } catch {}
              restoreRef.current?.({})
              lastSyncedValueRef.current = null
              return
            }

            const remoteSignature = valueSignature(remotePayload)
            if (remoteSignature === currentSignature) return
            try {
              restoreRef.current?.({ ...remotePayload, savedAt: row.updated_at })
              lastSyncedValueRef.current = remoteSignature
            } catch (error) {
              console.warn('Could not apply cross-device draft update:', error)
            }
          })
          .subscribe()
      }

      setReady(true)
    }

    restore()
    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [storeId, moduleKey, draftKey, baseLocalKey, enabled])

  useEffect(() => {
    const identity = `${storeId || ''}|${moduleKey || ''}|${draftKey}|${baseLocalKey}`
    if (!ready || restoreIdentityRef.current !== identity || !enabled || !storeId || !moduleKey) return
    const generation = generationRef.current
    const timer = window.setTimeout(async () => {
      if (generation !== generationRef.current) return

      const now = new Date().toISOString()
      const hasCurrentWork = Boolean(latestHasWorkRef.current)
      if (!hasCurrentWork) {
        try { window.localStorage.removeItem(localKey) } catch {}
        const payload = { __cleared: true, savedAt: now }
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (generation !== generationRef.current || latestHasWorkRef.current || !user?.id) return
          const { error } = await supabase.from('pharmdesk_working_drafts').upsert({
            store_id: storeId,
            user_id: user.id,
            module_key: moduleKey,
            draft_key: draftKey,
            payload,
            updated_at: now,
          }, { onConflict: 'store_id,user_id,module_key,draft_key' })
          if (error) throw error
          lastSyncedValueRef.current = valueSignature(latestValueRef.current)
        } catch (error) {
          console.warn('Could not synchronize cleared draft:', error?.message || error)
        }
        return
      }

      const payload = { ...latestValueRef.current, savedAt: now }
      try { window.localStorage.setItem(localKey, JSON.stringify(payload)) } catch (error) {
        console.warn('Could not save local working draft:', error)
      }
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (generation !== generationRef.current || !user?.id) return
        const { error } = await supabase.from('pharmdesk_working_drafts').upsert({
          store_id: storeId,
          user_id: user.id,
          module_key: moduleKey,
          draft_key: draftKey,
          payload,
          updated_at: now,
        }, { onConflict: 'store_id,user_id,module_key,draft_key' })
        if (error) throw error
        lastSyncedValueRef.current = valueSignature(latestValueRef.current)
      } catch (error) {
        console.warn('Cloud draft save failed; local copy retained:', error?.message || error)
      }
    }, 450)
    saveTimerRef.current = timer
    return () => {
      window.clearTimeout(timer)
      if (saveTimerRef.current === timer) saveTimerRef.current = null
      // Invalidate any async write already in flight for an older form value.
      if (generationRef.current === generation) generationRef.current += 1
    }
  }, [ready, enabled, storeId, moduleKey, draftKey, baseLocalKey, localKey, value, hasWork])

  const clearDraft = async () => {
    generationRef.current += 1
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    try { window.localStorage.removeItem(localKey) } catch {}
    const now = new Date().toISOString()
    const payload = { __cleared: true, savedAt: now }
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.id && storeId) {
        const { error } = await supabase.from('pharmdesk_working_drafts').upsert({
          store_id: storeId,
          user_id: user.id,
          module_key: moduleKey,
          draft_key: draftKey,
          payload,
          updated_at: now,
        }, { onConflict: 'store_id,user_id,module_key,draft_key' })
        if (error) throw error
      }
      lastSyncedValueRef.current = null
    } catch (error) {
      console.warn('Could not synchronize cleared draft:', error?.message || error)
    }
  }

  return { ready, clearDraft }
}
