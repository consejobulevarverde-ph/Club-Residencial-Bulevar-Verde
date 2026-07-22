# Importador de vehículos y vínculos vehículo-unidad

## Resultado validado

```text
Vehículos fuente: 1855
Vehículos destino: 1855
Vínculos fuente: 1841
Vínculos destino: 1840
Vehículos sin ningún vínculo importado: 50
Vehículos sin vínculo actual: 51
```

El vínculo actual asociado a la unidad ficticia `9999` y al estado
`NO_RECONOCIDO_POR_UNIDAD` se omite. La placa conserva su vínculo histórico,
pero queda sin una unidad actual.

Los 51 vehículos sin vínculo actual son:

- 50 que ya venían sin asignación;
- 1 cuya asociación actual ficticia `9999` fue descartada.

También se documentan:

- 6 vínculos cuya fecha de inicio se completa con otra fecha fuente;
- 32 vínculos históricos sin fecha final;
- 1 visitante con protección de 45 días.

## Modelo

Reemplaza el tipo `Vehiculo` actual y agrega `VinculoVehiculoUnidad` usando:

```text
dataconnect/schema/VEHICULOS_REEMPLAZO.gql.txt
```

Puede hacerse automáticamente:

```powershell
python .\aplicar_modelo_vehiculos.py `
  ".\dataconnect\schema\schema.gql"
```

El script crea una copia de seguridad del `schema.gql`.

## Operaciones administrativas

Copia a `dataconnect/admin/`:

```text
importar_vehiculos.gql
importar_vinculos_vehiculo.gql
```

Conserva también la consulta existente:

```text
obtener_mapa_unidades.gql
```

Despliega:

```powershell
firebase deploy --only "dataconnect"
```

No uses `--force` sin revisar la migración propuesta. Si la tabla `vehiculos`
contiene registros, realiza una copia antes de eliminar sus relaciones directas
con `persona` y `unidad`.

## Validación local

```powershell
python .\importar_vehiculos_vinculos.py `
  --vehiculos ".\Info aptos - Vehiculos.csv" `
  --vinculos ".\Info aptos - Vinculos_Vehiculo.csv"
```

## Importación

```powershell
python .\importar_vehiculos_vinculos.py `
  --vehiculos ".\Info aptos - Vehiculos.csv" `
  --vinculos ".\Info aptos - Vinculos_Vehiculo.csv" `
  --connector admin `
  --batch-size 50 `
  --apply
```

El proceso:

1. valida y normaliza las 1.855 placas;
2. consulta las unidades existentes por `codigoOficial`;
3. se detiene antes de escribir si falta alguna unidad;
4. importa los vehículos;
5. importa 1.840 vínculos históricos y actuales;
6. genera mapas e incidencias para auditoría.

## Verificación SQL

```sql
SELECT COUNT(*) AS total_vehiculos
FROM public.vehiculos;

SELECT COUNT(*) AS total_vinculos
FROM public.vinculos_vehiculo_unidad;
```

Resultados esperados:

```text
vehiculos = 1855
vinculos_vehiculo_unidad = 1840
```

Vehículos sin asociación:

```sql
SELECT
    v.placa,
    v.tipo_vehiculo,
    v.estado_vehiculo
FROM public.vehiculos v
LEFT JOIN public.vinculos_vehiculo_unidad vu
  ON vu.vehiculo_id = v.id
WHERE vu.vehiculo_id IS NULL
ORDER BY v.placa;
```

Vínculos actuales:

```sql
SELECT
    v.placa,
    u.torre,
    u.apartamento,
    vu.tipo_vinculo,
    vu.estado_vinculo,
    vu.vigente_desde,
    vu.protegido_hasta
FROM public.vinculos_vehiculo_unidad vu
JOIN public.vehiculos v
  ON v.id = vu.vehiculo_id
JOIN public.unidades u
  ON u.id = vu.unidad_id
WHERE vu.es_actual = true
ORDER BY u.torre, u.apartamento, v.placa;
```

Visitantes protegidos:

```sql
SELECT
    v.placa,
    u.torre,
    u.apartamento,
    vu.vigente_desde,
    vu.protegido_hasta
FROM public.vinculos_vehiculo_unidad vu
JOIN public.vehiculos v
  ON v.id = vu.vehiculo_id
JOIN public.unidades u
  ON u.id = vu.unidad_id
WHERE vu.tipo_vinculo = 'VISITANTE'
  AND vu.protegido_hasta > CURRENT_TIMESTAMP;
```
