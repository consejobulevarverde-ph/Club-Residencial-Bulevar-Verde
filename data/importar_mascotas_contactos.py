#!/usr/bin/env python3
"""
Importa mascotas y contactos de emergencia mediante Firebase SQL Connect.

Los identificadores externos solo se usan para generar UUID determinísticos;
no se almacenan en PostgreSQL.
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
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Sequence

import google.auth
from google.auth.transport.requests import AuthorizedSession


API_ROOT = "https://firebasedataconnect.googleapis.com/v1"
DEFAULT_PROJECT = "project-7dd6d100-d8c2-427a-a80"
DEFAULT_LOCATION = "us-east4"
DEFAULT_SERVICE = "portal-bulevar-verde"
DEFAULT_CONNECTOR = "admin"

PET_NAMESPACE = uuid.UUID("a4bfcc47-2a1e-4ab1-8de6-bd38d47952c1")
CONTACT_NAMESPACE = uuid.UUID("38c7c2fe-2297-4dc7-8dc0-a8338668f593")


@dataclass
class Incidencia:
    origen: str
    fila: int
    clave: str
    tipo: str
    mensaje: str


@dataclass
class Registro:
    fila: int
    id_origen: str
    unidad_codigo: str
    datos: dict[str, Any]


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


def limpiar_telefono(valor: str) -> str | None:
    original = valor.strip()
    if not original:
        return None
    prefijo = "+" if original.startswith("+") else ""
    digitos = re.sub(r"\D+", "", original)
    if len(digitos) < 7:
        return None
    return prefijo + digitos


def normalizar_especie(
    valor: str,
) -> tuple[str, str | None]:
    clave = clave_texto(valor)
    mapeo = {
        "perro": "PERRO",
        "gato": "GATO",
        "pajaro": "AVE",
        "ave": "AVE",
        "perrogato": "PERRO_Y_GATO",
        "gato2": "GATO_MULTIPLE",
    }

    if not clave:
        return (
            "SIN_DATO",
            "TipoMascota vacío; se asignó SIN_DATO.",
        )

    if clave in mapeo:
        resultado = mapeo[clave]
        if resultado in {"PERRO_Y_GATO", "GATO_MULTIPLE"}:
            return (
                resultado,
                "El registro representa varias mascotas y se conserva "
                "agregado porque no hay información individual suficiente.",
            )
        return resultado, None

    resultado = re.sub(
        r"[^A-Z0-9]+",
        "_",
        valor.upper(),
    ).strip("_")
    return (
        resultado or "SIN_DATO",
        f"TipoMascota no reconocido; se conservó como {resultado!r}.",
    )


def parsear_activo(valor: str) -> bool:
    clave = clave_texto(valor)
    if clave in {"activo", "activa", "si", "true", "1"}:
        return True
    if clave in {"inactivo", "inactiva", "no", "false", "0"}:
        return False
    raise ValueError(f"EstadoRegistro no reconocido: {valor!r}")


def preparar_mascotas(
    encabezados: Sequence[str],
    filas: Sequence[dict[str, str]],
) -> tuple[list[Registro], list[Incidencia]]:
    validar_encabezados(
        encabezados,
        {
            "MascotaID",
            "UnidadID",
            "TipoMascota",
            "Raza",
            "EstadoRegistro",
        },
        "Mascotas.csv",
    )

    registros: list[Registro] = []
    incidencias: list[Incidencia] = []
    ids: set[str] = set()

    for numero, fila in enumerate(filas, start=2):
        id_origen = texto(fila.get("MascotaID"))
        unidad = texto(fila.get("UnidadID"))

        if not id_origen:
            raise ValueError(
                f"Mascotas.csv fila {numero}: MascotaID vacío"
            )
        if id_origen in ids:
            raise ValueError(
                f"Mascotas.csv fila {numero}: ID duplicado {id_origen}"
            )
        ids.add(id_origen)

        if not unidad:
            raise ValueError(
                f"Mascotas.csv fila {numero}: UnidadID vacío"
            )

        especie, mensaje = normalizar_especie(
            fila.get("TipoMascota", "")
        )
        if mensaje:
            incidencias.append(
                Incidencia(
                    "MASCOTAS",
                    numero,
                    id_origen,
                    "ESPECIE_NORMALIZADA",
                    mensaje,
                )
            )

        raza = texto(fila.get("Raza"))
        if raza is None:
            incidencias.append(
                Incidencia(
                    "MASCOTAS",
                    numero,
                    id_origen,
                    "RAZA_VACIA",
                    "La mascota se importará sin raza.",
                )
            )

        datos: dict[str, Any] = {
            "id": str(uuid.uuid5(PET_NAMESPACE, id_origen)),
            "especie": especie,
            "activo": parsear_activo(
                fila.get("EstadoRegistro", "")
            ),
        }
        if raza:
            datos["raza"] = raza

        registros.append(
            Registro(
                numero,
                id_origen,
                unidad,
                datos,
            )
        )

    return registros, incidencias


def preparar_contactos(
    encabezados: Sequence[str],
    filas: Sequence[dict[str, str]],
) -> tuple[list[Registro], list[Incidencia]]:
    validar_encabezados(
        encabezados,
        {
            "ContactoEmergenciaID",
            "UnidadID",
            "NombreCompleto",
            "Celular",
            "Parentesco",
        },
        "Contactos_Emergencia.csv",
    )

    registros: list[Registro] = []
    incidencias: list[Incidencia] = []
    ids: set[str] = set()

    for numero, fila in enumerate(filas, start=2):
        id_origen = texto(
            fila.get("ContactoEmergenciaID")
        )
        unidad = texto(fila.get("UnidadID"))
        nombre = texto(fila.get("NombreCompleto"))

        if not id_origen:
            raise ValueError(
                "Contactos_Emergencia.csv fila "
                f"{numero}: ID vacío"
            )
        if id_origen in ids:
            raise ValueError(
                "Contactos_Emergencia.csv fila "
                f"{numero}: ID duplicado {id_origen}"
            )
        ids.add(id_origen)

        if not unidad:
            raise ValueError(
                "Contactos_Emergencia.csv fila "
                f"{numero}: UnidadID vacío"
            )
        if not nombre:
            raise ValueError(
                "Contactos_Emergencia.csv fila "
                f"{numero}: NombreCompleto vacío"
            )

        telefono = limpiar_telefono(
            fila.get("Celular", "")
        )
        parentesco = texto(fila.get("Parentesco"))

        if telefono is None:
            incidencias.append(
                Incidencia(
                    "CONTACTOS",
                    numero,
                    id_origen,
                    "TELEFONO_VACIO_O_INVALIDO",
                    "El contacto se importará sin teléfono.",
                )
            )
        if parentesco is None:
            incidencias.append(
                Incidencia(
                    "CONTACTOS",
                    numero,
                    id_origen,
                    "PARENTESCO_VACIO",
                    "El contacto se importará sin parentesco.",
                )
            )

        datos: dict[str, Any] = {
            "id": str(
                uuid.uuid5(CONTACT_NAMESPACE, id_origen)
            ),
            "nombre": nombre,
            "activo": True,
        }
        if telefono:
            datos["telefono"] = telefono
        if parentesco:
            datos["parentesco"] = parentesco

        registros.append(
            Registro(
                numero,
                id_origen,
                unidad,
                datos,
            )
        )

    return registros, incidencias


def sesion_autorizada() -> AuthorizedSession:
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
    sesion: AuthorizedSession,
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


def obtener_unidades(
    sesion: AuthorizedSession,
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
        filas = (
            resultado.get("data", {})
            .get("unidades", [])
        )
        for fila in filas:
            codigo = texto(fila.get("codigoOficial"))
            id_unidad = texto(fila.get("id"))
            if codigo and id_unidad:
                mapa[codigo] = id_unidad

        if len(filas) < limite:
            break
        offset += limite

    return mapa


def lotes(
    registros: Sequence[Registro],
    tamano: int,
) -> Iterable[Sequence[Registro]]:
    for inicio in range(0, len(registros), tamano):
        yield registros[inicio:inicio + tamano]


def importar_registros(
    sesion: AuthorizedSession,
    argumentos: argparse.Namespace,
    operacion: str,
    etiqueta: str,
    registros: Sequence[Registro],
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
        lotes(registros, argumentos.batch_size),
        start=1,
    ):
        datos: list[dict[str, Any]] = []
        for registro in lote:
            item = dict(registro.datos)
            item["unidadId"] = unidades[
                registro.unidad_codigo
            ]
            datos.append(item)

        ejecutar_operacion(
            sesion,
            url,
            operacion,
            {"datos": datos},
        )
        importados += len(lote)
        print(
            f"{etiqueta} lote {numero}: {len(lote)} "
            f"({importados}/{len(registros)})"
        )

    return importados


def guardar_reportes(
    carpeta: Path,
    mascotas: Sequence[Registro],
    contactos: Sequence[Registro],
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

    for nombre, registros in (
        ("mascotas", mascotas),
        ("contactos", contactos),
    ):
        with (
            carpeta / f"mapa_{nombre}_{marca}.csv"
        ).open(
            "w",
            encoding="utf-8-sig",
            newline="",
        ) as archivo:
            escritor = csv.writer(archivo)
            escritor.writerow(
                [
                    "id_origen",
                    "id_destino",
                    "UnidadID",
                ]
            )
            for registro in registros:
                escritor.writerow(
                    [
                        registro.id_origen,
                        registro.datos["id"],
                        registro.unidad_codigo,
                    ]
                )


def crear_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Importa mascotas y contactos de emergencia."
        )
    )
    parser.add_argument(
        "--mascotas",
        type=Path,
        required=True,
    )
    parser.add_argument(
        "--contactos",
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
            "reportes_importacion_mascotas_contactos"
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

        encabezados_m, filas_m = leer_csv(
            argumentos.mascotas
        )
        encabezados_c, filas_c = leer_csv(
            argumentos.contactos
        )

        mascotas, incidencias_m = preparar_mascotas(
            encabezados_m,
            filas_m,
        )
        contactos, incidencias_c = preparar_contactos(
            encabezados_c,
            filas_c,
        )
        incidencias = [
            *incidencias_m,
            *incidencias_c,
        ]

        conteo_incidencias = Counter(
            item.tipo for item in incidencias
        )

        print(f"Mascotas fuente: {len(filas_m)}")
        print(f"Mascotas destino: {len(mascotas)}")
        print(f"Contactos fuente: {len(filas_c)}")
        print(f"Contactos destino: {len(contactos)}")
        print(
            "Incidencias documentadas: "
            f"{len(incidencias)}"
        )

        mascotas_importadas = 0
        contactos_importados = 0
        unidades_faltantes: list[str] = []

        if argumentos.apply:
            sesion = sesion_autorizada()
            mapa_unidades = obtener_unidades(
                sesion,
                argumentos,
            )

            codigos_requeridos = {
                registro.unidad_codigo
                for registro in [
                    *mascotas,
                    *contactos,
                ]
            }
            unidades_faltantes = sorted(
                codigos_requeridos.difference(
                    mapa_unidades
                )
            )
            if unidades_faltantes:
                raise RuntimeError(
                    "No se importó nada porque faltan unidades: "
                    f"{unidades_faltantes[:50]}"
                )

            contactos_importados = importar_registros(
                sesion,
                argumentos,
                "ImportarContactosEmergencia",
                "Contactos",
                contactos,
                mapa_unidades,
            )
            mascotas_importadas = importar_registros(
                sesion,
                argumentos,
                "ImportarMascotas",
                "Mascotas",
                mascotas,
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
            "mascotas_fuente": len(filas_m),
            "mascotas_destino": len(mascotas),
            "contactos_fuente": len(filas_c),
            "contactos_destino": len(contactos),
            "mascotas_importadas": mascotas_importadas,
            "contactos_importados": contactos_importados,
            "incidencias_por_tipo": dict(
                sorted(conteo_incidencias.items())
            ),
            "unidades_faltantes": unidades_faltantes,
        }

        guardar_reportes(
            argumentos.output_dir,
            mascotas,
            contactos,
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
