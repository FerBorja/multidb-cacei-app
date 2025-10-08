// src/pages/Dashboard.jsx
import React, { useEffect, useState } from 'react'
import axios from 'axios'
import Inscritos from './Inscritos.jsx'
import Reprobacion from './Reprobacion.jsx'
import { Link } from 'react-router-dom'
import DesercionEscolar from '../components/DesercionEscolar'
import CohorteResumen from '../components/CohorteResumen'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Separador: línea punteada gruesa + espacio vertical
function Divider() {
  return (
    <hr
      aria-hidden="true"
      style={{
        border: 0,
        borderTop: '6px dotted #999', // gruesa y punteada
        margin: '24px 0 24px',        // “dos espacios” arriba/abajo
      }}
    />
  )
}

export default function Dashboard() {
  const [programas, setProgramas] = useState([])
  const [programaSel, setProgramaSel] = useState('AEROESPACIAL')

  useEffect(() => {
    axios.get(`${API}/api/meta/programas`).then(res => {
      const lista = (res.data || []).map(x => (x.programa || '').trim()).filter(Boolean)
      setProgramas(lista)
      if (lista.length && !lista.includes(programaSel)) setProgramaSel(lista[0])
    })
  }, [])

  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
      <h1>Dashboard CACEI</h1>

      {/* Filtros */}
      <div style={{ display:'flex', gap:12, alignItems:'center', margin:'8px 0 16px' }}>
        <label>
          <span style={{marginRight:6}}>Programa:</span>
          <select value={programaSel} onChange={e=>setProgramaSel(e.target.value)}>
            {programas.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>

      <Divider />

      {/* Inscritos */}
      <Inscritos programa={programaSel} />

      <Divider />

      {/* Índice de reprobación */}
      <Reprobacion programa={programaSel} aprobatoria={6} />
      <div style={{ textAlign:'right', marginTop: 8 }}>
        <Link
          to={`/reprobacion-materias?programa=${encodeURIComponent(programaSel)}`}
          style={{ textDecoration:'none', fontWeight:600 }}
          title="Ver detalle por materia del ciclo seleccionado"
        >
          Ver detalle por materia →
        </Link>
      </div>

      <Divider />

      {/* Deserción Escolar */}
      <div style={{ gridColumn: '1 / -1' }}>
        <DesercionEscolar programa={programaSel} restarRi={1} />
      </div>

      <Divider />

      {/* Seguimiento de la Cohorte */}
      <div style={{ gridColumn: '1 / -1' }}>
        <CohorteResumen programa={programaSel} />
      </div>

      <Divider />

      <Link
        to={`/cedula322?programa=${encodeURIComponent(programaSel)}`}
        style={{ textDecoration:'none', fontWeight:600 }}
      >
        Ver Cédula 322 →
      </Link>      

    </div>
  )
}
