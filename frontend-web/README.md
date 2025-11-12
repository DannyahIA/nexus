# Nexus Web Frontend

Frontend web do Nexus usando React, Vite, TypeScript e Tailwind CSS.

## 🚀 Tecnologias

- **React 18** - UI library
- **Vite** - Build tool
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **React Router** - Navigation
- **Axios** - HTTP client
- **Socket.io** - WebSocket client
- **Lucide React** - Icons

## 📦 Instalação

```bash
cd frontend-web
npm install
```

## 🔧 Configuração

Copie o arquivo `.env.example` para `.env`:

```bash
cp .env.example .env
```

Edite o arquivo `.env` conforme necessário:

```
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8080
```

## 🏃 Executando

```bash
# Desenvolvimento
npm run dev

# Build para produção
npm run build

# Preview da build
npm run preview
```

## 🌐 Acessando

A aplicação estará disponível em: http://localhost:3000

## 📁 Estrutura

```
frontend-web/
├── src/
│   ├── screens/        # Telas da aplicação
│   ├── store/          # Zustand stores
│   ├── services/       # API e WebSocket clients
│   ├── App.tsx         # Componente principal
│   ├── main.tsx        # Entry point
│   └── index.css       # Estilos globais
├── index.html
├── vite.config.ts
└── package.json
```

## 🎨 Features

- ✅ Login/autenticação
- ✅ Chat em tempo real
- ✅ Gerenciamento de tarefas (Kanban)
- ✅ WebSocket para atualizações em tempo real
- ✅ Design responsivo
- ✅ Dark mode
