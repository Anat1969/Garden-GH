// תוכנית והדמיה לצירוף להדפסה: מופיעים רק בהדפסה, בעמוד נפרד, בלי חיתוך.
import type { Project } from '../lib/types'
import { PlanThumb } from './PlanThumb'
import { StoredImage } from './CopyBox'

export const modelImageKey = (projectId: string) => `model:${projectId}`

export function PrintVisuals({ project }: { project: Project }) {
  return (
    <section className="print-only print-page print-visuals">
      <h2 className="h-section">תוכנית והדמיה</h2>
      <figure className="print-fig">
        <div className="print-plan">
          <PlanThumb project={project} />
        </div>
        <figcaption>תוכנית הבית והגינה, החלופה הפעילה</figcaption>
      </figure>
      <figure className="print-fig">
        <StoredImage storeKey={modelImageKey(project.id)} alt="הדמיה תלת-ממדית" />
        <figcaption>הדמיה תלת-ממדית מהמודל. אם חסרה, פותחים את לשונית המודל פעם אחת לפני ההדפסה.</figcaption>
      </figure>
    </section>
  )
}

// כותרת להדפסה: לוגו, שם הפרויקט, כתובת, נושא העמוד ותאריך
export function PrintHead({ project, subject }: { project: Project; subject: string }) {
  return (
    <header className="print-only print-head">
      <img src="/logo-anat.png" alt="" />
      <div>
        <div className="ph-title">{project.name}</div>
        <div className="ph-sub">
          {subject} · {project.address} · {new Date().toLocaleDateString('he-IL')}
        </div>
      </div>
    </header>
  )
}
