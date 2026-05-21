import { AppstoreOutlined, BookOutlined, TagOutlined } from '@ant-design/icons'
import { Layout, Menu } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

const { Sider, Content } = Layout

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()

  const selectedKey = location.pathname.startsWith('/mangas') ? 'mangas'
    : location.pathname.startsWith('/tags') ? 'tags'
    : location.pathname.startsWith('/tag-types') ? 'tag-types'
    : 'mangas'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider>
        <div style={{
          color: 'white',
          padding: '16px 20px',
          fontWeight: 'bold',
          fontSize: '18px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          MangaDB
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={[
            { key: 'mangas', icon: <BookOutlined />, label: '漫画', onClick: () => navigate('/mangas') },
            { key: 'tags', icon: <TagOutlined />, label: '标签', onClick: () => navigate('/tags') },
            { key: 'tag-types', icon: <AppstoreOutlined />, label: '标签类型', onClick: () => navigate('/tag-types') },
          ]}
        />
      </Sider>
      <Layout>
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
    </Layout>
  )
}