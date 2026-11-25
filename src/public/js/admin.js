/* =============================================================================
   Cafetería Origen — lógica del panel de administración
   ============================================================================= */
/* =============================================================================
   Cafetería Origen — lógica del panel de administración
   ============================================================================= */
(function () {
  'use strict';

  var API = '/api';
  var ESTADOS_PEDIDO = ['abierto', 'preparando', 'listo', 'entregado'];
  var ROLES_USUARIO = ['cliente', 'mozo', 'barista', 'admin'];
  var VISTAS_PERMITIDAS = ['resumen', 'pedidos', 'productos', 'reportes', 'usuarios', 'herramientas'];

  var usuario = null;
  var productosCache = {};

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function money(valor) {
    return Number(valor || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
  }

  /**
   * Crea un elemento del DOM insertando texto únicamente mediante nodos de
   * texto (VUL-08), eliminando cualquier riesgo de XSS en el panel.
   */
  function crearEl(tag, attrs, hijos) {
    var nodo = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (clave) {
        var valor = attrs[clave];
        if (valor === undefined || valor === null || valor === false) return;
        if (clave === 'className') {
          nodo.className = String(valor);
        } else if (clave === 'value') {
          nodo.value = String(valor);
        } else if (clave === 'selected') {
          nodo.selected = Boolean(valor);
        } else {
          nodo.setAttribute(clave, String(valor));
        }
      });
    }
    if (hijos !== undefined && hijos !== null) {
      var lista = Array.isArray(hijos) ? hijos : [hijos];
      lista.forEach(function (hijo) {
        if (hijo === undefined || hijo === null || hijo === false) return;
        if (typeof hijo === 'string' || typeof hijo === 'number') {
          nodo.appendChild(document.createTextNode(String(hijo)));
        } else {
          nodo.appendChild(hijo);
        }
      });
    }
    return nodo;
  }

  function api(url, opciones) {
    return fetch(API + url, opciones).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function postJSON(url, cuerpo) {
    return api(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo || {}),
    });
  }

  function putJSON(url, cuerpo) {
    return api(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo || {}),
    });
  }

  function patchJSON(url, cuerpo) {
    return api(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo || {}),
    });
  }

  function feedback(caja, mensaje, ok) {
    caja.className = 'form-feedback ' + (ok ? 'is-ok' : 'is-error');
    caja.textContent = String(mensaje == null ? '' : mensaje);
  }

  /* ------------------------------------------------------------------ login */
  function iniciarSesion(evento) {
    evento.preventDefault();
    var caja = $('#login-feedback');
    caja.className = 'form-feedback';

    postJSON('/auth/login', {
      username: $('#login-usuario').value,
      password: $('#login-password').value,
    }).then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'No pudimos iniciar sesión: ' + (resp.data.error || 'error desconocido'), false);
        return;
      }
      usuario = resp.data.usuario;
      mostrarPanel();
    });
  }

  function cerrarSesion() {
    postJSON('/auth/logout', {}).then(function () {
      usuario = null;
      $('#vista-login').hidden = false;
      $('#vista-panel').hidden = true;
      $('#admin-user').replaceChildren();
    });
  }

  function mostrarPanel() {
    $('#vista-login').hidden = true;
    $('#vista-panel').hidden = false;
    $('#admin-user').replaceChildren(
      document.createTextNode('Sesión de '),
      crearEl('strong', null, usuario.nombre || ''),
      document.createTextNode(' · rol: '),
      crearEl('strong', null, usuario.rol || '')
    );
    $('#panel-bienvenida').textContent = 'Hola, ' + usuario.nombre;
    cargarTodo();
  }

  function cargarTodo() {
    cargarResumen();
    cargarPedidos();
    cargarProductos();
    cargarReportes();
    cargarUsuarios();
  }

  /* ---------------------------------------------------------------- resumen */
  function renderKpis(contenedor, kpis) {
    var nodos = kpis.map(function (k) {
      return crearEl('div', { className: 'kpi' }, [
        crearEl('div', { className: 'kpi-label' }, k.label),
        crearEl('div', { className: 'kpi-value' }, String(k.value == null ? '' : k.value)),
      ]);
    });
    contenedor.replaceChildren.apply(contenedor, nodos);
  }

  function cargarResumen() {
    api('/reportes/facturacion').then(function (f) {
      api('/reportes/mas-vendido').then(function (m) {
        api('/reportes/cantidad-vendida').then(function (c) {
          var mas = m.data.producto;
          var kpis = [
            { label: 'Facturación total', value: money(f.data.facturado) },
            { label: 'Pedidos registrados', value: f.data.pedidos },
            {
              label: 'Producto más vendido',
              value: mas ? mas.nombre : '—',
            },
            {
              label: 'Unidades por tipo',
              value: Object.keys(c.data.cantidadVendida || {})
                .map(function (k) { return k + ': ' + c.data.cantidadVendida[k]; })
                .join(' · ') || '—',
            },
          ];

          renderKpis($('#kpis'), kpis);
        });
      });
    });
  }

  /* --------------------------------------------------------------- pedidos */
  function renderTablaPedidos(contenedor, filas, conAcciones) {
    if (!filas || filas.length === 0) {
      contenedor.replaceChildren(crearEl('p', { className: 'empty' }, 'No hay pedidos.'));
      return;
    }

    var encabezados = [
      crearEl('th', null, '#'),
      crearEl('th', null, 'Mesa'),
      crearEl('th', null, 'Cliente'),
      crearEl('th', null, 'Estado'),
      crearEl('th', { className: 'num' }, 'Total'),
      crearEl('th', null, 'Fecha'),
    ];
    if (conAcciones) encabezados.push(crearEl('th', null, 'Acciones'));

    var thead = crearEl('thead', null, [crearEl('tr', null, encabezados)]);

    var cuerpoFilas = filas.map(function (p) {
      var estadoSeguro = ESTADOS_PEDIDO.indexOf(p.estado) !== -1 ? p.estado : '';
      var claseBadge = estadoSeguro ? 'badge badge-' + estadoSeguro : 'badge';

      var celdas = [
        crearEl('td', null, String(p.id == null ? '' : p.id)),
        crearEl('td', null, String(p.mesa == null ? '' : p.mesa)),
        crearEl('td', null, String(p.cliente == null ? '' : p.cliente)),
        crearEl('td', null, [crearEl('span', { className: claseBadge }, String(p.estado || ''))]),
        crearEl('td', { className: 'num' }, money(p.total)),
        crearEl('td', null, new Date(p.creado_en).toLocaleString('es-AR')),
      ];

      if (conAcciones) {
        var opciones = ESTADOS_PEDIDO.map(function (e) {
          return crearEl('option', { value: e, selected: e === p.estado }, e);
        });
        var select = crearEl(
          'select',
          { 'data-pedido': String(p.id), className: 'sel-estado' },
          opciones
        );
        if (estadoSeguro) select.value = estadoSeguro;
        celdas.push(crearEl('td', null, [select]));
      }

      return crearEl('tr', null, celdas);
    });

    var tbody = crearEl('tbody', null, cuerpoFilas);
    contenedor.replaceChildren(thead, tbody);
  }

  function cargarPedidos() {
    api('/pedidos').then(function (resp) {
      var pedidos = resp.data.pedidos || [];
      renderTablaPedidos($('#tabla-pedidos'), pedidos, true);
      renderTablaPedidos($('#tabla-ultimos'), pedidos.slice(0, 5), false);
    });
  }

  function cambiarEstado(evento) {
    var select = evento.target.closest('.sel-estado');
    if (!select) return;
    var id = select.getAttribute('data-pedido');
    patchJSON('/pedidos/' + id + '/estado', { estado: select.value }).then(function (resp) {
      if (!resp.ok) {
        alert('No se pudo cambiar el estado: ' + (resp.data.error || 'error'));
      }
      cargarPedidos();
    });
  }

  /* ------------------------------------------------------------- productos */
  function cargarProductos() {
    api('/productos').then(function (resp) {
      var productos = resp.data.productos || [];
      productosCache = {};

      var thead = crearEl('thead', null, [
        crearEl('tr', null, [
          crearEl('th', null, '#'),
          crearEl('th', null, 'Nombre'),
          crearEl('th', null, 'Tipo'),
          crearEl('th', null, 'Origen'),
          crearEl('th', { className: 'num' }, 'Precio'),
          crearEl('th', null, 'Acciones'),
        ]),
      ]);

      var cuerpoFilas = productos.map(function (p) {
        productosCache[p.id] = p;
        return crearEl('tr', null, [
          crearEl('td', null, String(p.id == null ? '' : p.id)),
          crearEl('td', null, p.nombre || ''),
          crearEl('td', null, p.tipo || ''),
          crearEl('td', null, p.variedad || '—'),
          crearEl('td', { className: 'num' }, money(p.precio)),
          crearEl('td', null, [
            crearEl('button', { className: 'link-danger', 'data-borrar': String(p.id) }, 'Borrar'),
          ]),
        ]);
      });

      $('#tabla-productos').replaceChildren(thead, crearEl('tbody', null, cuerpoFilas));
    });
  }

  function guardarProducto(evento) {
    evento.preventDefault();
    var caja = $('#producto-feedback');
    var id = $('#producto-id').value;

    var cuerpo = {
      nombre: $('#p-nombre').value,
      tipo: $('#p-tipo').value,
      variedad: $('#p-variedad').value || null,
      tamano: $('#p-tamano').value || null,
      gramos: $('#p-gramos').value ? Number($('#p-gramos').value) : null,
      precio_base: Number($('#p-precio-base').value || 0),
      precio_por_gramo: Number($('#p-precio-gramo').value || 0),
      descripcion: $('#p-descripcion').value,
    };

    var peticion = id ? putJSON('/admin/productos/' + id, cuerpo) : postJSON('/admin/productos', cuerpo);

    peticion.then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'No se pudo guardar: ' + (resp.data.error || 'error desconocido'), false);
        return;
      }
      feedback(caja, 'Producto guardado correctamente.', true);
      $('#form-producto').reset();
      $('#producto-id').value = '';
      cargarProductos();
    });
  }

  function borrarProducto(evento) {
    var btn = evento.target.closest('[data-borrar]');
    if (!btn) return;
    var id = btn.getAttribute('data-borrar');
    if (!confirm('¿Borrar el producto #' + id + '?')) return;

    api('/admin/productos/' + id, { method: 'DELETE' }).then(function (resp) {
      if (!resp.ok) alert('No se pudo borrar: ' + (resp.data.error || 'error'));
      cargarProductos();
    });
  }

  function limpiarFormularioProducto() {
    $('#form-producto').reset();
    $('#producto-id').value = '';
  }

  /* ---------------------------------------------------------------- upload */
  function subirArchivo(evento) {
    evento.preventDefault();
    var caja = $('#upload-feedback');
    var input = $('#archivo-subida');
    if (!input.files || !input.files[0]) {
      feedback(caja, 'Elegí un archivo primero.', false);
      return;
    }

    var archivo = input.files[0];
    var lector = new FileReader();

    lector.onload = function () {
      var base64 = String(lector.result).split(',')[1] || '';
      postJSON('/admin/subir-archivo', {
        nombre: archivo.name,
        contenidoBase64: base64,
      }).then(function (resp) {
        if (!resp.ok) {
          feedback(caja, 'No se pudo subir: ' + (resp.data.error || 'error desconocido'), false);
          return;
        }
        feedback(caja, 'Archivo subido a ' + resp.data.url, true);
      });
    };

    lector.readAsDataURL(archivo);
  }

  /* -------------------------------------------------------------- reportes */
  function cargarReportes() {
    api('/reportes/facturacion').then(function (f) {
      api('/reportes/ticket-promedio').then(function (t) {
        api('/reportes/mas-vendido').then(function (m) {
          var mas = m.data.producto;
          var kpis = [
            { label: 'Facturación', value: money(f.data.facturado) },
            { label: 'Pedidos', value: f.data.pedidos },
            { label: 'Ticket promedio', value: money(t.data.promedio) },
            { label: 'Más vendido', value: mas ? mas.nombre + ' (' + mas.unidades + ')' : '—' },
          ];
          renderKpis($('#kpis-reportes'), kpis);
        });
      });
    });
  }

  function consultarVentas() {
    var caja = $('#reporte-feedback');
    var variedad = $('#reporte-variedad').value;

    api('/reportes/ventas-por-variedad?variedad=' + encodeURIComponent(variedad)).then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'Error: ' + (resp.data.error || 'desconocido'), false);
        $('#tabla-ventas').replaceChildren();
        return;
      }
      var ventas = resp.data.ventas || [];
      var thead = crearEl('thead', null, [
        crearEl('tr', null, [
          crearEl('th', null, 'Origen'),
          crearEl('th', null, 'Producto'),
          crearEl('th', { className: 'num' }, 'Unidades'),
          crearEl('th', { className: 'num' }, 'Total'),
        ]),
      ]);
      var filas = ventas.map(function (v) {
        return crearEl('tr', null, [
          crearEl('td', null, v.variedad || ''),
          crearEl('td', null, v.nombre || ''),
          crearEl('td', { className: 'num' }, String(v.unidades == null ? '' : v.unidades)),
          crearEl('td', { className: 'num' }, money(v.total)),
        ]);
      });
      $('#tabla-ventas').replaceChildren(thead, crearEl('tbody', null, filas));
      feedback(caja, 'Consulta realizada.', true);
    });
  }

  /* -------------------------------------------------------------- usuarios */
  function cargarUsuarios() {
    api('/admin/usuarios').then(function (resp) {
      var usuarios = resp.data.usuarios || [];
      var thead = crearEl('thead', null, [
        crearEl('tr', null, [
          crearEl('th', null, '#'),
          crearEl('th', null, 'Usuario'),
          crearEl('th', null, 'Nombre'),
          crearEl('th', null, 'Rol'),
          crearEl('th', null, 'Acciones'),
        ]),
      ]);

      var filas = usuarios.map(function (u) {
        var opciones = ROLES_USUARIO.map(function (r) {
          return crearEl('option', { value: r, selected: r === u.rol }, r);
        });
        var select = crearEl(
          'select',
          { 'data-usuario': String(u.id), className: 'sel-rol' },
          opciones
        );
        if (ROLES_USUARIO.indexOf(u.rol) !== -1) select.value = u.rol;

        return crearEl('tr', null, [
          crearEl('td', null, String(u.id == null ? '' : u.id)),
          crearEl('td', null, u.username || ''),
          crearEl('td', null, u.nombre || ''),
          crearEl('td', null, [
            crearEl('span', { className: 'badge' + (u.rol === 'admin' ? ' badge-admin' : '') }, u.rol || ''),
          ]),
          crearEl('td', null, [select]),
        ]);
      });

      $('#tabla-usuarios').replaceChildren(thead, crearEl('tbody', null, filas));
    });
  }

  function cambiarRol(evento) {
    var select = evento.target.closest('.sel-rol');
    if (!select) return;
    var id = select.getAttribute('data-usuario');

    putJSON('/admin/usuarios/' + id, { rol: select.value }).then(function (resp) {
      if (!resp.ok) alert('No se pudo actualizar: ' + (resp.data.error || 'error'));
      cargarUsuarios();
    });
  }

  function cambiarPassword(evento) {
    evento.preventDefault();
    var caja = $('#password-feedback');
    postJSON('/admin/cambiar-contrasena', { nueva: $('#nueva-password').value }).then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'No se pudo cambiar: ' + (resp.data.error || 'error desconocido'), false);
        return;
      }
      feedback(caja, 'Contraseña actualizada.', true);
      $('#nueva-password').value = '';
    });
  }

  /* ----------------------------------------------------------- herramientas */
  function probarConexion(evento) {
    evento.preventDefault();
    var salida = $('#salida-conexion');
    salida.textContent = 'Probando…';

    postJSON('/admin/probar-conexion', { host: $('#conexion-host').value }).then(function (resp) {
      if (!resp.ok) {
        salida.textContent = 'Error: ' + (resp.data.error || 'desconocido');
        return;
      }
      salida.textContent =
        '$ ' + resp.data.comando + '\n\n' +
        (resp.data.salida || '') +
        (resp.data.error ? '\n[stderr]\n' + resp.data.error : '');
    });
  }

  function verDiagnostico() {
    var salida = $('#salida-diagnostico');
    salida.textContent = 'Cargando…';
    api('/_diagnostico').then(function (resp) {
      salida.textContent = JSON.stringify(resp.data, null, 2);
    });
  }

  /* ------------------------------------------------------------------ tabs */
  function seleccionarVista(vista) {
    $$('.tab').forEach(function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-vista') === vista);
    });
    $$('.tab-panel').forEach(function (p) {
      p.classList.toggle('is-active', p.getAttribute('data-panel') === vista);
    });
  }

  function activarTab(evento) {
    var tab = evento.target.closest('.tab');
    if (!tab) return;
    var vista = tab.getAttribute('data-vista');
    if (vista) seleccionarVista(vista);
  }

  /* ------------------------------------------------------------------ init */
  function init() {
    // Validación contra lista blanca y renderizado seguro con textContent (VUL-08).
    var params = new URLSearchParams(window.location.search);
    var objetivo = params.get('vista');
    var vistasDom = $$('.tab')
      .map(function (t) { return t.getAttribute('data-vista'); })
      .filter(Boolean);
    var listaVistas = vistasDom.length > 0 ? vistasDom : VISTAS_PERMITIDAS;
    if (objetivo && listaVistas.indexOf(objetivo) !== -1) {
      $('#panel-bienvenida').textContent = 'Panel ' + objetivo;
      seleccionarVista(objetivo);
    }

    $('#form-login').addEventListener('submit', iniciarSesion);
    $('#btn-logout').addEventListener('click', cerrarSesion);
    $('#btn-refrescar').addEventListener('click', cargarTodo);
    $('#tabs').addEventListener('click', activarTab);
    $('#tabla-pedidos').addEventListener('change', cambiarEstado);
    $('#tabla-productos').addEventListener('click', borrarProducto);
    $('#form-producto').addEventListener('submit', guardarProducto);
    $('#btn-limpiar-producto').addEventListener('click', limpiarFormularioProducto);
    $('#form-upload').addEventListener('submit', subirArchivo);
    $('#form-password').addEventListener('submit', cambiarPassword);
    $('#btn-reporte-variedad').addEventListener('click', consultarVentas);
    $('#tabla-usuarios').addEventListener('change', cambiarRol);
    $('#form-conexion').addEventListener('submit', probarConexion);
    $('#btn-diagnostico').addEventListener('click', verDiagnostico);

    // ¿Ya hay sesión?
    api('/auth/yo').then(function (resp) {
      if (resp.ok) {
        usuario = resp.data.usuario;
        mostrarPanel();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
