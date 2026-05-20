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
let appPreloadedStatus = false; // Control de precarga global

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
            if (appPreloadedStatus) {
                lanzarDashboardDirecto();
            } else {
                document.getElementById('loadingScreen').style.display = 'flex';
            }
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

    const docToIdMap = {};
    db.clientes.forEach(c => {
        const idC = normalizarTexto(c[COLS.clientes.id]);
        const doc = normalizarTexto(c[COLS.clientes.documento]);
        if (idC && doc) docToIdMap[doc] = idC;

        const idV = normalizarTexto(c[COLS.clientes.idVendedor]);
        if (idV) {
            if (!cache.clientesPorVendedor[idV]) cache.clientesPorVendedor[idV] = [];
            cache.clientesPorVendedor[idV].push(c);
        }
        if (idC) {
            cache.clientesPorId[idC] = c;
        }
    });

    db.ventas.forEach(v => {
        const idV = normalizarTexto(v[COLS.ventas.idVendedor]);
        let idC = normalizarTexto(v[COLS.ventas.idCliente]);
        const doc = normalizarTexto(v[COLS.ventas.documento]);

        if (!idC && doc && docToIdMap[doc]) {
            idC = docToIdMap[doc];
            v[COLS.ventas.idCliente] = idC; 
        }

        if (idV) {
            if (!cache.ventasPorVendedor[idV]) cache.ventasPorVendedor[idV] = [];
            cache.ventasPorVendedor[idV].push(v);
        }
        if (idC) {
            if (!cache.ventasPorIdCliente[idC]) cache.ventasPorIdCliente[idC] = [];
            cache.ventasPorIdCliente[idC].push(v);
        }
    });

    db.productos.forEach(p => {
        const idV = normalizarTexto(p[COLS.productos.idVendedor]);
        let idC = normalizarTexto(p[COLS.productos.idCliente]);
        const doc = normalizarTexto(p[COLS.productos.documento]);

        if (!idC && doc && docToIdMap[doc]) {
            p[COLS.productos.idCliente] = docToIdMap[doc];
        }

        if (idV) {
            if (!cache.productosPorVendedor[idV]) cache.productosPorVendedor[idV] = [];
            cache.productosPorVendedor[idV].push(p);
        }
    });
}

// CÁLCULO DE LA ÚLTIMA FECHA DE VENTA REGISTRADA
function obtenerUltimaFechaVenta() {
    if (!db.ventas || !db.ventas.length) return '---';
    let maxTimestamp = 0;
    let fechaFormateadaFinal = '---';

    db.ventas.forEach(v => {
        const fStr = v[COLS.ventas.fecha];
        if (!fStr) return;
        const infoFecha = parseFechaEstricta(fStr);
        if (infoFecha && infoFecha.sortValue > maxTimestamp) {
            maxTimestamp = infoFecha.sortValue;
            const d = new Date(maxTimestamp);
            const dia = String(d.getDate()).padStart(2, '0');
            const mes = String(d.getMonth() + 1).padStart(2, '0');
            const anio = d.getFullYear();
            fechaFormateadaFinal = `${dia}/${mes}/${anio}`;
        }
    });
    return fechaFormateadaFinal;
}

function crearOActualizarChart(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    if (charts[id]) {
        charts[id].data = config.data;
        charts[id].options = config.options || charts[id].options;
        charts[id].update();
        return charts[id];
    }
    charts[id] = new Chart(canvas.getContext('2d'), config);
    return charts[id];
}

// ARRANQUE AUTOMÁTICO ASÍNCRONO EN SEGUNDO PLANO
async function inicializarApp() {
    try {
        const [resVend, resVent, resProd, resCli] = await Promise.all([
            cargarCSV(urls.vendedores), cargarCSV(urls.ventas),
            cargarCSV(urls.productos), cargarCSV(urls.clientes)
        ]);

        db.vendedores = resVend; db.ventas = resVent;
        db.productos = resProd; db.clientes = resCli;

        inicializarColumnas();
        generarIndices();
        generarMenuVendedores();

        // Extraer última fecha y pintar el login-box inmediatamente
        const ultimaVentaFecha = obtenerUltimaFechaVenta();
        const loginLabel = document.getElementById('loginUpdateInfo');
        if (loginLabel) {
            loginLabel.textContent = `Actualizado hasta: ${ultimaVentaFecha}`;
        }

        appPreloadedStatus = true;

        // Si el usuario ya metió la contraseña mientras descargaba, lanzamos la app de golpe
        if (document.getElementById('loginScreen').style.display === 'none' && document.getElementById('appContainer').style.visibility !== 'visible') {
            lanzarDashboardDirecto();
        }

    } catch (e) {
        document.getElementById('loadingSpinner').style.display = 'none';
        document.getElementById('loadingTitle').textContent = 'Error de conexión. Revise los enlaces del CSV.';
        document.getElementById('loadingTitle').style.color = '#d93025';
        const loginLabel = document.getElementById('loginUpdateInfo');
        if (loginLabel) loginLabel.textContent = 'Error al sincronizar datos';
    }
}

function lanzarDashboardDirecto() {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('appContainer').style.visibility = 'visible';
    
    // Forzar renderizado y cálculo dimensional inicial limpio
    cambiarModulo('general', document.querySelector('.modulos-list li'));
    
    setTimeout(() => {
        Object.values(charts).forEach(c => c.resize());
    }, 150);
}

function cambiarModulo(modulo, elemento) {
    if (moduloActual === modulo && document.getElementById('appContainer').style.visibility === 'visible') return;
    moduloActual = modulo;

    requestAnimationFrame(() => {
        document.querySelectorAll('.modulos-list li').forEach(el => el.classList.remove('active'));
        if (elemento) elemento.classList.add('active');

        document.querySelectorAll('.modulo-view').forEach(v => v.style.display = 'none');
        document.getElementById('menuVendedoresContainer').style.display = 'none';

        const vistas = {
            general: document.getElementById('vistaGeneral'),
            productividad: document.getElementById('vistaProductividad'),
            situacion: document.getElementById('vistaSituacion'),
            busqueda: document.getElementById('vistaBusqueda')
        };

        vistas[modulo].style.display = 'block';

        if (modulo === 'general') {
            document.getElementById('tituloDashboard').textContent = 'Vista General Comercial';
            setTimeout(cargarDataGeneral, 10);
        }

        if (modulo === 'productividad') {
            document.getElementById('menuVendedoresContainer').style.display = 'flex';
            document.getElementById('tituloDashboard').textContent = 'Análisis de Productividad';
            setTimeout(() => {
                let actLi = document.querySelector('#listaVendedoresHorizontal li.active');
                if (!actLi) {
                    let pV = document.querySelector('#listaVendedoresHorizontal li');
                    if (pV) pV.click();
                } else if (vendedorSeleccionadoActivo) {
                    cargarDataVendedor(vendedorSeleccionadoActivo);
                }
            }, 10);
        }

        if (modulo === 'situacion') {
            document.getElementById('tituloDashboard').textContent = 'Estrategia de Rentabilidad';
            setTimeout(cargarDataSituacion, 10);
        }

        if (modulo === 'busqueda') {
            document.getElementById('tituloDashboard').textContent = 'Directorio Analítico';
            document.getElementById('inputBusquedaCliente').value = '';
            document.getElementById('listaSugerenciasClientes').style.display = 'none';
            document.getElementById('panelDetalleCliente').style.display = 'none';
        }

        setTimeout(() => {
            Object.values(mapasInstancias).forEach(m => { if (m?.instance) m.instance.invalidateSize(); });
        }, 100);
    });
}

function generarMenuVendedores() {
    const lista = document.getElementById('listaVendedoresHorizontal');
    lista.innerHTML = '';
    if (!db.vendedores.length) return;

    db.vendedores
        .filter(v => parseNum(v[COLS.vendedores.meta]) > 0 && normalizarTexto(v[COLS.vendedores.nombre]) !== 'RETIRADO')
        .forEach(v => {
            const li = document.createElement('li');
            li.textContent = `${v[COLS.vendedores.nombre] || ''} ${v[COLS.vendedores.apellido] || ''}`.trim();
            li.onclick = () => {
                document.querySelectorAll('#listaVendedoresHorizontal li').forEach(el => el.classList.remove('active'));
                li.classList.add('active');
                vendedorSeleccionadoActivo = v;
                cargarDataVendedor(v);
            };
            lista.appendChild(li);
        });
}

function inyectarMapaNacional(idContenedorPadre, arrayCliData) {
    if (!db.clientes.length) return;

    if (!mapasInstancias[idContenedorPadre]) {
        const map = L.map(idContenedorPadre).setView([-9.1899, -75.0151], 5);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: 'Dialex System'
        }).addTo(map);
        mapasInstancias[idContenedorPadre] = { instance: map, layerGroup: L.featureGroup().addTo(map) };
    }

    const mapaObj = mapasInstancias[idContenedorPadre];
    mapaObj.layerGroup.clearLayers();

    const dicZonas = {
        'AREQUIPA': [-16.40, -71.53], 'CUSCO': [-13.53, -71.96], 'TRUJILLO': [-8.10, -79.02],
        'CHICLAYO': [-6.77, -79.84], 'PIURA': [-5.19, -80.62], 'IQUITOS': [-3.74, -73.25],
        'HUANCAYO': [-12.06, -75.20], 'TACNA': [-18.01, -70.25], 'CAJAMARCA': [-7.16, -78.51],
        'PUNO': [-15.84, -70.02], 'LIMA': [-12.04, -77.02]
    };

    const ventasPorId = {};
    db.ventas.forEach(v => {
        const idC = normalizarTexto(v[COLS.ventas.idCliente]);
        if(idC) ventasPorId[idC] = (ventasPorId[idC] || 0) + parseNum(v[COLS.ventas.total]);
    });

    arrayCliData.forEach(c => {
        const idC = normalizarTexto(c[COLS.clientes.id]);
        const raz = c[COLS.clientes.razon] || 'Cliente';
        const ubi = normalizarTexto(c[COLS.clientes.ubicacion]);
        const vnt = ventasPorId[idC] || 0;

        let coord = dicZonas['LIMA'];
        for (const z in dicZonas) { if (ubi.includes(z)) { coord = dicZonas[z]; break; } }

        const seedA = idC.charCodeAt(0) || 7; const seedB = idC.charCodeAt(idC.length-1) || 11;
        const lat = coord[0] + (Math.sin(seedA) * 0.03);
        const lng = coord[1] + (Math.cos(seedB) * 0.03);
        const color = vnt > 0 ? '#34a853' : '#ea4335';

        const marker = L.marker([lat, lng], {
            icon: L.divIcon({
                html: `<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>`,
                className: 'custom-pin'
            })
        }).bindPopup(`<b>${raz}</b><br>Facturación: S/ ${vnt.toLocaleString()}<br><small>${ubi}</small>`);

        mapaObj.layerGroup.addLayer(marker);
    });

    if(arrayCliData.length > 0 && mapaObj.layerGroup.getLayers().length > 2) {
        clearTimeout(mapaObj.fitTimeout);
        mapaObj.fitTimeout = setTimeout(() => {
            mapaObj.instance.fitBounds(mapaObj.layerGroup.getBounds(), { padding:[20,20], maxZoom:10 });
        }, 120);
    }
}

function obtenerInactivosReales(idVendedorFiltro) {
    const inactivosList = [];
    db.clientes.forEach(c => {
        const vendedorDir = normalizarTexto(c[COLS.clientes.idVendedor]);
        const estadoVenta = normalizarTexto(c[COLS.clientes.estado]); 
        const pertenece = (idVendedorFiltro === 'GLOBAL') ? true : (vendedorDir === idVendedorFiltro);
        if (pertenece && estadoVenta.includes('INACTIVO')) {
            inactivosList.push(c);
        }
    });
    return inactivosList;
}

function cargarDataGeneral() {
    if (!db.vendedores.length || !db.ventas.length || !db.clientes.length) return;

    const metaT = db.vendedores.reduce((s, v) => s + parseNum(v[COLS.vendedores.meta]), 0);
    const vtaT = db.ventas.reduce((s, v) => s + parseNum(v[COLS.ventas.total]), 0);
    const inactivosGlobales = obtenerInactivosReales('GLOBAL');

    const idsUnicosGlobales = new Set();
    db.clientes.forEach(c => {
        const idC = normalizarTexto(c[COLS.clientes.id]);
        if(idC) idsUnicosGlobales.add(idC);
    });
    const clientesTotalesBase = idsUnicosGlobales.size; 
    
    const vtasPorIdCli = {};
    db.ventas.forEach(v => {
        const idC = normalizarTexto(v[COLS.ventas.idCliente]);
        if(idC) vtasPorIdCli[idC] = (vtasPorIdCli[idC] || 0) + parseNum(v[COLS.ventas.total]);
    });
    
    let clientesVipMas1000 = 0;
    for(let idC in vtasPorIdCli) { 
        if(vtasPorIdCli[idC] >= 1000) clientesVipMas1000++; 
    }

    document.getElementById('kpiGeneral').innerHTML = `
        <div class="kpi-box destacado"><h4>Venta Global Lograda</h4><span>${formatearMoneda(vtaT)}</span></div>
        <div class="kpi-box"><h4>Meta Global Programada</h4><span style="color:#202124">${formatearMoneda(metaT)}</span></div>
        <div class="kpi-box" style="border-left: 4px solid #fbbc05;"><h4>Clientes Totales (BD)</h4><span style="color:#fbbc05">${clientesTotalesBase}</span></div>
        <div class="kpi-box" style="border-left: 4px solid #9aa0a6;"><h4>Clientes VIP (> S/ 1000)</h4><span style="color:#202124">${clientesVipMas1000}</span></div>
        <div class="kpi-box kpi-clickable" style="border-left: 4px solid #ea4335;" onclick="mostrarModalInactivos('GLOBAL', 'General')">
            <h4>Clientes Inactivos</h4><span style="color:#d93025">${inactivosGlobales.length}</span>
        </div>
    `;

    const pctGen = metaT > 0 ? (vtaT / metaT) * 100 : 0;
    document.getElementById('textoVelocimetroGeneral').textContent = pctGen.toFixed(1) + '%';
    crearOActualizarChart('chartVelocimetroGeneral', {
        type: 'doughnut',
        data: { datasets: [{ data: [vtaT, Math.max(0, metaT - vtaT)], backgroundColor: ['#34a853', '#ea4335'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, rotation: -90, circumference: 180, cutout: '75%', plugins: { legend: { display: false } } }
    });

    const canales = {};
    db.ventas.forEach(v => {
        const vend = db.vendedores.find(vd => normalizarTexto(vd[COLS.vendedores.id]) === normalizarTexto(v[COLS.ventas.idVendedor]));
        let t = vend && vend[COLS.vendedores.tipo] ? normalizarTexto(vend[COLS.vendedores.tipo]) : 'OTROS';
        canales[t||'SIN ASIGNAR'] = (canales[t||'SIN ASIGNAR'] || 0) + parseNum(v[COLS.ventas.total]);
    });

    crearOActualizarChart('chartDonaGeneral', {
        type: 'pie',
        data: { labels: Object.keys(canales), datasets: [{ data: Object.values(canales), backgroundColor: ['#1a73e8', '#fbbc05', '#34a853', '#ea4335', '#9aa0a6', '#ff6d01'].slice(0, Object.keys(canales).length) }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    const daily = {};
    db.ventas.forEach(v => {
        const fObj = parseFechaEstricta(v[COLS.ventas.fecha]);
        if (fObj) {
            if (!daily[fObj.string]) daily[fObj.string] = { val: 0, sort: fObj.sortValue };
            daily[fObj.string].val += parseNum(v[COLS.ventas.total]);
        }
    });

    const arrFechas = Object.keys(daily).map(k => ({ label: k, ...daily[k] })).sort((a, b) => a.sort - b.sort);
    crearOActualizarChart('chartLineaGeneral', {
        type: 'line',
        data: { labels: arrFechas.map(f => f.label), datasets: [{ label: 'Ingresos S/', data: arrFechas.map(f => f.val), borderColor: '#1a73e8', backgroundColor: 'rgba(26, 115, 232, 0.08)', fill: true, tension: 0.1 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    const rank = db.vendedores.filter(v => parseNum(v[COLS.vendedores.meta]) > 0).map(v => {
        const idVend = normalizarTexto(v[COLS.vendedores.id]);
        const tot = (cache.ventasPorVendedor[idVend] || []).reduce((s, vt) => s + parseNum(vt[COLS.ventas.total]), 0);
        return { n: v[COLS.vendedores.nombre] || '', p: (tot / parseNum(v[COLS.vendedores.meta])) * 100 };
    }).sort((a, b) => b.p - a.p);

    crearOActualizarChart('chartRankingMeta', {
        type: 'bar',
        data: { labels: rank.map(r => r.n), datasets: [{ label: '% Logrado', data: rank.map(r => Math.min(r.p, 100)), backgroundColor: '#1a73e8' }, { label: '% Faltante', data: rank.map(r => Math.max(0, 100 - r.p)), backgroundColor: '#dadce0' }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, max: 100 } }, plugins: { legend: { display: true, position: 'bottom' } } }
    });

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
    
    const idsUnicosVendedor = new Set();
    clientesVendedor.forEach(c => {
        const idC = normalizarTexto(c[COLS.clientes.id]);
        if(idC) idsUnicosVendedor.add(idC);
    });
    const totalCarteraVendedor = idsUnicosVendedor.size;
    const activosCount = Math.max(0, totalCarteraVendedor - inactivosCartera.length);

    document.getElementById('kpiVendedor').innerHTML = `
        <div class="kpi-box destacado"><h4>Cuota Lograda</h4><span>${formatearMoneda(totV)}</span></div>
        <div class="kpi-box"><h4>Meta Asignada</h4><span style="color:#333">${formatearMoneda(meta)}</span></div>
        <div class="kpi-box" style="border-left: 4px solid #1a73e8;"><h4>Clientes Totales (Cartera)</h4><span style="color:#1a73e8">${totalCarteraVendedor}</span></div>
        <div class="kpi-box kpi-clickable" style="border-left: 4px solid #ea4335;" onclick="mostrarModalInactivos('${idV}', '${nombreVendedor}')">
            <h4>Clientes Inactivos</h4><span style="color:#d93025">${inactivosCartera.length}</span>
        </div>
    `;

    const pctV = meta > 0 ? (totV / meta) * 100 : 0;
    document.getElementById('textoVelocimetroVendedor').textContent = pctV.toFixed(1) + '%';
    crearOActualizarChart('chartVelocimetroVendedor', {
        type: 'doughnut',
        data: { datasets: [{ data: [totV, Math.max(0, meta - totV)], backgroundColor: ['#34a853', '#ddd'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, rotation: -90, circumference: 180, cutout: '75%', plugins: { legend: { display: false } } }
    });

    crearOActualizarChart('chartDonaVendedor', {
        type: 'pie',
        data: { labels: ['Activos Registrados', 'Inactivos Registrados'], datasets: [{ data: [activosCount, inactivosCartera.length], backgroundColor: ['#34a853', '#ea4335'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    const cliVtasDir = {};
    ventasVendedor.forEach(v => {
        const idC = normalizarTexto(v[COLS.ventas.idCliente]);
        if(!idC) return;
        let raz = normalizarTexto(v[COLS.ventas.razon]);
        
        if(!raz && cache.clientesPorId[idC]) {
            raz = cache.clientesPorId[idC][COLS.clientes.razon];
        }

        if(!cliVtasDir[idC]) cliVtasDir[idC] = { razon: raz || 'ID Cliente: '+idC, total: 0 };
        cliVtasDir[idC].total += parseNum(v[COLS.ventas.total]);
    });

    const top7 = Object.values(cliVtasDir).sort((a,b) => b.total - a.total).slice(0, 7);
    const tbTop = document.querySelector('#tablaTopClientesVendedor tbody');
    tbTop.innerHTML = '';
    
    if(top7.length === 0){
        tbTop.innerHTML = `<tr><td colspan="2" style="text-align:center; color:#999;">Sin movimientos en este periodo</td></tr>`;
    } else {
        const fTop = document.createDocumentFragment();
        top7.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${c.razon}</td><td class="num-col">${formatearMoneda(c.total)}</td>`;
            fTop.appendChild(tr);
        });
        tbTop.appendChild(fTop);
    }

    const cU = {}; const cC = {};
    (cache.productosPorVendedor[idV] || []).forEach(p => {
        const n = p[COLS.productos.producto];
        const u = parseNum(p[COLS.productos.unid]);
        const c = parseNum(p[COLS.productos.caja]);
        if (n) {
            if (u > 0) cU[n] = (cU[n] || 0) + u;
            if (c > 0) cC[n] = (cC[n] || 0) + c;
        }
    });

    const renderTable = (id, obj) => {
        const tb = document.querySelector(`#${id} tbody`);
        tb.innerHTML = '';
        const keys = Object.keys(obj).sort((a, b) => obj[b] - obj[a]).slice(0, 5);
        if (keys.length === 0) { tb.innerHTML = `<tr><td colspan="2" style="text-align:center; color:#999;">Vacío</td></tr>`; return; }
        const frag = document.createDocumentFragment();
        keys.forEach(k => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${k}</td><td class="num-col">${obj[k].toLocaleString()}</td>`;
            frag.appendChild(tr);
        });
        tb.appendChild(frag);
    };

    renderTable('tablaProdUnid', cU);
    renderTable('tablaProdCaja', cC);
    
    const arrayUnicoMapaVend = Array.from(new Map(clientesVendedor.map(c => [normalizarTexto(c[COLS.clientes.id]), c])).values());
    inyectarMapaNacional('ContenedorMapaVendedor', arrayUnicoMapaVend);
}

function cargarDataSituacion() {
    if (!db.ventas.length || !db.clientes.length) return;

    const vT = db.ventas.reduce((s, v) => s + parseNum(v[COLS.ventas.total]), 0);
    const lV = db.ventas.length;
    document.getElementById('kpiTicketPromedio').textContent = formatearMoneda(lV > 0 ? vT / lV : 0);

    const ventasPorCliente = {};
    db.ventas.forEach(v => {
        const idC = normalizarTexto(v[COLS.ventas.idCliente]);
        if (!idC) return;
        let raz = normalizarTexto(v[COLS.ventas.razon]);

        if(!raz && cache.clientesPorId[idC]) {
            raz = cache.clientesPorId[idC][COLS.clientes.razon];
        }

        if(!ventasPorCliente[idC]) ventasPorCliente[idC] = { n: raz || 'ID Cliente: '+idC, t: 0 };
        ventasPorCliente[idC].t += parseNum(v[COLS.ventas.total]);
    });

    document.getElementById('kpiFrecuencia').textContent = Object.keys(ventasPorCliente).length > 0
        ? (lV / Object.keys(ventasPorCliente).length).toFixed(1) : '0.0';

    document.getElementById('kpiRiesgo').textContent = obtenerInactivosReales('GLOBAL').length;

    const arrABC = Object.values(ventasPorCliente).sort((a, b) => b.t - a.t);
    const tb = document.querySelector('#tablaABC tbody');
    tb.innerHTML = '';
    let sAc = 0;
    const frag = document.createDocumentFragment();

    arrABC.forEach(c => {
        sAc += c.t;
        const pct = vT > 0 ? (sAc / vT) * 100 : 0;
        const sg = pct <= 80 ? 'A (Top)' : (pct <= 95 ? 'B (Medio)' : 'C (Crítico)');
        const cs = pct <= 80 ? 'badge-a' : (pct <= 95 ? 'badge-b' : 'badge-c');

        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${c.n}</td><td><span class="badge ${cs}">${sg}</span></td><td class="num-col">${formatearMoneda(c.t)}</td>`;
        frag.appendChild(tr);
    });
    tb.appendChild(frag);

    const mapActivosSegmento = new Map();
    db.clientes.forEach(c => {
        const idC = normalizarTexto(c[COLS.clientes.id]);
        if(idC && cache.ventasPorIdCliente[idC]) {
            mapActivosSegmento.set(idC, c); 
        }
    });

    inyectarMapaNacional('ContenedorMapaSituacion', mapActivosSegmento.size ? Array.from(mapActivosSegmento.values()) : db.clientes);
}

function buscarAutocompleteCliente(texto) {
    const ul = document.getElementById('listaSugerenciasClientes');
    texto = normalizarTexto(texto);
    
    if (texto.length < 2) { ul.style.display = 'none'; return; }
    
    const resultadosUnicos = new Map();
    
    for(let i = 0; i < db.clientes.length; i++) {
        const c = db.clientes[i];
        const idC = normalizarTexto(c[COLS.clientes.id]);
        if(!idC) continue;

        const d = c[COLS.clientes.documento] || '';
        const r = c[COLS.clientes.razon] || '';
        
        const searchStr = normalizarTexto(d + " " + r);
        if(searchStr.includes(texto) && !resultadosUnicos.has(idC)) {
            resultadosUnicos.set(idC, { doc: d, razon: r });
            if(resultadosUnicos.size >= 15) break;
        }
    }
    
    let html = '';
    resultadosUnicos.forEach((datos, idC) => {
        const rSafe = datos.razon.replace(/'/g, "\\'");
        html += `<li onclick="seleccionarSugerencia('${idC}', '${datos.doc}', '${rSafe}')">
            <strong>${datos.razon || 'Sin Razón Social'}</strong>
            <small>Documento: ${datos.doc}</small>
        </li>`;
    });
    
    if(html === '') html = '<li style="color:#999; text-align:center; cursor:default;">No se encontraron resultados</li>';
    ul.innerHTML = html;
    ul.style.display = 'block';
}

function seleccionarSugerencia(idC, doc, razon) {
    document.getElementById('listaSugerenciasClientes').style.display = 'none';
    document.getElementById('inputBusquedaCliente').value = razon || doc;
    mostrarDetalleCliente(idC, doc, razon);
}

function mostrarDetalleCliente(idC, doc, razon) {
    const panel = document.getElementById('panelDetalleCliente');
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';

    document.getElementById('detalleNombreCliente').textContent = razon || 'Cliente Innominado';
    document.getElementById('detalleDocCliente').textContent = doc || idC;

    const susVtas = cache.ventasPorIdCliente[idC] || [];

    const totalFacturado = susVtas.reduce((s, v) => s + parseNum(v[COLS.ventas.total]), 0);
    document.getElementById('detalleTotalVenta').textContent = formatearMoneda(totalFacturado);

    const estBadge = totalFacturado > 0
        ? '<span class="badge badge-activo">ACTIVO COMPRADOR</span>'
        : '<span class="badge badge-inactivo">INACTIVO SIN COMPRAS</span>';
    document.getElementById('detalleEstadoCli').innerHTML = estBadge;

    const hist = {};
    susVtas.forEach(v => {
        const fObj = parseFechaEstricta(v[COLS.ventas.fecha]);
        if (fObj) {
            if (!hist[fObj.string]) hist[fObj.string] = { val: 0, sort: fObj.sortValue };
            hist[fObj.string].val += parseNum(v[COLS.ventas.total]);
        }
    });

    const hArr = Object.keys(hist).map(k => ({ label: k, ...hist[k] })).sort((a, b) => a.sort - b.sort);
    crearOActualizarChart('chartClienteHistorial', {
        type: 'bar',
        data: { labels: hArr.map(f => f.label), datasets: [{ label: 'Compras S/', data: hArr.map(f => f.val), backgroundColor: '#34a853', borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    const prds = {};
    db.productos.filter(p => {
        const pIdC = normalizarTexto(p[COLS.productos.idCliente]);
        const pDoc = normalizarTexto(p[COLS.productos.documento]);
        if(pIdC && idC) return pIdC === idC; 
        if(pDoc && doc) return pDoc === doc; 
        return false;
    }).forEach(p => {
        const n = p[COLS.productos.producto];
        const u = parseNum(p[COLS.productos.unid]);
        const c = parseNum(p[COLS.productos.caja]);
        if (n) {
            if (!prds[n]) prds[n] = { u: 0, c: 0 };
            prds[n].u += u; prds[n].c += c;
        }
    });

    const tb = document.querySelector('#tablaClienteProductos tbody');
    tb.innerHTML = '';
    const keysPrd = Object.keys(prds).sort((a, b) => (prds[b].u + prds[b].c) - (prds[a].u + prds[a].c));

    if (keysPrd.length === 0) {
        tb.innerHTML = `<tr><td colspan="2" style="text-align:center; color:#999;">Sin transacciones de ítems en BD</td></tr>`;
    } else {
        const frag = document.createDocumentFragment();
        keysPrd.forEach(k => {
            const tr = document.createElement('tr');
            const sumStr = prds[k].c > 0 ? `${prds[k].c} cjs` : `${prds[k].u} und`;
            tr.innerHTML = `<td>${k}</td><td class="num-col">${sumStr}</td>`;
            frag.appendChild(tr);
        });
        tb.appendChild(frag);
    }
}

function mostrarModalInactivos(idVendedor, nombreVendedor) {
    document.getElementById('tituloModalInactivos').textContent = `Clientes Inactivos de: ${nombreVendedor}`;
    const tb = document.querySelector('#tablaInactivos tbody');
    tb.innerHTML = '';

    const clientesInactivos = obtenerInactivosReales(idVendedor);

    if (clientesInactivos.length === 0) {
        tb.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px; color:#666;">No hay clientes marcados como inactivos en la base de datos.</td></tr>`;
    } else {
        const frag = document.createDocumentFragment();
        clientesInactivos.forEach(c => {
            const tr = document.createElement('tr');
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

// DISPARO INMEDIATO DE PRECARGA AL CARGAR LA PÁGINA EN EL NAVEGADOR
document.addEventListener('DOMContentLoaded', inicializarApp);
