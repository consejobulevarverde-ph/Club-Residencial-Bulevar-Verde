#!/usr/bin/env python3
"""
Importa vehículos y vínculos vehículo-unidad mediante Firebase SQL Connect.

Reglas:
- La placa se normaliza a mayúsculas y solo caracteres alfanuméricos.
- Los identificadores externos no se almacenan.
- El UUID del vehículo se deriva de la placa normalizada.
- El vínculo 9999/NO_RECONOCIDO_POR_UNIDAD no se importa.
- Los vehículos pueden quedar sin unidad.
- VISITANTE_AUTORIZADO se transforma en VISITANTE.
- Los visitantes reciben protegidoHasta = vigenteDesde + 45 días.
- Sin --apply solamente valida y genera reportes.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
import uuid
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence


API_ROOT = "https://firebasedataconnect.googleapis.com/v1"
DEFAULT_PROJECT = "project-7dd6d100-d8c2-427a-a80"
DEFAULT_LOCATION = "us-east4"
DEFAULT_SERVICE = "portal-bulevar-verde"
DEFAULT_CONNECTOR = "admin"

BOGOTA = timezone(timedelta(hours=-5))
VEHICLE_NAMESPACE = uuid.UUID("25eb008f-886b-42ee-901d-b756c7b434ef")
LINK_NAMESPACE = uuid.UUID("e5b0f6c5-2e0e-44ea-8520-9185b8ef9a53")


@dataclass
class Incidencia:
    origen: str
    fila: int
    clave: str
    tipo: str
    mensaje: str


@dataclass
class VehiculoPreparado:
    fila: int
    id_origen: str
    id_destino: str
    placa: str
    datos: dict[str, Any]


@dataclass
class VinculoPreparado:
    fila: int
    id_origen: str
    vehiculo_id_destino: str
    unidad_codigo: str
    datos_sin_unidad: dict[str, Any]


def texto(valor: Any) -> str | None:
    if valor is None:
        return None
    resultado = str(valor).strip()
    return resultado or None


def clave_texto(valor: Any) -> str:
    resultado = "" if valor is None else str(valor).strip()
    resultado = unicodedata.normalize("NFKD", resultado)
    resultado = "".join(
        caracter
        for caracter in resultado
        if not unicodedata.combining(caracter)
    )
    return re.sub(r"[^a-z0-9]+", "", resultado.lower())


def normalizar_placa(valor: str) -> str:
    resultado = re.sub(r"[^A-Z0-9]+", "", valor.upper())
    if not resultado:
        raise ValueError("Placa vacía después de normalizar")
    return resultado


def leer_csv(ruta: Path) -> tuple[list[str], list[dict[str, str]]]:
    with ruta.open("r", encoding="utf-8-sig", newline="") as archivo:
        lector = csv.DictReader(archivo)
        if not lector.fieldnames:
            raise ValueError(f"{ruta.name}: no contiene encabezados")
        filas = [
            {
                clave: (valor or "").strip()
                for clave, valor in fila.items()
            }
            for fila in lector
            if any((valor or "").strip() for valor in fila.values())
        ]
        return list(lector.fieldnames), filas


def validar_encabezados(
    encabezados: Sequence[str],
    requeridos: set[str],
    archivo: str,
) -> None:
    faltantes = requeridos.difference(encabezados)
    if faltantes:
        raise ValueError(
            f"{archivo}: faltan encabezados: "
            + ", ".join(sorted(faltantes))
        )


def parsear_fecha_hora(valor: str) -> datetime | None:
    original = valor.strip()
    if not original:
        return None

    formatos = (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y",
    )
    for formato in formatos:
        try:
            return datetime.strptime(
                original,
                formato,
            ).replace(tzinfo=BOGOTA)
        except ValueError:
            continue

    # También acepta RFC3339.
    try:
        resultado = datetime.fromisoformat(
            original.replace("Z", "+00:00")
        )
        if resultado.tzinfo is None:
            resultado = resultado.replace(tzinfo=BOGOTA)
        return resultado
    except ValueError as exc:
        raise ValueError(
            f"Fecha no reconocida: {valor!r}"
        ) from exc


def timestamp(valor: datetime) -> str:
    return valor.isoformat(timespec="seconds")


def preparar_vehiculos(
    encabezados: Sequence[str],
    filas: Sequence[dict[str, str]],
) -> tuple[
    list[VehiculoPreparado],
    dict[str, str],
    list[Incidencia],
]:
    validar_encabezados(
        encabezados,
        {
            "VehiculoID",
            "Placa",
            "TipoVehiculo",
            "EstadoVehiculo",
            "Fuentes",
        },
        "Vehiculos.csv",
    )

    preparados: list[VehiculoPreparado] = []
    incidencias: list[Incidencia] = []
    ids_origen: set[str] = set()
    placas: dict[str, int] = {}
    mapa_ids: dict[str, str] = {}

    for numero, fila in enumerate(filas, start=2):
        id_origen = texto(fila.get("VehiculoID"))
        placa_original = texto(fila.get("Placa"))

        if not id_origen:
            raise ValueError(
                f"Vehiculos.csv fila {numero}: VehiculoID vacío"
            )
        if id_origen in ids_origen:
            raise ValueError(
                f"Vehiculos.csv fila {numero}: VehiculoID duplicado "
                f"{id_origen!r}"
            )
        ids_origen.add(id_origen)

        if not placa_original:
            raise ValueError(
                f"Vehiculos.csv fila {numero}: placa vacía"
            )
        placa = normalizar_placa(placa_original)

        if placa in placas:
            raise ValueError(
                f"Placa duplicada después de normalizar: {placa}; "
                f"filas {placas[placa]} y {numero}"
            )
        placas[placa] = numero

        if placa != placa_original.upper():
            incidencias.append(
                Incidencia(
                    "VEHICULOS",
                    numero,
                    id_origen,
                    "PLACA_NORMALIZADA",
                    f"{placa_original!r} se normalizó como {placa!r}.",
                )
            )

        id_destino = str(
            uuid.uuid5(VEHICLE_NAMESPACE, placa)
        )
        mapa_ids[id_origen] = id_destino

        datos: dict[str, Any] = {
            "id": id_destino,
            "placa": placa,
            "tipoVehiculo": (
                texto(fila.get("TipoVehiculo")) or "NO_DETERMINADO"
            ).upper(),
            "estadoVehiculo": (
                texto(fila.get("EstadoVehiculo")) or "ACTIVO"
            ).upper(),
            "activo": True,
        }

        fuentes = texto(fila.get("Fuentes"))
        if fuentes:
            datos["fuentes"] = fuentes

        preparados.append(
            VehiculoPreparado(
                fila=numero,
                id_origen=id_origen,
                id_destino=id_destino,
                placa=placa,
                datos=datos,
            )
        )

    return preparados, mapa_ids, incidencias


def mapear_tipo_vinculo(valor: str) -> str:
    clave = clave_texto(valor)
    mapeo = {
        "residente": "RESIDENTE",
        "visitanteautorizado": "VISITANTE",
        "visitante": "VISITANTE",
        "autorizadocontrolacceso": "AUTORIZADO_CONTROL_ACCESO",
        "nodeterminado": "NO_DETERMINADO",
    }
    if clave not in mapeo:
        raise ValueError(f"TipoVinculo no reconocido: {valor!r}")
    return mapeo[clave]


def mapear_estado_vinculo(valor: str) -> str:
    clave = clave_texto(valor)
    mapeo = {
        "activa": "ACTIVO",
        "activo": "ACTIVO",
        "noconfirmada": "PENDIENTE_REVISION",
        "reemplazadaportal": "FINALIZADO",
        "pendienteidentificacion": "PENDIENTE_IDENTIFICACION",
    }
    return mapeo.get(
        clave,
        re.sub(r"[^A-Z0-9]+", "_", valor.upper()).strip("_"),
    )


def preparar_vinculos(
    encabezados: Sequence[str],
    filas: Sequence[dict[str, str]],
    mapa_vehiculos: dict[str, str],
) -> tuple[list[VinculoPreparado], list[Incidencia]]:
    validar_encabezados(
        encabezados,
        {
            "AsignacionVehiculoID",
            "VehiculoID",
            "UnidadID",
            "EstadoAsignacion",
            "EsActual",
            "Fuente",
            "FechaFuente",
            "FechaActualizacion",
            "TipoVinculo",
            "FuenteGanadora",
            "FuentesRespaldo",
            "Confianza",
            "EstadoRevision",
            "VigenteDesde",
            "VigenteHasta",
        },
        "Vinculos_Vehiculo.csv",
    )

    preparados: list[VinculoPreparado] = []
    incidencias: list[Incidencia] = []
    ids_origen: set[str] = set()
    claves_compuestas: dict[
        tuple[str, str, str, str],
        int,
    ] = {}

    for numero, fila in enumerate(filas, start=2):
        id_origen = texto(
            fila.get("AsignacionVehiculoID")
        )
        vehiculo_origen = texto(fila.get("VehiculoID"))
        unidad_codigo = texto(fila.get("UnidadID"))
        tipo_original = texto(fila.get("TipoVinculo")) or ""

        if not id_origen:
            raise ValueError(
                f"Vinculos_Vehiculo.csv fila {numero}: "
                "AsignacionVehiculoID vacío"
            )
        if id_origen in ids_origen:
            raise ValueError(
                f"AsignacionVehiculoID duplicado: {id_origen}"
            )
        ids_origen.add(id_origen)

        if not vehiculo_origen or vehiculo_origen not in mapa_vehiculos:
            raise ValueError(
                f"Vínculo fila {numero}: VehiculoID inexistente "
                f"{vehiculo_origen!r}"
            )

        # La unidad 9999 era un marcador del sistema anterior.
        if (
            unidad_codigo == "9999"
            or clave_texto(tipo_original)
            == "noreconocidoporunidad"
        ):
            incidencias.append(
                Incidencia(
                    "VINCULOS",
                    numero,
                    id_origen,
                    "VINCULO_OMITIDO_SIN_UNIDAD",
                    "El vehículo queda sin unidad; no se importa la "
                    "asociación ficticia 9999/NO_RECONOCIDO.",
                )
            )
            continue

        if not unidad_codigo:
            raise ValueError(
                f"Vínculo fila {numero}: UnidadID vacío"
            )

        tipo = mapear_tipo_vinculo(tipo_original)
        estado = mapear_estado_vinculo(
            fila.get("EstadoAsignacion", "")
        )
        es_actual = clave_texto(fila.get("EsActual")) == "si"

        inicio = (
            parsear_fecha_hora(fila.get("VigenteDesde", ""))
            or parsear_fecha_hora(fila.get("FechaFuente", ""))
            or parsear_fecha_hora(fila.get("FechaActualizacion", ""))
        )
        if inicio is None:
            raise ValueError(
                f"Vínculo fila {numero}: no contiene una fecha utilizable"
            )

        if not fila.get("VigenteDesde", "").strip():
            incidencias.append(
                Incidencia(
                    "VINCULOS",
                    numero,
                    id_origen,
                    "VIGENTE_DESDE_IMPUTADO",
                    f"Se usó {timestamp(inicio)} como vigenteDesde.",
                )
            )

        fin = parsear_fecha_hora(
            fila.get("VigenteHasta", "")
        )
        if not es_actual and fin is None:
            fin = (
                parsear_fecha_hora(
                    fila.get("FechaActualizacion", "")
                )
                or inicio
            )
            incidencias.append(
                Incidencia(
                    "VINCULOS",
                    numero,
                    id_origen,
                    "VIGENTE_HASTA_IMPUTADO",
                    f"Vínculo histórico sin fecha final; se usó "
                    f"{timestamp(fin)}.",
                )
            )

        vehiculo_id = mapa_vehiculos[vehiculo_origen]
        inicio_texto = timestamp(inicio)

        clave = (
            vehiculo_id,
            unidad_codigo,
            tipo,
            inicio_texto,
        )
        if clave in claves_compuestas:
            raise ValueError(
                "Clave compuesta de vínculo duplicada en filas "
                f"{claves_compuestas[clave]} y {numero}: {clave}"
            )
        claves_compuestas[clave] = numero

        id_destino = str(
            uuid.uuid5(LINK_NAMESPACE, id_origen)
        )
        datos: dict[str, Any] = {
            "id": id_destino,
            "vehiculoId": vehiculo_id,
            "tipoVinculo": tipo,
            "estadoVinculo": estado,
            "esActual": es_actual,
            "vigenteDesde": inicio_texto,
            "origenRegistro": "MIGRACION_INICIAL",
        }

        if fin:
            datos["vigenteHasta"] = timestamp(fin)

        if tipo == "VISITANTE":
            protegido = inicio + timedelta(days=45)
            datos["protegidoHasta"] = timestamp(protegido)

        fuente = (
            texto(fila.get("FuenteGanadora"))
            or texto(fila.get("Fuente"))
        )
        if fuente:
            datos["fuente"] = fuente

        fuentes_respaldo = texto(
            fila.get("FuentesRespaldo")
        )
        if fuentes_respaldo:
            datos["fuentesRespaldo"] = fuentes_respaldo

        confianza = texto(fila.get("Confianza"))
        if confianza:
            datos["confianza"] = confianza

        estado_revision = texto(
            fila.get("EstadoRevision")
        )
        if estado_revision:
            datos["estadoRevision"] = estado_revision

        preparados.append(
            VinculoPreparado(
                fila=numero,
                id_origen=id_origen,
                vehiculo_id_destino=vehiculo_id,
                unidad_codigo=unidad_codigo,
                datos_sin_unidad=datos,
            )
        )

    return preparados, incidencias


def sesion_autorizada():
    try:
        import google.auth
        from google.auth.transport.requests import AuthorizedSession
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Falta google-auth. Ejecuta: "
            "pip install -r requirements.txt"
        ) from exc

    credenciales, _ = google.auth.default(
        scopes=[
            "https://www.googleapis.com/auth/cloud-platform"
        ]
    )
    return AuthorizedSession(credenciales)


def endpoint(
    proyecto: str,
    ubicacion: str,
    servicio: str,
    connector: str,
    metodo: str,
) -> str:
    nombre = (
        f"projects/{proyecto}/locations/{ubicacion}"
        f"/services/{servicio}/connectors/{connector}"
    )
    return f"{API_ROOT}/{nombre}:{metodo}"


def ejecutar_operacion(
    sesion,
    url: str,
    operacion: str,
    variables: dict[str, Any],
) -> dict[str, Any]:
    respuesta = sesion.post(
        url,
        json={
            "operationName": operacion,
            "variables": variables,
        },
        timeout=180,
    )
    if not respuesta.ok:
        raise RuntimeError(
            f"{operacion}: HTTP {respuesta.status_code}: "
            f"{respuesta.text[:5000]}"
        )

    resultado = respuesta.json()
    if resultado.get("errors"):
        raise RuntimeError(
            f"{operacion}: "
            + json.dumps(
                resultado["errors"],
                ensure_ascii=False,
            )
        )
    return resultado


def obtener_mapa_unidades(
    sesion,
    argumentos: argparse.Namespace,
) -> dict[str, str]:
    url = endpoint(
        argumentos.project,
        argumentos.location,
        argumentos.service,
        argumentos.connector,
        "impersonateQuery",
    )

    mapa: dict[str, str] = {}
    offset = 0
    limite = 500

    while True:
        resultado = ejecutar_operacion(
            sesion,
            url,
            "ObtenerMapaUnidadesImportacion",
            {
                "limit": limite,
                "offset": offset,
            },
        )
        registros = (
            resultado.get("data", {})
            .get("unidades", [])
        )
        for registro in registros:
            codigo = texto(
                registro.get("codigoOficial")
            )
            id_unidad = texto(registro.get("id"))
            if codigo and id_unidad:
                mapa[codigo] = id_unidad

        if len(registros) < limite:
            break
        offset += limite

    return mapa


def lotes(
    elementos: Sequence[Any],
    tamano: int,
) -> Iterable[Sequence[Any]]:
    for inicio in range(0, len(elementos), tamano):
        yield elementos[inicio:inicio + tamano]


def importar_vehiculos(
    sesion,
    argumentos: argparse.Namespace,
    vehiculos: Sequence[VehiculoPreparado],
) -> int:
    url = endpoint(
        argumentos.project,
        argumentos.location,
        argumentos.service,
        argumentos.connector,
        "impersonateMutation",
    )
    importados = 0

    for numero, lote in enumerate(
        lotes(vehiculos, argumentos.batch_size),
        start=1,
    ):
        ejecutar_operacion(
            sesion,
            url,
            "ImportarVehiculos",
            {
                "datos": [
                    vehiculo.datos
                    for vehiculo in lote
                ],
            },
        )
        importados += len(lote)
        print(
            f"Vehículos lote {numero}: {len(lote)} "
            f"({importados}/{len(vehiculos)})"
        )

    return importados


def importar_vinculos(
    sesion,
    argumentos: argparse.Namespace,
    vinculos: Sequence[VinculoPreparado],
    unidades: dict[str, str],
) -> int:
    url = endpoint(
        argumentos.project,
        argumentos.location,
        argumentos.service,
        argumentos.connector,
        "impersonateMutation",
    )
    importados = 0

    for numero, lote in enumerate(
        lotes(vinculos, argumentos.batch_size),
        start=1,
    ):
        datos = []
        for vinculo in lote:
            item = dict(vinculo.datos_sin_unidad)
            item["unidadId"] = unidades[
                vinculo.unidad_codigo
            ]
            datos.append(item)

        ejecutar_operacion(
            sesion,
            url,
            "ImportarVinculosVehiculoUnidad",
            {"datos": datos},
        )
        importados += len(lote)
        print(
            f"Vínculos lote {numero}: {len(lote)} "
            f"({importados}/{len(vinculos)})"
        )

    return importados


def guardar_reportes(
    carpeta: Path,
    vehiculos: Sequence[VehiculoPreparado],
    vinculos: Sequence[VinculoPreparado],
    incidencias: Sequence[Incidencia],
    resumen: dict[str, Any],
) -> None:
    carpeta.mkdir(parents=True, exist_ok=True)
    marca = datetime.now().strftime("%Y%m%d_%H%M%S")

    (carpeta / f"resumen_{marca}.json").write_text(
        json.dumps(
            resumen,
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    with (carpeta / f"incidencias_{marca}.csv").open(
        "w",
        encoding="utf-8-sig",
        newline="",
    ) as archivo:
        escritor = csv.DictWriter(
            archivo,
            fieldnames=[
                "origen",
                "fila",
                "clave",
                "tipo",
                "mensaje",
            ],
        )
        escritor.writeheader()
        for incidencia in incidencias:
            escritor.writerow(asdict(incidencia))

    with (carpeta / f"mapa_vehiculos_{marca}.csv").open(
        "w",
        encoding="utf-8-sig",
        newline="",
    ) as archivo:
        escritor = csv.writer(archivo)
        escritor.writerow(
            [
                "VehiculoID_origen",
                "vehiculoId_destino",
                "placa",
            ]
        )
        for vehiculo in vehiculos:
            escritor.writerow(
                [
                    vehiculo.id_origen,
                    vehiculo.id_destino,
                    vehiculo.placa,
                ]
            )

    with (carpeta / f"mapa_vinculos_{marca}.csv").open(
        "w",
        encoding="utf-8-sig",
        newline="",
    ) as archivo:
        escritor = csv.writer(archivo)
        escritor.writerow(
            [
                "AsignacionVehiculoID_origen",
                "vinculoId_destino",
                "unidadCodigo",
                "vehiculoId_destino",
            ]
        )
        for vinculo in vinculos:
            escritor.writerow(
                [
                    vinculo.id_origen,
                    vinculo.datos_sin_unidad["id"],
                    vinculo.unidad_codigo,
                    vinculo.vehiculo_id_destino,
                ]
            )


def crear_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Importa vehículos y sus vínculos con unidades."
        )
    )
    parser.add_argument(
        "--vehiculos",
        type=Path,
        required=True,
    )
    parser.add_argument(
        "--vinculos",
        type=Path,
        required=True,
    )
    parser.add_argument(
        "--apply",
        action="store_true",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=50,
    )
    parser.add_argument(
        "--project",
        default=DEFAULT_PROJECT,
    )
    parser.add_argument(
        "--location",
        default=DEFAULT_LOCATION,
    )
    parser.add_argument(
        "--service",
        default=DEFAULT_SERVICE,
    )
    parser.add_argument(
        "--connector",
        default=DEFAULT_CONNECTOR,
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(
            "reportes_importacion_vehiculos_vinculos"
        ),
    )
    return parser


def main() -> int:
    argumentos = crear_parser().parse_args()

    try:
        if argumentos.batch_size < 1 or argumentos.batch_size > 50:
            raise ValueError(
                "--batch-size debe estar entre 1 y 50"
            )

        encabezados_v, filas_v = leer_csv(
            argumentos.vehiculos
        )
        encabezados_l, filas_l = leer_csv(
            argumentos.vinculos
        )

        vehiculos, mapa_vehiculos, incidencias_v = (
            preparar_vehiculos(
                encabezados_v,
                filas_v,
            )
        )
        vinculos, incidencias_l = preparar_vinculos(
            encabezados_l,
            filas_l,
            mapa_vehiculos,
        )
        incidencias = [
            *incidencias_v,
            *incidencias_l,
        ]

        vehiculos_con_algun_vinculo = {
            vinculo.vehiculo_id_destino
            for vinculo in vinculos
        }
        vehiculos_con_vinculo_actual = {
            vinculo.vehiculo_id_destino
            for vinculo in vinculos
            if vinculo.datos_sin_unidad.get("esActual") is True
        }
        vehiculos_sin_ningun_vinculo = [
            vehiculo
            for vehiculo in vehiculos
            if vehiculo.id_destino
            not in vehiculos_con_algun_vinculo
        ]
        vehiculos_sin_vinculo_actual = [
            vehiculo
            for vehiculo in vehiculos
            if vehiculo.id_destino
            not in vehiculos_con_vinculo_actual
        ]

        conteos = Counter(
            incidencia.tipo
            for incidencia in incidencias
        )

        print(f"Vehículos fuente: {len(filas_v)}")
        print(f"Vehículos destino: {len(vehiculos)}")
        print(f"Vínculos fuente: {len(filas_l)}")
        print(f"Vínculos destino: {len(vinculos)}")
        print(
            "Vehículos sin ningún vínculo importado: "
            f"{len(vehiculos_sin_ningun_vinculo)}"
        )
        print(
            "Vehículos sin vínculo actual: "
            f"{len(vehiculos_sin_vinculo_actual)}"
        )
        print(
            "Incidencias documentadas: "
            f"{len(incidencias)}"
        )

        vehiculos_importados = 0
        vinculos_importados = 0
        unidades_faltantes: list[str] = []

        if argumentos.apply:
            sesion = sesion_autorizada()
            mapa_unidades = obtener_mapa_unidades(
                sesion,
                argumentos,
            )

            requeridas = {
                vinculo.unidad_codigo
                for vinculo in vinculos
            }
            unidades_faltantes = sorted(
                requeridas.difference(mapa_unidades)
            )
            if unidades_faltantes:
                raise RuntimeError(
                    "No se importó nada porque faltan unidades: "
                    f"{unidades_faltantes[:50]}"
                )

            vehiculos_importados = importar_vehiculos(
                sesion,
                argumentos,
                vehiculos,
            )
            vinculos_importados = importar_vinculos(
                sesion,
                argumentos,
                vinculos,
                mapa_unidades,
            )
        else:
            print(
                "Modo validación: no se modificó la base."
            )

        resumen = {
            "modo": (
                "IMPORTACION"
                if argumentos.apply
                else "VALIDACION"
            ),
            "vehiculos_fuente": len(filas_v),
            "vehiculos_destino": len(vehiculos),
            "vinculos_fuente": len(filas_l),
            "vinculos_destino": len(vinculos),
            "vehiculos_sin_ningun_vinculo_importado": len(
                vehiculos_sin_ningun_vinculo
            ),
            "vehiculos_sin_vinculo_actual": len(
                vehiculos_sin_vinculo_actual
            ),
            "vehiculos_importados": vehiculos_importados,
            "vinculos_importados": vinculos_importados,
            "incidencias_por_tipo": dict(
                sorted(conteos.items())
            ),
            "unidades_faltantes": unidades_faltantes,
        }

        guardar_reportes(
            argumentos.output_dir,
            vehiculos,
            vinculos,
            incidencias,
            resumen,
        )
        print(
            f"Reportes: "
            f"{argumentos.output_dir.resolve()}"
        )
        return 0

    except KeyboardInterrupt:
        print("\nProceso cancelado.", file=sys.stderr)
        return 130
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
