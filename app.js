const urls = {
    vendedores: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=0&single=true&output=csv',
    ventas: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=588620531&single=true&output=csv',
    productos: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1241891503&single=true&output=csv',
    clientes: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1344644608&single=true&output=csv'
};

let db = {
    vendedores: [],
    ventas: [],
    productos: [],
    clientes: []
};

let charts = {};
let mapasInstancias = {};
let moduloActual = 'general';
let vendedorSeleccionadoActivo = null;

let COLS = {
    vendedores: {},
    ventas: {},
    productos: {},
    clientes: {}
};

let cache = {
    ventasPorVendedor: {},
    clientesPorVendedor: {},
    ventasPorDocumento: {},
    ventasPorRazon: {},
    productosPorDocumento: {},
    productosPorVendedor: {},
    clientesPorDocumento: {}
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
        if (parts[0].length === 4) {
            year = parts[0];
            month = parts[1];
            day = parts[2];
        } else {
            day = parts[0];
            month = parts[1];
            year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        }
    } else if (baseStr.includes('-')) {
        const parts = baseStr.split('-');
        if (parts.length !== 3) return null;
        if (parts[0].length === 4) {
            year = parts[0];
            month = parts[1];
            day = parts[2];
        } else {
            day = parts[0];
            month = parts[1];
            year = parts[2];
        }
    } else {
        return null;
    }

    day = String(day).padStart(2, '0');
    month = String(month).padStart(2, '0');

    const fecha = new Date(`${year}-${month}-${day}T12:00:00`);
    if (isNaN(fecha.getTime())) return null;

    return {
        string: `${day}/${month}`,
        sortValue: fecha.getTime()
    };
}

function cargarCSV(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(url, {
            download: true,
            header: true,
            skipEmptyLines: true,
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
            total: getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']),
            fecha: getColExacto(db.ventas[0], ['FECHA DE VENTA', 'FECHA']),
            documento: getColExacto(db.ventas[0], ['Documento_Numero', 'RUC', 'DNI', 'ID_CLIENTE']),
            razon: getColExacto(db.ventas[0], ['RAZÓN SOCIAL', 'RAZON SOCIAL', 'NOMBRE'])
        },
        productos: {
            idVendedor: getColExacto(db.productos[0], ['ID_VENDEDOR']),
            documento: getColExacto(db.productos[0], ['Documento_Numero', 'RUC', 'DNI', 'ID_CLIENTE']),
            producto: getColExacto(db.productos[0], ['NOMBRE DEL PRODUCTO', 'PRODUCTO']),
            unid: getColExacto(db.productos[0], ['CANTIDAD UNID', 'UNID']),
            caja: getColExacto(db.productos[0], ['CANTIDAD CAJA', 'CAJA'])
        },
        clientes: {
            id: getColExacto(db.clientes[0], ['ID_CLIENTE', 'RUC', 'DNI', 'Documento_Numero']),
            documento: getColExacto(db.clientes[0], ['Documento_Numero', 'RUC', 'DNI', 'ID_CLIENTE']),
            razon: getColExacto(db.clientes[0], ['RAZÓN SOCIAL', 'RAZON SOCIAL', 'NOMBRE']),
            ubicacion: getColExacto(db.clientes[0], ['UBICACIÓN', 'UBICACION', 'DIRECCION']),
            idVendedor: getColExacto(db.clientes[0], ['ID_VENDEDOR']),
            estado: getColExacto(db.clientes[0], ['ESTADO DE VENTA', 'ESTADO'])
        }
    };
}

function generarIndices() {
    cache = {
        ventasPorVendedor: {},
        clientesPorVendedor: {},
        ventasPorDocumento: {},
        ventasPorRazon: {},
        productosPorDocumento: {},
        productosPorVendedor: {},
        clientesPorDocumento: {}
    };

    db.ventas.forEach(v => {
        const idV = normalizarTexto(v[COLS.ventas.idVendedor]);
        const doc = normalizarTexto(v[COLS.ventas.documento]);
        const raz = normalizarTexto(v[COLS.ventas.razon]);

        if (idV) {
            if (!cache.ventasPorVendedor[idV]) cache.ventasPorVendedor[idV] = [];
            cache.ventasPorVendedor[idV].push(v);
        }

        if (doc) {
            if (!cache.ventasPorDocumento[doc]) cache.ventasPorDocumento[doc] = [];
            cache.ventasPorDocumento[doc].push(v);
        }

        if (raz) {
            if (!cache.ventasPorRazon[raz]) cache.ventasPorRazon[raz] = [];
            cache.ventasPorRazon[raz].push(v);
        }
    });

    db.clientes.forEach(c => {
        const idV = normalizarTexto(c[COLS.clientes.idVendedor]);
        const doc = normalizarTexto(c[COLS.clientes.documento]);

        if (idV) {
            if (!cache.clientesPorVendedor[idV]) cache.clientesPorVendedor[idV] = [];
            cache.clientesPorVendedor[idV].push(c);
        }

        if (doc) {
            cache.clientesPorDocumento[doc] = c;
        }
    });

    db.productos.forEach(p => {
        const idV = normalizarTexto(p[COLS.productos.idVendedor]);
        const doc = normalizarTexto(p[COLS.productos.documento]);

        if (idV) {
            if (!cache.productosPorVendedor[idV]) cache.productosPorVendedor[idV] = [];
            cache.productosPorVendedor[idV].push(p);
        }

        if (doc) {
            if (!cache.productosPorDocumento[doc]) cache.productosPorDocumento[doc] = [];
            cache.productosPorDocumento[doc].push(p);
        }
    });
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

async function inicializarApp() {
    try {
        const [resVend, resVent, resProd, resCli] = await Promise.all([
            cargarCSV(urls.vendedores),
            cargarCSV(urls.ventas),
            cargarCSV(urls.productos),
            cargarCSV(urls.clientes)
        ]);

        db.vendedores = resVend;
        db.ventas = resVent;
        db.productos = resProd;
        db.clientes = resCli;

        inicializarColumnas();
        generarIndices();
        generarMenuVendedores();

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
        document.querySelectorAll('.modulos-list li').forEach(el => {
            el.classList.remove('active');
        });

        if (elemento) elemento.classList.add('active');

        document.querySelectorAll('.modulo-view').forEach(v => {
            v.style.display = 'none';
        });

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
                } else {
                    if (vendedorSeleccionadoActivo) {
                        cargarDataVendedor(vendedorSeleccionadoActivo);
                    }
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
            Object.values(mapasInstancias).forEach(m => {
                if (m?.instance) {
                    m.instance.invalidateSize();
                }
            });
        }, 100);
    });
}

function generarMenuVendedores() {
    const lista = document.getElementById('listaVendedoresHorizontal');
    lista.innerHTML = '';

    if (!db.vendedores.length) return;

    const cM = COLS.vendedores.meta;
    const cN = COLS.vendedores.nombre;
    const cA = COLS.vendedores.apellido;

    db.vendedores
        .filter(v => parseNum(v[cM]) > 0 && normalizarTexto(v[cN]) !== 'RETIRADO')
        .forEach(v => {
            const li = document.createElement('li');
            li.textContent = `${v[cN] || ''} ${v[cA] || ''}`.trim();
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

        mapasInstancias[idContenedorPadre] = {
            instance: map,
            layerGroup: L.featureGroup().addTo(map)
        };
    }

    const mapaObj = mapasInstancias[idContenedorPadre];
    mapaObj.layerGroup.clearLayers();

    const dicZonas = {
        'AREQUIPA': [-16.40, -71.53],
        'CUSCO': [-13.53, -71.96],
        'TRUJILLO': [-8.10, -79.02],
        'CHICLAYO': [-6.77, -79.84],
        'PIURA': [-5.19, -80.62],
        'IQUITOS': [-3.74, -73.25],
        'HUANCAYO': [-12.06, -75.20],
        'TACNA': [-18.01, -70.25],
        'CAJAMARCA': [-7.16, -78.51],
        'PUNO': [-15.84, -70.02],
        'LIMA': [-12.04, -77.02],
        'CALLAO': [-12.05, -77.13],
        'ATE': [-12.02, -76.91],
        'SURCO': [-12.13, -76.99],
        'COMAS': [-11.93, -77.04]
    };

    const ventasPorDoc = {};
    db.ventas.forEach(v => {
        const doc = normalizarTexto(v[COLS.ventas.documento]);
        if (!doc) return;
        ventasPorDoc[doc] = (ventasPorDoc[doc] || 0) + parseNum(v[COLS.ventas.total]);
    });

    arrayCliData.forEach(c => {
        const doc = normalizarTexto(c[COLS.clientes.documento]);
        const raz = c[COLS.clientes.razon] || 'Cliente';
        const ubi = normalizarTexto(c[COLS.clientes.ubicacion]);
        const vnt = ventasPorDoc[doc] || 0;

        let coord = dicZonas['LIMA'];
        for (const z in dicZonas) {
            if (ubi.includes(z)) {
                coord = dicZonas[z];
                break;
            }
        }

        const seedA = doc.charCodeAt(0) || 7;
        const seedB = doc.charCodeAt(1) || 11;
        const lat = coord[0] + (Math.sin(seedA) * 0.03);
        const lng = coord[1] + (Math.cos(seedB) * 0.03);
        const color = vnt > 0 ? '#34a853' : '#ea4335';

        const marker = L.marker([lat, lng], {
            icon: L.divIcon({
                html: `<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>`,
                className: 'custom-pin'
            })
        }).bindPopup(
            `<b>${raz}</b><br>Facturación Total: S/ ${vnt.toLocaleString()}<br><small>${c[COLS.clientes.ubicacion] || ''}</small>`
        );

        mapaObj.layerGroup.addLayer(marker);
    });

    if(arrayCliData.length > 0 && mapaObj.layerGroup.getLayers().length > 2) {
        clearTimeout(mapaObj.fitTimeout);
        mapaObj.fitTimeout = setTimeout(() => {
            mapaObj.instance.fitBounds(
                mapaObj.layerGroup.getBounds(),
                { padding:[20,20], maxZoom:10 }
            );
        }, 120);
    }
}

function obtenerInactivosReales(idVendedorFiltro) {
    const idCliVentas = COLS.ventas.documento;
    const idCliDirect = COLS.clientes.documento;
    const colIdVendDir = COLS.clientes.idVendedor;
    const colIdVendVentas = COLS.ventas.idVendedor;

    const compradoresActivos = new Set();

    db.ventas.forEach(v => {
        const idClie = normalizarTexto(v[idCliVentas]);
        const idVendVenta = normalizarTexto(v[colIdVendVentas]);

        if (!idClie) return;

        if (idVendedorFiltro === 'GLOBAL') {
            compradoresActivos.add(idClie);
        } else if (idVendVenta === idVendedorFiltro) {
            compradoresActivos.add(idClie);
        }
    });

    return db.clientes.filter(c => {
        const idCliente = normalizarTexto(c[idCliDirect]);
        const vendedorAsignadoEnDirectorio = normalizarTexto(c[colIdVendDir]);
        const perteneceAlVendedor = (idVendedorFiltro === 'GLOBAL') ? true : (vendedorAsignadoEnDirectorio === idVendedorFiltro);
        const noTieneVentasEnElContexto = idCliente && !compradoresActivos.has(idCliente);
        return perteneceAlVendedor && noTieneVentasEnElContexto;
    });
}

function cargarDataGeneral() {
    if (!db.vendedores.length || !db.ventas.length || !db.clientes.length) return;

    const metaT = db.vendedores.reduce((s, v) => s + parseNum(v[COLS.vendedores.meta]), 0);
    const vtaT = db.ventas.reduce((s, v) => s + parseNum(v[COLS.ventas.total]), 0);
    const inactivosGlobales = obtenerInactivosReales('GLOBAL');

    // Novedad: Contar Clientes Totales de BD y Clientes que facturan más de S/ 1000
    const clientesTotalesBase = db.clientes.length;
    const vtasPorDoc = {};
    db.ventas.forEach(v => {
        const d = normalizarTexto(v[COLS.ventas.documento]);
        if(d) vtasPorDoc[d] = (vtasPorDoc[d] || 0) + parseNum(v[COLS.ventas.total]);
    });
    let clientesVipMas1000 = 0;
    for(let doc in vtasPorDoc) {
        if(vtasPorDoc[doc] >= 1000) clientesVipMas1000++;
    }

    document.getElementById('kpiGeneral').innerHTML = `
        <div class="kpi-box destacado">
            <h4>Venta Global Lograda</h4>
            <span>${formatearMoneda(vtaT)}</span>
        </div>
        <div class="kpi-box">
            <h4>Meta Global Programada</h4>
            <span style="color:#202124">${formatearMoneda(metaT)}</span>
        </div>
        <div class="kpi-box" style="border-left: 4px solid #fbbc05;">
            <h4>Clientes Totales (BD)</h4>
            <span style="color:#fbbc05">${clientesTotalesBase}</span>
        </div>
        <div class="kpi-box" style="border-left: 4px solid #9aa0a6;">
            <h4>Clientes VIP (> S/ 1000)</h4>
            <span style="color:#202124">${clientesVipMas1000}</span>
        </div>
        <div class="kpi-box kpi-clickable" style="border-left: 4px solid #ea4335;" onclick="mostrarModalInactivos('GLOBAL', 'General')">
            <h4>Clientes Inactivos</h4>
            <span style="color:#d93025">${inactivosGlobales.length}</span>
        </div>
    `;

    const pctGen = metaT > 0 ? (vtaT / metaT) * 100 : 0;
    document.getElementById('textoVelocimetroGeneral').textContent = pctGen.toFixed(1) + '%';

    crearOActualizarChart('chartVelocimetroGeneral', {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [vtaT, Math.max(0, metaT - vtaT)],
                backgroundColor: ['#34a853', '#ea4335'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            rotation: -90,
            circumference: 180,
            cutout: '75%',
            plugins: { legend: { display: false } }
        }
    });

    const canales = {};
    db.ventas.forEach(v => {
        const vend = db.vendedores.find(vd => normalizarTexto(vd[COLS.vendedores.id]) === normalizarTexto(v[COLS.ventas.idVendedor]));
        let t = vend && vend[COLS.vendedores.tipo] ? normalizarTexto(vend[COLS.vendedores.tipo]) : 'OTROS';
        if (!t) t = 'SIN ASIGNAR';
        canales[t] = (canales[t] || 0) + parseNum(v[COLS.ventas.total]);
    });

    const coloresDona = ['#1a73e8', '#fbbc05', '#34a853', '#ea4335', '#9aa0a6', '#ff6d01'];
    crearOActualizarChart('chartDonaGeneral', {
        type: 'pie',
        data: {
            labels: Object.keys(canales),
            datasets: [{
                data: Object.values(canales),
                backgroundColor: coloresDona.slice(0, Object.keys(canales).length)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });

    const daily = {};
    db.ventas.forEach(v => {
        const fObj = parseFechaEstricta(v[COLS.ventas.fecha]);
        if (fObj) {
            if (!daily[fObj.string]) daily[fObj.string] = { val: 0, sort: fObj.sortValue };
            daily[fObj.string].val += parseNum(v[COLS.ventas.total]);
        }
    });

    const arrFechas = Object.keys(daily)
        .map(k => ({ label: k, ...daily[k] }))
        .sort((a, b) => a.sort - b.sort);

    crearOActualizarChart('chartLineaGeneral', {
        type: 'line',
        data: {
            labels: arrFechas.map(f => f.label),
            datasets: [{
                label: 'Ingresos Diarios (S/)',
                data: arrFechas.map(f => f.val),
                borderColor: '#1a73e8',
                backgroundColor: 'rgba(26, 115, 232, 0.08)',
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });

    const rank = db.vendedores
        .filter(v => parseNum(v[COLS.vendedores.meta]) > 0)
        .map(v => {
            const idVend = normalizarTexto(v[COLS.vendedores.id]);
            const tot = (cache.ventasPorVendedor[idVend] || []).reduce((s, vt) => s + parseNum(vt[COLS.ventas.total]), 0);
            return {
                n: v[COLS.vendedores.nombre] || '',
                p: (tot / parseNum(v[COLS.vendedores.meta])) * 100
            };
        })
        .sort((a, b) => b.p - a.p);

    crearOActualizarChart('chartRankingMeta', {
        type: 'bar',
        data: {
            labels: rank.map(r => r.n),
            datasets: [
                {
                    label: '% Logrado',
                    data: rank.map(r => Math.min(r.p, 100)),
                    backgroundColor: '#1a73e8'
                },
                {
                    label: '% Faltante',
                    data: rank.map(r => Math.max(0, 100 - r.p)),
                    backgroundColor: '#dadce0'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true },
                y: { stacked: true, max: 100 }
            },
            plugins: { legend: { display: true, position: 'bottom' } }
        }
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
    const activosCount = Math.max(0, clientesVendedor.length - inactivosCartera.length);

    document.getElementById('kpiVendedor').innerHTML = `
        <div class="kpi-box destacado">
            <h4>Cuota Lograda</h4>
            <span>${formatearMoneda(totV)}</span>
        </div>
        <div class="kpi-box">
            <h4>Meta Asignada</h4>
            <span style="color:#333">${formatearMoneda(meta)}</span>
        </div>
        <div class="kpi-box" style="border-left: 4px solid #1a73e8;">
            <h4>Clientes Totales (Cartera)</h4>
            <span style="color:#1a73e8">${clientesVendedor.length}</span>
        </div>
        <div class="kpi-box kpi-clickable" style="border-left: 4px solid #ea4335;" onclick="mostrarModalInactivos('${idV}', '${nombreVendedor}')">
            <h4>Clientes Inactivos</h4>
            <span style="color:#d93025">${inactivosCartera.length}</span>
        </div>
    `;

    const pctV = meta > 0 ? (totV / meta) * 100 : 0;
    document.getElementById('textoVelocimetroVendedor').textContent = pctV.toFixed(1) + '%';

    crearOActualizarChart('chartVelocimetroVendedor', {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [totV, Math.max(0, meta - totV)],
                backgroundColor: ['#34a853', '#ddd'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            rotation: -90,
            circumference: 180,
            cutout: '75%',
            plugins: { legend: { display: false } }
        }
    });

    crearOActualizarChart('chartDonaVendedor', {
        type: 'pie',
        data: {
            labels: ['Activos Comprando', 'Inactivos (Riesgo)'],
            datasets: [{
                data: [activosCount, inactivosCartera.length],
                backgroundColor: ['#34a853', '#ea4335']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });

    // Calcular Ranking de TOP 7 Clientes del Vendedor
    const cliVtasDir = {};
    ventasVendedor.forEach(v => {
        const doc = normalizarTexto(v[COLS.ventas.documento]);
        let raz = normalizarTexto(v[COLS.ventas.razon]);
        const key = doc || raz;
        if(!key) return;

        if(!raz && doc && cache.clientesPorDocumento[doc]) {
            raz = cache.clientesPorDocumento[doc][COLS.clientes.razon];
        }

        if(!cliVtasDir[key]) cliVtasDir[key] = { razon: raz || doc, total: 0 };
        cliVtasDir[key].total += parseNum(v[COLS.ventas.total]);
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

    const pColN = COLS.productos.producto;
    const pColU = COLS.productos.unid;
    const pColC = COLS.productos.caja;

    const cU = {};
    const cC = {};

    (cache.productosPorVendedor[idV] || []).forEach(p => {
        const n = p[pColN];
        const u = parseNum(p[pColU]);
        const c = parseNum(p[pColC]);

        if (n) {
            if (u > 0) cU[n] = (cU[n] || 0) + u;
            if (c > 0) cC[n] = (cC[n] || 0) + c;
        }
    });

    const renderTable = (id, obj, emptyMsg) => {
        const tb = document.querySelector(`#${id} tbody`);
        tb.innerHTML = '';
        const keys = Object.keys(obj).sort((a, b) => obj[b] - obj[a]).slice(0, 5);

        if (keys.length === 0) {
            tb.innerHTML = `<tr><td colspan="2" style="text-align:center; color:#999;">${emptyMsg}</td></tr>`;
            return;
        }

        const frag = document.createDocumentFragment();
        keys.forEach(k => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${k}</td><td class="num-col">${obj[k].toLocaleString()}</td>`;
            frag.appendChild(tr);
        });
        tb.appendChild(frag);
    };

    renderTable('tablaProdUnid', cU, 'Sin movimientos en este periodo');
    renderTable('tablaProdCaja', cC, 'Sin movimientos en este periodo');

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
        let raz = normalizarTexto(v[COLS.ventas.razon]);
        const key = doc || raz;
        if (!key) return;

        // Si no hay razón social en ventas, la sacamos de la tabla clientes
        if(!raz && doc && cache.clientesPorDocumento[doc]) {
            raz = cache.clientesPorDocumento[doc][COLS.clientes.razon];
        }

        if(!ventasPorCliente[key]) ventasPorCliente[key] = { n: raz || doc, t: 0 };
        ventasPorCliente[key].t += parseNum(v[COLS.ventas.total]);
    });

    document.getElementById('kpiFrecuencia').textContent = Object.keys(ventasPorCliente).length > 0
        ? (lV / Object.keys(ventasPorCliente).length).toFixed(1)
        : '0.0';

    const riesgoContador = obtenerInactivosReales('GLOBAL').length;
    document.getElementById('kpiRiesgo').textContent = riesgoContador;

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

    const clientesActivosSegmento = db.clientes.filter(c => {
        const doc = normalizarTexto(c[COLS.clientes.documento]);
        const raz = normalizarTexto(c[COLS.clientes.razon]);
        return (doc && cache.ventasPorDocumento[doc]) || (raz && cache.ventasPorRazon[raz]);
    });

    inyectarMapaNacional(
        'ContenedorMapaSituacion',
        clientesActivosSegmento.length ? clientesActivosSegmento : db.clientes
    );
}

/* SISTEMA DE AUTOCOMPLETADO PARA BÚSQUEDA */
function buscarAutocompleteCliente(texto) {
    const ul = document.getElementById('listaSugerenciasClientes');
    texto = normalizarTexto(texto);
    
    if (texto.length < 2) {
        ul.style.display = 'none';
        return;
    }
    
    let limit = 0;
    let html = '';
    
    for(let i = 0; i < db.clientes.length; i++) {
        const c = db.clientes[i];
        const d = c[COLS.clientes.documento] || '';
        const r = c[COLS.clientes.razon] || '';
        
        const searchStr = normalizarTexto(d + " " + r);
        if(searchStr.includes(texto)) {
            // Reemplazamos apóstrofes para evitar errores en onclick
            const rSafe = r.replace(/'/g, "\\'");
            html += `<li onclick="seleccionarSugerencia('${d}', '${rSafe}')">
                <strong>${r || 'Sin Razón Social'}</strong>
                <small>Documento: ${d}</small>
            </li>`;
            limit++;
            if(limit >= 15) break;
        }
    }
    
    if(html === '') {
        html = '<li style="color:#999; text-align:center; cursor:default;">No se encontraron resultados</li>';
    }
    
    ul.innerHTML = html;
    ul.style.display = 'block';
}

function seleccionarSugerencia(doc, razon) {
    document.getElementById('listaSugerenciasClientes').style.display = 'none';
    document.getElementById('inputBusquedaCliente').value = razon || doc;
    mostrarDetalleCliente(doc, razon);
}

function mostrarDetalleCliente(doc, razon) {
    const panel = document.getElementById('panelDetalleCliente');
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';

    document.getElementById('detalleNombreCliente').textContent = razon || 'Cliente Innominado';
    document.getElementById('detalleDocCliente').textContent = doc || 'Sin Identificación';

    const susVtas = db.ventas.filter(v => {
        const vDoc = normalizarTexto(v[COLS.ventas.documento]);
        const vRaz = normalizarTexto(v[COLS.ventas.razon]);
        return (doc && vDoc === normalizarTexto(doc)) || (razon && vRaz === normalizarTexto(razon));
    });

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

    const hArr = Object.keys(hist)
        .map(k => ({ label: k, ...hist[k] }))
        .sort((a, b) => a.sort - b.sort);

    crearOActualizarChart('chartClienteHistorial', {
        type: 'bar',
        data: {
            labels: hArr.map(f => f.label),
            datasets: [{
                label: 'Compras S/',
                data: hArr.map(f => f.val),
                backgroundColor: '#34a853',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });

    const prds = {};
    const pColD = COLS.productos.documento;
    const pColN = COLS.productos.producto;
    const pColC = COLS.productos.caja;
    const pColU = COLS.productos.unid;

    db.productos.filter(p => doc && normalizarTexto(p[pColD]) === normalizarTexto(doc)).forEach(p => {
        const n = p[pColN];
        const u = parseNum(p[pColU]);
        const c = parseNum(p[pColC]);

        if (n) {
            if (!prds[n]) prds[n] = { u: 0, c: 0 };
            prds[n].u += u;
            prds[n].c += c;
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

    const docC = COLS.clientes.documento;
    const razC = COLS.clientes.razon;
    const estC = COLS.clientes.estado;

    if (clientesInactivos.length === 0) {
        tb.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px; color:#666;">¡Felicidades! Toda la cartera registra compras efectivas.</td></tr>`;
    } else {
        const frag = document.createDocumentFragment();
        clientesInactivos.forEach(c => {
            const est = c[estC] || 'INACTIVO';
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${c[docC] || '---'}</td><td>${c[razC] || '---'}</td><td><span class="badge badge-inactivo">${est}</span></td>`;
            frag.appendChild(tr);
        });
        tb.appendChild(frag);
    }

    document.getElementById('modalInactivos').style.display = 'flex';
}

function cerrarModalInactivos() {
    document.getElementById('modalInactivos').style.display = 'none';
}

// Cerramos la lista de autocompletado si el usuario hace clic fuera de ella
document.addEventListener('click', function(e) {
    const list = document.getElementById('listaSugerenciasClientes');
    const input = document.getElementById('inputBusquedaCliente');
    if(list && input && e.target !== input && e.target !== list && !list.contains(e.target)) {
        list.style.display = 'none';
    }
});
