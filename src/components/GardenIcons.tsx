// סמלי שרטוט לספריית הגינה: קו אדריכלי דק, צבע אחד (currentColor), במבט על כמו בתוכנית.
import type { ReactNode } from 'react'

const I = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

export const ICONS: Record<string, ReactNode> = {
  // כלים
  select: <I><path d="M6 4l11 7-5 1.5 3 5.5-2 1-3-5.5L6 17z" /></I>,
  rect: <I><rect x="4" y="6" width="16" height="12" /><path d="M4 6l4 4M8 6l4 4M12 6l4 4M16 6l4 4" opacity=".5" /></I>,
  poly: <I><path d="M5 18l2-11 7-3 6 6-3 9z" /><circle cx="5" cy="18" r="1.2" /><circle cx="7" cy="7" r="1.2" /><circle cx="14" cy="4" r="1.2" /><circle cx="20" cy="10" r="1.2" /><circle cx="17" cy="19" r="1.2" /></I>,
  free: <I><path d="M5 15c-1-4 2-9 7-9 6 0 8 4 7 8-1 5-6 6-9 5-3-1-4-2-5-4z" strokeDasharray="0" /><path d="M8 13c2-1 4 1 6 0" opacity=".5" /></I>,
  pen: <I><path d="M4 18c3-1 4-6 7-6s3 4 6 3 2-6 3-8" /><path d="M17 4l3 3" /></I>,
  line: <I><path d="M4 18l6-6 4 3 6-9" /><circle cx="4" cy="18" r="1.2" /><circle cx="10" cy="12" r="1.2" /><circle cx="14" cy="15" r="1.2" /><circle cx="20" cy="6" r="1.2" /></I>,
  wall: <I><rect x="3" y="10" width="18" height="4" /><path d="M5 10l4 4M9 10l4 4M13 10l4 4M17 10l4 4" opacity=".6" /></I>,
  gwall: <I><rect x="3" y="10" width="18" height="4" rx="1" /><path d="M7 10v4M11 10v4M15 10v4" /></I>,
  fence: <I><path d="M3 12h18" /><path d="M5 8v8M10 8v8M15 8v8M20 8v8" /></I>,
  opening: <I><path d="M3 18h6M15 18h6" /><path d="M9 18a6 6 0 0 1 6-6" /><path d="M9 18V12" opacity=".6" /></I>,
  calibrate: <I><path d="M3 16h18" /><path d="M3 13v6M21 13v6M9 15v2M15 15v2" /><path d="M8 8h8M8 8l2-2M8 8l2 2M16 8l-2-2M16 8l-2 2" /></I>,
  // צמחייה
  tree: <I><circle cx="12" cy="12" r="8" /><path d="M12 4c1 2 3 3 5 2M20 12c-2 1-3 3-2 5M12 20c-1-2-3-3-5-2M4 12c2-1 3-3 2-5" opacity=".6" /><circle cx="12" cy="12" r="1" /></I>,
  fruit_tree: <I><circle cx="12" cy="12" r="7.5" /><circle cx="9" cy="10" r="1.3" /><circle cx="14.5" cy="9.5" r="1.3" /><circle cx="13" cy="14.5" r="1.3" /><circle cx="8.5" cy="14" r="1.3" /></I>,
  palm: <I><path d="M12 12L12 3M12 12l8-3M12 12l7 6M12 12l-1 9M12 12l-8 5M12 12L4 8" /><path d="M12 3l-2 2M12 3l2 2M20 9l-1-2M20 9l-2 1M19 18l-2 0M19 18l0-2M11 21l1-2M11 21l-1-2M4 17l2-1M4 17l1 2M4 8l2 0M4 8l1 2" opacity=".6" /></I>,
  shrub: <I><path d="M12 5c3 0 4 2 5 3 2 0 3 2 2 4 1 2 0 4-2 4-1 2-3 3-5 2-2 1-4 0-5-2-2 0-3-2-2-4-1-2 0-4 2-4 1-2 3-3 5-3z" /></I>,
  flowers: <I><circle cx="8" cy="9" r="2" /><circle cx="16" cy="8" r="2" /><circle cx="12" cy="15" r="2" /><circle cx="7" cy="17" r="1.3" /><circle cx="17" cy="16" r="1.3" /></I>,
  planter: <I><rect x="4" y="8" width="16" height="8" rx="1" /><rect x="6" y="10" width="12" height="4" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /></I>,
  hedge: <I><path d="M3 12c1-3 3-3 4 0 1-3 3-3 4 0 1-3 3-3 4 0 1-3 3-3 4 0 1-3 2-3 2 0" /><path d="M3 12c1 3 3 3 4 0 1 3 3 3 4 0 1 3 3 3 4 0 1 3 3 3 4 0" /></I>,
  // מבנים ופרטים
  pergola: <I><rect x="4" y="5" width="16" height="14" /><path d="M4 8h16M4 11h16M4 14h16M4 17h16" opacity=".6" /><rect x="3.5" y="4.5" width="2" height="2" /><rect x="18.5" y="4.5" width="2" height="2" /><rect x="3.5" y="17.5" width="2" height="2" /><rect x="18.5" y="17.5" width="2" height="2" /></I>,
  bench: <I><rect x="3" y="10" width="18" height="4" rx="1" /><path d="M7 10v4M12 10v4M17 10v4" opacity=".5" /></I>,
  dining: <I><circle cx="12" cy="12" r="4.5" /><rect x="10" y="3" width="4" height="3" rx="1" /><rect x="10" y="18" width="4" height="3" rx="1" /><rect x="3" y="10" width="3" height="4" rx="1" /><rect x="18" y="10" width="3" height="4" rx="1" /></I>,
  lounger: <I><rect x="8" y="3" width="8" height="18" rx="2" /><path d="M8 8h8" /><path d="M10 11h4M10 14h4M10 17h4" opacity=".5" /></I>,
  umbrella: <I><circle cx="12" cy="12" r="8" /><path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3L6.3 17.7" opacity=".5" /><circle cx="12" cy="12" r="1" /></I>,
  grill: <I><rect x="3" y="8" width="18" height="8" rx="1" /><circle cx="8" cy="12" r="2" /><rect x="13" y="10" width="5" height="4" /></I>,
  firepit: <I><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="4" /><path d="M12 9c1 1 1.5 2 0 3.5-1.5-1.5-1-2.5 0-3.5z" /></I>,
  shed: <I><rect x="5" y="6" width="14" height="12" /><path d="M5 6l7 6 7-6" /><path d="M10 18v-3h4v3" /></I>,
  play: <I><path d="M4 20l4-14h8l4 14" /><path d="M8 6v14M16 6v14" opacity=".5" /><path d="M10 12h4M10 16h4" /></I>,
  sandbox: <I><rect x="4" y="4" width="16" height="16" /><path d="M7 9h0M11 7h0M15 10h0M8 14h0M13 15h0M16 17h0M10 18h0" strokeWidth="2" /></I>,
  // מים ותאורה
  pond: <I><path d="M5 12c0-4 4-7 8-6 5 1 7 4 6 8-1 4-5 6-9 5-3-1-5-3-5-7z" /><path d="M8 11c1.5-1 3 1 4.5 0s3 1 4.5 0M8 14c1.5-1 3 1 4.5 0s3 1 4.5 0" opacity=".6" /></I>,
  fountain: <I><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 4v5M12 15v5M4 12h5M15 12h5" opacity=".5" /></I>,
  lamp: <I><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></I>,
  spot: <I><circle cx="12" cy="12" r="2" /><path d="M12 10l-5-6h10z" opacity=".6" /></I>,
  tap: <I><path d="M6 10h8a3 3 0 0 1 3 3v2" /><path d="M6 8v4M9 6h-3" /><path d="M17 18c0 1-1 2-1 2s-1-1-1-2 1-2 1-2 1 1 1 2z" /></I>,
  // קווים
  edging: <I><path d="M3 15h18M3 18h18" /><path d="M6 15v3M10 15v3M14 15v3M18 15v3" /><path d="M3 9c4-3 8 3 12 0s5 0 6 0" opacity=".5" /></I>,
  path: <I><path d="M5 21c0-6 6-6 6-11s-3-6-3-7M13 21c0-6 6-6 6-11s-3-6-3-7" /><path d="M9 17l4 0M11 12l4 0M10 7l3 0" opacity=".5" /></I>,
  irrigation: <I><path d="M3 12h18" strokeDasharray="2 2.5" /><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /><path d="M6 9v-2M12 9v-2M18 9v-2" opacity=".5" /></I>,
  low_wall: <I><rect x="3" y="9" width="18" height="6" /><path d="M3 12h18M8 9v3M14 9v3M11 12v3M17 12v3" opacity=".6" /></I>,
  light_strip: <I><path d="M3 12h18" /><circle cx="6" cy="12" r="1" /><circle cx="10" cy="12" r="1" /><circle cx="14" cy="12" r="1" /><circle cx="18" cy="12" r="1" /><path d="M6 9V7M10 9V7M14 9V7M18 9V7" opacity=".5" /></I>,
}

export function GardenIcon({ id }: { id: string }) {
  return <>{ICONS[id] ?? ICONS.select}</>
}
