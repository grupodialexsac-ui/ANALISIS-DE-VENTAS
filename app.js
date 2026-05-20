// =========================================
// CONFIGURACIÓN DE ORIGENES DE DATOS GOOGLE
// =========================================
const urls = {
    vendedores: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=0&single=true&output=csv',
    ventas: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=588620531&single=true&output=csv',
    productos: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1241891503&single=true&output=csv',
    clientes: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1344644608&single=true&output=csv'
};

// Bases de datos locales en memoria virtual
let db = { vendedores: [], ventas: [], productos: [], clientes: [] };

// Almacenamiento centralizado de instancias para evitar desbordamiento y bloqueos de interfaz
let charts = {}; 
let mapasInstancias = {}; 
let moduloActual = 'general';
let vendedorSeleccionadoActivo = null;

// =========================================
// UTILIDADES DE PROCESAMIENTO MATEMÁTICO Y TEXTO
// =========================================
function normalizarTexto(t) { return t ? String(t).replace(/\s+/g, ' ').trim().toUpperCase() : ''; }

function getColExacto(obj, opciones) {
    if(!obj) return null;
    let keys = Object.keys(obj);
    for (let op of opciones) { 
        let opL = normalizarTexto(op); 
        let found = keys.find(k => normalizarTexto(k) === opL); 
        if(found) return found; 
    }
    for (let op of opciones) { 
        let opL = normalizarTexto(op); 
        let found = keys.find(k => normalizarTexto(k).includes(opL)); 
        if(found) return found; 
    }
    return keys[0]; 
}

function parseNum(val) { 
    let num = parseFloat(String(val||'').replace(/,/g, '')); 
    return isNaN(num) ? 0 : num; 
}

function formatearMoneda(val) { 
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(val); 
}

// ARREGLO POLIMÓRFICO DE FECHAS (Previene fallos en configuraciones regionales de Sheets)
function parseFechaEstricta(dStr) {
    if(!dStr) return null;
    let baseStr = String(dStr).split(' ')[0].trim();
    let day, month, year;
    
    if (baseStr.includes('/')) {
        let parts = baseStr.split('/');
        if(parts.length !== 3) return null;
        if (parts[0].length === 4) {
            year = parts[0]; month = parts[1]; day = parts[2];
        } else {
            day = parts[0]; month = parts[1]; year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        }
    } else if (baseStr.includes('-')) {
        let parts = baseStr.split('-');
        if(parts.length !== 3) return null;
        if (parts[0].length === 4) {
            year = parts[0]; month = parts[1]; day = parts[2];
        } else {
            day = parts[0]; month = parts[1]; year = parts[2];
        }
    } else {
        return null;
    }
    
    day = day.padStart(2, '0');
    month = month.padStart(2, '0');
    
    return { 
        string: `${day}/${month}`, 
        sortValue: new Date(`${year}-${month}-${day}T12:00:00`).getTime() 
    };
}

function cargarCSV(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(url, { download: true, header: true, skipEmptyLines: true, complete: res => resolve(res.data), error: err => reject(err) });
    });
}

function destroyChart(id) {
    if (charts[id]) {
        charts[id].destroy();
        charts[id] = null;
    }
}

// =========================================
// ACCESO Y AUTENTICACIÓN SECURE-LOOK
// =========================================
function evaluarTeclado(e) { if (e.key === 'Enter') verificarPassword(); }

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

async function inicializarApp() {
    try {
        const [resVend, resVent, resProd, resCli] = await Promise.all([
            cargarCSV(urls.vendedores), 
            cargarCSV(urls.ventas), 
            cargarCSV(urls.productos), 
            cargarCSV(urls.clientes)
        ]);
        db.vendedores = resVend; db.ventas = resVent; db.productos = resProd; db.clientes = resCli;
        
        generarMenuVendedores();
        cambiarModulo('general', document.querySelector('.modulos-list li'));
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('appContainer').style.visibility = 'visible';
    } catch (e) { 
        document.getElementById('loadingSpinner').style.display = 'none'; 
        document.getElementById('loadingTitle').textContent = "Error de sincronización con la nube. Revise permisos del CSV."; 
        document.getElementById('loadingTitle').style.color = '#d93025'; 
    }
}

// =========================================
// ARQUITECTURA DE NAVEGACIÓN (RÁPIDA Y SIN RECONSTRUIR MAPAS)
// =========================================
function cambiarModulo(modulo, elemento) {
    moduloActual = modulo;
    document.querySelectorAll('.modulos-list li').forEach(el => el.classList.remove('active'));
    if(elemento) elemento.classList.add('active');
    
    document.querySelectorAll('.modulo-view').forEach(el => el.style.display = 'none');
    document.getElementById('menuVendedoresContainer').style.display = 'none';
    
    if (modulo === 'general') {
        document.getElementById('vistaGeneral').style.display = 'block';
        document.getElementById('tituloDashboard').textContent = 'Vista General Comercial';
        cargarDataGeneral();
    } else if (modulo === 'productividad') {
        document.getElementById('vistaProductividad').style.display = 'block';
        document.getElementById('menuVendedoresContainer').style.display = 'flex';
        document.getElementById('tituloDashboard').textContent = 'Análisis de Productividad';
        
        let actLi = document.querySelector('#listaVendedoresHorizontal li.active');
        if(!actLi) { 
            let pV = document.querySelector('#listaVendedoresHorizontal li'); 
            if(pV) pV.click(); 
        } else { 
            if(vendedorSeleccionadoActivo) cargarDataVendedor(vendedorSeleccionadoActivo);
        }
    } else if (modulo === 'situacion') {
        document.getElementById('vistaSituacion').style.display = 'block';
        document.getElementById('tituloDashboard').textContent = 'Estrategia de Rentabilidad';
        cargarDataSituacion();
    } else if (modulo === 'busqueda') {
        document.getElementById('vistaBusqueda').style.display = 'block';
        document.getElementById('tituloDashboard').textContent = 'Directorio Analítico';
        llenarTablaDirectorio();
    }

    // Refrescar tamaño de los mapas de forma asíncrona para eliminar el lag o pantallas grises
    setTimeout(() => {
        for (let key in mapasInstancias) {
            if (mapasInstancias[key] && mapasInstancias[key].instance) {
                mapasInstancias[key].instance.invalidateSize();
            }
        }
    }, 50);
}

function generarMenuVendedores() {
    const lista = document.getElementById('listaVendedoresHorizontal');
    lista.innerHTML = '';
    let cM = getColExacto(db.vendedores[0], ['META']); 
    let cN = getColExacto(db.vendedores[0], ['NOMBRE']); 
    let cA = getColExacto(db.vendedores[0], ['APELLIDO']);
    
    db.vendedores.filter(v => parseNum(v[cM]) > 0 && normalizarTexto(v[cN]) !== "RETIRADO").forEach(v => {
        const li = document.createElement('li');
        li.textContent = `${v[cN]} ${v[cA] || ''}`.trim();
        li.onclick = () => {
            document.querySelectorAll('#listaVendedoresHorizontal li').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            vendedorSeleccionadoActivo = v;
            cargarDataVendedor(v);
        };
        lista.appendChild(li);
    });
}

// =========================================
// CORRECCIÓN 1: MOTOR DE MAPAS LEAFLET REUTILIZABLE (CERO LAG)
// =========================================
function inyectarMapaNacional(idContenedorPadre, arrayCliData) {
    if (!mapasInstancias[idContenedorPadre]) {
        let map = L.map(idContenedorPadre).setView([-9.1899, -75.0151], 5);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { 
            attribution: 'Dialex System' 
        }).addTo(map);
        
        mapasInstancias[idContenedorPadre] = {
            instance: map,
            layerGroup: L.featureGroup().addTo(map)
        };
    }

    let mapaObj = mapasInstancias[idContenedorPadre];
    mapaObj.layerGroup.clearLayers(); 

    let cId = getColExacto(db.clientes[0], ['ID_CLIENTE', 'RUC', 'DNI', 'Documento_Numero']); 
    let cRz = getColExacto(db.clientes[0], ['RAZÓN SOCIAL', 'NOMBRE']); 
    let cUb = getColExacto(db.clientes[0], ['UBICACIÓN', 'DIRECCION']);
    let vId = getColExacto(db.ventas[0], ['ID_CLIENTE', 'RUC', 'DNI', 'Documento_Numero']); 
    let vPr = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']);
    
    let mapVentas = {}; 
    db.ventas.forEach(v => { 
        let i = normalizarTexto(v[vId]); 
        if(i) mapVentas[i] = (mapVentas[i]||0) + parseNum(v[vPr]); 
    });

    const dicZonas = { 
        'AREQUIPA':[-16.40,-71.53], 'CUSCO':[-13.53,-71.96], 'TRUJILLO':[-8.10,-79.02], 'CHICLAYO':[-6.77,-79.84], 'PIURA':[-5.19,-80.62], 
        'IQUITOS':[-3.74,-73.25], 'HUANCAYO':[-12.06,-75.20], 'TACNA':[-18.01,-70.25], 'CAJAMARCA':[-7.16,-78.51], 'PUNO':[-15.84,-70.02], 
        'LIMA':[-12.04,-77.02], 'CALLAO':[-12.05,-77.13], 'ATE':[-12.02,-76.91], 'SURCO':[-12.13,-76.99], 'COMAS':[-11.93,-77.04]
    };

    arrayCliData.forEach(c => {
        let id = normalizarTexto(c[cId]); 
        let raz = c[cRz]||'Cliente'; 
        let ubi = normalizarTexto(c[cUb]); 
        let vnt = mapVentas[id]||0;
        
        let coord = dicZonas['LIMA']; 
        for(let z in dicZonas) { if(ubi.includes(z)) { coord = dicZonas[z]; break; } }
        
        // Jitter determinista basado en el ID para evitar superposición sin ralentizar
        let lat = coord[0] + (Math.sin(id.charCodeAt(0) || Math.random()) * 0.03); 
        let lng = coord[1] + (Math.cos(id.charCodeAt(1) || Math.random()) * 0.03);
        
        let color = vnt > 0 ? '#34a853' : '#ea4335';
        let m = L.marker([lat, lng], {
            icon: L.divIcon({ 
                html: `<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>`, 
                className: 'custom-pin' 
            })
        }).bindPopup(`<b>${raz}</b><br>Facturación Total: S/ ${vnt.toLocaleString()}<br><small>${c[cUb]||''}</small>`);
        
        mapaObj.layerGroup.addLayer(m);
    });
    
    if(arrayCliData.length > 0) { 
        mapaObj.instance.fitBounds(mapaObj.layerGroup.getBounds(), {padding:[30,30], maxZoom:11}); 
    }
}

// =========================================
// CORRECCIÓN 2: LOGICA DE INACTIVOS REALES CONTEXTUALES
// =========================================
function obtenerInactivosReales(idVendedorFiltro) {
    let idCliVentas = getColExacto(db.ventas[0], ['Documento_Numero', 'RUC', 'DNI', 'ID_CLIENTE']);
    let idCliDirect = getColExacto(db.clientes[0], ['Documento_Numero', 'RUC', 'DNI', 'ID_CLIENTE']);
    let colIdVendDir = getColExacto(db.clientes[0], ['ID_VENDEDOR']);
    let colIdVendVentas = getColExacto(db.ventas[0], ['ID_VENDEDOR']);
    
    let compradoresActivosVendedor = new Set();
    db.ventas.forEach(v => {
        let idClie = normalizarTexto(v[idCliVentas]);
        let idVendVenta = normalizarTexto(v[colIdVendVentas]);
        
        if (idVendedorFiltro === 'GLOBAL') {
            if(idClie) compradoresActivosVendedor.add(idClie);
        } else {
            if(idClie && idVendVenta === idVendedorFiltro) {
                compradoresActivosVendedor.add(idClie);
            }
        }
    });

    return db.clientes.filter(c => {
        let idCliente = normalizarTexto(c[idCliDirect]);
        let vendedorAsignadoEnDirectorio = normalizarTexto(c[colIdVendDir]);
        
        let perteneceAlVendedor = (idVendedorFiltro === 'GLOBAL') ? true : (vendedorAsignadoEnDirectorio === idVendedorFiltro);
        let noTieneVentasEnElContexto = idCliente && !compradoresActivosVendedor.has(idCliente);
        
        return perteneceAlVendedor && noTieneVentasEnElContexto;
    });
}

// =========================================
// LOGICA DE CARGA DE DATOS POR MODULO
// =========================================
function cargarDataGeneral() {
    let vColM = getColExacto(db.vendedores[0], ['META']); 
    let vColIdV = getColExacto(db.vendedores[0], ['ID_VENDEDOR']); 
    let vColT = getColExacto(db.vendedores[0], ['TIPO']);
    let vtColP = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']); 
    let vtColIdV = getColExacto(db.ventas[0], ['ID_VENDEDOR']); 
    let vtColF = getColExacto(db.ventas[0], ['FECHA DE VENTA', 'FECHA']);
    let cColId = getColExacto(db.clientes[0],['ID_CLIENTE', 'RUC', 'DNI']);
    
    let metaT = db.vendedores.reduce((s, v) => s + parseNum(v[vColM]), 0);
    let vtaT = db.ventas.reduce((s, v) => s + parseNum(v[vtColP]), 0);
    let totalClientesUnicos = new Set(db.clientes.map(c => normalizarTexto(c[cColId]))).size;
    
    document.getElementById('kpiGeneral').innerHTML = `
        <div class="kpi-box destacado"><h4>Venta Global Lograda</h4><span>${formatearMoneda(vtaT)}</span></div>
        <div class="kpi-box"><h4>Meta Global Programada</h4><span style="color:#202124">${formatearMoneda(metaT)}</span></div>
        <div class="kpi-box kpi-clickable" onclick="cambiarModulo('busqueda')"><h4>Clientes en Directorio</h4><span style="color:#202124">${totalClientesUnicos}</span></div>
    `;

    // Gráfico Velocímetro General
    let pctGen = metaT > 0 ? (vtaT / metaT) * 100 : 0;
    document.getElementById('textoVelocimetroGeneral').textContent = pctGen.toFixed(1) + '%';
    destroyChart('chartVelocimetroGeneral');
    charts['chartVelocimetroGeneral'] = new Chart(document.getElementById('chartVelocimetroGeneral').getContext('2d'), { 
        type:'doughnut', 
        data:{ datasets:[{ data:[vtaT, Math.max(0, metaT - vtaT)], backgroundColor:['#34a853','#ea4335'], borderWidth:0 }] }, 
        options:{ responsive:true, maintainAspectRatio:false, rotation:-90, circumference:180, cutout:'75%', plugins:{legend:{display:false}} } 
    });

    // Gráfico Canales (Dona)
    let can = {'CALL CENTER':0, 'COBERTURA':0};
    db.ventas.forEach(v => {
        let vend = db.vendedores.find(vd => normalizarTexto(vd[vColIdV]) === normalizarTexto(v[vtColIdV]));
        let t = vend && vend[vColT] ? normalizarTexto(vend[vColT]) : '';
        if(t.includes('CALL') || t.includes('TELE')) can['CALL CENTER'] += parseNum(v[vtColP]); 
        else can['COBERTURA'] += parseNum(v[vtColP]);
    });
    
    destroyChart('chartDonaGeneral');
    charts['chartDonaGeneral'] = new Chart(document.getElementById('chartDonaGeneral').getContext('2d'), { 
        type:'pie', 
        data:{ labels:['Call Center','Cobertura de Calle'], datasets:[{ data:[can['CALL CENTER'], can['COBERTURA']], backgroundColor:['#4285f4','#fbbc05'] }] }, 
        options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}} } 
    });

    // Gráfico Historial de Línea
    let daily = {}; 
    db.ventas.forEach(v => { 
        let fObj = parseFechaEstricta(v[vtColF]); 
        if(fObj){ daily[fObj.string] = { val: (daily[fObj.string]?.val || 0) + parseNum(v[vtColP]), sort: fObj.sortValue }; } 
    });
    let arrFechas = Object.keys(daily).map(k => ({ label: k, ...daily[k] })).sort((a,b) => a.sort - b.sort);
    
    destroyChart('chartLineasGeneral');
    charts['chartLineasGeneral'] = new Chart(document.getElementById('chartLineaGeneral').getContext('2d'), { 
        type:'line', 
        data:{ labels:arrFechas.map(f => f.label), datasets:[{ label:'Ingresos Diarios (S/)', data:arrFechas.map(f => f.val), borderColor:'#1a73e8', backgroundColor:'rgba(26, 115, 232, 0.08)', fill:true, tension:0.1 }] }, 
        options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} } 
    });

    // Ranking de Metas (Barras)
    let rank = db.vendedores.filter(v => parseNum(v[vColM]) > 0).map(v => {
        let tot = db.ventas.filter(vt => normalizarTexto(vt[vtColIdV]) === normalizarTexto(v[vColIdV])).reduce((s, vt) => s + parseNum(vt[vtColP]), 0);
        return { n: v[getColExacto(v, ['NOMBRE'])], p: (tot / parseNum(v[vColM])) * 100 };
    }).sort((a, b) => b.p - a.p);

    destroyChart('chartRankingMeta');
    charts['chartRankingMeta'] = new Chart(document.getElementById('chartRankingMeta').getContext('2d'), { 
        type:'bar', 
        data:{ labels:rank.map(r => r.n), datasets:[{ label:'Avance Comercial %', data:rank.map(r => parseFloat(r.p.toFixed(1))), backgroundColor:'#4285f4', borderRadius: 4 }] }, 
        options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ max: Math.max(...rank.map(r=>r.p), 100) } } } 
    });

    inyectarMapaNacional('ContenedorMapaGeneral', db.clientes);
}

function cargarDataVendedor(vdData) {
    document.getElementById('estadoVendedorSeleccion').style.display = 'none';
    document.getElementById('contenidoProductividad').style.display = 'block';
    
    let idV = normalizarTexto(vdData[getColExacto(vdData, ['ID_VENDEDOR'])]);
    let nombreVendedor = vdData[getColExacto(vdData, ['NOMBRE'])];
    document.getElementById('tituloDashboard').textContent = `Análisis de Rendimiento: ${nombreVendedor}`;
    
    let m = parseNum(vdData[getColExacto(vdData, ['META'])]);
    let vtColP = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']);
    let sVt = db.ventas.filter(v => normalizarTexto(v[getColExacto(v, ['ID_VENDEDOR'])]) === idV);
    let totV = sVt.reduce((s, v) => s + parseNum(v[vtColP]), 0);
    
    let sCli = db.clientes.filter(c => normalizarTexto(c[getColExacto(c, ['ID_VENDEDOR'])]) === idV);
    let inactivosCartera = obtenerInactivosReales(idV);

    document.getElementById('kpiVendedor').innerHTML = `
        <div class="kpi-box destacado"><h4>Cuota Lograda</h4><span>${formatearMoneda(totV)}</span></div>
        <div class="kpi-box"><h4>Meta Asignada</h4><span style="color:#333">${formatearMoneda(m)}</span></div>
        <div class="kpi-box kpi-clickable" style="border-left: 4px solid #ea4335;" onclick="mostrarModalInactivos('${idV}', '${nombreVendedor}')">
            <h4>Clientes Inactivos</h4><span style="color:#d93025">${inactivosCartera.length} / ${sCli.length}</span>
        </div>
    `;

    let pctV = m > 0 ? (totV / m) * 100 : 0;
    document.getElementById('textoVelocimetroVendedor').textContent = pctV.toFixed(1) + '%';
    
    destroyChart('chartVelocimetroVendedor');
    charts['chartVelocimetroVendedor'] = new Chart(document.getElementById('chartVelocimetroVendedor').getContext('2d'), { 
        type:'doughnut', 
        data:{ datasets:[{ data:[totV, Math.max(0, m - totV)], backgroundColor:['#34a853','#ddd'], borderWidth:0 }] }, 
        options:{ responsive:true, maintainAspectRatio:false, rotation:-90, circumference:180, cutout:'75%', plugins:{legend:{display:false}} } 
    });

    destroyChart('chartDonaVendedor');
    charts['chartDonaVendedor'] = new Chart(document.getElementById('chartDonaVendedor').getContext('2d'), { 
        type:'pie', 
        data:{ labels:['Efectuado','Brecha por Cumplir'], datasets:[{ data:[totV, Math.max(0, m - totV)], backgroundColor:['#1a73e8','#ea4335'] }] }, 
        options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}} } 
    });

    // Carga de matrices de productos filtradas por ID_VENDEDOR
    let pCId = getColExacto(db.productos[0], ['ID_VENDEDOR']); 
    let pCNom = getColExacto(db.productos[0], ['NOMBRE DEL PRODUCTO', 'PRODUCTO']);
    let cU = {}; let cC = {};
    
    db.productos.filter(p => normalizarTexto(p[pCId]) === idV).forEach(p => {
        let n = p[pCNom]; 
        let u = parseNum(p[getColExacto(p, ['CANTIDAD UNID', 'UNID'])]); 
        let c = parseNum(p[getColExacto(p, ['CANTIDAD CAJA', 'CAJA'])]);
        if(n) { 
            if(u > 0) cU[n] = (cU[n]||0) + u; 
            if(c > 0) cC[n] = (cC[n]||0) + c; 
        }
    });
    
    const renderTable = (id, obj) => { 
        let tb = document.querySelector(`#${id} tbody`); 
        tb.innerHTML = ''; 
        let keys = Object.keys(obj).sort((a,b) => obj[b] - obj[a]).slice(0, 5); 
        if(keys.length === 0){
            tb.innerHTML = `<tr><td colspan="2" style="text-align:center; color:#999;">Sin movimientos en este periodo</td></tr>`;
        } else {
            keys.forEach(k => tb.innerHTML += `<tr><td>${k}</td><td class="num-col">${obj[k].toLocaleString()}</td></tr>`);
        } 
    };
    renderTable('tablaProdUnid', cU); 
    renderTable('tablaProdCaja', cC);

    inyectarMapaNacional('ContenedorMapaVendedor', sCli);
}

function cargarDataSituacion() {
    let vtColP = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']); 
    let vtColR = getColExacto(db.ventas[0], ['RAZÓN SOCIAL', 'RAZON']); 
    let vT = db.ventas.reduce((s,v) => s + parseNum(v[vtColP]), 0); 
    let lV = db.ventas.length;
    
    document.getElementById('kpiTicketPromedio').textContent = formatearMoneda(lV > 0 ? vT / lV : 0);
    
    let cC = {}; 
    db.ventas.forEach(v => { 
        let r = normalizarTexto(v[vtColR]); 
        if(r) cC[r] = (cC[r]||0) + parseNum(v[vtColP]); 
    });
    document.getElementById('kpiFrecuencia').textContent = Object.keys(cC).length > 0 ? (lV / Object.keys(cC).length).toFixed(1) : '0.0';

    let riesgoContador = obtenerInactivosReales('GLOBAL').length;
    document.getElementById('kpiRiesgo').textContent = riesgoContador;

    let arrABC = Object.keys(cC).map(k => ({n:k, t:cC[k]})).sort((a,b) => b.t - a.t);
    let tb = document.querySelector('#tablaABC tbody'); 
    tb.innerHTML = ''; 
    let sAc = 0;
    
    arrABC.forEach(c => { 
        sAc += c.t; 
        let pct = (sAc / vT) * 100; 
        let sg = pct <= 80 ? 'A (Top)' : (pct <= 95 ? 'B (Medio)' : 'C (Crítico)'); 
        let cs = pct <= 80 ? 'badge-a' : (pct <= 95 ? 'badge-b' : 'badge-c'); 
        tb.innerHTML += `<tr><td>${c.n}</td><td><span class="badge ${cs}">${sg}</span></td><td class="num-col">${formatearMoneda(c.t)}</td></tr>`; 
    });

    let clientesActivosSegmento = db.clientes.filter(c => {
        let docId = normalizarTexto(c[getColExacto(c, ['Documento_Numero', 'RUC', 'DNI'])]);
        return docId && cC[docId];
    });
    inyectarMapaNacional('ContenedorMapaSituacion', clientesActivosSegmento.length ? clientesActivosSegmento : db.clientes);
}

// =========================================
// BÚSQUEDA Y DRILL-DOWN ANALÍTICO DE DETALLE
// =========================================
function llenarTablaDirectorio() {
    let tb = document.querySelector('#tablaDirectorioClientes tbody'); 
    tb.innerHTML = '';
    let docC = getColExacto(db.clientes[0], ['Documento_Numero', 'RUC', 'DNI']); 
    let razC = getColExacto(db.clientes[0], ['RAZÓN SOCIAL', 'NOMBRE']);
    
    db.clientes.forEach(c => {
        let d = c[docC]||''; let r = c[razC]||'';
        if(d || r) {
            let tr = document.createElement('tr'); 
            tr.className = 'fila-cliente';
            tr.innerHTML = `<td>${d}</td><td>${r}</td>`;
            tr.onclick = () => mostrarDetalleCliente(d, r, tr);
            tb.appendChild(tr);
        }
    });
}

function filtrarDirectorioClientes() {
    let input = normalizarTexto(document.getElementById("inputBusquedaCliente").value);
    document.querySelectorAll('#tablaDirectorioClientes .fila-cliente').forEach(f => { 
        f.style.display = normalizarTexto(f.textContent).includes(input) ? "" : "none"; 
    });
}

function mostrarDetalleCliente(doc, razon, trActivo) {
    document.querySelectorAll('.fila-cliente').forEach(f => f.classList.remove('activa'));
    if(trActivo) trActivo.classList.add('activa');
    
    let panel = document.getElementById('panelDetalleCliente');
    panel.style.display = 'flex'; 
    panel.style.flexDirection = 'column';
    
    if (window.innerWidth <= 1024) { 
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); 
    }
    
    document.getElementById('detalleNombreCliente').textContent = razon || 'Cliente Innominado';
    document.getElementById('detalleDocCliente').textContent = doc || 'Sin Identificación';

    let vColR = getColExacto(db.ventas[0], ['RAZÓN SOCIAL', 'RAZON']); 
    let vColD = getColExacto(db.ventas[0], ['Documento_Numero', 'RUC', 'DNI']); 
    let vColP = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']); 
    let vColF = getColExacto(db.ventas[0], ['FECHA DE VENTA', 'FECHA']);
    
    let susVtas = db.ventas.filter(v => {
        let vDoc = normalizarTexto(v[vColD]);
        let vRaz = normalizarTexto(v[vColR]);
        return (doc && vDoc === normalizarTexto(doc)) || (razon && vRaz === normalizarTexto(razon));
    });
    
    let totalFacturado = susVtas.reduce((s, v) => s + parseNum(v[vColP]), 0);
    document.getElementById('detalleTotalVenta').textContent = formatearMoneda(totalFacturado);
    
    let estBadge = totalFacturado > 0 ? '<span class="badge badge-activo">ACTIVO COMPRADOR</span>' : '<span class="badge badge-inactivo">INACTIVO SIN COMPRAS</span>';
    document.getElementById('detalleEstadoCli').innerHTML = estBadge;

    // Mini Historial de Barras
    let hist = {}; 
    susVtas.forEach(v => { 
        let fObj = parseFechaEstricta(v[vColF]); 
        if(fObj){ hist[fObj.string] = { val: (hist[fObj.string]?.val || 0) + parseNum(v[vColP]), sort: fObj.sortValue }; } 
    });
    let hArr = Object.keys(hist).map(k => ({ label: k, ...hist[k] })).sort((a,b) => a.sort - b.sort);

    destroyChart('chartClienteHistorial');
    charts['chartClienteHistorial'] = new Chart(document.getElementById('chartClienteHistorial').getContext('2d'), { 
        type:'bar', 
        data:{ labels:hArr.map(f => f.label), datasets:[{ label:'Compras S/', data:hArr.map(f => f.val), backgroundColor:'#34a853', borderRadius:4 }] }, 
        options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} } 
    });

    // Listado de Mix de Productos Adquiridos
    let pColD = getColExacto(db.productos[0], ['Documento_Numero', 'RUC', 'DNI']); 
    let pColN = getColExacto(db.productos[0], ['NOMBRE DEL PRODUCTO', 'PRODUCTO']); 
    let pColC = getColExacto(db.productos[0], ['CANTIDAD CAJA', 'CAJA']); 
    let pColU = getColExacto(db.productos[0], ['CANTIDAD UNID', 'UNID']);
    
    let prds = {}; 
    db.productos.filter(p => doc && normalizarTexto(p[pColD]) === normalizarTexto(doc)).forEach(p => {
        let n = p[pColN]; let u = parseNum(p[pColU]); let c = parseNum(p[pColC]);
        if(n){ 
            if(!prds[n]) prds[n] = {u:0, c:0}; 
            prds[n].u += u; prds[n].c += c; 
        }
    });
    
    let tb = document.querySelector('#tablaClienteProductos tbody'); 
    tb.innerHTML = '';
    let keysPrd = Object.keys(prds).sort((a,b) => (prds[b].u + prds[b].c) - (prds[a].u + prds[a].c));
    
    if(keysPrd.length === 0) { 
        tb.innerHTML = `<tr><td colspan="2" style="text-align:center; color:#999;">Sin transacciones de ítems en BD</td></tr>`; 
    } else { 
        keysPrd.forEach(k => { 
            let sumStr = prds[k].c > 0 ? `${prds[k].c} cjs` : `${prds[k].u} und`; 
            tb.innerHTML += `<tr><td>${k}</td><td class="num-col">${sumStr}</td></tr>`; 
        }); 
    }
}

// =========================================
// VENTANA MODAL FLOTANTE
// =========================================
function mostrarModalInactivos(idVendedor, nombreVendedor) { 
    document.getElementById('tituloModalInactivos').textContent = `Clientes Inactivos de: ${nombreVendedor}`;
    let tb = document.querySelector('#tablaInactivos tbody'); 
    tb.innerHTML = '';
    
    let clientesInactivos = obtenerInactivosReales(idVendedor);
    let docC = getColExacto(db.clientes[0], ['Documento_Numero', 'RUC', 'DNI']);
    let razC = getColExacto(db.clientes[0], ['RAZÓN SOCIAL', 'NOMBRE']);
    let estC = getColExacto(db.clientes[0], ['ESTADO DE VENTA', 'ESTADO']);

    if(clientesInactivos.length === 0) {
        tb.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px; color:#666;">¡Felicidades! Toda la cartera registra compras efectivas.</td></tr>`;
    } else {
        clientesInactivos.forEach(c => {
            let est = c[estC] || 'INACTIVO';
            tb.innerHTML += `<tr><td>${c[docC]||'---'}</td><td>${c[razC]||'---'}</td><td><span class="badge badge-inactivo">${est}</span></td></tr>`;
        });
    }
    document.getElementById('modalInactivos').style.display = 'flex'; 
}

function cerrarModalInactivos() { 
    document.getElementById('modalInactivos').style.display = 'none'; 
}
