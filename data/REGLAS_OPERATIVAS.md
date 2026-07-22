# Reglas operativas del módulo de vehículos

## Identidad del vehículo

- `placa` es única y obligatoria.
- Antes de buscar o guardar se normaliza: mayúsculas, sin espacios,
  puntos ni guiones.
- La placa no debe ser editable por residentes.
- Una corrección de placa debe ser administrativa y auditada.

## Asociación con unidades

- `Vehiculo` no contiene `unidad` ni `persona`.
- La asociación vive en `VinculoVehiculoUnidad`.
- Un vehículo puede existir sin vínculos.
- No se usa una unidad ficticia para placas no reconocidas.

## Visitantes

Al registrar un visitante:

```text
tipoVinculo = VISITANTE
estadoVinculo = ACTIVO
esActual = true
origenRegistro = VIGILANCIA
vigenteDesde = fecha actual
protegidoHasta = fecha actual + 45 días
```

La fila no debe eliminarse físicamente. Antes de `protegidoHasta` puede
finalizarse o marcarse como no reconocida, pero debe conservar placa, unidad y
fecha. La retención de 45 días es un mínimo; se recomienda conservar todo el
historial.

## Residentes

Un residente solo puede editar `tipoVehiculo`, `marca`, `modelo` y `color`
cuando exista un vínculo actual y activo entre el vehículo y una unidad a la
que el usuario tenga acceso.

## Vigilancia

Puede buscar o crear placas y registrar visitas. No debe corregir placas ni
eliminar historial.

## Administración

Puede corregir placas, resolver NO_DETERMINADO, finalizar o reasignar vínculos
y consultar el historial completo.

## Seguridad pendiente para el portal

Las mutaciones de cliente para residentes y vigilancia no se incluyen todavía
porque requieren definir cómo el token de Firebase Auth identifica:

- el rol VIGILANCIA;
- las unidades permitidas para cada residente;
- los privilegios de ADMIN.

Las operaciones incluidas en este paquete son administrativas y usan
`@auth(level: NO_ACCESS)`.
