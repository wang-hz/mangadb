import { Navigate, useLocation } from 'react-router-dom'
import { getToken } from '../utils/token'

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  if (!getToken()) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return <>{children}</>
}