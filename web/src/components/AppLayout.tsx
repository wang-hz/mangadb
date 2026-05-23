import { BookOutlined, TagOutlined } from '@ant-design/icons'
import { Layout, Menu } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

const { Header, Content } = Layout

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()

  const selectedKey = location.pathname.startsWith('/mangas') ? 'mangas'
    : location.pathname.startsWith('/tags') ? 'tags'
    : 'mangas'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', padding: '0 24px', gap: 24 }}>
        <span style={{
          color: 'white',
          fontWeight: 'bold',
          fontSize: '18px',
          whiteSpace: 'nowrap',
        }}>
          MangaDB
        </span>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[selectedKey]}
          style={{ flex: 1, minWidth: 0, borderBottom: 'none' }}
          items={[
            { key: 'mangas', icon: <BookOutlined />, label: '漫画', onClick: () => navigate('/mangas') },
            { key: 'tags', icon: <TagOutlined />, label: '标签', onClick: () => navigate('/tags') },
          ]}
        />
      </Header>
      <Content style={{
        margin: '24px',
        padding: '24px',
        background: '#fff',
        borderRadius: '8px',
        minHeight: 280,
      }}>
        <Outlet />
      </Content>
    </Layout>
  )
}