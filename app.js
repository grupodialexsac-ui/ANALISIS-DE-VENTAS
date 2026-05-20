const urls = {
    vendedores: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=0&single=true&output=csv',
    ventas: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=588620531&single=true&output=csv',
    productos: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1241891503&single=true&output=csv',
    clientes: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1344644608&single=true&output=csv'
};

let db = { vendedores: [], ventas: [], productos: [], clientes: [] };
let graficos = {
    veloGen: null, donaGen: null, lineaGen: null, rankGen: null,
    veloVend: null, donaVend: null
};
let mapasActivos = { general: null, vendedor: null, situacion: null };
let moduloActual = 'general';

// =========================================
// UTILIDADES ROBUSTAS
// =========================================
function normalizarTexto(texto) { return texto ? String(texto).replace(/\s+/g, ' ').trim().toUpperCase() : ''; }

function getColExacto(obj, opciones) {
    if(!obj) return null;
    let keys = Object.keys(obj);
    for (let op of opciones) {
        let opLimpio = normalizarTexto(op);
        let encontrado = keys.find(k => normalizarTexto(k) === opLimpio);
        if(encontrado) return encontrado;
    }
    for (let op of opciones) {
        let opLimpio = normalizarTexto(op);
        let encontrado = keys.find(k => normalizarTexto(k).includes(opLimpio));
        if(encontrado) return encontrado;
    }
    return keys[0]; 
}

function parseNum(val) {
    if (!val) return 0;
    let num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
}

function formatearMoneda(valor) { return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(valor); }

// Parseo estricto de fechas (Arreglo del Gráfico de Líneas)
function parseFechaEstricta(dStr) {
    if(!dStr) return 0;
    let parts = String(dStr).split(' ')[0].split('/'); // Elimina horas si las hay
    if(parts.length !== 3) return 0;
    let day = parts[0].padStart(2, '0');
    let month = parts[1].padStart(2, '0');
    let year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    return new Date(`${year}-${month}-${day}T12:00:00`).getTime();
}

function cargarCSV(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(url, { download: true, header: true, skipEmptyLines: true, complete: res => resolve(res.data), error: err => reject(err) });
    });
}

// =========================================
// INICIALIZACIÓN
// =========================================
function evaluarTeclado(e) { if (e.key === 'Enter') verificarPassword(); }
function verificarPassword() {
    const pass = document.getElementById('passInput').value;
    if (btoa(pass) === "RGlhbGV4MTIz") {
        document.getElementById('loginScreen').style.opacity = '0';
        setTimeout(() => { document.getElementById('loginScreen').style.display = 'none'; document.getElementById('loadingScreen').style.display = 'flex'; inicializarApp(); }, 300);
    } else { document.getElementById('loginError').style.display = 'block'; }
}

async function inicializarApp() {
    try {
        const [resVend, resVent, resProd, resCli] = await Promise.all([cargarCSV(urls.vendedores), cargarCSV(urls.ventas), cargarCSV(urls.productos), cargarCSV(urls.clientes)]);
        db.vendedores = resVend; db.ventas = resVent; db.productos = resProd; db.clientes = resCli;
        
        generarMenuVendedores();
        cambiarModulo('general', document.getElementById('btnModGeneral'));
        
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('appContainer').style.visibility = 'visible';
    } catch (error) { 
        document.getElementById('loadingSpinner').style.display = 'none';
        document.getElementById('loadingTitle').style.color = '#d93025';
        document.getElementById('loadingTitle').textContent = "Error al descargar Datos";
    }
}

// =========================================
// NAVEGACIÓN Y MENÚS
// =========================================
function cambiarModulo(modulo, elemento) {
    document.querySelectorAll('.modulos-list li').forEach(el => el.classList.remove('active'));
    if(elemento) elemento.classList.add('active');
    
    document.querySelectorAll('.modulo-view').forEach(el => el.style.display = 'none');
    document.getElementById('menuVendedoresContainer').style.display = 'none';
    
    moduloActual = modulo;

    if (modulo === 'general') {
        document.getElementById('vistaGeneral').style.display = 'block';
        document.getElementById('tituloDashboard').textContent = 'Vista General Comercial';
        cargarDataGeneral();
    } 
    else if (modulo === 'productividad') {
        document.getElementById('vistaProductividad').style.display = 'block';
        document.getElementById('menuVendedoresContainer').style.display = 'block';
        document.getElementById('tituloDashboard').textContent = 'Análisis de Productividad';
        
        // Cargar el primer vendedor por defecto si no hay uno seleccionado
        let primerVendedorBtn = document.querySelector('#listaVendedoresHorizontal li');
        if(primerVendedorBtn && document.getElementById('estadoVendedorSeleccion').style.display !== 'none') {
            primerVendedorBtn.click();
        }
    }
    else if (modulo === 'situacion') {
        document.getElementById('vistaSituacion').style.display = 'block';
        document.getElementById('tituloDashboard').textContent = 'Estrategia de Rentabilidad';
        cargarDataSituacion();
    }
    else if (modulo === 'busqueda') {
        document.getElementById('vistaBusqueda').style.display = 'block';
        document.getElementById('tituloDashboard').textContent = 'Directorio Corporativo';
        llenarTablaDirectorio();
    }
}

function generarMenuVendedores() {
    const lista = document.getElementById('listaVendedoresHorizontal');
    lista.innerHTML = '';
    let colMeta = getColExacto(db.vendedores[0], ['META']);
    let colNom = getColExacto(db.vendedores[0], ['NOMBRE']);
    let colApe = getColExacto(db.vendedores[0], ['APELLIDO']);

    const activos = db.vendedores.filter(v => parseNum(v[colMeta]) > 0 && normalizarTexto(v[colNom]) !== "RETIRADO");
    
    activos.forEach(v => {
        const li = document.createElement('li');
        li.textContent = `${v[colNom]} ${v[colApe] || ''}`.trim();
        li.onclick = () => {
            document.querySelectorAll('#listaVendedoresHorizontal li').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            cargarDataVendedor(v);
        };
        lista.appendChild(li);
    });
}

// =========================================
// RENDERIZADO DE VISTAS (Lógica Matemática)
// =========================================

// --- VISTA 1: GENERAL ---
function cargarDataGeneral() {
    let vColMeta = getColExacto(db.vendedores[0], ['META']);
    let ventColPrecio = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']);
    let ventColFecha = getColExacto(db.ventas[0], ['FECHA DE VENTA', 'FECHA']);
    let colIdCli = getColExacto(db.clientes[0], ['ID_CLIENTE', 'CLIENTE']);
    
    let metaTotal = db.vendedores.reduce((sum, v) => sum + parseNum(v[vColMeta]), 0);
    let ventaTotal = db.ventas.reduce((sum, v) => sum + parseNum(v[ventColPrecio]), 0);
    let totalClientes = new Set(db.clientes.map(c => c[colIdCli])).size;
    let pctGlobal = metaTotal > 0 ? (ventaTotal / metaTotal) * 100 : 0;

    document.getElementById('kpiGeneral').innerHTML = `
        <div class="kpi-box"><h4>Venta Total</h4><span>${formatearMoneda(ventaTotal)}</span></div>
        <div class="kpi-box"><h4>Meta General</h4><span style="color:#333;">${formatearMoneda(metaTotal)}</span></div>
        <div class="kpi-box"><h4>Total Clientes BD</h4><span style="color:#333;">${totalClientes}</span></div>
    `;

    // Gráficos Circulares
    if(graficos.veloGen) graficos.veloGen.destroy();
    graficos.veloGen = new Chart(document.getElementById('chartVelocimetroGeneral').getContext('2d'), { type: 'doughnut', data: { datasets: [{ data: [pctGlobal, Math.max(0,100-pctGlobal)], backgroundColor: ['#34a853', '#ea4335'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, rotation: -90, circumference: 180, cutout: '75%', plugins:{legend:{display:false}} } });
    document.getElementById('textoVelocimetroGeneral').textContent = pctGlobal.toFixed(1) + '%';

    let vColIdVend = getColExacto(db.vendedores[0], ['ID_VENDEDOR', 'VENDEDOR']);
    let ventColIdVend = getColExacto(db.ventas[0], ['ID_VENDEDOR', 'VENDEDOR']);
    let vColTipo = getColExacto(db.vendedores[0], ['TIPO', 'TIPO DE VENDEDOR']);
    let canales = { 'CALL CENTER': 0, 'COBERTURA': 0 };
    
    db.ventas.forEach(venta => {
        let vend = db.vendedores.find(v => normalizarTexto(v[vColIdVend]) === normalizarTexto(venta[ventColIdVend]));
        let tipo = vend && vend[vColTipo] ? normalizarTexto(vend[vColTipo]) : 'OTROS';
        let valor = parseNum(venta[ventColPrecio]);
        if (tipo.includes('CALL CENTER')) canales['CALL CENTER'] += valor; else canales['COBERTURA'] += valor;
    });

    if(graficos.donaGen) graficos.donaGen.destroy();
    graficos.donaGen = new Chart(document.getElementById('chartDonaGeneral').getContext('2d'), { type: 'pie', data: { labels: ['Call Center', 'Cobertura'], datasets: [{ data: [canales['CALL CENTER'], canales['COBERTURA']], backgroundColor: ['#4285f4', '#ea4335'] }] }, options: { responsive:true, maintainAspectRatio:false, plugins: { legend: { position: 'bottom' } } } });

    // Gráfico de Líneas (Arreglado con parseFechaEstricta)
    let daily = {};
    db.ventas.forEach(v => { 
        let fec = v[ventColFecha]; 
        let valor = parseNum(v[ventColPrecio]);
        if(fec && valor > 0) {
            let fechaLimpia = String(fec).split(' ')[0]; // Asegurar formato corto "DD/MM/YYYY"
            daily[fechaLimpia] = (daily[fechaLimpia] || 0) + valor; 
        }
    });

    let fechasOrdenadas = Object.keys(daily).sort((a,b) => parseFechaEstricta(a) - parseFechaEstricta(b));
    
    if(graficos.lineaGen) graficos.lineaGen.destroy();
    graficos.lineaGen = new Chart(document.getElementById('chartLinea').getContext('2d'), { 
        type: 'line', data: { labels: fechasOrdenadas, datasets: [{ label: 'Ventas Diarias', data: fechasOrdenadas.map(f => daily[f]), borderColor: '#4285f4', fill: false, tension: 0.1 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // Ranking de Metas
    let vColNom = getColExacto(db.vendedores[0], ['NOMBRE']);
    let rankingArr = db.vendedores.filter(v => parseNum(v[vColMeta]) > 0).map(v => {
        let idBuscar = normalizarTexto(v[vColIdVend]);
        let tot = db.ventas.filter(venta => normalizarTexto(venta[ventColIdVend]) === idBuscar).reduce((sum, venta) => sum + parseNum(venta[ventColPrecio]), 0);
        return { nombre: v[vColNom], pct: (tot / parseNum(v[vColMeta])) * 100 };
    }).sort((a,b) => b.pct - a.pct);

    if(graficos.rankGen) graficos.rankGen.destroy();
    graficos.rankGen = new Chart(document.getElementById('chartRankingMeta').getContext('2d'), { 
        type: 'bar', data: { labels: rankingArr.map(r => r.nombre), datasets: [{ label: 'Avance %', data: rankingArr.map(r => Math.min(r.pct, 100)), backgroundColor: '#4285f4' }] }, options: { responsive: true, maintainAspectRatio: false }
    });

    // Mapa: Todos los clientes
    renderizarMapa('mapaGeneral', db.clientes);
}

// --- VISTA 2: PRODUCTIVIDAD VENDEDOR ---
function cargarDataVendedor(vendedorData) {
    document.getElementById('estadoVendedorSeleccion').style.display = 'none';
    document.getElementById('contenidoProductividad').style.display = 'block';
    
    let vColNom = getColExacto(vendedorData, ['NOMBRE']);
    document.getElementById('tituloDashboard').textContent = `Análisis: ${vendedorData[vColNom]}`;

    let vColIdVend = getColExacto(vendedorData, ['ID_VENDEDOR', 'VENDEDOR']);
    let ventColIdVend = getColExacto(db.ventas[0], ['ID_VENDEDOR', 'VENDEDOR']);
    let ventColPrecio = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']);
    let vColMeta = getColExacto(vendedorData, ['META']);
    let idBuscado = normalizarTexto(vendedorData[vColIdVend]);

    const susVentas = db.ventas.filter(v => normalizarTexto(v[ventColIdVend]) === idBuscado);
    let metaVendedor = parseNum(vendedorData[vColMeta]);
    let suVentaTotal = susVentas.reduce((sum, v) => sum + parseNum(v[ventColPrecio]), 0);
    let pctVendedor = metaVendedor > 0 ? (suVentaTotal/metaVendedor)*100 : 0;

    let cliColIdVend = getColExacto(db.clientes[0], ['ID_VENDEDOR', 'VENDEDOR']);
    let susClientesBD = db.clientes.filter(c => normalizarTexto(c[cliColIdVend]) === idBuscado);

    document.getElementById('kpiVendedor').innerHTML = `
        <div class="kpi-box destacado"><h4>Venta Lograda</h4><span>${formatearMoneda(suVentaTotal)}</span></div>
        <div class="kpi-box"><h4>Meta Asignada</h4><span style="color:#333;">${formatearMoneda(metaVendedor)}</span></div>
        <div class="kpi-box kpi-clickable" onclick="mostrarModalInactivos('${idBuscado}')" title="Ver clientes"><h4>Clientes Base 🔍</h4><span style="color:#333;">${susClientesBD.length}</span></div>
    `;

    if(graficos.veloVend) graficos.veloVend.destroy();
    graficos.veloVend = new Chart(document.getElementById('chartVelocimetroVendedor').getContext('2d'), { type: 'doughnut', data: { datasets: [{ data: [pctVendedor, Math.max(0,100-pctVendedor)], backgroundColor: ['#34a853', '#ea4335'], borderWidth:0 }] }, options: { responsive:true, maintainAspectRatio:false, rotation:-90, circumference:180, cutout:'75%', plugins:{legend:{display:false}} } });
    document.getElementById('textoVelocimetroVendedor').textContent = pctVendedor.toFixed(1) + '%';

    if(graficos.donaVend) graficos.donaVend.destroy();
    graficos.donaVend = new Chart(document.getElementById('chartDonaVendedor').getContext('2d'), { type: 'pie', data: { labels: ['Ventas Concretadas', 'Faltante'], datasets: [{ data: [suVentaTotal, Math.max(0, metaVendedor-suVentaTotal)], backgroundColor: ['#4285f4', '#ea4335'] }] }, options: { responsive:true, maintainAspectRatio:false, plugins: { legend: { position: 'bottom' } } } });

    // Tablas Productos
    let pColId = getColExacto(db.productos[0], ['ID_VENDEDOR', 'VENDEDOR']);
    let pColNom = getColExacto(db.productos[0], ['NOMBRE DEL PRODUCTO', 'PRODUCTO']);
    let pColCaja = getColExacto(db.productos[0], ['CANTIDAD CAJA', 'CAJA']);
    let pColUnid = getColExacto(db.productos[0], ['CANTIDAD UNID', 'UNID']);

    let cUnid = {}; let cCaja = {};
    db.productos.filter(p => normalizarTexto(p[pColId]) === idBuscado).forEach(p => { 
        let nom = p[pColNom]; let u = parseNum(p[pColUnid]); let c = parseNum(p[pColCaja]);
        if(nom) { if(u>0) cUnid[nom]=(cUnid[nom]||0)+u; if(c>0) cCaja[nom]=(cCaja[nom]||0)+c; }
    });
    
    llenarTablaSimple('tablaProdUnid', cUnid, false); 
    llenarTablaSimple('tablaProdCaja', cCaja, false);

    // Mapa: Solo los clientes de este vendedor
    renderizarMapa('mapaVendedor', susClientesBD);
}

// --- VISTA 3: SITUACIÓN ---
function cargarDataSituacion() {
    let ventColPrecio = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']);
    let ventColRazon = getColExacto(db.ventas[0], ['RAZÓN SOCIAL', 'RAZON SOCIAL']);
    let ventaTotal = db.ventas.reduce((sum, v) => sum + parseNum(v[ventColPrecio]), 0);
    let numTransacciones = db.ventas.length;
    
    document.getElementById('kpiTicketPromedio').textContent = formatearMoneda(numTransacciones>0 ? ventaTotal/numTransacciones : 0);

    let comprasCli = {};
    db.ventas.forEach(v => {
        let r = normalizarTexto(v[ventColRazon]);
        if(r) { comprasCli[r] = (comprasCli[r]||0) + parseNum(v[ventColPrecio]); }
    });

    let totalCompradores = Object.keys(comprasCli).length;
    document.getElementById('kpiFrecuencia').textContent = totalCompradores>0 ? (numTransacciones/totalCompradores).toFixed(1) : 0;

    let colCliRazon = getColExacto(db.clientes[0], ['RAZÓN SOCIAL', 'NOMBRE COMERCIAL']);
    let colCliEstado = getColExacto(db.clientes[0], ['ESTADO DE VENTA', 'ESTADO']);
    let riesgoCtn = 0;
    
    // Lista de clientes activos para el mapa
    let clientesActivosParaMapa = [];

    db.clientes.forEach(c => {
        let rDB = normalizarTexto(c[colCliRazon]);
        let estado = normalizarTexto(c[colCliEstado]);
        if (estado.includes('ACTIVO')) {
            clientesActivosParaMapa.push(c);
            if (!comprasCli[rDB]) riesgoCtn++; // Activo pero sin ventas en la data cruzada
        }
    });
    document.getElementById('kpiRiesgo').textContent = riesgoCtn;

    let arr = Object.keys(comprasCli).map(k => ({ n: k, t: comprasCli[k] })).sort((a,b) => b.t - a.t);
    let tb = document.querySelector('#tablaABC tbody');
    tb.innerHTML = ''; let sumAcum = 0;
    
    arr.forEach(cli => {
        sumAcum += cli.t;
        let pct = (sumAcum / ventaTotal) * 100;
        let seg = pct <= 80 ? 'A (Top)' : (pct <= 95 ? 'B (Medio)' : 'C (Bajo)');
        let cls = pct <= 80 ? 'badge-a' : (pct <= 95 ? 'badge-b' : 'badge-c');
        
        tb.innerHTML += `<tr><td>${cli.n}</td><td><span class="badge ${cls}">${seg}</span></td><td class="num-col">${formatearMoneda(cli.t)}</td></tr>`;
    });

    // Mapa: Solo Clientes Activos
    renderizarMapa('mapaSituacion', clientesActivosParaMapa);
}

// --- VISTA 4: BÚSQUEDA ---
function llenarTablaDirectorio() {
    let tb = document.querySelector('#tablaDirectorioClientes tbody');
    tb.innerHTML = '';
    
    let colDoc = getColExacto(db.clientes[0], ['Documento_Numero', 'RUC', 'DNI']);
    let colRaz = getColExacto(db.clientes[0], ['RAZÓN SOCIAL', 'NOMBRE COMERCIAL']);
    let colIdVend = getColExacto(db.clientes[0], ['ID_VENDEDOR', 'VENDEDOR']);
    let colEst = getColExacto(db.clientes[0], ['ESTADO DE VENTA', 'ESTADO']);
    
    // Diccionario rápido de vendedores
    let dictVendedores = {};
    let vColId = getColExacto(db.vendedores[0], ['ID_VENDEDOR']);
    let vColNom = getColExacto(db.vendedores[0], ['NOMBRE']);
    db.vendedores.forEach(v => { dictVendedores[normalizarTexto(v[vColId])] = v[vColNom]; });

    db.clientes.forEach(c => {
        let doc = c[colDoc] || 'N/A';
        let raz = c[colRaz] || 'N/A';
        let vendNom = dictVendedores[normalizarTexto(c[colIdVend])] || 'No Asignado';
        let est = normalizarTexto(c[colEst]);
        let badgeCls = est.includes('ACTIVO') ? 'badge-activo' : 'badge-inactivo';
        
        let tr = document.createElement('tr');
        tr.className = 'fila-directorio';
        tr.innerHTML = `<td>${doc}</td><td>${raz}</td><td>${vendNom}</td><td><span class="badge ${badgeCls}">${est}</span></td>`;
        tb.appendChild(tr);
    });
}

function filtrarDirectorioClientes() {
    let input = normalizarTexto(document.getElementById("inputBusquedaCliente").value);
    let filas = document.querySelectorAll('.fila-directorio');
    filas.forEach(fila => {
        let textoFila = normalizarTexto(fila.textContent);
        fila.style.display = textoFila.includes(input) ? "" : "none";
    });
}

// =========================================
// MAPA GEOGRÁFICO UNIFICADO E INTELIGENTE
// =========================================
function renderizarMapa(idContenedor, arrayClientesFiltrados) {
    if (mapasActivos[idContenedor]) {
        mapasActivos[idContenedor].remove(); // Destruye el mapa anterior para evitar bugs visuales de Leaflet en divs ocultos
    }

    let mapa = L.map(idContenedor).setView([-12.0464, -77.0428], 10);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: 'Dialex' }).addTo(mapa);
    mapasActivos[idContenedor] = mapa;

    // Diccionario de Ventas para cruzar data rápido
    let comprasCli = {};
    let ventColId = getColExacto(db.ventas[0], ['ID_CLIENTE']);
    let ventColP = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']);
    db.ventas.forEach(v => {
        let id = normalizarTexto(v[ventColId]);
        if(id) comprasCli[id] = (comprasCli[id]||0) + parseNum(v[ventColP]);
    });

    let cliColId = getColExacto(db.clientes[0], ['ID_CLIENTE']);
    let cliColRaz = getColExacto(db.clientes[0], ['RAZÓN SOCIAL', 'NOMBRE COMERCIAL']);
    let cliColUbi = getColExacto(db.clientes[0], ['UBICACIÓN', 'DIRECCION']);

    const coordsBase = {
        'ATE':[-12.02,-76.91], 'CALLAO':[-12.05,-77.13], 'PUENTE PIEDRA':[-11.86,-77.07], 'SAN JUAN DE LURIGANCHO':[-11.97,-76.99], 
        'COMAS':[-11.93,-77.04], 'CHILLON':[-11.88,-77.06], 'LIMA':[-12.04,-77.02] 
    };

    arrayClientesFiltrados.forEach(c => {
        let id = normalizarTexto(c[cliColId]);
        let raz = c[cliColRaz] || 'Desconocido';
        let ubi = normalizarTexto(c[cliColUbi]);
        let venta = comprasCli[id] || 0;

        let coords = coordsBase['LIMA'];
        for(let z in coordsBase) { if(ubi.includes(z)) { coords = coordsBase[z]; break; } }
        
        let lat = coords[0] + (Math.random() - 0.5) * 0.05; // Dispersión visual
        let lng = coords[1] + (Math.random() - 0.5) * 0.05;

        let iconColor = venta > 0 ? '#34a853' : '#ea4335'; // Verde si compró, rojo si no

        let markerHtml = `<div style="background-color:${iconColor}; width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`;
        let customIcon = L.divIcon({ html: markerHtml, className: 'custom-pin', iconSize: [16, 16] });

        L.marker([lat, lng], {icon: customIcon}).addTo(mapa)
         .bindPopup(`<b>${raz}</b><br>Facturado: S/ ${venta.toLocaleString()}<br><small>${c[cliColUbi]||'Sin dirección'}</small>`);
    });

    // Fix clásico de Leaflet para contenedores que cambian de display:none a block
    setTimeout(() => { mapa.invalidateSize(); }, 500);
}

// =========================================
// COMPONENTES MENORES
// =========================================
function llenarTablaSimple(id, obj, moneda) {
    const tb = document.querySelector(`#${id} tbody`);
    tb.innerHTML = '';
    let items = Object.keys(obj).map(k => ({ l: k, v: obj[k] })).sort((a,b) => b.v - a.v).slice(0, 5);
    if(items.length===0) tb.innerHTML = `<tr><td colspan="2" style="text-align:center;">Sin datos</td></tr>`;
    items.forEach(i => { tb.innerHTML += `<tr><td>${i.l}</td><td class="num-col">${moneda ? formatearMoneda(i.v) : i.v}</td></tr>`; });
}

function mostrarModalInactivos(idVendedor) { 
    let tb = document.querySelector('#tablaInactivos tbody');
    tb.innerHTML = '';
    let colIdVend = getColExacto(db.clientes[0], ['ID_VENDEDOR', 'VENDEDOR']);
    let colDoc = getColExacto(db.clientes[0], ['Documento_Numero', 'RUC']);
    let colRaz = getColExacto(db.clientes[0], ['RAZÓN SOCIAL']);
    let colEst = getColExacto(db.clientes[0], ['ESTADO DE VENTA']);

    db.clientes.filter(c => normalizarTexto(c[colIdVend]) === idVendedor).forEach(c => {
        let est = normalizarTexto(c[colEst]);
        let badgeCls = est.includes('ACTIVO') ? 'badge-activo' : 'badge-inactivo';
        tb.innerHTML += `<tr><td>${c[colDoc]||''}</td><td>${c[colRaz]||''}</td><td><span class="badge ${badgeCls}">${est}</span></td></tr>`;
    });
    document.getElementById('modalInactivos').style.display = 'flex'; 
}

function cerrarModalInactivos() { document.getElementById('modalInactivos').style.display = 'none'; }
