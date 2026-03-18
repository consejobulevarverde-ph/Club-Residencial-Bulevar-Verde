---
applyTo: "**/*.py,**/*.js,**/*.html,**/*.css"
---

# Instrucciones de Limpieza de Código - Green-POS

## 🎯 Objetivo
Este archivo define las reglas y procedimientos para limpiar código de debugging, comentarios temporales y código no productivo antes de commits o deploys a producción.

## 🚨 REGLA DE ORO
**NUNCA hacer commit de código con marcadores de debugging temporal sin limpiar primero**

## 📋 Marcadores de Código Temporal

### Marcadores que DEBEN Eliminarse

#### Python (.py)
```python
# DEBUG: código de debugging temporal
# TODO: tarea pendiente que debe completarse o eliminarse
# TEMP: código experimental o temporal
# FIXME: código que necesita corrección
# TEST: código solo para pruebas
# XXX: advertencia de código problemático
print()  # Cualquier print() no justificado
import pdb; pdb.set_trace()  # Breakpoints
from pprint import pprint  # Imports de debugging

# ⚠️ CRÍTICO - SERVIDOR DE PRODUCCIÓN:
# NO USAR EMOJIS (✅ ❌ 🔄 ⚠️ 📝 🎯 etc.)
# El servidor de producción Windows tiene problemas con UTF-8
# Usar prefijos de texto: [OK], [ERROR], [INFO], [WARNING], [DELETE]
```

#### JavaScript (.js)
```javascript
// DEBUG: código de debugging temporal
// TODO: tarea pendiente
// TEMP: código temporal
// FIXME: necesita corrección
// TEST: solo para pruebas
console.log()  // Logs de debugging
console.debug()
console.warn()  // Warnings temporales
alert()  // Alerts de testing
debugger;  // Breakpoints
```

#### HTML/Jinja2 (.html)
```html
<!-- DEBUG: comentario de debugging -->
<!-- TODO: tarea pendiente -->
<!-- TEMP: código temporal -->
<!-- FIXME: necesita corrección -->
<!-- TEST: solo para pruebas -->
```

#### CSS (.css)
```css
/* DEBUG: estilos de debugging */
/* TODO: pendiente */
/* TEMP: temporal */
/* TEST: solo pruebas */
```

## 🔍 Procedimiento de Limpieza

### 1. Búsqueda de Marcadores (Scan)

**Comando PowerShell para buscar marcadores**:
```powershell
# Buscar todos los marcadores de debugging en Python
Select-String -Pattern "# DEBUG:|# TODO:|# TEMP:|# FIXME:|# TEST:" -Path *.py -Recurse

# Buscar prints (revisar uno por uno)
Select-String -Pattern "^\s*print\(" -Path *.py -Recurse

# Buscar console.log en JavaScript
Select-String -Pattern "console\.(log|debug|warn)" -Path *.js -Recurse

# Buscar comentarios HTML de debugging
Select-String -Pattern "<!-- (DEBUG|TODO|TEMP|FIXME|TEST):" -Path *.html -Recurse
```

**Usando grep (Linux/Mac/Git Bash)**:
```bash
# Python
grep -rn "# DEBUG:\|# TODO:\|# TEMP:\|# FIXME:\|# TEST:" --include="*.py" .

# JavaScript
grep -rn "console\.\(log\|debug\|warn\)\|// DEBUG:\|// TODO:" --include="*.js" .

# HTML
grep -rn "<!-- DEBUG:\|<!-- TODO:\|<!-- TEMP:" --include="*.html" .
```

### 2. Revisión Manual (Checklist)

#### Python Files (*.py)
- [ ] **Eliminar prints de debugging**
  ```python
  # ❌ ELIMINAR
  print(f"Debug: usuario = {user}")
  print("Entrando a la función")
  
  # ✅ MANTENER (logs productivos)
  app.logger.error(f"Error crítico: {str(e)}")
  app.logger.info(f"Factura {invoice.number} creada")
  ```

- [ ] **Eliminar emojis y acentos de consola**
  ```python
  # ❌ ELIMINAR (problemas UTF-8 en producción Windows)
  print("✅ Migración exitosa")
  print("❌ Error en migración")
  print("🔄 Procesando...")
  
  # ✅ CORRECTO (usar prefijos de texto)
  print("[OK] Migracion exitosa")
  print("[ERROR] Error en migracion")
  print("[INFO] Procesando...")
  
  # Prefijos estándar:
  # [OK]      - Operación exitosa
  # [ERROR]   - Error crítico
  # [WARNING] - Advertencia
  # [INFO]    - Información
  # [DELETE]  - Operación de borrado
  ```

- [ ] **Eliminar imports de debugging**
  ```python
  # ❌ ELIMINAR
  import pdb
  from pprint import pprint
  import sys  # Si no se usa
  
  # ✅ MANTENER (imports productivos)
  import logging
  from flask import app
  ```

- [ ] **Eliminar breakpoints**
  ```python
  # ❌ ELIMINAR
  import pdb; pdb.set_trace()
  breakpoint()
  ```

- [ ] **Eliminar comentarios temporales**
  ```python
  # ❌ ELIMINAR
  # DEBUG: verificar este cálculo
  # TODO: optimizar esta query
  # TEMP: función de prueba
  # FIXME: revisar lógica
  
  # ✅ MANTENER (comentarios útiles)
  # Calcular utilidad: (precio_venta - precio_compra) * cantidad
  # CRÍTICO: No modificar sin revisar invoice_create()
  ```

- [ ] **Eliminar código comentado**
  ```python
  # ❌ ELIMINAR
  # old_function()
  # if debug_mode:
  #     pass
  
  # ✅ MANTENER (código comentado con justificación)
  # Disabled temporalmente por issue #123
  # TODO(v2.0): Reactivar cuando se implemente nueva API
  # customer.validate_email()
  ```

- [ ] **Eliminar variables no utilizadas**
  ```python
  # ❌ ELIMINAR
  debug_var = "test"  # TEMP
  unused_list = []
  
  # Verificar con:
  # pylint --disable=all --enable=unused-variable app.py
  ```

#### JavaScript Files (*.js)
- [ ] **Eliminar console logs**
  ```javascript
  // ❌ ELIMINAR
  console.log("Debug info:", data);
  console.debug("Variable x:", x);
  console.warn("Temporal warning");
  
  // ✅ MANTENER (logs de errores productivos)
  console.error("Error crítico:", error);
  ```

- [ ] **Eliminar alerts y debugger**
  ```javascript
  // ❌ ELIMINAR
  alert("Test");
  debugger;
  
  // ✅ MANTENER (alerts justificados)
  // Ninguno - usar modals de Bootstrap
  ```

- [ ] **Eliminar comentarios temporales**
  ```javascript
  // ❌ ELIMINAR
  // DEBUG: verificar valores
  // TODO: implementar validación
  // TEMP: función de prueba
  
  // ✅ MANTENER (comentarios JSDoc)
  /**
   * Calcula el total de la factura
   * @param {Array} items - Items de la factura
   * @returns {number} Total calculado
   */
  ```

- [ ] **Eliminar funciones de test**
  ```javascript
  // ❌ ELIMINAR
  function debugFunction() { /* TEST */ }
  const testVar = "test";  // TEMP
  ```

#### HTML/Template Files (*.html)
- [ ] **Eliminar comentarios de debugging**
  ```html
  <!-- ❌ ELIMINAR -->
  <!-- DEBUG: verificar este valor -->
  <!-- TODO: mejorar diseño -->
  <!-- TEMP: código experimental -->
  
  <!-- ✅ MANTENER (comentarios estructurales) -->
  <!-- Sección de métricas principales -->
  <!-- Fin del formulario -->
  ```

- [ ] **Eliminar atributos de debugging**
  ```html
  <!-- ❌ ELIMINAR -->
  <div data-debug="true">
  <span id="debug-output"></span>
  
  <!-- ✅ MANTENER (atributos funcionales) -->
  <div data-bs-toggle="collapse">
  <span id="total-amount"></span>
  ```

- [ ] **Eliminar código HTML comentado**
  ```html
  <!-- ❌ ELIMINAR (código viejo sin justificación) -->
  <!--
  <div class="old-design">
    ...
  </div>
  -->
  
  <!-- ✅ MANTENER (con justificación y ticket) -->
  <!-- Disabled temporalmente - Issue #456
  <div class="new-feature">
    ...
  </div>
  -->
  ```

#### CSS Files (*.css)
- [ ] **Eliminar estilos de debugging**
  ```css
  /* ❌ ELIMINAR */
  .debug-border { border: 2px solid red; }
  .test-class { /* TEMP */ }
  
  /* ✅ MANTENER (estilos productivos) */
  .error-border { border: 1px solid #dc3545; }
  ```

### 3. Validación de Limpieza

#### Checklist Final Antes de Commit
```
[ ] Ejecutar búsqueda de marcadores (no debe encontrar resultados)
[ ] Revisar git diff completo
[ ] No hay prints() sin justificar
[ ] No hay console.log() temporales
[ ] No hay comentarios DEBUG/TODO/TEMP/FIXME/TEST sin resolver
[ ] No hay código comentado sin justificación
[ ] No hay imports no utilizados
[ ] No hay variables no utilizadas
[ ] Código pasa linting sin warnings críticos
[ ] Tests pasan correctamente
```

#### Comandos de Validación
```powershell
# 1. Buscar marcadores restantes
Select-String -Pattern "# DEBUG:|# TODO:|# TEMP:|console\.log|alert\(" -Path app.py,static\js\*.js -Recurse

# 2. Verificar imports no utilizados (Python)
pylint --disable=all --enable=unused-import,unused-variable app.py

# 3. Verificar que el código funciona
python app.py --help  # Verifica que no hay errores de sintaxis

# 4. Ejecutar tests (si existen)
pytest tests/

# 5. Ver cambios antes de commit
git diff
git diff --staged
```

## 🛡️ Excepciones Permitidas

### Comentarios TODO con Justificación
```python
# ✅ PERMITIDO: TODO con contexto y ticket
# TODO(v2.0): Implementar paginación cuando tengamos >1000 productos
# TODO(Issue #123): Agregar validación de email único
# TODO(@henrycorrea): Revisar performance de esta query

# ❌ NO PERMITIDO: TODO genérico sin contexto
# TODO: revisar esto
# TODO: mejorar
```

### Logs de Debugging con Flag
```python
# ✅ PERMITIDO: Debug condicional
if app.config.get('DEBUG_MODE'):
    app.logger.debug(f"Query ejecutada: {query}")

# ❌ NO PERMITIDO: Debug incondicional
print(f"Debug: {data}")
```

### Código Experimental Marcado
```python
# ✅ PERMITIDO: Experimental con fecha límite
# EXPERIMENTAL(2025-11-30): Probar nuevo algoritmo de cálculo
# Si funciona, remover flag; si no, eliminar código
def experimental_calculation():
    pass

# ❌ NO PERMITIDO: Experimental sin plazo
# TEMP: probando algo
```

## 📊 Reporte de Limpieza

### Template de Reporte (para PRs importantes)
```markdown
## 🧹 Code Cleaning Report

### Archivos Revisados
- [x] app.py
- [x] static/js/main.js
- [x] templates/**/*.html
- [x] static/css/style.css

### Elementos Eliminados
- [ ] 15 comentarios DEBUG
- [ ] 8 console.log() temporales
- [ ] 3 funciones de test
- [ ] 12 comentarios TODO resueltos
- [ ] 5 imports no utilizados
- [ ] 20 líneas de código comentado

### Validaciones Ejecutadas
- [x] Búsqueda de marcadores (0 encontrados)
- [x] Linting (0 warnings críticos)
- [x] Tests (100% passing)
- [x] Git diff revisado

### Comentarios Restantes (Justificados)
- TODO(v2.0) en app.py línea 450: Migración a PostgreSQL
- EXPERIMENTAL en reports.py línea 120: Nuevo gráfico (deadline: 2025-11-30)
```

## 🚀 Workflow Recomendado

### Durante Desarrollo
1. **Marcar claramente código temporal**
   ```python
   # DEBUG: imprimir para verificar cálculo
   print(f"Total: {total}")
   ```

2. **Usar marcadores consistentes**
   - `# DEBUG:` - Código de debugging
   - `# TODO:` - Tarea pendiente
   - `# TEMP:` - Código temporal
   - `# FIXME:` - Requiere corrección
   - `# TEST:` - Solo para testing

3. **Commits frecuentes** con código temporal está OK

### Antes de Pull Request
1. **Ejecutar limpieza completa**
2. **Revisar checklist de validación**
3. **Documentar excepciones justificadas**
4. **Generar reporte de limpieza**

### Antes de Deploy a Producción
1. **Limpieza OBLIGATORIA** (cero tolerancia)
2. **Revisión de código por par**
3. **Tests de regresión completos**
4. **Validación de performance**

## 🔧 Herramientas Recomendadas

### VS Code Extensions
- **TODO Highlight**: Resalta comentarios TODO/FIXME
- **Error Lens**: Muestra errores inline
- **Code Spell Checker**: Detecta typos en comentarios

### Linters
```bash
# Python
pip install pylint flake8
pylint app.py
flake8 app.py --select=E,W,F,C90

# JavaScript
npm install -g eslint
eslint static/js/*.js
```

### Pre-commit Hooks (Opcional)
```bash
# Instalar pre-commit
pip install pre-commit

# Crear .pre-commit-config.yaml
cat > .pre-commit-config.yaml << EOF
repos:
  - repo: local
    hooks:
      - id: check-debug-markers
        name: Check for DEBUG markers
        entry: grep -rn "# DEBUG:|# TEMP:|console.log" --include="*.py" --include="*.js" .
        language: system
        pass_filenames: false
EOF

# Activar
pre-commit install
```

## 📚 Referencias

- [Python PEP 8 - Comments](https://pep8.org/#comments)
- [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html)
- [Clean Code by Robert C. Martin](https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882)

---

**Última actualización**: 22 de octubre de 2025  
**Versión**: 1.0  
**Mantenedor**: Green-POS Team

---

*Este archivo es parte del sistema de instrucciones de GitHub Copilot y debe seguirse rigurosamente antes de cualquier deploy a producción.*
