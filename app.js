const urls = {
    vendedores: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=0&single=true&output=csv',
    ventas: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=588620531&single=true&output=csv',
    productos: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1241891503&single=true&output=csv',
    clientes: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1344644608&single=true&output=csv'
};

let db = { vendedores: [], ventas: [], productos: [], clientes: [] };
let graficos = {};
let clientesInactivosActual = [];
let vendorFilter = '';
let vendorListCollapsed = false;
let currentVendorSelected = null;

Chart.defaults.font.family = "'Segoe UI', Arial, sans-serif";
Chart.defaults.color = '#3c4043';

function getCol(obj, palabraClave) {
    if (!obj) return null;
    return Object.keys(obj).find(k => k.toUpperCase().includes(palabraClave.toUpperCase())) || null;
}

function parseNum(val) {
    if (val === null || val === undefined || val === '') return 0;
    let num = parseFloat(String(val).replace(/,/g, '').replace(/S\/\s?/g, '').trim());
    return isNaN(num) ? 0 : num;
}

function formatearMoneda(valor) {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(valor || 0);
}

function normalizeText(text) {
    return String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();
}

function parseCSV(str) {
    str = String(str || '').replace(/^\uFEFF/gm, "").replace(/^\xEF\xBB\xBF/gm, "");
    const arr = [];
    let quote = false;

    for (let row = 0, col = 0, c = 0; c < str.length; c++) {
        let cc = str[c], nc = str[c + 1];
        arr[row] = arr[row] || [];
        arr[row][col] = arr[row][col] || '';

        if (cc === '"' && quote && nc === '"') {
            arr[row][col] += cc;
            ++c;
            continue;
        }
        if (cc === '"') {
            quote = !quote;
            continue;
        }
        if (cc === ',' && !quote) {
            ++col;
            continue;
        }
        if (cc === '\r' && nc === '\n' && !quote) {
            ++row;
            col = 0;
            ++c;
            continue;
        }
        if (cc === '\n' && !quote) {
            ++row;
            col = 0;
            continue;
        }
        if (cc === '\r' && !quote) {
            ++row;
            col = 0;
            continue;
        }
        arr[row][col] += cc;
    }

    if (!arr.length) return [];

    const headers = (arr[0] || []).map(h => String(h || '').trim().replace(/^[^a-zA-Z0-9_]+/, ''));
    return arr.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => obj[h] = row[i] ? String(row[i]).trim() : '');
        return obj;
    }).filter(obj => Object.values(obj).some(v => String(v || '').trim() !== ''));
}

function parseFlexibleDate(fecha) {
    if (!fecha) return null;

    const s = String(fecha).trim();
    const parts = s.split(/[\/\-]/).map(x => x.trim());

    if (parts.length === 3) {
        let d = parseInt(parts[0], 10);
        let m = parseInt(parts[1], 10) - 1;
        let y = parseInt(parts[2], 10);

        if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
            return new Date(y, m, d);
        }
    }

    const alt = new Date(s);
    return isNaN(alt.getTime()) ? null : alt;
}

function formatDateLabel(fecha) {
    const d = parseFlexibleDate(fecha);
    if (!d) return String(fecha || '');
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}`;
}

function evaluarTeclado(e) {
    if (e.key === 'Enter') verificarPassword();
}

function evaluarEnterBusqueda(e) {
    if (e.key === 'Enter') ejecutarBusquedaCliente();
}

function verificarPassword() {
    const pass = document.getElementById('passInput').value;
    if (pass === "Dialex123") {
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

function injectSidebarEnhancements() {
    const sidebar = document.querySelector('.sidebar');
    const lista = document.getElementById('listaVendedores');
    if (!sidebar || !lista) return;

    if (document.getElementById('vendorToolsWrap')) return;

    const wrap = document.createElement('div');
    wrap.id = 'vendorToolsWrap';
    wrap.style.padding = '12px';
    wrap.style.borderBottom = '1px solid #e8eaed';
    wrap.style.background = '#f8f9fa';

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.flexDirection = 'column';
    controls.style.gap = '8px';

    const search = document.createElement('input');
    search.type = 'text';
    search.id = 'vendorSearchInput';
    search.placeholder = 'Buscar vendedor...';
    search.autocomplete = 'off';
    search.style.width = '100%';
    search.style.boxSizing = 'border-box';
    search.style.padding = '10px 12px';
    search.style.border = '1px solid #dadce0';
    search.style.borderRadius = '8px';
    search.style.outline = 'none';
    search.style.fontSize = '0.95rem';

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.id = 'toggleVendorListBtn';
    toggleBtn.textContent = 'Ocultar lista';
    toggleBtn.style.flex = '1';
    toggleBtn.style.padding = '10px 12px';
    toggleBtn.style.border = 'none';
    toggleBtn.style.borderRadius = '8px';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.style.background = '#e8f0fe';
    toggleBtn.style.color = '#1a73e8';
    toggleBtn.style.fontWeight = '700';

    const count = document.createElement('div');
    count.id = 'vendorCountInfo';
    count.style.fontSize = '0.82rem';
    count.style.color = '#5f6368';
    count.style.textAlign = 'center';

    row.appendChild(toggleBtn);
    controls.appendChild(search);
    controls.appendChild(row);
    controls.appendChild(count);
    wrap.appendChild(controls);

    sidebar.insertBefore(wrap, lista);

    search.addEventListener('input', () => {
        vendorFilter = search.value.trim();
        renderVendorList();
    });

    toggleBtn.addEventListener('click', () => {
        vendorListCollapsed = !vendorListCollapsed;
        lista.style.display = vendorListCollapsed ? 'none' : 'block';
        toggleBtn.textContent = vendorListCollapsed ? 'Mostrar lista' : 'Ocultar lista';
    });
}

async function inicializarApp() {
    try {
        const [resVend, resVent, resProd, resCli] = await Promise.all([
            fetch(urls.vendedores),
            fetch(urls.ventas),
            fetch(urls.productos),
            fetch(urls.clientes)
        ]);

        if (!resVend.ok || !resVent.ok || !resProd.ok || !resCli.ok) {
            throw new Error('No se pudieron descargar todos los archivos CSV.');
        }

        db.vendedores = parseCSV(await resVend.text());
        db.ventas = parseCSV(await resVent.text());
        db.productos = parseCSV(await resProd.text());
        db.clientes = parseCSV(await resCli.text());

        injectSidebarEnhancements();
        poblarSidebar();
        cargarVistaGlobal(document.getElementById('tabGlobal'));
        prepararBuscador();

        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('appContainer').style.visibility = 'visible';
    } catch (error) {
        console.error(error);
        alert("Error descargando datos. Revisa la conexión.");
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('loginScreen').style.opacity = '1';
    }
}

function poblarSidebar() {
    renderVendorList();
}

function renderVendorList() {
    const lista = document.getElementById('listaVendedores');
    if (!lista || !db.vendedores.length) return;

    const colMeta = getCol(db.vendedores[0], 'META');
    const colNombre = getCol(db.vendedores[0], 'NOMBRE');
    const colApellido = getCol(db.vendedores[0], 'APELLIDO');
    const colTipo = getCol(db.vendedores[0], 'TIPO');

    const activos = db.vendedores.filter(v => {
        const nombre = String(v[colNombre] || '').trim();
        const meta = parseNum(v[colMeta]);
        const nombreNorm = normalizeText(`${v[colNombre] || ''} ${v[colApellido] || ''}`);
        const tipoNorm = normalizeText(v[colTipo] || '');
        const filtro = normalizeText(vendorFilter);

        const cumpleFiltro = !filtro || nombreNorm.includes(filtro) || tipoNorm.includes(filtro);
        return nombre && nombre !== "RETIRADO" && meta > 0 && cumpleFiltro;
    });

    lista.innerHTML = '';

    const info = document.getElementById('vendorCountInfo');
    if (info) {
        info.textContent = vendorFilter
            ? `${activos.length} resultado(s)`
            : `${activos.length} vendedor(es) activos`;
    }

    if (!activos.length) {
        const li = document.createElement('li');
        li.textContent = 'Sin resultados';
        li.style.cursor = 'default';
        li.style.color = '#5f6368';
        li.style.fontStyle = 'italic';
        li.style.background = '#fff';
        li.style.padding = '12px 16px';
        lista.appendChild(li);
        return;
    }

    activos.forEach(v => {
        const li = document.createElement('li');
        const nombre = `${v[colNombre] || ''} ${v[colApellido] || ''}`.trim();
        li.textContent = nombre;
        li.dataset.vendorId = v[getCol(v, 'VENDEDOR')] || '';
        li.style.userSelect = 'none';
        li.onclick = () => {
            currentVendorSelected = v;
            document.getElementById('vistaDashboard').style.display = 'block';
            document.getElementById('vistaBusqueda').style.display = 'none';
            cargarVistaVendedor(v, li);
        };
        lista.appendChild(li);
    });
}

function prepararBuscador() {
    let colRazon = getCol(db.ventas[0], 'RAZÓN') || getCol(db.ventas[0], 'RAZON');
    if (!colRazon) return;

    let clientesUnicos = [...new Set(db.ventas.map(v => v[colRazon]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    const datalist = document.getElementById('listaNombresClientes');
    if (!datalist) return;

    datalist.innerHTML = '';
    clientesUnicos.forEach(cliente => {
        let opt = document.createElement('option');
        opt.value = cliente;
        datalist.appendChild(opt);
    });
}

function abrirVistaGlobal() {
    document.getElementById('vistaDashboard').style.display = 'block';
    document.getElementById('vistaBusqueda').style.display = 'none';
    cargarVistaGlobal(document.getElementById('tabGlobal'));
}

function abrirVistaBusqueda() {
    document.getElementById('vistaDashboard').style.display = 'none';
    document.getElementById('vistaBusqueda').style.display = 'block';

    restablecerMenu(null);
    document.getElementById('tabBusqueda').classList.add('active');
    document.getElementById('tabGlobal').classList.remove('active');
}

function restablecerMenu(li) {
    document.querySelectorAll('.vendedores-list li').forEach(el => el.classList.remove('active'));
    if (li) li.classList.add('active');
}

function cargarVistaGlobal(liElement) {
    if (liElement) {
        restablecerMenu(liElement);
        document.getElementById('tabBusqueda').classList.remove('active');
    }

    if (!db.vendedores.length || !db.ventas.length || !db.clientes.length) return;

    document.getElementById('tituloDashboard').textContent = "Vista General - Mayo 2026";
    document.getElementById('tipoVendedorTag').style.display = 'none';
    document.getElementById('cardGlobalLinea').style.display = 'flex';
    document.getElementById('cardGlobalRankingMeta').style.display = 'flex';
    document.getElementById('cardVendedorProdUnid').style.display = 'none';
    document.getElementById('cardVendedorProdCaja').style.display = 'none';
    document.getElementById('cardVendedorClientes').style.display = 'none';
    document.getElementById('tituloGraficoDona').textContent = "Porcentaje de Venta x Canales";

    let vColMeta = getCol(db.vendedores[0], 'META');
    let ventColPrecio = getCol(db.ventas[0], 'PRECIO') || getCol(db.ventas[0], 'TOTAL');

    let metaTotal = db.vendedores.reduce((sum, v) => sum + parseNum(v[vColMeta]), 0);
    let ventaTotal = db.ventas.reduce((sum, v) => sum + parseNum(v[ventColPrecio]), 0);
    let porcentajeGlobal = metaTotal > 0 ? (ventaTotal / metaTotal) * 100 : 0;

    let colIdCli = getCol(db.clientes[0], 'CLIENTE');
    let colFechaCli = getCol(db.clientes[0], 'FECHA');
    let totalClientes = new Set(db.clientes.map(c => c[colIdCli])).size;
    let nuevosMayo = db.clientes.filter(c => c[colFechaCli] && String(c[colFechaCli]).includes('05/2026')).length;

    document.getElementById('contenedorKPIs').innerHTML = `
        <div class="kpi-box destacado">
            <h4>Venta Total</h4>
            <span>${formatearMoneda(ventaTotal)}</span>
        </div>
        <div class="kpi-box">
            <h4>Meta General</h4>
            <span>${formatearMoneda(metaTotal)}</span>
        </div>
        <div class="kpi-box">
            <h4>Total Clientes</h4>
            <span>${totalClientes}</span>
        </div>
        <div class="kpi-box">
            <h4>Nuevos Mayo</h4>
            <span>${nuevosMayo}</span>
        </div>
    `;

    dibujarVelocimetro(porcentajeGlobal);

    let canales = { 'CALL CENTER': 0, 'COBERTURA': 0, 'OTROS': 0 };
    let vColIdVend = getCol(db.vendedores[0], 'VENDEDOR');
    let ventColIdVend = getCol(db.ventas[0], 'VENDEDOR');
    let vColTipo = getCol(db.vendedores[0], 'TIPO');

    db.ventas.forEach(venta => {
        let vend = db.vendedores.find(v => String(v[vColIdVend]) === String(venta[ventColIdVend]));
        let tipo = vend && vend[vColTipo] ? String(vend[vColTipo]).toUpperCase() : 'OTROS';
        let valor = parseNum(venta[ventColPrecio]);

        if (tipo.includes('CALL CENTER')) canales['CALL CENTER'] += valor;
        else if (tipo.includes('COBERTURA')) canales['COBERTURA'] += valor;
        else canales['OTROS'] += valor;
    });

    dibujarDona(
        ['Call Center', 'Cobertura', 'Otros'],
        [canales['CALL CENTER'], canales['COBERTURA'], canales['OTROS']],
        ['#4285f4', '#ea4335', '#fbbc05']
    );

    let daily = {};
    let ventColFecha = getCol(db.ventas[0], 'FECHA');
    db.ventas.forEach(v => {
        let fec = v[ventColFecha];
        if (fec) daily[fec] = (daily[fec] || 0) + parseNum(v[ventColPrecio]);
    });
    dibujarLinea(daily, 'chartLinea', 'Ventas Diarias (S/)', graficos, 'linea');

    let vColNom = getCol(db.vendedores[0], 'NOMBRE');
    let rankingMetaArr = db.vendedores.filter(v => parseNum(v[vColMeta]) > 0).map(v => {
        let susV = db.ventas.filter(venta => String(venta[ventColIdVend]) === String(v[vColIdVend]));
        let tot = susV.reduce((sum, venta) => sum + parseNum(venta[ventColPrecio]), 0);
        return { nombre: v[vColNom], pct: (tot / parseNum(v[vColMeta])) * 100 };
    }).sort((a, b) => b.pct - a.pct);

    let dataLogrado = rankingMetaArr.map(r => Math.min(r.pct, 100));
    let dataFaltante = rankingMetaArr.map(r => Math.max(0, 100 - r.pct));

    const pluginPorcentajes = {
        id: 'pluginPorcentajes',
        afterDatasetsDraw(chart) {
            if (chart.width < 600) return;
            const { ctx } = chart;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.font = 'bold 11px Arial';
            ctx.fillStyle = '#202124';
            const meta = chart.getDatasetMeta(0);
            meta.data.forEach((bar, index) => {
                const pctExacto = rankingMetaArr[index].pct;
                const yPos = chart.scales.y.getPixelForValue(100) - 6;
                ctx.fillText(pctExacto.toFixed(1) + '%', bar.x, yPos);
            });
            ctx.restore();
        }
    };

    if (graficos.rankingMeta) graficos.rankingMeta.destroy();
    graficos.rankingMeta = new Chart(document.getElementById('chartRankingMeta').getContext('2d'), {
        type: 'bar',
        data: {
            labels: rankingMetaArr.map(r => r.nombre),
            datasets: [
                { label: 'Avance de la Meta', data: dataLogrado, backgroundColor: '#4285f4' },
                { label: 'Meta Total (Faltante)', data: dataFaltante, backgroundColor: '#ea4335' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true },
                y: {
                    stacked: true,
                    max: 120,
                    ticks: { callback: value => value <= 100 ? value + '%' : '' }
                }
            },
            plugins: {
                legend: { display: true, position: 'bottom' }
            }
        },
        plugins: [pluginPorcentajes]
    });
}

function cargarVistaVendedor(vendedorData, liElement) {
    restablecerMenu(liElement);
    document.getElementById('tabBusqueda').classList.remove('active');
    document.getElementById('tabGlobal').classList.remove('active');

    if (!db.vendedores.length || !db.ventas.length || !db.productos.length || !db.clientes.length) return;

    let vColNom = getCol(vendedorData, 'NOMBRE');
    let vColApe = getCol(vendedorData, 'APELLIDO');
    let vColTipo = getCol(vendedorData, 'TIPO');
    document.getElementById('tituloDashboard').textContent = `Análisis de Vendedor: ${vendedorData[vColNom]} ${vendedorData[vColApe] || ''}`;
    const tag = document.getElementById('tipoVendedorTag');
    tag.textContent = (vendedorData[vColTipo] || 'No Asignado').toUpperCase();
    tag.style.display = 'inline-block';

    document.getElementById('cardGlobalLinea').style.display = 'none';
    document.getElementById('cardGlobalRankingMeta').style.display = 'none';
    document.getElementById('cardVendedorProdUnid').style.display = 'flex';
    document.getElementById('cardVendedorProdCaja').style.display = 'flex';
    document.getElementById('cardVendedorClientes').style.display = 'flex';
    document.getElementById('tituloGraficoDona').textContent = "Clientes Activos vs Inactivos";

    let vColIdVend = getCol(vendedorData, 'VENDEDOR');
    let idBuscado = parseInt(vendedorData[vColIdVend], 10);
    let ventColIdVend = getCol(db.ventas[0], 'VENDEDOR');
    let ventColPrecio = getCol(db.ventas[0], 'PRECIO') || getCol(db.ventas[0], 'TOTAL');
    let vColMeta = getCol(vendedorData, 'META');

    const susVentas = db.ventas.filter(v => parseInt(v[ventColIdVend], 10) === idBuscado);
    let metaVendedor = parseNum(vendedorData[vColMeta]);
    let suVentaTotal = susVentas.reduce((sum, v) => sum + parseNum(v[ventColPrecio]), 0);
    let porcentajeVendedor = metaVendedor > 0 ? (suVentaTotal / metaVendedor) * 100 : 0;

    let cliColIdVend = getCol(db.clientes[0], 'VENDEDOR');
    let cliColEstado = getCol(db.clientes[0], 'ESTADO');
    let susClientesAsignados = db.clientes.filter(c => parseInt(c[cliColIdVend], 10) === idBuscado);
    let clientesActivos = susClientesAsignados.filter(c => c[cliColEstado] && String(c[cliColEstado]).toUpperCase().includes('ACTIVO')).length;
    clientesInactivosActual = susClientesAsignados.filter(c => c[cliColEstado] && String(c[cliColEstado]).toUpperCase().includes('INACTIVO'));

    document.getElementById('contenedorKPIs').innerHTML = `
        <div class="kpi-box destacado">
            <h4>Venta Acumulada</h4>
            <span>${formatearMoneda(suVentaTotal)}</span>
        </div>
        <div class="kpi-box">
            <h4>Meta Asignada</h4>
            <span>${formatearMoneda(metaVendedor)}</span>
        </div>
        <div class="kpi-box">
            <h4>Clientes Totales</h4>
            <span>${susClientesAsignados.length}</span>
        </div>
        <div class="kpi-box kpi-clickable" onclick="mostrarModalInactivos()" title="Clic para ver inactivos">
            <h4>Inactivos (Ver Lista) 🔍</h4>
            <span>${clientesInactivosActual.length}</span>
        </div>
    `;

    dibujarVelocimetro(porcentajeVendedor);
    dibujarDona(['Cliente Activo', 'Inactivo'], [clientesActivos, clientesInactivosActual.length], ['#4285f4', '#ea4335']);

    let pColId = getCol(db.productos[0], 'VENDEDOR');
    let pColNombre = getCol(db.productos[0], 'NOMBRE');
    let pColCaja = getCol(db.productos[0], 'CAJA');
    let pColUnid = getCol(db.productos[0], 'UNID');
    let countsUnid = {};
    let countsCaja = {};

    db.productos.filter(p => parseInt(p[pColId], 10) === idBuscado).forEach(p => {
        let nombre = p[pColNombre];
        let cantUnid = parseNum(p[pColUnid]);
        let cantCaja = parseNum(p[pColCaja]);

        if (nombre) {
            if (cantUnid > 0) countsUnid[nombre] = (countsUnid[nombre] || 0) + cantUnid;
            if (cantCaja > 0) countsCaja[nombre] = (countsCaja[nombre] || 0) + cantCaja;
        }
    });

    poblarTablaHTML('tablaProdUnid', countsUnid, false);
    poblarTablaHTML('tablaProdCaja', countsCaja, false);

    let countsClientes = {};
    let ventColRazon = getCol(db.ventas[0], 'RAZÓN') || getCol(db.ventas[0], 'RAZON');
    susVentas.forEach(v => {
        let r = v[ventColRazon];
        let t = parseNum(v[ventColPrecio]);
        if (r && t > 0) countsClientes[r] = (countsClientes[r] || 0) + t;
    });

    poblarTablaHTML('tablaClientesVend', countsClientes, true);
}

function ejecutarBusquedaCliente() {
    let input = document.getElementById('inputBusquedaCliente');
    let inputStr = input.value.trim().toUpperCase();
    if (!inputStr) {
        alert("Escribe el nombre de un cliente.");
        return;
    }

    if (!db.ventas.length || !db.productos.length) return;

    let ventColRazon = getCol(db.ventas[0], 'RAZÓN') || getCol(db.ventas[0], 'RAZON');
    let ventColPrecio = getCol(db.ventas[0], 'PRECIO') || getCol(db.ventas[0], 'TOTAL');
    let ventColFecha = getCol(db.ventas[0], 'FECHA');

    let comprasCliente = db.ventas.filter(v => v[ventColRazon] && normalizeText(v[ventColRazon]).includes(inputStr));

    if (comprasCliente.length === 0) {
        alert("No se encontraron registros de compra para este cliente en el mes.");
        return;
    }

    let compraTotal = comprasCliente.reduce((sum, v) => sum + parseNum(v[ventColPrecio]), 0);

    document.getElementById('kpiBusqueda').innerHTML = `
        <div class="kpi-box destacado" style="margin: 0 auto; max-width: 300px;">
            <h4>Total Comprado (Mayo)</h4>
            <span>${formatearMoneda(compraTotal)}</span>
        </div>
    `;

    let daily = {};
    comprasCliente.forEach(v => {
        let fec = v[ventColFecha];
        if (fec) daily[fec] = (daily[fec] || 0) + parseNum(v[ventColPrecio]);
    });
    dibujarLinea(daily, 'chartLineaCliente', 'Compras Diarias del Cliente (S/)', graficos, 'lineaCliente');

    let pColRazon = getCol(db.productos[0], 'RAZÓN') || getCol(db.productos[0], 'RAZON');
    let pColNombre = getCol(db.productos[0], 'NOMBRE');
    let pColCaja = getCol(db.productos[0], 'CAJA');
    let pColUnid = getCol(db.productos[0], 'UNID');

    let prodCliente = db.productos.filter(p => p[pColRazon] && normalizeText(p[pColRazon]).includes(inputStr));
    let countsUnid = {};
    let countsCaja = {};

    prodCliente.forEach(p => {
        let nombre = p[pColNombre];
        let cantUnid = parseNum(p[pColUnid]);
        let cantCaja = parseNum(p[pColCaja]);

        if (nombre) {
            if (cantUnid > 0) countsUnid[nombre] = (countsUnid[nombre] || 0) + cantUnid;
            if (cantCaja > 0) countsCaja[nombre] = (countsCaja[nombre] || 0) + cantCaja;
        }
    });

    poblarTablaHTML('tablaBusquedaCaja', countsCaja, false);
    poblarTablaHTML('tablaBusquedaUnid', countsUnid, false);

    document.getElementById('gridResultadosCliente').style.display = 'grid';
}

function dibujarLinea(dailyData, canvasId, labelText, containerObj, keyObj) {
    let fechasOrdenadas = Object.keys(dailyData).sort((a, b) => {
        const da = parseFlexibleDate(a);
        const dbb = parseFlexibleDate(b);
        if (!da && !dbb) return 0;
        if (!da) return 1;
        if (!dbb) return -1;
        return da - dbb;
    });

    if (containerObj[keyObj]) containerObj[keyObj].destroy();

    containerObj[keyObj] = new Chart(document.getElementById(canvasId).getContext('2d'), {
        type: 'line',
        data: {
            labels: fechasOrdenadas.map(formatDateLabel),
            datasets: [{
                label: labelText,
                data: fechasOrdenadas.map(f => dailyData[f]),
                borderColor: '#4285f4',
                backgroundColor: 'rgba(66, 133, 244, 0.12)',
                fill: true,
                tension: 0.25,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: context => `${labelText}: ${formatearMoneda(context.parsed.y)}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { maxRotation: 0, autoSkip: true }
                },
                y: {
                    ticks: {
                        callback: value => formatearMoneda(value)
                    }
                }
            }
        }
    });
}

function dibujarVelocimetro(porcentaje) {
    const canvas = document.getElementById('chartVelocimetro');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    document.getElementById('textoVelocimetro').textContent = porcentaje.toFixed(2) + '%';
    let restante = Math.max(0, 100 - porcentaje);

    if (graficos.velocimetro) graficos.velocimetro.destroy();

    graficos.velocimetro = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Logrado', 'Faltante'],
            datasets: [{
                data: [Math.min(porcentaje, 100), restante],
                backgroundColor: ['#34a853', '#ea4335'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            rotation: -90,
            circumference: 180,
            cutout: '75%',
            plugins: { legend: { display: false } }
        }
    });
}

function dibujarDona(labels, data, colores) {
    const canvas = document.getElementById('chartDona');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (graficos.dona) graficos.dona.destroy();

    graficos.dona = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colores
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 12,
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}

function mostrarModalInactivos() {
    if (!clientesInactivosActual || clientesInactivosActual.length === 0) {
        alert("Sin inactivos.");
        return;
    }

    const tbody = document.querySelector('#tablaInactivos tbody');
    tbody.innerHTML = '';

    let colDoc = getCol(clientesInactivosActual[0], 'DOCUMENTO') || getCol(clientesInactivosActual[0], 'NUMERO') || getCol(clientesInactivosActual[0], 'RUC') || getCol(clientesInactivosActual[0], 'DNI');
    let colRazon = getCol(clientesInactivosActual[0], 'RAZÓN') || getCol(clientesInactivosActual[0], 'RAZON') || getCol(clientesInactivosActual[0], 'NOMBRE');

    clientesInactivosActual.forEach(cli => {
        let tr = document.createElement('tr');
        tr.innerHTML = `<td>${cli[colDoc] || 'No Registrado'}</td><td>${cli[colRazon] || 'No Registrado'}</td>`;
        tbody.appendChild(tr);
    });

    document.getElementById('modalInactivos').style.display = 'flex';
}

function cerrarModalInactivos() {
    document.getElementById('modalInactivos').style.display = 'none';
}

function poblarTablaHTML(tableId, dataObj, esMoneda) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!tbody) return;

    tbody.innerHTML = '';
    let items = Object.keys(dataObj)
        .map(key => ({ label: key, valor: dataObj[key] }))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 5);

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; color:#9aa0a6;">Sin registros</td></tr>`;
        return;
    }

    items.forEach(item => {
        let row = document.createElement('tr');
        let cellLabel = document.createElement('td');
        cellLabel.textContent = item.label;

        let cellValor = document.createElement('td');
        cellValor.className = 'num-col';
        cellValor.textContent = esMoneda ? formatearMoneda(item.valor) : Number(item.valor).toLocaleString('es-PE');

        row.appendChild(cellLabel);
        row.appendChild(cellValor);
        tbody.appendChild(row);
    });
}

window.addEventListener('resize', () => {
    if (graficos.velocimetro) graficos.velocimetro.resize();
    if (graficos.dona) graficos.dona.resize();
    if (graficos.linea) graficos.linea.resize();
    if (graficos.lineaCliente) graficos.lineaCliente.resize();
    if (graficos.rankingMeta) graficos.rankingMeta.resize();
});

document.addEventListener('DOMContentLoaded', () => {
    const passInput = document.getElementById('passInput');
    if (passInput) passInput.addEventListener('keydown', evaluarTeclado);
});
