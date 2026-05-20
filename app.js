const urls = {
    vendedores: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=0&single=true&output=csv',
    ventas: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=588620531&single=true&output=csv',
    productos: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1241891503&single=true&output=csv',
    clientes: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1344644608&single=true&output=csv'
};

let db = { vendedores: [], ventas: [], productos: [], clientes: [] };
let graficos = {};
let clientesInactivosActual = []; 

// Función Robusta para buscar columnas
function getColExacto(obj, posiblesNombres) {
    if(!obj) return null;
    let keys = Object.keys(obj);
    for(let nombre of posiblesNombres) {
        let encontrado = keys.find(k => k.trim().toUpperCase() === nombre.toUpperCase());
        if(encontrado) return encontrado;
    }
    return null;
}

function parseNum(val) {
    if (!val) return 0;
    let num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
}

function formatearMoneda(valor) {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(valor);
}

// Carga optimizada con PapaParse
function cargarCSV(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(url, {
            download: true, header: true, skipEmptyLines: true,
            complete: function(results) { resolve(results.data); },
            error: function(err) { reject(err); }
        });
    });
}

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
            cargarCSV(urls.vendedores), cargarCSV(urls.ventas), 
            cargarCSV(urls.productos), cargarCSV(urls.clientes)
        ]);
        
        db.vendedores = resVend; db.ventas = resVent; 
        db.productos = resProd; db.clientes = resCli;
        
        poblarSidebar();
        
        // Simular clic en Vista Global al iniciar
        const btnGlobal = document.querySelector('#listaVendedores li');
        if(btnGlobal) cargarVistaGlobal(btnGlobal);
        
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('appContainer').style.visibility = 'visible';
    } catch (error) { 
        console.error("Error al cargar Google Sheets:", error);
        document.getElementById('loadingSpinner').style.display = 'none';
        document.getElementById('loadingTitle').style.color = '#d93025';
        document.getElementById('loadingTitle').textContent = "Error de Conexión";
    }
}

function poblarSidebar() {
    const lista = document.getElementById('listaVendedores');
    // Limpiamos todo menos el botón de VISTA GENERAL
    const primerLi = lista.firstElementChild;
    lista.innerHTML = '';
    if(primerLi) lista.appendChild(primerLi);

    let colMeta = getColExacto(db.vendedores[0], ['META']);
    let colNombre = getColExacto(db.vendedores[0], ['NOMBRE']);
    let colApellido = getColExacto(db.vendedores[0], ['APELLIDO']);

    const activos = db.vendedores.filter(v => v[colNombre] && String(v[colNombre]).toUpperCase() !== "RETIRADO" && parseNum(v[colMeta]) > 0);
    
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

/* ==========================================
   VISTA 1A: GLOBAL (RECUPERADA Y REPARADA)
   ========================================== */
function cargarVistaGlobal(liElement) {
    limpiarSeleccionMenu(liElement);
    document.getElementById('vistaInteligencia').style.display = 'none';
    document.getElementById('vistaPrincipal').style.display = 'block';
    document.getElementById('tituloDashboard').textContent = "Vista General Comercial";
    document.getElementById('tipoVendedorTag').style.display = 'none';
    
    document.getElementById('cardGlobalLinea').style.display = 'flex';
    document.getElementById('cardGlobalRankingMeta').style.display = 'flex';
    document.getElementById('cardVendedorProdUnid').style.display = 'none';
    document.getElementById('cardVendedorProdCaja').style.display = 'none';
    document.getElementById('cardVendedorClientes').style.display = 'none';
    document.getElementById('tituloGraficoDona').textContent = "Venta x Canales";

    let vColMeta = getColExacto(db.vendedores[0], ['META']);
    let ventColPrecio = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'PRECIO', 'TOTAL']);
    
    let metaTotal = db.vendedores.reduce((sum, v) => sum + parseNum(v[vColMeta]), 0);
    let ventaTotal = db.ventas.reduce((sum, v) => sum + parseNum(v[ventColPrecio]), 0);
    let porcentajeGlobal = metaTotal > 0 ? (ventaTotal / metaTotal) * 100 : 0;

    let colIdCli = getColExacto(db.clientes[0], ['ID_CLIENTE', 'CLIENTE']);
    let colFechaCli = getColExacto(db.clientes[0], ['FECHA CLIENTE', 'FECHA']);
    let totalClientes = new Set(db.clientes.map(c => c[colIdCli])).size;
    let nuevosMayo = db.clientes.filter(c => c[colFechaCli] && String(c[colFechaCli]).includes('05/2026')).length;

    let comprasAgrupadas = {};
    let ventColIdCli = getColExacto(db.ventas[0], ['ID_CLIENTE', 'CLIENTE']);
    db.ventas.forEach(v => {
        let cliId = v[ventColIdCli];
        if(cliId) comprasAgrupadas[cliId] = (comprasAgrupadas[cliId] || 0) + parseNum(v[ventColPrecio]);
    });
    let clientesMas1000 = Object.values(comprasAgrupadas).filter(monto => monto > 1000).length;

    // RESTAURACIÓN DE KPIs GLOBALES
    document.getElementById('contenedorKPIs').innerHTML = `
        <div class="kpi-box destacado"><h4>Venta Total</h4><span>${formatearMoneda(ventaTotal)}</span></div>
        <div class="kpi-box"><h4>Meta General</h4><span>${formatearMoneda(metaTotal)}</span></div>
        <div class="kpi-box"><h4>Total Clientes</h4><span>${totalClientes}</span></div>
        <div class="kpi-box"><h4>Nuevos Mayo</h4><span>${nuevosMayo}</span></div>
        <div class="kpi-box"><h4>Clientes > S/1,000</h4><span>${clientesMas1000}</span></div>
    `;
    
    dibujarVelocimetro(porcentajeGlobal);

    // Lógica real de Call Center vs Cobertura
    let canales = { 'CALL CENTER': 0, 'COBERTURA': 0, 'OTROS': 0 };
    let vColIdVend = getColExacto(db.vendedores[0], ['ID_VENDEDOR', 'VENDEDOR']);
    let ventColIdVend = getColExacto(db.ventas[0], ['ID_VENDEDOR', 'VENDEDOR']);
    let vColTipo = getColExacto(db.vendedores[0], ['TIPO', 'TIPO DE VENDEDOR']);

    db.ventas.forEach(venta => {
        let vend = db.vendedores.find(v => String(v[vColIdVend]).trim() === String(venta[ventColIdVend]).trim());
        let tipo = vend && vend[vColTipo] ? String(vend[vColTipo]).toUpperCase() : 'OTROS';
        let valor = parseNum(venta[ventColPrecio]);
        if (tipo.includes('CALL CENTER')) canales['CALL CENTER'] += valor; 
        else if (tipo.includes('COBERTURA')) canales['COBERTURA'] += valor; 
        else canales['OTROS'] += valor;
    });
    dibujarDona(['Call Center', 'Cobertura', 'Otros'], [canales['CALL CENTER'], canales['COBERTURA'], canales['OTROS']], ['#4285f4', '#ea4335', '#fbbc05']);
    
    // Gráfico de líneas (Fechas)
    let daily = {};
    let ventColFecha = getColExacto(db.ventas[0], ['FECHA DE VENTA', 'FECHA']);
    db.ventas.forEach(v => { let fec = v[ventColFecha]; if(fec) daily[fec] = (daily[fec] || 0) + parseNum(v[ventColPrecio]); });
    let fechasOrdenadas = Object.keys(daily).sort((a,b) => { let [d1,m1,y1] = a.split('/'); let [d2,m2,y2] = b.split('/'); return new Date(y1, m1-1, d1) - new Date(y2, m2-1, d2); });
    
    if(graficos.linea) graficos.linea.destroy();
    graficos.linea = new Chart(document.getElementById('chartLinea').getContext('2d'), { 
        type: 'line', data: { labels: fechasOrdenadas.map(f => f.split('/')[0]+'/'+f.split('/')[1]), datasets: [{ label: 'Ventas', data: fechasOrdenadas.map(f => daily[f]), borderColor: '#4285f4', fill: false, tension: 0.1 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // Gráfico de Barras (Ranking Metas)
    let vColNom = getColExacto(db.vendedores[0], ['NOMBRE']);
    let rankingMetaArr = db.vendedores.filter(v => parseNum(v[vColMeta]) > 0).map(v => {
        let susV = db.ventas.filter(venta => String(venta[ventColIdVend]).trim() === String(v[vColIdVend]).trim());
        let tot = susV.reduce((sum, venta) => sum + parseNum(venta[ventColPrecio]), 0);
        return { nombre: v[vColNom], pct: (tot / parseNum(v[vColMeta])) * 100 };
    }).sort((a,b) => b.pct - a.pct);

    if(graficos.rankingMeta) graficos.rankingMeta.destroy();
    graficos.rankingMeta = new Chart(document.getElementById('chartRankingMeta').getContext('2d'), { 
        type: 'bar', data: { labels: rankingMetaArr.map(r => r.nombre), datasets: [{ label: 'Avance %', data: rankingMetaArr.map(r => Math.min(r.pct, 100)), backgroundColor: '#4285f4' }, { label: 'Meta Faltante', data: rankingMetaArr.map(r => Math.max(0, 100 - r.pct)), backgroundColor: '#ea4335' }] }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, max: 120 } } }
    });
}

/* ==========================================
   VISTA 1B: VENDEDOR INDIVIDUAL (REPARADA)
   ========================================== */
function cargarVistaVendedor(vendedorData, liElement) {
    limpiarSeleccionMenu(liElement);
    document.getElementById('vistaInteligencia').style.display = 'none';
    document.getElementById('vistaPrincipal').style.display = 'block';
    
    let vColNom = getColExacto(vendedorData, ['NOMBRE']);
    let vColApe = getColExacto(vendedorData, ['APELLIDO']);
    let vColTipo = getColExacto(vendedorData, ['TIPO', 'TIPO DE VENDEDOR']);
    
    document.getElementById('tituloDashboard').textContent = `Análisis: ${vendedorData[vColNom]} ${vendedorData[vColApe] || ''}`;
    const tag = document.getElementById('tipoVendedorTag');
    tag.textContent = (vendedorData[vColTipo] || 'No Asignado').toUpperCase();
    tag.style.display = 'inline-block';
    
    document.getElementById('cardGlobalLinea').style.display = 'none';
    document.getElementById('cardGlobalRankingMeta').style.display = 'none';
    document.getElementById('cardVendedorProdUnid').style.display = 'flex';
    document.getElementById('cardVendedorProdCaja').style.display = 'flex';
    document.getElementById('cardVendedorClientes').style.display = 'flex';
    document.getElementById('tituloGraficoDona').textContent = "Clientes Activos vs Inactivos";

    // Variables de búsqueda exactas
    let vColIdVend = getColExacto(vendedorData, ['ID_VENDEDOR', 'VENDEDOR']);
    let ventColIdVend = getColExacto(db.ventas[0], ['ID_VENDEDOR', 'VENDEDOR']);
    let ventColPrecio = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'PRECIO', 'TOTAL']);
    let vColMeta = getColExacto(vendedorData, ['META']);
    let idBuscado = String(vendedorData[vColIdVend]).trim();

    // Cálculos de KPIs del Vendedor
    const susVentas = db.ventas.filter(v => String(v[ventColIdVend]).trim() === idBuscado);
    let metaVendedor = parseNum(vendedorData[vColMeta]);
    let suVentaTotal = susVentas.reduce((sum, v) => sum + parseNum(v[ventColPrecio]), 0);
    let porcentajeVendedor = metaVendedor > 0 ? (suVentaTotal / metaVendedor) * 100 : 0;

    let cliColIdVend = getColExacto(db.clientes[0], ['ID_VENDEDOR', 'VENDEDOR']);
    let cliColEstado = getColExacto(db.clientes[0], ['ESTADO DE VENTA', 'ESTADO']);
    let susClientesAsignados = db.clientes.filter(c => String(c[cliColIdVend]).trim() === idBuscado);
    
    let clientesActivos = susClientesAsignados.filter(c => c[cliColEstado] && String(c[cliColEstado]).toUpperCase().includes('ACTIVO')).length;
    clientesInactivosActual = susClientesAsignados.filter(c => c[cliColEstado] && String(c[cliColEstado]).toUpperCase().includes('INACTIVO'));

    // RESTAURACIÓN DE KPIs DE VENDEDOR
    document.getElementById('contenedorKPIs').innerHTML = `
        <div class="kpi-box destacado"><h4>Venta Acumulada</h4><span>${formatearMoneda(suVentaTotal)}</span></div>
        <div class="kpi-box"><h4>Meta Asignada</h4><span>${formatearMoneda(metaVendedor)}</span></div>
        <div class="kpi-box"><h4>Clientes Totales</h4><span>${susClientesAsignados.length}</span></div>
        <div class="kpi-box"><h4>Clientes Activos</h4><span>${clientesActivos}</span></div>
        <div class="kpi-box kpi-clickable" onclick="mostrarModalInactivos()" title="Ver lista de inactivos">
            <h4>Inactivos 🔍</h4><span>${clientesInactivosActual.length}</span>
        </div>
    `;

    dibujarVelocimetro(porcentajeVendedor);
    dibujarDona(['Activo', 'Inactivo'], [clientesActivos, clientesInactivosActual.length], ['#4285f4', '#ea4335']);

    // RESTAURACIÓN DE TABLAS DE PRODUCTOS Y CLIENTES
    if (db.productos.length > 0) {
        let pColId = getColExacto(db.productos[0], ['ID_VENDEDOR', 'VENDEDOR']);
        let pColNombre = getColExacto(db.productos[0], ['NOMBRE DEL PRODUCTO', 'NOMBRE  DEL PRODUCTO', 'PRODUCTO']);
        let pColCaja = getColExacto(db.productos[0], ['CANTIDAD CAJA', 'CAJA']);
        let pColUnid = getColExacto(db.productos[0], ['CANTIDAD UNID', 'UNID']);

        let susProductosRows = db.productos.filter(p => String(p[pColId]).trim() === idBuscado);
        let countsUnid = {}; let countsCaja = {};

        susProductosRows.forEach(p => { 
            let nombre = p[pColNombre];
            let cantUnid = parseNum(p[pColUnid]); let cantCaja = parseNum(p[pColCaja]);
            if(nombre) {
                if(cantUnid > 0) countsUnid[nombre] = (countsUnid[nombre] || 0) + cantUnid; 
                if(cantCaja > 0) countsCaja[nombre] = (countsCaja[nombre] || 0) + cantCaja; 
            }
        });
        poblarTablaHTML('tablaProdUnid', countsUnid, false); 
        poblarTablaHTML('tablaProdCaja', countsCaja, false);
    }

    let countsClientes = {};
    let ventColRazon = getColExacto(db.ventas[0], ['RAZÓN SOCIAL', 'RAZON SOCIAL', 'RAZON']);
    susVentas.forEach(v => { 
        let razonSocial = v[ventColRazon];
        let ventaTotal = parseNum(v[ventColPrecio]);
        if(razonSocial && ventaTotal > 0) countsClientes[razonSocial] = (countsClientes[razonSocial] || 0) + ventaTotal; 
    });
    poblarTablaHTML('tablaClientesVend', countsClientes, true);
}

/* ==========================================
   VISTA 2: INTELIGENCIA COMERCIAL (MANTENIDA)
   ========================================== */
function cargarVistaInteligencia(liElement) {
    limpiarSeleccionMenu(liElement);
    document.getElementById('vistaPrincipal').style.display = 'none';
    document.getElementById('vistaInteligencia').style.display = 'block';
    document.getElementById('tituloDashboard').textContent = "Estrategia e Inteligencia Comercial";
    document.getElementById('tipoVendedorTag').style.display = 'none';

    let ventColPrecio = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'PRECIO', 'TOTAL']);
    let ventColRazon = getColExacto(db.ventas[0], ['RAZÓN SOCIAL', 'RAZON SOCIAL']);
    let ventaTotal = db.ventas.reduce((sum, v) => sum + parseNum(v[ventColPrecio]), 0);
    
    let numTransacciones = db.ventas.length;
    let ticketPromedio = numTransacciones > 0 ? (ventaTotal / numTransacciones) : 0;
    document.getElementById('kpiTicketPromedio').textContent = formatearMoneda(ticketPromedio);

    let comprasPorCliente = {};
    db.ventas.forEach(v => {
        let razon = String(v[ventColRazon]).trim().toUpperCase();
        if(razon && razon !== 'UNDEFINED' && razon !== 'NULL') {
            if(!comprasPorCliente[razon]) comprasPorCliente[razon] = { total: 0, transacciones: 0 };
            comprasPorCliente[razon].total += parseNum(v[ventColPrecio]);
            comprasPorCliente[razon].transacciones += 1;
        }
    });

    let totalClientesCompradores = Object.keys(comprasPorCliente).length;
    let freqPromedio = totalClientesCompradores > 0 ? (numTransacciones / totalClientesCompradores).toFixed(1) : 0;
    document.getElementById('kpiFrecuencia').textContent = freqPromedio;

    // Segmentación ABC
    let clientesArray = Object.keys(comprasPorCliente).map(k => ({ nombre: k, total: comprasPorCliente[k].total }));
    clientesArray.sort((a,b) => b.total - a.total);
    
    let tbodyABC = document.querySelector('#tablaABC tbody');
    tbodyABC.innerHTML = '';
    let sumaAcumulada = 0;
    
    clientesArray.forEach(cli => {
        sumaAcumulada += cli.total;
        let porcentaje = (sumaAcumulada / ventaTotal) * 100;
        let segmento = ''; let badgeClass = '';
        
        if (porcentaje <= 80) { segmento = 'A (Top)'; badgeClass = 'badge-a'; }
        else if (porcentaje <= 95) { segmento = 'B (Medio)'; badgeClass = 'badge-b'; }
        else { segmento = 'C (Bajo)'; badgeClass = 'badge-c'; }

        let tr = document.createElement('tr');
        tr.innerHTML = `<td>${cli.nombre}</td><td><span class="badge ${badgeClass}">${segmento}</span></td><td class="num-col">${formatearMoneda(cli.total)}</td>`;
        tbodyABC.appendChild(tr);
    });

    // Riesgo de Fuga
    let colCliRazon = getColExacto(db.clientes[0], ['RAZÓN SOCIAL', 'NOMBRE COMERCIAL']);
    let clientesEnRiesgo = [];
    
    db.clientes.forEach(c => {
        let razonDB = String(c[colCliRazon]).trim().toUpperCase();
        let colEstado = getColExacto(c, ['ESTADO DE VENTA', 'ESTADO']);
        let estado = c[colEstado] ? String(c[colEstado]).toUpperCase() : '';
        if (estado.includes('ACTIVO') && !comprasPorCliente[razonDB]) {
            clientesEnRiesgo.push(razonDB);
        }
    });

    document.getElementById('kpiRiesgo').textContent = clientesEnRiesgo.length;
    let tbodyRiesgo = document.querySelector('#tablaRiesgo tbody');
    tbodyRiesgo.innerHTML = '';
    
    if(clientesEnRiesgo.length === 0) {
        tbodyRiesgo.innerHTML = `<tr><td colspan="2" style="textalign:center;">No hay alertas de fuga críticas</td></tr>`;
    } else {
        clientesEnRiesgo.slice(0, 10).forEach(cli => {
            let tr = document.createElement('tr');
            tr.innerHTML = `<td>${cli}</td><td><span class="badge badge-riesgo">Sin compra reciente</span></td>`;
            tbodyRiesgo.appendChild(tr);
        });
    }

    // Oportunidades Geográficas
    let colUbicacion = getColExacto(db.clientes[0], ['UBICACIÓN', 'DISTRITO', 'CIUDAD']);
    let ventasPorZona = {};
    
    db.ventas.forEach(v => {
        let idCliVenta = String(v[getColExacto(db.ventas[0], ['ID_CLIENTE'])]).trim();
        let clienteData = db.clientes.find(c => String(c[getColExacto(db.clientes[0], ['ID_CLIENTE'])]).trim() === idCliVenta);
        
        let ubicacion = clienteData && clienteData[colUbicacion] ? String(clienteData[colUbicacion]) : 'Zona No Especificada';
        let zonaCorta = ubicacion.split('-').pop().trim();
        
        let valorVenta = parseNum(v[ventColPrecio]);
        ventasPorZona[zonaCorta] = (ventasPorZona[zonaCorta] || 0) + valorVenta;
    });

    let zonasArray = Object.keys(ventasPorZona).map(k => ({ zona: k, total: ventasPorZona[k] })).sort((a,b) => b.total - a.total);
    let tbodyGeografia = document.querySelector('#tablaGeografia tbody');
    tbodyGeografia.innerHTML = '';
    
    zonasArray.slice(0, 8).forEach(z => {
        let tr = document.createElement('tr');
        tr.innerHTML = `<td>📍 ${z.zona}</td><td class="num-col">${formatearMoneda(z.total)}</td>`;
        tbodyGeografia.appendChild(tr);
    });
}

// ==========================================
// FUNCIONES AUXILIARES GLOBALES
// ==========================================

function dibujarVelocimetro(pct) {
    if(graficos.velocimetro) graficos.velocimetro.destroy();
    graficos.velocimetro = new Chart(document.getElementById('chartVelocimetro').getContext('2d'), { 
        type: 'doughnut', data: { datasets: [{ data: [pct, Math.max(0,100-pct)], backgroundColor: ['#34a853', '#ea4335'], borderWidth: 0 }] }, 
        options: { responsive: true, maintainAspectRatio: true, aspectRatio: 2, rotation: -90, circumference: 180, cutout: '75%', plugins:{legend:{display:false}} } 
    });
    document.getElementById('textoVelocimetro').textContent = pct.toFixed(1) + '%';
}

function dibujarDona(labels, data, bg) {
    if(graficos.dona) graficos.dona.destroy();
    graficos.dona = new Chart(document.getElementById('chartDona').getContext('2d'), { 
        type: 'pie', data: { labels: labels, datasets: [{ data: data, backgroundColor: bg }] },
        options: { responsive: true, maintainAspectRatio: true, aspectRatio: 1, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } } 
    });
}

function poblarTablaHTML(tableId, dataObj, esMoneda) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    tbody.innerHTML = '';
    let items = Object.keys(dataObj).map(key => ({ label: key, valor: dataObj[key] })).sort((a,b) => b.valor - a.valor).slice(0, 5);
    
    if(items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; color:#9aa0a6;">Sin registros de movimiento</td></tr>`;
        return;
    }
    
    items.forEach(item => {
        let row = document.createElement('tr');
        let cellLabel = document.createElement('td'); cellLabel.textContent = item.label;
        let cellValor = document.createElement('td'); cellValor.className = 'num-col';
        cellValor.textContent = esMoneda ? formatearMoneda(item.valor) : item.valor.toLocaleString();
        row.appendChild(cellLabel); row.appendChild(cellValor); tbody.appendChild(row);
    });
}

function mostrarModalInactivos() { document.getElementById('modalInactivos').style.display = 'flex'; }
function cerrarModalInactivos() { document.getElementById('modalInactivos').style.display = 'none'; }
