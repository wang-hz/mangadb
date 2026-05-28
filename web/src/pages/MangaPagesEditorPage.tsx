import { closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeftOutlined, DeleteOutlined, StarFilled, StarOutlined } from '@ant-design/icons'
import { Button, message, Space, Spin } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'

const IMG_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3'%3E%3Crect fill='%23f0f0f0' width='2' height='3'/%3E%3C/svg%3E"
const onImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.onerror = null
  e.currentTarget.src = IMG_FALLBACK
}

const CELL_W = 120
const CELL_H = 168

function SortablePageCell({ filename, index, isCover, uuid, onSetCover, onRemove }: {
  filename: string
  index: number
  isCover: boolean
  uuid: string
  onSetCover: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: filename })

  return (
    <div
      ref={setNodeRef}
      style={{
        width: CELL_W,
        border: isCover ? '2px solid #1677ff' : '1px solid #d9d9d9',
        borderRadius: 4,
        overflow: 'hidden',
        background: '#fafafa',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        zIndex: isDragging ? 1 : undefined,
        touchAction: 'none',
      }}
      {...attributes}
      {...listeners}
    >
      <div style={{ position: 'relative' }}>
        <img
          src={`/api/file/mangas/${uuid}/file/${encodeURIComponent(filename)}`}
          alt={filename}
          style={{ width: '100%', height: CELL_H, objectFit: 'cover', display: 'block' }}
          onError={onImgError}
        />
        <span style={{
          position: 'absolute', top: 4, left: 4,
          background: 'rgba(0,0,0,0.45)', color: '#fff',
          fontSize: 11, padding: '1px 5px', borderRadius: 3, lineHeight: '18px',
        }}>
          {index + 1}
        </span>
        {isCover && (
          <StarFilled style={{
            position: 'absolute', top: 5, right: 5,
            color: '#1677ff', fontSize: 15,
            filter: 'drop-shadow(0 0 3px #fff)',
          }} />
        )}
      </div>
      <div
        style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '5px 4px' }}
        onPointerDown={e => e.stopPropagation()}
      >
        <Button size="small" icon={<StarOutlined />} disabled={isCover} onClick={onSetCover} />
        <Button size="small" danger icon={<DeleteOutlined />} onClick={onRemove} />
      </div>
    </div>
  )
}

export default function MangaPagesEditorPage() {
  const { uuid } = useParams<{ uuid: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [allFolderFiles, setAllFolderFiles] = useState<string[]>([])
  const [editedPages, setEditedPages] = useState<string[]>([])
  const [editedCover, setEditedCover] = useState(0)
  const [saving, setSaving] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    if (!uuid) return
    setLoading(true)
    Promise.all([api.getManga(uuid), api.getMangaFolderFiles(uuid)])
      .then(([manga, files]) => {
        setEditedPages(manga.pages ?? [])
        setEditedCover(manga.cover ?? 0)
        setAllFolderFiles(files)
      })
      .catch(() => message.error('加载失败'))
      .finally(() => setLoading(false))
  }, [uuid])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = editedPages.indexOf(active.id as string)
    const newIndex = editedPages.indexOf(over.id as string)
    setEditedPages(prev => arrayMove(prev, oldIndex, newIndex))
    setEditedCover(prev => {
      if (prev === oldIndex) return newIndex
      if (oldIndex < newIndex && prev > oldIndex && prev <= newIndex) return prev - 1
      if (oldIndex > newIndex && prev >= newIndex && prev < oldIndex) return prev + 1
      return prev
    })
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
        <Button type="primary" loading={saving} onClick={handleSave}>保存页面</Button>
      </Space>

      <div>
        <div style={{ marginBottom: 8, color: '#666' }}>当前页面（{editedPages.length} 页）</div>
        {editedPages.length === 0
          ? <div style={{ color: '#999' }}>暂无页面</div>
          : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={editedPages} strategy={rectSortingStrategy}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {editedPages.map((filename, index) => (
                    <SortablePageCell
                      key={filename}
                      filename={filename}
                      index={index}
                      isCover={index === editedCover}
                      uuid={uuid!}
                      onSetCover={() => setEditedCover(index)}
                      onRemove={() => removePage(index)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )
        }
      </div>

      {notInPages.length > 0 && (
        <div>
          <div style={{ marginBottom: 8, color: '#666' }}>文件夹中未包含的文件（{notInPages.length} 个）</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {notInPages.map(filename => (
              <div
                key={filename}
                style={{
                  width: CELL_W,
                  border: '1px dashed #d9d9d9',
                  borderRadius: 4,
                  overflow: 'hidden',
                  background: '#fafafa',
                }}
              >
                <img
                  src={`/api/file/mangas/${uuid}/file/${encodeURIComponent(filename)}`}
                  alt={filename}
                  style={{ width: '100%', height: CELL_H, objectFit: 'cover', display: 'block' }}
                  onError={onImgError}
                />
                <div style={{ display: 'flex', justifyContent: 'center', padding: '5px 4px' }}>
                  <Button size="small" onClick={() => addPage(filename)}>添加</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Space>
  )
}