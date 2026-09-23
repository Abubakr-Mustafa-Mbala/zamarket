import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// A QR on a receipt has one job: get the customer from paper back to their order.
// It carries a link and nothing else — no names, no numbers, no private details.
export default function QrCode({ value, size = 128, className = '' }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let dead = false
    QRCode.toString(String(value || ''), { type: 'svg', margin: 1, width: size, errorCorrectionLevel: 'M', color: { dark: '#12212E', light: '#FFFFFF' } })
      .then((out) => { if (!dead) setSvg(out) })
      .catch(() => setSvg(''))
    return () => { dead = true }
  }, [value, size])
  if (!svg) return <span className={`qr-placeholder ${className}`} style={{ width: size, height: size }} aria-hidden />
  return <span className={`qr ${className}`} style={{ width: size, height: size }} aria-label="QR code" dangerouslySetInnerHTML={{ __html: svg }} />
}
