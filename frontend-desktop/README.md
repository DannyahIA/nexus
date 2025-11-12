# Nexus Desktop

Aplicação desktop do Nexus usando Electron.

## 🚀 Tecnologias

- **Electron** - Framework para aplicações desktop
- **Electron Store** - Persistência de dados local
- **Electron Builder** - Build e empacotamento

## 📦 Instalação

```bash
cd frontend-desktop
npm install
```

## 🏃 Executando

### Desenvolvimento

Para executar em modo desenvolvimento (usa o servidor Vite em http://localhost:3000):

```bash
# 1. Primeiro, inicie o frontend web
cd ../frontend-web
npm run dev

# 2. Em outro terminal, inicie o Electron
cd ../frontend-desktop
npm run dev
```

### Produção

Para executar a versão de produção:

```bash
# 1. Build do frontend web
cd ../frontend-web
npm run build

# 2. Copie os arquivos buildados
cp -r dist ../frontend-desktop/renderer

# 3. Inicie o Electron
cd ../frontend-desktop
npm start
```

## 📦 Build

Para criar executáveis para distribuição:

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux

# Todas as plataformas
npm run build
```

Os executáveis serão criados na pasta `dist/`.

## 🎯 Features

- ✅ Aplicação nativa multiplataforma (Windows, macOS, Linux)
- ✅ Armazenamento local com Electron Store
- ✅ Menu nativo da aplicação
- ✅ Atalhos de teclado
- ✅ Auto-updates (pode ser implementado)
- ✅ Tray icon (pode ser implementado)
- ✅ Notificações nativas (pode ser implementado)

## 📁 Estrutura

```
frontend-desktop/
├── main.js           # Processo principal do Electron
├── preload.js        # Script de preload
├── renderer/         # Build do frontend web
├── assets/           # Ícones e recursos
└── package.json
```

## 🔧 Scripts

- `npm start` - Inicia o Electron (produção)
- `npm run dev` - Inicia o Electron (desenvolvimento)
- `npm run build` - Build para todas as plataformas
- `npm run build:win` - Build para Windows
- `npm run build:mac` - Build para macOS
- `npm run build:linux` - Build para Linux
