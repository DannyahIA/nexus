import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LoginScreen from './screens/LoginScreen'
import RegisterScreen from './screens/RegisterScreen'
import ChatScreen from './screens/ChatScreen'
import TasksScreen from './screens/TasksScreen'
import HomeScreen from './screens/HomeScreen'
import FriendsScreen from './screens/FriendsScreen'
import MainLayout from './screens/MainLayout'
import ErrorNotificationContainer from './components/ErrorNotificationContainer'
import { useAuthStore } from './store/authStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* Error Notification System (Requirement 6.3) */}
        <ErrorNotificationContainer />
        
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/register" element={<RegisterScreen />} />
          
          {/* Discord-style routes with MainLayout */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <MainLayout />
              </PrivateRoute>
            }
          >
            {/* Home view - Friends & DMs */}
            <Route index element={<Navigate to="/home" replace />} />
            <Route path="home" element={<HomeScreen />} />
            <Route path="friends" element={<FriendsScreen />} />
            
            {/* DM routes */}
            <Route path="dm/:channelId" element={<ChatScreen />} />
            
            {/* Server routes */}
            <Route path="server/:serverId" element={<ChatScreen />} />
            <Route path="server/:serverId/:channelId" element={<ChatScreen />} />
            
            {/* Tasks route (legacy support) */}
            <Route path="tasks/:channelId?" element={<TasksScreen />} />
          </Route>
          
          {/* Redirect old routes */}
          <Route path="/chat/:channelId?" element={<Navigate to="/home" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
