(function () {
  if (window.AdminDatos && window.AdminDatos.registrarModulo) {
    window.AdminDatos.registrarModulo({
      id: 'casosConvivencia',
      buttonId: 'showCasosConvivencia',
      viewId: 'casosConvivenciaView',
      onFirstShow: window.AdminDatos.cargarCasosConvivencia
    });
  }
}());
