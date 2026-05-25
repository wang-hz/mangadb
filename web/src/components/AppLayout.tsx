import { BookOutlined, DownOutlined, KeyOutlined, LogoutOutlined, TagOutlined, UserOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { Dropdown, Layout, Menu } from 'antd'
import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import ChangePasswordModal from './ChangePasswordModal'
import { getRole, getUsername, getUuid, removeToken } from '../utils/token'

const { Header, Content } = Layout

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const isAdmin = getRole() === 'admin'
  const username = getUsername()
  const uuid = getUuid()
  const [changePwOpen, setChangePwOpen] = useState(false)

  const selectedKey = location.pathname.startsWith('/mangas') ? 'mangas'
    : location.pathname.startsWith('/tags') ? 'tags'
    : location.pathname.startsWith('/admin') ? 'admin'
    : 'mangas'

  function handleLogout() {
    removeToken()
    navigate('/login', { replace: true })
  }

  const navItems = [
    { key: 'mangas', icon: <BookOutlined />, label: '漫画', onClick: () => navigate('/mangas') },
    { key: 'tags', icon: <TagOutlined />, label: '标签', onClick: () => navigate('/tags') },
    ...(isAdmin ? [{ key: 'admin', icon: <UserOutlined />, label: '用户管理', onClick: () => navigate('/admin/users') }] : []),
  ]

  const userMenuItems: MenuProps['items'] = [
    { key: 'change-password', icon: <KeyOutlined />, label: '修改密码', onClick: () => setChangePwOpen(true) },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true, onClick: handleLogout },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', padding: '0 24px', gap: 24 }}>
        <span style={{ color: 'white', fontWeight: 'bold', fontSize: '18px', whiteSpace: 'nowrap' }}>
          MangaDB
        </span>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[selectedKey]}
          style={{ flex: 1, minWidth: 0, borderBottom: 'none' }}
          items={navItems}
        />
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <span style={{ color: 'rgba(255,255,255,0.85)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <UserOutlined style={{ marginRight: 6 }} />
            {username}
            <DownOutlined style={{ marginLeft: 6, fontSize: 11 }} />
          </span>
        </Dropdown>
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

      {uuid && (
        <ChangePasswordModal
          open={changePwOpen}
          onClose={() => setChangePwOpen(false)}
          targetUuid={uuid}
          isSelf
        />
      )}
    </Layout>
  )
}