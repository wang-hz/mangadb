import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import en from './locales/en'
import ja from './locales/ja'
import zh from './locales/zh'
import zhTW from './locales/zh-TW'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      zh: { translation: zh },
      'zh-TW': { translation: zhTW },
      ja: { translation: ja },
      en: { translation: en },
    },
    fallbackLng: 'zh',
    supportedLngs: ['zh', 'zh-TW', 'ja', 'en'],
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'language',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  })

export default i18n
