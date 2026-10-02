Qué cambió en el reporte nuevo
Actualmente tienes esta correspondencia:
Nuevo Dorchester	PLANILLA actual	Transformación
Fecha y hora	FECHA	directa
Personal	VIGILANTE QUE TOMA EL REGISTRO	directa
Detalle → Apto. 964 · ...	APARTAMENTO	extraer 964
Tipo / estado → CARRO / RESIDENTE	TIPO DE VEHICULO	extraer CARRO
Referencia	PLACA	directa
Tipo / estado	RESIDENTE O VISITANTE	extraer RESIDENTE
Detalle	OBSERVACIONES	quitar Apto. 964 ·
Fotografía	FOTO	requiere tratamiento
Firma	FIRMA	requiere tratamiento
—	ID	hay que generarlo


La parte complicada son las dos últimas columnas. El nuevo archivo trae 986 registros y 1.972 imágenes JPEG incrustadas: exactamente una fotografía y una firma por registro. Las celdas K/L solo dicen "Evidencia incrustada"; las imágenes reales están dentro del .xlsx.
Por eso tu Apps Script actual no puede interpretar directamente ese texto como una evidencia. Su lógica de imágenes requiere ID, FOTO y FIRMA y valida que las referencias correspondan al ID de la sanción.
Lo que recomiendo
En vez de convertir manualmente este Excel cada mes, agregaría al mismo sanciones.js un adaptador/importador para el nuevo formato de Dorchester.
El flujo quedaría así:
Dorchester → descargar XLSX → subir XLSX a Drive → ejecutar importarReporteDorchester() → PLANILLA queda lista.
Ese importador haría automáticamente:
1. Abrir el .xlsx sin convertirlo primero a Google Sheets.
2. Extraer sus archivos internos.
3. Leer la hoja parqueaderos.
4. Transformar las columnas con el mapeo anterior.
5. Generar un ID estable para cada registro.
6. Extraer las dos imágenes incrustadas de cada fila.
7. Guardarlas en Drive como, por ejemplo:
   - a83c92df.FOTO.jpeg
   - a83c92df.FIRMA.jpeg
8. Crear sus URLs públicas permanentes.
9. Escribir directamente esas URLs en FOTO y FIRMA.
10. Insertar únicamente registros que todavía no existan.
11. Ejecutar finalmente normalizarTodoElArchivoSanciones().
Esto encaja bastante bien con Google Apps Script porque un .xlsx internamente es un ZIP y Apps Script tiene oficialmente Utilities.unzip(blob), que devuelve todos los archivos internos del ZIP. Google for Developers
De hecho, no usaría como estrategia principal convertir primero el Excel a Google Sheets y luego intentar recuperar las imágenes. Apps Script puede localizar imágenes sobre la cuadrícula mediante OverGridImage.getAnchorCell(), pero la API de OverGridImage no ofrece un método para recuperar el blob original de la imagen; permite reemplazarla, moverla, dimensionarla, etc. Google for Developers
También hay que proteger contra duplicados
Hay otro detalle importante que encontré. Tu sanciones.xlsx actual contiene registros desde 1 hasta 26 de septiembre de 2026, mientras que el nuevo reporte de Dorchester contiene registros desde 11 hasta 30 de septiembre de 2026.
Por eso no debemos hacer simplemente append de las 986 filas ni reemplazar ciegamente PLANILLA.
El ID que generemos debe ser determinístico. Por ejemplo:
SHA256(
  fechaHora +
  placa +
  apartamento +
  tipoVehiculo +
  vigilante
)

y podemos utilizar los primeros 8/12/16 caracteres como ID. Así, si mañana vuelves a descargar un reporte que contiene parte de la misma información, el importador puede decir:
Leídos:        986
Ya existentes: 743
Nuevos:        243
Importados:    243
Fotos:         243
Firmas:        243

sin duplicar sanciones.
El flujo de imágenes también puede simplificarse
Aquí cambiaría ligeramente tu diseño actual. Hoy tienes:
PLANILLA
   ↓
prepararIndiceImagenesSanciones()
   ↓
buscar evidencias en carpeta Dorchester
   ↓
generarImagenes()
   ↓
Full size → URL

El script actual está diseñado explícitamente para enlazar los archivos originales de Dorchester, sin copiarlos, y requiere acceso público por enlace.   sanciones
Para este nuevo formato, como Dorchester ya metió la evidencia dentro del XLSX, haría:
DorchReporting.xlsx
       ↓
Utilities.unzip()
       ↓
parqueaderos + 1.972 JPEG
       ↓
importarReporteDorchester()
       ↓
guardar JPEG en Drive del Consejo
       ↓
URL permanente
       ↓
PLANILLA

Y esas filas nuevas ya no necesitarían pasar por prepararIndiceImagenesSanciones() ni generarImagenes(), porque tu propio código ya contempla que una celda que tenga una URL pública permanente se considere resuelta y no vuelva a indexarse.
Qué haría en tu caso
Mantendría sanciones.xlsx y toda la lógica actual intacta y agregaría un nuevo módulo al Apps Script:
importarReporteDorchester(fileId)
parsearXlsxDorchester_(blob)
convertirFilaDorchester_(fila)
generarIdSancionDorchester_(registro)
extraerEvidenciasDorchester_(xlsx)
guardarEvidenciaDorchester_(id, tipo, blob)
registroSancionYaExiste_(id)

De esa forma el sistema soportaría los dos formatos: el anterior de AppSheet/Dorchester y este nuevo DorchReporting.
Y para el archivo que acabas de subir, el resultado final de cada registro sería conceptualmente:
ID:                   <generado>
FECHA:                30/09/2026 02:38:48
VIGILANTE:            Juan Pablo tangarife
APARTAMENTO:           964
TIPO DE VEHICULO:      CARRO
PLACA:                 LZY469
RESIDENTE O VISITANTE: RESIDENTE
OBSERVACIONES:         PARQUE EN VISITANTES
FOTO:                  <URL Drive>
FIRMA:                 <URL Drive>

Este sería el camino que escogería, porque resuelve no solo el archivo de hoy sino los próximos reportes de Dorchester sin tener que preparar Excel manualmente todos los meses. Además, no rompe las consultas, la maestra, las notificaciones ni la normalización que ya tienes montadas.
Si quieres continuar con esta solución, puedo modificar específicamente tu sanciones(4).js y construir el importador compatible con este formato exacto de DorchReporting_parqueaderos_20261001_153731.xlsx, incluyendo extracción de las imágenes y control de duplicados.