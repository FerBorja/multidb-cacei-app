// src/pages/ReprobacionPorMateria.jsx
import React from 'react'
import ReprobacionMaterias from '../components/ReprobacionMaterias'

export default function ReprobacionPorMateria() {
  return (
    <div style={{ padding: 16 }}>
      <h1>CACEI · Reprobación por Materia</h1>
      <p style={{ marginTop: -6, opacity: 0.7 }}>
        Vista por materia en un ciclo; ordenada por % de reprobación.
      </p>

      {/* Puedes fijar por defecto el ciclo que quieres validar */}
      <ReprobacionMaterias
        programa="AEROESPACIAL"
        aprobatoria={6.0}
        topN={0}                 // 0 = sin límite
        cicloDefault="2022-SEM-AGO/DIC"
      />
    </div>
  )
}
