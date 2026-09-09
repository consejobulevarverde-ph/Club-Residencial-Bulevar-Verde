// core.js - shared helpers, state, login, and module registration
(function () {
  'use strict';

var config = window.ADMIN_DATOS_CONFIG || {};
      var API_BASE = config.apiBase || 'http://localhost:8080';
      
      firebase.initializeApp({
        apiKey: config.firebaseApiKey,
        authDomain: config.firebaseAuthDomain,
        projectId: config.firebaseProjectId
      });

      window.AdminDatos = window.AdminDatos || {};
      var AdminDatos = window.AdminDatos;

      var $ = function (id) { return document.getElementById(id); };
      var currentUnidadId = null;
      var reservarUnidadId = null;
      var reservarReservasDelDiaCache = [];
      var reservarFranjasCache = [];
      var editarReservaDelDiaCache = [];
      var editarReservaFranjasCache = [];
      var reservaEditandoId = null;

      function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character];
        });
      }

      function msg(text, type) {
        var alertBox = $('alert');
        alertBox.className = 'alert alert-' + (type || 'danger');
        alertBox.textContent = text;
        alertBox.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      function hideMsg() {
        $('alert').classList.add('hidden');
      }

      function panel(id) {
        ['login', 'app'].forEach(function (panelId) {
          $(panelId).classList.toggle('hidden', panelId !== id);
        });
      }

      function busy(button, active, text) {
        if (active) {
          button.dataset.old = button.innerHTML;
          button.disabled = true;
          button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>' + text;
        } else {
          button.disabled = false;
          button.innerHTML = button.dataset.old || text;
        }
      }

      function apiFetch(path, idToken, options) {
        options = options || {};
        var headers = { Authorization: 'Bearer ' + idToken };
        var fetchOptions = { method: options.method || 'GET', headers: headers };

        if (options.body !== undefined) {
          headers['Content-Type'] = 'application/json';
          fetchOptions.body = JSON.stringify(options.body);
        }

        return fetch(API_BASE + path, fetchOptions).then(function (response) {
          if (response.status === 204) return {};

          return response.json().then(function (body) {
            if (!response.ok) {
              throw new Error((body.error && body.error.message) || 'Error ' + response.status);
            }
            return body;
          });
        });
      }

      function withIdToken(fn) {
        var user = firebase.auth().currentUser;
        if (!user) {
          return Promise.reject(new Error('No hay sesión activa. Por favor, inicia sesión nuevamente.'));
        }
        return user.getIdToken().then(fn);
      }

      $('loginForm').addEventListener('submit', function (event) {
        event.preventDefault();
        hideMsg();

        var button = $('loginBtn');
        busy(button, true, 'Ingresando…');

        firebase.auth().signInWithEmailAndPassword($('email').value.trim(), $('password').value)
          .then(function () {
            panel('app');
            return loadDashboard();
          })
          .catch(function (error) {
            msg(error.message);
          })
          .finally(function () {
            busy(button, false, 'Ingresar');
          });
      });

      $('logout').addEventListener('click', function () {
        firebase.auth().signOut().then(function () {
          panel('login');
        });
      });

      function loadDashboard() {
        return withIdToken(function (idToken) {
          return apiFetch('/api/v1/usuarios/me', idToken).then(function (me) {
            $('userText').textContent = me.data.email;
            return apiFetch('/api/v1/dashboard/metricas', idToken);
          });
        }).then(function (body) {
          var metricas = body.data;
          var cards = [
            ['Unidades', metricas.unidades, 'bi-buildings'],
            ['Personas', metricas.personas, 'bi-people'],
            ['Vehículos', metricas.vehiculos, 'bi-car-front'],
            ['Parqueaderos', metricas.parqueaderos, 'bi-p-square']
          ];

          $('metrics').innerHTML = cards.map(function (item) {
            return '<div class="col-6 col-lg-3 col-xl">' +
              '<div class="surface metric p-3 h-100">' +
              '<i class="bi ' + item[2] + '"></i>' +
              '<div class="fs-4 fw-bold">' + esc(item[1]) + '</div>' +
              '<div class="small-note">' + esc(item[0]) + '</div>' +
              '</div></div>';
          }).join('');
        }).catch(function (error) {
          msg(error.message);
        });
      }

      function renderCoincidencias(coincidencias) {
        return coincidencias.map(function (c) {
          return esc(c.tipo) + ': ' + esc(c.detalle);
        }).join(' · ');
      }

      $('searchForm').addEventListener('submit', function (event) {
        event.preventDefault();
        hideMsg();

        var termino = $('query').value.trim();
        var results = $('searchResults');
        if (!termino) return;

        results.textContent = 'Buscando…';

        withIdToken(function (idToken) {
          return apiFetch('/api/v1/unidades/buscar?q=' + encodeURIComponent(termino), idToken);
        }).then(function (body) {
          var resultados = (body.data && body.data.resultados) || [];

          results.innerHTML = resultados.length
            ? resultados.map(function (item) {
                return '<button type="button" class="btn btn-outline-success w-100 text-start mb-2 unit-result" data-unit-id="' +
                  esc(item.unidad.id) + '">' +
                  '<strong>' + esc(item.unidad.codigoOficial) + '</strong>' +
                  '<div class="small-note">' + renderCoincidencias(item.coincidencias) + '</div>' +
                  '</button>';
              }).join('')
            : '<p class="text-muted mb-0">Sin resultados.</p>';
        }).catch(function (error) {
          results.innerHTML = '<p class="text-danger mb-0">Error: ' + esc(error.message) + '</p>';
        });
      });

      $('searchResults').addEventListener('click', function (event) {
        var button = event.target.closest('.unit-result');
        if (button) loadProfile(button.dataset.unitId);
      });

      function loadProfile(unidadId) {
        currentUnidadId = unidadId;
        var box = $('profile');
        box.innerHTML = '<p>Cargando…</p>';

        withIdToken(function (idToken) {
          return apiFetch('/api/v1/unidades/' + unidadId + '/perfil', idToken);
        }).then(function (body) {
          renderProfile(body.data);
        }).catch(function (error) {
          box.innerHTML = '<p class="text-danger mb-0">Error: ' + esc(error.message) + '</p>';
        });
      }

      function renderProfile(perfil) {
        var propietarios = (perfil.vinculosPersona || []).map(function (v) {
          return '<li class="mb-1">' + esc(v.persona.nombreCompleto) + ' — ' + esc(v.tipoRelacion) +
            ' (' + esc(v.persona.tipoDocumento) + ' ' + esc(v.persona.numeroDocumento) + ')' +
            (v.persona.correo ? ' · ' + esc(v.persona.correo) : '') +
            (v.persona.telefono ? ' · ' + esc(v.persona.telefono) : '') +
            (v.activo
              ? ' <button type="button" class="btn btn-outline-primary btn-sm ms-2 editar-contacto-persona" title="Editar contacto" aria-label="Editar contacto" data-persona-id="' + esc(v.persona.id) + '" data-nombre="' + esc(v.persona.nombreCompleto) + '" data-correo="' + esc(v.persona.correo || '') + '" data-telefono="' + esc(v.persona.telefono || '') + '"><i class="bi bi-pencil"></i></button>' +
                ' <button type="button" class="btn btn-outline-danger btn-sm ms-1 retirar-propietario" data-vinculo-id="' + esc(v.id) + '">Retirar</button>'
              : ' <span class="badge text-bg-secondary">retirado</span>') +
            '</li>';
        }).join('') || '<li class="text-muted">Sin registros.</li>';

        var vehiculos = (perfil.vinculosVehiculo || []).map(function (v) {
          return '<li>' + esc(v.vehiculo.placa) + ' — ' + esc(v.vehiculo.tipoVehiculo || '') +
            ' (' + esc(v.tipoVinculo) + ', ' + esc(v.estadoVinculo) + ')</li>';
        }).join('') || '<li class="text-muted">Sin registros.</li>';

        var parqueaderos = (perfil.parqueaderos || []).map(function (p) {
          return '<li>' + esc(p.codigo) + ' — ' + esc(p.tipoParqueadero || '') + '</li>';
        }).join('') || '<li class="text-muted">Sin registros.</li>';

        var mascotas = (perfil.mascotas || []).map(function (m) {
          return '<li>' + esc(m.nombre || 'Mascota') + (m.especie ? ' — ' + esc(m.especie) : '') + (m.raza ? ' (' + esc(m.raza) + ')' : '') + '</li>';
        }).join('') || '<li class="text-muted">Sin registros.</li>';

        var emergencia = (perfil.emergencia || []).map(function (e) {
          return '<li>' + esc(e.nombre || '') + (e.parentesco ? ' — ' + esc(e.parentesco) : '') + (e.telefono ? ' · ' + esc(e.telefono) : '') + '</li>';
        }).join('') || '<li class="text-muted">Sin registros.</li>';

        var hc = perfil.historialCartera && perfil.historialCartera[0];
        var estadoCuenta = hc
          ? esc(hc.estadoCuenta || '') + ' · Saldo: ' + esc(hc.saldoActual || '')
          : 'Sin información.';

        function accordionItem(id, title, body, expanded) {
          return '<div class="accordion-item">' +
            '<h2 class="accordion-header">' +
            '<button class="accordion-button' + (expanded ? '' : ' collapsed') + '" type="button" data-bs-toggle="collapse" data-bs-target="#' + id + '">' +
            title + '</button></h2>' +
            '<div id="' + id + '" class="accordion-collapse collapse' + (expanded ? ' show' : '') + '">' +
            '<div class="accordion-body p-3">' + body + '</div></div></div>';
        }

        $('profile').innerHTML =
          '<div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">' +
          '<h4 class="mb-0">' + esc(perfil.codigoOficial) + '</h4>' +
          '<span class="badge text-bg-success">' + esc(perfil.estadoUnidad) + '</span>' +
          '</div>' +

          '<div class="accordion">' +
          accordionItem('collapse-editar', 'Datos de la unidad',
            '<form id="editUnidadForm" class="row g-2 align-items-end">' +
            '<div class="col-md-5"><label for="editEstadoUnidad"class="form-label small">Estado</label>' +
            '<select id="editEstadoUnidad" class="form-select form-select-sm" autocomplete="off">' +
            ['NO_ENTREGADA', 'ENTREGADA'].map(function (estado) {
              return '<option value="' + estado + '"' + (estado === perfil.estadoUnidad ? ' selected' : '') + '>' + estado + '</option>';
            }).join('') +
            '</select></div>' +
            '<div class="col-md-5"><label for="editFechaEntrega"class="form-label small">Fecha de entrega</label>' +
            '<input id="editFechaEntrega" type="date" class="form-control form-control-sm" value="' + esc((perfil.fechaEntrega || '').slice(0, 10)) + '" autocomplete="off"></div>' +
            '<div class="col-md-2 d-grid"><button type="submit" class="btn btn-primary btn-sm">Guardar</button></div>' +
            '</form>', false) +

          accordionItem('collapse-propietarios', 'Propietarios y residentes',
            '<ul>' + propietarios + '</ul>' +
            '<form id="addPropietarioForm" class="row g-2 align-items-end border-top pt-3 mt-3">' +
            '<div class="col-md-2"><label for="addTipoDocumento"class="form-label small">Tipo doc.</label>' +
            '<input id="addTipoDocumento" class="form-control form-control-sm" value="CC" required autocomplete="off"></div>' +
            '<div class="col-md-3"><label for="addNumeroDocumento"class="form-label small">Número doc.</label>' +
            '<input id="addNumeroDocumento" class="form-control form-control-sm" required autocomplete="off"></div>' +
            '<div class="col-md-4"><label for="addNombreCompleto"class="form-label small">Nombre completo</label>' +
            '<input id="addNombreCompleto" class="form-control form-control-sm" required autocomplete="off"></div>' +
            '<div class="col-md-3"><label for="addTipoRelacion"class="form-label small">Relación</label>' +
            '<select id="addTipoRelacion" class="form-select form-select-sm" autocomplete="off">' +
            '<option value="PROPIETARIO">PROPIETARIO</option>' +
            '<option value="RESIDENTE">RESIDENTE</option>' +
            '</select></div>' +
            '<div class="col-md-4"><label for="addCorreo"class="form-label small">Correo</label>' +
            '<input id="addCorreo" type="email" class="form-control form-control-sm" required autocomplete="off"></div>' +
            '<div class="col-md-3"><label for="addTelefono"class="form-label small">Teléfono (opcional)</label>' +
            '<input id="addTelefono" class="form-control form-control-sm" autocomplete="off"></div>' +
            '<div class="col-md-3 d-grid"><button type="submit" class="btn btn-outline-success btn-sm">Agregar</button></div>' +
            '</form>', true) +

          accordionItem('collapse-vehiculos', 'Vehículos', '<ul>' + vehiculos + '</ul>', false) +
          accordionItem('collapse-parqueaderos', 'Parqueaderos', '<ul>' + parqueaderos + '</ul>', false) +
          accordionItem('collapse-mascotas', 'Mascotas', '<ul>' + mascotas + '</ul>', false) +
          accordionItem('collapse-emergencia', 'Contacto de emergencia', '<ul>' + emergencia + '</ul>', false) +
          accordionItem('collapse-cuenta', 'Estado de cuenta', '<p>' + estadoCuenta + '</p>', false) +
          accordionItem('collapse-documentos', 'Documentos PhEnLinea',
            '<div id="docsPhEnLinea" class="row g-3"></div>' +
            '<div id="docsPhEnLineaError" class="alert alert-danger hidden mb-0"></div>', false) +
          '</div>';
      }

      var documentosPhEnLinea = {};
      var TIPOS_DOCUMENTOS_PHENLINEA = [
        { id: 'cuenta-cobro', label: 'Cuenta de Cobro', icono: 'bi-receipt' },
        { id: 'estado-cuenta', label: 'Estado de Cuenta', icono: 'bi-file-earmark' },
        { id: 'recibo', label: 'Recibo', icono: 'bi-file-pdf' },
        { id: 'certificado', label: 'Certificado', icono: 'bi-award' },
        { id: 'paz-y-salvo', label: 'Paz y Salvo', icono: 'bi-check-circle' },
      ];

      $('profile').addEventListener('click', function (event) {
        var button = event.target.closest('[data-bs-target="#collapse-documentos"]');
        if (button && !documentosPhEnLinea[currentUnidadId]) {
          renderBotonesDocumentosAdmin(currentUnidadId);
        }
      });

      function renderBotonesDocumentosAdmin(unidadId) {
        var container = $('docsPhEnLinea');
        $('docsPhEnLineaError').classList.add('hidden');
        container.innerHTML = TIPOS_DOCUMENTOS_PHENLINEA.map(function (tipo) {
          var icon = '<i class="bi ' + esc(tipo.icono) + ' me-2"></i>';
          return '<div class="col-md-6 col-lg-4">' +
            '<div class="card border-0 h-100" style="box-shadow:0 2px 8px rgba(0,0,0,0.08)">' +
            '<div class="card-body d-flex flex-column">' +
            '<h6 class="card-title mb-3" style="color:var(--p);font-weight:700">' + esc(tipo.label) + '</h6>' +
            '<p class="card-text small text-muted mb-3 flex-grow-1">Período actual de facturación</p>' +
            '<button type="button" class="btn btn-primary btn-sm mt-auto btn-descargar-phenlinea" data-doc-tipo="' + esc(tipo.id) + '" data-unidad-id="' + esc(unidadId) + '">' +
            icon + 'Descargar</button>' +
            '</div>' +
            '</div>' +
            '</div>';
        }).join('');
        documentosPhEnLinea[unidadId] = true;
      }

      $('profile').addEventListener('click', function (event) {
        var button = event.target.closest('.btn-descargar-phenlinea');
        if (button) {
          descargarDocumentoAdmin(button);
        }
      });

      function descargarDocumentoAdmin(button) {
        var docTipo = button.dataset.docTipo;
        var unidadId = button.dataset.unidadId;
        var tipoInfo = TIPOS_DOCUMENTOS_PHENLINEA.find(function (t) { return t.id === docTipo; });
        if (!tipoInfo) return;

        var ventana = window.open('', '_blank');
        button.disabled = true;
        button.dataset.old = button.innerHTML;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Descargando…';

        var endpoint = docTipo === 'cuenta-cobro'
          ? '/api/v1/unidades/' + unidadId + '/cuenta-cobro'
          : '/api/v1/unidades/' + unidadId + '/informes/' + docTipo;

        withIdToken(function (idToken) {
          return apiFetch(endpoint, idToken);
        }).then(function (resp) {
          var cuenta = resp.data && resp.data.cuenta;
          var informe = resp.data && resp.data.informe;
          var success = (cuenta && cuenta.success) || (informe && informe.success) || false;
          var url = (cuenta && cuenta.ruta) || (informe && informe.url) || null;

          if (success && url) {
            ventana.location.href = url;
            button.disabled = false;
            button.innerHTML = button.dataset.old;
          } else {
            ventana.close();
            marcarDocumentoNoDisponible(button, tipoInfo);
          }
        }).catch(function (error) {
          ventana.close();
          button.disabled = false;
          button.innerHTML = button.dataset.old;
          $('docsPhEnLineaError').textContent = 'Error al descargar ' + tipoInfo.label + ': ' + esc(error.message);
          $('docsPhEnLineaError').classList.remove('hidden');
        });
      }

      function marcarDocumentoNoDisponible(button, tipoInfo) {
        var icon = '<i class="bi ' + esc(tipoInfo.icono) + ' me-2"></i>';
        button.className = 'btn btn-secondary btn-sm mt-auto btn-descargar-phenlinea';
        button.disabled = true;
        button.dataset.old = undefined;
        button.innerHTML = icon + 'No disponible';
      }

      $('profile').addEventListener('submit', function (event) {
        if (event.target.id === 'editUnidadForm') {
          event.preventDefault();
          hideMsg();

          var payload = {
            estadoUnidad: $('editEstadoUnidad').value,
            fechaEntrega: $('editFechaEntrega').value || undefined
          };

          withIdToken(function (idToken) {
            return apiFetch('/api/v1/unidades/' + currentUnidadId, idToken, { method: 'PATCH', body: payload });
          }).then(function () {
            msg('Unidad actualizada.', 'success');
            loadProfile(currentUnidadId);
            loadDashboard();
          }).catch(function (error) {
            msg(error.message);
          });
        }

        if (event.target.id === 'addPropietarioForm') {
          event.preventDefault();
          hideMsg();

          var button = event.target.querySelector('button[type="submit"]');
          busy(button, true, 'Agregando…');

          var payload = {
            tipoDocumento: $('addTipoDocumento').value.trim(),
            numeroDocumento: $('addNumeroDocumento').value.trim(),
            nombreCompleto: $('addNombreCompleto').value.trim(),
            tipoRelacion: $('addTipoRelacion').value,
            correo: $('addCorreo').value.trim(),
            telefono: $('addTelefono').value.trim() || undefined
          };

          withIdToken(function (idToken) {
            return apiFetch('/api/v1/unidades/' + currentUnidadId + '/propietarios', idToken, { method: 'POST', body: payload });
          }).then(function () {
            msg('Propietario/residente agregado.', 'success');
            loadProfile(currentUnidadId);
            loadDashboard();
          }).catch(function (error) {
            msg(error.message);
          }).finally(function () {
            busy(button, false, 'Agregar');
          });
        }
      });

      $('profile').addEventListener('click', function (event) {
        var editarButton = event.target.closest('.editar-contacto-persona');
        if (editarButton) {
          $('editarContactoForm').dataset.personaId = editarButton.dataset.personaId;
          $('editarContactoNombre').textContent = editarButton.dataset.nombre || '';
          $('editarContactoEmail').value = editarButton.dataset.correo || '';
          $('editarContactoTelefono').value = editarButton.dataset.telefono || '';
          new bootstrap.Modal($('editarContactoModal')).show();
          return;
        }

        var button = event.target.closest('.retirar-propietario');
        if (!button) return;

        if (!confirm('¿Retirar este vínculo?')) return;

        withIdToken(function (idToken) {
          return apiFetch(
            '/api/v1/unidades/' + currentUnidadId + '/propietarios/' + button.dataset.vinculoId,
            idToken,
            { method: 'DELETE' }
          );
        }).then(function () {
          msg('Vínculo retirado.', 'success');
          loadProfile(currentUnidadId);
        }).catch(function (error) {
          msg(error.message);
        });
      });

      $('editarContactoForm').addEventListener('submit', function (event) {
        event.preventDefault();
        hideMsg();

        var correo = $('editarContactoEmail').value.trim();
        if (!correo) {
          msg('Ingresa un correo electrónico.', 'warning');
          return;
        }
        var telefono = $('editarContactoTelefono').value.trim();
        var personaId = this.dataset.personaId;
        var button = $('editarContactoGuardarBtn');
        busy(button, true, 'Guardando…');

        withIdToken(function (idToken) {
          return apiFetch('/api/v1/vigilancia/personas/' + personaId + '/contacto', idToken, {
            method: 'PATCH',
            body: { correo: correo, telefono: telefono || undefined },
          });
        }).then(function () {
          bootstrap.Modal.getInstance($('editarContactoModal')).hide();
          msg('Contacto actualizado.', 'success');
          loadProfile(currentUnidadId);
        }).catch(function (error) {
          msg(error.message);
        }).finally(function () {
          busy(button, false, 'Guardar cambios');
        });
      });

      // ===== FUNCIONES DE RESERVAS =====

      function getEmojiZona(descripcion) {
        var desc = (descripcion || '').toLowerCase();
        if (desc.includes('salón social 1') || desc.includes('salon social 1')) return '🏛️🌇';
        if (desc.includes('salón social 2') || desc.includes('salon social 2')) return '🏛️🏢';
        if (desc.includes('salón social 3') || desc.includes('salon social 3')) return '🏛️💂';
        if (desc.includes('cancha')) return '⚽';
        return '';
      }

      function getEmojiEstado(estado) {
        switch ((estado || '').toUpperCase()) {
          case 'PENDIENTE': return '⏳';
          case 'CONFIRMADA': return '✅';
          case 'RECHAZADA': return '❌';
          case 'CANCELADA': return '⚫';
          default: return '';
        }
      }

      function getNombreDia(fecha) {
        var dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        return dias[fecha.getDay()];
      }

      function fechaBogotaYMD(iso) {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
      }

      var zonasCatalogoCache = [];

      function cargarReservasCatalogo() {
        var catalogoLoading = $('reservasCatalogoLoading');
        if (catalogoLoading) catalogoLoading.classList.remove('hidden');
        return withIdToken(function (idToken) {
          return apiFetch('/api/v1/reservas/catalogo', idToken);
        }).then(function (result) {
          if (catalogoLoading) catalogoLoading.classList.add('hidden');
          zonasCatalogoCache = result.data || [];
          renderReservasCatalogo(zonasCatalogoCache);
          cargarReservasFiltroZonas(zonasCatalogoCache);
        }).catch(function (error) {
          if (catalogoLoading) catalogoLoading.classList.add('hidden');
          msg('Error: ' + error.message);
        });
      }

      function renderReservasCatalogo(zonas) {
        var catalogoLista = $('reservasCatalogoLista');
        if (catalogoLista) {
          catalogoLista.innerHTML = zonas.length ? zonas.map(function (z) {
            var badges = '';
            if (z.requierePago) badges += '<span class="badge bg-warning text-dark me-2">💳 Pago</span>';
            if (z.requiereAprobacion) badges += '<span class="badge bg-info text-dark me-2">✓ Aprobación</span>';
            var costoText = z.costoReserva ? '$' + z.costoReserva.toLocaleString('es-CO') : 'Sin costo';
            var depositoText = z.depositoGarantia ? '$' + z.depositoGarantia.toLocaleString('es-CO') : '—';
            return '<div class="repeat-row"><div class="row"><div class="col-md-5"><strong>' + esc(z.descripcion) + '</strong>' +
              '<div class="small-note">' + esc(z.tipo) + ' | ' + esc(z.horaApertura) + '–' + esc(z.horaCierre) + '</div>' +
              '<div class="small-note">Duración: ' + z.duracionMinHoras + 'h - ' + z.duracionMaxHoras + 'h</div></div>' +
              '<div class="col-md-3"><div class="small-note">Costo: ' + costoText + '</div><div class="small-note">Depósito: ' + depositoText + '</div></div>' +
              '<div class="col-md-4">' + badges + '<button type="button" class="btn btn-outline-primary btn-sm editar-zona" data-id="' + esc(z.id) + '">Editar</button></div></div></div>';
          }).join('') : '<p class="text-muted">No hay zonas registradas.</p>';
        }
      }

      function cargarReservasFiltroZonas(zonas) {
        var select = $('filtroZona');
        if (select) {
          select.innerHTML = '<option value="">Todas</option>' + zonas.map(function (z) {
            return '<option value="' + esc(z.id) + '">' + esc(z.descripcion) + '</option>';
          }).join('');
        }
      }

      $('reservasCatalogoLista').addEventListener('click', function (e) {
        var btn = e.target.closest('.editar-zona');
        if (!btn) return;
        var zonaId = btn.dataset.id;
        var zona = zonasCatalogoCache.find(function (z) { return z.id === zonaId; });
        if (!zona) return;
        zonaEditandoId = zonaId;
        $('editZonaCodigo').value = zona.codigo;
        $('editZonaTipo').value = zona.tipo;
        $('editZonaDescripcion').value = zona.descripcion;
        $('editZonaHoraApertura').value = zona.horaApertura;
        $('editZonaHoraCierre').value = zona.horaCierre;
        $('editZonaDuracionMin').value = zona.duracionMinHoras;
        $('editZonaDuracionMax').value = zona.duracionMaxHoras;
        $('editZonaCosto').value = zona.costoReserva || '';
        $('editZonaDeposito').value = zona.depositoGarantia || '';
        $('editZonaRequierePago').checked = zona.requierePago;
        $('editZonaRequiereAprobacion').checked = zona.requiereAprobacion;
        $('editZonaSoportaRecreativa').checked = zona.soportaModalidadRecreativa;
        $('editZonaActivo').checked = zona.activo;
        if (modalEditarZona) modalEditarZona.show();
      });

      var reservasFrm = $('crearZonaForm');
      if (reservasFrm) reservasFrm.addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = this.querySelector('button[type="submit"]');
        busy(btn, true, 'Creando…');
        withIdToken(function (idToken) {
          return apiFetch('/api/v1/reservas/catalogo', idToken, {
            method: 'POST',
            body: {
              codigo: $('zonaCodigo').value.trim(),
              tipo: $('zonaTipo').value.trim(),
              descripcion: $('zonaDescripcion').value.trim(),
              horaApertura: $('zonaHoraApertura').value,
              horaCierre: $('zonaHoraCierre').value,
              duracionMinHoras: parseInt($('zonaDuracionMin').value) || 1,
              duracionMaxHoras: parseInt($('zonaDuracionMax').value) || 2,
              costoReserva: parseFloat($('zonaCosto').value) || undefined,
              depositoGarantia: parseFloat($('zonaDeposito').value) || undefined,
              requierePago: $('zonaRequierePago').checked,
              requiereAprobacion: $('zonaRequiereAprobacion').checked,
              soportaModalidadRecreativa: $('zonaSoportaRecreativa').checked
            }
          });
        }).then(function () {
          msg('Zona creada', 'success');
          $('crearZonaForm').reset();
          cargarReservasCatalogo();
        }).catch(function (error) { msg(error.message); }).finally(function () { busy(btn, false, 'Crear zona'); });
      });

      var editSubmitBtn = $('editZonaSubmit');
      if (editSubmitBtn) editSubmitBtn.addEventListener('click', function () {
        if (!zonaEditandoId) return;
        hideMsg();
        var btn = this;
        busy(btn, true, 'Guardando…');
        var costoVal = parseFloat($('editZonaCosto').value);
        var depositoVal = parseFloat($('editZonaDeposito').value);
        withIdToken(function (idToken) {
          return apiFetch('/api/v1/reservas/catalogo/' + zonaEditandoId, idToken, {
            method: 'PATCH',
            body: {
              descripcion: $('editZonaDescripcion').value.trim(),
              horaApertura: $('editZonaHoraApertura').value,
              horaCierre: $('editZonaHoraCierre').value,
              duracionMinHoras: parseInt($('editZonaDuracionMin').value) || 1,
              duracionMaxHoras: parseInt($('editZonaDuracionMax').value) || 2,
              costoReserva: isNaN(costoVal) ? undefined : costoVal,
              depositoGarantia: isNaN(depositoVal) ? undefined : depositoVal,
              requierePago: $('editZonaRequierePago').checked,
              requiereAprobacion: $('editZonaRequiereAprobacion').checked,
              soportaModalidadRecreativa: $('editZonaSoportaRecreativa').checked,
              activo: $('editZonaActivo').checked
            }
          });
        }).then(function () {
          msg('Zona actualizada', 'success');
          if (modalEditarZona) modalEditarZona.hide();
          cargarReservasCatalogo();
        }).catch(function (error) { msg(error.message); }).finally(function () { busy(btn, false, 'Guardar cambios'); });
      });

      function cargarReservasAgenda() {
        var agendaLoading = $('agendaLoading');
        var agendaError = $('agendaError');
        var agendaCalendario = $('agendaCalendario');
        var agendaDesde = $('agendaDesde');
        var agendaHasta = $('agendaHasta');

        if (agendaLoading) agendaLoading.classList.remove('hidden');
        if (agendaError) agendaError.classList.add('hidden');
        if (agendaCalendario) agendaCalendario.innerHTML = '';

        var desdeStr = agendaDesde ? agendaDesde.value : '';
        var hastaStr = agendaHasta ? agendaHasta.value : '';

        if (!desdeStr || !hastaStr) {
          initReservasAgendaFechas();
          desdeStr = agendaDesde ? agendaDesde.value : '';
          hastaStr = agendaHasta ? agendaHasta.value : '';
        }

        if (!desdeStr || !hastaStr) {
          if (agendaLoading) agendaLoading.classList.add('hidden');
          if (agendaError) {
            agendaError.textContent = 'Error al inicializar fechas';
            agendaError.classList.remove('hidden');
          }
          return;
        }

        var desde = new Date(desdeStr + 'T00:00:00').toISOString();
        var hasta = new Date(hastaStr + 'T23:59:59').toISOString();

        var queryParams = ['desde=' + encodeURIComponent(desde), 'hasta=' + encodeURIComponent(hasta)];
        var url = '/api/v1/vigilancia/reservas?' + queryParams.join('&');

        withIdToken(function (idToken) {
          return apiFetch(url, idToken);
        }).then(function (result) {
          if (agendaLoading) agendaLoading.classList.add('hidden');
          var reservas = result.data || [];
          renderReservasCalendario(reservas, desdeStr, hastaStr);
        }).catch(function (error) {
          if (agendaLoading) agendaLoading.classList.add('hidden');
          if (agendaError) {
            agendaError.textContent = 'Error: ' + error.message;
            agendaError.classList.remove('hidden');
          }
        });
      }

      function renderReservasCalendario(reservas, desdeStr, hastaStr) {
        var desde = new Date(desdeStr + 'T00:00:00');
        var hasta = new Date(hastaStr + 'T23:59:59');

        var zonas = {};
        reservas.forEach(function (r) {
          var zona = r.zonaComun.descripcion;
          if (!zonas[zona]) zonas[zona] = [];
          zonas[zona].push(r);
        });

        if (Object.keys(zonas).length === 0) {
          $('agendaCalendario').innerHTML = '<p class="text-muted text-center py-4">No hay reservas en este período</p>';
          return;
        }

        var fechas = [];
        var fecha = new Date(desde);
        while (fecha <= hasta) {
          fechas.push(new Date(fecha));
          fecha.setDate(fecha.getDate() + 1);
        }

        var html = '<table class="calendar-table"><thead><tr><th style="min-width:160px;">Zona</th>';
        fechas.forEach(function (f) {
          var num = f.getDate();
          var dia = getNombreDia(f);
          html += '<th class="fecha-header"><span class="fecha-numero">' + num + '</span><span class="fecha-dia">' + dia + '</span></th>';
        });
        html += '</tr></thead><tbody>';

        Object.keys(zonas).sort().forEach(function (zona) {
          var emojiZona = getEmojiZona(zona);
          html += '<tr><td class="zona-nombre">' + emojiZona + ' ' + esc(zona) + '</td>';

          fechas.forEach(function (f) {
            var fechaStr = f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0');
            var reservasDelDia = zonas[zona].filter(function (r) {
              return fechaBogotaYMD(r.fechaHoraInicio) === fechaStr;
            });

            if (reservasDelDia.length === 0) {
              html += '<td class="reserva-vacia"></td>';
            } else {
              html += '<td>' + reservasDelDia.map(function (r) {
                var claseEstado = 'reserva-' + r.estado.toLowerCase();
                var hora = new Date(r.fechaHoraInicio).toLocaleTimeString('es-CO', {timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit'});
                var emojiEstado = getEmojiEstado(r.estado);
                var unidad = esc(r.unidad.codigoOficial);
                var title = unidad + ' ' + hora + ' ' + r.estado;
                return '<div class="reserva-block accion-reserva ' + claseEstado + '" data-id="' + esc(r.id) + '" data-estado="' + esc(r.estado) + '" style="cursor:pointer;" title="' + title + '"><div class="reserva-emoji">' + emojiEstado + '</div><div class="reserva-texto">' + unidad + '<br>' + hora + '</div></div>';
              }).join('') + '</td>';
            }
          });
          html += '</tr>';
        });

        html += '</tbody></table>';
        html += '<div class="calendar-legend">' +
          '<div class="legend-item"><span class="legend-emoji">⏳</span><small>Pendiente</small></div>' +
          '<div class="legend-item"><span class="legend-emoji">✅</span><small>Confirmada</small></div>' +
          '<div class="legend-item"><span class="legend-emoji">❌</span><small>Rechazada</small></div>' +
          '<div class="legend-item"><span class="legend-emoji">⚫</span><small>Cancelada</small></div>' +
          '</div>';

        var agendaCalendario = $('agendaCalendario');
        if (agendaCalendario) agendaCalendario.innerHTML = html;
      }

      function initReservasAgendaFechas() {
        var today = new Date();
        var hasta = new Date(today);
        hasta.setDate(hasta.getDate() + 6);

        var agendaDesde = $('agendaDesde');
        var agendaHasta = $('agendaHasta');
        if (agendaDesde) agendaDesde.value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
        if (agendaHasta) agendaHasta.value = hasta.getFullYear() + '-' + String(hasta.getMonth() + 1).padStart(2, '0') + '-' + String(hasta.getDate()).padStart(2, '0');
      }

      var showReservasCatalogo = $('showReservasCatalogo');
      var showReservasReservar = $('showReservasReservar');
      var showReservasAgenda = $('showReservasAgenda');
      if (showReservasCatalogo) showReservasCatalogo.addEventListener('click', function () { modeReservas('catalogo'); });
      if (showReservasReservar) showReservasReservar.addEventListener('click', function () {
        modeReservas('reservar');
        var catalogoListo = zonasCatalogoCache.length ? Promise.resolve() : cargarReservasCatalogo();
        catalogoListo.then(function () {
          renderReservarZonaOptions();
        });
      });
      if (showReservasAgenda) showReservasAgenda.addEventListener('click', function () {
        modeReservas('agenda');
        var agendaDesdeVal = $('agendaDesde');
        if (!agendaDesdeVal || !agendaDesdeVal.value) {
          initReservasAgendaFechas();
          cargarReservasAgenda();
        }
      });

      var agendaSiete = $('agendaSiete');
      if (agendaSiete) agendaSiete.addEventListener('click', function () {
        initReservasAgendaFechas();
        cargarReservasAgenda();
      });

      var agendaMes = $('agendaMes');
      if (agendaMes) agendaMes.addEventListener('click', function () {
        var today = new Date();
        var monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        var monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        var agendaDesde = $('agendaDesde');
        var agendaHasta = $('agendaHasta');
        if (agendaDesde) agendaDesde.value = monthStart.getFullYear() + '-' + String(monthStart.getMonth() + 1).padStart(2, '0') + '-' + String(monthStart.getDate()).padStart(2, '0');
        if (agendaHasta) agendaHasta.value = monthEnd.getFullYear() + '-' + String(monthEnd.getMonth() + 1).padStart(2, '0') + '-' + String(monthEnd.getDate()).padStart(2, '0');
        cargarReservasAgenda();
      });

      var agendaRefrescar = $('agendaRefrescar');
      if (agendaRefrescar) agendaRefrescar.addEventListener('click', cargarReservasAgenda);

      function modeReservas(name) {
        var es_catalogo = name === 'catalogo';
        var es_reservar = name === 'reservar';
        var es_agenda = name === 'agenda';
        var catalogoView = $('reservasCatalogoView');
        var reservarView = $('reservasReservarView');
        var agendaView = $('reservasAgendaView');
        var showCatalogo = $('showReservasCatalogo');
        var showReservar = $('showReservasReservar');
        var showAgenda = $('showReservasAgenda');
        if (catalogoView) catalogoView.classList.toggle('hidden', !es_catalogo);
        if (reservarView) reservarView.classList.toggle('hidden', !es_reservar);
        if (agendaView) agendaView.classList.toggle('hidden', !es_agenda);
        if (showCatalogo) showCatalogo.classList.toggle('active', es_catalogo);
        if (showReservar) showReservar.classList.toggle('active', es_reservar);
        if (showAgenda) showAgenda.classList.toggle('active', es_agenda);
      }

      // ===== Funciones para el formulario de reserva =====

      function renderReservarZonaOptions() {
        var select = $('reservarZona');
        if (!select) return;
        select.innerHTML = '<option value="">-- Seleccionar zona --</option>' + zonasCatalogoCache.filter(function (z) { return z.activo; }).map(function (z) {
          return '<option value="' + esc(z.id) + '">' + esc(z.descripcion) + ' (' + esc(z.tipo) + ')</option>';
        }).join('');
      }

      function cargarDisponibilidadReservar() {
        var zonaId = $('reservarZona').value;
        var fechaStr = $('reservarFecha').value;

        if (!zonaId || !fechaStr) {
          reservarFranjasCache = [];
          return;
        }

        withIdToken(function (idToken) {
          return apiFetch('/api/v1/reservas/disponibilidad?zonaComunId=' + encodeURIComponent(zonaId) + '&fecha=' + fechaStr, idToken);
        }).then(function (result) {
          reservarFranjasCache = (result.data && result.data.franjas) || [];
          renderReservarHoraInicioOptions();
          limpiarReservarDuracion();
          cargarReservasExistentesDelDia();
        }).catch(function (error) {
          console.error('Error cargando disponibilidad:', error.message);
          reservarFranjasCache = [];
        });
      }

      function cargarDisponibilidadEditarReserva() {
        var zonaId = $('editarReservaZona').value;
        var fechaStr = $('editarReservaFecha').value;

        if (!zonaId || !fechaStr) {
          editarReservaFranjasCache = [];
          return;
        }

        var url = '/api/v1/reservas/disponibilidad?zonaComunId=' + encodeURIComponent(zonaId) + '&fecha=' + fechaStr;
        if (reservaEditandoId) {
          url += '&excluirReservaId=' + encodeURIComponent(reservaEditandoId);
        }

        withIdToken(function (idToken) {
          return apiFetch(url, idToken);
        }).then(function (result) {
          editarReservaFranjasCache = (result.data && result.data.franjas) || [];
          renderEditarReservaHoraInicioOptions();
          limpiarEditarReservaDuracion();
          cargarEditarReservaExistentesDelDia();
        }).catch(function (error) {
          console.error('Error cargando disponibilidad:', error.message);
          editarReservaFranjasCache = [];
        });
      }

      function esDuracionDisponible(horaInicioStr, horas) {
        var franja = reservarFranjasCache.find(function (f) {
          return f.horaInicio === horaInicioStr && f.duracionHoras === horas;
        });
        return !!franja && franja.disponible;
      }

      function onReservarZonaChange() {
        var zonaId = $('reservarZona').value;
        var zona = zonasCatalogoCache.find(function (z) { return z.id === zonaId; });
        var zonaInfo = $('reservarZonaInfo');
        var modalidad = $('reservarModalidad');

        if (!zona) {
          if (zonaInfo) zonaInfo.classList.add('hidden');
          if (modalidad) modalidad.innerHTML = '<option value="ORGANIZADO_CON_INVITADOS">Organizado / con invitados</option>';
          return;
        }

        if (zonaInfo) {
          zonaInfo.classList.remove('hidden');
          $('reservarZonaHorario').textContent = 'Horario: ' + zona.horaApertura + ' - ' + zona.horaCierre;
          $('reservarZonaDuracion').textContent = 'Duración: ' + zona.duracionMinHoras + 'h - ' + zona.duracionMaxHoras + 'h';
          var costText = zona.costoReserva ? '$' + zona.costoReserva : 'Sin costo';
          $('reservarZonaPrecio').textContent = 'Costo: ' + costText;

          var warnings = [];
          if (zona.requiereAprobacion) warnings.push('⚠️ Requiere aprobación — quedará PENDIENTE');
          if (zona.requierePago) warnings.push('⚠️ Requiere pago');
          $('reservarZonaAprobacion').innerHTML = warnings.join(' | ');
        }

        if (modalidad) {
          modalidad.innerHTML = '<option value="ORGANIZADO_CON_INVITADOS">Organizado / con invitados</option>';
          if (zona.soportaModalidadRecreativa) {
            modalidad.innerHTML += '<option value="RECREATIVO_RESIDENTES">Recreativo (residentes)</option>';
          }
        }

        cargarDisponibilidadReservar();
      }

      function renderReservarHoraInicioOptions() {
        var zona = zonasCatalogoCache.find(function (z) { return z.id === $('reservarZona').value; });
        var select = $('reservarHoraInicio');

        if (!zona || !select || reservarFranjasCache.length === 0) {
          select.innerHTML = '<option value="">-- Seleccionar --</option>';
          select.disabled = true;
          return;
        }

        select.innerHTML = '<option value="">-- Seleccionar --</option>';
        var horasUnicas = [];
        reservarFranjasCache.forEach(function (franja) {
          if (franja.disponible && horasUnicas.indexOf(franja.horaInicio) === -1) {
            horasUnicas.push(franja.horaInicio);
          }
        });

        horasUnicas.forEach(function (horaStr) {
          select.innerHTML += '<option value="' + horaStr + '">' + horaStr + '</option>';
        });
        select.disabled = false;
      }

      function renderReservarDuracionOptions() {
        var zona = zonasCatalogoCache.find(function (z) { return z.id === $('reservarZona').value; });
        var horaInicioStr = $('reservarHoraInicio').value;
        var select = $('reservarDuracion');

        if (!zona || !horaInicioStr || !select) {
          select.innerHTML = '<option value="">-- Seleccionar --</option>';
          select.disabled = true;
          return;
        }

        select.innerHTML = '<option value="">-- Seleccionar --</option>';
        var tieneOpciones = false;
        for (var d = zona.duracionMinHoras; d <= zona.duracionMaxHoras; d++) {
          if (esDuracionDisponible(horaInicioStr, d)) {
            select.innerHTML += '<option value="' + d + '">' + d + 'h</option>';
            tieneOpciones = true;
          } else {
            break; // Deja de contar si encuentra un hueco
          }
        }
        select.disabled = !tieneOpciones;
      }

      function limpiarReservarDuracion() {
        var select = $('reservarDuracion');
        if (select) {
          select.innerHTML = '<option value="">-- Seleccionar --</option>';
          select.disabled = true;
        }
        var horaFin = $('reservarHoraFin');
        if (horaFin) horaFin.value = '';
      }

      function actualizarReservarHoraFin() {
        var horaInicioStr = $('reservarHoraInicio').value;
        var duracion = parseInt($('reservarDuracion').value) || 0;
        var horaFin = $('reservarHoraFin');

        if (!horaInicioStr || !duracion || !horaFin) return;

        var [h, m] = horaInicioStr.split(':');
        var horaInicioObj = new Date();
        horaInicioObj.setHours(parseInt(h), parseInt(m), 0);
        horaInicioObj.setHours(horaInicioObj.getHours() + duracion);

        var horaFinStr = String(horaInicioObj.getHours()).padStart(2, '0') + ':' + String(horaInicioObj.getMinutes()).padStart(2, '0');
        horaFin.value = horaFinStr;

        revisarConflictoReservar();
      }

      function cargarReservasExistentesDelDia() {
        var zonaId = $('reservarZona').value;
        var fechaStr = $('reservarFecha').value;

        if (!zonaId || !fechaStr) return;

        var fechaObj = new Date(fechaStr + 'T00:00:00');
        var desdeStr = fechaObj.toISOString();
        var hastaObj = new Date(fechaObj);
        hastaObj.setDate(hastaObj.getDate() + 1);
        var hastaStr = hastaObj.toISOString();

        withIdToken(function (idToken) {
          return apiFetch('/api/v1/reservas/?zonaComunId=' + encodeURIComponent(zonaId) + '&desde=' + encodeURIComponent(desdeStr) + '&hasta=' + encodeURIComponent(hastaStr), idToken);
        }).then(function (result) {
          var reservas = (result.data || []).filter(function (r) { return r.estado !== 'CANCELADA' && r.estado !== 'RECHAZADA'; });
          reservarReservasDelDiaCache = reservas;

          var container = $('reservasReservarExistentes');
          var listDiv = $('reservasReservarExistentesList');

          if (reservas.length === 0) {
            if (container) container.classList.add('hidden');
          } else {
            if (container) container.classList.remove('hidden');
            var listaHTML = reservas.map(function (r) {
              var inicio = new Date(r.fechaHoraInicio).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
              var fin = new Date(r.fechaHoraFin).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
              var unidad = esc(r.unidad.codigoOficial);
              return '<div style="padding: 0.25rem 0; font-size: 0.85rem;">• ' + unidad + ' (' + inicio + ' - ' + fin + ')</div>';
            }).join('');
            if (listDiv) listDiv.innerHTML = listaHTML;
          }

          revisarConflictoReservar();
        }).catch(function (error) {
          console.error('Error cargando reservas:', error.message);
        });
      }

      function revisarConflictoReservar() {
        var horaInicioStr = $('reservarHoraInicio').value;
        var duracion = parseInt($('reservarDuracion').value) || 0;
        var conflictoDiv = $('reservasReservarConflicto');
        var submitBtn = $('reservasReservarSubmit');

        if (!horaInicioStr || !duracion) {
          if (conflictoDiv) conflictoDiv.classList.add('hidden');
          if (submitBtn) submitBtn.disabled = true;
          return;
        }

        var tieneConflicto = !esDuracionDisponible(horaInicioStr, duracion);

        if (tieneConflicto && conflictoDiv) {
          $('reservasReservarConflictoMsg').textContent = 'La zona no tiene disponibilidad continua para esa duración.';
          conflictoDiv.classList.remove('hidden');
        } else if (!tieneConflicto && conflictoDiv) {
          conflictoDiv.classList.add('hidden');
        }

        var fechaStr = $('reservarFecha').value;
        var esValido = reservarUnidadId && $('reservarZona').value && fechaStr && horaInicioStr && !tieneConflicto;
        if (submitBtn) submitBtn.disabled = !esValido;
      }

      // Buscador de unidad para reservar
      var reservarUnidadBuscarBtn = $('reservarUnidadBuscarBtn');
      if (reservarUnidadBuscarBtn) reservarUnidadBuscarBtn.addEventListener('click', function () {
        hideMsg();

        var termino = $('reservarUnidadQuery').value.trim();
        var results = $('reservarUnidadResults');
        if (!termino) return;

        results.textContent = 'Buscando…';

        withIdToken(function (idToken) {
          return apiFetch('/api/v1/unidades/buscar?q=' + encodeURIComponent(termino), idToken);
        }).then(function (body) {
          var resultados = (body.data && body.data.resultados) || [];

          results.innerHTML = resultados.length
            ? resultados.map(function (item) {
                return '<button type="button" class="btn btn-outline-success w-100 text-start mb-2 reservar-unit-result" data-unit-id="' +
                  esc(item.unidad.id) + '" data-unit-code="' + esc(item.unidad.codigoOficial) + '">' +
                  '<strong>' + esc(item.unidad.codigoOficial) + '</strong>' +
                  '<div class="small-note">' + (item.coincidencias ? item.coincidencias.map(function (c) { return esc(c.tipo) + ': ' + esc(c.detalle); }).join(' · ') : '') + '</div>' +
                  '</button>';
              }).join('')
            : '<p class="text-muted mb-0">Sin resultados.</p>';
        }).catch(function (error) {
          results.innerHTML = '<p class="text-danger mb-0">Error: ' + esc(error.message) + '</p>';
        });
      });

      $('reservarUnidadResults').addEventListener('click', function (event) {
        var button = event.target.closest('.reservar-unit-result');
        if (button) {
          reservarUnidadId = button.dataset.unitId;
          var unitCode = button.dataset.unitCode;
          var seleccionadaDiv = $('reservarUnidadSeleccionada');
          var seleccionadaTexto = $('reservarUnidadSeleccionadaTexto');
          if (seleccionadaDiv) seleccionadaDiv.classList.remove('hidden');
          if (seleccionadaTexto) seleccionadaTexto.textContent = unitCode;
          $('reservarUnidadResults').innerHTML = '';
          $('reservarUnidadQuery').value = '';
          revisarConflictoReservar();
        }
      });

      var reservarUnidadCambiar = $('reservarUnidadCambiar');
      if (reservarUnidadCambiar) reservarUnidadCambiar.addEventListener('click', function () {
        reservarUnidadId = null;
        var seleccionadaDiv = $('reservarUnidadSeleccionada');
        if (seleccionadaDiv) seleccionadaDiv.classList.add('hidden');
        $('reservarUnidadQuery').value = '';
        $('reservarUnidadResults').innerHTML = 'Ingresa un término para buscar.';
        revisarConflictoReservar();
      });

      // Event listeners para el formulario de reserva
      var reservarZonaSelect = $('reservarZona');
      if (reservarZonaSelect) {
        reservarZonaSelect.addEventListener('change', onReservarZonaChange);
      }

      var reservarFechaInput = $('reservarFecha');
      if (reservarFechaInput) {
        var today = new Date();
        var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
        reservarFechaInput.min = todayStr;
        reservarFechaInput.addEventListener('change', function () {
          cargarDisponibilidadReservar();
        });
      }

      var reservarHoraInicioSelect = $('reservarHoraInicio');
      if (reservarHoraInicioSelect) {
        reservarHoraInicioSelect.addEventListener('change', function () {
          renderReservarDuracionOptions();
          var horaFin = $('reservarHoraFin');
          if (horaFin) horaFin.value = '';
          revisarConflictoReservar();
        });
      }

      var reservarDuracionSelect = $('reservarDuracion');
      if (reservarDuracionSelect) {
        reservarDuracionSelect.addEventListener('change', actualizarReservarHoraFin);
      }

      // Submit del formulario de reserva
      var reservarForm = $('reservarForm');
      if (reservarForm) {
        reservarForm.addEventListener('submit', function (e) {
          e.preventDefault();
          hideMsg();

          if (!reservarUnidadId) {
            msg('Debes seleccionar una unidad');
            return;
          }

          var zonaId = $('reservarZona').value;
          var modalidad = $('reservarModalidad').value;
          var fechaStr = $('reservarFecha').value;
          var horaInicioStr = $('reservarHoraInicio').value;
          var horaFinStr = $('reservarHoraFin').value;
          var observaciones = $('reservarObservaciones').value.trim();

          if (!zonaId || !fechaStr || !horaInicioStr || !horaFinStr) {
            msg('Faltan campos requeridos');
            return;
          }

          var btn = $('reservasReservarSubmit');
          busy(btn, true, 'Creando…');

          var [h1, m1] = horaInicioStr.split(':');
          var fechaObj = new Date(fechaStr + 'T00:00:00');
          var inicio = new Date(fechaObj);
          inicio.setHours(parseInt(h1), parseInt(m1), 0);
          var duracion = parseInt($('reservarDuracion').value) || 0;
          var fin = new Date(inicio.getTime() + duracion * 3600000);

          var payload = {
            unidadId: reservarUnidadId,
            zonaComunId: zonaId,
            modalidadUso: modalidad,
            fechaHoraInicio: inicio.toISOString(),
            fechaHoraFin: fin.toISOString()
          };
          if (observaciones) payload.observaciones = observaciones;

          withIdToken(function (idToken) {
            return apiFetch('/api/v1/reservas/manual', idToken, { method: 'POST', body: payload });
          }).then(function (result) {
            var estado = result.data.estado;
            var mensajeEstado = estado === 'CONFIRMADA' ? '✓ CONFIRMADA' : '⏳ PENDIENTE (requiere aprobación)';
            msg('Reserva creada — ' + mensajeEstado, 'success');
            $('reservarFecha').value = '';
            $('reservarHoraInicio').value = '';
            $('reservarDuracion').value = '';
            $('reservarHoraFin').value = '';
            $('reservarObservaciones').value = '';
            limpiarReservarDuracion();
            cargarReservasExistentesDelDia();
          }).catch(function (error) {
            msg(error.message);
          }).finally(function () {
            busy(btn, false, 'Crear Reserva');
          });
        });
      }

      // Funciones para editar reserva (duplicadas de "Reservar" para mantener flujos independientes)
      function renderEditarReservaZonaOptions() {
        var select = $('editarReservaZona');
        if (!select) return;
        select.innerHTML = '<option value="">-- Seleccionar zona --</option>' + zonasCatalogoCache.filter(function (z) { return z.activo; }).map(function (z) {
          return '<option value="' + esc(z.id) + '">' + esc(z.descripcion) + ' (' + esc(z.tipo) + ')</option>';
        }).join('');
      }

      function onEditarReservaZonaChange() {
        var zonaId = $('editarReservaZona').value;
        var zona = zonasCatalogoCache.find(function (z) { return z.id === zonaId; });
        var zonaInfo = $('editarReservaZonaInfo');
        var modalidad = $('editarReservaModalidad');

        if (!zona) {
          if (zonaInfo) zonaInfo.classList.add('hidden');
          if (modalidad) modalidad.innerHTML = '<option value="ORGANIZADO_CON_INVITADOS">Organizado / con invitados</option>';
          return;
        }

        if (zonaInfo) {
          zonaInfo.classList.remove('hidden');
          $('editarReservaZonaHorario').textContent = 'Horario: ' + zona.horaApertura + ' - ' + zona.horaCierre;
          $('editarReservaZonaDuracion').textContent = 'Duración: ' + zona.duracionMinHoras + 'h - ' + zona.duracionMaxHoras + 'h';
          var costText = zona.costoReserva ? '$' + zona.costoReserva : 'Sin costo';
          $('editarReservaZonaPrecio').textContent = 'Costo: ' + costText;

          var warnings = [];
          if (zona.requiereAprobacion) warnings.push('⚠️ Requiere aprobación — quedará PENDIENTE');
          if (zona.requierePago) warnings.push('⚠️ Requiere pago');
          $('editarReservaZonaAprobacion').innerHTML = warnings.join(' | ');
        }

        if (modalidad) {
          modalidad.innerHTML = '<option value="ORGANIZADO_CON_INVITADOS">Organizado / con invitados</option>';
          if (zona.soportaModalidadRecreativa) {
            modalidad.innerHTML += '<option value="RECREATIVO_RESIDENTES">Recreativo (residentes)</option>';
          }
        }

        cargarDisponibilidadEditarReserva();
      }

      function renderEditarReservaHoraInicioOptions() {
        var select = $('editarReservaHoraInicio');

        if (!select || editarReservaFranjasCache.length === 0) {
          select.innerHTML = '<option value="">-- Seleccionar --</option>';
          select.disabled = true;
          return;
        }

        select.innerHTML = '<option value="">-- Seleccionar --</option>';
        var horasUnicas = [];
        editarReservaFranjasCache.forEach(function (franja) {
          if (franja.disponible && horasUnicas.indexOf(franja.horaInicio) === -1) {
            horasUnicas.push(franja.horaInicio);
          }
        });

        horasUnicas.forEach(function (horaStr) {
          select.innerHTML += '<option value="' + horaStr + '">' + horaStr + '</option>';
        });
        select.disabled = false;
      }

      function renderEditarReservaDuracionOptions() {
        var zona = zonasCatalogoCache.find(function (z) { return z.id === $('editarReservaZona').value; });
        var horaInicioStr = $('editarReservaHoraInicio').value;
        var select = $('editarReservaDuracion');

        if (!zona || !horaInicioStr || !select) {
          select.innerHTML = '<option value="">-- Seleccionar --</option>';
          select.disabled = true;
          return;
        }

        select.innerHTML = '<option value="">-- Seleccionar --</option>';
        var tieneOpciones = false;
        for (var d = zona.duracionMinHoras; d <= zona.duracionMaxHoras; d++) {
          if (esDuracionDisponibleEditarReserva(horaInicioStr, d)) {
            select.innerHTML += '<option value="' + d + '">' + d + 'h</option>';
            tieneOpciones = true;
          } else {
            break;
          }
        }
        select.disabled = !tieneOpciones;
      }

      function esDuracionDisponibleEditarReserva(horaInicioStr, horas) {
        var franja = editarReservaFranjasCache.find(function (f) {
          return f.horaInicio === horaInicioStr && f.duracionHoras === horas;
        });
        return !!franja && franja.disponible;
      }

      function limpiarEditarReservaDuracion() {
        var select = $('editarReservaDuracion');
        if (select) {
          select.innerHTML = '<option value="">-- Seleccionar --</option>';
          select.disabled = true;
        }
        var horaFin = $('editarReservaHoraFin');
        if (horaFin) horaFin.value = '';
      }

      function actualizarEditarReservaHoraFin() {
        var horaInicioStr = $('editarReservaHoraInicio').value;
        var duracion = parseInt($('editarReservaDuracion').value) || 0;
        var horaFin = $('editarReservaHoraFin');

        if (!horaInicioStr || !duracion || !horaFin) return;

        var [h, m] = horaInicioStr.split(':');
        var horaInicioObj = new Date();
        horaInicioObj.setHours(parseInt(h), parseInt(m), 0);
        horaInicioObj.setHours(horaInicioObj.getHours() + duracion);

        var horaFinStr = String(horaInicioObj.getHours()).padStart(2, '0') + ':' + String(horaInicioObj.getMinutes()).padStart(2, '0');
        horaFin.value = horaFinStr;

        cargarEditarReservaExistentesDelDia();
      }

      function cargarEditarReservaExistentesDelDia() {
        var zonaId = $('editarReservaZona').value;
        var fechaStr = $('editarReservaFecha').value;

        if (!zonaId || !fechaStr) return;

        var fechaObj = new Date(fechaStr + 'T00:00:00');
        var desdeStr = fechaObj.toISOString();
        var hastaObj = new Date(fechaObj);
        hastaObj.setDate(hastaObj.getDate() + 1);
        var hastaStr = hastaObj.toISOString();

        withIdToken(function (idToken) {
          return apiFetch('/api/v1/reservas/?zonaComunId=' + encodeURIComponent(zonaId) + '&desde=' + encodeURIComponent(desdeStr) + '&hasta=' + encodeURIComponent(hastaStr), idToken);
        }).then(function (result) {
          var reservas = (result.data || []).filter(function (r) {
            return (r.estado !== 'CANCELADA' && r.estado !== 'RECHAZADA') && r.id !== reservaEditandoId;
          });
          editarReservaDelDiaCache = reservas;

          var container = $('editarReservasExistentes');
          var listDiv = $('editarReservasExistentesList');

          if (reservas.length === 0) {
            if (container) container.classList.add('hidden');
          } else {
            if (container) container.classList.remove('hidden');
            var listaHTML = reservas.map(function (r) {
              var inicio = new Date(r.fechaHoraInicio).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
              var fin = new Date(r.fechaHoraFin).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
              var unidad = esc(r.unidad.codigoOficial);
              return '<div style="padding: 0.25rem 0; font-size: 0.85rem;">• ' + unidad + ' (' + inicio + ' - ' + fin + ')</div>';
            }).join('');
            if (listDiv) listDiv.innerHTML = listaHTML;
          }

          revisarConflictoEditarReserva();
        }).catch(function (error) {
          console.error('Error cargando reservas:', error.message);
        });
      }

      function revisarConflictoEditarReserva() {
        var horaInicioStr = $('editarReservaHoraInicio').value;
        var duracion = parseInt($('editarReservaDuracion').value) || 0;
        var conflictoDiv = $('editarReservasConflicto');
        var submitBtn = $('editarReservaSubmit');

        if (!horaInicioStr || !duracion) {
          if (conflictoDiv) conflictoDiv.classList.add('hidden');
          if (submitBtn) submitBtn.disabled = true;
          return;
        }

        var tieneConflicto = !esDuracionDisponibleEditarReserva(horaInicioStr, duracion);

        if (tieneConflicto && conflictoDiv) {
          $('editarReservasConflictoMsg').textContent = 'La zona no tiene disponibilidad continua para esa duración.';
          conflictoDiv.classList.remove('hidden');
        } else if (!tieneConflicto && conflictoDiv) {
          conflictoDiv.classList.add('hidden');
        }

        var esValido = $('editarReservaZona').value && $('editarReservaFecha').value && horaInicioStr && duracion && !tieneConflicto;
        if (submitBtn) submitBtn.disabled = !esValido;
      }

      // Event listeners para editar reserva
      var editarReservaZonaSelect = $('editarReservaZona');
      if (editarReservaZonaSelect) {
        editarReservaZonaSelect.addEventListener('change', onEditarReservaZonaChange);
      }

      var editarReservaFechaInput = $('editarReservaFecha');
      if (editarReservaFechaInput) {
        editarReservaFechaInput.addEventListener('change', function () {
          cargarDisponibilidadEditarReserva();
        });
      }

      var editarReservaHoraInicioSelect = $('editarReservaHoraInicio');
      if (editarReservaHoraInicioSelect) {
        editarReservaHoraInicioSelect.addEventListener('change', function () {
          renderEditarReservaDuracionOptions();
          var horaFin = $('editarReservaHoraFin');
          if (horaFin) horaFin.value = '';
          revisarConflictoEditarReserva();
        });
      }

      var editarReservaDuracionSelect = $('editarReservaDuracion');
      if (editarReservaDuracionSelect) {
        editarReservaDuracionSelect.addEventListener('change', actualizarEditarReservaHoraFin);
      }

      // Submit del formulario de editar reserva
      var editarReservaSubmitBtn = $('editarReservaSubmit');
      if (editarReservaSubmitBtn) {
        editarReservaSubmitBtn.addEventListener('click', function () {
          hideMsg();

          var zonaId = $('editarReservaZona').value;
          var modalidad = $('editarReservaModalidad').value;
          var fechaStr = $('editarReservaFecha').value;
          var horaInicioStr = $('editarReservaHoraInicio').value;
          var horaFinStr = $('editarReservaHoraFin').value;
          var observaciones = $('editarReservaObservaciones').value.trim();

          if (!zonaId || !fechaStr || !horaInicioStr || !horaFinStr) {
            msg('Faltan campos requeridos');
            return;
          }

          busy(editarReservaSubmitBtn, true, 'Guardando…');

          var [h1, m1] = horaInicioStr.split(':');
          var fechaObj = new Date(fechaStr + 'T00:00:00');
          var inicio = new Date(fechaObj);
          inicio.setHours(parseInt(h1), parseInt(m1), 0);
          var duracion = parseInt($('editarReservaDuracion').value) || 0;
          var fin = new Date(inicio.getTime() + duracion * 3600000);

          var payload = {
            zonaComunId: zonaId,
            modalidadUso: modalidad,
            fechaHoraInicio: inicio.toISOString(),
            fechaHoraFin: fin.toISOString()
          };
          if (observaciones) payload.observaciones = observaciones;

          withIdToken(function (idToken) {
            return apiFetch('/api/v1/reservas/' + reservaEditandoId, idToken, { method: 'PATCH', body: payload });
          }).then(function () {
            msg('Reserva actualizada', 'success');
            if (reservasModalEditar) reservasModalEditar.hide();
            cargarReservasAgenda();
          }).catch(function (error) {
            msg(error.message);
          }).finally(function () {
            busy(editarReservaSubmitBtn, false, 'Guardar Cambios');
          });
        });
      }

      var reservaActualId = null;
      var reservasModalAcciones = null;
      var reservasModalRechazar = null;
      var reservasModalCancelar = null;
      var reservasModalPago = null;
      var reservasModalEditar = null;
      var modalEditarZona = null;
      var zonaEditandoId = null;
      var modalEditarCasoConvivencia = null;
      var modalAnularCasoConvivencia = null;

      document.addEventListener('DOMContentLoaded', function() {
        var modalAccionesEl = $('reservasModalAcciones');
        var modalRechazarEl = $('reservasModalRechazar');
        var modalCancelarEl = $('reservasModalCancelar');
        var modalPagoEl = $('reservasModalPago');
        var modalEditarReservaEl = $('reservasModalEditar');
        var modalEditarEl = $('modalEditarZona');
        var modalEditarCasoEl = $('modalEditarCasoConvivencia');
        var modalAnularCasoEl = $('modalAnularCasoConvivencia');
        if (modalAccionesEl) reservasModalAcciones = new bootstrap.Modal(modalAccionesEl);
        if (modalRechazarEl) reservasModalRechazar = new bootstrap.Modal(modalRechazarEl);
        if (modalCancelarEl) reservasModalCancelar = new bootstrap.Modal(modalCancelarEl);
        if (modalPagoEl) reservasModalPago = new bootstrap.Modal(modalPagoEl);
        if (modalEditarReservaEl) reservasModalEditar = new bootstrap.Modal(modalEditarReservaEl);
        if (modalEditarEl) modalEditarZona = new bootstrap.Modal(modalEditarEl);
        if (modalEditarCasoEl) modalEditarCasoConvivencia = new bootstrap.Modal(modalEditarCasoEl);
        if (modalAnularCasoEl) modalAnularCasoConvivencia = new bootstrap.Modal(modalAnularCasoEl);
      });

      var accionesPendiente = null;

      function abrirAccionesReserva(id, estado) {
        reservaActualId = id;
        var info = $('reservasAccionesInfo');
        var botones = $('reservasAccionesBotones');
        var html = '';

        if (estado === 'PENDIENTE') {
          info.textContent = 'Esta reserva está pendiente de aprobación.';
          html += '<button type="button" class="btn btn-outline-primary" data-accion="editar">✏️ Editar</button>';
          html += '<button type="button" class="btn btn-success" data-accion="aprobar">✅ Aprobar</button>';
          html += '<button type="button" class="btn btn-danger" data-accion="rechazar">❌ Rechazar</button>';
          html += '<button type="button" class="btn btn-outline-secondary" data-accion="cancelar">⚫ Cancelar</button>';
        } else if (estado === 'CONFIRMADA') {
          info.textContent = 'Esta reserva está confirmada.';
          html += '<button type="button" class="btn btn-outline-primary" data-accion="editar">✏️ Editar</button>';
          html += '<button type="button" class="btn btn-outline-secondary" data-accion="cancelar">⚫ Cancelar</button>';
          html += '<button type="button" class="btn btn-primary" data-accion="pago">💳 Registrar Pago</button>';
        } else {
          info.textContent = 'Esta reserva está ' + estado + '. No hay acciones disponibles.';
        }

        botones.innerHTML = html;
        if (reservasModalAcciones) reservasModalAcciones.show();
      }

      document.addEventListener('click', function (e) {
        var btn = e.target.closest('.accion-reserva');
        if (!btn) return;
        abrirAccionesReserva(btn.dataset.id, btn.dataset.estado);
      });

      var accionesBotonesEl = $('reservasAccionesBotones');
      if (accionesBotonesEl) accionesBotonesEl.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-accion]');
        if (!btn) return;
        var accion = btn.dataset.accion;

        if (accion === 'aprobar') {
          accionesPendiente = null;
          reservasModalAcciones.hide();
          aprobarReservaAdminPanel();
          return;
        }
        if (accion === 'editar') {
          accionesPendiente = function () {
            reservaEditandoId = reservaActualId;
            // Asegura que zonasCatalogoCache esté poblado antes de armar el modal
            var catalogoListo = zonasCatalogoCache.length ? Promise.resolve() : cargarReservasCatalogo();
            catalogoListo.then(function () {
              return withIdToken(function (idToken) {
                return apiFetch('/api/v1/reservas/' + reservaActualId, idToken);
              });
            }).then(function (result) {
              var r = result.data;
              renderEditarReservaZonaOptions();
              $('editarReservaZona').value = r.zonaComun.id;
              $('editarReservaModalidad').value = r.modalidadUso;
              var inicio = new Date(r.fechaHoraInicio);
              $('editarReservaFecha').value = inicio.getFullYear() + '-' + String(inicio.getMonth() + 1).padStart(2, '0') + '-' + String(inicio.getDate()).padStart(2, '0');
              var duracionHoras = Math.round((new Date(r.fechaHoraFin) - inicio) / 3600000);
              // Cargar disponibilidad y esperar a que se complete antes de poblar valores
              return new Promise(function (resolve) {
                cargarDisponibilidadEditarReserva();
                // Pequeño delay para que cargarDisponibilidadEditarReserva complete (async)
                setTimeout(function () {
                  renderEditarReservaHoraInicioOptions();
                  $('editarReservaHoraInicio').value = String(inicio.getHours()).padStart(2, '0') + ':00';
                  renderEditarReservaDuracionOptions();
                  $('editarReservaDuracion').value = String(duracionHoras);
                  actualizarEditarReservaHoraFin();
                  $('editarReservaObservaciones').value = r.observaciones || '';
                  if (reservasModalEditar) reservasModalEditar.show();
                  resolve();
                }, 100);
              });
            }).catch(function (error) { msg(error.message); });
          };
        } else if (accion === 'rechazar') {
          accionesPendiente = function () {
            var m = $('reservasMotivoRechazo'); if (m) m.value = '';
            if (reservasModalRechazar) reservasModalRechazar.show();
          };
        } else if (accion === 'cancelar') {
          accionesPendiente = function () {
            var m = $('reservasMotivoCancelacion'); if (m) m.value = '';
            if (reservasModalCancelar) reservasModalCancelar.show();
          };
        } else if (accion === 'pago') {
          accionesPendiente = function () {
            var ep = $('reservasEstadoPago'); if (ep) ep.value = 'PENDIENTE';
            var fp = $('reservasFechaPago'); if (fp) fp.value = '';
            if (reservasModalPago) reservasModalPago.show();
          };
        }
        reservasModalAcciones.hide();
      });

      var reservasModalAccionesEl = $('reservasModalAcciones');
      if (reservasModalAccionesEl) reservasModalAccionesEl.addEventListener('hidden.bs.modal', function () {
        if (accionesPendiente) {
          var fn = accionesPendiente;
          accionesPendiente = null;
          fn();
        }
      });

      function aprobarReservaAdminPanel() {
        withIdToken(function (idToken) {
          return apiFetch('/api/v1/reservas/' + reservaActualId + '/aprobar', idToken, { method: 'PATCH' });
        }).then(function () {
          msg('Reserva aprobada', 'success');
          cargarReservasAgenda();
        }).catch(function (error) { msg(error.message); });
      }

      var confirmarRechazo = $('reservasConfirmarRechazo');
      if (confirmarRechazo) confirmarRechazo.addEventListener('click', function () {
        var motivo = $('reservasMotivoRechazo').value.trim() || 'Rechazada por administrador';
        withIdToken(function (idToken) {
          return apiFetch('/api/v1/reservas/' + reservaActualId + '/rechazar', idToken, {
            method: 'PATCH',
            body: { motivo: motivo }
          });
        }).then(function () {
          msg('Reserva rechazada', 'success');
          if (reservasModalRechazar) reservasModalRechazar.hide();
          cargarReservasAgenda();
        }).catch(function (error) { msg(error.message); });
      });

      var confirmarCancelacion = $('reservasConfirmarCancelacion');
      if (confirmarCancelacion) confirmarCancelacion.addEventListener('click', function () {
        var motivo = $('reservasMotivoCancelacion').value.trim() || 'Cancelada por administrador';
        withIdToken(function (idToken) {
          return apiFetch('/api/v1/reservas/' + reservaActualId + '/cancelar', idToken, {
            method: 'PATCH',
            body: { motivo: motivo }
          });
        }).then(function () {
          msg('Reserva cancelada', 'success');
          if (reservasModalCancelar) reservasModalCancelar.hide();
          cargarReservasAgenda();
        }).catch(function (error) { msg(error.message); });
      });

      var confirmarPago = $('reservasConfirmarPago');
      if (confirmarPago) confirmarPago.addEventListener('click', function () {
        withIdToken(function (idToken) {
          return apiFetch('/api/v1/reservas/' + reservaActualId + '/pago', idToken, {
            method: 'PATCH',
            body: {
              estadoPago: $('reservasEstadoPago').value,
              fechaPago: $('reservasFechaPago').value ? new Date($('reservasFechaPago').value).toISOString() : undefined
            }
          });
        }).then(function () {
          msg('Pago registrado', 'success');
          if (reservasModalPago) reservasModalPago.hide();
          cargarReservasAgenda();
        }).catch(function (error) { msg(error.message); });
      });

      firebase.auth().onAuthStateChanged(function (user) {
        if (user) {
          panel('app');
          loadDashboard();
        } else {
          panel('login');
        }
      });

      // ===== VISTA ALTERNADA: DASHBOARD vs CONVIVENCIA =====

      function mode(name) {
        var isDashboard = name === 'dashboard';
        var isConvivencia = name === 'convivencia';
        var isReservas = name === 'reservas';
        var isPersonal = name === 'personal';
        var isCasosConvivencia = name === 'casosConvivencia';
        $('dashboardView').classList.toggle('hidden', !isDashboard);
        $('convivenciaView').classList.toggle('hidden', !isConvivencia);
        $('reservasView').classList.toggle('hidden', !isReservas);
        $('personalView').classList.toggle('hidden', !isPersonal);
        $('casosConvivenciaView').classList.toggle('hidden', !isCasosConvivencia);
        $('showDashboard').classList.toggle('active', isDashboard);
        $('showConvivencia').classList.toggle('active', isConvivencia);
        $('showReservas').classList.toggle('active', isReservas);
        $('showPersonal').classList.toggle('active', isPersonal);
        $('showCasosConvivencia').classList.toggle('active', isCasosConvivencia);
      }

      $('showDashboard').addEventListener('click', function () { mode('dashboard'); });
      $('showConvivencia').addEventListener('click', function () { mode('convivencia'); });

      var casosConvivenciaCargados = false;
      $('showCasosConvivencia').addEventListener('click', function () {
        mode('casosConvivencia');
        if (!casosConvivenciaCargados) { cargarCasosConvivencia(); casosConvivenciaCargados = true; }
      });

      var reservasCargada = false;
      $('showReservas').addEventListener('click', function () {
        mode('reservas');
        if (!reservasCargada) {
          cargarReservasAgenda();
          reservasCargada = true;
        }
      });

      var personalCargado = false;
      $('showPersonal').addEventListener('click', function () {
        mode('personal');
        if (!personalCargado) { loadPersonal(); personalCargado = true; }
      });

      // ===== PERSONAL CRUD =====

      function loadPersonal() {
        return withIdToken(function (idToken) {
          var rol = $('personalFiltroRol').value;
          var qs = rol ? ('?rol=' + encodeURIComponent(rol)) : '';
          return apiFetch('/api/v1/personal' + qs, idToken).then(function (resp) {
            renderPersonalTabla(resp.data.colaboradores || resp.data);
          });
        }).catch(function (error) { msg(error.message); });
      }

      function renderPersonalTabla(items) {
        if (!items.length) { $('personalTabla').innerHTML = '<p class="text-muted">Sin registros.</p>'; return; }
        var rows = items.map(function (c) {
          return '<tr>' +
            '<td>' + esc(c.nombreCompleto) + '</td>' +
            '<td>' + esc(c.rol) + '</td>' +
            '<td>' + esc(c.tipoDocumento) + ' ' + esc(c.numeroDocumento) + '</td>' +
            '<td>' + (c.activo ? '<span class="badge bg-success">Activo</span>' : '<span class="badge bg-secondary">Inactivo</span>') + '</td>' +
            '<td class="text-end">' +
            '<button class="btn btn-sm btn-outline-primary personal-editar" data-id="' + esc(c.id) + '">Editar</button> ' +
            '<button class="btn btn-sm btn-outline-danger personal-desactivar" data-id="' + esc(c.id) + '" ' + (c.activo ? '' : 'disabled') + '>Desactivar</button>' +
            '</td></tr>';
        }).join('');
        $('personalTabla').innerHTML = '<table class="table table-sm"><thead><tr><th>Nombre</th><th>Rol</th><th>Documento</th><th>Estado</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
      }

      $('personalFiltroRol').addEventListener('change', loadPersonal);

      $('personalForm').addEventListener('submit', function (event) {
        event.preventDefault();
        hideMsg();
        var id = $('personalId').value;
        var payload = {
          tipoDocumento: $('personalTipoDocumento').value.trim(),
          numeroDocumento: $('personalNumeroDocumento').value.trim(),
          nombreCompleto: $('personalNombreCompleto').value.trim(),
          rol: $('personalRol').value,
          correo: $('personalCorreo').value.trim() || undefined,
          telefono: $('personalTelefono').value.trim() || undefined
        };
        var button = event.target.querySelector('button[type="submit"]');
        busy(button, true, 'Guardando…');
        withIdToken(function (idToken) {
          return id
            ? apiFetch('/api/v1/personal/' + id, idToken, { method: 'PATCH', body: payload })
            : apiFetch('/api/v1/personal', idToken, { method: 'POST', body: payload });
        }).then(function () {
          msg('Personal guardado.', 'success');
          $('personalForm').reset();
          $('personalId').value = '';
          $('personalCancelarEdicion').classList.add('hidden');
          loadPersonal();
        }).catch(function (error) { msg(error.message); })
          .finally(function () { busy(button, false, 'Guardar'); });
      });

      $('personalTabla').addEventListener('click', function (event) {
        var editBtn = event.target.closest('.personal-editar');
        if (editBtn) { cargarPersonalEnFormulario(editBtn.dataset.id); return; }
        var delBtn = event.target.closest('.personal-desactivar');
        if (delBtn) {
          if (!confirm('¿Desactivar este miembro del personal?')) return;
          var button = delBtn;
          busy(button, true, 'Desactivando…');
          withIdToken(function (idToken) {
            return apiFetch('/api/v1/personal/' + delBtn.dataset.id, idToken, { method: 'DELETE' });
          }).then(function () { msg('Personal desactivado.', 'success'); loadPersonal(); })
            .catch(function (error) { msg(error.message); })
            .finally(function () { busy(button, false, 'Desactivar'); });
        }
      });

      function cargarPersonalEnFormulario(id) {
        withIdToken(function (idToken) {
          return apiFetch('/api/v1/personal/' + id, idToken);
        }).then(function (resp) {
          var c = resp.data;
          $('personalId').value = c.id;
          $('personalTipoDocumento').value = c.tipoDocumento;
          $('personalNumeroDocumento').value = c.numeroDocumento;
          $('personalNombreCompleto').value = c.nombreCompleto;
          $('personalRol').value = c.rol;
          $('personalCorreo').value = c.correo || '';
          $('personalTelefono').value = c.telefono || '';
          $('personalCancelarEdicion').classList.remove('hidden');
        }).catch(function (error) { msg(error.message); });
      }

      $('personalCancelarEdicion').addEventListener('click', function () {
        $('personalForm').reset();
        $('personalId').value = '';
        this.classList.add('hidden');
      });

      // ===== CASOS DE CONVIVENCIA =====

      var CASOS_CONVIVENCIA_LIMIT = 20;
      var casosConvivenciaOffset = 0;
      var casosConvivenciaAcumulados = [];
      var casoConvivenciaActual = null;

      function obtenerBadgeEstadoCaso(estado) {
        var badges = {
          PENDIENTE_DESCARGOS: '<span class="badge bg-warning text-dark">Pendiente de descargos</span>',
          CON_DESCARGOS: '<span class="badge bg-info text-dark">Descargos recibidos</span>',
          PENDIENTE_APROBACION_CONSEJO: '<span class="badge bg-warning text-dark">Pendiente Consejo</span>',
          SANCION_APROBADA: '<span class="badge bg-dark">Sanción aprobada</span>',
          EN_APELACION: '<span class="badge bg-warning text-dark">En apelación</span>',
          CERRADO_SIN_SANCION: '<span class="badge bg-success">Cerrado sin sanción</span>',
          SANCION_RATIFICADA: '<span class="badge bg-dark">Sanción ratificada</span>',
          SANCION_REVOCADA: '<span class="badge bg-success">Sanción revocada</span>',
          ARCHIVADO: '<span class="badge bg-secondary">Archivado</span>',
          ANULADO: '<span class="badge bg-danger">Anulado</span>'
        };
        return badges[estado] || '<span class="badge bg-secondary">' + esc(estado) + '</span>';
      }

      function formatearMoneda(valor) {
        return Number(valor || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
      }

      function cargarCasosConvivencia(reset) {
        if (reset !== false) casosConvivenciaOffset = 0;
        var seleccion = $('casosConvivenciaFiltroEstado').value;
        var estados = seleccion === 'EN_TRAMITE'
          ? ['PENDIENTE_DESCARGOS', 'CON_DESCARGOS']
          : (seleccion ? [seleccion] : []);
        var qs = '?limit=' + CASOS_CONVIVENCIA_LIMIT + '&offset=' + casosConvivenciaOffset +
          estados.map(function (e) { return '&estado=' + encodeURIComponent(e); }).join('');

        withIdToken(function (idToken) {
          return apiFetch('/api/v1/convivencia/casos' + qs, idToken).then(function (resp) {
            var items = resp.data || [];
            renderCasosConvivenciaTabla(items, casosConvivenciaOffset === 0);
            $('casosConvivenciaCargarMasBtn').classList.toggle('hidden', items.length < CASOS_CONVIVENCIA_LIMIT);
          });
        }).catch(function (error) { msg(error.message); });
      }

      function renderCasosConvivenciaTabla(items, reset) {
        if (reset) casosConvivenciaAcumulados = [];
        casosConvivenciaAcumulados = casosConvivenciaAcumulados.concat(items);

        if (!casosConvivenciaAcumulados.length) {
          $('casosConvivenciaTabla').innerHTML = '<p class="text-muted">Sin casos registrados.</p>';
          return;
        }

        $('casosConvivenciaTabla').innerHTML = casosConvivenciaAcumulados.map(function (caso) {
          return '<div class="border-bottom py-2 d-flex justify-content-between align-items-center caso-convivencia-item" ' +
            'data-id="' + esc(caso.id) + '" style="cursor:pointer">' +
            '<div><strong>' + esc(caso.apartamento) + '</strong> · ' + esc(caso.motivo) +
            '<br><small class="text-muted">' + esc(caso.caseCode) + ' · ' + esc(caso.fechaCreacion) + '</small></div>' +
            '<div>' + obtenerBadgeEstadoCaso(caso.estado) +
            (caso.tieneDescargos ? ' <span class="badge bg-info text-dark ms-1">Con descargos</span>' : '') +
            '</div></div>';
        }).join('');
      }

      $('casosConvivenciaFiltroEstado').addEventListener('change', function () { cargarCasosConvivencia(true); });

      $('casosConvivenciaCargarMasBtn').addEventListener('click', function () {
        casosConvivenciaOffset += CASOS_CONVIVENCIA_LIMIT;
        cargarCasosConvivencia(false);
      });

      $('casosConvivenciaTabla').addEventListener('click', function (event) {
        var item = event.target.closest('.caso-convivencia-item');
        if (item) verDetalleCasoConvivencia(item.dataset.id);
      });

      function buildCasoEvidenceThumb(url, label) {
        var match = /\/file\/d\/([^/]+)/.exec(url || '');
        var thumbUrl = match ? ('https://drive.google.com/thumbnail?id=' + encodeURIComponent(match[1]) + '&sz=w300') : url;
        return '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(label) + '">' +
          '<img src="' + esc(thumbUrl) + '" alt="' + esc(label) + '" ' +
          'style="width:96px;height:96px;object-fit:cover;border-radius:8px" ' +
          'onerror="this.style.display=\'none\'">' +
          '</a>';
      }

      function verDetalleCasoConvivencia(id) {
        withIdToken(function (idToken) {
          return apiFetch('/api/v1/convivencia/casos/' + id, idToken).then(function (resp) {
            casoConvivenciaActual = resp.data;
            renderDetalleCasoConvivencia(resp.data);
            $('casosConvivenciaListView').classList.add('hidden');
            $('casosConvivenciaDetailView').classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          });
        }).catch(function (error) { msg(error.message); });
      }

      $('casosConvivenciaVolverBtn').addEventListener('click', function () {
        $('casosConvivenciaDetailView').classList.add('hidden');
        $('casosConvivenciaListView').classList.remove('hidden');
        cargarCasosConvivencia(true);
      });

      $('casoDetailEditarBtn').addEventListener('click', function () {
        if (!casoConvivenciaActual) return;
        $('editCasoId').value = casoConvivenciaActual.caseCode || '';
        $('editCasoApto').value = casoConvivenciaActual.apartamento || '';
        $('editCasoMotivo').value = casoConvivenciaActual.motivo || '';
        $('editCasoDescripcion').value = casoConvivenciaActual.descripcion || '';
        $('editCasoRazon').value = casoConvivenciaActual.razonNotificacion || '';
        $('editCasoNotificador').value = casoConvivenciaActual.notificadorAdmin || '';
        if (modalEditarCasoConvivencia) modalEditarCasoConvivencia.show();
      });

      var editCasoSubmitBtn = $('editCasoConvivenciaSubmit');
      if (editCasoSubmitBtn) editCasoSubmitBtn.addEventListener('click', function () {
        if (!casoConvivenciaActual) return;
        hideMsg();
        var btn = this;
        var motivo = $('editCasoMotivo').value.trim();
        var descripcion = $('editCasoDescripcion').value.trim();
        var razon = $('editCasoRazon').value.trim();
        var notificador = $('editCasoNotificador').value.trim();

        if (!motivo || !descripcion || !razon || !notificador) {
          msg('Todos los campos son requeridos');
          return;
        }

        busy(btn, true, 'Guardando…');
        withIdToken(function (idToken) {
          return apiFetch('/api/v1/convivencia/casos/' + casoConvivenciaActual.id, idToken, {
            method: 'PATCH',
            body: {
              motivo: motivo,
              descripcion: descripcion,
              razonNotificacion: razon,
              notificadorAdmin: notificador
            }
          });
        })
          .then(function (response) {
            return response.json().then(function (data) {
              casoConvivenciaActual = data.data;
              renderDetalleCasoConvivencia(data.data);
              if (modalEditarCasoConvivencia) modalEditarCasoConvivencia.hide();
              msg('Caso actualizado', 'success');
            });
          })
          .catch(function (error) { msg(error.message); })
          .finally(function () { busy(btn, false, 'Guardar cambios'); });
      });

      $('casoDetailAnularBtn').addEventListener('click', function () {
        if (!casoConvivenciaActual) return;
        $('anularCasoMotivo').value = '';
        if (modalAnularCasoConvivencia) modalAnularCasoConvivencia.show();
      });

      var anularCasoSubmitBtn = $('anularCasoConvivenciaSubmit');
      if (anularCasoSubmitBtn) anularCasoSubmitBtn.addEventListener('click', function () {
        if (!casoConvivenciaActual) return;
        hideMsg();
        var btn = this;
        var motivo = $('anularCasoMotivo').value.trim();

        if (!motivo) {
          msg('Debe indicar el motivo de la anulación');
          return;
        }

        if (!confirm('¿Estás seguro de que deseas anular este caso? El caso dejará de contar en el historial de la unidad pero quedará visible aquí.')) {
          return;
        }

        busy(btn, true, 'Anulando…');
        withIdToken(function (idToken) {
          return apiFetch('/api/v1/convivencia/casos/' + casoConvivenciaActual.id + '/anular', idToken, {
            method: 'PATCH',
            body: { motivo: motivo }
          });
        })
          .then(function (response) {
            return response.json().then(function (data) {
              casoConvivenciaActual = data.data;
              renderDetalleCasoConvivencia(data.data);
              if (modalAnularCasoConvivencia) modalAnularCasoConvivencia.hide();
              msg('Caso anulado', 'success');
            });
          })
          .catch(function (error) { msg(error.message); })
          .finally(function () { busy(btn, false, 'Anular caso'); });
      });

      var TIPO_EVENTO_LABELS = {
        CASO_CREADO: 'Caso creado',
        CASO_EDITADO: 'Información del caso editada',
        CASO_ANULADO: 'Caso anulado',
        DESCARGOS_REGISTRADOS: 'Descargos registrados',
        ACTA_COMITE_REGISTRADA: 'Acta de comité registrada',
        CASO_CERRADO_SIN_SANCION: 'Caso cerrado sin sanción',
        CASO_ARCHIVADO: 'Caso archivado',
        SANCION_PROPUESTA: 'Sanción propuesta',
        CONSEJO_APROBO_SANCION: 'Consejo aprobó la sanción',
        CONSEJO_RECHAZO_SANCION: 'Consejo rechazó la sanción',
        CONSEJO_DEVOLVIO_PROPUESTA: 'Consejo devolvió la propuesta',
        APELACION_PRESENTADA: 'Apelación presentada',
        APELACION_RATIFICADA: 'Apelación ratificada',
        APELACION_REVOCADA: 'Apelación revocada'
      };

      function renderHistorialCaso(eventos) {
        if (!eventos || !eventos.length) {
          $('casoDetailHistorial').innerHTML = '<p class="text-muted small mb-0">Sin eventos registrados.</p>';
          return;
        }
        $('casoDetailHistorial').innerHTML = eventos.map(function (evento) {
          var etiqueta = TIPO_EVENTO_LABELS[evento.tipoEvento] || evento.tipoEvento;
          return '<div class="border-start border-3 border-success ps-3 mb-3">' +
            '<div class="small text-muted">' + esc(evento.fechaCreacion) + ' · ' + esc(evento.actorTipo) + '</div>' +
            '<div><strong>' + esc(etiqueta) + '</strong></div>' +
            (evento.descripcion ? '<div class="small mt-1">' + esc(evento.descripcion) + '</div>' : '') +
            '</div>';
        }).join('');
      }

      var ACCION_BLOQUES_CASO = [
        'casoAccionesComite', 'casoAccionesCierre', 'casoAccionesProponerSancion',
        'casoAccionesConsejo', 'casoAccionesApelacion'
      ];

      function actualizarAccionesDisponibles(caso) {
        ACCION_BLOQUES_CASO.forEach(function (id) { $(id).classList.add('hidden'); });

        if (caso.estado === 'PENDIENTE_DESCARGOS' || caso.estado === 'CON_DESCARGOS') {
          $('casoAccionesCierre').classList.remove('hidden');
          if (caso.requiereProcesoFormal) {
            $('casoAccionesProponerSancion').classList.remove('hidden');
            if (caso.estado === 'PENDIENTE_DESCARGOS') {
              $('casoAccionesComite').classList.remove('hidden');
            }
          }
        } else if (caso.estado === 'PENDIENTE_APROBACION_CONSEJO') {
          $('casoAccionesConsejo').classList.remove('hidden');
        } else if (caso.estado === 'EN_APELACION') {
          $('casoAccionesApelacion').classList.remove('hidden');
        }
      }

      function renderDetalleCasoConvivencia(caso) {
        $('casoDetailId').textContent = caso.caseCode;
        $('casoDetailApto').textContent = caso.apartamento;
        $('casoDetailMotivo').textContent = caso.motivo;
        $('casoDetailEstado').innerHTML = obtenerBadgeEstadoCaso(caso.estado);
        $('casoDetailAnularBtn').classList.toggle('hidden', caso.estado === 'ANULADO');
        $('casoDetailTipoProceso').textContent = caso.requiereProcesoFormal
          ? 'Proceso sancionatorio formal'
          : 'Llamado de atención — no requiere proceso formal';
        $('casoDetailSeveridad').textContent = caso.severidad || 'No especificada';
        $('casoDetailCuotas').textContent = Number(caso.sancionEquivalente || 0);
        $('casoDetailNotificador').textContent = caso.notificadorAdmin || '—';
        $('casoDetailFecha').textContent = caso.fechaCreacion || '';
        $('casoDetailDescripcion').textContent = caso.descripcion || '';
        $('casoDetailRazon').textContent = caso.razonNotificacion || '';

        var evidencias = caso.evidencias || [];
        var evidenciasCaso = evidencias.filter(function (e) { return e.contexto === 'CASO'; });
        if (evidenciasCaso.length) {
          $('casoDetailEvidenciasSection').classList.remove('hidden');
          $('casoDetailEvidencias').innerHTML = evidenciasCaso.map(function (e, idx) {
            return buildCasoEvidenceThumb(e.url, 'Evidencia ' + (idx + 1));
          }).join('');
        } else {
          $('casoDetailEvidenciasSection').classList.add('hidden');
          $('casoDetailEvidencias').innerHTML = '';
        }

        if (caso.descargosResidente) {
          $('casoDetailDescargosSection').classList.remove('hidden');
          $('casoDetailFechaDescargos').textContent = 'Recibidos el ' + (caso.fechaDescargos || '');
          $('casoDetailDescargosTexto').textContent = caso.descargosResidente;

          var evidenciasDescargo = evidencias.filter(function (e) { return e.contexto === 'DESCARGO'; });
          if (evidenciasDescargo.length) {
            $('casoDetailEvidenciasDescargosSection').classList.remove('hidden');
            $('casoDetailEvidenciasDescargos').innerHTML = evidenciasDescargo.map(function (e, idx) {
              return buildCasoEvidenceThumb(e.url, 'Evidencia de descargo ' + (idx + 1));
            }).join('');
          } else {
            $('casoDetailEvidenciasDescargosSection').classList.add('hidden');
            $('casoDetailEvidenciasDescargos').innerHTML = '';
          }
        } else {
          $('casoDetailDescargosSection').classList.add('hidden');
        }

        if (caso.actaComiteResumen) {
          $('casoDetailActaComiteSection').classList.remove('hidden');
          $('casoDetailActaComiteFecha').textContent = 'Sesión del ' + (caso.actaComiteFecha || '');
          $('casoDetailActaComiteResumen').textContent = caso.actaComiteResumen;

          var evidenciasActa = evidencias.filter(function (e) { return e.contexto === 'ACTA_COMITE'; });
          if (evidenciasActa.length) {
            $('casoDetailActaComiteEvidenciasSection').classList.remove('hidden');
            $('casoDetailActaComiteEvidencias').innerHTML = evidenciasActa.map(function (e, idx) {
              return buildCasoEvidenceThumb(e.url, 'Anexo ' + (idx + 1));
            }).join('');
          } else {
            $('casoDetailActaComiteEvidenciasSection').classList.add('hidden');
            $('casoDetailActaComiteEvidencias').innerHTML = '';
          }
        } else {
          $('casoDetailActaComiteSection').classList.add('hidden');
        }

        if (caso.sancionPropuestaTipo) {
          $('casoDetailSancionPropuestaSection').classList.remove('hidden');
          $('casoDetailSancionPropuestaTipo').textContent = caso.sancionPropuestaTipo;
          $('casoDetailSancionPropuestaValor').textContent = formatearMoneda(caso.sancionPropuestaValor);
          $('casoDetailSancionPropuestaJustificacion').textContent = caso.sancionPropuestaJustificacion || '';
        } else {
          $('casoDetailSancionPropuestaSection').classList.add('hidden');
        }

        if (caso.sancion) {
          $('casoDetailSancionSection').classList.remove('hidden');
          $('casoDetailSancionTipo').textContent = caso.sancion.tipoSancion || '';
          $('casoDetailSancionValor').textContent = formatearMoneda(caso.sancion.valor);
          $('casoDetailSancionEstado').textContent = caso.sancion.estado || '';
          $('casoDetailSancionFecha').textContent = caso.sancion.fechaImposicion || '';
        } else {
          $('casoDetailSancionSection').classList.add('hidden');
        }

        if (caso.apelacionTexto) {
          $('casoDetailApelacionSection').classList.remove('hidden');
          $('casoDetailApelacionFecha').textContent = 'Presentada el ' + (caso.fechaApelacion || '');
          $('casoDetailApelacionTexto').textContent = caso.apelacionTexto;

          var evidenciasApelacion = evidencias.filter(function (e) { return e.contexto === 'APELACION'; });
          if (evidenciasApelacion.length) {
            $('casoDetailEvidenciasApelacionSection').classList.remove('hidden');
            $('casoDetailEvidenciasApelacion').innerHTML = evidenciasApelacion.map(function (e, idx) {
              return buildCasoEvidenceThumb(e.url, 'Evidencia apelación ' + (idx + 1));
            }).join('');
          } else {
            $('casoDetailEvidenciasApelacionSection').classList.add('hidden');
            $('casoDetailEvidenciasApelacion').innerHTML = '';
          }
        } else {
          $('casoDetailApelacionSection').classList.add('hidden');
        }

        renderHistorialCaso(caso.eventos);
        actualizarAccionesDisponibles(caso);

        $('casoCierreEstado').value = 'CERRADO_SIN_SANCION';
        $('casoCierreResolucion').value = '';
        $('casoCierreNotas').value = '';
        $('casoActaComiteForm').reset();
        $('casoActaComiteEvidenciaEstado').textContent = '';
        $('casoProponerSancionForm').reset();
        $('casoConsejoForm').reset();
        $('casoApelacionResolverForm').reset();
      }

      function leerArchivoComoDataUrl(file) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onerror = function () { reject(new Error('No fue posible leer el archivo "' + file.name + '".')); };
          reader.onload = function () { resolve(reader.result); };
          reader.readAsDataURL(file);
        });
      }

      function subirEvidenciasConvivencia(files, idToken, contexto, caseCode, apartamento) {
        var urls = [];
        var subirSiguiente = function (i) {
          if (i >= files.length) return Promise.resolve(urls);
          return leerArchivoComoDataUrl(files[i]).then(function (dataUrl) {
            return apiFetch('/api/v1/convivencia/evidencias', idToken, {
              method: 'POST',
              body: { mimeType: files[i].type, dataUrl: dataUrl, contexto: contexto, caseId: caseCode, apartamento: apartamento }
            });
          }).then(function (resp) {
            urls.push(resp.data.url);
            return subirSiguiente(i + 1);
          });
        };
        return subirSiguiente(0);
      }

      $('casoActaComiteForm').addEventListener('submit', function (event) {
        event.preventDefault();
        hideMsg();
        if (!casoConvivenciaActual) return;

        var fecha = $('casoActaComiteFecha').value;
        var resumen = $('casoActaComiteResumen').value.trim();
        if (!fecha || resumen.length < 20) {
          msg('La fecha y un resumen de al menos 20 caracteres son requeridos.');
          return;
        }

        var files = Array.prototype.slice.call($('casoActaComiteEvidenciaInput').files || []);
        var estadoEl = $('casoActaComiteEvidenciaEstado');
        var button = event.target.querySelector('button[type="submit"]');
        busy(button, true, 'Guardando…');

        withIdToken(function (idToken) {
          var subida = Promise.resolve([]);
          if (files.length) {
            estadoEl.textContent = 'Subiendo ' + files.length + ' archivo(s)…';
            subida = subirEvidenciasConvivencia(files, idToken, 'acta_comite', casoConvivenciaActual.caseCode, casoConvivenciaActual.apartamento);
          }
          return subida.then(function (urls) {
            estadoEl.textContent = '';
            return apiFetch('/api/v1/convivencia/casos/' + casoConvivenciaActual.id + '/acta-comite', idToken, {
              method: 'POST',
              body: { fecha: fecha, resumen: resumen, evidencias: urls }
            });
          });
        }).then(function (resp) {
          casoConvivenciaActual = resp.data;
          renderDetalleCasoConvivencia(resp.data);
          msg('Acta de comité registrada.', 'success');
        }).catch(function (error) {
          estadoEl.textContent = '';
          msg(error.message);
        }).finally(function () { busy(button, false, 'Registrar acta'); });
      });

      $('casoCierreForm').addEventListener('submit', function (event) {
        event.preventDefault();
        hideMsg();
        if (!casoConvivenciaActual) return;

        var estado = $('casoCierreEstado').value;
        var resolucion = $('casoCierreResolucion').value.trim();
        if (estado === 'CERRADO_SIN_SANCION' && !resolucion) {
          msg('La resolución es requerida para cerrar el caso sin sanción.');
          return;
        }

        var button = event.target.querySelector('button[type="submit"]');
        busy(button, true, 'Guardando…');

        withIdToken(function (idToken) {
          return apiFetch('/api/v1/convivencia/casos/' + casoConvivenciaActual.id + '/estado', idToken, {
            method: 'PATCH',
            body: {
              estado: estado,
              resolucion: resolucion || undefined,
              notasAdmin: $('casoCierreNotas').value.trim() || undefined
            }
          });
        }).then(function (resp) {
          casoConvivenciaActual = resp.data;
          renderDetalleCasoConvivencia(resp.data);
          msg('Caso actualizado.', 'success');
        }).catch(function (error) { msg(error.message); })
          .finally(function () { busy(button, false, 'Guardar'); });
      });

      $('casoProponerSancionForm').addEventListener('submit', function (event) {
        event.preventDefault();
        hideMsg();
        if (!casoConvivenciaActual) return;

        var tipo = $('casoProponerSancionTipo').value.trim();
        var valor = Number($('casoProponerSancionValor').value);
        var justificacion = $('casoProponerSancionJustificacion').value.trim();
        if (!tipo || !valor || valor <= 0 || justificacion.length < 20) {
          msg('Completa tipo, valor y una justificación de al menos 20 caracteres.');
          return;
        }

        var button = event.target.querySelector('button[type="submit"]');
        busy(button, true, 'Enviando…');

        withIdToken(function (idToken) {
          return apiFetch('/api/v1/convivencia/casos/' + casoConvivenciaActual.id + '/proponer-sancion', idToken, {
            method: 'PATCH',
            body: { tipoSancion: tipo, valorPropuesto: valor, justificacion: justificacion }
          });
        }).then(function (resp) {
          casoConvivenciaActual = resp.data;
          renderDetalleCasoConvivencia(resp.data);
          msg('Propuesta enviada al Consejo.', 'success');
        }).catch(function (error) { msg(error.message); })
          .finally(function () { busy(button, false, 'Enviar al Consejo'); });
      });

      var ENDPOINT_POR_ACCION_CONSEJO = {
        aprobar: 'consejo-aprobar',
        rechazar: 'consejo-rechazar',
        devolver: 'consejo-devolver'
      };

      $('casoConsejoForm').addEventListener('submit', function (event) {
        event.preventDefault();
        hideMsg();
        if (!casoConvivenciaActual) return;

        var accion = (event.submitter && event.submitter.dataset.accion) || 'aprobar';
        var ruta = ENDPOINT_POR_ACCION_CONSEJO[accion];
        var resolucion = $('casoConsejoResolucion').value.trim();
        if (!resolucion) {
          msg('La resolución es requerida.');
          return;
        }

        var button = event.submitter;
        busy(button, true, 'Guardando…');

        withIdToken(function (idToken) {
          return apiFetch('/api/v1/convivencia/casos/' + casoConvivenciaActual.id + '/' + ruta, idToken, {
            method: 'PATCH',
            body: { resolucion: resolucion, notasAdmin: $('casoConsejoNotas').value.trim() || undefined }
          });
        }).then(function (resp) {
          casoConvivenciaActual = resp.data;
          renderDetalleCasoConvivencia(resp.data);
          msg('Decisión del Consejo registrada.', 'success');
        }).catch(function (error) { msg(error.message); })
          .finally(function () { busy(button, false, 'Guardar'); });
      });

      var ENDPOINT_POR_ACCION_APELACION = {
        ratificar: 'apelacion-ratificar',
        revocar: 'apelacion-revocar'
      };

      $('casoApelacionResolverForm').addEventListener('submit', function (event) {
        event.preventDefault();
        hideMsg();
        if (!casoConvivenciaActual) return;

        var accion = (event.submitter && event.submitter.dataset.accion) || 'ratificar';
        var ruta = ENDPOINT_POR_ACCION_APELACION[accion];
        var resolucion = $('casoApelacionResolverResolucion').value.trim();
        if (!resolucion) {
          msg('La resolución es requerida.');
          return;
        }

        var button = event.submitter;
        busy(button, true, 'Guardando…');

        withIdToken(function (idToken) {
          return apiFetch('/api/v1/convivencia/casos/' + casoConvivenciaActual.id + '/' + ruta, idToken, {
            method: 'PATCH',
            body: { resolucion: resolucion, notasAdmin: $('casoApelacionResolverNotas').value.trim() || undefined }
          });
        }).then(function (resp) {
          casoConvivenciaActual = resp.data;
          renderDetalleCasoConvivencia(resp.data);
          msg('Apelación resuelta.', 'success');
        }).catch(function (error) { msg(error.message); })
          .finally(function () { busy(button, false, 'Guardar'); });
      });

      // ===== IMPORTACIÓN DE CARTERA =====
      
      var modalImportarCartera = null;
      
      // Inicializar modal cuando el DOM esté listo
      document.addEventListener('DOMContentLoaded', function() {
        modalImportarCartera = new bootstrap.Modal($('modalImportarCartera'));
      });

      $('btnImportarCartera').addEventListener('click', function () {
        if (!modalImportarCartera) {
          modalImportarCartera = new bootstrap.Modal($('modalImportarCartera'));
        }
        // Limpiar formulario y mensajes
        $('formImportarCartera').reset();
        $('importResult').classList.add('hidden');
        $('progressBar').classList.add('hidden');
        modalImportarCartera.show();
      });

      $('formImportarCartera').addEventListener('submit', function (event) {
        event.preventDefault();
        
        var fileInput = $('archivoCartera');
        var file = fileInput.files[0];
        
        if (!file) {
          showImportMsg('Por favor selecciona un archivo', 'danger');
          return;
        }

        // Validar extensión
        var extension = file.name.split('.').pop().toLowerCase();
        if (extension !== 'xls' && extension !== 'xlsx') {
          showImportMsg('El archivo debe ser .xls o .xlsx', 'danger');
          return;
        }

        // Mostrar progress bar
        $('progressBar').classList.remove('hidden');
        $('importResult').classList.add('hidden');
        var submitBtn = $('btnSubirCartera');
        busy(submitBtn, true, 'Procesando...');

        // Crear FormData
        var formData = new FormData();
        formData.append('archivo', file);

        // Enviar archivo al API
        withIdToken(function (idToken) {
          return fetch(API_BASE + '/api/v1/cartera/importar', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + idToken
            },
            body: formData
          }).then(function (response) {
            return response.json().then(function (body) {
              if (!response.ok) {
                throw new Error(body.error && body.error.message || 'Error al importar');
              }
              return body;
            });
          });
        }).then(function (body) {
          var data = body.data;
          var mensaje = '<strong>Importación exitosa</strong><br>' +
            '✅ Actualizados: ' + data.actualizados + '<br>' +
            '📊 Procesados: ' + data.procesados;

          if (data.noEncontrados && data.noEncontrados.length > 0) {
            var noEncontradosStrings = data.noEncontrados.slice(0, 5).map(function(item) {
              return item.codigo + ' (fila ' + item.fila + ')';
            });
            mensaje += '<br>⚠️ No encontrados: ' + noEncontradosStrings.join(', ');
            if (data.noEncontrados.length > 5) {
              mensaje += ' y ' + (data.noEncontrados.length - 5) + ' más';
            }
          }

          if (data.errores && data.errores.length > 0) {
            var erroresStrings = data.errores.slice(0, 3).map(function(err) {
              return 'Fila ' + err.fila + ' (' + err.codigo + '): ' + err.error;
            });
            mensaje += '<br>❌ Errores:<br>' + erroresStrings.join('<br>');
            if (data.errores.length > 3) {
              mensaje += '<br>... y ' + (data.errores.length - 3) + ' más';
            }
          }

          showImportMsg(mensaje, data.errores && data.errores.length > 0 ? 'warning' : 'success');
          
          // Recargar dashboard si hubo cambios
          if (data.actualizados > 0) {
            loadDashboard();
          }
        }).catch(function (error) {
          showImportMsg('Error: ' + error.message, 'danger');
        }).finally(function () {
          $('progressBar').classList.add('hidden');
          busy(submitBtn, false, 'Subir e Importar');
        });
      });

      function showImportMsg(html, type) {
        var alertBox = $('importResult');
        alertBox.className = 'alert alert-' + (type || 'info');
        alertBox.innerHTML = html;
        alertBox.classList.remove('hidden');
      }

  // ===== MODULE REGISTRATION SYSTEM =====
  var modulos = [];

  function registrarModulo(config) {
    modulos.push(config);
    var boton = $(config.buttonId);
    if (boton) {
      boton.addEventListener('click', function () {
        mode(config.id);
        if (config.onFirstShow && !config._cargado) {
          config._cargado = true;
          config.onFirstShow();
        }
      });
    }
  }

  function mode(name) {
    modulos.forEach(function (m) {
      var activo = m.id === name;
      $(m.viewId).classList.toggle('hidden', !activo);
      $(m.buttonId).classList.toggle('active', activo);
    });
  }

  // Export all shared helpers and state to AdminDatos namespace
  AdminDatos.$ = $;
  AdminDatos.esc = esc;
  AdminDatos.msg = msg;
  AdminDatos.hideMsg = hideMsg;
  AdminDatos.panel = panel;
  AdminDatos.busy = busy;
  AdminDatos.apiFetch = apiFetch;
  AdminDatos.withIdToken = withIdToken;
  AdminDatos.registrarModulo = registrarModulo;
  AdminDatos.mode = mode;
  AdminDatos.loadDashboard = loadDashboard;

  // Shared state object
  AdminDatos.state = {
    currentUnidadId: null,
    reservarUnidadId: null,
    reservarReservasDelDiaCache: [],
    reservarFranjasCache: [],
    editarReservaDelDiaCache: [],
    editarReservaFranjasCache: [],
    reservaEditandoId: null
  };

  // Register 'convivencia' hardcoded (no separate file, lives in convivencia-form.js)
  registrarModulo({
    id: 'convivencia',
    buttonId: 'showConvivencia',
    viewId: 'convivenciaView'
  });

}());
