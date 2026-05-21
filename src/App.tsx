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
import InnovacionPage from './app/innovacion/index'
import LoginPage from './app/login/index'
import TestEtiquetasPdfPage from './app/dev/TestEtiquetasPdfPage'
import { AuthenticatedLayout } from './components/auth/AuthenticatedLayout'
import { OrderTasksOverlay } from './components/global/OrderTasksOverlay'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background">
        <OrderTasksOverlay />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AuthenticatedLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/pedidos" element={<PedidosPage />} />
            <Route path="/produccion" element={<ProduccionPage />} />
            <Route path="/programas" element={<ProgramasPage />} />
            <Route path="/envios" element={<EnviosPage />} />
            <Route path="/stock" element={<StockPage />} />
            <Route path="/economia" element={<EconomiaPage />} />
            <Route path="/gastos" element={<GastosPage />} />
            <Route path="/mockups" element={<MockupsPage />} />
            <Route path="/precios" element={<PreciosPage />} />
            <Route path="/innovacion" element={<InnovacionPage />} />
          </Route>
          <Route path="/admin/registros" element={<Navigate to="/pedidos" replace />} />
          {import.meta.env.DEV ? (
            <Route path="/dev/test-etiquetas-pdf" element={<TestEtiquetasPdfPage />} />
          ) : null}
        </Routes>
      </div>
    </Router>
  )
}

export default App
