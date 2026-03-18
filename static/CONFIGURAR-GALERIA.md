# � Cómo Configurar los Documentos Compartidos de Google Drive

La página principal del Club Residencial Bulevar Verde incluye una sección embebida de Google Drive para compartir documentos importantes del club con todos los residentes.

## 📋 Información Importante

**Los documentos NO se cargan directamente en el sitio web.** Todos los documentos (PDFs, imágenes, etc.) se almacenan en una **carpeta compartida de Google Drive** que se muestra embebida en la página web.

## ✅ Ventajas de este Sistema

- ✨ **Actualización instantánea**: Cualquier cambio en Google Drive se refleja automáticamente en el sitio web
- 📱 **Acceso móvil**: Los residentes pueden ver y descargar documentos desde cualquier dispositivo
- 🔒 **Fácil gestión**: Solo los administradores del Drive pueden agregar/eliminar documentos
- 💾 **Sin límites de almacenamiento web**: Los archivos están en Drive, no ocupan espacio del sitio
- 🔍 **Búsqueda integrada**: Los usuarios pueden buscar documentos dentro del Drive

## 📋 Pasos para Configurar

### 1. Organizar los Documentos en Google Drive

1. Ve a [Google Drive](https://drive.google.com)
2. Crea una carpeta principal llamada "Documentos Club Bulevar Verde" (o el nombre que prefieras)
3. Dentro de esta carpeta, crea subcarpetas para organizar:
   - 📋 Reglamentos
   - 📝 Actas de Asamblea
   - 📄 Formularios
   - 📢 Comunicados
   - 💰 Financiero
   - ℹ️ Información General
4. Sube todos tus documentos PDF a las subcarpetas correspondientes

### 2. Hacer la Carpeta Pública

1. Haz clic derecho en la **carpeta principal** (Documentos Club Bulevar Verde)
2. Selecciona **"Compartir"**
3. En la esquina inferior izquierda, haz clic en **"Obtener enlace"**
4. Cambia la configuración a **"Cualquiera con el enlace"** puede **"Ver"**
5. Copia el enlace que aparece

### 3. Extraer el ID de la Carpeta

El enlace de Google Drive tendrá este formato:
```
https://drive.google.com/drive/folders/1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7?usp=sharing
```

El **ID** es la parte alfanumérica después de `/folders/` y antes del `?`:
```
1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7
```

### 4. Actualizar el Código del Sitio

1. Abre el archivo: `layouts/index.html`
2. Busca la sección de documentos compartidos (línea ~286):

```html
<iframe src="https://drive.google.com/embeddedfolderview?id=17_uBX6ZQvAjK5m1B1kvI6ONycOKjno7Z#grid"
```

3. Reemplaza el ID existente con tu ID:

```html
<iframe src="https://drive.google.com/embeddedfolderview?id=TU_ID_AQUI#grid"
```

### 5. Guardar y Probar

1. Guarda el archivo
2. Recarga la página web
3. La sección de documentos ahora mostrará tu carpeta de Google Drive

## 📁 Cómo Agregar Nuevos Documentos

**¡Es muy fácil!** Solo necesitas:

1. Abrir tu carpeta de Google Drive
2. Subir o agregar el nuevo documento a la subcarpeta correspondiente
3. **¡Listo!** El documento aparecerá automáticamente en el sitio web

No necesitas editar código ni volver a construir el sitio.

## 🗑️ Cómo Eliminar Documentos

1. Abre tu carpeta de Google Drive
2. Selecciona el documento que quieres eliminar
3. Haz clic derecho → Eliminar
4. El documento desaparecerá automáticamente del sitio web

## 💡 Consejos y Buenas Prácticas

### Organización
- 📁 Usa subcarpetas para categorizar los documentos
- 📅 Incluye fechas en los nombres: `acta-2024-03-15.pdf`, `comunicado-2024-marzo.pdf`
- 🔤 Usa nombres descriptivos: `reglamento-convivencia-2024.pdf` en lugar de `doc1.pdf`

### Nombres de Archivos
- ✅ Usa minúsculas: `presupuesto-2024.pdf`
- ✅ Usa guiones en lugar de espacios: `estado-financiero-marzo.pdf`
- ✅ Evita caracteres especiales: `ñ`, `á`, `é`, etc.
- ✅ Sé descriptivo: `formulario-reserva-salon-social.pdf`

### Seguridad
- 🔒 Configura los permisos de la carpeta en "Solo lectura" para visitantes
- 👥 Solo los administradores deben tener permisos de edición
- 🚫 No subas información personal o sensible de los residentes
- ✅ Revisa periódicamente qué documentos están públicos

### Tamaño de Archivos
- 📄 Optimiza los PDFs antes de subirlos (comprime imágenes si es necesario)
- ✅ Tamaño recomendado: máximo 10MB por archivo
- 🖼️ Para documentos escaneados, usa resolución 150-300 DPI

## ❓ Preguntas Frecuentes

**P: ¿Los documentos se actualizan automáticamente en el sitio web?**  
R: ¡Sí! Cualquier cambio que hagas en la carpeta de Google Drive (agregar, eliminar, renombrar) se refleja inmediatamente en el sitio web.

**P: ¿Necesito recompilar el sitio cada vez que agrego un documento?**  
R: No, el iframe de Google Drive muestra el contenido en tiempo real.

**P: ¿Los visitantes pueden descargar los documentos?**  
R: Sí, si la carpeta está configurada con permisos de "Ver", los visitantes pueden ver y descargar los documentos.

**P: ¿Puedo tener documentos privados que no aparezcan en el sitio?**  
R: Sí, solo los documentos en la carpeta compartida específica aparecerán. Puedes tener otras carpetas privadas en tu Drive.

**P: ¿Hay límite de almacenamiento?**  
R: El límite es el de tu cuenta de Google Drive (15GB gratis, más si tienes Google Workspace).

**P: ¿Cómo elimino completamente la sección de documentos?**  
R: Edita `layouts/index.html` y comenta o elimina el bloque que comienza con `<!-- Documentos Compartidos - Google Drive -->`.

## 📞 Información de Contacto del Sitio

Los datos de contacto actuales del club son:

### Administración
- 📍 Dirección: Calle 70 # 59 265, Itagüí, Antioquia
- 📞 Teléfono: +57 322 228 9066 (WhatsApp)
- ✉️ Email: bulevarverdeadmon@gmail.com
- 🕒 Horario: Lunes a viernes: 9:00 a.m - 1:00 p.m y 2:00 p.m - 5:00 p.m. Sábado: 9:00 a.m - 1:00 p.m

### Consejo de Administración
- ✉️ consejo.bulevarverde@gmail.com

### Comité de Convivencia
- ✉️ comiteconvivenciabulevarverde@gmail.com

### Portería
- 📞 Portería 1: +57 300 972 8851
- 📞 Portería 2: +57 324 582 0968

### Comunidad
- 💬 [Grupo de WhatsApp](https://chat.whatsapp.com/HonY8ALBTlR6ivBNxyx0pv)

---

**¿Necesitas ayuda?** Contacta al administrador del sitio web.

