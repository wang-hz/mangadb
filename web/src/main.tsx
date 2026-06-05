import { ConfigProvider } from 'antd'
import 'antd/dist/reset.css'
import './index.css'
import './i18n'
import enUS from 'antd/locale/en_US'
import zhCN from 'antd/locale/zh_CN'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { useTranslation } from 'react-i18next'
import App from './App'

function Root() {
  const { i18n } = useTranslation()
  const locale = i18n.language.startsWith('en') ? enUS : zhCN
  return (
    <ConfigProvider locale={locale}>
      <App />
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
