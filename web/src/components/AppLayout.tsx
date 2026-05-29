import { BookOutlined, DownOutlined, KeyOutlined, LogoutOutlined, TagOutlined, UserOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { Dropdown, Grid, Layout, Menu } from 'antd'
import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import ChangePasswordModal from './ChangePasswordModal'
import { logout } from '../api/auth'
import { clearSession, getRole, getUsername, getUuid } from '../utils/token'

const { Header, Content } = Layout
const { useBreakpoint } = Grid

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

  async function handleLogout() {
    await logout()
    clearSession()
    navigate('/login', { replace: true })
  }

  const screens = useBreakpoint()
  const isMobile = screens.md === false

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
      <Header style={{ display: 'flex', alignItems: 'center', padding: isMobile ? '0 16px' : '0 24px', gap: 16 }}>
        <span style={{ color: 'white', fontWeight: 'bold', fontSize: '18px', whiteSpace: 'nowrap' }}>
          MangaDB
        </span>
        {!isMobile && (
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[selectedKey]}
            style={{ flex: 1, minWidth: 0, borderBottom: 'none' }}
            items={navItems}
          />
        )}
        <div style={{ flex: isMobile ? 1 : 0 }} />
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <span style={{ color: 'rgba(255,255,255,0.85)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <UserOutlined style={{ marginRight: isMobile ? 0 : 6 }} />
            {!isMobile && username}
            {!isMobile && <DownOutlined style={{ marginLeft: 6, fontSize: 11 }} />}
          </span>
        </Dropdown>
      </Header>
      <Content style={{
        padding: isMobile ? '12px' : '24px',
        paddingBottom: isMobile ? 'calc(12px + 56px)' : '24px',
        background: '#fff',
        minHeight: 280,
      }}>
        <Outlet />
      </Content>

      {isMobile && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 56,
          background: '#001529',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          zIndex: 1000,
        }}>
          {navItems.map(item => (
            <div
              key={item.key}
              onClick={item.onClick}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                cursor: 'pointer',
                color: selectedKey === item.key ? '#1677ff' : 'rgba(255,255,255,0.55)',
                fontSize: 22,
              }}
            >
              {item.icon}
              <span style={{ fontSize: 10 }}>{item.label}</span>
            </div>
          ))}
        </div>
      )}

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