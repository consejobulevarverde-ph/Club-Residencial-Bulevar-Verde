(function () {
  if (window.AdminDatos && window.AdminDatos.registrarModulo) {
    window.AdminDatos.registrarModulo({
      id: 'busqueda',
      buttonId: 'showBusqueda',
      viewId: 'busquedaView',
      onFirstShow: function () {
        var campo = window.AdminDatos.$('query');
        if (campo) campo.focus();
      }
    });
  }
}());
