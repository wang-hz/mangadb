import { ProgressProvider } from '../progress/ProgressProvider'
import { Navigate, useLocation } from 'react-router-dom'
import { getSession } from '../utils/token'

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  if (!getSession()) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return <ProgressProvider>{children}</ProgressProvider>
}