# Club Residencial Bulevar Verde - Proyecto Web

## 📋 Información del Proyecto

**Nombre**: Club Residencial Bulevar Verde  
**Ubicación**: Itagüí, Antioquia, Colombia  
**Tecnología**: Hugo Static Site Generator  
**Idioma**: Español (es-co)  
**Desarrollador**: handresc1127

## 🏗️ Estructura del Proyecto

```
Club-Residencial-Bulevar-Verde/
├── hugo.toml              # Configuración del sitio
├── content/               # Contenido del sitio
│   ├── _index.md         # Página principal
│   ├── documentos/       # Sección de documentos
│   │   └── _index.md
│   └── pqrs/             # Sección PQRS
│       └── _index.md     
├── layouts/               # Plantillas HTML
│   ├── index.html        # Layout página principal
│   ├── documentos/       
│   │   └── list.html     # Layout lista de documentos
│   └── pqrs/
│       └── list.html     # Layout formulario PQRS
├── static/                # Archivos estáticos
│   ├── documentos/       # Documentos del club (PDFs)
│   │   ├── reglamentos/  
│   │   ├── actas/        
│   │   ├── formularios/  
│   │   ├── comunicados/  
│   │   └── financiero/   
│   └── images/           # Imágenes y logos
├── assets/                # Assets para procesamiento
├── data/                  # Archivos de datos
├── i18n/                  # Traducciones
└── themes/                # Temas Hugo
```

## 🎨 Paleta de Colores

```css
--color-primary: #2c5f2d;      /* Verde oscuro principal */
--color-secondary: #4a8c4b;    /* Verde medio */
--color-tertiary: #7bb77d;     /* Verde claro */
--color-light: #e8f5e9;        /* Verde muy claro / fondo */
--color-white: #ffffff;        /* Blanco */
```

## 🔧 Configuración del Sitio

### hugo.toml
- **baseURL**: `https://clubbulevarverde.co/`
- **languageCode**: `es-co`
- **title**: Club Residencial Bulevar Verde
- **themeColor**: `#2c5f2d`

### Menú de Navegación (`layouts/partials/header.html`)
1. Reservas (/reservas/ → portal de residentes en modo reservas)
2. PQRS & Mantenimientos (/pqrs/)
3. Sanciones (/sanciones/)
4. Datos (/datos-personales/)
5. Contacto (#contacto en la página principal)
## 🔐 Información de Contacto

### Administración
```toml
[params]
  phone = '+573222289066'
  email = 'bulevarverdeadmon@gmail.com'
  address = 'Calle 70 # 59 265, Itagüí, Antioquia'
  horario = 'Lunes a viernes: 9:00 a.m - 1:00 p.m y 2:00 p.m - 5:00 p.m. Sábado: 9:00 a.m - 1:00 p.m'
```

### Otros Contactos
- **Consejo de Administración**: consejo.bulevarverde@gmail.com
- **Comité de Convivencia**: comiteconvivenciabulevarverde@gmail.com
- **Portería 1**: +57 300 972 8851 (WhatsApp)
- **Portería 2**: +57 324 582 0968 (WhatsApp)
- **Comunidad WhatsApp**: https://chat.whatsapp.com/HonY8ALBTlR6ivBNxyx0pv

### Integración WhatsApp
Todos los números de teléfono en el sitio son enlaces clickeables que abren WhatsApp:
```html
<a href="https://wa.me/573222289066" target="_blank">
  <i class="bi bi-whatsapp"></i> +57 322 228 9066
</a>
```
## 🧭 Accesos rápidos del inicio

`layouts/index.html` (sección `#accesos`) muestra 8 tarjetas: Reservas, PQRS y mantenimiento, Personal,
Sanciones, Mis datos, Documentos (`/documentos/`, requiere identificarse), Comunidad (grupo de WhatsApp) y Contacto (`#contacto`).
Ya no hay secciones propias de Documentos, Comunidad, Reservas ni PQRS en el inicio.

### Enlaces de Drive/Sheets configurables sin PR
| Variable de GitHub (Actions → Variables) | Parámetro de `hugo.toml` | Para qué |
|---|---|---|
| `AVISOS_HOJA_URL` | `avisosHojaUrl` | Hoja de avisos del inicio |
| `PERSONAL_DRIVE_FOLDER_ID` | `personalDriveFolderId` | Carpeta con las subcarpetas del personal |
| `DOCUMENTOS_DRIVE_FOLDER_ID` | `documentosDriveFolderId` | Carpeta de documentos del club |

- `firebase-deploy.yml` las pasa a Hugo (`HUGO_PARAMS_…`) **solo si tienen valor**; vacías → se usa `hugo.toml`.
- Las carpetas aceptan el ID o el enlace completo de Drive (`drive-carpeta.html` extrae el ID).
- Para aplicar un cambio de variable, o refrescar Documentos/Personal tras cambios en Drive:
  Actions → "Deploy Firebase Hosting and Data Connect" → **Run workflow** (rama `firebase`).
- El contenido de la hoja de avisos se lee en el navegador: editar avisos no requiere publicar.
- En local se simulan con `$env:HUGO_PARAMS_AVISOSHOJAURL = '…'` (etc.) antes de `hugo server`.

### Módulos del portal de residentes (`layouts/datos-personales/list.html`)
- Un solo login para todo. `/reservas/`, `/personal/` y `/documentos/` redirigen a `/datos-personales/?modulo=...`.
- **Dentro de un módulo** se muestra solo ese módulo con la franja "Ir a: Reservas · Personal · Documentos · Mis datos"
  (`#moduloNav`); cambiar de módulo no recarga ni pide identificarse de nuevo (`irAModulo()` actualiza `?modulo=`).
- **Mis datos** (sin `?modulo=`) muestra solo las pestañas de la unidad: Resumen, Contacto, Residentes, Vehículos,
  Mascotas y emergencia, Facturación y Sanciones. En celular se deslizan de lado en una fila.

### Personal de aseo y vigilancia (`/personal/` → portal de residentes)
- Imágenes leídas **al generar el sitio** desde las subcarpetas de Drive cuyo nombre contiene "vigilancia" y "aseo"
  (p. ej. "Personal vigilancia" / "Personal aseo"), dentro de `personalDriveFolderId` (vacío = carpeta de documentos).
- Cambio mensual: borrar la imagen vieja y subir la nueva a la subcarpeta. Varias imágenes en una subcarpeta → se
  muestran todas, ordenadas por nombre. Se amplían en un visor dentro de la página (X, zoom, Esc).
- Lectura de carpetas de Drive: `layouts/partials/drive-carpeta.html` (compartido con Documentos; analiza cada entrada
  por separado porque las subcarpetas no traen ícono de tipo).

### Documentos del club (`/documentos/` → portal de residentes)
- `/documentos/` redirige a `/datos-personales/?modulo=documentos`: el residente se identifica (mismo login de
  Datos/Reservas/Personal) y entra directo al módulo Documentos (`tabDocumentosClub`).
  No confundir con la pestaña "Facturación" de Mis datos (`tabDocumentos`, solo propietarios).
- `layouts/partials/documentos-club.html` lee **al generar el sitio** la carpeta pública de Drive `documentosDriveFolderId`
  (`resources.GetRemote` sobre `embeddedfolderview`; `[caches.getresource] maxAge = 0` para no usar caché vieja).
- La carpeta sigue siendo pública en Drive: el login decide quién ve la pestaña, no protege los archivos.
- Agregar/quitar/renombrar archivos en Drive → se refleja en la siguiente publicación del sitio.
- Las subcarpetas no se listan como documentos (ahí viven "Personal vigilancia" / "Personal aseo").
- Nombre mostrado = nombre del archivo sin extensión. Categoría deducida por palabras clave del nombre
  (comunicado, reglamento/rph, asamblea/acta, presupuesto/pago, plano/parqueadero; si no, "Otros").
- Cada documento se abre en un visor dentro de la página (vista previa de Drive) con botón Descargar.

### Avisos (Google Sheet)
- Franja `#avisos` encima de la bienvenida; se oculta si no hay avisos vigentes o si la hoja no responde.
- Fuente: `avisosHojaUrl` en `hugo.toml` = enlace normal de una Google Sheet compartida como "Cualquier persona con el
  enlace: Lector". El navegador la lee vía `.../gviz/tq?tqx=out:csv&headers=1` (permite CORS). Región de la hoja: Colombia.
- Columnas (se reconocen por nombre, sin importar mayúsculas/tildes; si no, por orden): Mensaje, Tipo
  (`Info` | `Importante` | `Urgente`, idealmente con lista desplegable), Desde y Hasta (opcionales; sin Hasta el aviso
  queda publicado hasta que lo borren). Fechas `DD/MM/AAAA` o `AAAA-MM-DD`.
- Orden: Urgente → Importante → Info; dentro de cada tipo, la fila más abajo de la hoja (la más reciente) primero.
  Se ven 3; el resto queda tras el botón "Ver más avisos (n)".

### Indicador "Abierto ahora"
- Se calcula en el navegador con la hora de Colombia a partir de `[[params.horarioAtencion]]` en `hugo.toml`.
- Debe coincidir con el texto de `horario`.
- **Festivos** → "Cerrado hoy · festivo (nombre)". Se calculan en el navegador (`festivosDelAnio()` en
  `layouts/index.html`): fijos, trasladables al lunes (Ley Emiliani) y los que dependen de la Pascua.
  Portado de https://github.com/alejandrocastellanos/colombian-holidays (MIT). Si una ley crea o cambia un
  festivo, actualizar `FESTIVOS_FIJOS` / `FESTIVOS_AL_LUNES` (el cuarto valor es el año desde el que aplica).

### Botón flotante de Portería
- Solo en pantallas ≤ 768px; abre WhatsApp con `phonePorteria1`.

## 📝 Formulario PQRS

### Google Forms Embebido

El sitio incluye un formulario PQRS (Peticiones, Quejas, Reclamos y Sugerencias) en una página dedicada:

- **Ubicación**: `content/pqrs/_index.md` + `layouts/pqrs/list.html`
- **URL**: `/pqrs/`
- **Formulario**: https://docs.google.com/forms/d/e/1FAIpQLSfUum_qRdTFr2Pl1n1Z_p0rkI162pxVyFqRm-jHbiGP_LwARg/viewform

#### Características:

1. **Dos Opciones de Acceso**:
   - **Formulario embebido**: Se puede completar directamente en la página `/pqrs/`
   - **Enlace externo**: Botón para abrir el formulario en una nueva pestaña de Google Forms

2. **Acceso desde Index**: tarjeta "PQRS y mantenimiento" en Accesos rápidos → `/pqrs/`

3. **Entrada en el Menú**: El menú principal incluye enlace directo a PQRS

#### Cómo actualizar el formulario:

1. Crea un nuevo Google Form o modifica el existente
2. Obtén el enlace para compartir
3. Reemplaza la URL en `layouts/pqrs/list.html` (iframe embebido y botón externo)

## �📁 Sistema de Documentos Compartidos

### Categorías de Documentos

El sitio incluye un sistema de documentos compartidos para los residentes:

1. **Reglamentos** (`/documentos/reglamentos/`)
   - Reglamento de convivencia
   - Reglamento interno
   - Uso de zonas comunes
   
2. **Actas** (`/documentos/actas/`)
   - Actas de asambleas
   - Formato: `acta-YYYY-MM.pdf`
   
3. **Formularios** (`/documentos/formularios/`)
   - Solicitud salón social
   - Autorización visitantes
   - Formato PQRS
   
4. **Comunicados** (`/documentos/comunicados/`)
   - Comunicados oficiales de la administración
   - Formato: `comunicado-YYYY-MM-DD-tema.pdf`
   
5. **Financiero** (`/documentos/financiero/`)
   - Presupuestos anuales
   - Estados financieros

### Cómo Agregar Documentos

1. Coloca el archivo PDF en la carpeta correspondiente en `static/documentos/[categoría]/`
2. Usa nombres descriptivos en minúsculas con guiones: `reglamento-convivencia.pdf`
3. Actualiza el layout `layouts/documentos/list.html` si es necesario
4. Los documentos son accesibles públicamente en `/documentos/[categoría]/[archivo].pdf`

## 🚀 Comandos Hugo

### Desarrollo Local
```bash
hugo server -D
```
Abre el navegador en `http://localhost:1313`

### Construcción para Producción
```bash
hugo
```
Los archivos generados estarán en `public/`

### Crear Nuevo Contenido
```bash
hugo new content/posts/mi-post.md
```

## 🖼️ Imágenes y Assets

### Logo del Club
- Ubicación: `static/images/logo.png`
- Formato recomendado: PNG con fondo transparente
- Dimensiones sugeridas: 250px de ancho

### Favicons
- `favicon-16x16.png` (16x16px)
- `favicon-32x32.png` (32x32px)
- `apple-touch-icon.png` (180x180px)

### Estructura de Imágenes
```
static/images/
├── logo.png              # Logo principal
├── favicon-16x16.png     # Favicon pequeño
├── favicon-32x32.png     # Favicon mediano
├── apple-touch-icon.png  # Icono iOS
└── [otras-fotos]/        # Fotos de instalaciones
```

## 🎯 Características Principales

### Página Principal
- Foto aérea (drone) con indicador "Explorar"
- **Avisos** desde Google Sheet (opcional, ver arriba)
- Bienvenida corta (`content/_index.md`)
- **Accesos rápidos**: 8 tarjetas a todos los servicios (4 columnas en escritorio, 3 en tablet, 2 en celular)
- **Directorio de Contacto** en tarjetas:
  - Administración (dirección, horario con indicador "Abierto ahora", email, WhatsApp)
  - Portería (2 teléfonos con enlaces WhatsApp)
  - Consejo de Administración y Comité de Convivencia (email)
- Botón flotante de Portería en celular
- Footer con copyright

### Página de Documentos (Opcional)
- Listado organizado por categorías
- Botón de descarga para cada documento
- Diseño responsive con Bootstrap 5
- Iconos descriptivos para cada tipo de documento

### Página PQRS (/pqrs/)
- Header con navegación completa
- Descripción de los tipos de PQRS
- Tarjeta informativa con explicación de cada tipo
- Formulario de Google Forms embebido
- Botón para abrir en ventana externa
- Diseño responsive con Bootstrap 5
- Mensaje informativo sobre atención de solicitudes

## 🔗 Tecnologías Utilizadas

- **Hugo**: v0.120+ (Static Site Generator)
- **Bootstrap 5.3**: Framework CSS
- **Bootstrap Icons 1.10.3**: Iconografía
- **Google Fonts - Montserrat**: Tipografía principal
  - Weights: 400 (Regular), 600 (Semibold), 700 (Bold), 800 (Extrabold)

## 📱 Responsive Design

El sitio es completamente responsive y se adapta a:
- Desktop (1200px+)
- Tablet (768px - 1199px)
- Mobile (< 768px)

## 🔐 Información de Contacto (Actualizar)

```toml
[params]
  # Administración
  phone = '+573222289066'
  email = 'bulevarverdeadmon@gmail.com'
  address = 'Calle 70 # 59 265, Itagüí, Antioquia'
  horario = 'Lunes a viernes: 9:00 a.m - 1:00 p.m y 2:00 p.m - 5:00 p.m. Sábado: 9:00 a.m - 1:00 p.m'
  
  # Consejo de Administración
  emailConsejo = 'consejo.bulevarverde@gmail.com'
  
  # Comité de Convivencia
  emailConvivencia = 'comiteconvivenciabulevarverde@gmail.com'
  
  # Portería
  phonePorteria1 = '+573009728851'
  phonePorteria2 = '+573245820968'
  
  # Comunidad
  whatsappComunidad = 'https://chat.whatsapp.com/HonY8ALBTlR6ivBNxyx0pv'
  
  # Redes sociales (agregar URLs si están disponibles)
  facebook = ''
  instagram = ''
```

## 📝 Convenciones de Código

### HTML/Templates
- Usar plantillas de Hugo (Go templates)
- Mantener layouts separados por tipo de página
- Usar variables de configuración desde `hugo.toml`
- **IMPORTANTE**: Usar `relURL` para todas las rutas internas (imágenes, enlaces, assets)
  - Ejemplo: `{{ "images/logo.png" | relURL }}` en lugar de `/images/logo.png`
  - Esto asegura compatibilidad con subdirectorios en GitHub Pages

### CSS
- CSS inline en los layouts (por simplicidad y rendimiento)
- Variables CSS en `:root` para colores y tipografía
- Mobile-first approach

### Naming
- Archivos: minúsculas con guiones (`mi-archivo.pdf`)
- Carpetas: minúsculas sin espacios
- Variables CSS: kebab-case (`--color-primary`)

## 🔄 Workflow de Actualización

### Para actualizar el sitio:

1. **Contenido**: Editar archivos `.md` en `content/`
2. **Diseño**: Modificar layouts en `layouts/`
3. **Configuración**: Actualizar `hugo.toml`
4. **Documentos**: Agregar PDFs a `static/documentos/[categoría]/`
5. **Imágenes**: Subir a `static/images/`
6. **Build**: Ejecutar `hugo` para generar sitio estático
7. **Deploy**: Subir carpeta `public/` al servidor

## 📦 Basado en PetVerde

Este proyecto está basado en la estructura del sitio web de PetVerde, adaptado para un conjunto residencial:

**Características heredadas**:
- Estructura de Hugo con Bootstrap 5
- Sistema de layouts responsive
- Paleta de colores verde (adaptada)
- Tipografía Montserrat
- Diseño clean y moderno

**Características nuevas**:
- Sistema de documentos compartidos
- Categorías de documentos (reglamentos, actas, formularios, etc.)
- Enfoque en comunidad residencial
- Sección de características de vivienda

## 🎓 Recursos de Hugo

- [Documentación oficial de Hugo](https://gohugo.io/documentation/)
- [Tutoriales de Hugo](https://gohugo.io/getting-started/quick-start/)
- [Temas de Hugo](https://themes.gohugo.io/)

## ⚠️ Notas Importantes

1. **Documentos**: Los PDFs en `static/documentos/` son accesibles públicamente. No subir información confidencial.
2. **SEO**: Actualizar meta descriptions en cada página de contenido.
3. **Performance**: Optimizar imágenes antes de subirlas (usar formatos modernos como WebP si es posible).
4. **Seguridad**: No incluir información sensible en el repositorio Git.
5. **Rutas**: Siempre usar `relURL` en templates de Hugo para asegurar compatibilidad con diferentes estructuras de URL (desarrollo local vs GitHub Pages).
6. **PQRS**: El formulario de Google Forms debe tener permisos configurados para que cualquier persona con el enlace pueda responder.

## 📞 Soporte

Para preguntas sobre el desarrollo del sitio, contactar a: handresc1127

---

**Última actualización**: 2 de Octubre, 2026 (rediseño del inicio: accesos rápidos, avisos, horario y portería)  
**Versión**: 1.0.0
