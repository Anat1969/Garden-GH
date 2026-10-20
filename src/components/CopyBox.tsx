import { IconBtn } from './EditIcons'
import { toast } from './ui'

// פרומפט להמחשה מוכן להעתקה: משפט זיקוק, פרומפט, ופרמטרים למידג'רני
export function PromptBox({ prompt, title = 'פרומפט להמחשה' }: { prompt: { distill: string; text: string; mj: string }; title?: string }) {
  const copy = async (t: string, what: string) => {
    try {
      await navigator.clipboard.writeText(t)
      toast(`${what} הועתק`)
    } catch {
      window.prompt('העתקה', t)
    }
  }
  return (
    <div className="prompt-box" data-testid="prompt-box">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>{title}</b>
        <span className="row" style={{ gap: 4 }}>
          <IconBtn icon="copy" label="העתקת הפרומפט" onClick={() => copy(prompt.text, 'הפרומפט')} />
          <IconBtn icon="copy" label="פרומפט למידג'רני" onClick={() => copy(`${prompt.text} ${prompt.mj}`, 'הפרומפט למידג\'רני')} />
        </span>
      </div>
      <p className="prompt-distill">{prompt.distill}</p>
      <p className="prompt-text">{prompt.text}</p>
      <code className="prompt-mj" dir="ltr">
        {prompt.mj}
      </code>
    </div>
  )
}
