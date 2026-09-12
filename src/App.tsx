import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './app/home/index'
import PedidosPage from './app/pedidos/index'
import ProduccionPage from './app/produccion/index'
import ProgramasPage from './app/programas/index'
import EnviosPage from './app/envios/index'
import EnviosHistorialPage from './app/envios/historial/index'
import StockPage from './app/stock/index'
import EconomiaPage from './app/economia/index'
import GastosPage from './app/gastos/index'
import MockupsPage from './app/mockups/index'
import PreciosPage from './app/precios/index'
import InnovacionPage from './app/innovacion/index'
import ComercialPage from './app/comercial/index'
import LoginPage from './app/login/index'
import ConfiguracionPage from './app/configuracion/index'
import TestEtiquetasPdfPage from './app/dev/TestEtiquetasPdfPage'
import WhatsNewSandboxPage from './app/dev/WhatsNewSandboxPage'
import AppUpdateSandboxPage from './app/dev/AppUpdateSandboxPage'
import { AuthenticatedLayout } from './components/auth/AuthenticatedLayout'
import { AppUpdatesHost } from './components/global/AppUpdatesHost'
import { OrderTasksOverlay } from './components/global/OrderTasksOverlay'
import { OrdersScopeLayout } from './components/orders/OrdersScope'
import { FabricationSizeDialogHost } from './components/shared/FabricationSizeDialogHost'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background">
        <OrderTasksOverlay />
        <FabricationSizeDialogHost />
        <AppUpdatesHost />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AuthenticatedLayout />}>
            <Route element={<OrdersScopeLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/pedidos" element={<PedidosPage />} />
              <Route path="/envios" element={<EnviosPage />} />
              <Route path="/envios/historial" element={<EnviosHistorialPage />} />
              <Route path="/economia" element={<EconomiaPage />} />
            </Route>
            <Route path="/produccion" element={<ProduccionPage />} />
            <Route path="/programas" element={<ProgramasPage />} />
            <Route path="/stock" element={<StockPage />} />
            <Route path="/gastos" element={<GastosPage />} />
            <Route path="/mockups" element={<MockupsPage />} />
            <Route path="/precios" element={<PreciosPage />} />
            <Route path="/comercial" element={<ComercialPage />} />
            <Route path="/innovacion" element={<InnovacionPage />} />
            <Route path="/configuracion" element={<ConfiguracionPage />} />
          </Route>
          <Route path="/admin/registros" element={<Navigate to="/pedidos" replace />} />
          {import.meta.env.DEV ? (
            <>
              <Route path="/dev/test-etiquetas-pdf" element={<TestEtiquetasPdfPage />} />
              <Route path="/dev/whats-new" element={<WhatsNewSandboxPage />} />
              <Route path="/dev/app-update" element={<AppUpdateSandboxPage />} />
            </>
          ) : null}
        </Routes>
      </div>
    </Router>
  )
}

export default App
