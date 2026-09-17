import { supabase } from './supabase'

// Shrinks a phone photo (often 3–6 MB) to ~200 KB before upload, so it works on slow data.
async function shrink(file, max = 1200, quality = 0.8) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a photo')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that photo')); i.src = url })
    const scale = Math.min(1, max / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    return await new Promise((res) => c.toBlob(res, 'image/jpeg', quality))
  } finally { URL.revokeObjectURL(url) }
}

export async function uploadPhoto(file) {
  const blob = await shrink(file)
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from('product-images').upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw new Error(error.message)
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
}
