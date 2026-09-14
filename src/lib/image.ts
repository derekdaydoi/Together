export async function compressAvatar(file: File, size = 512): Promise<Blob> {
  const image = await createImageBitmap(file)
  const crop = Math.min(image.width, image.height)
  const sx = (image.width - crop) / 2
  const sy = (image.height - crop) / 2
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.')
  ctx.drawImage(image, sx, sy, crop, crop, 0, 0, size, size)
  image.close()
  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Không thể nén ảnh.')), 'image/webp', 0.82)
  })
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
