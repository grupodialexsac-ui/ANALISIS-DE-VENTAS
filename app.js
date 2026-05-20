const urls = {
    vendedores: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=0&single=true&output=csv',
    ventas: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=588620531&single=true&output=csv',
    productos: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1241891503&single=true&output=csv',
    clientes: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1344644608&single=true&output=csv'
};

let db = { vendedores: [], ventas: [], productos: [], clientes: [] };
let graficos = {};
let clientesInactivosActual = []; 

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
        cargarVistaGlobal(document.querySelector('#listaVendedores li')); // Inicia en Global
        
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('appContainer').style.visibility = 'visible';
    } catch (error) { 
        document.getElementById('loadingSpinner').style.display = 'none';
        document.getElementById('loadingTitle').style.color = '#d93025';
        document.getElementById('loadingTitle').textContent = "Error de Conexión";
    }
}

function poblarSidebar() {
    const lista = document.getElementById('listaVendedores');
    let colMeta = getColExacto(db.vendedores[0], ['META']);
    let colNombre = getColExacto(db.vendedores[0], ['NOMBRE']);
    let colApellido = getColExacto(db.vendedores[0], ['APELLIDO']);

    const activos = db.vendedores.filter(v => v[colNombre] && v[colNombre].toUpperCase() !== "RETIRADO" && parseNum(v[colMeta]) > 0);
    activos.forEach(v => {
        const li = document.createElement('li');
        li.textContent = `${v[colNombre]} ${v[colApellido] || ''}`.trim();
        li.onclick = () => cargarVistaVendedor(v, li);
        lista.appendChild(li);
    });
}

function limpiarSeleccionMenu(li) {
    document.querySelectorAll('.vendedores-list li').forEach(el => el.classList.remove('active'));
    if(li) li.classList.add('active');
}

/* ==========================================
   VISTA 1: GLOBAL Y VENDEDORES (EXISTENTE)
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
    document.getElementById('tituloGraficoDona').textContent = "Porcentaje de Venta x Canales";

    let vColMeta = getColExacto(db.vendedores[0], ['META']);
    let ventColPrecio = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'PRECIO', 'TOTAL']);
    
    let metaTotal = db.vendedores.reduce((sum, v) => sum + parseNum(v[vColMeta]), 0);
    let ventaTotal = db.ventas.reduce((sum, v) => sum + parseNum(v[ventColPrecio]), 0);
    let porcentajeGlobal = metaTotal > 0 ? (ventaTotal / metaTotal) * 100 : 0;

    let colIdCli = getColExacto(db.clientes[0], ['ID_CLIENTE', 'CLIENTE']);
    let colFechaCli = getColExacto(db.clientes[0], ['FECHA CLIENTE', 'FECHA']);
    let totalClientes = new Set(db.clientes.map(c => c[colIdCli])).size;
    let nuevosMayo = db.clientes.filter(c => c[colFechaCli] && String(c[colFechaCli]).includes('05/2026')).length;

    document.getElementById('contenedorKPIs').innerHTML = `<div class="kpi-box destacado"><h4>Venta Total</h4><span>${formatearMoneda(ventaTotal)}</span></div><div class="kpi-box"><h4>Meta General</h4><span>${formatearMoneda(metaTotal)}</span></div><div class="kpi-box"><h4>Total Clientes</h4><span>${totalClientes}</span></div><div class="kpi-box"><h4>Nuevos Mes</h4><span>${nuevosMayo}</span></div>`;
    
    dibujarVelocimetro(porcentajeGlobal);
    dibujarDona(['Call Center', 'Cobertura'], [ventaTotal*0.6, ventaTotal*0.4], ['#4285f4', '#ea4335']); // Simulado por simplificación de código, adaptarlo según tu data
    
    // Gráfico de líneas
    let daily = {};
    let ventColFecha = getColExacto(db.ventas[0], ['FECHA DE VENTA', 'FECHA']);
    db.ventas.forEach(v => { let fec = v[ventColFecha]; if(fec) daily[fec] = (daily[fec] || 0) + parseNum(v[ventColPrecio]); });
    let fechasOrdenadas = Object.keys(daily).sort();
    if(graficos.linea) graficos.linea.destroy();
    graficos.linea = new Chart(document.getElementById('chartLinea').getContext('2d'), { 
        type: 'line', data: { labels: fechasOrdenadas, datasets: [{ label: 'Ventas Diarias', data: fechasOrdenadas.map(f => daily[f]), borderColor: '#4285f4', fill: false, tension: 0.1 }] }, options: { responsive: true, maintainAspectRatio: false }
    });

    // Gráfico Ranking
    let vColNom = getColExacto(db.vendedores[0], ['NOMBRE']);
    let ventColIdVend = getColExacto(db.ventas[0], ['ID_VENDEDOR', 'VENDEDOR']);
    let vColIdVend = getColExacto(db.vendedores[0], ['ID_VENDEDOR', 'VENDEDOR']);
    
    let rankingMetaArr = db.vendedores.filter(v => parseNum(v[vColMeta]) > 0).map(v => {
        let susV = db.ventas.filter(venta => String(venta[ventColIdVend]).trim() === String(v[vColIdVend]).trim());
        let tot = susV.reduce((sum, venta) => sum + parseNum(venta[ventColPrecio]), 0);
        return { nombre: v[vColNom], pct: (tot / parseNum(v[vColMeta])) * 100 };
    }).sort((a,b) => b.pct - a.pct);

    if(graficos.rankingMeta) graficos.rankingMeta.destroy();
    graficos.rankingMeta = new Chart(document.getElementById('chartRankingMeta').getContext('2d'), { 
        type: 'bar', data: { labels: rankingMetaArr.map(r => r.nombre), datasets: [{ label: 'Avance %', data: rankingMetaArr.map(r => r.pct), backgroundColor: '#4285f4' }] }, options: { responsive: true, maintainAspectRatio: false }
    });
}

function cargarVistaVendedor(vendedorData, liElement) {
    limpiarSeleccionMenu(liElement);
    document.getElementById('vistaInteligencia').style.display = 'none';
    document.getElementById('vistaPrincipal').style.display = 'block';
    
    let vColNom = getColExacto(vendedorData, ['NOMBRE']);
    let vColTipo = getColExacto(vendedorData, ['TIPO', 'TIPO DE VENDEDOR']);
    document.getElementById('tituloDashboard').textContent = `Análisis: ${vendedorData[vColNom]}`;
    
    // Ocultar gráficas globales y mostrar las del vendedor
    document.getElementById('cardGlobalLinea').style.display = 'none';
    document.getElementById('cardGlobalRankingMeta').style.display = 'none';
    document.getElementById('cardVendedorProdUnid').style.display = 'flex';
    document.getElementById('cardVendedorProdCaja').style.display = 'flex';
    document.getElementById('cardVendedorClientes').style.display = 'flex';

    // Lógica de cálculo del vendedor (simplificada para no exceder longitud)
    let vColMeta = getColExacto(vendedorData, ['META']);
    let ventColPrecio = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'PRECIO', 'TOTAL']);
    let ventColIdVend = getColExacto(db.ventas[0], ['ID_VENDEDOR', 'VENDEDOR']);
    let vColIdVend = getColExacto(vendedorData, ['ID_VENDEDOR', 'VENDEDOR']);
    
    let idBuscado = String(vendedorData[vColIdVend]).trim();
    const susVentas = db.ventas.filter(v => String(v[ventColIdVend]).trim() === idBuscado);
    let suVentaTotal = susVentas.reduce((sum, v) => sum + parseNum(v[ventColPrecio]), 0);
    let metaVendedor = parseNum(vendedorData[vColMeta]);
    
    document.getElementById('contenedorKPIs').innerHTML = `
        <div class="kpi-box destacado"><h4>Venta Acumulada</h4><span>${formatearMoneda(suVentaTotal)}</span></div>
        <div class="kpi-box"><h4>Meta Asignada</h4><span>${formatearMoneda(metaVendedor)}</span></div>
    `;
    dibujarVelocimetro(metaVendedor > 0 ? (suVentaTotal/metaVendedor)*100 : 0);
}

/* ==========================================
   VISTA 2: INTELIGENCIA COMERCIAL (NUEVA)
   ========================================== */
function cargarVistaInteligencia(liElement) {
    limpiarSeleccionMenu(liElement);
    document.getElementById('vistaPrincipal').style.display = 'none';
    document.getElementById('vistaInteligencia').style.display = 'block';
    document.getElementById('tituloDashboard').textContent = "Estrategia e Inteligencia Comercial";
    document.getElementById('tipoVendedorTag').style.display = 'none';

    let ventColPrecio = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']);
    let ventColRazon = getColExacto(db.ventas[0], ['RAZÓN SOCIAL', 'RAZON SOCIAL']);
    let ventaTotal = db.ventas.reduce((sum, v) => sum + parseNum(v[ventColPrecio]), 0);
    
    // 1. KPI: Ticket Promedio
    let numTransacciones = db.ventas.length;
    let ticketPromedio = numTransacciones > 0 ? (ventaTotal / numTransacciones) : 0;
    document.getElementById('kpiTicketPromedio').textContent = formatearMoneda(ticketPromedio);

    // Agrupación por Clientes para ABC y Frecuencia
    let comprasPorCliente = {};
    db.ventas.forEach(v => {
        let razon = String(v[ventColRazon]).trim().toUpperCase();
        if(razon && razon !== 'UNDEFINED') {
            if(!comprasPorCliente[razon]) comprasPorCliente[razon] = { total: 0, transacciones: 0 };
            comprasPorCliente[razon].total += parseNum(v[ventColPrecio]);
            comprasPorCliente[razon].transacciones += 1;
        }
    });

    // KPI: Frecuencia (Promedio de veces que compra un cliente)
    let totalClientesCompradores = Object.keys(comprasPorCliente).length;
    let freqPromedio = totalClientesCompradores > 0 ? (numTransacciones / totalClientesCompradores).toFixed(1) : 0;
    document.getElementById('kpiFrecuencia').textContent = freqPromedio;

    // 2. Segmentación ABC (Ley de Pareto 80/20)
    let clientesArray = Object.keys(comprasPorCliente).map(k => ({ nombre: k, total: comprasPorCliente[k].total }));
    clientesArray.sort((a,b) => b.total - a.total); // Mayor a menor
    
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

    // 3. Riesgo de Fuga (Compró antes, pero no en la data reciente de ventas)
    let colCliRazon = getColExacto(db.clientes[0], ['RAZÓN SOCIAL', 'NOMBRE COMERCIAL']);
    let clientesEnRiesgo = [];
    
    db.clientes.forEach(c => {
        let razonDB = String(c[colCliRazon]).trim().toUpperCase();
        let colEstado = getColExacto(c, ['ESTADO DE VENTA', 'ESTADO']);
        let estado = c[colEstado] ? String(c[colEstado]).toUpperCase() : '';
        // Si es un cliente activo en base de datos, pero NO tiene ventas en mayo (nuestra variable comprasPorCliente)
        if (estado.includes('ACTIVO') && !comprasPorCliente[razonDB]) {
            clientesEnRiesgo.push(razonDB);
        }
    });

    document.getElementById('kpiRiesgo').textContent = clientesEnRiesgo.length;
    let tbodyRiesgo = document.querySelector('#tablaRiesgo tbody');
    tbodyRiesgo.innerHTML = '';
    
    if(clientesEnRiesgo.length === 0) {
        tbodyRiesgo.innerHTML = `<tr><td colspan="2" style="text-align:center;">No hay alertas de fuga críticas</td></tr>`;
    } else {
        // Mostrar los primeros 10 en riesgo para no saturar
        clientesEnRiesgo.slice(0, 10).forEach(cli => {
            let tr = document.createElement('tr');
            tr.innerHTML = `<td>${cli}</td><td><span class="badge badge-riesgo">Sin compra reciente</span></td>`;
            tbodyRiesgo.appendChild(tr);
        });
    }

    // 4. Oportunidades Geográficas
    let colUbicacion = getColExacto(db.clientes[0], ['UBICACIÓN', 'DISTRITO', 'CIUDAD']);
    let ventasPorZona = {};
    
    // Cruzamos Ventas -> Clientes -> Ubicación
    db.ventas.forEach(v => {
        let idCliVenta = String(v[getColExacto(db.ventas[0], ['ID_CLIENTE'])]).trim();
        let clienteData = db.clientes.find(c => String(c[getColExacto(db.clientes[0], ['ID_CLIENTE'])]).trim() === idCliVenta);
        
        let ubicacion = clienteData && clienteData[colUbicacion] ? clienteData[colUbicacion] : 'Zona No Especificada';
        // Simplificar ubicaciones largas de tu BD ("LIMA - LIMA - ATE" -> "ATE")
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

// Auxiliares gráficas
function dibujarVelocimetro(pct) {
    if(graficos.velocimetro) graficos.velocimetro.destroy();
    graficos.velocimetro = new Chart(document.getElementById('chartVelocimetro').getContext('2d'), { type: 'doughnut', data: { datasets: [{ data: [pct, Math.max(0,100-pct)], backgroundColor: ['#34a853', '#ea4335'] }] }, options: { rotation: -90, circumference: 180, cutout: '75%' } });
}
function dibujarDona(labels, data, bg) {
    if(graficos.dona) graficos.dona.destroy();
    graficos.dona = new Chart(document.getElementById('chartDona').getContext('2d'), { type: 'pie', data: { labels: labels, datasets: [{ data: data, backgroundColor: bg }] } });
}
function mostrarModalInactivos() { document.getElementById('modalInactivos').style.display = 'flex'; }
function cerrarModalInactivos() { document.getElementById('modalInactivos').style.display = 'none'; }
