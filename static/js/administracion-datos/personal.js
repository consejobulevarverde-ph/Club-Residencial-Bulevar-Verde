(function () {
  if (window.AdminDatos && window.AdminDatos.registrarModulo) {
    window.AdminDatos.registrarModulo({
      id: 'personal',
      buttonId: 'showPersonal',
      viewId: 'personalView',
      onFirstShow: window.AdminDatos.loadPersonal
    });
  }
}());
