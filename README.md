# 🏡 Club Residencial Bulevar Verde - Sitio Web Oficial

Sitio web oficial del Club Residencial Bulevar Verde, conjunto residencial ubicado en Itagüí, Antioquia, Colombia.

## 🚀 Inicio Rápido

### Prerrequisitos
- [Hugo](https://gohugo.io/installation/) v0.120 o superior
- Git

### Instalación

1. Clonar el repositorio:
```bash
git clone [URL_DEL_REPO]
cd Club-Residencial-Bulevar-Verde
```

2. Iniciar el servidor de desarrollo:
```bash
hugo server -D
```

4. Abrir el navegador en `http://localhost:1313`

## 📁 Estructura del Proyecto

```
Club-Residencial-Bulevar-Verde/
├── hugo.toml              # Configuración del sitio
├── content/               # Contenido en Markdown
├── layouts/               # Plantillas HTML
├── static/                # Archivos estáticos
│   ├── documentos/       # Documentos del club
│   └── images/           # Imágenes y logos
├── public/                # Sitio generado (no incluido en Git)
└── README.md              # Este archivo
```

## 🎨 Características

- ✅ **Diseño Responsive**: Compatible con desktop, tablet y móvil
- ✅ **Sistema de Documentos**: Sección dedicada para documentos compartidos del club
- ✅ **Bootstrap 5**: Framework CSS moderno
- ✅ **SEO Optimizado**: Meta tags y estructura semántica
- ✅ **Rápido**: Sitio estático generado con Hugo
- ✅ **Fácil de mantener**: Contenido en Markdown

## 📚 Documentación Completa

Para documentación detallada del proyecto, consulta:
- [copilot-instructions.md](.github/copilot-instructions.md) - Guía completa de desarrollo

## 📝 Cómo Agregar Contenido

### Agregar Documentos

1. Coloca el archivo PDF en la carpeta correspondiente:
```bash
static/documentos/[categoria]/tu-documento.pdf
```

2. Categorías disponibles:
   - `reglamentos/` - Reglamentos del club
   - `actas/` - Actas de asambleas
   - `formularios/` - Formularios administrativos
   - `comunicados/` - Comunicados oficiales
   - `financiero/` - Documentos financieros

3. Los documentos aparecerán automáticamente en la sección de Documentos

### Agregar Imágenes

Coloca las imágenes en:
```bash
static/images/
```

Archivos importantes:
- `logo.png` - Logo del club (250px ancho recomendado)
- `favicon-16x16.png` - Favicon 16x16
- `favicon-32x32.png` - Favicon 32x32
- `apple-touch-icon.png` - Icono iOS 180x180

## 🔧 Configuración

Edita `hugo.toml` para actualizar:
- Información de contacto (teléfono, email, dirección)
- URLs de redes sociales
- Configuración del sitio

## 🏗️ Construcción para Producción

```bash
hugo
```

Los archivos generados estarán en `public/`

## 🌐 Despliegue

El sitio puede ser desplegado en:
- GitHub Pages
- Netlify
- Vercel
- Cualquier hosting de archivos estáticos

## 📱 Secciones del Sitio

1. **Inicio** (`/`)
   - Información general del club
   - Características y beneficios
   - Contacto

2. **Documentos** (`/documentos/`)
   - Reglamentos
   - Actas de asamblea
   - Formularios administrativos
   - Comunicados oficiales
   - Documentos financieros

## 🎨 Paleta de Colores

- **Verde Principal**: #2c5f2d
- **Verde Secundario**: #4a8c4b
- **Verde Claro**: #7bb77d
- **Fondo**: #e8f5e9

## 🛠️ Tecnologías Utilizadas

- **Hugo** - Generador de sitios estáticos
- **Bootstrap 5.3** - Framework CSS
- **Bootstrap Icons** - Iconografía
- **Google Fonts (Montserrat)** - Tipografía

## 📞 Contacto

Para preguntas sobre el desarrollo del sitio:
- Desarrollador: handresc1127
- Email: contacto@clubbulevarverde.co

## 📄 Licencia

Este proyecto es propiedad del Club Residencial Bulevar Verde.

---

**Versión**: 1.0.0  
**Última actualización**: Marzo 2026
