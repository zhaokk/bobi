/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY: string;
  readonly VITE_OPENAI_MODEL: string;
  readonly VITE_OPENAI_VOICE: string;
  readonly VITE_CLOUD_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
