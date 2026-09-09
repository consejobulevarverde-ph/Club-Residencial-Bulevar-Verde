(function () {
  if (window.AdminDatos && window.AdminDatos.registrarModulo) {
    window.AdminDatos.registrarModulo({
      id: 'dashboard',
      buttonId: 'showDashboard',
      viewId: 'dashboardView',
      onFirstShow: window.AdminDatos.loadDashboard
    });
  }
}());
