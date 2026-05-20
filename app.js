const urls = {
    vendedores: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=0&single=true&output=csv',
    ventas: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=588620531&single=true&output=csv',
    productos: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1241891503&single=true&output=csv',
    clientes: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1344644608&single=true&output=csv'
};

let db = { vendedores: [], ventas: [], productos: [], clientes: [] };
let charts = {};
let mapasInstancias = {};
let moduloActual = 'general';
let vendedorSeleccionadoActivo = null;

let COLS = { vendedores: {}, ventas: {}, productos: {}, clientes: {} };

let cache = {
    ventasPorVendedor: {},
    clientesPorVendedor: {},
    ventasPorIdCliente: {},
    productosPorVendedor: {},
    clientesPorId: {}
};

function normalizarTexto(t) {
    return t ? String(t).replace(/\s+/g, ' ').trim().toUpperCase() : '';
}

function getColExacto(obj, opciones) {
    if (!obj) return null;
    const keys = Object.keys(obj);
    for (let op of opciones) {
        const opL = normalizarTexto(op);
        const found = keys.find(k => normalizarTexto(k) === opL);
        if (found) return found;
    }
    for (let op of opciones) {
        const opL = normalizarTexto(op);
        const found = keys.find(k => normalizarTexto(k).includes(opL));
        if (found) return found;
    }
    return keys[0] || null;
}

function parseNum(val) {
    const num = parseFloat(String(val ?? '').replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
}

function formatearMoneda(val) {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(val || 0);
}

function parseFechaEstricta(dStr) {
    if (!dStr) return null;
    const baseStr = String(dStr).split(' ')[0].trim();
    let day, month, year;

    if (baseStr.includes('/')) {
        const parts = baseStr.split('/');
        if (parts.length !== 3) return null;
        if (parts[0].length === 4) { year = parts[0]; month = parts[1]; day = parts[2]; } 
        else { day = parts[0]; month = parts[1]; year = parts[2].length === 2 ? `20${parts[2]}` : parts[2]; }
    } else if (baseStr.includes('-')) {
        const parts = baseStr.split('-');
        if (parts.length !== 3) return null;
        if (parts[0].length === 4) { year = parts[0]; month = parts[1]; day = parts[2]; } 
        else { day = parts[0]; month = parts[1]; year = parts[2]; }
    } else {
        return null;
    }

    day = String(day).padStart(2, '0');
    month = String(month).padStart(2, '0');
    const fecha = new Date(`${year}-${month}-${day}T12:00:00`);
    if (isNaN(fecha.getTime())) return null;

    return { string: `${day}/${month}`, sortValue: fecha.getTime() };
}

function cargarCSV(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(url, {
            download: true, header: true, skipEmptyLines: true,
            complete: res => resolve(res.data || []),
            error: err => reject(err)
        });
    });
}

function evaluarTeclado(e) {
    if (e.key === 'Enter') verificarPassword();
}

function verificarPassword() {
    if (btoa(document.getElementById('passInput').value) === "RGlhbGV4MTIz") {
        document.getElementById('loginScreen').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('loadingScreen').style.display = 'flex';
            inicializarApp();
        }, 300);
    } else {
        document.getElementById('loginError').style.display = 'block';
    }
}

function inicializarColumnas() {
    COLS = {
        vendedores: {
            meta: getColExacto(db.vendedores[0], ['META']),
            id: getColExacto(db.vendedores[0], ['ID_VENDEDOR']),
            nombre: getColExacto(db.vendedores[0], ['NOMBRE']),
            apellido: getColExacto(db.vendedores[0], ['APELLIDO']),
            tipo: getColExacto(db.vendedores[0], ['TIPO'])
        },
        ventas: {
            idVendedor: getColExacto(db.ventas[0], ['ID_VENDEDOR']),
            idCliente: getColExacto(db.ventas[0], ['ID_CLIENTE']), 
            total: getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']),
            fecha: getColExacto(db.ventas[0], ['FECHA DE VENTA', 'FECHA']),
            documento: getColExacto(db.ventas[0], ['Documento_Numero', 'RUC', 'DNI']),
            razon: getColExacto(db.ventas[0], ['RAZÓN SOCIAL', 'RAZON SOCIAL', 'NOMBRE'])
        },
        productos: {
            idVendedor: getColExacto(db.productos[0], ['ID_VENDEDOR']),
            idCliente: getColExacto(db.productos[0], ['ID_CLIENTE']),
            documento: getColExacto(db.productos[0], ['Documento_Numero', 'RUC', 'DNI']),
            producto: getColExacto(db.productos[0], ['NOMBRE DEL PRODUCTO', 'PRODUCTO']),
            unid: getColExacto(db.productos[0], ['CANTIDAD UNID', 'UNID']),
            caja: getColExacto(db.productos[0], ['CANTIDAD CAJA', 'CAJA'])
        },
        clientes: {
            id: getColExacto(db.clientes[0], ['ID_CLIENTE']), 
            documento: getColExacto(db.clientes[0], ['Documento_Numero', 'RUC', 'DNI']),
            razon: getColExacto(db.clientes[0], ['RAZÓN SOCIAL', 'RAZON SOCIAL', 'NOMBRE']),
            ubicacion: getColExacto(db.clientes[0], ['UBICACIÓN', 'UBICACION', 'DIRECCION']),
            idVendedor: getColExacto(db.clientes[0], ['ID_VENDEDOR']),
            estado: getColExacto(db.clientes[0], ['ESTADO DE VENTA', 'ESTADO'])
        }
    };
}

function generarIndices() {
    cache = {
        ventasPorVendedor: {}, clientesPorVendedor: {},
        ventasPorIdCliente: {}, productosPorVendedor: {},
        clientesPorId: {}
    };

    // 1. Crear Diccionario de Auto-Rescate (Documento -> ID_CLIENTE)
    const docToIdMap = {};
    db.clientes.forEach(c => {
        const idC = normalizarTexto(c[COLS.clientes.id]);
@@ -164,16 +163,14 @@
        }
    });

    // 2. Procesar Ventas e inyectar el ID_CLIENTE si falta
    db.ventas.forEach(v => {
        const idV = normalizarTexto(v[COLS.ventas.idVendedor]);
        let idC = normalizarTexto(v[COLS.ventas.idCliente]);
        const doc = normalizarTexto(v[COLS.ventas.documento]);

        // AUTO-RESCATE DE DATOS: Si en ventas falta el ID, lo copiamos de la base de clientes usando el RUC/DNI
        if (!idC && doc && docToIdMap[doc]) {
            idC = docToIdMap[doc];
            v[COLS.ventas.idCliente] = idC; // Mutamos el registro para arreglarlo en memoria
            v[COLS.ventas.idCliente] = idC; 
        }

        if (idV) {
@@ -186,7 +183,6 @@
        }
    });

    // 3. Procesar Productos e inyectar ID_CLIENTE si falta
    db.productos.forEach(p => {
        const idV = normalizarTexto(p[COLS.productos.idVendedor]);
        let idC = normalizarTexto(p[COLS.productos.idCliente]);
@@ -381,43 +377,23 @@
    }
}

// DOBLE SEGURO DE EVALUACIÓN DE INACTIVOS
// LÓGICA DIRECTA: LEE TU EXCEL Y OBEDECE A LA COLUMNA "ESTADO DE VENTA"
function obtenerInactivosReales(idVendedorFiltro) {
    const compradoresActivos = new Set(); 

    db.ventas.forEach(v => {
        const idC = normalizarTexto(v[COLS.ventas.idCliente]);
        const doc = normalizarTexto(v[COLS.ventas.documento]);
        const idVendVenta = normalizarTexto(v[COLS.ventas.idVendedor]);

        if (idVendedorFiltro === 'GLOBAL' || idVendVenta === idVendedorFiltro) {
            if (idC) compradoresActivos.add(idC);
            if (doc) compradoresActivos.add(doc); // Salvavidas: guardar el doc también por si el ID falló
        }
    });

    const inactivosUnicos = new Map(); 
    const inactivosList = [];

    db.clientes.forEach(c => {
        const idCliente = normalizarTexto(c[COLS.clientes.id]);
        const docCliente = normalizarTexto(c[COLS.clientes.documento]);
        const vendedorDir = normalizarTexto(c[COLS.clientes.idVendedor]);
        const estadoVenta = normalizarTexto(c[COLS.clientes.estado]); 

        const pertenece = (idVendedorFiltro === 'GLOBAL') ? true : (vendedorDir === idVendedorFiltro);

        // Verificamos si compró con su ID_CLIENTE *o* directamente con su RUC/DNI
        const tieneVentas = (idCliente && compradoresActivos.has(idCliente)) || 
                            (docCliente && compradoresActivos.has(docCliente));

        if (pertenece && !tieneVentas) {
            const key = idCliente || docCliente || Math.random().toString();
            if (!inactivosUnicos.has(key)) {
                inactivosUnicos.set(key, c); 
            }
        // Si tu base de datos dice "INACTIVO", el dashboard lo marca como inactivo. Directo.
        if (pertenece && estadoVenta.includes('INACTIVO')) {
            inactivosList.push(c);
        }
    });

    return Array.from(inactivosUnicos.values());
    return inactivosList;
}

function cargarDataGeneral() {
@@ -551,7 +527,7 @@

    crearOActualizarChart('chartDonaVendedor', {
        type: 'pie',
        data: { labels: ['Activos Comprando', 'Inactivos (Riesgo)'], datasets: [{ data: [activosCount, inactivosCartera.length], backgroundColor: ['#34a853', '#ea4335'] }] },
        data: { labels: ['Activos Registrados', 'Inactivos Registrados'], datasets: [{ data: [activosCount, inactivosCartera.length], backgroundColor: ['#34a853', '#ea4335'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

@@ -792,26 +768,28 @@
    const clientesInactivos = obtenerInactivosReales(idVendedor);

    if (clientesInactivos.length === 0) {
        tb.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px; color:#666;">¡Felicidades! Toda la cartera registra compras efectivas.</td></tr>`;
        tb.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px; color:#666;">No hay clientes marcados como inactivos en la base de datos.</td></tr>`;
    } else {
        const frag = document.createDocumentFragment();
        clientesInactivos.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${c[COLS.clientes.documento] || '---'}</td><td>${c[COLS.clientes.razon] || '---'}</td><td><span class="badge badge-inactivo">0 TRANSACCIONES</span></td>`;
            // Muestra el texto tal cual está en tu base de datos Clientes
            const estadoReal = c[COLS.clientes.estado] || 'INACTIVO';
            tr.innerHTML = `<td>${c[COLS.clientes.documento] || '---'}</td><td>${c[COLS.clientes.razon] || '---'}</td><td><span class="badge badge-inactivo">${estadoReal}</span></td>`;
            frag.appendChild(tr);
        });
        tb.appendChild(frag);
    }

    document.getElementById('modalInactivos').style.display = 'flex';
}

function cerrarModalInactivos() { document.getElementById('modalInactivos').style.display = 'none'; }

document.addEventListener('click', function(e) {
    const list = document.getElementById('listaSugerenciasClientes');
    const input = document.getElementById('inputBusquedaCliente');
    if(list && input && e.target !== input && e.target !== list && !list.contains(e.target)) {
        list.style.display = 'none';
    }
});
