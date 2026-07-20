#!/usr/bin/env python3
"""
Reemplaza únicamente el tipo Vehiculo del schema.gql y agrega
VinculoVehiculoUnidad. Crea una copia de seguridad antes de escribir.
"""

from __future__ import annotations

import argparse
import re
from datetime import datetime
from pathlib import Path


NUEVO_MODELO = r'''# REEMPLAZA el tipo Vehiculo actual por estos dos tipos.
# No reemplaces el resto de schema.gql.

type Vehiculo
  @table(
    name: "vehiculos"
    singular: "vehiculo"
    plural: "vehiculos"
    key: "id"
  ) {
  id: UUID! @default(expr: "uuidV4()")
  placa: String! @unique
  tipoVehiculo: String
  marca: String
  modelo: String
  color: String
  estadoVehiculo: String! @default(value: "ACTIVO")
  fuentes: String
  activo: Boolean! @default(value: true)
  fechaCreacion: Timestamp! @default(expr: "request.time")
  fechaActualizacion: Timestamp! @default(expr: "request.time")
}

type VinculoVehiculoUnidad
  @table(
    name: "vinculos_vehiculo_unidad"
    singular: "vinculo_vehiculo_unidad"
    plural: "vinculos_vehiculo_unidad"
    key: ["vehiculo", "unidad", "tipoVinculo", "vigenteDesde"]
  ) {
  id: UUID! @default(expr: "uuidV4()") @unique
  vehiculo: Vehiculo!
  unidad: Unidad!
  tipoVinculo: String!
  estadoVinculo: String! @default(value: "ACTIVO")
  esActual: Boolean! @default(value: true)
  vigenteDesde: Timestamp!
  vigenteHasta: Timestamp
  protegidoHasta: Timestamp
  origenRegistro: String!
  fuente: String
  fuentesRespaldo: String
  confianza: String
  estadoRevision: String
  registradoPorUid: String
  fechaCreacion: Timestamp! @default(expr: "request.time")
  fechaActualizacion: Timestamp! @default(expr: "request.time")
}
'''

PATRON_VEHICULO = re.compile(
    r'type Vehiculo\s+@table\(name:\s*"vehiculos".*?\n\}',
    flags=re.DOTALL,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "schema",
        type=Path,
        help="Ruta a dataconnect/schema/schema.gql",
    )
    args = parser.parse_args()

    path = args.schema
    if not path.exists():
        raise SystemExit(f"ERROR: no existe {path}")

    text = path.read_text(encoding="utf-8")

    if "type VinculoVehiculoUnidad" in text:
        raise SystemExit(
            "ERROR: VinculoVehiculoUnidad ya existe. "
            "No se aplicó ningún cambio."
        )

    updated, count = PATRON_VEHICULO.subn(
        NUEVO_MODELO.rstrip(),
        text,
        count=1,
    )
    if count != 1:
        raise SystemExit(
            "ERROR: no se encontró exactamente un tipo Vehiculo "
            "compatible con el modelo anterior."
        )

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = path.with_name(f"{path.name}.bak_{stamp}")
    backup.write_text(text, encoding="utf-8")
    path.write_text(updated, encoding="utf-8")

    print(f"Schema actualizado: {path}")
    print(f"Copia de seguridad: {backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
