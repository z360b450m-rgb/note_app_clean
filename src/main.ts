import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import './ui-theme.css'
import { installButtonMotion } from './utils/buttonMotion'

const app = createApp(App)
app.mount('#app')
installButtonMotion()

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  } else {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister())
    })
    if ('caches' in window) {
      caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)))
    }
  }
}
