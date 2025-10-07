import React from 'react'
import ReprobacionMaterias from '../components/ReprobacionMaterias'

export default function ReprobacionPorMateria() {
  return (
    <div style={{ padding: 16 }}>
      <h1>CACEI · Reprobación por Materia</h1>
      <p style={{ marginTop: -6, opacity: 0.7 }}>
        Vista por materia en un ciclo; ordenada por % de reprobación.
      </p>
      <ReprobacionMaterias programa="AEROESPACIAL" aprobatoria={70} topN={30} />
    </div>
  )
}
