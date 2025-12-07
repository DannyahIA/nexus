/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_WS_URL: string
  readonly VITE_SFU_WS_URL: string
  readonly VITE_TURN_URL: string
  readonly VITE_TURN_USERNAME: string
  readonly VITE_TURN_PASSWORD: string
  readonly DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
