import type { SurfaceMaterial } from './garden'
import { MATERIALS } from './garden'

// טקסטורות משטח מצוירות על קנבס: מקור אחד לתוכנית, לדוגמיות ולמודל התלת-ממדי.

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)))))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const cache = new Map<string, HTMLCanvasElement>()

export function textureCanvas(material: SurfaceMaterial, color?: string, size = 256): HTMLCanvasElement {
  const base = color || MATERIALS[material].color
  const key = `${material}:${base}:${size}`
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const S = size
  const r = rng(material.length * 977 + size)
  g.fillStyle = base
  g.fillRect(0, 0, S, S)
  const dark = shade(base, -0.28)
  const light = shade(base, 0.25)
  g.lineCap = 'round'
  switch (material) {
    case 'paving': {
      // אבן משתלבת בהנחה מתחלפת
      g.strokeStyle = dark
      g.lineWidth = S / 90
      const rows = 6
      const h = S / rows
      for (let i = 0; i <= rows; i++) {
        g.beginPath(); g.moveTo(0, i * h); g.lineTo(S, i * h); g.stroke()
        const off = i % 2 ? h : 0
        for (let x = off; x < S + h; x += h * 2) {
          g.beginPath(); g.moveTo(x, i * h); g.lineTo(x, (i + 1) * h); g.stroke()
        }
      }
      break
    }
    case 'tiles': {
      g.strokeStyle = dark
      g.lineWidth = S / 80
      for (let i = 0; i <= 2; i++) {
        g.beginPath(); g.moveTo(0, (i * S) / 2); g.lineTo(S, (i * S) / 2); g.stroke()
        g.beginPath(); g.moveTo((i * S) / 2, 0); g.lineTo((i * S) / 2, S); g.stroke()
      }
      for (let i = 0; i < 60; i++) {
        g.fillStyle = shade(base, (r() - 0.5) * 0.08)
        g.fillRect(r() * S, r() * S, S / 30, S / 30)
      }
      break
    }
    case 'stone': {
      // אבן פראית: מצולעים לא סדירים
      g.strokeStyle = dark
      g.lineWidth = S / 70
      const n = 5
      const pts: [number, number][][] = []
      for (let j = 0; j <= n; j++) {
        pts.push([])
        for (let i = 0; i <= n; i++) {
          const edge = i === 0 || j === 0 || i === n || j === n
          pts[j].push([(i / n) * S + (edge ? 0 : (r() - 0.5) * S * 0.12), (j / n) * S + (edge ? 0 : (r() - 0.5) * S * 0.12)])
        }
      }
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          g.fillStyle = shade(base, (r() - 0.5) * 0.18)
          g.beginPath()
          g.moveTo(...pts[j][i]); g.lineTo(...pts[j][i + 1]); g.lineTo(...pts[j + 1][i + 1]); g.lineTo(...pts[j + 1][i])
          g.closePath(); g.fill(); g.stroke()
        }
      break
    }
    case 'concrete': {
      for (let i = 0; i < 900; i++) {
        g.fillStyle = r() > 0.5 ? dark : light
        g.globalAlpha = 0.18
        g.fillRect(r() * S, r() * S, 1.5, 1.5)
      }
      g.globalAlpha = 1
      g.strokeStyle = shade(base, -0.15)
      g.lineWidth = S / 160
      g.beginPath(); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.stroke()
      break
    }
    case 'deck': {
      const planks = 8
      const h = S / planks
      for (let i = 0; i < planks; i++) {
        g.fillStyle = shade(base, (r() - 0.5) * 0.16)
        g.fillRect(0, i * h, S, h)
        g.strokeStyle = shade(base, -0.12)
        g.lineWidth = 1
        for (let k = 0; k < 3; k++) {
          const y = i * h + h * (0.25 + r() * 0.5)
          g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(S * 0.3, y + 2, S * 0.6, y - 2, S, y); g.stroke()
        }
        g.strokeStyle = dark
        g.lineWidth = S / 100
        g.beginPath(); g.moveTo(0, i * h); g.lineTo(S, i * h); g.stroke()
        const cut = (i % 2 ? 0.3 : 0.75) * S
        g.beginPath(); g.moveTo(cut, i * h); g.lineTo(cut, (i + 1) * h); g.stroke()
      }
      break
    }
    case 'gravel':
    case 'sand':
    case 'pebbles': {
      const count = material === 'sand' ? 1400 : material === 'gravel' ? 700 : 110
      for (let i = 0; i < count; i++) {
        g.fillStyle = shade(base, (r() - 0.5) * (material === 'sand' ? 0.25 : 0.55))
        const rad = material === 'pebbles' ? S / 30 + r() * S / 24 : material === 'gravel' ? 1 + r() * S / 90 : 0.8
        g.beginPath()
        g.ellipse(r() * S, r() * S, rad, rad * (0.6 + r() * 0.4), r() * Math.PI, 0, Math.PI * 2)
        g.fill()
      }
      break
    }
    case 'lawn':
    case 'turf': {
      const count = material === 'lawn' ? 1600 : 0
      for (let i = 0; i < count; i++) {
        g.strokeStyle = shade(base, (r() - 0.5) * 0.4)
        g.lineWidth = 1
        const x = r() * S
        const y = r() * S
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 4 - r() * 4); g.stroke()
      }
      if (material === 'turf') {
        for (let x = 0; x < S; x += S / 32) {
          g.fillStyle = Math.round(x / (S / 32)) % 2 ? light : base
          g.globalAlpha = 0.35
          g.fillRect(x, 0, S / 64, S)
        }
        g.globalAlpha = 1
      }
      break
    }
    case 'bed':
    case 'mulch': {
      for (let i = 0; i < (material === 'bed' ? 700 : 500); i++) {
        g.fillStyle = shade(base, (r() - 0.5) * 0.5)
        const w = material === 'mulch' ? 3 + r() * 6 : 1.5
        g.save(); g.translate(r() * S, r() * S); g.rotate(r() * Math.PI)
        g.fillRect(-w / 2, -1, w, 2)
        g.restore()
      }
      if (material === 'bed')
        for (let i = 0; i < 14; i++) {
          g.fillStyle = shade('#5e8a4e', (r() - 0.5) * 0.3)
          g.beginPath(); g.arc(r() * S, r() * S, S / 26 + r() * S / 30, 0, Math.PI * 2); g.fill()
        }
      break
    }
    case 'water': {
      g.strokeStyle = light
      g.lineWidth = S / 90
      for (let y = S / 10; y < S; y += S / 6) {
        g.beginPath()
        for (let x = 0; x <= S; x += 4) g.lineTo(x, y + Math.sin((x / S) * Math.PI * 4) * S / 40)
        g.stroke()
      }
      break
    }
  }
  cache.set(key, c)
  return c
}

const urlCache = new Map<string, string>()
export function textureUrl(material: SurfaceMaterial, color?: string, size = 128): string {
  const key = `${material}:${color ?? ''}:${size}`
  let u = urlCache.get(key)
  if (!u) {
    u = textureCanvas(material, color, size).toDataURL('image/png')
    urlCache.set(key, u)
  }
  return u
}
