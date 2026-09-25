(function () {
  if (window.AdminDatos && window.AdminDatos.registrarModulo) {
    window.AdminDatos.registrarModulo({
      id: 'reporteVehiculos',
      buttonId: 'showReporteVehiculos',
      viewId: 'reporteVehiculosView',
      onFirstShow: function () {
        if (window.BVVehiculosReporte) window.BVVehiculosReporte.mostrar();
      }
    });
  }
}());
