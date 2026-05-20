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
let cache = { ventasPorVendedor: {}, clientesPorVendedor: {}, ventasPorDocumento: {}, ventasPorRazon: {}, productosPorDocumento: {}, productosPorVendedor: {}, clientesPorDocumento: {} };

function normalizarTexto(t) { return t ? String(t).replace(/\s+/g, ' ').trim().toUpperCase() : ''; }

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
    } else { return null; }

    day = String(day).padStart(2, '0');
    month = String(month).padStart(2, '0');
    const fecha = new Date(`${year}-${month}-${day}T12:00:00`);
    if (isNaN(fecha.getTime())) return null;

    return { string: `${day}/${month}`, sortValue: fecha.getTime() };
}

function cargarCSV(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(url, { download: true, header: true, skipEmptyLines: true, complete: res => resolve(res.data || []), error: err => reject(err) });
    });
}

function evaluarTeclado(e) { if (e.key === 'Enter') verificarPassword(); }

function verificarPassword() {
    if (btoa(document.getElementById('passInput').value) === "RGlhbGV4MTIz") {
        document.getElementById('loginScreen').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('loadingScreen').style.display = 'flex';
            inicializarApp();
        }, 300);
    } else { document.getElementById('loginError').style.display = 'block'; }
}

function inicializarColumnas() {
    COLS = {
        vendedores: {
            meta: getColExacto(db.vendedores[0], ['META']), id: getColExacto(db.vendedores[0], ['ID_VENDEDOR']),
            nombre: getColExacto(db.vendedores[0], ['NOMBRE']), apellido: getColExacto(db.vendedores[0], ['APELLIDO']), tipo: getColExacto(db.vendedores[0], ['TIPO'])
        },
        ventas: {
            idVendedor: getColExacto(db.ventas[0], ['ID_VENDEDOR']), total: getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']),
            fecha: getColExacto(db.ventas[0], ['FECHA DE VENTA', 'FECHA']), documento: getColExacto(db.ventas[0], ['Documento_Numero', 'RUC', 'DNI', 'ID_CLIENTE']),
            razon: getColExacto(db.ventas[0], ['RAZÓN SOCIAL', 'RAZON SOCIAL', 'NOMBRE'])
        },
        productos: {
            idVendedor: getColExacto(db.productos[0], ['ID_VENDEDOR']), documento: getColExacto(db.productos[0], ['Documento_Numero', 'RUC', 'DNI', 'ID_CLIENTE']),
            producto: getColExacto(db.productos[0], ['NOMBRE DEL PRODUCTO', 'PRODUCTO']), unid: getColExacto(db.productos[0], ['CANTIDAD UNID', 'UNID']), caja: getColExacto(db.productos[0], ['CANTIDAD CAJA', 'CAJA'])
        },
        clientes: {
            id: getColExacto(db.clientes[0], ['ID_CLIENTE', 'RUC', 'DNI', 'Documento_Numero']), documento: getColExacto(db.clientes[0], ['Documento_Numero', 'RUC', 'DNI', 'ID_CLIENTE']),
            razon: getColExacto(db.clientes[0], ['RAZÓN SOCIAL', 'RAZON SOCIAL', 'NOMBRE']), ubicacion: getColExacto(db.clientes[0], ['UBICACIÓN', 'UBICACION', 'DIRECCION']),
            idVendedor: getColExacto(db.clientes[0], ['ID_VENDEDOR']), estado: getColExacto(db.clientes[0], ['ESTADO DE VENTA', 'ESTADO'])
        }
    };
}

function generarIndices() {
    cache = { ventasPorVendedor: {}, clientesPorVendedor: {}, ventasPorDocumento: {}, ventasPorRazon: {}, productosPorDocumento: {}, productosPorVendedor: {}, clientesPorDocumento: {} };
    db.ventas.forEach(v => {
        const idV = normalizarTexto(v[COLS.ventas.idVendedor]); const doc = normalizarTexto(v[COLS.ventas.documento]); const raz = normalizarTexto(v[COLS.ventas.razon]);
        if (idV) { if (!cache.ventasPorVendedor[idV]) cache.ventasPorVendedor[idV] = []; cache.ventasPorVendedor[idV].push(v); }
        if (doc) { if (!cache.ventasPorDocumento[doc]) cache.ventasPorDocumento[doc] = []; cache.ventasPorDocumento[doc].push(v); }
        if (raz) { if (!cache.ventasPorRazon[raz]) cache.ventasPorRazon[raz] = []; cache.ventasPorRazon[raz].push(v); }
    });
    db.clientes.forEach(c => {
        const idV = normalizarTexto(c[COLS.clientes.idVendedor]); const doc = normalizarTexto(c[COLS.clientes.documento]);
        if (idV) { if (!cache.clientesPorVendedor[idV]) cache.clientesPorVendedor[idV] = []; cache.clientesPorVendedor[idV].push(c); }
        if (doc) cache.clientesPorDocumento[doc] = c;
    });
    db.productos.forEach(p => {
        const idV = normalizarTexto(p[COLS.productos.idVendedor]); const doc = normalizarTexto(p[COLS.productos.documento]);
        if (idV) { if (!cache.productosPorVendedor[idV]) cache.productosPorVendedor[idV] = []; cache.productosPorVendedor[idV].push(p); }
        if (doc) { if (!cache.productosPorDocumento[doc]) cache.productosPorDocumento[doc] = []; cache.productosPorDocumento[doc].push(p); }
    });
}

function crearOActualizarChart(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    if (charts[id]) {
        charts[id].data = config.data; charts[id].options = config.options || charts[id].options; charts[id].update(); return charts[id];
    }
    charts[id] = new Chart(canvas.getContext('2d'), config);
    return charts[id];
}

async function inicializarApp() {
    try {
        const [resVend, resVent, resProd, resCli] = await Promise.all([cargarCSV(urls.vendedores), cargarCSV(urls.ventas), cargarCSV(urls.productos), cargarCSV(urls.clientes)]);
        db.vendedores = resVend; db.ventas = resVent; db.productos = resProd; db.clientes = resCli;
        inicializarColumnas(); generarIndices(); generarMenuVendedores();
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('appContainer').style.visibility = 'visible';
        cambiarModulo('general', document.querySelector('.modulos-list li'));
    } catch (e) {
        document.getElementById('loadingSpinner').style.display = 'none';
        document.getElementById('loadingTitle').textContent = 'Error de sincronización con la nube. Revise permisos del CSV.';
        document.getElementById('loadingTitle').style.color = '#d93025';
    }
}

function cambiarModulo(modulo, elemento) {
    if (moduloActual === modulo) return;
    moduloActual = modulo;
    requestAnimationFrame(() => {
        document.querySelectorAll('.modulos-list li').forEach(el => el.classList.remove('active'));
        if (elemento) elemento.classList.add('active');
        document.querySelectorAll('.modulo-view').forEach(v => v.style.display = 'none');
        document.getElementById('menuVendedoresContainer').style.display = 'none';

        const vistas = { general: document.getElementById('vistaGeneral'), productividad: document.getElementById('vistaProductividad'), situacion: document.getElementById('vistaSituacion'), busqueda: document.getElementById('vistaBusqueda') };
        vistas[modulo].style.display = 'block';

        if (modulo === 'general') { document.getElementById('tituloDashboard').textContent = 'Vista General Comercial'; setTimeout(cargarDataGeneral, 10); }
        if (modulo === 'productividad') {
            document.getElementById('menuVendedoresContainer').style.display = 'flex';
            document.getElementById('tituloDashboard').textContent = 'Análisis de Productividad';
            setTimeout(() => {
                let actLi = document.querySelector('#listaVendedoresHorizontal li.active');
                if (!actLi) { let pV = document.querySelector('#listaVendedoresHorizontal li'); if (pV) pV.click(); } 
                else if (vendedorSeleccionadoActivo) cargarDataVendedor(vendedorSeleccionadoActivo);
            }, 10);
        }
        if (modulo === 'situacion') { document.getElementById('tituloDashboard').textContent = 'Estrategia de Rentabilidad'; setTimeout(cargarDataSituacion, 10); }
        if (modulo === 'busqueda') { document.getElementById('tituloDashboard').textContent = 'Directorio Analítico Inteligente'; setTimeout(inicializarBuscadorDirectorio, 10); }

        setTimeout(() => { Object.values(mapasInstancias).forEach(m => { if (m?.instance) m.instance.invalidateSize(); }); }, 100);
    });
}

function generarMenuVendedores() {
    const lista = document.getElementById('listaVendedoresHorizontal');
    lista.innerHTML = '';
    if (!db.vendedores.length) return;
    const cM = COLS.vendedores.meta; const cN = COLS.vendedores.nombre; const cA = COLS.vendedores.apellido;
    db.vendedores.filter(v => parseNum(v[cM]) > 0 && normalizarTexto(v[cN]) !== 'RETIRADO').forEach(v => {
        const li = document.createElement('li');
        li.textContent = `${v[cN] || ''} ${v[cA] || ''}`.trim();
        li.onclick = () => { document.querySelectorAll('#listaVendedoresHorizontal li').forEach(el => el.classList.remove('active')); li.classList.add('active'); vendedorSeleccionadoActivo = v; cargarDataVendedor(v); };
        lista.appendChild(li);
    });
}

function inyectarMapaNacional(idContenedorPadre, arrayCliData) {
    if (!db.clientes.length) return;
    if (!mapasInstancias[idContenedorPadre]) {
        const map = L.map(idContenedorPadre).setView([-9.1899, -75.0151], 5);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: 'Dialex System' }).addTo(map);
        mapasInstancias[idContenedorPadre] = { instance: map, layerGroup: L.featureGroup().addTo(map) };
    }
    const mapaObj = mapasInstancias[idContenedorPadre];
    mapaObj.layerGroup.clearLayers();

    const dicZonas = {
        'AREQUIPA': [-16.40, -71.53], 'CUSCO': [-13.53, -71.96], 'TRUJILLO': [-8.10, -79.02], 'CHICLAYO': [-6.77, -79.84], 'PIURA': [-5.19, -80.62],
        'IQUITOS': [-3.74, -73.25], 'HUANCAYO': [-12.06, -75.20], 'TACNA': [-18.01, -70.25], 'CAJAMARCA': [-7.16, -78.51], 'PUNO': [-15.84, -70.02],
        'LIMA': [-12.04, -77.02], 'CALLAO': [-12.05, -77.13], 'ATE': [-12.02, -76.91], 'SURCO': [-12.13, -76.99], 'COMAS': [-11.93, -77.04]
    };

    const ventasPorDoc = {};
    db.ventas.forEach(v => { const doc = normalizarTexto(v[COLS.ventas.documento]); if(doc) ventasPorDoc[doc] = (ventasPorDoc[doc] || 0) + parseNum(v[COLS.ventas.total]); });

    arrayCliData.forEach(c => {
        const doc = normalizarTexto(c[COLS.clientes.documento]); const raz = c[COLS.clientes.razon] || 'Cliente';
        const ubi = normalizarTexto(c[COLS.clientes.ubicacion]); const vnt = ventasPorDoc[doc] || 0;
        let coord = dicZonas['LIMA'];
        for (const z in dicZonas) { if (ubi.includes(z)) { coord = dicZonas[z]; break; } }
        const lat = coord[0] + (Math.sin(doc.charCodeAt(0) || 7) * 0.03); const lng = coord[1] + (Math.cos(doc.charCodeAt(1) || 11) * 0.03);
        const color = vnt > 0 ? '#34a853' : '#ea4335';
        const marker = L.marker([lat, lng], { icon: L.divIcon({ html: `<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>`, className: 'custom-pin' }) }).bindPopup(`<b>${raz}</b><br>Facturación Total: S/ ${vnt.toLocaleString()}<br><small>${c[COLS.clientes.ubicacion] || ''}</small>`);
        mapaObj.layerGroup.addLayer(marker);
    });

    if(arrayCliData.length > 0 && mapaObj.layerGroup.getLayers().length > 2) {
        clearTimeout(mapaObj.fitTimeout);
        mapaObj.fitTimeout = setTimeout(() => { mapaObj.instance.fitBounds(mapaObj.layerGroup.getBounds(), { padding:[20,20], maxZoom:10 }); }, 120);
    }
}

function obtenerInactivosReales(idVendedorFiltro) {
    const compradoresActivos = new Set();
    db.ventas.forEach(v => {
        const idClie = normalizarTexto(v[COLS.ventas.documento]);
        const idVendVenta = normalizarTexto(v[COLS.ventas.idVendedor]);
        if (!idClie) return;
        if (idVendedorFiltro === 'GLOBAL' || idVendVenta === idVendedorFiltro) compradoresActivos.add(idClie);
    });
    return db.clientes.filter(c => {
        const idCliente = normalizarTexto(c[COLS.clientes.documento]);
        const vendedorAsignadoEnDirectorio = normalizarTexto(c[COLS.clientes.idVendedor]);
        const perteneceAlVendedor = (idVendedorFiltro === 'GLOBAL') ? true : (vendedorAsignadoEnDirectorio === idVendedorFiltro);
        return perteneceAlVendedor && idCliente && !compradoresActivos.has(idCliente);
    });
}

function cargarDataGeneral() {
    if (!db.vendedores.length || !db.ventas.length || !db.clientes.length) return;

    const metaT = db.vendedores.reduce((s, v) => s + parseNum(v[COLS.vendedores.meta]), 0);
    const vtaT = db.ventas.reduce((s, v) => s + parseNum(v[COLS.ventas.total]), 0);
    const inactivosGlobales = obtenerInactivosReales('GLOBAL');
    
    // Cálculos nuevos requeridos (Total Clientes y VIPs)
    const totalBaseClientes = db.clientes.length;
    const ventasTotalesGlobales = {};
    db.ventas.forEach(v => {
        const d = normalizarTexto(v[COLS.ventas.documento]);
        if (d) ventasTotalesGlobales[d] = (ventasTotalesGlobales[d] || 0) + parseNum(v[COLS.ventas.total]);
    });
    const clientesVIPCount = Object.values(ventasTotalesGlobales).filter(tot => tot >= 1000).length;

    document.getElementById('kpiGeneral').innerHTML = `
        <div class="kpi-box destacado"><h4>Venta Global Lograda</h4><span>${formatearMoneda(vtaT)}</span></div>
        <div class="kpi-box"><h4>Meta Global Programada</h4><span style="color:#202124">${formatearMoneda(metaT)}</span></div>
        <div class="kpi-box"><h4>Total Clientes (Base)</h4><span style="color:#1a73e8">${totalBaseClientes}</span></div>
        <div class="kpi-box"><h4>Clientes VIP (> S/ 1k)</h4><span style="color:#fbbc05">${clientesVIPCount}</span></div>
        <div class="kpi-box kpi-clickable" onclick="mostrarModalInactivos('GLOBAL', 'General')"><h4>Inactivos</h4><span style="color:#d93025">${inactivosGlobales.length}</span></div>
    `;

    const pctGen = metaT > 0 ? (vtaT / metaT) * 100 : 0;
    document.getElementById('textoVelocimetroGeneral').textContent = pctGen.toFixed(1) + '%';
    crearOActualizarChart('chartVelocimetroGeneral', { type: 'doughnut', data: { datasets: [{ data: [vtaT, Math.max(0, metaT - vtaT)], backgroundColor: ['#34a853', '#ea4335'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, rotation: -90, circumference: 180, cutout: '75%', plugins: { legend: { display: false } } } });

    const canales = {};
    db.ventas.forEach(v => {
        const vend = db.vendedores.find(vd => normalizarTexto(vd[COLS.vendedores.id]) === normalizarTexto(v[COLS.ventas.idVendedor]));
        let t = vend && vend[COLS.vendedores.tipo] ? normalizarTexto(vend[COLS.vendedores.tipo]) : 'OTROS';
        canales[t||'SIN ASIGNAR'] = (canales[t||'SIN ASIGNAR'] || 0) + parseNum(v[COLS.ventas.total]);
    });
    crearOActualizarChart('chartDonaGeneral', { type: 'pie', data: { labels: Object.keys(canales), datasets: [{ data: Object.values(canales), backgroundColor: ['#1a73e8', '#fbbc05', '#34a853', '#ea4335', '#9aa0a6', '#ff6d01'].slice(0, Object.keys(canales).length) }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });

    const daily = {};
    db.ventas.forEach(v => {
        const fObj = parseFechaEstricta(v[COLS.ventas.fecha]);
        if (fObj) { if (!daily[fObj.string]) daily[fObj.string] = { val: 0, sort: fObj.sortValue }; daily[fObj.string].val += parseNum(v[COLS.ventas.total]); }
    });
    const arrFechas = Object.keys(daily).map(k => ({ label: k, ...daily[k] })).sort((a, b) => a.sort - b.sort);
    crearOActualizarChart('chartLineaGeneral', { type: 'line', data: { labels: arrFechas.map(f => f.label), datasets: [{ label: 'Ingresos Diarios (S/)', data: arrFechas.map(f => f.val), borderColor: '#1a73e8', backgroundColor: 'rgba(26, 115, 232, 0.08)', fill: true, tension: 0.1 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });

    const rank = db.vendedores.filter(v => parseNum(v[COLS.vendedores.meta]) > 0).map(v => {
        const tot = (cache.ventasPorVendedor[normalizarTexto(v[COLS.vendedores.id])] || []).reduce((s, vt) => s + parseNum(vt[COLS.ventas.total]), 0);
        return { n: v[COLS.vendedores.nombre] || '', p: (tot / parseNum(v[COLS.vendedores.meta])) * 100 };
    }).sort((a, b) => b.p - a.p);
    crearOActualizarChart('chartRankingMeta', { type: 'bar', data: { labels: rank.map(r => r.n), datasets: [{ label: '% Logrado', data: rank.map(r => Math.min(r.p, 100)), backgroundColor: '#1a73e8' }, { label: '% Faltante', data: rank.map(r => Math.max(0, 100 - r.p)), backgroundColor: '#dadce0' }] }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, max: 100 } }, plugins: { legend: { display: true, position: 'bottom' } } } });

    inyectarMapaNacional('ContenedorMapaGeneral', db.clientes);
}

function cargarDataVendedor(vdData) {
    if (!vdData) return;
    document.getElementById('estadoVendedorSeleccion').style.display = 'none';
    document.getElementById('contenidoProductividad').style.display = 'block';

    const idV = normalizarTexto(vdData[COLS.vendedores.id]);
    const nombreVendedor = [vdData[COLS.vendedores.nombre], vdData[COLS.vendedores.apellido]].filter(Boolean).join(' ').trim() || 'Vendedor';
    document.getElementById('tituloDashboard').textContent = `Análisis de Rendimiento: ${nombreVendedor}`;

    const meta = parseNum(vdData[COLS.vendedores.meta]);
    const ventasVendedor = cache.ventasPorVendedor[idV] || [];
    const clientesVendedor = cache.clientesPorVendedor[idV] || [];
    const inactivosCartera = obtenerInactivosReales(idV);

    const totV = ventasVendedor.reduce((s, v) => s + parseNum(v[COLS.ventas.total]), 0);
    const activosCount = Math.max(0, clientesVendedor.length - inactivosCartera.length);

    document.getElementById('kpiVendedor').innerHTML = `
        <div class="kpi-box destacado"><h4>Cuota Lograda</h4><span>${formatearMoneda(totV)}</span></div>
        <div class="kpi-box"><h4>Meta Asignada</h4><span style="color:#333">${formatearMoneda(meta)}</span></div>
        <div class="kpi-box"><h4>Cartera Total (Clientes)</h4><span style="color:#1a73e8">${clientesVendedor.length}</span></div>
        <div class="kpi-box kpi-clickable" style="border-left: 4px solid #ea4335;" onclick="mostrarModalInactivos('${idV}', '${nombreVendedor}')"><h4>Clientes Inactivos</h4><span style="color:#d93025">${inactivosCartera.length}</span></div>
    `;

    const pctV = meta > 0 ? (totV / meta) * 100 : 0;
    document.getElementById('textoVelocimetroVendedor').textContent = pctV.toFixed(1) + '%';
    crearOActualizarChart('chartVelocimetroVendedor', { type: 'doughnut', data: { datasets: [{ data: [totV, Math.max(0, meta - totV)], backgroundColor: ['#34a853', '#ddd'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, rotation: -90, circumference: 180, cutout: '75%', plugins: { legend: { display: false } } } });
    crearOActualizarChart('chartDonaVendedor', { type: 'pie', data: { labels: ['Activos Comprando', 'Inactivos (Riesgo)'], datasets: [{ data: [activosCount, inactivosCartera.length], backgroundColor: ['#34a853', '#ea4335'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });

    // Calculando el Top 7 de Mejores Clientes
    const ventasPorClienteVend = {};
    ventasVendedor.forEach(v => {
        const r = v[COLS.ventas.razon] || v[COLS.ventas.documento] || 'Desconocido';
        ventasPorClienteVend[r] = (ventasPorClienteVend[r] || 0) + parseNum(v[COLS.ventas.total]);
    });
    const top7 = Object.entries(ventasPorClienteVend).sort((a,b) => b[1] - a[1]).slice(0, 7);
    const tbTop7 = document.querySelector('#tablaTop7Clientes tbody');
    tbTop7.innerHTML = '';
    if(top7.length === 0) tbTop7.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#999;">Sin ventas</td></tr>`;
    else top7.forEach((cli, idx) => { tbTop7.innerHTML += `<tr><td>${idx+1}</td><td>${cli[0]}</td><td class="num-col">${formatearMoneda(cli[1])}</td></tr>`; });

    const cU = {}; const cC = {};
    (cache.productosPorVendedor[idV] || []).forEach(p => {
        const n = p[COLS.productos.producto]; const u = parseNum(p[COLS.productos.unid]); const c = parseNum(p[COLS.productos.caja]);
        if (n) { if (u > 0) cU[n] = (cU[n] || 0) + u; if (c > 0) cC[n] = (cC[n] || 0) + c; }
    });

    const renderTable = (id, obj, emptyMsg) => {
        const tb = document.querySelector(`#${id} tbody`); tb.innerHTML = '';
        const keys = Object.keys(obj).sort((a, b) => obj[b] - obj[a]).slice(0, 5);
        if (keys.length === 0) tb.innerHTML = `<tr><td colspan="2" style="text-align:center; color:#999;">${emptyMsg}</td></tr>`;
        else keys.forEach(k => { tb.innerHTML += `<tr><td>${k}</td><td class="num-col">${obj[k].toLocaleString()}</td></tr>`; });
    };
    renderTable('tablaProdUnid', cU, 'Sin movimientos'); renderTable('tablaProdCaja', cC, 'Sin movimientos');
    inyectarMapaNacional('ContenedorMapaVendedor', clientesVendedor);
}

function cargarDataSituacion() {
    if (!db.ventas.length || !db.clientes.length) return;

    const vT = db.ventas.reduce((s, v) => s + parseNum(v[COLS.ventas.total]), 0);
    const lV = db.ventas.length;
    document.getElementById('kpiTicketPromedio').textContent = formatearMoneda(lV > 0 ? vT / lV : 0);

    const ventasPorCliente = {};
    db.ventas.forEach(v => {
        const doc = normalizarTexto(v[COLS.ventas.documento]);
        const raz = normalizarTexto(v[COLS.ventas.razon]);
        // Cambio clave: Forzamos el uso de la Razón Social primero, y si no existe, usamos RUC
        const key = raz || doc;
        if (!key) return;
        ventasPorCliente[key] = (ventasPorCliente[key] || 0) + parseNum(v[COLS.ventas.total]);
    });

    document.getElementById('kpiFrecuencia').textContent = Object.keys(ventasPorCliente).length > 0 ? (lV / Object.keys(ventasPorCliente).length).toFixed(1) : '0.0';
    document.getElementById('kpiRiesgo').textContent = obtenerInactivosReales('GLOBAL').length;

    const arrABC = Object.keys(ventasPorCliente).map(k => ({ n: k, t: ventasPorCliente[k] })).sort((a, b) => b.t - a.t);
    const tb = document.querySelector('#tablaABC tbody');
    tb.innerHTML = '';

    let sAc = 0;
    arrABC.forEach(c => {
        sAc += c.t;
        const pct = vT > 0 ? (sAc / vT) * 100 : 0;
        const sg = pct <= 80 ? 'A (Top)' : (pct <= 95 ? 'B (Medio)' : 'C (Crítico)');
        const cs = pct <= 80 ? 'badge-a' : (pct <= 95 ? 'badge-b' : 'badge-c');
        tb.innerHTML += `<tr><td>${c.n}</td><td><span class="badge ${cs}">${sg}</span></td><td class="num-col">${formatearMoneda(c.t)}</td></tr>`;
    });

    const clientesActivosSegmento = db.clientes.filter(c => ventasPorCliente[normalizarTexto(c[COLS.clientes.razon])] || ventasPorCliente[normalizarTexto(c[COLS.clientes.documento])]);
    inyectarMapaNacional('ContenedorMapaSituacion', clientesActivosSegmento.length ? clientesActivosSegmento : db.clientes);
}

// LOGICA NUEVA DE BÚSQUEDA INTELIGENTE
let buscadorInicializado = false;
function inicializarBuscadorDirectorio() {
    if (buscadorInicializado) return;
    buscadorInicializado = true;

    const datalist = document.getElementById('listaClientesSugeridos');
    let html = '';
    
    db.clientes.forEach(c => {
        let d = c[COLS.clientes.documento] || '';
        let r = c[COLS.clientes.razon] || '';
        if(r) html += `<option value="${r}">[RUC: ${d}]</option>`;
        if(d) html += `<option value="${d}">${r}</option>`;
    });

    datalist.innerHTML = html;
}

function buscarYMostrarCliente() {
    const inputVal = normalizarTexto(document.getElementById('inputBuscadorCliente').value);
    if (!inputVal) {
        document.getElementById('panelDetalleCliente').style.display = 'none';
        return;
    }

    // Buscamos coincidencia exacta primero
    let cliente = db.clientes.find(cl => normalizarTexto(cl[COLS.clientes.razon]) === inputVal || normalizarTexto(cl[COLS.clientes.documento]) === inputVal);
    
    // Si no es exacto, buscamos parcial
    if(!cliente) {
        cliente = db.clientes.find(cl => normalizarTexto(cl[COLS.clientes.razon]).includes(inputVal) || normalizarTexto(cl[COLS.clientes.documento]).includes(inputVal));
    }

    if (cliente) {
        mostrarDetalleCliente(cliente[COLS.clientes.documento], cliente[COLS.clientes.razon]);
    } else {
        document.getElementById('panelDetalleCliente').style.display = 'none';
    }
}

function mostrarDetalleCliente(doc, razon) {
    const panel = document.getElementById('panelDetalleCliente');
    panel.style.display = 'block';

    document.getElementById('detalleNombreCliente').textContent = razon || 'Cliente Innominado';
    document.getElementById('detalleDocCliente').textContent = doc || 'Sin Identificación';

    const susVtas = db.ventas.filter(v => (doc && normalizarTexto(v[COLS.ventas.documento]) === normalizarTexto(doc)) || (razon && normalizarTexto(v[COLS.ventas.razon]) === normalizarTexto(razon)));

    const totalFacturado = susVtas.reduce((s, v) => s + parseNum(v[COLS.ventas.total]), 0);
    document.getElementById('detalleTotalVenta').textContent = formatearMoneda(totalFacturado);

    document.getElementById('detalleEstadoCli').innerHTML = totalFacturado > 0 ? '<span class="badge badge-activo">ACTIVO COMPRADOR</span>' : '<span class="badge badge-inactivo">INACTIVO SIN COMPRAS</span>';

    const hist = {};
    susVtas.forEach(v => {
        const fObj = parseFechaEstricta(v[COLS.ventas.fecha]);
        if (fObj) { if (!hist[fObj.string]) hist[fObj.string] = { val: 0, sort: fObj.sortValue }; hist[fObj.string].val += parseNum(v[COLS.ventas.total]); }
    });

    const hArr = Object.keys(hist).map(k => ({ label: k, ...hist[k] })).sort((a, b) => a.sort - b.sort);
    crearOActualizarChart('chartClienteHistorial', { type: 'bar', data: { labels: hArr.map(f => f.label), datasets: [{ label: 'Compras S/', data: hArr.map(f => f.val), backgroundColor: '#34a853', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });

    const prds = {};
    db.productos.filter(p => doc && normalizarTexto(p[COLS.productos.documento]) === normalizarTexto(doc)).forEach(p => {
        const n = p[COLS.productos.producto]; const u = parseNum(p[COLS.productos.unid]); const c = parseNum(p[COLS.productos.caja]);
        if (n) { if (!prds[n]) prds[n] = { u: 0, c: 0 }; prds[n].u += u; prds[n].c += c; }
    });

    const tb = document.querySelector('#tablaClienteProductos tbody'); tb.innerHTML = '';
    const keysPrd = Object.keys(prds).sort((a, b) => (prds[b].u + prds[b].c) - (prds[a].u + prds[a].c));
    if (keysPrd.length === 0) tb.innerHTML = `<tr><td colspan="2" style="text-align:center; color:#999;">Sin transacciones en BD</td></tr>`;
    else keysPrd.forEach(k => { tb.innerHTML += `<tr><td>${k}</td><td class="num-col">${prds[k].c > 0 ? prds[k].c + ' cjs' : prds[k].u + ' und'}</td></tr>`; });
}

function mostrarModalInactivos(idVendedor, nombreVendedor) {
    document.getElementById('tituloModalInactivos').textContent = `Clientes Inactivos de: ${nombreVendedor}`;
    const tb = document.querySelector('#tablaInactivos tbody'); tb.innerHTML = '';
    const clientesInactivos = obtenerInactivosReales(idVendedor);

    if (clientesInactivos.length === 0) tb.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px; color:#666;">¡Felicidades! Toda la cartera registra compras.</td></tr>`;
    else clientesInactivos.forEach(c => { tb.innerHTML += `<tr><td>${c[COLS.clientes.documento] || '---'}</td><td>${c[COLS.clientes.razon] || '---'}</td><td><span class="badge badge-inactivo">${c[COLS.clientes.estado] || 'INACTIVO'}</span></td></tr>`; });

    document.getElementById('modalInactivos').style.display = 'flex';
}

function cerrarModalInactivos() { document.getElementById('modalInactivos').style.display = 'none'; }
