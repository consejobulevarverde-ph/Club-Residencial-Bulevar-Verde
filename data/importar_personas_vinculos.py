#!/usr/bin/env python3
"""
Importa Personas y VinculosUnidadPersona desde los CSV de Bulevar Verde
mediante operaciones administrativas de Firebase SQL Connect.

Características:
- No almacena los PersonaID, VinculoID ni UnidadID externos.
- Genera UUID determinísticos para permitir reejecuciones seguras.
- Fusiona personas repetidas por tipo y número de documento.
- Usa tipoDocumento = NA para registros sin documento o no aplica.
- Consulta las unidades ya existentes por codigoOficial.
- Importa primero personas y después vínculos.
- Sin --apply solo valida y genera reportes.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
import unicodedata
import uuid
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable, Sequence

import google.auth
from google.auth.transport.requests import AuthorizedSession


API_ROOT = "https://firebasedataconnect.googleapis.com/v1"
DEFAULT_PROJECT = "project-7dd6d100-d8c2-427a-a80"
DEFAULT_LOCATION = "us-east4"
DEFAULT_SERVICE = "portal-bulevar-verde"
DEFAULT_CONNECTOR = "admin"

PERSON_NAMESPACE = uuid.UUID("6d8d5ed3-f551-4b58-bf85-b4d3dbb7c395")
LINK_NAMESPACE = uuid.UUID("6cf8c11b-4ee1-4900-b0d4-d59817be761c")


@dataclass
class Issue:
    tipo: str
    origen: str
    fila: int
    clave: str
    mensaje: str


@dataclass
class PersonaPreparada:
    id_destino: str
    ids_origen: list[str]
    datos: dict[str, Any]


@dataclass
class VinculoPreparado:
    id_destino: str
    ids_origen: list[str]
    unidad_codigo: str
    persona_id_destino: str
    datos_sin_unidad: dict[str, Any]


def texto(value: Any) -> str | None:
    if value is None:
        return None
    result = str(value).strip()
    return result or None


def clave_texto(value: Any) -> str:
    result = "" if value is None else str(value).strip()
    result = unicodedata.normalize("NFKD", result)
    result = "".join(
        char for char in result
        if not unicodedata.combining(char)
    )
    return re.sub(r"[^a-z0-9]+", "", result.lower())


def leer_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if not reader.fieldnames:
            raise ValueError(f"{path.name}: no contiene encabezados")
        return [
            {
                key: (value or "").strip()
                for key, value in row.items()
            }
            for row in reader
            if any((value or "").strip() for value in row.values())
        ]


def validar_encabezados(
    rows: Sequence[dict[str, str]],
    required: set[str],
    filename: str,
) -> None:
    if not rows:
        raise ValueError(f"{filename}: no contiene registros")
    missing = required.difference(rows[0].keys())
    if missing:
        raise ValueError(
            f"{filename}: faltan encabezados: "
            + ", ".join(sorted(missing))
        )


def canonical_document_type(
    raw_type: str,
    raw_number: str,
) -> tuple[str, str, str | None]:
    doc_type = raw_type.strip()
    doc_number = raw_number.strip()

    # Corrige filas en las que el número quedó en TipoDocumento.
    if re.fullmatch(r"\d{5,}", doc_type):
        return "CC", doc_type, (
            "Se movió el valor numérico de TipoDocumento a NumeroDocumento."
        )

    normalized = re.sub(
        r"[^A-Z0-9]+",
        "_",
        doc_type.upper(),
    ).strip("_")

    aliases = {
        "CEDULA": "CC",
        "CEDULA_DE_CIUDADANIA": "CC",
        "CC": "CC",
        "NIT": "NIT",
        "CEDULA_EXTRANJERIA": "CE",
        "CEDULA_DE_EXTRANJERIA": "CE",
        "CE": "CE",
        "TARJETA_DE_IDENTIDAD": "TI",
        "TARJETA_IDENTIDAD": "TI",
        "TI": "TI",
        "REGISTRO_CIVIL": "RC",
        "RC": "RC",
        "PASAPORTE": "PA",
        "PA": "PA",
        "PERMISO_DE_PERMANENCIA_TEMPORAL": "PPT",
        "PERMISO_PERMANENCIA_TEMPORAL": "PPT",
        "PERMISO_POR_PROTECCION_TEMPORAL": "PPT",
        "PPT": "PPT",
        "SIN_DOCUMENTO": "NA",
        "NO_APLICA": "NA",
        "NA": "NA",
    }

    canonical_type = aliases.get(normalized, normalized)
    canonical_number = re.sub(
        r"[\s.\-]+",
        "",
        doc_number.upper(),
    )
    return canonical_type, canonical_number, None


def synthetic_document(source_id: str) -> tuple[str, str]:
    digest = hashlib.sha256(source_id.encode("utf-8")).hexdigest()
    return "NA", f"NA-{digest[:12].upper()}"


def email_valido(value: str) -> bool:
    return bool(
        re.fullmatch(
            r"[^@\s]+@[^@\s]+\.[^@\s]+",
            value.strip(),
        )
    )


def escoger_email(rows: Sequence[dict[str, str]]) -> str | None:
    candidates: list[str] = []
    for row in rows:
        for field in ("CorreoPrincipal", "CorreosAlternos"):
            raw = row.get(field, "")
            for candidate in re.split(r"[;,|]+", raw):
                candidate = candidate.strip().lower()
                if candidate and email_valido(candidate):
                    candidates.append(candidate)
    return candidates[0] if candidates else None


def limpiar_telefono(value: str) -> str | None:
    raw = value.strip()
    if not raw:
        return None
    prefix = "+" if raw.startswith("+") else ""
    digits = re.sub(r"\D+", "", raw)
    if len(digits) < 7:
        return None
    return prefix + digits


def escoger_telefono(rows: Sequence[dict[str, str]]) -> str | None:
    for field in ("CelularPrincipal", "TelefonosAlternos"):
        for row in rows:
            for candidate in re.split(
                r"[;,|/]+",
                row.get(field, ""),
            ):
                phone = limpiar_telefono(candidate)
                if phone:
                    return phone
    return None


def score_name(name: str) -> tuple[int, int, int]:
    normalized = clave_texto(name)
    generic = normalized in {
        "",
        "persona",
        "1persona",
        "sinnombre",
        "sininformacion",
    }
    return (
        0 if generic else 1,
        len(name.split()),
        len(name),
    )


def escoger_nombre(
    rows: Sequence[dict[str, str]],
    fallback: str,
) -> tuple[str, bool]:
    names = [
        row.get("NombreCompleto", "").strip()
        for row in rows
        if row.get("NombreCompleto", "").strip()
    ]
    if not names:
        return f"PERSONA SIN NOMBRE {fallback}", True
    return max(names, key=score_name), False


def parse_bool_status(value: str, active_values: set[str]) -> bool:
    return clave_texto(value) in active_values


def fecha_iso(value: str) -> str | None:
    raw = value.strip()
    if not raw:
        return None
    for fmt in (
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
    ):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"Fecha inválida: {value!r}")


def preparar_personas(
    rows: Sequence[dict[str, str]],
) -> tuple[
    list[PersonaPreparada],
    dict[str, str],
    list[Issue],
]:
    required = {
        "PersonaID",
        "TipoDocumento",
        "NumeroDocumento",
        "NombreCompleto",
        "CorreoPrincipal",
        "CelularPrincipal",
        "EstadoPersona",
    }
    validar_encabezados(rows, required, "Personas.csv")

    issues: list[Issue] = []
    groups: dict[str, list[tuple[int, dict[str, str]]]] = defaultdict(list)
    source_to_key: dict[str, str] = {}

    for row_number, row in enumerate(rows, start=2):
        source_id = row["PersonaID"]
        if not source_id:
            raise ValueError(
                f"Personas.csv fila {row_number}: PersonaID está vacío"
            )

        doc_type, doc_number, correction = canonical_document_type(
            row.get("TipoDocumento", ""),
            row.get("NumeroDocumento", ""),
        )

        if correction:
            issues.append(
                Issue(
                    tipo="DOCUMENTO_CORREGIDO",
                    origen="PERSONAS",
                    fila=row_number,
                    clave=source_id,
                    mensaje=correction,
                )
            )

        if not doc_type or not doc_number:
            doc_type, doc_number = synthetic_document(source_id)
            issues.append(
                Issue(
                    tipo="DOCUMENTO_TEMPORAL",
                    origen="PERSONAS",
                    fila=row_number,
                    clave=source_id,
                    mensaje=(
                        f"Se asignó {doc_type}/{doc_number} porque faltaba "
                        "tipo o número de documento."
                    ),
                )
            )

        group_key = f"{doc_type}|{doc_number}"
        source_to_key[source_id] = group_key
        groups[group_key].append((row_number, row))

    prepared: list[PersonaPreparada] = []
    source_to_target: dict[str, str] = {}

    for group_key, members in sorted(groups.items()):
        group_rows = [member[1] for member in members]
        doc_type, doc_number = group_key.split("|", 1)
        target_id = str(
            uuid.uuid5(
                PERSON_NAMESPACE,
                group_key,
            )
        )

        name, name_imputed = escoger_nombre(
            group_rows,
            target_id[-8:].upper(),
        )
        if name_imputed:
            issues.append(
                Issue(
                    tipo="NOMBRE_TEMPORAL",
                    origen="PERSONAS",
                    fila=members[0][0],
                    clave=members[0][1]["PersonaID"],
                    mensaje=f"Se asignó el nombre temporal {name!r}.",
                )
            )

        if len(members) > 1:
            issues.append(
                Issue(
                    tipo="PERSONAS_FUSIONADAS",
                    origen="PERSONAS",
                    fila=members[0][0],
                    clave=group_key,
                    mensaje=(
                        f"Se fusionaron {len(members)} registros con el mismo "
                        "tipo y número de documento."
                    ),
                )
            )

        data: dict[str, Any] = {
            "id": target_id,
            "tipoDocumento": doc_type,
            "numeroDocumento": doc_number,
            "nombreCompleto": name,
            "activo": any(
                parse_bool_status(
                    row.get("EstadoPersona", ""),
                    {"activa", "activo", "si", "true", "1"},
                )
                for row in group_rows
            ),
        }

        email = escoger_email(group_rows)
        phone = escoger_telefono(group_rows)
        if email:
            data["correo"] = email
        if phone:
            data["telefono"] = phone

        source_ids = [
            row["PersonaID"]
            for row in group_rows
        ]
        for source_id in source_ids:
            source_to_target[source_id] = target_id

        prepared.append(
            PersonaPreparada(
                id_destino=target_id,
                ids_origen=source_ids,
                datos=data,
            )
        )

    return prepared, source_to_target, issues


def map_relationship_type(role: str) -> str:
    normalized = clave_texto(role)
    mapping = {
        "propietario": "PROPIETARIO",
        "copropietario": "PROPIETARIO",
        "arrendatario": "ARRENDATARIO_PRINCIPAL",
        "residente": "RESIDENTE",
    }
    if normalized not in mapping:
        raise ValueError(f"Rol no reconocido: {role!r}")
    return mapping[normalized]


def preparar_vinculos(
    rows: Sequence[dict[str, str]],
    source_to_target_person: dict[str, str],
    fallback_start: str,
) -> tuple[list[VinculoPreparado], list[Issue]]:
    required = {
        "VinculoID",
        "UnidadID",
        "PersonaID",
        "Rol",
        "EstadoVinculo",
        "FechaInicio",
        "FechaFin",
        "FechaActualizacion",
    }
    validar_encabezados(rows, required, "Vinculos_Unidad.csv")

    issues: list[Issue] = []
    grouped: dict[
        tuple[str, str, str, bool],
        list[tuple[int, dict[str, str], str | None, str | None]],
    ] = defaultdict(list)

    for row_number, row in enumerate(rows, start=2):
        source_link = row["VinculoID"]
        source_person = row["PersonaID"]
        unit_code = row["UnidadID"]

        if source_person not in source_to_target_person:
            raise ValueError(
                f"Vínculo fila {row_number}: PersonaID {source_person!r} "
                "no existe en Personas.csv"
            )
        if not unit_code:
            raise ValueError(
                f"Vínculo fila {row_number}: UnidadID está vacío"
            )

        target_person = source_to_target_person[source_person]
        relation_type = map_relationship_type(row["Rol"])
        active = clave_texto(row["EstadoVinculo"]) == "activo"

        start = fecha_iso(row.get("FechaInicio", ""))
        if start is None:
            start = fallback_start
            issues.append(
                Issue(
                    tipo="FECHA_INICIO_IMPUTADA",
                    origen="VINCULOS",
                    fila=row_number,
                    clave=source_link,
                    mensaje=(
                        f"FechaInicio vacía; se usó {fallback_start} como "
                        "fecha de incorporación al nuevo sistema."
                    ),
                )
            )

        end = fecha_iso(row.get("FechaFin", ""))
        if not active and end is None:
            end = (
                fecha_iso(row.get("FechaActualizacion", ""))
                or fallback_start
            )
            issues.append(
                Issue(
                    tipo="FECHA_FIN_IMPUTADA",
                    origen="VINCULOS",
                    fila=row_number,
                    clave=source_link,
                    mensaje=(
                        f"Vínculo histórico sin FechaFin; se usó {end}."
                    ),
                )
            )
        if active:
            end = None

        dedupe_key = (
            unit_code,
            target_person,
            relation_type,
            active,
        )
        grouped[dedupe_key].append(
            (row_number, row, start, end)
        )

    prepared: list[VinculoPreparado] = []

    for dedupe_key, members in sorted(grouped.items()):
        unit_code, person_id, relation_type, active = dedupe_key
        source_ids = [
            member[1]["VinculoID"]
            for member in members
        ]

        starts = [
            member[2]
            for member in members
            if member[2]
        ]
        ends = [
            member[3]
            for member in members
            if member[3]
        ]
        start = min(starts) if starts else fallback_start
        end = max(ends) if ends and not active else None

        stable_key = "|".join(
            [
                unit_code,
                person_id,
                relation_type,
                "ACTIVO" if active else "HISTORICO",
            ]
        )
        target_id = str(uuid.uuid5(LINK_NAMESPACE, stable_key))

        if len(members) > 1:
            issues.append(
                Issue(
                    tipo="VINCULOS_FUSIONADOS",
                    origen="VINCULOS",
                    fila=members[0][0],
                    clave=stable_key,
                    mensaje=(
                        f"Se fusionaron {len(members)} vínculos equivalentes."
                    ),
                )
            )

        data: dict[str, Any] = {
            "id": target_id,
            "personaId": person_id,
            "tipoRelacion": relation_type,
            "fechaInicio": start,
            "activo": active,
        }
        if end:
            data["fechaFin"] = end

        prepared.append(
            VinculoPreparado(
                id_destino=target_id,
                ids_origen=source_ids,
                unidad_codigo=unit_code,
                persona_id_destino=person_id,
                datos_sin_unidad=data,
            )
        )

    return prepared, issues


def sesion_autorizada() -> AuthorizedSession:
    credentials, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    return AuthorizedSession(credentials)


def endpoint(
    project: str,
    location: str,
    service: str,
    connector: str,
    method: str,
) -> str:
    name = (
        f"projects/{project}/locations/{location}"
        f"/services/{service}/connectors/{connector}"
    )
    return f"{API_ROOT}/{name}:{method}"


def ejecutar_operacion(
    session: AuthorizedSession,
    url: str,
    operation: str,
    variables: dict[str, Any],
    timeout: int = 180,
) -> dict[str, Any]:
    response = session.post(
        url,
        json={
            "operationName": operation,
            "variables": variables,
        },
        timeout=timeout,
    )
    if not response.ok:
        raise RuntimeError(
            f"{operation}: HTTP {response.status_code}: "
            f"{response.text[:5000]}"
        )

    body = response.json()
    if body.get("errors"):
        raise RuntimeError(
            f"{operation}: "
            + json.dumps(
                body["errors"],
                ensure_ascii=False,
            )
        )
    return body


def obtener_mapa_unidades(
    session: AuthorizedSession,
    args: argparse.Namespace,
) -> dict[str, str]:
    url = endpoint(
        args.project,
        args.location,
        args.service,
        args.connector,
        "impersonateQuery",
    )
    result: dict[str, str] = {}
    offset = 0
    page_size = 500

    while True:
        body = ejecutar_operacion(
            session,
            url,
            "ObtenerMapaUnidadesImportacion",
            {
                "limit": page_size,
                "offset": offset,
            },
        )
        records = (
            body.get("data", {})
            .get("unidades", [])
        )
        for record in records:
            code = texto(record.get("codigoOficial"))
            database_id = texto(record.get("id"))
            if code and database_id:
                result[code] = database_id

        if len(records) < page_size:
            break
        offset += page_size

    return result


def chunks(
    values: Sequence[Any],
    size: int,
) -> Iterable[Sequence[Any]]:
    for start in range(0, len(values), size):
        yield values[start:start + size]


def importar_personas(
    session: AuthorizedSession,
    args: argparse.Namespace,
    people: Sequence[PersonaPreparada],
) -> int:
    url = endpoint(
        args.project,
        args.location,
        args.service,
        args.connector,
        "impersonateMutation",
    )
    imported = 0

    for number, batch in enumerate(
        chunks(people, args.batch_size),
        start=1,
    ):
        ejecutar_operacion(
            session,
            url,
            "ImportarPersonas",
            {
                "datos": [
                    person.datos
                    for person in batch
                ],
            },
        )
        imported += len(batch)
        print(
            f"Personas lote {number}: {len(batch)} "
            f"({imported}/{len(people)})"
        )

    return imported


def importar_vinculos(
    session: AuthorizedSession,
    args: argparse.Namespace,
    links: Sequence[VinculoPreparado],
    unit_map: dict[str, str],
) -> int:
    url = endpoint(
        args.project,
        args.location,
        args.service,
        args.connector,
        "impersonateMutation",
    )
    imported = 0

    for number, batch in enumerate(
        chunks(links, args.batch_size),
        start=1,
    ):
        data = []
        for link in batch:
            item = dict(link.datos_sin_unidad)
            item["unidadId"] = unit_map[link.unidad_codigo]
            data.append(item)

        ejecutar_operacion(
            session,
            url,
            "ImportarVinculosUnidad",
            {"datos": data},
        )
        imported += len(batch)
        print(
            f"Vínculos lote {number}: {len(batch)} "
            f"({imported}/{len(links)})"
        )

    return imported


def guardar_reportes(
    output_dir: Path,
    people: Sequence[PersonaPreparada],
    links: Sequence[VinculoPreparado],
    issues: Sequence[Issue],
    summary: dict[str, Any],
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    (output_dir / f"resumen_{stamp}.json").write_text(
        json.dumps(
            summary,
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    with (output_dir / f"incidencias_{stamp}.csv").open(
        "w",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        writer = csv.DictWriter(
            file,
            fieldnames=[
                "tipo",
                "origen",
                "fila",
                "clave",
                "mensaje",
            ],
        )
        writer.writeheader()
        for issue in issues:
            writer.writerow(asdict(issue))

    with (output_dir / f"mapa_personas_{stamp}.csv").open(
        "w",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        writer = csv.writer(file)
        writer.writerow(
            ["PersonaID_origen", "personaId_destino"]
        )
        for person in people:
            for source_id in person.ids_origen:
                writer.writerow([source_id, person.id_destino])

    with (output_dir / f"mapa_vinculos_{stamp}.csv").open(
        "w",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        writer = csv.writer(file)
        writer.writerow(
            [
                "VinculoID_origen",
                "vinculoId_destino",
                "UnidadID_origen",
                "personaId_destino",
            ]
        )
        for link in links:
            for source_id in link.ids_origen:
                writer.writerow(
                    [
                        source_id,
                        link.id_destino,
                        link.unidad_codigo,
                        link.persona_id_destino,
                    ]
                )


def crear_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Importa Personas y VinculosUnidadPersona mediante "
            "Firebase SQL Connect."
        )
    )
    parser.add_argument(
        "--personas",
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
        help="Ejecutar la importación. Sin esta opción solo valida.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=50,
    )
    parser.add_argument(
        "--fecha-inicio-fallback",
        default=date.today().isoformat(),
        help=(
            "Fecha usada cuando FechaInicio está vacía. "
            "Formato YYYY-MM-DD."
        ),
    )
    parser.add_argument("--project", default=DEFAULT_PROJECT)
    parser.add_argument("--location", default=DEFAULT_LOCATION)
    parser.add_argument("--service", default=DEFAULT_SERVICE)
    parser.add_argument("--connector", default=DEFAULT_CONNECTOR)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(
            "reportes_importacion_personas_vinculos"
        ),
    )
    return parser


def main() -> int:
    args = crear_parser().parse_args()

    try:
        if args.batch_size < 1 or args.batch_size > 50:
            raise ValueError(
                "--batch-size debe estar entre 1 y 50"
            )

        # Validar formato de la fecha de respaldo.
        datetime.strptime(
            args.fecha_inicio_fallback,
            "%Y-%m-%d",
        )

        person_rows = leer_csv(args.personas)
        link_rows = leer_csv(args.vinculos)

        people, source_to_target, person_issues = preparar_personas(
            person_rows
        )
        links, link_issues = preparar_vinculos(
            link_rows,
            source_to_target,
            args.fecha_inicio_fallback,
        )
        issues = [*person_issues, *link_issues]

        issue_counts: dict[str, int] = defaultdict(int)
        for issue in issues:
            issue_counts[issue.tipo] += 1

        print(f"Personas fuente: {len(person_rows)}")
        print(f"Personas destino: {len(people)}")
        print(f"Vínculos fuente: {len(link_rows)}")
        print(f"Vínculos destino: {len(links)}")
        print(f"Incidencias documentadas: {len(issues)}")

        imported_people = 0
        imported_links = 0
        missing_units: list[str] = []

        if args.apply:
            session = sesion_autorizada()
            unit_map = obtener_mapa_unidades(session, args)

            required_unit_codes = {
                link.unidad_codigo
                for link in links
            }
            missing_units = sorted(
                required_unit_codes.difference(unit_map)
            )
            if missing_units:
                raise RuntimeError(
                    "No se importó nada porque faltan unidades en SQL "
                    f"Connect: {missing_units[:50]}"
                    + (
                        f" y {len(missing_units) - 50} adicionales"
                        if len(missing_units) > 50
                        else ""
                    )
                )

            imported_people = importar_personas(
                session,
                args,
                people,
            )
            imported_links = importar_vinculos(
                session,
                args,
                links,
                unit_map,
            )
        else:
            print(
                "Modo validación: no se modificó la base de datos."
            )

        summary = {
            "modo": "IMPORTACION" if args.apply else "VALIDACION",
            "personas_fuente": len(person_rows),
            "personas_destino": len(people),
            "personas_fusionadas": len(person_rows) - len(people),
            "vinculos_fuente": len(link_rows),
            "vinculos_destino": len(links),
            "vinculos_fusionados": len(link_rows) - len(links),
            "personas_importadas": imported_people,
            "vinculos_importados": imported_links,
            "fecha_inicio_fallback": args.fecha_inicio_fallback,
            "incidencias_por_tipo": dict(sorted(issue_counts.items())),
            "unidades_faltantes": missing_units,
        }

        guardar_reportes(
            args.output_dir,
            people,
            links,
            issues,
            summary,
        )
        print(f"Reportes: {args.output_dir.resolve()}")
        return 0

    except KeyboardInterrupt:
        print("\nProceso cancelado.", file=sys.stderr)
        return 130
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
