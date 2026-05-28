import { ArrowLeftOutlined, DeleteOutlined, DownOutlined, StarFilled, UpOutlined } from '@ant-design/icons'
import { Button, message, Space, Spin, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'

const { Title } = Typography

const IMG_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3'%3E%3Crect fill='%23f0f0f0' width='2' height='3'/%3E%3C/svg%3E"
const onImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.onerror = null
  e.currentTarget.src = IMG_FALLBACK
}

export default function MangaPagesEditorPage() {
  const { uuid } = useParams<{ uuid: string }>()
  const navigate = useNavigate()
  const [displayTitle, setDisplayTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [allFolderFiles, setAllFolderFiles] = useState<string[]>([])
  const [editedPages, setEditedPages] = useState<string[]>([])
  const [editedCover, setEditedCover] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!uuid) return
    setLoading(true)
    Promise.all([
      api.getManga(uuid),
      api.getMangaFolderFiles(uuid),
    ])
      .then(([manga, files]) => {
        setDisplayTitle(manga.displayTitle)
        setEditedPages(manga.pages ?? [])
        setEditedCover(manga.cover ?? 0)
        setAllFolderFiles(files)
      })
      .catch(() => message.error('加载失败'))
      .finally(() => setLoading(false))
  }, [uuid])

  const movePageUp = (index: number) => {
    setEditedPages(prev => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
    setEditedCover(prev => prev === index ? index - 1 : prev === index - 1 ? index : prev)
  }

  const movePageDown = (index: number) => {
    setEditedPages(prev => {
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
    setEditedCover(prev => prev === index ? index + 1 : prev === index + 1 ? index : prev)
  }

  const removePage = (index: number) => {
    setEditedPages(prev => prev.filter((_, i) => i !== index))
    setEditedCover(prev => prev === index ? 0 : prev > index ? prev - 1 : prev)
  }

  const addPage = (filename: string) => {
    setEditedPages(prev => [...prev, filename])
  }

  const handleSave = async () => {
    if (!uuid) return
    setSaving(true)
    try {
      await api.updateMangaPages(uuid, editedPages, editedCover)
      message.success('保存成功')
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spin style={{ display: 'block', paddingTop: 48 }} />

  const pagesInEditor = new Set(editedPages)
  const notInPages = allFolderFiles.filter(f => !pagesInEditor.has(f))

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Space>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/mangas/${uuid}`)}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>页面管理 — {displayTitle}</Title>
      </Space>

      <div>
        <div style={{ marginBottom: 8, color: '#666' }}>当前页面（{editedPages.length} 页）</div>
        <div style={{ maxHeight: 600, overflowY: 'auto', border: '1px solid #d9d9d9', borderRadius: 6, padding: 4 }}>
          {editedPages.length === 0 && (
            <div style={{ padding: 16, color: '#999', textAlign: 'center' }}>暂无页面</div>
          )}
          {editedPages.map((filename, index) => (
            <div
              key={filename}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 8px',
                borderRadius: 4,
                marginBottom: 2,
                border: index === editedCover ? '1px solid #1677ff' : '1px solid transparent',
                background: index === editedCover ? '#e6f4ff' : undefined,
              }}
            >
              <img
                src={`/api/file/mangas/${uuid}/file/${encodeURIComponent(filename)}`}
                alt={filename}
                style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
                onError={onImgError}
              />
              <span style={{ flex: 1, fontSize: 12, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {filename}
              </span>
              {index === editedCover && (
                <Tag color="blue" icon={<StarFilled />} style={{ flexShrink: 0 }}>封面</Tag>
              )}
              <Button size="small" icon={<UpOutlined />} disabled={index === 0} onClick={() => movePageUp(index)} />
              <Button size="small" icon={<DownOutlined />} disabled={index === editedPages.length - 1} onClick={() => movePageDown(index)} />
              <Button size="small" disabled={index === editedCover} onClick={() => setEditedCover(index)}>封面</Button>
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removePage(index)} />
            </div>
          ))}
        </div>
      </div>

      {notInPages.length > 0 && (
        <div>
          <div style={{ marginBottom: 8, color: '#666' }}>文件夹中未包含的文件（{notInPages.length} 个）</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {notInPages.map(filename => (
              <div key={filename} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 80 }}>
                <img
                  src={`/api/file/mangas/${uuid}/file/${encodeURIComponent(filename)}`}
                  alt={filename}
                  style={{ width: 80, height: 112, objectFit: 'cover', border: '1px solid #d9d9d9', borderRadius: 4 }}
                  onError={onImgError}
                />
                <div style={{ fontSize: 11, color: '#666', textAlign: 'center', wordBreak: 'break-all', width: '100%' }}>
                  {filename}
                </div>
                <Button size="small" onClick={() => addPage(filename)}>添加</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button type="primary" size="large" loading={saving} onClick={handleSave}>
        保存页面
      </Button>
    </Space>
  )
}