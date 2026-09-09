(function () {
  if (window.AdminDatos && window.AdminDatos.registrarModulo) {
    window.AdminDatos.registrarModulo({
      id: 'reservas',
      buttonId: 'showReservas',
      viewId: 'reservasView'
    });
  }
}());
