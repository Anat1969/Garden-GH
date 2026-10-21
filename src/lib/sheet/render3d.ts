// הדמיה תלת-ממדית לגיליון: three.js בדפדפן (גם ב-Chromium ללא מסך), רקע קרם, צללים רכים וקווי מתאר דקים
// בסגנון שרטוט אדריכלי-ציורי. מחזיר תמונה, מיקום התוויות בתמונה, ובדיקות מדידה ונראות פתחים.
import * as THREE from 'three'
import type { CalloutIn, Scene3D, XY } from './types'

export interface RenderResult {
  dataUrl: string
  anchors: { x: number; y: number }[] // 0 עד 1 ביחס לתמונה
  checks: { ok: boolean; text: string }[]
}

const BG = '#f5f2eb'

function noiseCanvas(base: string, size: number, draw?: (g: CanvasRenderingContext2D, S: number) => void) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.fillStyle = base
  g.fillRect(0, 0, size, size)
  let s = 7
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let i = 0; i < size * size * 0.05; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${0.025 + r() * 0.04})`
    g.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2)
  }
  draw?.(g, size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

// בטון חשוף: לוחות טפסנות וחורי קשירה עדינים
function concreteTexture(hex: string) {
  return noiseCanvas(hex, 512, (g, S) => {
    g.strokeStyle = 'rgba(40,40,40,0.13)'
    g.lineWidth = 2
    for (let i = 0; i <= 2; i++) {
      g.beginPath()
      g.moveTo(0, (i * S) / 2)
      g.lineTo(S, (i * S) / 2)
      g.stroke()
    }
    g.beginPath()
    g.moveTo(S / 2, 0)
    g.lineTo(S / 2, S)
    g.stroke()
    g.fillStyle = 'rgba(40,40,40,0.18)'
    for (const x of [0.12, 0.38, 0.62, 0.88]) for (const y of [0.25, 0.75]) {
      g.beginPath()
      g.arc(x * S, y * S, 3, 0, Math.PI * 2)
      g.fill()
    }
  })
}

function shapeOf(poly: XY[]) {
  return new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, -p.y)))
}

function extrude(poly: XY[], z0: number, z1: number) {
  const g = new THREE.ExtrudeGeometry(shapeOf(poly), { depth: z1 - z0, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  g.translate(0, z0, 0)
  return g
}

export function buildScene(s: Scene3D) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(BG)
  const ink = new THREE.LineBasicMaterial({ color: s.colors.frame, transparent: true, opacity: 0.55 })
  const meshes: THREE.Mesh[] = []
  const add = (m: THREE.Mesh, edges = true) => {
    m.castShadow = true
    m.receiveShadow = true
    scene.add(m)
    meshes.push(m)
    if (edges) scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), ink))
  }

  // קרקע קרם רחבה שמקבלת צל
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#ebe5d8', roughness: 1 }))
  ground.rotation.x = -Math.PI / 2
  // הקרקע הכללית מתחת למשטח הנמוך ביותר, כדי שמשטחים במפלס שלילי ייראו
  ground.position.y = Math.min(0, ...s.ground.map((g) => g.z)) - 0.06
  ground.receiveShadow = true
  scene.add(ground)

  for (const p of s.ground) {
    const tex = noiseCanvas(p.color, 256, (g, S) => {
      let k = 3
      const r = () => ((k = (k * 1664525 + 1013904223) >>> 0) / 4294967296)
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(${r() > 0.5 ? '40,55,20' : '200,210,150'},${0.08 + r() * 0.1})`
        g.beginPath()
        g.ellipse(r() * S, r() * S, 2 + r() * 4, 1 + r() * 2, r() * 3, 0, Math.PI * 2)
        g.fill()
      }
    })
    tex.repeat.set(0.25, 0.25)
    const geo = new THREE.ShapeGeometry(shapeOf(p.poly))
    geo.rotateX(-Math.PI / 2)
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }))
    m.position.y = p.z + 0.01
    m.receiveShadow = true
    scene.add(m)
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), ink)
    edge.position.y = p.z + 0.012
    scene.add(edge)
  }

  const concrete = concreteTexture(s.colors.envelope)
  concrete.repeat.set(1 / 2.4, 1 / 1.2)
  const envMat = new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.92 })
  const roofTex = concreteTexture(s.colors.roof)
  roofTex.repeat.set(1 / 2.4, 1 / 2.4)
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.9 })
  const envelope: THREE.Mesh[] = []
  for (const v of s.volumes) {
    const m = new THREE.Mesh(extrude(v.poly, v.z0, v.z1), v.role === 'envelope' ? envMat : roofMat)
    m.userData.role = v.role
    add(m)
    if (v.role === 'envelope') envelope.push(m)
  }

  // זכוכית: מעט מחוץ לפני הקיר, עם מסגרת דקה
  const center = new THREE.Vector3()
  new THREE.Box3().setFromObject(envelope[0] ?? ground).getCenter(center)
  const glassMat = new THREE.MeshStandardMaterial({ color: s.colors.glass, roughness: 0.08, metalness: 0.35, emissive: '#1d2a30', emissiveIntensity: 0.15 })
  const frameMat = new THREE.LineBasicMaterial({ color: s.colors.frame })
  const glassMeshes: { mesh: THREE.Mesh; normal: THREE.Vector3; at: THREE.Vector3 }[] = []
  for (const gl of s.glass) {
    const dx = gl.b.x - gl.a.x
    const dy = gl.b.y - gl.a.y
    const L = Math.hypot(dx, dy)
    if (L < 0.05) continue
    const mid = { x: (gl.a.x + gl.b.x) / 2, y: (gl.a.y + gl.b.y) / 2 }
    let n = new THREE.Vector3(-dy / L, 0, dx / L)
    if (n.dot(new THREE.Vector3(mid.x - center.x, 0, mid.y - center.z)) < 0) n = n.negate()
    const h = gl.z1 - gl.z0
    const geo = new THREE.BoxGeometry(L, h, 0.04)
    const m = new THREE.Mesh(geo, glassMat)
    m.position.set(mid.x + n.x * 0.03, gl.z0 + h / 2, mid.y + n.z * 0.03)
    m.rotation.y = -Math.atan2(dy, dx)
    m.userData.glass = true
    scene.add(m)
    meshes.push(m)
    const fr = new THREE.LineSegments(new THREE.EdgesGeometry(geo), frameMat)
    fr.position.copy(m.position)
    fr.rotation.copy(m.rotation)
    scene.add(fr)
    // חלוקת ההזזה לשני כנפיים
    if (gl.type === 'sliding' || L > 2.4) {
      const mul = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.06), new THREE.MeshStandardMaterial({ color: s.colors.frame }))
      mul.position.copy(m.position)
      mul.rotation.copy(m.rotation)
      scene.add(mul)
    }
    glassMeshes.push({ mesh: m, normal: n, at: m.position.clone() })
  }

  // עצים: גזע וצמרת מגושים ירוקי זית
  for (const t of s.trees) {
    const trunkH = Math.max(1.2, t.h - t.r * 1.5)
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, trunkH, 8), new THREE.MeshStandardMaterial({ color: '#6b5440', roughness: 1 }))
    trunk.position.set(t.at.x, trunkH / 2, t.at.y)
    add(trunk, false)
    const greens = ['#6f7d4a', '#7d8a52', '#5f6d40', '#8a9660']
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3
      const rr = t.r * (i === 0 ? 0.75 : 0.5)
      const geo = new THREE.IcosahedronGeometry(rr, 1)
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: greens[i % 4], roughness: 1, flatShading: true }))
      m.position.set(t.at.x + (i ? Math.cos(a) * t.r * 0.4 : 0), trunkH + t.r * 0.65 + (i % 2) * t.r * 0.2, t.at.y + (i ? Math.sin(a) * t.r * 0.4 : 0))
      add(m, false)
    }
  }

  return { scene, meshes, envelope, glassMeshes }
}

function sceneBox(s: Scene3D) {
  const box = new THREE.Box3()
  for (const v of s.volumes) for (const p of v.poly) box.expandByPoint(new THREE.Vector3(p.x, v.z1, p.y)).expandByPoint(new THREE.Vector3(p.x, 0, p.y))
  for (const g of s.ground) for (const p of g.poly) box.expandByPoint(new THREE.Vector3(p.x, 0, p.y))
  for (const t of s.trees) box.expandByPoint(new THREE.Vector3(t.at.x + t.r, t.h, t.at.y + t.r)).expandByPoint(new THREE.Vector3(t.at.x - t.r, 0, t.at.y - t.r))
  return box
}

// כיוון בתוכנית לפי אזימוט מהצפון
const planDir = (az: number, north: number) => {
  const a = ((az + north) * Math.PI) / 180
  return { x: Math.sin(a), y: -Math.cos(a) }
}

export function renderView(s: Scene3D, opts: { width: number; height: number; view: 'iso' | 'persp'; callouts?: CalloutIn[] }): RenderResult {
  const { scene, envelope, glassMeshes, meshes } = buildScene(s)
  const box = sceneBox(s)
  const c = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())

  // שמש מדרום-מערב, אחר הצהריים: צל רך לכיוון צפון-מזרח
  const sun = planDir(215, s.north)
  const el = (38 * Math.PI) / 180
  const R = Math.max(size.x, size.z) * 2
  const light = new THREE.DirectionalLight('#fff4e2', 2.4)
  light.position.set(c.x + sun.x * Math.cos(el) * R, Math.sin(el) * R, c.z + sun.y * Math.cos(el) * R)
  light.target.position.copy(c)
  light.castShadow = true
  light.shadow.mapSize.set(4096, 4096)
  const sc = Math.max(size.x, size.z) * 0.9
  Object.assign(light.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc, near: 0.5, far: R * 3 })
  light.shadow.radius = 6
  light.shadow.bias = -0.0005
  light.shadow.normalBias = 0.02
  scene.add(light, light.target)
  scene.add(new THREE.HemisphereLight('#fbf7ef', '#cfc6b0', 1.25))

  // המצלמה פונה לחזית הדרומית (הגינה), מעט ממזרח
  const south = planDir(180, s.north)
  const east = planDir(90, s.north)
  const hv = new THREE.Vector3(south.x + east.x * 0.75, 0, south.y + east.y * 0.75).normalize()
  const aspect = opts.width / opts.height
  let camera: THREE.Camera
  if (opts.view === 'iso') {
    const dir = new THREE.Vector3(hv.x, Math.tan((30 * Math.PI) / 180), hv.z).normalize()
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000)
    cam.position.copy(c.clone().add(dir.clone().multiplyScalar(200)))
    cam.lookAt(c)
    cam.updateMatrixWorld()
    // התאמה: המבנה והגינה סביבו (עד 6 מ'), כך שהמבנה גדול ברצועה
    const fit = new THREE.Box3()
    for (const v of s.volumes) for (const p of v.poly) fit.expandByPoint(new THREE.Vector3(p.x, v.z1, p.y)).expandByPoint(new THREE.Vector3(p.x, 0, p.y))
    if (fit.isEmpty()) fit.copy(box)
    else fit.expandByVector(new THREE.Vector3(6, 0, 6)).intersect(box.clone().expandByScalar(0.5))
    box.copy(fit)
    const inv = cam.matrixWorldInverse
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const v = new THREE.Vector3(x, y, z).applyMatrix4(inv)
      minX = Math.min(minX, v.x)
      maxX = Math.max(maxX, v.x)
      minY = Math.min(minY, v.y)
      maxY = Math.max(maxY, v.y)
    }
    const pad = 1.03
    let w = (maxX - minX) * pad
    let h = (maxY - minY) * pad
    if (w / h < aspect) w = h * aspect
    else h = w / aspect
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    Object.assign(cam, { left: cx - w / 2, right: cx + w / 2, top: cy + h / 2, bottom: cy - h / 2 })
    cam.updateProjectionMatrix()
    camera = cam
  } else {
    const cam = new THREE.PerspectiveCamera(30, aspect, 0.1, 1000)
    const dir = new THREE.Vector3(hv.x, Math.tan((20 * Math.PI) / 180), hv.z).normalize()
    // ההדמיה הראשית ממוסגרת על המבנה ועל הגינה הקרובה אליו, לא על כל המגרש
    const near = new THREE.Box3()
    for (const v of s.volumes) for (const p of v.poly) near.expandByPoint(new THREE.Vector3(p.x, v.z1, p.y)).expandByPoint(new THREE.Vector3(p.x, 0, p.y))
    if (near.isEmpty()) near.copy(box)
    near.expandByVector(new THREE.Vector3(3.5, 0, 3.5))
    const nc = near.getCenter(new THREE.Vector3())
    const target = nc.clone().setY(near.getSize(new THREE.Vector3()).y * 0.32)
    const radius = near.getBoundingSphere(new THREE.Sphere()).radius
    const fovH = 2 * Math.atan(Math.tan((cam.fov * Math.PI) / 360) * aspect)
    const dist = (radius * 0.92) / Math.sin(Math.min((cam.fov * Math.PI) / 360, fovH / 2))
    cam.position.copy(target.clone().add(dir.multiplyScalar(dist)))
    cam.lookAt(target)
    cam.updateMatrixWorld()
    camera = cam
  }

  const canvas = document.createElement('canvas')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(opts.width, opts.height, false)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.render(scene, camera)

  // רקע נייר עדין מעל ההדמיה: גרגר דק בלבד, בלי לשנות צבעים
  const out = document.createElement('canvas')
  out.width = opts.width
  out.height = opts.height
  const g = out.getContext('2d')!
  g.drawImage(canvas, 0, 0)
  let k = 11
  const r = () => ((k = (k * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let i = 0; i < (opts.width * opts.height) / 60; i++) {
    g.fillStyle = `rgba(80,70,50,${0.015 + r() * 0.025})`
    g.fillRect(r() * opts.width, r() * opts.height, 1.5, 1.5)
  }
  const dataUrl = out.toDataURL('image/png')

  // תוויות: הקרנת נקודות העיגון
  const anchors = (opts.callouts ?? []).map((cl) => {
    const v = new THREE.Vector3(cl.anchor.x, cl.anchor.z, cl.anchor.y).project(camera)
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 }
  })

  // בדיקות: מידות המבנה, והאם הגג מסתיר פתחים שפונים למצלמה
  const checks: RenderResult['checks'] = []
  if (envelope.length && s.expect) {
    const eb = new THREE.Box3()
    envelope.forEach((m) => eb.expandByObject(m))
    const es = eb.getSize(new THREE.Vector3())
    const okW = Math.abs(es.x - s.expect.w) < 0.02 && Math.abs(es.z - s.expect.d) < 0.02
    const okH = Math.abs(es.y - s.expect.floors * s.expect.floorH) < 0.02
    checks.push({ ok: okW, text: `מידות המבנה במודל ${es.x.toFixed(2)}×${es.z.toFixed(2)} מ׳ מול ${s.expect.w.toFixed(2)}×${s.expect.d.toFixed(2)} מ׳ בתוכניות` })
    checks.push({ ok: okH, text: `גובה המעטפת ${es.y.toFixed(2)} מ׳: ${s.expect.floors} קומות של ${s.expect.floorH.toFixed(2)} מ׳` })
  }
  const camPos = camera.position.clone()
  const ray = new THREE.Raycaster()
  let facing = 0
  let visible = 0
  const hidden: string[] = []
  for (const gm of glassMeshes) {
    const toCam = opts.view === 'iso' ? camera.getWorldDirection(new THREE.Vector3()).negate() : camPos.clone().sub(gm.at).normalize()
    if (gm.normal.dot(toCam) <= 0.05) continue
    facing++
    const origin = opts.view === 'iso' ? gm.at.clone().add(toCam.clone().multiplyScalar(300)) : camPos
    ray.set(origin, gm.at.clone().sub(origin).normalize())
    const hit = ray.intersectObjects(meshes, false)[0]
    if (hit && hit.object.userData.glass) visible++
    else hidden.push(hit?.object.userData.role ?? 'עצם')
  }
  checks.push({ ok: facing === 0 || visible === facing, text: `פתחים שפונים למצלמה: ${visible} גלויים מתוך ${facing}${hidden.length ? `, מוסתרים על ידי ${[...new Set(hidden)].join(', ')}` : ''}` })

  renderer.dispose()
  renderer.forceContextLoss()
  return { dataUrl, anchors, checks }
}
