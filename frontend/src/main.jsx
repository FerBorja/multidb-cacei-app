import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './pages/App.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ReprobacionPorMateria from './pages/ReprobacionPorMateria.jsx'

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/reprobacion-materias" element={<ReprobacionPorMateria />} />
      {/* tu landing original si quieres conservarla */}
      <Route path="/demo" element={<App />} />
    </Routes>
  </BrowserRouter>
)
