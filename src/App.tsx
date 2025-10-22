import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import PedidosPage from './app/pedidos/index'
import ProduccionPage from './app/produccion/index'
import ProgramasPage from './app/programas/index'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background">
        <Routes>
          <Route path="/" element={<PedidosPage />} />
          <Route path="/pedidos" element={<PedidosPage />} />
          <Route path="/produccion" element={<ProduccionPage />} />
          <Route path="/programas" element={<ProgramasPage />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
