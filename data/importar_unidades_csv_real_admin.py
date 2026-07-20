#!/usr/bin/env python3
"""
Importa el archivo de unidades de Bulevar Verde mediante una mutación
predefinida de Firebase SQL Connect.

Archivo fuente esperado:
    Info aptos - Copia de Unidades.csv

Comportamiento:
- Convierte Torre T1/T2/T3/T4/T8 a 1/2/3/4/8.
- Conserva Apartamento como texto, incluidos ceros iniciales.
- Convierte "$215,334" a 215334.00.
- Convierte fechas como "2025-12-15 00:00" a "2025-12-15".
- Usa EstadoUnidad del CSV para calcular el booleano activo.
- Usa EstadoEntregaApartamento para el campo estadoUnidad del destino.
- Omite la fila especial 9999 sin torre y la reporta.
- Sin --apply solamente valida y genera reportes.
- Usa impersonateMutation para ejecutar operaciones NO_ACCESS desde un entorno administrativo.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
from dataclasses import asdict, dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterable, Sequence

import google.auth
from google.auth.transport.requests import AuthorizedSession


API_ROOT = "https://firebasedataconnect.googleapis.com/v1"
DEFAULT_PROJECT = "project-7dd6d100-d8c2-427a-a80"
DEFAULT_LOCATION = "us-east4"
DEFAULT_SERVICE = "portal-bulevar-verde"
DEFAULT_OPERATION = "ImportarUnidades"


@dataclass
class UnidadNormalizada:
    fila_csv: int
    datos: dict[str, Any]


@dataclass
class ErrorFila:
    fila_csv: int
    clave: str
    mensaje: str
    datos_originales: str


def texto(valor: Any) -> str | None:
    if valor is None:
        return None
    resultado = str(valor).strip()
    return resultado or None


def clave_normalizada(valor: Any) -> str:
    resultado = "" if valor is None else str(valor).strip()
    resultado = unicodedata.normalize("NFKD", resultado)
    resultado = "".join(
        caracter
        for caracter in resultado
        if not unicodedata.combining(caracter)
    )
    return re.sub(r"[^a-z0-9]+", "", resultado.lower())


def parsear_torre(valor: Any) -> int:
    original = texto(valor)
    if original is None:
        raise ValueError(
            "Torre está vacía. La fila especial 9999 no pertenece "
            "a una torre y no se importa."
        )

    coincidencia = re.fullmatch(r"(?:TORRE|T)?\s*(\d+)", original.upper())
    if not coincidencia:
        raise ValueError(f"Torre no tiene formato válido: {original!r}")

    torre = int(coincidencia.group(1))
    if torre <= 0:
        raise ValueError("Torre debe ser mayor que cero")
    return torre


def parsear_decimal_simple(valor: Any, campo: str) -> float:
    original = texto(valor)
    if original is None:
        raise ValueError(f"{campo} es obligatorio")

    try:
        return float(Decimal(original.replace(",", ".")))
    except InvalidOperation as exc:
        raise ValueError(
            f"{campo} no es un número válido: {original!r}"
        ) from exc


def parsear_moneda(valor: Any) -> float:
    original = texto(valor)
    if original is None:
        raise ValueError("ValorPresupuesto2026 es obligatorio")

    limpio = (
        original.replace("$", "")
        .replace("COP", "")
        .replace("\u00a0", "")
        .replace(" ", "")
    )

    # En el CSV real la coma es separador de miles: "$215,334".
    if re.fullmatch(r"-?\d{1,3}(,\d{3})+", limpio):
        limpio = limpio.replace(",", "")
    elif "," in limpio and "." in limpio:
        if limpio.rfind(",") > limpio.rfind("."):
            limpio = limpio.replace(".", "").replace(",", ".")
        else:
            limpio = limpio.replace(",", "")
    elif "," in limpio:
        # Una sola coma con 1 o 2 dígitos finales se interpreta como decimal.
        parte_entera, parte_final = limpio.rsplit(",", 1)
        if len(parte_final) in (1, 2):
            limpio = parte_entera.replace(".", "") + "." + parte_final
        else:
            limpio = limpio.replace(",", "")

    try:
        return float(Decimal(limpio))
    except InvalidOperation as exc:
        raise ValueError(
            f"ValorPresupuesto2026 no es válido: {original!r}"
        ) from exc


def parsear_fecha(valor: Any) -> str | None:
    original = texto(valor)
    if original is None:
        return None

    formatos = (
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
    )
    for formato in formatos:
        try:
            return datetime.strptime(original, formato).date().isoformat()
        except ValueError:
            continue

    raise ValueError(
        f"FechaEntregaApartamento no tiene formato válido: {original!r}"
    )


def parsear_activo(valor: Any) -> bool:
    original = texto(valor)
    if original is None:
        return True

    estado = clave_normalizada(original)
    if estado in {"activa", "activo", "si", "true", "1"}:
        return True
    if estado in {"inactiva", "inactivo", "no", "false", "0"}:
        return False

    raise ValueError(f"EstadoUnidad no es válido: {original!r}")


def mapear_estado_entrega(valor: Any) -> str:
    original = texto(valor)
    if original is None:
        return "SIN_DATO"

    estado = clave_normalizada(original)
    mapeo = {
        "entregado": "ENTREGADA",
        "entregada": "ENTREGADA",
        "sinentregar": "NO_ENTREGADA",
        "noentregado": "NO_ENTREGADA",
        "noentregada": "NO_ENTREGADA",
        "sindato": "SIN_DATO",
        "noaplica": "NO_APLICA",
    }
    return mapeo.get(estado, original.upper().replace(" ", "_"))


def validar_encabezados(encabezados: Sequence[str]) -> None:
    requeridos = {
        "Torre",
        "Apartamento",
        "CodigoOficial",
        "AreaPrivadaConstruidaM2",
        "CoeficienteCopropiedad",
        "ValorPresupuesto2026",
        "EstadoUnidad",
        "FechaEntregaApartamento",
        "EstadoEntregaApartamento",
    }
    faltantes = requeridos.difference(encabezados)
    if faltantes:
        raise ValueError(
            "Faltan encabezados requeridos: " + ", ".join(sorted(faltantes))
        )


def leer_csv(
    ruta: Path,
    codificacion: str,
) -> tuple[list[UnidadNormalizada], list[ErrorFila]]:
    with ruta.open("r", encoding=codificacion, newline="") as archivo:
        lector = csv.DictReader(archivo, delimiter=",")
        if not lector.fieldnames:
            raise ValueError("El CSV no contiene encabezados")

        validar_encabezados(lector.fieldnames)

        unidades: list[UnidadNormalizada] = []
        errores: list[ErrorFila] = []
        claves_vistas: set[tuple[int, str]] = set()
        codigos_vistos: set[str] = set()

        for numero_fila, fila in enumerate(lector, start=2):
            if not any(texto(valor) for valor in fila.values()):
                continue

            try:
                torre = parsear_torre(fila.get("Torre"))

                apartamento = texto(fila.get("Apartamento"))
                if apartamento is None:
                    raise ValueError("Apartamento es obligatorio")
                apartamento = apartamento.upper().replace(" ", "")

                codigo_oficial = texto(fila.get("CodigoOficial"))
                if codigo_oficial is None:
                    raise ValueError("CodigoOficial es obligatorio")
                codigo_oficial = codigo_oficial.upper()

                clave = (torre, apartamento)
                if clave in claves_vistas:
                    raise ValueError(
                        "Unidad duplicada en el CSV: "
                        f"torre={torre}, apartamento={apartamento}"
                    )
                claves_vistas.add(clave)

                if codigo_oficial in codigos_vistos:
                    raise ValueError(
                        f"CodigoOficial duplicado en el CSV: {codigo_oficial}"
                    )
                codigos_vistos.add(codigo_oficial)

                fecha_entrega = parsear_fecha(
                    fila.get("FechaEntregaApartamento")
                )
                estado_entrega = mapear_estado_entrega(
                    fila.get("EstadoEntregaApartamento")
                )

                if estado_entrega == "ENTREGADA" and fecha_entrega is None:
                    raise ValueError(
                        "La unidad aparece ENTREGADA pero no tiene fechaEntrega"
                    )

                datos = {
                    "torre": torre,
                    "apartamento": apartamento,
                    "codigoOficial": codigo_oficial,
                    "areaPrivada": parsear_decimal_simple(
                        fila.get("AreaPrivadaConstruidaM2"),
                        "AreaPrivadaConstruidaM2",
                    ),
                    "coeficiente": parsear_decimal_simple(
                        fila.get("CoeficienteCopropiedad"),
                        "CoeficienteCopropiedad",
                    ),
                    "presupuestoAnual": parsear_moneda(
                        fila.get("ValorPresupuesto2026")
                    ),
                    "estadoUnidad": estado_entrega,
                    "activo": parsear_activo(fila.get("EstadoUnidad")),
                }

                if fecha_entrega is not None:
                    datos["fechaEntrega"] = fecha_entrega

                # id, fechaCreacion y fechaActualizacion se omiten.
                # SQL Connect aplicará uuidV4() y request.time.
                unidades.append(
                    UnidadNormalizada(
                        fila_csv=numero_fila,
                        datos=datos,
                    )
                )

            except Exception as exc:
                errores.append(
                    ErrorFila(
                        fila_csv=numero_fila,
                        clave=texto(fila.get("UnidadID"))
                        or f"fila {numero_fila}",
                        mensaje=str(exc),
                        datos_originales=json.dumps(
                            fila,
                            ensure_ascii=False,
                        ),
                    )
                )

    return unidades, errores


def sesion_autorizada() -> AuthorizedSession:
    credenciales, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    return AuthorizedSession(credenciales)


def listar_connectors(
    sesion: AuthorizedSession,
    proyecto: str,
    ubicacion: str,
    servicio: str,
) -> list[str]:
    url = (
        f"{API_ROOT}/projects/{proyecto}/locations/{ubicacion}"
        f"/services/{servicio}/connectors"
    )
    respuesta = sesion.get(url, timeout=60)
    if not respuesta.ok:
        raise RuntimeError(
            f"No fue posible listar connectors. "
            f"HTTP {respuesta.status_code}: {respuesta.text[:3000]}"
        )

    return [
        connector["name"].rsplit("/", 1)[-1]
        for connector in respuesta.json().get("connectors", [])
    ]


def resolver_connector(
    sesion: AuthorizedSession,
    proyecto: str,
    ubicacion: str,
    servicio: str,
    indicado: str | None,
) -> str:
    if indicado:
        return indicado

    disponibles = listar_connectors(
        sesion,
        proyecto,
        ubicacion,
        servicio,
    )
    if len(disponibles) == 1:
        return disponibles[0]
    if not disponibles:
        raise RuntimeError(
            "No se encontró ningún connector. Despliega primero "
            "la mutación ImportarUnidades."
        )
    raise RuntimeError(
        "Se encontraron varios connectors: "
        + ", ".join(disponibles)
        + ". Usa --connector ID."
    )


def ejecutar_mutacion(
    sesion: AuthorizedSession,
    proyecto: str,
    ubicacion: str,
    servicio: str,
    connector: str,
    operacion: str,
    lote: Sequence[UnidadNormalizada],
) -> dict[str, Any]:
    nombre = (
        f"projects/{proyecto}/locations/{ubicacion}"
        f"/services/{servicio}/connectors/{connector}"
    )
    url = f"{API_ROOT}/{nombre}:impersonateMutation"
    cuerpo = {
        "operationName": operacion,
        "variables": {
            "datos": [unidad.datos for unidad in lote],
        },
    }

    respuesta = sesion.post(url, json=cuerpo, timeout=180)
    if not respuesta.ok:
        raise RuntimeError(
            f"HTTP {respuesta.status_code}: {respuesta.text[:4000]}"
        )

    resultado = respuesta.json()
    if resultado.get("errors"):
        raise RuntimeError(
            json.dumps(resultado["errors"], ensure_ascii=False)
        )
    return resultado


def lotes(
    elementos: Sequence[UnidadNormalizada],
    tamano: int,
) -> Iterable[Sequence[UnidadNormalizada]]:
    for inicio in range(0, len(elementos), tamano):
        yield elementos[inicio:inicio + tamano]


def guardar_reportes(
    carpeta: Path,
    unidades: Sequence[UnidadNormalizada],
    errores: Sequence[ErrorFila],
    respuestas: Sequence[dict[str, Any]],
    resumen: dict[str, Any],
) -> None:
    carpeta.mkdir(parents=True, exist_ok=True)
    marca = datetime.now().strftime("%Y%m%d_%H%M%S")

    (carpeta / f"resumen_{marca}.json").write_text(
        json.dumps(resumen, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    (carpeta / f"datos_normalizados_{marca}.json").write_text(
        json.dumps(
            [asdict(unidad) for unidad in unidades],
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (carpeta / f"respuestas_{marca}.json").write_text(
        json.dumps(
            list(respuestas),
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    with (carpeta / f"errores_{marca}.csv").open(
        "w",
        encoding="utf-8-sig",
        newline="",
    ) as archivo:
        escritor = csv.DictWriter(
            archivo,
            fieldnames=[
                "fila_csv",
                "clave",
                "mensaje",
                "datos_originales",
            ],
        )
        escritor.writeheader()
        for error in errores:
            escritor.writerow(asdict(error))


def parser_argumentos() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Importa el CSV real de unidades mediante Firebase SQL Connect."
        )
    )
    parser.add_argument("csv", type=Path)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Ejecuta la mutación. Sin esta opción solo valida.",
    )
    parser.add_argument("--encoding", default="utf-8-sig")
    parser.add_argument("--batch-size", type=int, default=50)
    parser.add_argument("--project", default=DEFAULT_PROJECT)
    parser.add_argument("--location", default=DEFAULT_LOCATION)
    parser.add_argument("--service", default=DEFAULT_SERVICE)
    parser.add_argument("--connector")
    parser.add_argument("--operation", default=DEFAULT_OPERATION)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("reportes_importacion_unidades"),
    )
    return parser


def main() -> int:
    argumentos = parser_argumentos().parse_args()

    if not argumentos.csv.exists():
        print(
            f"ERROR: no existe {argumentos.csv}",
            file=sys.stderr,
        )
        return 1

    if argumentos.batch_size < 1 or argumentos.batch_size > 500:
        print(
            "ERROR: --batch-size debe estar entre 1 y 500",
            file=sys.stderr,
        )
        return 1

    try:
        unidades, errores = leer_csv(
            argumentos.csv,
            argumentos.encoding,
        )

        print(f"Archivo: {argumentos.csv}")
        print(f"Registros válidos: {len(unidades)}")
        print(f"Registros rechazados: {len(errores)}")

        respuestas: list[dict[str, Any]] = []
        importadas = 0
        connector_usado: str | None = None

        if errores:
            print(
                "No se importó porque existen filas rechazadas. "
                "Revisa el archivo errores_*.csv.",
                file=sys.stderr,
            )
        elif argumentos.apply:
            sesion = sesion_autorizada()
            connector_usado = resolver_connector(
                sesion,
                argumentos.project,
                argumentos.location,
                argumentos.service,
                argumentos.connector,
            )
            print(f"Connector: {connector_usado}")
            print(f"Operación: {argumentos.operation}")

            for numero, lote in enumerate(
                lotes(unidades, argumentos.batch_size),
                start=1,
            ):
                respuesta = ejecutar_mutacion(
                    sesion,
                    argumentos.project,
                    argumentos.location,
                    argumentos.service,
                    connector_usado,
                    argumentos.operation,
                    lote,
                )
                importadas += len(lote)
                respuestas.append(
                    {
                        "lote": numero,
                        "cantidad": len(lote),
                        "filas_csv": [
                            unidad.fila_csv for unidad in lote
                        ],
                        "respuesta": respuesta,
                    }
                )
                print(
                    f"Lote {numero}: {len(lote)} importadas "
                    f"({importadas}/{len(unidades)})"
                )
        else:
            print("Modo validación: no se modificó la base de datos.")

        resumen = {
            "archivo": str(argumentos.csv),
            "modo": "IMPORTACION" if argumentos.apply else "VALIDACION",
            "validas": len(unidades),
            "rechazadas": len(errores),
            "importadas": importadas,
            "proyecto": argumentos.project,
            "ubicacion": argumentos.location,
            "servicio": argumentos.service,
            "connector": connector_usado or argumentos.connector,
            "operacion": argumentos.operation,
        }

        guardar_reportes(
            argumentos.output_dir,
            unidades,
            errores,
            respuestas,
            resumen,
        )
        print(f"Reportes: {argumentos.output_dir.resolve()}")

        return 2 if errores else 0

    except KeyboardInterrupt:
        print("\nProceso cancelado.", file=sys.stderr)
        return 130
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
