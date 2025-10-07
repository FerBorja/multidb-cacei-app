import React from 'react'
import { Routes, Route, Link, Navigate } from 'react-router-dom'
import Dashboard from './Dashboard.jsx'
import ReprobacionPorMateria from './ReprobacionPorMateria.jsx'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function App(){
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
      <header style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ marginRight: 16 }}>CACEI Estadísticas</h2>
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/reprobacion-materias">Reprobación por Materia</Link>
        </nav>
        <span style={{ marginLeft: 'auto', opacity: 0.7 }}>API: {API}</span>
      </header>

      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/reprobacion-materias" element={<ReprobacionPorMateria />} />
        <Route path="*" element={<div>404 — ruta no encontrada</div>} />
      </Routes>
    </div>
  )
}
