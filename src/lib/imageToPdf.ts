// הופך תמונה (PNG, JPEG, WebP ועוד) ל-PDF בעמוד אחד, פיקסל אחד = נקודה אחת.
// כך כל המסלול (תצוגה, כיול, מידות, תוכנית) עובד על תמונות בלי ענף נפרד.
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']
export const MAX_IMAGE_EDGE = 8000

export async function imageToPdf(file: Blob): Promise<ArrayBuffer> {
  const { PDFDocument } = await import('pdf-lib')
  const bmp = await createImageBitmap(file)
  let { width, height } = bmp
  const k = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height))
  width = Math.round(width * k)
  height = Math.round(height * k)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bmp, 0, 0, width, height)
  bmp.close()
  const jpeg = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.92))
  const doc = await PDFDocument.create()
  const img = await doc.embedJpg(await jpeg.arrayBuffer())
  const page = doc.addPage([width, height])
  page.drawImage(img, { x: 0, y: 0, width, height })
  const bytes = await doc.save()
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
