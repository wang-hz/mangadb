import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import RequireAuth from './components/RequireAuth'
import LoginPage from './pages/LoginPage'
import MangaDetailPage from './pages/MangaDetailPage'
import MangaListPage from './pages/MangaListPage'
import TagListPage from './pages/TagListPage'
import TagMangaListPage from './pages/TagMangaListPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index element={<Navigate to="/mangas" replace />} />
          <Route path="mangas" element={<MangaListPage />} />
          <Route path="mangas/:uuid" element={<MangaDetailPage />} />
          <Route path="tags" element={<TagListPage />} />
          <Route path="tags/:uuid/mangas" element={<TagMangaListPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}