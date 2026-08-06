from __future__ import annotations

import json
import math
import re
import unicodedata
import warnings
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

CRONOGRAMA_PATH = DATA_DIR / "cronograma.xlsx"
UNIDADES_PATH = DATA_DIR / "unidades.xlsx"

ACTIVIDADES_JSON = DATA_DIR / "actividades.json"
UNIDADES_JSON = DATA_DIR / "unidades.json"
METADATA_JSON = DATA_DIR / "metadata.json"
DIAGNOSTICO_XLSX = DATA_DIR / "diagnostico_coincidencias.xlsx"

TIMEZONE = "America/Mexico_City"

warnings.filterwarnings(
    "ignore",
    message="Conditional Formatting extension is not supported and will be removed",
)

CRONOGRAMA_REQUIRED = {
    "orden_celula",
    "celula",
    "orden_entidad",
    "entidad",
    "orden_etapa",
    "etapa",
    "orden_actividad",
    "actividad",
    "inicio",
    "fin_plan",
}

UNIDADES_REQUIRED = {
    "clues",
    "entidad",
    "distribucion",
    "celula_asignada",
    "formato_tics_servicios",
    "entrega_de_equipos_red",
    "formato_pheds",
    "formato_moce",
    "cargas_pheds",
    "cargas_moce",
    "capacitaciones",
    "uso_pheds",
    "uso_moce",
    "avance",
}

# RULES = {
#     "KICK-OFF": {
#         "type": "constant",
#         "value": 100,
#     },
#     "DIAGNOSTICO TECNICO": {
#         "type": "category",
#         "column": "formato_tics_servicios",
#         "accepted": {"ENVIADO A TICS"},
#     },
#     "EQUIPAMIENTO TECNOLOGICO": {
#         "type": "category",
#         "column": "entrega_de_equipos_red",
#         "accepted": {"CONCLUIDO"},
#     },
#     "CONFIGURACION DE VPN S2S": {
#         "type": "category",
#         "column": "entrega_de_equipos_red",
#         "accepted": {"CONCLUIDO"},
#     },
#     "COLECTA INFO MOCE": {
#         "type": "category",
#         "column": "formato_moce",
#         "accepted": {"CONCLUIDO"},
#     },
#     "COLECTA INFO PHEDS": {
#         "type": "category",
#         "column": "formato_pheds",
#         "accepted": {"CONCLUIDO"},
#     },
#     "CONFIGURACIONES MOCE": {
#         "type": "category",
#         "column": "cargas_moce",
#         "accepted": {"CONCLUIDO", "NO APLICA"},
#     },
#     "CONFIGURACIONES PHEDS": {
#         "type": "category",
#         "column": "cargas_pheds",
#         "accepted": {"CONCLUIDO", "NO APLICA"},
#     },
#     "VALIDACION DE LA CONFIGURACION": {
#         "type": "category",
#         "column": "capacitaciones",
#         "accepted": {"CONCLUIDAS", "CONCLUIDO"},
#     },
#     "ENTREGA DE USUARIOS": {
#         "type": "category",
#         "column": "capacitaciones",
#         "accepted": {"CONCLUIDAS", "CONCLUIDO"},
#     },
#     "CAPACITACION MOCE": {
#         "type": "category",
#         "column": "capacitaciones",
#         "accepted": {"CONCLUIDAS", "CONCLUIDO"},
#     },
#     "CAPACITACION PHEDS": {
#         "type": "category",
#         "column": "capacitaciones",
#         "accepted": {"CONCLUIDAS", "CONCLUIDO"},
#     },
#     "INICIO DE OPERACION URGENCIAS": {
#         "type": "category",
#         "column": "uso_pheds",
#         "accepted": {"SI", "NO APLICA"},
#     },
#     "INICIO DE OPERACION HOSPITALIZACION": {
#         "type": "category",
#         "column": "uso_pheds",
#         "accepted": {"SI", "NO APLICA"},
#     },
#     "INICIO DE OPERACION CIRUGIAS": {
#         "type": "category",
#         "column": "uso_pheds",
#         "accepted": {"SI", "NO APLICA"},
#     },
#     "INICIO DE OPERACION CONSULTA EXTERNA": {
#         "type": "category",
#         "column": "uso_moce",
#         "accepted": {"SI", "NO APLICA"},
#     },
#     "OPERACION, USO Y ADOPCION": {
#         "type": "numeric_equals",
#         "column": "avance",
#         "value": 100,
#     },
# }

# =========================================================
# EQUIVALENCIAS ENTRE CRONOGRAMA Y UNIDADES
# =========================================================

RULES = {
    # -----------------------------------------------------
    # 0. KICK-OFF
    # -----------------------------------------------------
    "KICK-OFF": {
        "type": "constant",
        "value": 100,
    },
    # -----------------------------------------------------
    # 1. PREPARACIONES
    # -----------------------------------------------------
    "DIAGNOSTICO TECNICO": {
        "type": "category",
        "column": "formato_tics_servicios",
        "accepted": {
            "ENVIADO A TICS",
        },
    },
    "EQUIPAMIENTO TECNOLOGICO": {
        "type": "category",
        "column": "entrega_de_equipos_red",
        "accepted": {
            "CONCLUIDO",
        },
    },
    "CONFIGURACION DE VPN S2S": {
        "type": "category",
        "column": "entrega_de_equipos_red",
        "accepted": {
            "CONCLUIDO",
        },
    },
    # /*
    #  * IMPORTANTE:
    #  *
    #  * Las equivalencias MoCE y PHEDS son cruzadas
    #  * conforme al modelo operativo definido.
    #  */
    "COLECTA INFO MOCE": {
        "type": "category",
        "column": "formato_pheds",
        "accepted": {
            "CONCLUIDO",
        },
    },
    "COLECTA INFO PHEDS": {
        "type": "category",
        "column": "formato_moce",
        "accepted": {
            "CONCLUIDO",
        },
    },
    "CONFIGURACIONES MOCE": {
        "type": "category",
        "column": "cargas_pheds",
        "accepted": {
            "CONCLUIDO",
            "NO APLICA",
        },
    },
    "CONFIGURACIONES PHEDS": {
        "type": "category",
        "column": "cargas_moce",
        "accepted": {
            "CONCLUIDO",
            "NO APLICA",
        },
    },
    # -----------------------------------------------------
    # 2. IMPLEMENTACIÓN
    # -----------------------------------------------------
    "VALIDACION DE LA CONFIGURACION": {
        "type": "category",
        "column": "capacitaciones",
        "accepted": {
            "CONCLUIDAS",
            "CONCLUIDO",
        },
    },
    "ENTREGA DE USUARIOS": {
        "type": "category",
        "column": "capacitaciones",
        "accepted": {
            "CONCLUIDAS",
            "CONCLUIDO",
        },
    },
    "CAPACITACION MOCE": {
        "type": "category",
        "column": "capacitaciones",
        "accepted": {
            "CONCLUIDAS",
            "CONCLUIDO",
        },
    },
    "CAPACITACION PHEDS": {
        "type": "category",
        "column": "capacitaciones",
        "accepted": {
            "CONCLUIDAS",
            "CONCLUIDO",
        },
    },
    # -----------------------------------------------------
    # 3. USO Y ADOPCIÓN
    # -----------------------------------------------------
    "INICIO DE OPERACION URGENCIAS": {
        "type": "category",
        "column": "uso_pheds",
        "accepted": {
            "SI",
            "NO APLICA",
        },
    },
    "INICIO DE OPERACION HOSPITALIZACION": {
        "type": "category",
        "column": "uso_pheds",
        "accepted": {
            "SI",
            "NO APLICA",
        },
    },
    "INICIO DE OPERACION CIRUGIAS": {
        "type": "category",
        "column": "uso_pheds",
        "accepted": {
            "SI",
            "NO APLICA",
        },
    },
    "INICIO DE OPERACION CONSULTA EXTERNA": {
        "type": "category",
        "column": "uso_moce",
        "accepted": {
            "SI",
            "NO APLICA",
        },
    },
    # -----------------------------------------------------
    # 4. OPERACIÓN
    # -----------------------------------------------------
    "OPERACION, USO Y ADOPCION": {
        "type": "numeric_average",
        "column": "avance",
    },
}

MATCH_RESULTS_OK = {
    "distribucion",
}


def slug(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(
        r"[^a-zA-Z0-9]+",
        "_",
        text.strip().lower(),
    )
    return text.strip("_")


# def normalize_text(value: Any) -> str:
#     if value is None:
#         return ""

#     try:
#         if pd.isna(value):
#             return ""
#     except (TypeError, ValueError):
#         pass

#     text = unicodedata.normalize(
#         "NFKD",
#         str(value).strip(),
#     )
#     text = "".join(
#         char for char in text
#         if not unicodedata.combining(char)
#     )
#     return " ".join(text.upper().split()).replace("SÍ", "SI")


# def normalize_cell(value: Any) -> str:
#     text = normalize_text(value)

#     if not text:
#         return ""

#     match = re.search(r"\d+", text)

#     if match:
#         return f"Célula {int(match.group())}"

#     return str(value).strip()


def normalize_text(value: Any) -> str:
    if value is None:
        return ""

    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass

    text = unicodedata.normalize(
        "NFKD",
        str(value).strip(),
    )

    text = "".join(
        character for character in text if not unicodedata.combining(character)
    )

    text = " ".join(text.upper().split())

    return text.replace(
        "SÍ",
        "SI",
    )


def normalize_cell(value: Any) -> str:
    """
    Normaliza valores como 1, 1.0, "Célula 1" o "CELULA 01"
    al formato estándar "Célula 1".
    """
    if value is None:
        return ""

    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass

    text = normalize_text(value)
    if not text:
        return ""

    match = re.search(r"\d+", text)
    if match:
        return f"Célula {int(match.group())}"

    return str(value).strip()


def normalize_progress(value: Any) -> float:
    if value is None:
        return 0.0

    try:
        if pd.isna(value):
            return 0.0
    except (TypeError, ValueError):
        pass

    if isinstance(value, str):
        text = value.strip().replace("%", "").replace(",", ".")

        if not text:
            return 0.0

        try:
            number = float(text)
        except ValueError:
            return 0.0
    else:
        try:
            number = float(value)
        except (TypeError, ValueError):
            return 0.0

    if not math.isfinite(number):
        return 0.0

    if 0 <= number <= 1:
        number *= 100

    return round(max(0.0, min(number, 100.0)), 2)


def clean_date(value: Any) -> str:
    if value is None:
        return ""

    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass

    parsed = pd.to_datetime(
        value,
        errors="coerce",
        dayfirst=True,
    )

    return "" if pd.isna(parsed) else parsed.strftime("%Y-%m-%d")


def read_excel(path: Path, sheet_name: str) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"No se encontró el archivo requerido: {path}")

    frame = pd.read_excel(
        path,
        sheet_name=sheet_name,
    )
    frame.columns = [slug(column) for column in frame.columns]

    return frame.dropna(how="all").copy()


def validate_columns(
    frame: pd.DataFrame,
    required: set[str],
    source: str,
) -> None:
    missing = sorted(required.difference(frame.columns))

    if missing:
        raise ValueError(
            f"En {source} faltan columnas obligatorias: " + ", ".join(missing)
        )


def coalesce_duplicate_columns(
    frame: pd.DataFrame,
    base_name: str,
) -> None:
    candidates = [
        column
        for column in frame.columns
        if column == base_name or column.startswith(f"{base_name}_")
    ]

    if not candidates:
        return

    result = pd.Series(
        [None] * len(frame),
        index=frame.index,
        dtype="object",
    )

    for column in candidates:
        values = frame[column].replace(
            r"^\s*$",
            np.nan,
            regex=True,
        )
        result = result.where(
            result.notna(),
            values,
        )

    frame[base_name] = result


def prepare_cronograma(
    frame: pd.DataFrame,
) -> pd.DataFrame:
    frame = frame.copy()

    validate_columns(
        frame,
        CRONOGRAMA_REQUIRED,
        "cronograma.xlsx",
    )

    if "comentarios" not in frame.columns:
        frame["comentarios"] = ""

    for column in [
        "celula",
        "entidad",
        "etapa",
        "actividad",
        "comentarios",
    ]:
        frame[column] = frame[column].fillna("").astype(str).str.strip()

    frame["celula"] = frame["celula"].map(normalize_cell)
    frame["celula_normalizada"] = frame["celula"].map(normalize_text)
    frame["entidad_normalizada"] = frame["entidad"].map(normalize_text)

    for column in [
        "orden_celula",
        "orden_entidad",
        "orden_etapa",
        "orden_actividad",
    ]:
        frame[column] = (
            pd.to_numeric(
                frame[column],
                errors="coerce",
            )
            .fillna(999)
            .astype(int)
        )

    for column in [
        "inicio",
        "fin_plan",
    ]:
        frame[column] = frame[column].map(clean_date)

    # Las fechas pueden permanecer vacías cuando la actividad todavía
    # no ha sido programada. No se descarta ni se detiene el proceso.
    frame["estado_programacion"] = frame.apply(
        lambda row: (
            "programada"
            if row["inicio"] and row["fin_plan"]
            else "pendiente_de_programar"
        ),
        axis=1,
    )

    return frame


# def prepare_unidades(
#     frame: pd.DataFrame,
# ) -> pd.DataFrame:
#     frame = frame.copy()

#     if "nombre_unidad" not in frame.columns and "nombre_de_la_unidad" in frame.columns:
#         frame = frame.rename(columns={"nombre_de_la_unidad": "nombre_unidad"})

#     coalesce_duplicate_columns(
#         frame,
#         "celula_asignada",
#     )

#     validate_columns(
#         frame,
#         UNIDADES_REQUIRED,
#         "unidades.xlsx",
#     )

#     for column in [
#         "clues",
#         "entidad",
#         "celula_asignada",
#     ]:
#         frame[column] = frame[column].fillna("").astype(str).str.strip()

#     if "nombre_unidad" in frame.columns:
#         frame["nombre_unidad"] = (
#             frame["nombre_unidad"].fillna("").astype(str).str.strip()
#         )

#     frame["celula_asignada"] = frame["celula_asignada"].map(normalize_cell)

#     frame["celula_normalizada"] = frame["celula_asignada"].map(normalize_text)

#     frame["entidad_normalizada"] = frame["entidad"].map(normalize_text)

#     frame["avance"] = frame["avance"].map(normalize_progress)

#     return frame


def prepare_unidades(
    frame: pd.DataFrame,
) -> pd.DataFrame:
    frame = frame.copy()

    if "nombre_unidad" not in frame.columns and "nombre_de_la_unidad" in frame.columns:
        frame = frame.rename(columns={"nombre_de_la_unidad": "nombre_unidad"})

    coalesce_duplicate_columns(
        frame,
        "celula_asignada",
    )

    validate_columns(
        frame,
        UNIDADES_REQUIRED,
        "unidades.xlsx",
    )

    for column in [
        "clues",
        "entidad",
        "distribucion",
        "celula_asignada",
    ]:
        frame[column] = frame[column].fillna("").astype(str).str.strip()

    if "nombre_unidad" in frame.columns:
        frame["nombre_unidad"] = (
            frame["nombre_unidad"].fillna("").astype(str).str.strip()
        )

    frame["celula_asignada"] = frame["celula_asignada"].map(normalize_cell)

    frame["celula_normalizada"] = frame["celula_asignada"].map(normalize_text)

    frame["entidad_normalizada"] = frame["entidad"].map(normalize_text)

    frame["distribucion_normalizada"] = frame["distribucion"].map(normalize_text)

    frame["avance"] = frame["avance"].map(normalize_progress)

    return frame


# def select_units_for_schedule_row(
#     unidades: pd.DataFrame,
#     cell: Any,
#     entity: Any,
# ) -> tuple[pd.DataFrame, str, int, int]:
#     normalized_cell = normalize_text(normalize_cell(cell))
#     normalized_entity = normalize_text(entity)

#     units_in_cell = unidades[unidades["celula_normalizada"] == normalized_cell].copy()

#     total_in_cell = int(len(units_in_cell))

#     if units_in_cell.empty:
#         return (
#             unidades.iloc[0:0].copy(),
#             "celula_no_encontrada",
#             0,
#             0,
#         )

#     units_by_entity = units_in_cell[
#         units_in_cell["entidad_normalizada"] == normalized_entity
#     ].copy()

#     matching_units = int(len(units_by_entity))

#     if units_by_entity.empty:
#         return (
#             unidades.iloc[0:0].copy(),
#             "entidad_no_encontrada_en_celula",
#             total_in_cell,
#             0,
#         )

#     return (
#         units_by_entity,
#         "entidad",
#         total_in_cell,
#         matching_units,
#     )


def select_units_for_schedule_row(
    unidades: pd.DataFrame,
    cell: Any,
    distribution: Any,
) -> tuple[pd.DataFrame, str, int, int]:

    normalized_cell = normalize_text(normalize_cell(cell))

    normalized_distribution = normalize_text(distribution)

    units_in_cell = unidades[unidades["celula_normalizada"] == normalized_cell].copy()

    total_in_cell = int(len(units_in_cell))

    if units_in_cell.empty:
        return (
            unidades.iloc[0:0].copy(),
            "celula_no_encontrada",
            0,
            0,
        )

    units_by_distribution = units_in_cell[
        units_in_cell["distribucion_normalizada"] == normalized_distribution
    ].copy()

    matching_units = int(len(units_by_distribution))

    if units_by_distribution.empty:
        return (
            unidades.iloc[0:0].copy(),
            "distribucion_no_encontrada_en_celula",
            total_in_cell,
            0,
        )

    return (
        units_by_distribution,
        "distribucion",
        total_in_cell,
        matching_units,
    )


# def calculate_progress(
#     activity: str,
#     units: pd.DataFrame,
# ) -> tuple[float, int, int, str]:
#     rule = RULES.get(
#         normalize_text(activity)
#     )
#     total = int(len(units))

#     if not rule:
#         return 0.0, 0, total, "Sin regla"

#     if total == 0:
#         return 0.0, 0, 0, "Sin unidades"

#     if rule["type"] == "constant":
#         return (
#             float(rule["value"]),
#             total,
#             total,
#             "Valor administrativo",
#         )

#     column = rule["column"]

#     if column not in units.columns:
#         return (
#             0.0,
#             0,
#             total,
#             f"Columna faltante: {column}",
#         )

#     if rule["type"] == "category":
#         values = units[column].map(
#             normalize_text
#         )
#         fulfilled = int(
#             values.isin(
#                 rule["accepted"]
#             ).sum()
#         )

#     elif rule["type"] == "numeric_equals":
#         values = units[column].map(
#             normalize_progress
#         )
#         fulfilled = int(
#             (
#                 values
#                 == float(rule["value"])
#             ).sum()
#         )

#     else:
#         return (
#             0.0,
#             0,
#             total,
#             "Tipo de regla desconocido",
#         )

#     progress = round(
#         (
#             fulfilled
#             / total
#         )
#         * 100,
#         1,
#     )

#     return (
#         progress,
#         fulfilled,
#         total,
#         column,
#     )


def calculate_progress(
    activity: str,
    units: pd.DataFrame,
) -> tuple[float, int, int, str]:
    """
    Calcula el avance de una actividad utilizando las unidades
    previamente filtradas por célula y distribución.
    """

    normalized_activity = normalize_text(activity)

    rule = RULES.get(normalized_activity)

    total = int(len(units))

    if not rule:
        return (
            0.0,
            0,
            total,
            "Sin regla definida",
        )

    if total == 0:
        return (
            0.0,
            0,
            0,
            "Sin unidades coincidentes",
        )

    rule_type = rule["type"]

    # -----------------------------------------------------
    # VALOR CONSTANTE
    # -----------------------------------------------------
    if rule_type == "constant":
        value = float(rule["value"])

        return (
            value,
            total if value >= 100 else 0,
            total,
            "Valor administrativo",
        )

    column = rule.get("column")

    if not column:
        return (
            0.0,
            0,
            total,
            "Regla sin columna",
        )

    if column not in units.columns:
        return (
            0.0,
            0,
            total,
            f"Columna faltante: {column}",
        )

    # -----------------------------------------------------
    # ESTADOS CATEGÓRICOS
    # -----------------------------------------------------
    if rule_type == "category":
        accepted = {normalize_text(value) for value in rule["accepted"]}

        normalized_values = units[column].map(normalize_text)

        fulfilled_mask = normalized_values.isin(accepted)

        fulfilled = int(fulfilled_mask.sum())

        progress = round(
            (fulfilled / total) * 100,
            1,
        )

        return (
            progress,
            fulfilled,
            total,
            column,
        )

    # -----------------------------------------------------
    # PROMEDIO NUMÉRICO DE AVANCE
    # -----------------------------------------------------
    if rule_type == "numeric_average":
        progress_values = units[column].map(normalize_progress)

        valid_values = progress_values[progress_values.notna()]

        if valid_values.empty:
            return (
                0.0,
                0,
                total,
                column,
            )

        progress = round(
            float(valid_values.mean()),
            1,
        )

        fulfilled = int((valid_values >= 100).sum())

        return (
            progress,
            fulfilled,
            total,
            column,
        )

    # -----------------------------------------------------
    # IGUALDAD NUMÉRICA, POR COMPATIBILIDAD
    # -----------------------------------------------------
    if rule_type == "numeric_equals":
        expected_value = float(rule["value"])

        numeric_values = units[column].map(normalize_progress)

        fulfilled = int((numeric_values == expected_value).sum())

        progress = round(
            (fulfilled / total) * 100,
            1,
        )

        return (
            progress,
            fulfilled,
            total,
            column,
        )

    return (
        0.0,
        0,
        total,
        f"Tipo de regla desconocido: {rule_type}",
    )


def clean_json_value(
    value: Any,
) -> Any:
    if value is None:
        return None

    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass

    if isinstance(
        value,
        (
            float,
            np.floating,
        ),
    ):
        if not math.isfinite(float(value)):
            return None
        return float(value)

    if isinstance(value, np.integer):
        return int(value)

    if isinstance(value, np.bool_):
        return bool(value)

    if isinstance(value, pd.Timestamp):
        return value.isoformat()

    return value


def clean_json_structure(
    data: Any,
) -> Any:
    if isinstance(data, dict):
        return {key: clean_json_structure(value) for key, value in data.items()}

    if isinstance(data, list):
        return [clean_json_structure(value) for value in data]

    return clean_json_value(data)


def write_json(
    data: Any,
    path: Path,
) -> None:
    cleaned = clean_json_structure(data)

    with path.open(
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            cleaned,
            file,
            ensure_ascii=False,
            indent=2,
            allow_nan=False,
        )


def build_diagnostic_rows(
    cronograma: pd.DataFrame,
    unidades: pd.DataFrame,
) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []

    unique_pairs = (
        cronograma[
            [
                "orden_celula",
                "celula",
                "orden_entidad",
                "entidad",
            ]
        ]
        .drop_duplicates()
        .sort_values(
            [
                "orden_celula",
                "orden_entidad",
            ]
        )
    )

    for row in unique_pairs.itertuples(index=False):
        (
            selected_units,
            match_type,
            units_in_cell,
            matching_units,
        ) = select_units_for_schedule_row(
            unidades,
            row.celula,
            row.entidad,
        )

        average_progress = (
            round(
                float(selected_units["avance"].mean()),
                2,
            )
            if not selected_units.empty
            else 0.0
        )

        rows.append(
            {
                "orden_celula": row.orden_celula,
                "celula": row.celula,
                "orden_entidad": row.orden_entidad,
                "entidad": row.entidad,
                "resultado": match_type,
                "unidades_en_celula": units_in_cell,
                "unidades_coincidentes": matching_units,
                "avance_promedio_unidades": average_progress,
            }
        )

    return pd.DataFrame(rows)


def write_diagnostic_report(
    diagnostic: pd.DataFrame,
    cronograma: pd.DataFrame,
    unidades: pd.DataFrame,
    activities: list[dict[str, Any]],
) -> None:
    summary = pd.DataFrame(
        [
            {
                "indicador": "Células en cronograma",
                "valor": int(cronograma["celula_normalizada"].nunique()),
            },
            {
                "indicador": "Grupos célula-entidad en cronograma",
                "valor": int(
                    cronograma[
                        [
                            "celula_normalizada",
                            "entidad_normalizada",
                        ]
                    ]
                    .drop_duplicates()
                    .shape[0]
                ),
            },
            {
                "indicador": "Unidades en archivo",
                "valor": int(len(unidades)),
            },
            {
                "indicador": "Coincidencias correctas",
                "valor": int(diagnostic["resultado"].isin(MATCH_RESULTS_OK).sum()),
            },
            {
                "indicador": "Células no encontradas",
                "valor": int((diagnostic["resultado"] == "celula_no_encontrada").sum()),
            },
            {
                "indicador": "Distribuciones no encontradas dentro de célula",
                "valor": int(
                    (
                        diagnostic["resultado"]
                        == "distribucion_no_encontrada_en_celula"
                    ).sum()
                ),
            },
        ]
    )

    unmatched = diagnostic[~diagnostic["resultado"].isin(MATCH_RESULTS_OK)].copy()

    activity_detail = pd.DataFrame(activities)

    unit_columns = [
        column
        for column in [
            "clues",
            "entidad",
            "distribucion",
            "celula_asignada",
            "avance",
            "nombre_unidad",
        ]
        if column in unidades.columns
    ]

    with pd.ExcelWriter(
        DIAGNOSTICO_XLSX,
        engine="openpyxl",
    ) as writer:
        summary.to_excel(
            writer,
            sheet_name="Resumen",
            index=False,
        )

        diagnostic.to_excel(
            writer,
            sheet_name="Filtro_secuencial",
            index=False,
        )

        unmatched.to_excel(
            writer,
            sheet_name="Sin_coincidencia",
            index=False,
        )

        activity_detail.to_excel(
            writer,
            sheet_name="Detalle_actividades",
            index=False,
        )

        unidades[unit_columns].to_excel(
            writer,
            sheet_name="Detalle_unidades",
            index=False,
        )


def main() -> None:
    now = datetime.now(ZoneInfo(TIMEZONE))

    DATA_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    cronograma = prepare_cronograma(
        read_excel(
            CRONOGRAMA_PATH,
            "Cronograma",
        )
    )

    unidades = prepare_unidades(
        read_excel(
            UNIDADES_PATH,
            "Unidades",
        )
    )

    print("\nColumnas auxiliares disponibles en unidades:")

    for column in [
        "celula_asignada",
        "celula_normalizada",
        "entidad",
        "entidad_normalizada",
        "distribucion",
        "distribucion_normalizada",
        "avance",
    ]:
        status = "OK" if column in unidades.columns else "FALTANTE"
        print(f" - {column}: {status}")

    activities: list[dict[str, Any]] = []

    for row in cronograma.itertuples(index=False):
        (
            entity_units,
            match_type,
            units_in_cell,
            matching_units,
        ) = select_units_for_schedule_row(
            unidades,
            row.celula,
            row.entidad,
        )

        (
            progress,
            fulfilled,
            total_units,
            source,
        ) = calculate_progress(
            row.actividad,
            entity_units,
        )

        average_unit_progress = (
            round(
                float(entity_units["avance"].mean()),
                2,
            )
            if not entity_units.empty
            else 0.0
        )

        real_end = (
            now.strftime("%Y-%m-%d")
            if (progress >= 100 and row.estado_programacion == "programada")
            else ""
        )

        activities.append(
            {
                "orden_celula": row.orden_celula,
                "celula": row.celula,
                "orden_entidad": row.orden_entidad,
                "entidad": row.entidad,
                "tipo_coincidencia": match_type,
                "unidades_en_celula": units_in_cell,
                "unidades_coincidentes": matching_units,
                "orden_etapa": row.orden_etapa,
                "etapa": row.etapa,
                "orden_actividad": row.orden_actividad,
                "actividad": row.actividad,
                "inicio": row.inicio,
                "fin_plan": row.fin_plan,
                "estado_programacion": row.estado_programacion,
                "fin_real": real_end,
                "avance": progress,
                "avance_promedio_unidades": average_unit_progress,
                "unidades_cumplen": fulfilled,
                "total_unidades": total_units,
                "fuente_avance": source,
                "comentarios": row.comentarios,
            }
        )

    activities.sort(
        key=lambda item: (
            item["orden_celula"],
            item["orden_entidad"],
            item["orden_etapa"],
            item["orden_actividad"],
        )
    )

    cells: list[dict[str, Any]] = []

    for (
        order,
        cell_name,
    ), group in cronograma.groupby(
        [
            "orden_celula",
            "celula",
        ],
        sort=True,
    ):
        entities = (
            group[
                [
                    "orden_entidad",
                    "entidad",
                ]
            ]
            .drop_duplicates()
            .sort_values("orden_entidad")
            .to_dict(orient="records")
        )

        cells.append(
            {
                "orden_celula": int(order),
                "celula": cell_name,
                "entidades": entities,
            }
        )

    unit_records = unidades.where(
        pd.notna(unidades),
        None,
    ).to_dict(orient="records")

    completed = sum(item["avance"] >= 100 for item in activities)

    today = now.date()
    delayed = 0
    critical = 0

    pending_schedule = 0

    for item in activities:
        if item.get("estado_programacion") == "pendiente_de_programar":
            pending_schedule += 1
            continue

        if not item.get("fin_plan"):
            pending_schedule += 1
            continue

        planned = datetime.strptime(
            item["fin_plan"],
            "%Y-%m-%d",
        ).date()

        if item["avance"] < 100 and today > planned:
            delayed += 1

            if (today - planned).days > 7:
                critical += 1

    diagnostic = build_diagnostic_rows(
        cronograma,
        unidades,
    )

    coincidencias_correctas = int(diagnostic["resultado"].isin(MATCH_RESULTS_OK).sum())

    sin_coincidencia = int((~diagnostic["resultado"].isin(MATCH_RESULTS_OK)).sum())

    unmatched = diagnostic[~diagnostic["resultado"].isin(MATCH_RESULTS_OK)].copy()

    metadata = {
        "ultima_actualizacion": now.strftime("%d/%m/%Y %H:%M:%S"),
        "ultima_actualizacion_iso": now.isoformat(timespec="seconds"),
        "fuentes": [
            "data/cronograma.xlsx",
            "data/unidades.xlsx",
        ],
        "datos_ficticios": False,
        "total_celulas": len(cells),
        "total_entidades": int(
            cronograma[
                [
                    "celula_normalizada",
                    "entidad_normalizada",
                ]
            ]
            .drop_duplicates()
            .shape[0]
        ),
        "total_unidades": int(len(unidades)),
        "total_actividades": len(activities),
        "actividades_concluidas": int(completed),
        "actividades_retrasadas": int(delayed),
        "actividades_criticas": int(critical),
        "actividades_pendientes_programar": int(pending_schedule),
        "coincidencias_correctas": coincidencias_correctas,
        "sin_coincidencia": sin_coincidencia,
        "nota_busqueda": (
            "La selección se realiza primero por célula "
            "y después por distribución. "
            "Las columnas ENTIDAD y NOMBRE DE LA UNIDAD "
            "no participan en la correspondencia."
        ),
    }

    write_json(
        {
            "celulas": cells,
            "actividades": activities,
        },
        ACTIVIDADES_JSON,
    )

    write_json(
        unit_records,
        UNIDADES_JSON,
    )

    write_json(
        metadata,
        METADATA_JSON,
    )

    write_diagnostic_report(
        diagnostic,
        cronograma,
        unidades,
        activities,
    )

    print(f"\nActividades generadas: " f"{len(activities):,}")

    print(f"Unidades exportadas: " f"{len(unit_records):,}")

    print(
        f"Células: {len(cells)} | "
        f"Grupos célula-entidad: "
        f"{metadata['total_entidades']}"
    )

    print(f"Coincidencias correctas: " f"{coincidencias_correctas}")

    print(f"Sin coincidencia: " f"{sin_coincidencia}")

    if sin_coincidencia > 0:
        print("\nPrimeros casos sin coincidencia:")

        for row in unmatched.head(15).itertuples(index=False):
            print(
                f" - {row.celula} -> "
                f"{row.entidad} "
                f"({row.resultado}; "
                f"unidades en célula: "
                f"{row.unidades_en_celula})"
            )

    print(f"\nDiagnóstico: " f"{DIAGNOSTICO_XLSX}")

    print(f"Actualización: " f"{metadata['ultima_actualizacion']}")


if __name__ == "__main__":
    main()
