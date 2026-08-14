# 🚀 Instrucciones de Deploy - Club Residencial Bulevar Verde

**Proyecto**: Club Residencial Bulevar Verde  
**Rama de Deploy**: `firebase`  
**Entorno**: Firebase Hosting + Cloud SQL + Firebase Data Connect

---

## 📋 Requisitos Previos

- Node.js 18+ instalado
- Firebase CLI instalado: `npm install -g firebase-tools`
- Autenticación en Firebase: `firebase login`
- Acceso al proyecto Firebase: `project-7dd6d100-d8c2-427a-a80`
- Hugo instalado (v0.157.0+) para builds locales
- Git configurado

### Verificar instalaciones:
```bash
firebase --version
hugo version
node --version
git --version
```

---

## 🔄 Flujo de Deploy

### **Paso 1: Preparar la rama**

```bash
# Asegurarse de estar en rama firebase
git checkout firebase

# Actualizar con cambios más recientes (si aplica)
git pull origin firebase

# O, traer cambios de main (si es necesario)
git merge main
```

### **Paso 2: Construir la aplicación web (Hugo)**

```bash
# Limpiar build anterior
rm -rf public

# Construir con Hugo
hugo --gc --minify
```

**Verificar:**
- Carpeta `public/` debe generarse con ~41 archivos
- No debe haber errores en la compilación

### **Paso 3: Deploy a Firebase Hosting**

```bash
firebase deploy --only hosting
```

**Verificar:**
- ✅ Mensaje "Deploy complete!"
- ✅ URL: https://bulevar-verde-app.web.app
- ✅ Probar rutas: `/reservas/`, `/pqrs/`, `/sanciones/`

---

## 🔧 Deploy del API (Firebase Data Connect)

### **Paso 1: Sincronizar schema de base de datos**

Antes de desplegar la API, asegurar que el schema de PostgreSQL esté actualizado:

```bash
# Ver cambios requeridos
firebase dataconnect:sql:migrate

# Aplicar cambios (con cambios destructivos si aplica)
firebase dataconnect:sql:migrate --force
```

**Cambios esperados en primera migración:**
```sql
-- Drop índice antiguo de email
DROP INDEX "public"."usuarios_portal_correo_uidx"

-- Modificar tabla de usuarios
ALTER TABLE "public"."usuarios_portal"
  ALTER COLUMN "correo" DROP NOT NULL,
  ADD COLUMN "rol_global" text NOT NULL,
  ADD COLUMN "ultimo_acceso" timestamptz NULL

-- Drop columna obsoleta (en segunda iteración)
ALTER TABLE "public"."usuarios_portal"
  DROP COLUMN "correo"
```

### **Paso 2: Desplegar Data Connect**

```bash
firebase deploy --only dataconnect
```

**Verificar:**
- ✅ Schema compilado exitosamente
- ✅ Conectores compilados
- ✅ Cloud SQL actualizado
- ✅ Base de datos sincronizada

### **Paso 3: Deploy completo (UI + API)**

```bash
firebase deploy
```

---

## 🧪 Validación Post-Deploy

### **Web (Hosting)**
```bash
# URL del sitio
https://bulevar-verde-app.web.app

# Verificar páginas principales:
- https://bulevar-verde-app.web.app/ (inicio)
- https://bulevar-verde-app.web.app/reservas/
- https://bulevar-verde-app.web.app/pqrs/
- https://bulevar-verde-app.web.app/sanciones/
- https://bulevar-verde-app.web.app/datos-personales/
```

### **API (Data Connect)**
```bash
# Verificar en Firebase Console
# https://console.firebase.google.com/project/project-7dd6d100-d8c2-427a-a80

# Ver logs de Data Connect
firebase functions:log --only=dataconnect

# Verificar conectores disponibles:
# - admin connector
# - Schemas compilados correctamente
```

---

## 📊 Configuración Importante

### **firebase.json**
```json
{
  "hosting": {
    "public": "public",
    "site": "bulevar-verde-app",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ]
  },
  "dataconnect": {
    "source": "dataconnect"
  }
}
```

### **hugo.toml** (Base URL)
```toml
baseURL = 'https://bulevar-verde-app.web.app/'
```

### **.firebaserc**
```json
{
  "projects": {
    "default": "project-7dd6d100-d8c2-427a-a80"
  },
  "targets": {
    "project-7dd6d100-d8c2-427a-a80": {
      "hosting": {
        "bulevar-verde": [
          "bulevar-verde-app"
        ]
      }
    }
  }
}
```

---

## 🐛 Solución de Problemas

### **Error: "database schema is incompatible"**
```bash
# Ejecutar migración de schema
firebase dataconnect:sql:migrate --force

# Luego redeploy
firebase deploy
```

### **URLs rotas en la web (ej: /Club-Residencial-Bulevar-Verde/reservas/)**
```bash
# Verificar que baseURL en hugo.toml sea correcto
# Debe ser: baseURL = 'https://bulevar-verde-app.web.app/'

# Reconstruir y redeploy
rm -rf public
hugo --gc --minify
firebase deploy --only hosting
```

### **Hosting no actualiza cambios**
```bash
# Limpiar caché de Firebase
rm -rf .firebase

# Redeploy
firebase deploy --only hosting
```

### **Problemas de autenticación Firebase**
```bash
# Re-login
firebase logout
firebase login

# Seleccionar proyecto correcto
firebase use project-7dd6d100-d8c2-427a-a80
```

---

## 📱 URLs Importantes

| Servicio | URL |
|----------|-----|
| **Web App** | https://bulevar-verde-app.web.app |
| **Firebase Console** | https://console.firebase.google.com/project/project-7dd6d100-d8c2-427a-a80 |
| **Cloud SQL** | bulevar-verde-sql (us-east4) |
| **Database** | bulevar-verde (PostgreSQL) |
| **Project ID** | project-7dd6d100-d8c2-427a-a80 |

---

## ✅ Checklist Pre-Deploy

- [ ] Estar en rama `firebase`
- [ ] Rama actualizada con `git pull origin firebase`
- [ ] Cambios committeados localmente
- [ ] Hugo instalado y versión correcta
- [ ] Firebase CLI autenticado y versión reciente
- [ ] Conexión a internet estable
- [ ] No hay cambios sin commitear (`git status` limpio)

---

## 📝 Comandos Rápidos

```bash
# Deploy todo (UI + API)
firebase deploy

# Deploy solo hosting
firebase deploy --only hosting

# Deploy solo Data Connect
firebase deploy --only dataconnect

# Ver logs
firebase functions:log

# Ver estado del proyecto
firebase projects:list
firebase use

# Abrir Firebase Console
firebase open
```

---

## 📞 Contacto & Soporte

- **Administración**: bulevarverdeadmon@gmail.com
- **Consejo**: consejo.bulevarverde@gmail.com
- **Portería 1**: +573009728851
- **Portería 2**: +573245820968

---

**Última actualización**: 14 de agosto de 2026  
**Generado por**: Claude Code
