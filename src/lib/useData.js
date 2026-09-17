import { useCallback, useEffect, useState } from 'react'

// Tiny data hook: runs an async loader, exposes data/loading/error and a reload().
export function useData(loader, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const run = useCallback(async () => {
    setLoading(true); setError(null)
    try { setData(await loader()) } catch (e) { setError(e.message || String(e)) } finally { setLoading(false) }
  }, deps)
  useEffect(() => { run() }, [run])
  return { data, error, loading, reload: run }
}
