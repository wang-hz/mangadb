import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import MangaDetailPage from './pages/MangaDetailPage'
import MangaListPage from './pages/MangaListPage'
import TagListPage from './pages/TagListPage'
import TagTypePage from './pages/TagTypePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/mangas" replace />} />
          <Route path="mangas" element={<MangaListPage />} />
          <Route path="mangas/:uuid" element={<MangaDetailPage />} />
          <Route path="tags" element={<TagListPage />} />
          <Route path="tag-types" element={<TagTypePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}