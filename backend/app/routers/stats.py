from fastapi import APIRouter, Query
from ..db import DB

router = APIRouter()
db = DB()

# --- Auxiliares de introspección (opcionales) --------------------------------
def _table_exists(schema: str, table: str) -> bool:
    rows = db.q("""
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = :s AND table_name = :t
        LIMIT 1
    """, s=schema, t=table)
    return bool(rows)

def _col_exists(schema: str, table: str, column: str) -> bool:
    rows = db.q("""
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = :s AND table_name = :t AND column_name = :c
        LIMIT 1
    """, s=schema, t=table, c=column)
    return bool(rows)

# --- Debug: columnas relevantes ------------------------------------------------
@router.get("/debug/cols_boletas")
def debug_cols_boletas():
    return {
        "estadistica.boletas": [r["COLUMN_NAME"] for r in db.q("""
            SELECT COLUMN_NAME
            FROM information_schema.columns
            WHERE table_schema='estadistica' AND table_name='boletas'
            ORDER BY ORDINAL_POSITION
        """)],
        "ingenieria.alumnos": [r["COLUMN_NAME"] for r in db.q("""
            SELECT COLUMN_NAME
            FROM information_schema.columns
            WHERE table_schema='ingenieria' AND table_name='alumnos'
            ORDER BY ORDINAL_POSITION
        """)],
    }

# --- Salud --------------------------------------------------------------------
@router.get("/health")
def health():
    rows = db.q("SHOW DATABASES")
    return {"ok": True, "databases": [r["Database"] for r in rows]}

# --- Metadatos ----------------------------------------------------------------
@router.get("/meta/programas")
def meta_programas(limit: int = 200):
    """
    Programas educativos detectados, normalizados:
      - Usa b.carrera si viene con valor (trim != '')
      - En caso contrario usa a.desc_programa
      - Se excluyen vacíos y se devuelve en UPPER()
    """
    sql = """
    SELECT DISTINCT
      UPPER(COALESCE(NULLIF(TRIM(b.carrera),''), TRIM(a.desc_programa), 'SIN_PROGRAMA')) AS programa
    FROM estadistica.boletas b
    LEFT JOIN ingenieria.alumnos a ON a.matricula = b.matricula
    WHERE COALESCE(NULLIF(TRIM(b.carrera),''), TRIM(a.desc_programa), '') <> ''
    ORDER BY 1
    LIMIT :limit
    """
    return db.q(sql, limit=limit)

# --- Inscritos ----------------------------------------------------------------
@router.get("/inscritos_por_ciclo")
def inscritos_por_ciclo(programa_like: str = "AEROESPACIAL"):
    """
    Inscritos por ciclo; filtro robusto de programa y orden ENE/JUN antes que AGO/DIC.
    """
    sql = """
    SELECT
      b.ciclo,
      COUNT(DISTINCT b.matricula) AS inscritos
    FROM estadistica.boletas b
    LEFT JOIN ingenieria.alumnos a ON a.matricula = b.matricula
    WHERE UPPER(COALESCE(NULLIF(TRIM(b.carrera),''), TRIM(a.desc_programa), '')) LIKE :programa
    GROUP BY b.ciclo
    ORDER BY
      CAST(SUBSTRING_INDEX(b.ciclo,'-',1) AS UNSIGNED),                 -- año
      CASE WHEN b.ciclo LIKE '%ENE/JUN' THEN 1 ELSE 2 END,              -- semestre
      b.ciclo
    """
    return db.q(sql, programa=f"%{programa_like.upper()}%")

# --- Reprobación (por ciclo) --------------------------------------------------
@router.get("/reprobacion")
def indice_reprobacion(
    programa_like: str = "AEROESPACIAL",
    aprobatoria: float = 6.0,
    contar_no_numericas: bool = False,   # si TRUE, NP/NA cuentan como reprobadas
):
    """
    Índice de reprobación por ciclo usando la MEJOR calificación por (matrícula, clave, ciclo).
    Normalización del umbral 'aprobatoria' a la escala detectada:
      - max<=1.0  -> si aprobatoria>1 => /100; si <=1 => tal cual
      - max<=10.0 -> si aprobatoria>10 => /10; si <=10 => tal cual
      - max>10.0  -> aprobatoria tal cual
    """
    sql = r"""
    WITH base AS (
      SELECT
        b.matricula,
        b.clave,
        b.ciclo,
        TRIM(b.calificacion) AS calif_txt,
        CASE WHEN b.calificacion REGEXP '^[0-9]+(\\.[0-9]+)?$'
             THEN CAST(b.calificacion AS DECIMAL(10,2))
             ELSE NULL END AS calif_num
      FROM estadistica.boletas b
      LEFT JOIN ingenieria.alumnos a ON a.matricula = b.matricula
      WHERE UPPER(COALESCE(NULLIF(TRIM(b.carrera),''), TRIM(a.desc_programa), '')) LIKE :programa
    ),
    escala AS (
      SELECT COALESCE(MAX(calif_num), 0) AS max_val FROM base
    ),
    params AS (
      SELECT CASE
               WHEN max_val <= 1.0 THEN CASE WHEN :aprobatoria > 1.0 THEN :aprobatoria/100.0 ELSE :aprobatoria END
               WHEN max_val <= 10.0 THEN CASE WHEN :aprobatoria > 10.0 THEN :aprobatoria/10.0 ELSE :aprobatoria END
               ELSE :aprobatoria
             END AS aprob_calc
      FROM escala
    ),
    final_alumno_materia AS (  -- mejor intento por alumno-materia-ciclo
      SELECT
        matricula, clave, ciclo,
        MAX(calif_num) AS calif_final
      FROM base
      GROUP BY matricula, clave, ciclo
    )
    SELECT
      f.ciclo AS ciclo,
      SUM(CASE WHEN f.calif_final IS NOT NULL THEN 1 ELSE 0 END) AS evaluadas,
      SUM(CASE
            WHEN f.calif_final IS NOT NULL AND f.calif_final < (SELECT aprob_calc FROM params) THEN 1
            WHEN f.calif_final IS NULL AND :inc_non_num = 1 THEN 1
            ELSE 0
          END) AS reprobados,
      ROUND(
        100.0 * SUM(CASE
                      WHEN f.calif_final IS NOT NULL AND f.calif_final < (SELECT aprob_calc FROM params) THEN 1
                      WHEN f.calif_final IS NULL AND :inc_non_num = 1 THEN 1
                      ELSE 0
                    END)
        / NULLIF(SUM(CASE WHEN f.calif_final IS NOT NULL THEN 1 ELSE 0 END), 0), 2
      ) AS porcentaje_reprobacion,
      (SELECT aprob_calc FROM params) AS umbral_usado
    FROM final_alumno_materia f
    GROUP BY f.ciclo
    ORDER BY
      CAST(SUBSTRING_INDEX(f.ciclo,'-',1) AS UNSIGNED),
      CASE WHEN f.ciclo LIKE '%ENE/JUN' THEN 1 ELSE 2 END,
      f.ciclo;
    """
    inc_non_num = 1 if contar_no_numericas else 0
    return db.q(
        sql,
        programa=f"%{programa_like.upper()}%",
        aprobatoria=aprobatoria,
        inc_non_num=inc_non_num,
    )

# --- Deserción (aprox) --------------------------------------------------------
@router.get("/desercion")
def desercion(programa_like: str = "AEROESPACIAL"):
    """
    Deserción (aproximada) por ciclo usando ingenieria.alumnos.estatus.
    Se asume que estatus que contienen 'BAJA' o 'INACT' son desertores.
    Resultado por ultimo_ciclo_kardex.
    """
    sql = """
    SELECT COALESCE(a.ultimo_ciclo_kardex, a.ciclo_ingreso) AS ciclo,
           SUM(CASE WHEN UPPER(COALESCE(a.estatus,'')) REGEXP 'BAJA|INACT' THEN 1 ELSE 0 END) AS desertores,
           COUNT(*) AS total,
           ROUND(100.0*SUM(CASE WHEN UPPER(COALESCE(a.estatus,'')) REGEXP 'BAJA|INACT' THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0),2) AS porcentaje
    FROM ingenieria.alumnos a
    WHERE UPPER(COALESCE(NULLIF(TRIM(a.desc_programa),''), '')) LIKE :programa
    GROUP BY COALESCE(a.ultimo_ciclo_kardex, a.ciclo_ingreso)
    ORDER BY
      CAST(SUBSTRING_INDEX(COALESCE(a.ultimo_ciclo_kardex, a.ciclo_ingreso),'-',1) AS UNSIGNED),
      CASE WHEN COALESCE(a.ultimo_ciclo_kardex, a.ciclo_ingreso) LIKE '%ENE/JUN' THEN 1 ELSE 2 END,
      COALESCE(a.ultimo_ciclo_kardex, a.ciclo_ingreso)
    """
    return db.q(sql, programa=f"%{programa_like.upper()}%")

# --- Cohorte ------------------------------------------------------------------
@router.get("/cohorte")
def seguimiento_cohorte(ciclo_ingreso: str, programa_like: str = "AEROESPACIAL"):
    """
    Seguimiento de una cohorte (alumnos con ciclo_ingreso X) y su permanencia por ciclo en boletas.
    """
    sql = """
    SELECT b.ciclo, COUNT(DISTINCT b.matricula) AS activos
    FROM estadistica.boletas b
    JOIN ingenieria.alumnos a ON a.matricula=b.matricula
    WHERE a.ciclo_ingreso = :ciclo_ingreso
      AND UPPER(COALESCE(NULLIF(TRIM(a.desc_programa),''), '')) LIKE :programa
    GROUP BY b.ciclo
    ORDER BY
      CAST(SUBSTRING_INDEX(b.ciclo,'-',1) AS UNSIGNED),
      CASE WHEN b.ciclo LIKE '%ENE/JUN' THEN 1 ELSE 2 END,
      b.ciclo
    """
    return db.q(sql, ciclo_ingreso=ciclo_ingreso, programa=f"%{programa_like.upper()}%")

# --- Cédula 322 (placeholder) -------------------------------------------------
@router.get("/cedula_322")
def cedula_322(programa_like: str = "AEROESPACIAL"):
    """
    Placeholder de Cédula 322 (estructura depende de fuente externa no incluida).
    Conteos básicos por género y estatus.
    """
    sql = """
    SELECT UPPER(COALESCE(a.genero,'N/D')) AS genero,
           UPPER(COALESCE(a.estatus,'N/D')) AS estatus,
           COUNT(*) AS total
    FROM ingenieria.alumnos a
    WHERE UPPER(COALESCE(NULLIF(TRIM(a.desc_programa),''), '')) LIKE :programa
    GROUP BY UPPER(COALESCE(a.genero,'N/D')), UPPER(COALESCE(a.estatus,'N/D'))
    ORDER BY genero, estatus
    """
    return db.q(sql, programa=f"%{programa_like.upper()}%")

@router.get("/reprobacion_detalle")
def reprobacion_detalle(
    programa_like: str = "AEROESPACIAL",
    aprobatoria: float = 6.0,
    ciclo: str | None = None,   # p.ej. "2022-SEM-AGO/DIC"
):
    """
    Detalle por materia consolidado por (clave, ciclo).
    Usa la MEJOR calificación por (matrícula, clave, ciclo),
    suma alumnos/reprobados y recalcula porcentaje.
    """
    sql = r"""
    WITH base AS (
      SELECT
        b.matricula,
        b.clave,
        b.ciclo,
        TRIM(b.grado) AS grado_txt,
        CASE WHEN b.calificacion REGEXP '^[0-9]+(\\.[0-9]+)?$'
             THEN CAST(b.calificacion AS DECIMAL(10,2))
             ELSE NULL END AS calif_num
      FROM estadistica.boletas b
      LEFT JOIN ingenieria.alumnos a ON a.matricula = b.matricula
      WHERE UPPER(COALESCE(NULLIF(TRIM(b.carrera),''), TRIM(a.desc_programa), '')) LIKE :programa
        AND ( :ciclo IS NULL OR :ciclo = '' OR b.ciclo = :ciclo )
    ),
    escala AS (
      SELECT COALESCE(MAX(calif_num), 0) AS max_val FROM base
    ),
    params AS (
      SELECT CASE
               WHEN max_val <= 1.0 THEN CASE WHEN :aprobatoria > 1.0 THEN :aprobatoria/100.0 ELSE :aprobatoria END
               WHEN max_val <= 10.0 THEN CASE WHEN :aprobatoria > 10.0 THEN :aprobatoria/10.0 ELSE :aprobatoria END
               ELSE :aprobatoria
             END AS aprob_calc
      FROM escala
    ),
    base_con_sem AS (
      SELECT
        matricula, clave, ciclo,
        CASE
          WHEN grado_txt REGEXP '^[0-9]+' THEN CAST(REGEXP_SUBSTR(grado_txt, '^[0-9]+') AS UNSIGNED)
          ELSE 0
        END AS semestre_n,
        calif_num
      FROM base
    ),
    final_alumno_materia AS (  -- mejor intento por alumno-materia-ciclo
      SELECT
        matricula, clave, ciclo,
        MIN(semestre_n) AS semestre,      -- si varía, tomamos el menor
        MAX(calif_num)  AS calif_final
      FROM base_con_sem
      GROUP BY matricula, clave, ciclo
    ),
    totales AS (  -- 1ª agregación por (clave,ciclo,semestre)
      SELECT
        f.clave, f.ciclo, f.semestre,
        COUNT(*) AS alumnos,
        SUM(CASE WHEN f.calif_final IS NOT NULL AND f.calif_final < (SELECT aprob_calc FROM params) THEN 1 ELSE 0 END) AS reprobados
      FROM final_alumno_materia f
      GROUP BY f.clave, f.ciclo, f.semestre
    ),
    consolidados AS (  -- 2ª agregación: colapsa por (clave,ciclo)
      SELECT
        t.clave, t.ciclo,
        MIN(t.semestre) AS semestre,
        SUM(t.alumnos) AS alumnos,
        SUM(t.reprobados) AS reprobados
      FROM totales t
      GROUP BY t.clave, t.ciclo
    )
    SELECT
      c.clave                                              AS `Clave`,
      COALESCE(NULLIF(TRIM(m.materia),''), '(SIN NOMBRE)') AS `Nombre de la Materia`,
      c.ciclo                                              AS `Ciclo`,
      c.semestre                                           AS `Semestre`,
      c.alumnos                                            AS `No. Alumnos`,
      c.reprobados                                         AS `No. Reprobados`,
      ROUND(100.0 * c.reprobados / NULLIF(c.alumnos, 0), 1) AS `Porcentaje`,
      (SELECT aprob_calc FROM params)                      AS `umbral_usado`
    FROM consolidados c
    LEFT JOIN ingenieria.materias m ON m.clave = c.clave
    ORDER BY
      CAST(SUBSTRING_INDEX(c.ciclo,'-',1) AS UNSIGNED),
      CASE WHEN c.ciclo LIKE '%ENE/JUN' THEN 1 ELSE 2 END,
      c.ciclo,
      `Porcentaje` DESC,
      c.clave;
    """
    return db.q(
        sql,
        programa=f"%{programa_like.upper()}%",
        aprobatoria=aprobatoria,
        ciclo=ciclo,
    )

@router.get("/desercion_escolar")
def desercion_escolar(
    programa_like: str = "AEROESPACIAL",
    restar_ri: int = 1,  # 1 = restar RI del total de deserción; 0 = no restar
):
    """
    Deserción Escolar por cohorte (ciclo_ingreso) con desglose:
      BD, BCPED, BCPES, BCM, BT, RI, Desercion, Porcentaje.
    Mapea a.estatus usando patrones robustos (abreviado o texto completo).

    Fórmula por defecto:
      Desercion = BD + BCPED + BCPES + BCM + BT - (RI si restar_ri=1)
      Porcentaje = 100 * Desercion / COUNT(*)
    """
    sql = r"""
    WITH base AS (
      SELECT
        COALESCE(a.ciclo_ingreso, a.ultimo_ciclo_kardex) AS cohorte,
        UPPER(COALESCE(TRIM(a.estatus), '')) AS estatus
      FROM ingenieria.alumnos a
      WHERE UPPER(COALESCE(NULLIF(TRIM(a.desc_programa),''), '')) LIKE :programa
    ),
    buckets AS (
      SELECT
        cohorte,
        -- BD: BAJA DEFINITIVA o ' BD ' literal
        SUM(CASE WHEN estatus REGEXP '(^|[^A-Z0-9])BD($|[^A-Z0-9])|BAJA[ ]+DEFINITIVA' THEN 1 ELSE 0 END) AS BD,
        -- BCPED: BAJA POR CAMBIO DE PROGRAMA
        SUM(CASE WHEN estatus REGEXP 'BCPED|CAMBIO[ ]+DE[ ]+PROGRAMA' THEN 1 ELSE 0 END) AS BCPED,
        -- BCPES: BAJA POR CAMBIO DE PLAN
        SUM(CASE WHEN estatus REGEXP 'BCPES|CAMBIO[ ]+DE[ ]+PLAN' THEN 1 ELSE 0 END) AS BCPES,
        -- BCM: BAJA POR CAMBIO DE MODALIDAD
        SUM(CASE WHEN estatus REGEXP '(^|[^A-Z0-9])BCM($|[^A-Z0-9])|CAMBIO[ ]+DE[ ]+MODALIDAD' THEN 1 ELSE 0 END) AS BCM,
        -- BT: BAJA TEMPORAL
        SUM(CASE WHEN estatus REGEXP '(^|[^A-Z0-9])BT($|[^A-Z0-9])|BAJA[ ]+TEMPORAL' THEN 1 ELSE 0 END) AS BT,
        -- RI: REINGRESO INSCRITO
        SUM(CASE WHEN estatus REGEXP '(^|[^A-Z0-9])RI($|[^A-Z0-9])|REINGRESO[ ]+INSCRITO' THEN 1 ELSE 0 END) AS RI,
        COUNT(*) AS total_alumnos
      FROM base
      GROUP BY cohorte
    )
    SELECT
      cohorte AS Cohorte,
      BD, BCPED, BCPES, BCM, BT, RI,
      GREATEST(
        (BD + BCPED + BCPES + BCM + BT) - (CASE WHEN :restar_ri = 1 THEN RI ELSE 0 END),
        0
      ) AS Desercion,
      ROUND(
        100.0 * GREATEST(
          (BD + BCPED + BCPES + BCM + BT) - (CASE WHEN :restar_ri = 1 THEN RI ELSE 0 END),
          0
        ) / NULLIF(total_alumnos, 0), 2
      ) AS Porcentaje
    FROM buckets
    WHERE cohorte IS NOT NULL AND cohorte <> ''
    ORDER BY
      CAST(SUBSTRING_INDEX(cohorte,'-',1) AS UNSIGNED),
      CASE WHEN cohorte LIKE '%ENE/JUN' THEN 1 ELSE 2 END,
      cohorte;
    """
    return db.q(
        sql,
        programa=f"%{programa_like.upper()}%",
        restar_ri=restar_ri,
    )

# ----------------- NUEVO: lista de cohortes para el selector -----------------
@router.get("/meta/cohortes")
def meta_cohortes(programa_like: str = "AEROESPACIAL"):
    """
    Cohortes (ciclo_ingreso) detectadas para el programa.
    """
    sql = """
    SELECT DISTINCT a.ciclo_ingreso AS cohorte
    FROM ingenieria.alumnos a
    WHERE UPPER(COALESCE(NULLIF(TRIM(a.desc_programa),''), '')) LIKE :programa
      AND COALESCE(NULLIF(TRIM(a.ciclo_ingreso),''), '') <> ''
    ORDER BY
      CAST(SUBSTRING_INDEX(a.ciclo_ingreso,'-',1) AS UNSIGNED),
      CASE WHEN a.ciclo_ingreso LIKE '%ENE/JUN' THEN 1 ELSE 2 END,
      a.ciclo_ingreso
    """
    return db.q(sql, programa=f"%{programa_like.upper()}%")

@router.get("/seguimiento_cohorte_resumen")
def seguimiento_cohorte_resumen(
    programa_like: str = "AEROESPACIAL",
    cohorte: str | None = None,
    max_semestres: int = 9,
    re_pasantes: str = r"PASAN|PASANTE",
    re_titulados: str = r"TITUL",
    re_egresados: str = r"EGRES",
):
    """
    Egresados = alumnos que son PASANTES o TITULADOS (o tienen estatus que matchea 'EGRES').
    Por cohorte:
      - ingreso = COUNT DISTINCT alumnos
      - pasantes, titulados = SUM flags
      - egresados = COUNT alumnos con (is_pasante OR is_titulado OR is_egres_flag)
      - s1..s9 = COUNT DISTINCT (alumno, semestre) con datos en boletas
    """
    sql = r"""
    WITH alumnos_programa AS (
      SELECT DISTINCT a.matricula, a.ciclo_ingreso
      FROM ingenieria.alumnos a
      LEFT JOIN estadistica.boletas b ON b.matricula = a.matricula
      WHERE (
              UPPER(COALESCE(NULLIF(TRIM(a.desc_programa),''), '')) LIKE :programa
           OR UPPER(COALESCE(NULLIF(TRIM(b.carrera),''), ''))      LIKE :programa
            )
        AND COALESCE(NULLIF(TRIM(a.ciclo_ingreso),''), '') <> ''
        AND ( :cohorte IS NULL OR a.ciclo_ingreso = :cohorte )
    ),
    estatus_por_alumno AS (
      SELECT
        ap.ciclo_ingreso AS cohorte,
        ap.matricula,
        MAX(UPPER(COALESCE(a.estatus,'')) REGEXP :re_pas) AS is_pasante,
        MAX(UPPER(COALESCE(a.estatus,'')) REGEXP :re_tit) AS is_titulado,
        MAX(UPPER(COALESCE(a.estatus,'')) REGEXP :re_egr) AS is_egres_flag
      FROM alumnos_programa ap
      JOIN ingenieria.alumnos a ON a.matricula = ap.matricula
      GROUP BY ap.ciclo_ingreso, ap.matricula
    ),
    kpis AS (
      SELECT
        cohorte,
        COUNT(*) AS ingreso,
        SUM(is_pasante)  AS pasantes,
        SUM(is_titulado) AS titulados,
        -- egresados como UNION lógica (no suma aritmética) para no duplicar:
        SUM(CASE WHEN (is_pasante = 1 OR is_titulado = 1 OR is_egres_flag = 1) THEN 1 ELSE 0 END) AS egresados
      FROM estatus_por_alumno
      GROUP BY cohorte
    ),
    sem_map AS (
      SELECT DISTINCT
        ap.matricula,
        CASE
          WHEN TRIM(b.grado) REGEXP '^[0-9]+' THEN CAST(REGEXP_SUBSTR(TRIM(b.grado),'^[0-9]+') AS UNSIGNED)
          ELSE NULL
        END AS sem
      FROM alumnos_programa ap
      JOIN estadistica.boletas b ON b.matricula = ap.matricula
      WHERE COALESCE(TRIM(b.grado),'') <> ''
    ),
    sem_agg AS (
      SELECT
        ap.ciclo_ingreso AS cohorte,
        sm.sem,
        COUNT(*) AS n_alumnos_sem
      FROM alumnos_programa ap
      JOIN sem_map sm ON sm.matricula = ap.matricula
      WHERE sm.sem IS NOT NULL AND sm.sem BETWEEN 1 AND 12
      GROUP BY ap.ciclo_ingreso, sm.sem
    )
    SELECT
      k.cohorte,
      k.ingreso,
      COALESCE(SUM(CASE WHEN sa.sem = 1 THEN sa.n_alumnos_sem END),0) AS s1,
      COALESCE(SUM(CASE WHEN sa.sem = 2 THEN sa.n_alumnos_sem END),0) AS s2,
      COALESCE(SUM(CASE WHEN sa.sem = 3 THEN sa.n_alumnos_sem END),0) AS s3,
      COALESCE(SUM(CASE WHEN sa.sem = 4 THEN sa.n_alumnos_sem END),0) AS s4,
      COALESCE(SUM(CASE WHEN sa.sem = 5 THEN sa.n_alumnos_sem END),0) AS s5,
      COALESCE(SUM(CASE WHEN sa.sem = 6 THEN sa.n_alumnos_sem END),0) AS s6,
      COALESCE(SUM(CASE WHEN sa.sem = 7 THEN sa.n_alumnos_sem END),0) AS s7,
      COALESCE(SUM(CASE WHEN sa.sem = 8 THEN sa.n_alumnos_sem END),0) AS s8,
      COALESCE(SUM(CASE WHEN sa.sem = 9 THEN sa.n_alumnos_sem END),0) AS s9,
      k.pasantes,
      k.titulados,
      k.egresados,
      ROUND(100.0 * k.titulados / NULLIF(k.ingreso,0), 1) AS pct_titulados,
      ROUND(100.0 * k.egresados / NULLIF(k.ingreso,0), 1) AS pct_egresados
    FROM kpis k
    LEFT JOIN sem_agg sa ON sa.cohorte = k.cohorte
    GROUP BY
      k.cohorte, k.ingreso, k.pasantes, k.titulados, k.egresados
    ORDER BY
      CAST(SUBSTRING_INDEX(k.cohorte,'-',1) AS UNSIGNED),
      CASE WHEN k.cohorte LIKE '%ENE/JUN' THEN 1 ELSE 2 END,
      k.cohorte
    """
    return db.q(
      sql,
      programa=f"%{programa_like.upper()}%",
      cohorte=cohorte,
      re_pas=re_pasantes.upper(),
      re_tit=re_titulados.upper(),
      re_egr=re_egresados.upper(),
    )
