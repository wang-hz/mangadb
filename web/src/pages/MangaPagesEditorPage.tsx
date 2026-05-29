import { closestCenter, DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, UniqueIdentifier, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeftOutlined, DeleteOutlined, StarFilled, StarOutlined } from '@ant-design/icons'
import { Button, message, Space, Spin } from 'antd'
import { memo, useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'

const IMG_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3'%3E%3Crect fill='%23f0f0f0' width='2' height='3'/%3E%3C/svg%3E"
const onImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.onerror = null
  e.currentTarget.src = IMG_FALLBACK
}

const CELL_W = 120
const CELL_H = 168

// Pure visual cell content — no dnd hooks, used by both SortablePageCell and DragOverlay
function PageCellContent({ filename, index, isCover, uuid }: {
  filename: string
  index: number
  isCover: boolean
  uuid: string
}) {
  return (
    <>
      <div style={{ position: 'relative' }}>
        <img
          src={`/api/file/mangas/${uuid}/file/${encodeURIComponent(filename)}`}
          alt={filename}
          loading="lazy"
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
      <div style={{ fontSize: 11, color: '#555', padding: '4px 6px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={filename}>
        {filename}
      </div>
    </>
  )
}

const SortablePageCell = memo(function SortablePageCell({ filename, index, isCover, uuid, onSetCover, onRemove }: {
  filename: string
  index: number
  isCover: boolean
  uuid: string
  onSetCover: (index: number) => void
  onRemove: (index: number) => void
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
        // When dragging: become an invisible placeholder that holds layout space.
        // DragOverlay takes over the visual — rendering nothing here avoids per-frame
        // render cost for the active item.
        opacity: isDragging ? 0 : 1,
        cursor: 'grab',
        willChange: 'transform',
        touchAction: 'none',
      }}
      {...attributes}
      {...listeners}
    >
      {!isDragging && (
        <>
          <PageCellContent filename={filename} index={index} isCover={isCover} uuid={uuid} />
          <div
            style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '4px 4px 5px' }}
            onPointerDown={e => e.stopPropagation()}
          >
            <Button size="small" icon={<StarOutlined />} disabled={isCover} onClick={() => onSetCover(index)} />
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onRemove(index)} />
          </div>
        </>
      )}
    </div>
  )
})

export default function MangaPagesEditorPage() {
  const { uuid } = useParams<{ uuid: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [allFolderFiles, setAllFolderFiles] = useState<string[]>([])
  const [editedPages, setEditedPages] = useState<string[]>([])
  const [editedCover, setEditedCover] = useState(0)
  const [saving, setSaving] = useState(false)
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)

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

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    setEditedPages(prev => {
      const oldIndex = prev.indexOf(active.id as string)
      const newIndex = prev.indexOf(over.id as string)
      setEditedCover(c => {
        if (c === oldIndex) return newIndex
        if (oldIndex < newIndex && c > oldIndex && c <= newIndex) return c - 1
        if (oldIndex > newIndex && c >= newIndex && c < oldIndex) return c + 1
        return c
      })
      return arrayMove(prev, oldIndex, newIndex)
    })
  }, [])

  const removePage = useCallback((index: number) => {
    setEditedPages(prev => prev.filter((_, i) => i !== index))
    setEditedCover(prev => prev === index ? 0 : prev > index ? prev - 1 : prev)
  }, [])

  const handleSetCover = useCallback((index: number) => {
    setEditedCover(index)
  }, [])

  const addPage = useCallback((filename: string) => {
    setEditedPages(prev => [...prev, filename])
  }, [])

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
  const activeIndex = activeId != null ? editedPages.indexOf(activeId as string) : -1

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Space>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/mangas/${uuid}`)}>返回</Button>
        <Button type="primary" loading={saving} onClick={handleSave}>保存</Button>
      </Space>

      <div>
        <div style={{ marginBottom: 8, color: '#666' }}>当前页面（{editedPages.length} 页）</div>
        {editedPages.length === 0
          ? <div style={{ color: '#999' }}>暂无页面</div>
          : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <SortableContext items={editedPages} strategy={rectSortingStrategy}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {editedPages.map((filename, index) => (
                    <SortablePageCell
                      key={filename}
                      filename={filename}
                      index={index}
                      isCover={index === editedCover}
                      uuid={uuid!}
                      onSetCover={handleSetCover}
                      onRemove={removePage}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay dropAnimation={null}>
                {activeId != null && activeIndex !== -1 ? (
                  <div style={{
                    width: CELL_W,
                    border: activeIndex === editedCover ? '2px solid #1677ff' : '1px solid #d9d9d9',
                    borderRadius: 4,
                    overflow: 'hidden',
                    background: '#fafafa',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                    cursor: 'grabbing',
                  }}>
                    <PageCellContent
                      filename={activeId as string}
                      index={activeIndex}
                      isCover={activeIndex === editedCover}
                      uuid={uuid!}
                    />
                  </div>
                ) : null}
              </DragOverlay>
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
                  loading="lazy"
                  style={{ width: '100%', height: CELL_H, objectFit: 'cover', display: 'block' }}
                  onError={onImgError}
                />
                <div style={{ fontSize: 11, color: '#555', padding: '4px 6px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={filename}>
                  {filename}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 4px 5px' }}>
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