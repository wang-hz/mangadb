import { CheckOutlined, CopyOutlined } from '@ant-design/icons'
import { Button, Collapse, Modal, Space, Typography, message } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const { Text, Paragraph } = Typography

interface Props {
  open: boolean
  onClose: () => void
}

function CopyableUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      message.error('复制失败')
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f5f5f5', borderRadius: 6, padding: '8px 12px', border: '1px solid #e8e8e8' }}>
      <Text style={{ flex: 1, wordBreak: 'break-all', fontSize: 13 }}>
        {url}
      </Text>
      <Button
        type="text"
        size="small"
        icon={copied ? <CheckOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined />}
        onClick={handleCopy}
        style={{ flexShrink: 0 }}
      />
    </div>
  )
}

export default function OpdsInfoModal({ open, onClose }: Props) {
  const { t } = useTranslation()
  const catalogUrl = `${window.location.origin}/api/opds/v1.2/catalog`

  const appGuides = [
    {
      key: 'koreader',
      label: 'KOReader',
      content: t('opds.guide.koreader'),
    },
    {
      key: 'moon',
      label: 'Moon+ Reader (Android)',
      content: t('opds.guide.moon'),
    },
    {
      key: 'chunky',
      label: 'Chunky Comic Reader (iOS)',
      content: t('opds.guide.chunky'),
    },
    {
      key: 'panels',
      label: 'Panels (iOS)',
      content: t('opds.guide.panels'),
    },
  ]

  return (
    <Modal
      title={null}
      open={open}
      onCancel={onClose}
      footer={null}
      width="min(560px, 95vw)"
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <div>
          <Paragraph type="secondary" style={{ marginBottom: 8 }}>
            {t('opds.urlLabel')}
          </Paragraph>
          <CopyableUrl url={catalogUrl} />
        </div>

        <div>
          <Paragraph type="secondary" style={{ marginBottom: 4 }}>
            {t('opds.authLabel')}
          </Paragraph>
          <Paragraph style={{ marginBottom: 0 }}>
            {t('opds.authDesc')}
          </Paragraph>
        </div>

        <div>
          <Paragraph type="secondary" style={{ marginBottom: 8 }}>
            {t('opds.appsLabel')}
          </Paragraph>
          <Collapse
            size="small"
            ghost
            items={appGuides.map(g => ({
              key: g.key,
              label: <Text strong>{g.label}</Text>,
              children: <Paragraph style={{ marginBottom: 0, paddingLeft: 4 }}>{g.content}</Paragraph>,
            }))}
          />
        </div>
      </Space>
    </Modal>
  )
}
