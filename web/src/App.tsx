import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import RequireAuth from './components/RequireAuth'
import AdminUsersPage from './pages/AdminUsersPage'
import LoginPage from './pages/LoginPage'
import MangaDetailPage from './pages/MangaDetailPage'
import MangaPagesEditorPage from './pages/MangaPagesEditorPage'
import MangaListPage from './pages/MangaListPage'
import ReaderPage from './pages/ReaderPage'
import SetupPage from './pages/SetupPage'
import TagListPage from './pages/TagListPage'
import TagMangaListPage from './pages/TagMangaListPage'
import { getRole } from './utils/token'

function RequireAdmin({ children }: { children: React.ReactNode }) {
  if (getRole() !== 'admin') return <Navigate to="/mangas" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/login" element={<LoginPage />} />
        {/* Reader is full-screen — outside AppLayout but still auth-gated */}
        <Route path="/mangas/:uuid/read" element={<RequireAuth><ReaderPage /></RequireAuth>} />
        <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index element={<Navigate to="/mangas" replace />} />
          <Route path="mangas" element={<MangaListPage />} />
          <Route path="mangas/:uuid" element={<MangaDetailPage />} />
          <Route path="mangas/:uuid/pages" element={<MangaPagesEditorPage />} />
          <Route path="tags" element={<TagListPage />} />
          <Route path="tags/:uuid/mangas" element={<TagMangaListPage />} />
          <Route path="admin/users" element={<RequireAdmin><AdminUsersPage /></RequireAdmin>} />
        </Route>
      </Routes>
    </Router>
  )
}