const urls = {
    vendedores: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=0&single=true&output=csv',
    ventas: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=588620531&single=true&output=csv',
    productos: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1241891503&single=true&output=csv',
    clientes: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1344644608&single=true&output=csv'
};

let db = { vendedores: [], ventas: [], productos: [], clientes: [] };
let graficos = {};
let clientesInactivosActual = []; 
let mapaActivo = null;

// =========================================
// FUNCIONES NÚCLEO (SÚPER ROBUSTAS)
// =========================================

function normalizarTexto(texto) {
    if (!texto) return '';
    return String(texto).replace(/\s+/g, ' ').trim().toUpperCase();
}

function getColExacto(obj, opciones) {
    if(!obj) return null;
    let keys = Object.keys(obj);
    
    // Intento 1: Coincidencia Exacta ignorando dobles espacios
    for (let op of opciones) {
        let opLimpio = normalizarTexto(op);
        let encontrado = keys.find(k => normalizarTexto(k) === opLimpio);
        if(encontrado) return encontrado;
    }
    // Intento 2: Que al menos contenga la palabra clave
    for (let op of opciones) {
        let opLimpio = normalizarTexto(op);
        let encontrado = keys.find(k => normalizarTexto(k).includes(opLimpio));
        if(encontrado) return encontrado;
    }
    return keys[0]; // Protección final para que no explote
}

function parseNum(val) {
    if (!val) return 0;
    let num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
}

function formatearMoneda(valor) {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(valor);
}

function cargarCSV(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(url, { download: true, header: true, skipEmptyLines: true, complete: res => resolve(res.data), error: err => reject(err) });
    });
}

// =========================================
// INICIO Y RENDERIZADO
// =========================================

function evaluarTeclado(e) { if (e.key === 'Enter') verificarPassword(); }
function verificarPassword() {
    const pass = document.getElementById('passInput').value;
    if (btoa(pass) === "RGlhbGV4MTIz") {
        document.getElementById('loginScreen').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('loadingScreen').style.display = 'flex';
            inicializarApp(); 
        }, 300);
    } else { document.getElementById('loginError').style.display = 'block'; }
}

async function inicializarApp() {
    try {
        const [resVend, resVent, resProd, resCli] = await Promise.all([
            cargarCSV(urls.vendedores), cargarCSV(urls.ventas), cargarCSV(urls.productos), cargarCSV(urls.clientes)
        ]);
        db.vendedores = resVend; db.ventas = resVent; db.productos = resProd; db.clientes = resCli;
        
        poblarSidebar();
        cargarVistaGlobal(document.querySelector('#listaVendedores li')); 
        
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('appContainer').style.visibility = 'visible';
    } catch (error) { 
        document.getElementById('loadingSpinner').style.display = 'none';
        document.getElementById('loadingTitle').style.color = '#d93025';
        document.getElementById('loadingTitle').textContent = "Error al descargar Google Sheets";
    }
}

function poblarSidebar() {
    const lista = document.getElementById('listaVendedores');
    const primerLi = lista.firstElementChild;
    lista.innerHTML = '';
    if(primerLi) lista.appendChild(primerLi);

    let colMeta = getColExacto(db.vendedores[0], ['META']);
    let colNombre = getColExacto(db.vendedores[0], ['NOMBRE']);
    let colApellido = getColExacto(db.vendedores[0], ['APELLIDO']);

    const activos = db.vendedores.filter(v => parseNum(v[colMeta]) > 0 && normalizarTexto(v[colNombre]) !== "RETIRADO");
    
    activos.forEach(v => {
        const li = document.createElement('li');
        li.textContent = `${v[colNombre]} ${v[colApellido] || ''}`.trim();
        li.onclick = () => cargarVistaVendedor(v, li);
        lista.appendChild(li);
    });
}

function limpiarSeleccionMenu(li) {
    document.querySelectorAll('.vendedores-list li').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('#listaEstrategia li').forEach(el => el.classList.remove('active'));
    if(li) li.classList.add('active');
}

// =========================================
// MAPA GEOGRÁFICO (LEAFLET)
// =========================================

function procesarMapa(ventasArray) {
    document.getElementById('cardMapa').style.display = 'block';

    if (!mapaActivo) {
        mapaActivo = L.map('mapa').setView([-12.0464, -77.0428], 11); // Centrado en Lima
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: 'Dialex MapData'
        }).addTo(mapaActivo);
    } else {
        mapaActivo.eachLayer((layer) => { if (layer instanceof L.Marker) mapaActivo.removeLayer(layer); });
    }

    let ventColCli = getColExacto(db.ventas[0], ['ID_CLIENTE', 'CLIENTE']);
    let ventColPrecio = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL', 'PRECIO']);
    let cliColId = getColExacto(db.clientes[0], ['ID_CLIENTE', 'CLIENTE']);
    let cliColRazon = getColExacto(db.clientes[0], ['RAZÓN SOCIAL', 'NOMBRE']);
    let cliColUbi = getColExacto(db.clientes[0], ['UBICACIÓN', 'DIRECCION']);

    // Agrupar ventas por cliente para poner 1 solo pin por cliente
    let clientesData = {};
    ventasArray.forEach(v => {
        let idCli = String(v[ventColCli]).trim();
        let venta = parseNum(v[ventColPrecio]);
        
        if(!clientesData[idCli]) {
            let infoDb = db.clientes.find(c => String(c[cliColId]).trim() === idCli);
            clientesData[idCli] = { 
                razon: infoDb ? infoDb[cliColRazon] : 'Cliente Sin Nombre', 
                ubi: infoDb ? normalizarTexto(infoDb[cliColUbi]) : '', 
                totalVenta: 0 
            };
        }
        clientesData[idCli].totalVenta += venta;
    });

    // Diccionario simple de zonas de Lima para simular coordenadas
    const coordsBase = {
        'ATE': [-12.025, -76.91], 'CALLAO': [-12.05, -77.13], 'PUENTE PIEDRA': [-11.86, -77.07],
        'LURIGANCHO': [-11.97, -76.99], 'CHILLON': [-11.88, -77.06], 'COMAS': [-11.93, -77.04],
        'LIMA': [-12.04, -77.02] // Default
    };

    Object.values(clientesData).forEach(cli => {
        if(cli.totalVenta > 0) {
            let coords = coordsBase['LIMA'];
            for(let zona in coordsBase) { if(cli.ubi.includes(zona)) { coords = coordsBase[zona]; break; } }
            
            // Dispersión aleatoria para que los pines no caigan exactamente en el mismo pixel
            let lat = coords[0] + (Math.random() - 0.5) * 0.04;
            let lng = coords[1] + (Math.random() - 0.5) * 0.04;

            L.marker([lat, lng]).addTo(mapaActivo)
             .bindPopup(`<b>${cli.razon}</b><br>Venta: S/ ${cli.totalVenta.toLocaleString()}<br><small>${cli.ubi}</small>`);
        }
    });

    // Evita el bug gris del mapa al cargar div ocultos
    setTimeout(() => { mapaActivo.invalidateSize(); }, 400);
}

// =========================================
// VISTAS PRINCIPALES
// =========================================

function cargarVistaGlobal(liElement) {
    limpiarSeleccionMenu(liElement);
    document.getElementById('vistaInteligencia').style.display = 'none';
    document.getElementById('vistaPrincipal').style.display = 'block';
    document.getElementById('tituloDashboard').textContent = "Vista General Comercial";
    
    document.getElementById('cardGlobalLinea').style.display = 'flex';
    document.getElementById('cardGlobalRankingMeta').style.display = 'flex';
    document.getElementById('cardVendedorProdUnid').style.display = 'none';
    document.getElementById('cardVendedorProdCaja').style.display = 'none';
    document.getElementById('cardVendedorClientes').style.display = 'none';

    let vColMeta = getColExacto(db.vendedores[0], ['META']);
    let ventColPrecio = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']);
    
    let metaTotal = db.vendedores.reduce((sum, v) => sum + parseNum(v[vColMeta]), 0);
    let ventaTotal = db.ventas.reduce((sum, v) => sum + parseNum(v[ventColPrecio]), 0);
    let porcentajeGlobal = metaTotal > 0 ? (ventaTotal / metaTotal) * 100 : 0;

    let colIdCli = getColExacto(db.clientes[0], ['ID_CLIENTE', 'CLIENTE']);
    let totalClientes = new Set(db.clientes.map(c => c[colIdCli])).size;

    document.getElementById('contenedorKPIs').innerHTML = `
        <div class="kpi-box destacado"><h4>Venta Total</h4><span>${formatearMoneda(ventaTotal)}</span></div>
        <div class="kpi-box"><h4>Meta General</h4><span>${formatearMoneda(metaTotal)}</span></div>
        <div class="kpi-box"><h4>Total Clientes BD</h4><span>${totalClientes}</span></div>
    `;
    
    dibujarVelocimetro(porcentajeGlobal);
    dibujarDona(['Call Center', 'Cobertura'], [ventaTotal*0.6, ventaTotal*0.4], ['#4285f4', '#ea4335']);

    // Ranking Metas Globales
    let vColNom = getColExacto(db.vendedores[0], ['NOMBRE']);
    let ventColIdVend = getColExacto(db.ventas[0], ['ID_VENDEDOR', 'VENDEDOR']);
    let vColIdVend = getColExacto(db.vendedores[0], ['ID_VENDEDOR', 'VENDEDOR']);
    
    let rankingMetaArr = db.vendedores.filter(v => parseNum(v[vColMeta]) > 0).map(v => {
        let idBuscar = String(v[vColIdVend]).trim();
        let susV = db.ventas.filter(venta => String(venta[ventColIdVend]).trim() === idBuscar);
        let tot = susV.reduce((sum, venta) => sum + parseNum(venta[ventColPrecio]), 0);
        return { nombre: v[vColNom], pct: (tot / parseNum(v[vColMeta])) * 100 };
    }).sort((a,b) => b.pct - a.pct);

    if(graficos.rankingMeta) graficos.rankingMeta.destroy();
    graficos.rankingMeta = new Chart(document.getElementById('chartRankingMeta').getContext('2d'), { 
        type: 'bar', data: { labels: rankingMetaArr.map(r => r.nombre), datasets: [{ label: 'Avance %', data: rankingMetaArr.map(r => Math.min(r.pct, 100)), backgroundColor: '#4285f4' }] }, options: { responsive: true, maintainAspectRatio: false }
    });

    procesarMapa(db.ventas); // Mapa Global
}

function cargarVistaVendedor(vendedorData, liElement) {
    limpiarSeleccionMenu(liElement);
    document.getElementById('vistaInteligencia').style.display = 'none';
    document.getElementById('vistaPrincipal').style.display = 'block';
    
    let vColNom = getColExacto(vendedorData, ['NOMBRE']);
    document.getElementById('tituloDashboard').textContent = `Análisis: ${vendedorData[vColNom]}`;
    
    document.getElementById('cardGlobalLinea').style.display = 'none';
    document.getElementById('cardGlobalRankingMeta').style.display = 'none';
    document.getElementById('cardVendedorProdUnid').style.display = 'flex';
    document.getElementById('cardVendedorProdCaja').style.display = 'flex';
    document.getElementById('cardVendedorClientes').style.display = 'flex';

    let vColIdVend = getColExacto(vendedorData, ['ID_VENDEDOR', 'VENDEDOR']);
    let ventColIdVend = getColExacto(db.ventas[0], ['ID_VENDEDOR', 'VENDEDOR']);
    let ventColPrecio = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']);
    let vColMeta = getColExacto(vendedorData, ['META']);
    let idBuscado = String(vendedorData[vColIdVend]).trim();

    const susVentas = db.ventas.filter(v => String(v[ventColIdVend]).trim() === idBuscado);
    let metaVendedor = parseNum(vendedorData[vColMeta]);
    let suVentaTotal = susVentas.reduce((sum, v) => sum + parseNum(v[ventColPrecio]), 0);

    let cliColIdVend = getColExacto(db.clientes[0], ['ID_VENDEDOR', 'VENDEDOR']);
    let susClientesBD = db.clientes.filter(c => String(c[cliColIdVend]).trim() === idBuscado);

    document.getElementById('contenedorKPIs').innerHTML = `
        <div class="kpi-box destacado"><h4>Venta Lograda</h4><span>${formatearMoneda(suVentaTotal)}</span></div>
        <div class="kpi-box"><h4>Meta Asignada</h4><span>${formatearMoneda(metaVendedor)}</span></div>
        <div class="kpi-box kpi-clickable" onclick="mostrarModalInactivos()" title="Revisar Base"><h4>Clientes Base 🔍</h4><span>${susClientesBD.length}</span></div>
    `;

    dibujarVelocimetro(metaVendedor > 0 ? (suVentaTotal/metaVendedor)*100 : 0);
    dibujarDona(['Ventas Concretadas', 'Faltante'], [suVentaTotal, Math.max(0, metaVendedor-suVentaTotal)], ['#4285f4', '#ea4335']);

    // Tablas Productos
    let pColId = getColExacto(db.productos[0], ['ID_VENDEDOR', 'VENDEDOR']);
    let pColNom = getColExacto(db.productos[0], ['NOMBRE DEL PRODUCTO', 'PRODUCTO', 'ARTICULO']);
    let pColCaja = getColExacto(db.productos[0], ['CANTIDAD CAJA', 'CAJA']);
    let pColUnid = getColExacto(db.productos[0], ['CANTIDAD UNID', 'UNID']);

    let countsUnid = {}; let countsCaja = {};
    db.productos.filter(p => String(p[pColId]).trim() === idBuscado).forEach(p => { 
        let nom = p[pColNom];
        let unid = parseNum(p[pColUnid]); let caja = parseNum(p[pColCaja]);
        if(nom) {
            if(unid > 0) countsUnid[nom] = (countsUnid[nom] || 0) + unid; 
            if(caja > 0) countsCaja[nom] = (countsCaja[nom] || 0) + caja; 
        }
    });
    poblarTablaHTML('tablaProdUnid', countsUnid, false); 
    poblarTablaHTML('tablaProdCaja', countsCaja, false);

    // Tabla Clientes Facturados
    let countsClientes = {};
    let ventColRazon = getColExacto(db.ventas[0], ['RAZÓN SOCIAL', 'RAZON SOCIAL']);
    susVentas.forEach(v => { 
        let razon = v[ventColRazon];
        let valor = parseNum(v[ventColPrecio]);
        if(razon && valor > 0) countsClientes[razon] = (countsClientes[razon] || 0) + valor; 
    });
    poblarTablaHTML('tablaClientesVend', countsClientes, true);

    // Inactivos Modal
    let inactivosTbody = document.querySelector('#tablaInactivos tbody');
    inactivosTbody.innerHTML = '';
    let cliColDoc = getColExacto(susClientesBD[0], ['Documento_Numero', 'RUC', 'DNI']);
    let cliColRazonBD = getColExacto(susClientesBD[0], ['RAZÓN SOCIAL', 'NOMBRE COMERCIAL']);
    
    susClientesBD.forEach(cli => {
        let tr = document.createElement('tr');
        tr.innerHTML = `<td>${cli[cliColDoc]||'N/A'}</td><td>${cli[cliColRazonBD]||'N/A'}</td>`;
        inactivosTbody.appendChild(tr);
    });

    procesarMapa(susVentas); // Mapa filtrado para el vendedor
}

function cargarVistaInteligencia(liElement) {
    limpiarSeleccionMenu(liElement);
    document.getElementById('vistaPrincipal').style.display = 'none';
    document.getElementById('vistaInteligencia').style.display = 'block';
    document.getElementById('tituloDashboard').textContent = "Estrategia de Rentabilidad";

    let ventColPrecio = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']);
    let ventColRazon = getColExacto(db.ventas[0], ['RAZÓN SOCIAL', 'RAZON SOCIAL']);
    let ventaTotal = db.ventas.reduce((sum, v) => sum + parseNum(v[ventColPrecio]), 0);
    
    let numTransacciones = db.ventas.length;
    document.getElementById('kpiTicketPromedio').textContent = formatearMoneda(numTransacciones>0 ? ventaTotal/numTransacciones : 0);

    let comprasPorCliente = {};
    db.ventas.forEach(v => {
        let razon = normalizarTexto(v[ventColRazon]);
        if(razon) {
            if(!comprasPorCliente[razon]) comprasPorCliente[razon] = 0;
            comprasPorCliente[razon] += parseNum(v[ventColPrecio]);
        }
    });

    let totalCompradores = Object.keys(comprasPorCliente).length;
    document.getElementById('kpiFrecuencia').textContent = totalCompradores>0 ? (numTransacciones/totalCompradores).toFixed(1) : 0;

    // Lógica ABC
    let arr = Object.keys(comprasPorCliente).map(k => ({ nombre: k, total: comprasPorCliente[k] })).sort((a,b) => b.total - a.total);
    let tbodyABC = document.querySelector('#tablaABC tbody');
    tbodyABC.innerHTML = '';
    let sumaAcumulada = 0;
    
    arr.forEach(cli => {
        sumaAcumulada += cli.total;
        let pct = (sumaAcumulada / ventaTotal) * 100;
        let seg = pct <= 80 ? 'A (Top)' : (pct <= 95 ? 'B (Medio)' : 'C (Bajo)');
        let cls = pct <= 80 ? 'badge-a' : (pct <= 95 ? 'badge-b' : 'badge-c');
        
        let tr = document.createElement('tr');
        tr.innerHTML = `<td>${cli.nombre}</td><td><span class="badge ${cls}">${seg}</span></td><td class="num-col">${formatearMoneda(cli.total)}</td>`;
        tbodyABC.appendChild(tr);
    });
}

// =========================================
// AUXILIARES UI
// =========================================

function dibujarVelocimetro(pct) {
    if(graficos.velocimetro) graficos.velocimetro.destroy();
    graficos.velocimetro = new Chart(document.getElementById('chartVelocimetro').getContext('2d'), { 
        type: 'doughnut', data: { datasets: [{ data: [pct, Math.max(0,100-pct)], backgroundColor: ['#34a853', '#ea4335'], borderWidth: 0 }] }, 
        options: { responsive: true, maintainAspectRatio: true, aspectRatio: 2, rotation: -90, circumference: 180, cutout: '75%', plugins:{legend:{display:false}} } 
    });
    document.getElementById('textoVelocimetro').textContent = pct.toFixed(1) + '%';
}
function dibujarDona(l, d, c) {
    if(graficos.dona) graficos.dona.destroy();
    graficos.dona = new Chart(document.getElementById('chartDona').getContext('2d'), { type: 'pie', data: { labels: l, datasets: [{ data: d, backgroundColor: c }] }, options: { plugins: { legend: { position: 'bottom' } } } });
}
function poblarTablaHTML(id, obj, moneda) {
    const tb = document.querySelector(`#${id} tbody`);
    tb.innerHTML = '';
    let items = Object.keys(obj).map(k => ({ l: k, v: obj[k] })).sort((a,b) => b.v - a.v).slice(0, 5);
    if(items.length===0) tb.innerHTML = `<tr><td colspan="2" style="text-align:center;">Sin datos</td></tr>`;
    items.forEach(i => {
        let tr = document.createElement('tr');
        tr.innerHTML = `<td>${i.l}</td><td class="num-col">${moneda ? formatearMoneda(i.v) : i.v}</td>`;
        tb.appendChild(tr);
    });
}
function mostrarModalInactivos() { document.getElementById('modalInactivos').style.display = 'flex'; }
function cerrarModalInactivos() { document.getElementById('modalInactivos').style.display = 'none'; }
