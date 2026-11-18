import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { subscribeVideos } from '../lib/videoJobs'

// Wherever you are in the dashboard: "Making video 40%", then "Video ready".
// Subscribing also restarts a video the phone paused or closed.
export default function VideoJobsChip() {
  const [videos, setVideos] = useState([])
  const { pathname } = useLocation()
  useEffect(() => subscribeVideos(setVideos), [])
  if (pathname.startsWith('/admin/videos')) return null
  const making = videos.find((v) => v.status === 'making' || v.status === 'waiting')
  const ready = videos.filter((v) => v.status === 'ready' && !v.seen)
  if (!making && !ready.length) return null
  return (
    <Link to="/admin/videos" className={`video-chip ${making ? 'is-making' : 'is-ready'}`}>
      {making
        ? <><span className="video-chip-spin" /> {making.status === 'making' ? `Making video ${Math.round((making.progress || 0) * 100)}%` : 'Video waiting to be made'}</>
        : <>✓ {ready.length > 1 ? `${ready.length} videos ready` : 'Video ready'} · open</>}
    </Link>
  )
}
