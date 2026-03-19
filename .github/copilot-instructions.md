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

### Menú de Navegación
1. Inicio (/)
2. Documentos (#galeria - sección de documentos compartidos en Drive)
3. Comunidad (#comunidad - grupo de WhatsApp)
4. PQRS (/pqrs/ - formulario de peticiones, quejas, reclamos y sugerencias)
5. Contacto (#contacto)
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
## �️ Galería de Instalaciones

### Google Drive Embebido

El sitio incluye una galería de instalaciones embebida desde Google Drive:

- **Ubicación en el código**: `layouts/index.html` sección `#galeria`
- **Cómo actualizar**: Reemplaza el ID de la carpeta de Google Drive en el iframe
- **Formato del enlace**: `https://drive.google.com/embeddedfolderview?id=ID_DE_TU_CARPETA#grid`

#### Pasos para configurar tu propia galería:

1. Crea una carpeta en Google Drive con las fotos del club
2. Configura la carpeta como pública (cualquiera con el enlace puede ver)
3. Extrae el ID de la carpeta del enlace: 
   - Enlace: `https://drive.google.com/drive/folders/ID_DE_TU_CARPETA?usp=sharing`
   - ID: `ID_DE_TU_CARPETA`
4. Reemplaza el ID en el iframe de `layouts/index.html`

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

2. **Acceso desde Index**:
   - Sección `#pqrs` en la página principal con tarjeta informativa
   - Botón "Ir al Formulario" → Lleva a `/pqrs/`
   - Botón "Abrir en ventana externa" → Abre Google Forms directamente

3. **Entrada en el Menú**: El menú principal incluye enlace directo a PQRS

#### Cómo actualizar el formulario:

1. Crea un nuevo Google Form o modifica el existente
2. Obtén el enlace para compartir
3. Reemplaza la URL en:
   - `layouts/index.html` (sección PQRS - botón externo)
   - `layouts/pqrs/list.html` (iframe embebido y botón externo)

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
- Hero section con logo y descripción
- 6 tarjetas de características (seguridad, áreas verdes, comunidad, salón social, ubicación, documentos)
- **Documentos Compartidos - Google Drive**: Iframe embebido mostrando carpeta de documentos del club
- **Comunidad WhatsApp**: Botón para unirse al grupo de residentes
- **PQRS**: Tarjeta con enlaces al formulario (embebido en `/pqrs/` y externo)
- **Directorio de Contacto**: Información completa de:
  - Administración (dirección, teléfono WhatsApp, email, horario)
  - Consejo de Administración (email)
  - Comité de Convivencia (email)
  - Portería (2 teléfonos con enlaces WhatsApp)
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

**Última actualización**: 18 de Marzo, 2026  
**Versión**: 1.0.0
