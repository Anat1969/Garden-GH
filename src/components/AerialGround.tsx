import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'

// הסביבה של הבית: תצלום אוויר של המקום, פרוש מתחת למודל, כמו בפרויקט התאנה.
// נקודת העוגן: מיקום הפרויקט על המפה מונח על מרכז הבית. הצפון של התצלום מסובב אל הצפון של התוכנית.

const Z = 19
const N = 5 // 5×5 אריחים: כ-380 מטר
const TILE = 256

export function AerialGround({ lat, lon, north, at, y }: { lat: number; lon: number; north: number; at: { x: number; y: number }; y: number }) {
  const invalidate = useThree((s) => s.invalidate)
  const [map, setMap] = useState<{ tex: THREE.Texture; size: number; ox: number; oz: number } | null>(null)
  useEffect(() => {
    let dead = false
    const n = 2 ** Z
    const fx = ((lon + 180) / 360) * n
    const fy = ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n
    const tx = Math.floor(fx) - (N - 1) / 2
    const ty = Math.floor(fy) - (N - 1) / 2
    const cv = document.createElement('canvas')
    cv.width = cv.height = N * TILE
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#cfd3c8'
    ctx.fillRect(0, 0, cv.width, cv.height)
    const jobs: Promise<boolean>[] = []
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++)
        jobs.push(
          new Promise((res) => {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.onload = () => {
              ctx.drawImage(img, i * TILE, j * TILE)
              res(true)
            }
            img.onerror = () => res(false)
            img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${ty + j}/${tx + i}`
          }),
        )
    void Promise.all(jobs).then((ok) => {
      if (dead || !ok.some(Boolean)) return
      const tex = new THREE.CanvasTexture(cv)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 8
      const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / n
      // היסט התמונה כך שהפיקסל של מיקום הפרויקט יושב בנקודת העוגן
      const dx = (fx - tx) * TILE - cv.width / 2
      const dy = (fy - ty) * TILE - cv.height / 2
      setMap({ tex, size: cv.width * mpp, ox: -dx * mpp, oz: -dy * mpp })
      invalidate()
    })
    return () => {
      dead = true
    }
  }, [lat, lon, invalidate])
  useEffect(() => () => map?.tex.dispose(), [map])
  if (!map) return null
  return (
    <group position={[at.x, y, at.y]} rotation={[0, (-north * Math.PI) / 180, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[map.ox, 0, map.oz]} receiveShadow>
        <planeGeometry args={[map.size, map.size]} />
        <meshStandardMaterial map={map.tex} roughness={1} />
      </mesh>
    </group>
  )
}
