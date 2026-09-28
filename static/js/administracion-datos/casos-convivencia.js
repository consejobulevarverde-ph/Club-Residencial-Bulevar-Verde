(function () {
  // La vista vive en static/js/convivencia-casos.js (compartida con el Comité de Convivencia);
  // aquí solo se le da el token de Firebase del administrador y se registra el tab.
  window.CONVIVENCIA_CASOS_CONFIG = window.CONVIVENCIA_CASOS_CONFIG || {};
  window.CONVIVENCIA_CASOS_CONFIG.obtenerToken = function () {
    var user = window.firebase && firebase.auth().currentUser;
    if (!user) return Promise.reject(new Error('No hay sesión activa. Por favor, inicia sesión nuevamente.'));
    return user.getIdToken();
  };

  if (window.AdminDatos && window.AdminDatos.registrarModulo) {
    window.AdminDatos.registrarModulo({
      id: 'casosConvivencia',
      buttonId: 'showCasosConvivencia',
      viewId: 'casosConvivenciaView',
      onFirstShow: function () { window.BVConvivenciaCasos.mostrar(); }
    });
  }
}());
