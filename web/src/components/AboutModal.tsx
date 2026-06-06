import { GithubOutlined } from '@ant-design/icons'
import { Modal, Space, Typography } from 'antd'
import { useTranslation } from 'react-i18next'

const { Text, Link } = Typography

declare const __APP_VERSION__: string

interface Props {
  open: boolean
  onClose: () => void
}

export default function AboutModal({ open, onClose }: Props) {
  const { t } = useTranslation()

  return (
    <Modal
      title={null}
      open={open}
      onCancel={onClose}
      footer={null}
      width="min(400px, 95vw)"
    >
      <Space direction="vertical" size="large" style={{ width: '100%', paddingTop: 8 }}>
        <Space align="center" size={14}>
          <img src="/favicon.svg" style={{ width: 48, height: 48 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 20, lineHeight: 1.3 }}>MangaDB</div>
            <Text type="secondary" style={{ fontSize: 13 }}>v{__APP_VERSION__}</Text>
          </div>
        </Space>

        <Text type="secondary">{t('about.description')}</Text>

        <Link href="https://github.com/wang-hz/mangadb" target="_blank" style={{ fontSize: 13 }}>
          <GithubOutlined style={{ marginRight: 4 }} />
          wang-hz/mangadb
        </Link>
      </Space>
    </Modal>
  )
}
