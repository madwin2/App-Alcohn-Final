import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import PedidosPage from './app/pedidos/index'
import ProduccionPage from './app/produccion/index'
import ProgramasPage from './app/programas/index'
import LoginPage from './app/login/index'
import { ProtectedRoute } from './components/auth/ProtectedRoute'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <Navigate to="/pedidos" replace />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/pedidos" 
            element={
              <ProtectedRoute>
                <PedidosPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/produccion" 
            element={
              <ProtectedRoute>
                <ProduccionPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/programas" 
            element={
              <ProtectedRoute>
                <ProgramasPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/registros"
            element={<Navigate to="/pedidos" replace />}
          />
        </Routes>
      </div>
    </Router>
  )
}

export default App
