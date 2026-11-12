import { Link } from 'react-router-dom'
import { Empty } from '../components/ui'

export default function NotFound() {
  return (
    <div className="card">
      <Empty title="הדף לא נמצא">
        <Link className="btn primary" to="/">
          לדף הבית
        </Link>
      </Empty>
    </div>
  )
}
