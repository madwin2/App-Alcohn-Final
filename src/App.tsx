import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './app/home/index'
import PedidosPage from './app/pedidos/index'
import ProduccionPage from './app/produccion/index'
import ProgramasPage from './app/programas/index'
import EnviosPage from './app/envios/index'
import StockPage from './app/stock/index'
import EconomiaPage from './app/economia/index'
import GastosPage from './app/gastos/index'
import MockupsPage from './app/mockups/index'
import PreciosPage from './app/precios/index'
import LoginPage from './app/login/index'
import TestEtiquetasPdfPage from './app/dev/TestEtiquetasPdfPage'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { OrderTasksOverlay } from './components/global/OrderTasksOverlay'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background">
        <OrderTasksOverlay />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <HomePage />
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
            path="/envios"
            element={
              <ProtectedRoute>
                <EnviosPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock"
            element={
              <ProtectedRoute>
                <StockPage />
              </ProtectedRoute>
            }
          />
          <Route 
            path="/admin/registros"
            element={<Navigate to="/pedidos" replace />}
          />
          <Route
            path="/economia"
            element={
              <ProtectedRoute>
                <EconomiaPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/gastos"
            element={
              <ProtectedRoute>
                <GastosPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/mockups"
            element={
              <ProtectedRoute>
                <MockupsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/precios"
            element={
              <ProtectedRoute>
                <PreciosPage />
              </ProtectedRoute>
            }
          />
          {import.meta.env.DEV ? (
            <Route path="/dev/test-etiquetas-pdf" element={<TestEtiquetasPdfPage />} />
          ) : null}
        </Routes>
      </div>
    </Router>
  )
}

export default App
