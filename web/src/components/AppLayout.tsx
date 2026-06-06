import { AuditOutlined, BookOutlined, DownOutlined, GithubOutlined, ImportOutlined, KeyOutlined, LogoutOutlined, TagOutlined, UserOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { Button, Dropdown, Grid, Layout, Menu } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import ChangePasswordModal from './ChangePasswordModal'
import { logout } from '../api/auth'
import { clearSession, getRole, getUsername, getUuid } from '../utils/token'

declare const __APP_VERSION__: string

const { Header, Content } = Layout
const { useBreakpoint } = Grid

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t, i18n } = useTranslation()
  const isAdmin = getRole() === 'admin'
  const username = getUsername()
  const uuid = getUuid()
  const [changePwOpen, setChangePwOpen] = useState(false)

  const selectedKey = location.pathname.startsWith('/mangas') ? 'mangas'
    : location.pathname.startsWith('/tags') ? 'tags'
    : 'mangas'

  async function handleLogout() {
    await logout()
    clearSession()
    navigate('/login', { replace: true })
  }

  const screens = useBreakpoint()
  const isMobile = screens.md === false

  const navItems = [
    { key: 'mangas', icon: <BookOutlined />, label: t('nav.manga'), onClick: () => navigate('/mangas') },
    { key: 'tags', icon: <TagOutlined />, label: t('nav.tags'), onClick: () => navigate('/tags') },
  ]

  const userMenuItems: MenuProps['items'] = [
    { key: 'change-password', icon: <KeyOutlined />, label: t('user.changePassword'), onClick: () => setChangePwOpen(true) },
    ...(isAdmin ? [
      { type: 'divider' as const },
      { key: 'admin-users', icon: <UserOutlined />, label: t('user.userManagement'), onClick: () => navigate('/admin/users') },
      { key: 'admin-login-logs', icon: <AuditOutlined />, label: t('user.loginLogs'), onClick: () => navigate('/admin/login-logs') },
      { key: 'admin-import', icon: <ImportOutlined />, label: t('user.import'), onClick: () => navigate('/admin/import') },
    ] : []),
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: t('user.logout'), danger: true, onClick: handleLogout },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', padding: isMobile ? '0 16px' : '0 24px', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
          <img src="/favicon.svg" style={{ width: 30, height: 30, flexShrink: 0 }} />
          <div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 17, lineHeight: 1.2 }}>MangaDB</div>
            {!isMobile && (
              <div style={{ fontSize: 11, lineHeight: 1.3, color: 'rgba(255,255,255,0.38)', marginTop: 1 }}>
                <a
                  href="https://github.com/wang-hz/mangadb"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  <GithubOutlined style={{ marginRight: 3 }} />
                  GitHub
                </a>
                <span style={{ margin: '0 5px', opacity: 0.6 }}>·</span>
                v{__APP_VERSION__}
              </div>
            )}
          </div>
        </div>
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
        <Button
          type="text"
          size="small"
          style={{ color: 'rgba(255,255,255,0.65)', flexShrink: 0 }}
          onClick={() => i18n.changeLanguage(i18n.language.startsWith('en') ? 'zh' : 'en')}
        >
          {t('lang.switch')}
        </Button>
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
              <span style={{ fontSize: 12 }}>{item.label}</span>
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
