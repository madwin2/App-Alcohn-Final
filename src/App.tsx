import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import PedidosPage from './app/pedidos/index'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background">
        <Routes>
          <Route path="/" element={<PedidosPage />} />
          <Route path="/pedidos" element={<PedidosPage />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
