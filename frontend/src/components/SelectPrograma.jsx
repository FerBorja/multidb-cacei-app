// src/components/SelectPrograma.jsx
import React, { useEffect, useState } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function SelectPrograma({ value, onChange, style }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const r = await axios.get(`${API}/api/meta/programas`)
        if (cancel) return
        const list = (r.data || [])
          .map(x => x.programa || x.PROGRAMA || x[0])
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))
        setItems(list)
      } catch (e) {
        setError('No se pudieron cargar las carreras')
      } finally {
        setLoading(false)
      }
    })()
    return () => { cancel = true }
  }, [])

  return (
    <div style={style}>
      <label style={{display:'inline-flex', gap:8, alignItems:'center'}}>
        <span>Carrera:</span>
        {loading ? (
          <span style={{opacity:.7}}>Cargando…</span>
        ) : error ? (
          <span style={{color:'crimson'}}>{error}</span>
        ) : (
          <select value={value} onChange={e=>onChange(e.target.value)}>
            {items.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </label>
    </div>
  )
}
