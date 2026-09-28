(function () {
  if (window.AdminDatos && window.AdminDatos.registrarModulo) {
    window.AdminDatos.registrarModulo({
      id: 'vehiculos',
      buttonId: 'showVehiculos',
      viewId: 'vehiculosView',
      onFirstShow: function () {
        if (window.BVVehiculos) window.BVVehiculos.mostrar();
      }
    });
  }
}());
