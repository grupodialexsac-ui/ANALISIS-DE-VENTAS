const urls = {
    vendedores: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=0&single=true&output=csv',
    ventas: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=588620531&single=true&output=csv',
    productos: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1241891503&single=true&output=csv',
    clientes: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1344644608&single=true&output=csv'
};

let db = { vendedores: [], ventas: [], productos: [], clientes: [] };
let graficos = {};
let clientesInactivosActual = []; 
let vendedoresActivos = []; // Array limpio para el menú desplegable

// Utilidades
function getCol(obj, palabraClave) {
    if(!obj) return null;
    return Object.keys(obj).find(k => k.toUpperCase().includes(palabraClave.toUpperCase())) || null;
}
function parseNum(val) {
    if (!val) return 0;
    let num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
}
function formatearMoneda(valor) {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(valor);
}
function parseCSV(str) {
    str = str.replace(/^\uFEFF/gm, "").replace(/^\xEF\xBB\xBF/gm,"");
    const arr = []; let quote = false;
    for (let row = 0, col = 0, c = 0; c < str.length; c++) {
        let cc = str[c], nc = str[c+1];
        arr[row] = arr[row] || []; arr[row][col] = arr[row][col] || '';
        if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; continue; }
        if (cc == '"') { quote = !quote; continue; }
        if (cc == ',' && !quote) { ++col; continue; }
        if (cc == '\r' && nc == '\n' && !quote) { ++row; col = 0; ++c; continue; }
        if (cc == '\n' && !quote) { ++row; col = 0; continue; }
        if (cc == '\r' && !quote) { ++row; col = 0; continue; }
        arr[row][col] += cc;
    }
    const headers = arr[0].map(h => h.trim().replace(/^[^a-zA-Z0-9_]+/, ''));
    return arr.slice(1).map(row => {
        const obj = {}; headers.forEach((h, i) => obj[h] = row[i] ? row[i].trim() : ''); return obj;
    });
}

// Seguridad
function evaluarTeclado(e) { if (e.key === 'Enter') verificarPassword(); }
function evaluarEnterBusqueda(e) { if (e.key === 'Enter') ejecutarBusquedaCliente(); }
function verificarPassword() {
    const pass = document.getElementById('passInput').value;
    if (pass === "Dialex123") {
        document.getElementById('loginScreen').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('loadingScreen').style.display = 'flex';
            inicializarApp(); 
        }, 300);
    } else { document.getElementById('loginError').style.display = 'block'; }
}

// Motor de Arranque
async function inicializarApp() {
    try {
        const [resVend, resVent, resProd, resCli] = await Promise.all([
            fetch(urls.vendedores), fetch(urls.ventas), fetch(urls.productos), fetch(urls.clientes)
        ]);
        db.vendedores = parseCSV(await resVend.text()); db.ventas = parseCSV(await resVent.text());
        db.productos = parseCSV(await resProd.text()); db.clientes = parseCSV(await resCli.text());
        
        prepararSelectorVendedores();
        prepararBuscador();
        navToGlobal(); // Inicia en la pestaña principal
        
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('appContainer').style.visibility = 'visible';
    } catch (error) { 
        console.error(error); alert("Error de red. Verifica tu conexión."); 
    }
}

// Preparar Listas
function prepararSelectorVendedores() {
    const select = document.getElementById('vendedorSelect');
    let colMeta = getCol(db.vendedores[0], 'META');
    let colNombre = getCol(db.vendedores[0], 'NOMBRE');
    let colApellido = getCol(db.vendedores[0], 'APELLIDO');

    vendedoresActivos = db.vendedores.filter(v => v[colNombre] && v[colNombre] !== "RETIRADO" && parseNum(v[colMeta]) > 0);
    
    vendedoresActivos.forEach((v, index) => {
        let opt = document.createElement('option');
        opt.value = index;
        opt.textContent = `${v[colNombre]} ${v[colApellido] || ''}`;
        select.appendChild(opt);
    });
}

function prepararBuscador() {
    let colRazon = getCol(db.ventas[0], 'RAZÓN') || getCol(db.ventas[0], 'RAZON');
    if (!colRazon) return;
    let clientesUnicos = [...new Set(db.ventas.map(v => v[colRazon]).filter(Boolean))].sort();
    const datalist = document.getElementById('listaNombresClientes');
    clientesUnicos.forEach(cliente => { let opt = document.createElement('option'); opt.value = cliente; datalist.appendChild(opt); });
}

// --- NAVEGACIÓN BOTTOM NAV (APP STYLE) ---
function resetNavUi() {
    document.getElementById('navGlobal').classList.remove('active');
    document.getElementById('navVendedores').classList.remove('active');
    document.getElementById('navBusqueda').classList.remove('active');
}

function navToGlobal() {
    resetNavUi(); document.getElementById('navGlobal').classList.add('active');
    document.getElementById('selectorVendedorContainer').style.display = 'none';
    document.getElementById('vistaBusqueda').style.display = 'none';
    document.getElementById('vistaDashboard').style.display = 'block';
    cargarVistaGlobal();
}

function navToVendedores() {
    resetNavUi(); document.getElementById('navVendedores').classList.add('active');
    document.getElementById('vistaBusqueda').style.display = 'none';
    document.getElementById('vistaDashboard').style.display = 'block';
    document.getElementById('selectorVendedorContainer').style.display = 'block';
    cambiarVendedorSeleccionado(); // Carga el que esté seleccionado en el dropdown
}

function navToBusqueda() {
    resetNavUi(); document.getElementById('navBusqueda').classList.add('active');
    document.getElementById('vistaDashboard').style.display = 'none';
    document.getElementById('selectorVendedorContainer').style.display = 'none';
    document.getElementById('vistaBusqueda').style.display = 'block';
}

function cambiarVendedorSeleccionado() {
    let index = document.getElementById('vendedorSelect').value;
    let vendedorData = vendedoresActivos[index];
    if(vendedorData) cargarVistaVendedor(vendedorData);
}

// --- VISTA 1: GLOBAL ---
function cargarVistaGlobal() {
    document.getElementById('tituloDashboard').textContent = "Vista General - Mayo 2026";
    document.getElementById('tipoVendedorTag').style.display = 'none';
    document.getElementById('cardGlobalLinea').style.display = 'block';
    document.getElementById('cardGlobalRankingMeta').style.display = 'block';
    document.getElementById('cardVendedorProdUnid').style.display = 'none';
    document.getElementById('cardVendedorProdCaja').style.display = 'none';
    document.getElementById('cardVendedorClientes').style.display = 'none';
    document.getElementById('tituloGraficoDona').textContent = "Ventas x Canal";

    let vColMeta = getCol(db.vendedores[0], 'META'); let ventColPrecio = getCol(db.ventas[0], 'PRECIO') || getCol(db.ventas[0], 'TOTAL');
    let metaTotal = db.vendedores.reduce((sum, v) => sum + parseNum(v[vColMeta]), 0);
    let ventaTotal = db.ventas.reduce((sum, v) => sum + parseNum(v[ventColPrecio]), 0);
    let porcentajeGlobal = metaTotal > 0 ? (ventaTotal / metaTotal) * 100 : 0;

    let colIdCli = getCol(db.clientes[0], 'CLIENTE'); let colFechaCli = getCol(db.clientes[0], 'FECHA');
    let totalClientes = new Set(db.clientes.map(c => c[colIdCli])).size;
    let nuevosMayo = db.clientes.filter(c => c[colFechaCli] && c[colFechaCli].includes('05/2026')).length;

    document.getElementById('contenedorKPIs').innerHTML = `<div class="kpi-box destacado"><h4>Venta Total</h4><span>${formatearMoneda(ventaTotal)}</span></div><div class="kpi-box"><h4>Meta General</h4><span>${formatearMoneda(metaTotal)}</span></div><div class="kpi-box"><h4>Clientes</h4><span>${totalClientes}</span></div><div class="kpi-box"><h4>Nuevos Mayo</h4><span>${nuevosMayo}</span></div>`;
    
    dibujarVelocimetro(porcentajeGlobal);
    
    let canales = { 'CALL CENTER': 0, 'COBERTURA': 0, 'OTROS': 0 };
    let vColIdVend = getCol(db.vendedores[0], 'VENDEDOR'); let ventColIdVend = getCol(db.ventas[0], 'VENDEDOR'); let vColTipo = getCol(db.vendedores[0], 'TIPO');
    db.ventas.forEach(venta => {
        let vend = db.vendedores.find(v => v[vColIdVend] === venta[ventColIdVend]);
        let tipo = vend && vend[vColTipo] ? vend[vColTipo].toUpperCase() : 'OTROS';
        let valor = parseNum(venta[ventColPrecio]);
        if (tipo.includes('CALL CENTER')) canales['CALL CENTER'] += valor; else if (tipo.includes('COBERTURA')) canales['COBERTURA'] += valor; else canales['OTROS'] += valor;
    });
    dibujarDona(['Call Center', 'Cobertura', 'Otros'], [canales['CALL CENTER'], canales['COBERTURA'], canales['OTROS']], ['#4285f4', '#ea4335', '#fbbc05']);

    let daily = {}; let ventColFecha = getCol(db.ventas[0], 'FECHA');
    db.ventas.forEach(v => { let fec = v[ventColFecha]; if(fec) daily[fec] = (daily[fec] || 0) + parseNum(v[ventColPrecio]); });
    dibujarLinea(daily, 'chartLinea', 'Ventas (S/)', graficos, 'linea');

    let vColNom = getCol(db.vendedores[0], 'NOMBRE');
    let rankingMetaArr = db.vendedores.filter(v => parseNum(v[vColMeta]) > 0).map(v => {
        let susV = db.ventas.filter(venta => venta[ventColIdVend] === v[vColIdVend]);
        let tot = susV.reduce((sum, venta) => sum + parseNum(venta[ventColPrecio]), 0);
        return { nombre: v[vColNom], pct: (tot / parseNum(v[vColMeta])) * 100 };
    }).sort((a,b) => b.pct - a.pct);

    let dataLogrado = rankingMetaArr.map(r => Math.min(r.pct, 100)); let dataFaltante = rankingMetaArr.map(r => Math.max(0, 100 - r.pct));

    const pluginPorcentajes = {
        id: 'pluginPorcentajes',
        afterDatasetsDraw(chart) {
            if (chart.width < 300) return; 
            const { ctx } = chart; ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.font = 'bold 10px Arial'; ctx.fillStyle = '#202124';
            const meta = chart.getDatasetMeta(0);
            meta.data.forEach((bar, index) => {
                const pctExacto = rankingMetaArr[index].pct;
                const yPos = chart.scales.y.getPixelForValue(100) - 4;
                ctx.fillText(pctExacto.toFixed(1) + '%', bar.x, yPos);
            }); ctx.restore();
        }
    };

    if(graficos.rankingMeta) graficos.rankingMeta.destroy();
    graficos.rankingMeta = new Chart(document.getElementById('chartRankingMeta').getContext('2d'), { 
        type: 'bar', data: { labels: rankingMetaArr.map(r => r.nombre), datasets: [{ label: 'Avance', data: dataLogrado, backgroundColor: '#4285f4' }, { label: 'Faltante', data: dataFaltante, backgroundColor: '#ea4335' }] }, 
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, max: 120, ticks: { callback: value => value <= 100 ? value + '%' : '' } } }, plugins: { legend: { display: true, position: 'bottom' } } }, plugins: [pluginPorcentajes]
    });
}

// --- VISTA 2: VENDEDORES ---
function cargarVistaVendedor(vendedorData) {
    let vColNom = getCol(vendedorData, 'NOMBRE'); let vColApe = getCol(vendedorData, 'APELLIDO'); let vColTipo = getCol(vendedorData, 'TIPO');
    document.getElementById('tituloDashboard').textContent = `${vendedorData[vColNom]} ${vendedorData[vColApe] || ''}`;
    const tag = document.getElementById('tipoVendedorTag'); tag.textContent = (vendedorData[vColTipo] || 'No Asignado').toUpperCase(); tag.style.display = 'inline-block';

    document.getElementById('cardGlobalLinea').style.display = 'none'; document.getElementById('cardGlobalRankingMeta').style.display = 'none';
    document.getElementById('cardVendedorProdUnid').style.display = 'block'; document.getElementById('cardVendedorProdCaja').style.display = 'block'; document.getElementById('cardVendedorClientes').style.display = 'block';
    document.getElementById('tituloGraficoDona').textContent = "Activos vs Inactivos";

    let vColIdVend = getCol(vendedorData, 'VENDEDOR'); let idBuscado = parseInt(vendedorData[vColIdVend]);
    let ventColIdVend = getCol(db.ventas[0], 'VENDEDOR'); let ventColPrecio = getCol(db.ventas[0], 'PRECIO') || getCol(db.ventas[0], 'TOTAL');
    let vColMeta = getCol(vendedorData, 'META');

    const susVentas = db.ventas.filter(v => parseInt(v[ventColIdVend]) === idBuscado);
    let metaVendedor = parseNum(vendedorData[vColMeta]); let suVentaTotal = susVentas.reduce((sum, v) => sum + parseNum(v[ventColPrecio]), 0);
    let porcentajeVendedor = metaVendedor > 0 ? (suVentaTotal / metaVendedor) * 100 : 0;

    let cliColIdVend = getCol(db.clientes[0], 'VENDEDOR'); let cliColEstado = getCol(db.clientes[0], 'ESTADO');
    let susClientesAsignados = db.clientes.filter(c => parseInt(c[cliColIdVend]) === idBuscado);
    let clientesActivos = susClientesAsignados.filter(c => c[cliColEstado] && c[cliColEstado].includes('ACTIVO')).length;
    clientesInactivosActual = susClientesAsignados.filter(c => c[cliColEstado] && c[cliColEstado].includes('INACTIVO'));

    document.getElementById('contenedorKPIs').innerHTML = `<div class="kpi-box destacado"><h4>Venta Acumulada</h4><span>${formatearMoneda(suVentaTotal)}</span></div><div class="kpi-box"><h4>Meta</h4><span>${formatearMoneda(metaVendedor)}</span></div><div class="kpi-box"><h4>Cartera Total</h4><span>${susClientesAsignados.length}</span></div><div class="kpi-box kpi-clickable" onclick="mostrarModalInactivos()"><h4>Inactivos 🔍</h4><span>${clientesInactivosActual.length}</span></div>`;
    
    dibujarVelocimetro(porcentajeVendedor); dibujarDona(['Activo', 'Inactivo'], [clientesActivos, clientesInactivosActual.length], ['#4285f4', '#ea4335']);

    let pColId = getCol(db.productos[0], 'VENDEDOR'); let pColNombre = getCol(db.productos[0], 'NOMBRE'); let pColCaja = getCol(db.productos[0], 'CAJA'); let pColUnid = getCol(db.productos[0], 'UNID');
    let countsUnid = {}; let countsCaja = {};
    db.productos.filter(p => parseInt(p[pColId]) === idBuscado).forEach(p => { 
        let nombre = p[pColNombre]; let cantUnid = parseNum(p[pColUnid]); let cantCaja = parseNum(p[pColCaja]);
        if(nombre) { if(cantUnid > 0) countsUnid[nombre] = (countsUnid[nombre] || 0) + cantUnid; if(cantCaja > 0) countsCaja[nombre] = (countsCaja[nombre] || 0) + cantCaja; }
    });
    poblarTablaHTML('tablaProdUnid', countsUnid, false); poblarTablaHTML('tablaProdCaja', countsCaja, false);

    let countsClientes = {}; let ventColRazon = getCol(db.ventas[0], 'RAZÓN') || getCol(db.ventas[0], 'RAZON');
    susVentas.forEach(v => { let r = v[ventColRazon]; let t = parseNum(v[ventColPrecio]); if(r && t > 0) countsClientes[r] = (countsClientes[r] || 0) + t; });
    poblarTablaHTML('tablaClientesVend', countsClientes, true);
}

// --- VISTA 3: BUSCADOR ---
function ejecutarBusquedaCliente() {
    let inputStr = document.getElementById('inputBusquedaCliente').value.trim().toUpperCase();
    if (!inputStr) { alert("Escribe el nombre de un cliente."); return; }

    let ventColRazon = getCol(db.ventas[0], 'RAZÓN') || getCol(db.ventas[0], 'RAZON');
    let ventColPrecio = getCol(db.ventas[0], 'PRECIO') || getCol(db.ventas[0], 'TOTAL');
    let ventColFecha = getCol(db.ventas[0], 'FECHA');

    let comprasCliente = db.ventas.filter(v => v[ventColRazon] && v[ventColRazon].toUpperCase().includes(inputStr));
    if (comprasCliente.length === 0) { alert("Sin registros en este mes."); return; }

    let compraTotal = comprasCliente.reduce((sum, v) => sum + parseNum(v[ventColPrecio]), 0);
    document.getElementById('kpiBusqueda').innerHTML = `<div class="kpi-box destacado" style="margin:0 auto;"><h4>Total Comprado (Mayo)</h4><span>${formatearMoneda(compraTotal)}</span></div>`;

    let daily = {}; comprasCliente.forEach(v => { let fec = v[ventColFecha]; if(fec) daily[fec] = (daily[fec] || 0) + parseNum(v[ventColPrecio]); });
    dibujarLinea(daily, 'chartLineaCliente', 'Compras (S/)', graficos, 'lineaCliente');

    let pColRazon = getCol(db.productos[0], 'RAZÓN') || getCol(db.productos[0], 'RAZON'); let pColNombre = getCol(db.productos[0], 'NOMBRE'); let pColCaja = getCol(db.productos[0], 'CAJA'); let pColUnid = getCol(db.productos[0], 'UNID');
    let prodCliente = db.productos.filter(p => p[pColRazon] && p[pColRazon].toUpperCase().includes(inputStr));
    let countsUnid = {}; let countsCaja = {};

    prodCliente.forEach(p => { 
        let nombre = p[pColNombre]; let cantUnid = parseNum(p[pColUnid]); let cantCaja = parseNum(p[pColCaja]);
        if(nombre) { if(cantUnid > 0) countsUnid[nombre] = (countsUnid[nombre] || 0) + cantUnid; if(cantCaja > 0) countsCaja[nombre] = (countsCaja[nombre] || 0) + cantCaja; }
    });
    poblarTablaHTML('tablaBusquedaCaja', countsCaja, false); poblarTablaHTML('tablaBusquedaUnid', countsUnid, false);

    document.getElementById('gridResultadosCliente').style.display = 'grid';
}

// --- UTILES ---
function dibujarLinea(dailyData, canvasId, labelText, containerObj, keyObj) {
    let fechasOrdenadas = Object.keys(dailyData).sort((a,b) => { let [d1,m1,y1] = a.split('/'); let [d2,m2,y2] = b.split('/'); return new Date(y1, m1-1, d1) - new Date(y2, m2-1, d2); });
    if(containerObj[keyObj]) containerObj[keyObj].destroy();
    containerObj[keyObj] = new Chart(document.getElementById(canvasId).getContext('2d'), { type: 'line', data: { labels: fechasOrdenadas.map(f => f.split('/')[0]+'/'+f.split('/')[1]), datasets: [{ label: labelText, data: fechasOrdenadas.map(f => dailyData[f]), borderColor: '#4285f4', fill: false, tension: 0.1 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
}
function dibujarVelocimetro(pct) {
    const ctx = document.getElementById('chartVelocimetro').getContext('2d'); document.getElementById('textoVelocimetro').textContent = pct.toFixed(2) + '%';
    let restante = Math.max(0, 100 - pct); if(graficos.velocimetro) graficos.velocimetro.destroy();
    graficos.velocimetro = new Chart(ctx, { type: 'doughnut', data: { labels: ['Logrado', 'Faltante'], datasets: [{ data: [pct, restante], backgroundColor: ['#34a853', '#ea4335'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: true, aspectRatio: 2, rotation: -90, circumference: 180, cutout: '75%', plugins: { legend: { display: false } } } });
}
function dibujarDona(labels, data, colores) {
    const ctx = document.getElementById('chartDona').getContext('2d'); if(graficos.dona) graficos.dona.destroy();
    graficos.dona = new Chart(ctx, { type: 'pie', data: { labels: labels, datasets: [{ data: data, backgroundColor: colores }] }, options: { responsive: true, maintainAspectRatio: true, aspectRatio: 1, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } } });
}
function mostrarModalInactivos() {
    if(!clientesInactivosActual || clientesInactivosActual.length === 0) { alert("Sin inactivos."); return; }
    const tbody = document.querySelector('#tablaInactivos tbody'); tbody.innerHTML = '';
    let colDoc = getCol(clientesInactivosActual[0], 'DOCUMENTO') || getCol(clientesInactivosActual[0], 'NUMERO') || getCol(clientesInactivosActual[0], 'RUC') || getCol(clientesInactivosActual[0], 'DNI');
    let colRazon = getCol(clientesInactivosActual[0], 'RAZÓN') || getCol(clientesInactivosActual[0], 'RAZON') || getCol(clientesInactivosActual[0], 'NOMBRE');
    clientesInactivosActual.forEach(cli => { let tr = document.createElement('tr'); tr.innerHTML = `<td>${cli[colDoc] || '-'}</td><td>${cli[colRazon] || '-'}</td>`; tbody.appendChild(tr); });
    document.getElementById('modalInactivos').style.display = 'flex';
}
function cerrarModalInactivos() { document.getElementById('modalInactivos').style.display = 'none'; }
function poblarTablaHTML(tableId, dataObj, esMoneda) {
    const tbody = document.querySelector(`#${tableId} tbody`); tbody.innerHTML = '';
    let items = Object.keys(dataObj).map(key => ({ label: key, valor: dataObj[key] })).sort((a,b) => b.valor - a.valor).slice(0, 5);
    if(items.length === 0) { tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; color:#9aa0a6;">Sin registros</td></tr>`; return; }
    items.forEach(item => { let row = document.createElement('tr'); let cellLabel = document.createElement('td'); cellLabel.textContent = item.label; let cellValor = document.createElement('td'); cellValor.className = 'num-col'; cellValor.textContent = esMoneda ? formatearMoneda(item.valor) : item.valor.toLocaleString(); row.appendChild(cellLabel); row.appendChild(cellValor); tbody.appendChild(row); });
}
