import React, { useEffect, useState } from 'react'
import axios from 'axios'
import Inscritos from './Inscritos.jsx'
import Reprobacion from './Reprobacion.jsx'
import { Link } from 'react-router-dom'   // ⬅️ nuevo

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

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

      <div style={{ display:'flex', gap:12, alignItems:'center', margin:'8px 0 16px' }}>
        <label>
          <span style={{marginRight:6}}>Programa:</span>
          <select value={programaSel} onChange={e=>setProgramaSel(e.target.value)}>
            {programas.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>

      {/* Inscritos */}
      <Inscritos programa={programaSel} />

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
    </div>
  )
}
