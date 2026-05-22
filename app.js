// Módulo principal con encapsulación y mejoras de rendimiento - VERSIÓN SINCRONIZADA LOOKER
(function() {
    // --- URLs de datos ---
    const urls = {
        vendedores: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=0&single=true&output=csv',
        ventas: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=588620531&single=true&output=csv',
        productos: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1241891503&single=true&output=csv',
        clientes: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1344644608&single=true&output=csv'
    };

    let data = { vendedoresRaw: [], ventasRaw: [], productosRaw: [], clientesRaw: [] };
    let globalStartDate = null; let globalEndDate = null;
    let vendedoresMap = new Map(); let clientesMap = new Map();
    let ventasPorVendedor = new Map(); let ventasPorCliente = new Map();
    let productosPorVendedor = new Map(); let productosPorCliente = new Map();
    let clientesPorVendedor = new Map(); let allVentas = []; // <-- NUEVO: acumulador global
    let lastSaleDate = null;

    let cols = { vendedores: {}, ventas: {}, productos: {}, clientes: {} };
    let charts = {}; let mapInstances = {};
    let currentModule = 'general'; let currentVendedor = null;

    function normalizeText(t) {
        return t ? String(t).replace(/\s+/g, ' ').trim().toUpperCase() : '';
    }

    // CLON DE GOOGLE SHEETS: Ignora textos y lee solo números puros
    function parseNumber(val) {
        if (val === null || val === undefined || val === '') return 0;
        let str = String(val).trim();
        
        // Manejo de negativos contables ej: (150.00) -> -150.00
        if (str.startsWith('(') && str.endsWith(')')) {
            str = '-' + str.slice(1, -1).trim();
        }
        
        // Eliminamos S/ y S/. explícitamente
        str = str.replace(/S\/\.?/gi, '').replace(/\$/g, '').trim();
        
        // Limpiamos guiones tipográficos raros y espacios vacíos después del menos
        str = str.replace(/[−–—]/g, '-').replace(/-\s+/g, '-');
        
        // Si por error de limpieza quedó un punto antes del signo negativo (ej: .-412.00)
        str = str.replace(/^\.-/, '-');

        // REGLA DE ORO DE SHEETS: Si todavía quedan letras, Sheets lo considera texto y suma 0.
        if (/[a-zA-Z]/.test(str)) {
            return 0; 
        }

        const lastComma = str.lastIndexOf(',');
        const lastDot = str.lastIndexOf('.');

        // Manejo automático de formatos de miles y decimales
        if (lastComma > lastDot && lastComma !== -1 && lastDot !== -1) {
            str = str.replace(/\./g, '').replace(',', '.'); // EU: 1.234,50
        } else if (lastDot > lastComma && lastDot !== -1 && lastComma !== -1) {
            str = str.replace(/,/g, ''); // US: 1,234.50
        } else if (lastComma !== -1 && lastDot === -1) {
            let parts = str.split(',');
            if (parts[parts.length - 1].length <= 2) {
                str = str.replace(',', '.'); // EU mixto corto
            } else {
                str = str.replace(/,/g, ''); // Miles puros
            }
        }

        // Conversión matemática estricta
        const num = Number(str);
        return isNaN(num) ? 0 : num;
    }

    function formatCurrency(val) {
        return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(val || 0);
    }

    function parseDateStrict(dateStr) {
        if (!dateStr) return null;
        let str = String(dateStr).split(' ')[0].trim();
        let parts = str.split(/[-/]/);
        if (parts.length !== 3) return null;

        let year, month, day;
        if (parts[0].length === 4) {
            year = parts[0]; month = parts[1]; day = parts[2];
        } else if (parts[2].length >= 2) {
            year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            if (Number(parts[0]) > 12) { day = parts[0]; month = parts[1]; } 
            else if (Number(parts[1]) > 12) { month = parts[0]; day = parts[1]; } 
            else { day = parts[0]; month = parts[1]; }
        } else { return null; }

        day = String(day).padStart(2, '0'); month = String(month).padStart(2, '0');
        const fecha = new Date(`${year}-${month}-${day}T12:00:00`);
        if (isNaN(fecha.getTime())) return null;
        return { string: `${day}/${month}`, sortValue: fecha.getTime(), fullDate: fecha };
    }

    function getMonthRange(monthYear) {
        if (!monthYear) return { start: null, end: null };
        const [year, month] = monthYear.split('-').map(Number);
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0); end.setHours(23, 59, 59, 999);
        return { start, end };
    }

    function setMonthInputDefault() {
        const inputMes = document.getElementById('filtroMes');
        if (inputMes) {
            const hoy = new Date(); const year = hoy.getFullYear(); const month = String(hoy.getMonth() + 1).padStart(2, '0');
            inputMes.value = `${year}-${month}`;
        }
    }

    function aplicarFiltroMes(monthYear) {
        const { start, end } = getMonthRange(monthYear); globalStartDate = start; globalEndDate = end; normalizeAllData();
        const activeModuloLi = document.querySelector('#listaModulos li.active'); window.cambiarModulo(currentModule, activeModuloLi);
        const currentIdCliente = document.getElementById('detalleDocCliente').dataset.id;
        if (currentModule === 'busqueda' && currentIdCliente) { mostrarDetalleCliente(currentIdCliente); }
    }

    async function loadCSV(url, retries = 2) {
        for (let i = 0; i <= retries; i++) {
            try {
                const result = await new Promise((resolve, reject) => { Papa.parse(url, { download: true, header: true, skipEmptyLines: true, complete: resolve, error: reject }); });
                return result.data || [];
            } catch (err) { if (i === retries) throw err; await new Promise(r => setTimeout(r, 1000)); }
        }
    }

    // BUSCADOR ESTRICTO: Solo aceptará la columna si se llama EXACTAMENTE igual a los headers de tu Excel
    function findColumnExact(obj, options) {
        if (!obj) return null;
        const keys = Object.keys(obj);
        for (let opt of options) {
            const normOpt = normalizeText(opt);
            const found = keys.find(k => normalizeText(k) === normOpt);
            if (found) return found;
        }
        return null; 
    }

    function initColumns() {
        if (data.vendedoresRaw.length) {
            cols.vendedores = { id: findColumnExact(data.vendedoresRaw[0], ['ID_VENDEDOR']), nombre: findColumnExact(data.vendedoresRaw[0], ['NOMBRE']), apellido: findColumnExact(data.vendedoresRaw[0], ['APELLIDO']), meta: findColumnExact(data.vendedoresRaw[0], ['META']), tipo: findColumnExact(data.vendedoresRaw[0], ['TIPO']) };
        }
        if (data.ventasRaw.length) {
            cols.ventas = {
                idVendedor: findColumnExact(data.ventasRaw[0], ['ID_VENDEDOR']),
                idCliente: findColumnExact(data.ventasRaw[0], ['ID_CLIENTE']),
                total: findColumnExact(data.ventasRaw[0], ['PRECIO TOTAL']),
                fecha: findColumnExact(data.ventasRaw[0], ['FECHA DE VENTA']),
                documento: findColumnExact(data.ventasRaw[0], ['Documento_Numero']),
                razon: findColumnExact(data.ventasRaw[0], ['RAZÓN SOCIAL']),
                tipo: findColumnExact(data.ventasRaw[0], ['TIPO DE VENTA']) 
            };
        }
        if (data.productosRaw.length) {
            cols.productos = { idVendedor: findColumnExact(data.productosRaw[0], ['ID_VENDEDOR']), idCliente: findColumnExact(data.productosRaw[0], ['ID_CLIENTE']), documento: findColumnExact(data.productosRaw[0], ['Documento_Numero']), producto: findColumnExact(data.productosRaw[0], ['NOMBRE DEL PRODUCTO', 'PRODUCTO']), unid: findColumnExact(data.productosRaw[0], ['CANTIDAD UNID']), caja: findColumnExact(data.productosRaw[0], ['CANTIDAD CAJA']), fecha: findColumnExact(data.productosRaw[0], ['FECHA DE VENTA']) };
        }
        if (data.clientesRaw.length) {
            cols.clientes = { id: findColumnExact(data.clientesRaw[0], ['ID_CLIENTE']), documento: findColumnExact(data.clientesRaw[0], ['Documento_Numero']), razon: findColumnExact(data.clientesRaw[0], ['RAZÓN SOCIAL']), ubicacion: findColumnExact(data.clientesRaw[0], ['UBICACIÓN']), idVendedor: findColumnExact(data.clientesRaw[0], ['ID_VENDEDOR']), estado: findColumnExact(data.clientesRaw[0], ['ESTADO DE VENTA']) };
        }
    }

    function normalizeAllData() {
    vendedoresMap.clear(); clientesMap.clear(); ventasPorVendedor.clear(); ventasPorCliente.clear();
    productosPorVendedor.clear(); productosPorCliente.clear(); clientesPorVendedor.clear();

    // Mapa temporal para deduplicar ventas por Documento_Numero
    const ventasPorDocumento = new Map();

    for (const row of data.vendedoresRaw) {
        const id = normalizeText(row[cols.vendedores.id]); if (!id) continue;
        const meta = parseNumber(row[cols.vendedores.meta]); const nombre = row[cols.vendedores.nombre] || ''; const apellido = row[cols.vendedores.apellido] || ''; const tipo = normalizeText(row[cols.vendedores.tipo]);
        vendedoresMap.set(id, { id, nombreCompleto: `${nombre} ${apellido}`.trim(), meta, tipo, raw: row });
    }

    for (const row of data.clientesRaw) {
        const id = normalizeText(row[cols.clientes.id]); if (!id) continue;
        const documento = row[cols.clientes.documento] || ''; const razon = row[cols.clientes.razon] || ''; const ubicacion = row[cols.clientes.ubicacion] || ''; const idVendedor = normalizeText(row[cols.clientes.idVendedor]); const estado = normalizeText(row[cols.clientes.estado]);
        clientesMap.set(id, { id, documento, razon, ubicacion, idVendedor, estado });
        if (idVendedor) { if (!clientesPorVendedor.has(idVendedor)) clientesPorVendedor.set(idVendedor, []); clientesPorVendedor.get(idVendedor).push(id); }
    }

    const docToId = new Map();
    for (const [id, cli] of clientesMap.entries()) { if (cli.documento) docToId.set(normalizeText(cli.documento), id); }

    let maxDate = null;

    // PRIMERA PASADA: procesar cada fila de ventas, PERO deduplicando por número de documento
    for (const row of data.ventasRaw) {
        // Permitir filas sin idVendedor; se asignarán a "SIN_ASIGNAR"
        const idVendedorRaw = row[cols.ventas.idVendedor] ? normalizeText(row[cols.ventas.idVendedor]) : '';

        // Leer total
        let total = parseNumber(row[cols.ventas.total]);

        // Manejo de NC (solo si el tipo indica negación y el número no venga ya en negativo)
        if (cols.ventas.tipo) {
            const tipoVenta = normalizeText(row[cols.ventas.tipo]);
            const esNC = tipoVenta === 'NC' || 
                         (tipoVenta.includes('NOTA') && tipoVenta.includes('CREDITO')) ||
                         tipoVenta.includes('ANULAD') || tipoVenta.includes('DEVOL');
            if (esNC && total > 0) {
                total = -total;
            }
        }

        if (total === 0) continue; // omitir operaciones sin importe

        const fechaRaw = row[cols.ventas.fecha]; 
        const fechaObj = parseDateStrict(fechaRaw);

        // Si hay filtro de mes, solo se conservan las fechas válidas y en el rango
        if (globalStartDate || globalEndDate) {
            if (!fechaObj) continue; 
            if (globalStartDate && fechaObj.fullDate < globalStartDate) continue;
            if (globalEndDate && fechaObj.fullDate > globalEndDate) continue;
        }

        // Datos del cliente: usar documento para mapear ID si viene vacío
        let idCliente = normalizeText(row[cols.ventas.idCliente]);
        const documentoVenta = normalizeText(row[cols.ventas.documento]);
        const razon = row[cols.ventas.razon] || '';
        if (!idCliente && documentoVenta && docToId.has(documentoVenta)) {
            idCliente = docToId.get(documentoVenta);
        }

        // CLAVE DE DEDUPLICACIÓN: número de documento (si existe)
        const docKey = documentoVenta || `ROW_${Math.random().toString(36).substr(2, 9)}`; // si no hay documento, se trata como única
        if (!ventasPorDocumento.has(docKey)) {
            // Guardamos la primera aparición del documento
            ventasPorDocumento.set(docKey, {
                idVendedor: idVendedorRaw || 'SIN_ASIGNAR',
                idCliente: idCliente,
                total: total,
                fechaObj: fechaObj,
                razon: razon
            });
        } else {
            // Si ya existe, sumamos el total? NO: si la misma factura aparece en varias líneas, asumimos que el total es el mismo.
            // Pero para evitar sobre-conteo, simplemente NO sumamos de nuevo. Opcionalmente podemos advertir.
            // También actualizamos la fecha si es posterior (por si acaso)
            const existente = ventasPorDocumento.get(docKey);
            if (fechaObj && (!existente.fechaObj || fechaObj.fullDate > existente.fechaObj.fullDate)) {
                existente.fechaObj = fechaObj;
            }
            // No modificamos el total; confiamos en que es el mismo.
        }
    }

    // SEGUNDA PASADA: con los documentos deduplicados, llenar los mapas finales
    for (const [doc, venta] of ventasPorDocumento.entries()) {
        const { idVendedor, idCliente, total, fechaObj, razon } = venta;
        const ventaNorm = { idVendedor, idCliente, total, fechaObj, razon };

        if (idVendedor) {
            if (!ventasPorVendedor.has(idVendedor)) ventasPorVendedor.set(idVendedor, []);
            ventasPorVendedor.get(idVendedor).push(ventaNorm);
        }
        if (idCliente) {
            if (!ventasPorCliente.has(idCliente)) ventasPorCliente.set(idCliente, []);
            ventasPorCliente.get(idCliente).push(ventaNorm);
        }
        if (fechaObj && fechaObj.fullDate) {
            if (!maxDate || fechaObj.fullDate > maxDate) maxDate = fechaObj.fullDate;
        }
    }

    lastSaleDate = maxDate;
    if (lastSaleDate) {
        const formatted = lastSaleDate.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const sidebarElem = document.getElementById('fechaUltimaVentaSidebar'); const titleElem = document.getElementById('fechaUltimaVentaTitulo');
        if (sidebarElem) sidebarElem.textContent = `Última venta: ${formatted}`; if (titleElem) titleElem.textContent = `Última venta: ${formatted}`;
    }

    // Productos (sin deduplicar, pues aquí sí puede haber varias líneas por producto)
    for (const row of data.productosRaw) {
        if (!row[cols.productos.idVendedor] || !row[cols.productos.idCliente]) continue;

        const fechaRawProd = cols.productos.fecha ? row[cols.productos.fecha] : null; let fechaObj = parseDateStrict(fechaRawProd);

        if (globalStartDate || globalEndDate) {
            if (!fechaObj) continue;
            if (globalStartDate && fechaObj.fullDate < globalStartDate) continue;
            if (globalEndDate && fechaObj.fullDate > globalEndDate) continue;
        }

        const idVendedor = normalizeText(row[cols.productos.idVendedor]); let idCliente = normalizeText(row[cols.productos.idCliente]);
        const documento = normalizeText(row[cols.productos.documento]); const producto = row[cols.productos.producto] || '';
        const unid = parseNumber(row[cols.productos.unid]); const caja = parseNumber(row[cols.productos.caja]);

        if (!idCliente && documento && docToId.has(documento)) { idCliente = docToId.get(documento); }

        const prodNorm = { producto, unid, caja, fechaObj };

        if (idVendedor) { if (!productosPorVendedor.has(idVendedor)) productosPorVendedor.set(idVendedor, []); productosPorVendedor.get(idVendedor).push(prodNorm); }
        if (idCliente) { if (!productosPorCliente.has(idCliente)) productosPorCliente.set(idCliente, []); productosPorCliente.get(idCliente).push(prodNorm); }
    }
};
        
    function getInactiveClients(vendedorId = 'GLOBAL') {
        const inactivos = [];
        for (const [id, cliente] of clientesMap.entries()) {
            if (vendedorId !== 'GLOBAL' && cliente.idVendedor !== vendedorId) continue;
            if (cliente.estado && cliente.estado.includes('INACTIVO')) { inactivos.push(cliente); }
        }
        return inactivos;
    }

    function updateChart(chartId, config) {
        const canvas = document.getElementById(chartId); if (!canvas) return;
        if (charts[chartId]) { charts[chartId].destroy(); delete charts[chartId]; }
        charts[chartId] = new Chart(canvas.getContext('2d'), config);
    }

    function destroyMap(containerId) { if (mapInstances[containerId]) { mapInstances[containerId].remove(); delete mapInstances[containerId]; } }

    function renderMap(containerId, clientIds) {
        destroyMap(containerId); const container = document.getElementById(containerId); if (!container) return;
        const map = L.map(containerId).setView([-9.1899, -75.0151], 5);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: 'Dialex System' }).addTo(map);
        mapInstances[containerId] = map;

        const featureGroup = L.featureGroup().addTo(map);
        const cityCoords = {
            'AREQUIPA': [-16.3988, -71.5369], 'CUSCO': [-13.5319, -71.9675], 'TRUJILLO': [-8.1084, -79.0288], 'CHICLAYO': [-6.7714, -79.8409], 'PIURA': [-5.1945, -80.6328], 'IQUITOS': [-3.7491, -73.2538], 'HUANCAYO': [-12.0651, -75.2049], 'TACNA': [-18.0147, -70.2488], 'CAJAMARCA': [-7.1565, -78.5173], 'PUNO': [-15.8402, -70.0219], 'LIMA': [-12.0464, -77.0428]
        };

        const ventasPorClienteMap = new Map();
        for (const [cliId, ventas] of ventasPorCliente.entries()) {
            const total = ventas.reduce((sum, v) => sum + v.total, 0);
            if (total > 0) ventasPorClienteMap.set(cliId, total);
        }

        for (const cliId of clientIds) {
            const cliente = clientesMap.get(cliId); if (!cliente) continue;
            const ubic = normalizeText(cliente.ubicacion); let coords = cityCoords['LIMA'];
            for (const [city, coord] of Object.entries(cityCoords)) { if (ubic.includes(city)) { coords = coord; break; } }
            const totalVentas = ventasPorClienteMap.get(cliId) || 0;
            const color = totalVentas > 0 ? '#34a853' : '#ea4335';
            const marker = L.marker([coords[0] + (Math.sin(cliId.charCodeAt(0)) * 0.03), coords[1] + (Math.cos(cliId.charCodeAt(cliId.length-1)) * 0.03)], { icon: L.divIcon({ html: `<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>`, className: 'custom-pin' }) }).bindPopup(`<b>${cliente.razon || 'Cliente'}</b><br>Facturación: S/ ${totalVentas.toLocaleString()}<br><small>${cliente.ubicacion}</small>`);
            marker.addTo(featureGroup);
        }
        if (featureGroup.getLayers().length > 0) { map.fitBounds(featureGroup.getBounds(), { padding: [20,20], maxZoom: 10 }); }
    }

    function loadGeneralModule() {
        if (!vendedoresMap.size) return;
        let metaTotal = 0; for (const v of vendedoresMap.values()) metaTotal += v.meta;
        // 👉 USAMOS EL ACUMULADOR GLOBAL allVentas
        let ventasTotal = allVentas.reduce((s, v) => s + v.total, 0);
        const inactivosGlobal = getInactiveClients('GLOBAL'); const clientesTotales = clientesMap.size;
        let clientesVip = 0;
        for (const [id, ventas] of ventasPorCliente.entries()) { const total = ventas.reduce((s, v) => s + v.total, 0); if (total >= 1000) clientesVip++; }

        document.getElementById('kpiGeneral').innerHTML = `
            <div class="kpi-box destacado"><h4>Venta Global Lograda</h4><span>${formatCurrency(ventasTotal)}</span></div>
            <div class="kpi-box"><h4>Meta Global Programada</h4><span style="color:#202124">${formatCurrency(metaTotal)}</span></div>
            <div class="kpi-box" style="border-left: 4px solid #fbbc05;"><h4>Clientes Totales (BD)</h4><span style="color:#fbbc05">${clientesTotales}</span></div>
            <div class="kpi-box" style="border-left: 4px solid #9aa0a6;"><h4>Clientes VIP (> S/ 1000)</h4><span style="color:#202124">${clientesVip}</span></div>
            <div class="kpi-box kpi-clickable" style="border-left: 4px solid #ea4335;" onclick="window.mostrarModalInactivos('GLOBAL', 'General')">
                <h4>Clientes Inactivos</h4><span style="color:#d93025">${inactivosGlobal.length}</span>
            </div>
        `;

        const pct = metaTotal > 0 ? (ventasTotal / metaTotal) * 100 : 0;
        document.getElementById('textoVelocimetroGeneral').textContent = pct.toFixed(1) + '%';
        updateChart('chartVelocimetroGeneral', { type: 'doughnut', data: { datasets: [{ data: [ventasTotal, Math.max(0, metaTotal - ventasTotal)], backgroundColor: ['#34a853', '#ea4335'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, rotation: -90, circumference: 180, cutout: '75%', plugins: { legend: { display: false } } } });

        const canales = new Map();
        for (const [idV, ventas] of ventasPorVendedor.entries()) {
            const vendedor = vendedoresMap.get(idV); const tipo = vendedor ? vendedor.tipo : 'OTROS'; const total = ventas.reduce((s, v) => s + v.total, 0);
            canales.set(tipo, (canales.get(tipo) || 0) + total);
        }
        updateChart('chartDonaGeneral', { type: 'pie', data: { labels: Array.from(canales.keys()), datasets: [{ data: Array.from(canales.values()), backgroundColor: ['#1a73e8', '#fbbc05', '#34a853', '#ea4335', '#9aa0a6'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });

        const daily = new Map();
        for (const ventas of ventasPorVendedor.values()) {
            for (const v of ventas) {
                if (v.fechaObj) {
                    const key = v.fechaObj.string; if (!daily.has(key)) daily.set(key, { total: 0, sortValue: v.fechaObj.sortValue }); daily.get(key).total += v.total;
                }
            }
        }
        const sortedDays = Array.from(daily.entries()).sort((a,b) => a[1].sortValue - b[1].sortValue);
        updateChart('chartLineaGeneral', { type: 'line', data: { labels: sortedDays.map(d => d[0]), datasets: [{ label: 'Ingresos S/', data: sortedDays.map(d => d[1].total), borderColor: '#1a73e8', backgroundColor: 'rgba(26,115,232,0.08)', fill: true, tension: 0.1 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });

        const ranking = [];
        for (const v of vendedoresMap.values()) {
            if (v.meta <= 0) continue; const ventasV = ventasPorVendedor.get(v.id) || []; const total = ventasV.reduce((s, vv) => s + vv.total, 0); const pctCumpl = (total / v.meta) * 100;
            ranking.push({ nombre: v.nombreCompleto, pct: Math.min(pctCumpl, 100), faltante: Math.max(0, 100 - pctCumpl) });
        }
        ranking.sort((a,b) => b.pct - a.pct);
        updateChart('chartRankingMeta', { type: 'bar', data: { labels: ranking.map(r => r.nombre), datasets: [{ label: '% Logrado', data: ranking.map(r => r.pct), backgroundColor: '#1a73e8' }, { label: '% Faltante', data: ranking.map(r => r.faltante), backgroundColor: '#dadce0' }] }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, max: 100 } }, plugins: { legend: { display: true, position: 'bottom' } } } });

        renderMap('ContenedorMapaGeneral', Array.from(clientesMap.keys()));
    }

    function loadProductividadModule(vendedor) {
        if (!vendedor) return; currentVendedor = vendedor;
        const idV = vendedor.id; const ventasV = ventasPorVendedor.get(idV) || []; const clientesIds = clientesPorVendedor.get(idV) || [];
        const totalVentas = ventasV.reduce((s, v) => s + v.total, 0); const inactivos = getInactiveClients(idV); const meta = vendedor.meta;

        document.getElementById('kpiVendedor').innerHTML = `
            <div class="kpi-box destacado"><h4>Cuota Lograda</h4><span>${formatCurrency(totalVentas)}</span></div>
            <div class="kpi-box"><h4>Meta Asignada</h4><span style="color:#333">${formatCurrency(meta)}</span></div>
            <div class="kpi-box" style="border-left: 4px solid #1a73e8;"><h4>Clientes Totales (Cartera)</h4><span style="color:#1a73e8">${clientesIds.length}</span></div>
            <div class="kpi-box kpi-clickable" style="border-left: 4px solid #ea4335;" onclick="window.mostrarModalInactivos('${idV}', '${vendedor.nombreCompleto}')"><h4>Clientes Inactivos</h4><span style="color:#d93025">${inactivos.length}</span></div>
        `;

        const pct = meta > 0 ? (totalVentas / meta) * 100 : 0;
        document.getElementById('textoVelocimetroVendedor').textContent = pct.toFixed(1) + '%';
        updateChart('chartVelocimetroVendedor', { type: 'doughnut', data: { datasets: [{ data: [totalVentas, Math.max(0, meta - totalVentas)], backgroundColor: ['#34a853', '#ddd'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, rotation: -90, circumference: 180, cutout: '75%', plugins: { legend: { display: false } } } });

        const activosCount = clientesIds.length - inactivos.length;
        updateChart('chartDonaVendedor', { type: 'pie', data: { labels: ['Activos Registrados', 'Inactivos Registrados'], datasets: [{ data: [activosCount, inactivos.length], backgroundColor: ['#34a853', '#ea4335'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });

        const clienteTotal = new Map();
        for (const venta of ventasV) {
            if (!venta.idCliente) continue;
            const razon = clientesMap.get(venta.idCliente)?.razon || venta.razon || `ID: ${venta.idCliente}`;
            const current = clienteTotal.get(venta.idCliente) || { id: venta.idCliente, razon, total: 0 };
            current.total += venta.total; clienteTotal.set(venta.idCliente, current);
        }
        const top7 = Array.from(clienteTotal.entries()).map(([id, v]) => ({ id, ...v })).sort((a,b) => b.total - a.total).slice(0,7);
        const tbodyTop = document.querySelector('#tablaTopClientesVendedor tbody'); tbodyTop.innerHTML = '';
        if (top7.length === 0) { tbodyTop.innerHTML = '<tr><td colspan="2" style="text-align:center;">Sin movimientos</td></tr>'; } 
        else {
            for (const c of top7) {
                const tr = document.createElement('tr'); tr.style.cursor = 'pointer'; tr.innerHTML = `<td>${c.razon}</td><td class="num-col">${formatCurrency(c.total)}</td>`;
                tr.onclick = () => window.navegarAClienteBusqueda(c.id, c.razon); tbodyTop.appendChild(tr);
            }
        }

        const prodUnid = new Map(); const prodCaja = new Map(); const productos = productosPorVendedor.get(idV) || [];
        for (const p of productos) {
            if (p.producto) {
                if (p.unid > 0) prodUnid.set(p.producto, (prodUnid.get(p.producto) || 0) + p.unid);
                if (p.caja > 0) prodCaja.set(p.producto, (prodCaja.get(p.producto) || 0) + p.caja);
            }
        }
        const renderProdTable = (tableId, mapProd) => {
            const tbody = document.querySelector(`#${tableId} tbody`); tbody.innerHTML = ''; const sorted = Array.from(mapProd.entries()).sort((a,b) => b[1] - a[1]).slice(0,5);
            if (sorted.length === 0) { tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">Vacío</td></tr>'; return; }
            for (const [name, qty] of sorted) { const tr = document.createElement('tr'); tr.innerHTML = `<td>${name}</td><td class="num-col">${qty.toLocaleString()}</td>`; tbody.appendChild(tr); }
        };
        renderProdTable('tablaProdUnid', prodUnid); renderProdTable('tablaProdCaja', prodCaja); renderMap('ContenedorMapaVendedor', clientesIds);
    }

    function loadSituacionModule() {
        let totalVentas = allVentas.reduce((s, v) => s + v.total, 0); // Usamos acumulador global también en situación
        let numVentas = allVentas.length;
        const ticketProm = numVentas > 0 ? totalVentas / numVentas : 0; document.getElementById('kpiTicketPromedio').textContent = formatCurrency(ticketProm);
        const numClientesConVenta = ventasPorCliente.size; const frecuencia = numClientesConVenta > 0 ? (numVentas / numClientesConVenta).toFixed(1) : '0.0'; document.getElementById('kpiFrecuencia').textContent = frecuencia;
        const clientesRiesgo = getInactiveClients('GLOBAL').length; document.getElementById('kpiRiesgo').textContent = clientesRiesgo;

        const clientesTotal = [];
        for (const [id, ventas] of ventasPorCliente.entries()) {
            const total = ventas.reduce((s, v) => s + v.total, 0); const razon = clientesMap.get(id)?.razon || `ID: ${id}`; clientesTotal.push({ id, razon, total });
        }
        clientesTotal.sort((a,b) => b.total - a.total); let acum = 0;
        const tbodyABC = document.querySelector('#tablaABC tbody'); tbodyABC.innerHTML = '';
        for (const c of clientesTotal) {
            acum += c.total; const pct = totalVentas > 0 ? (acum / totalVentas) * 100 : 0; let segmento = 'C (Crítico)'; let badgeClass = 'badge-c';
            if (pct <= 80) { segmento = 'A (Top)'; badgeClass = 'badge-a'; } else if (pct <= 95) { segmento = 'B (Medio)'; badgeClass = 'badge-b'; }
            const tr = document.createElement('tr'); tr.style.cursor = 'pointer'; tr.innerHTML = `<td>${c.razon}</td><td><span class="badge ${badgeClass}">${segmento}</span></td><td class="num-col">${formatCurrency(c.total)}</td>`;
            tr.onclick = () => window.navegarAClienteBusqueda(c.id, c.razon); tbodyABC.appendChild(tr);
        }
        const activeClientIds = Array.from(ventasPorCliente.keys()); renderMap('ContenedorMapaSituacion', activeClientIds);
    }

    window.exportarTablaABC = async function() {
        const tablaOriginal = document.querySelector('#tablaABC');
        if (!tablaOriginal) { alert('No se encontró la tabla para exportar.'); return; }
        if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') { alert('Las librerías para generar PDF no se cargaron correctamente. Recarga la página.'); return; }
        const btn = document.querySelector('.btn-export-pdf'); const textoOriginal = btn.innerHTML; btn.innerHTML = '⏳ Generando PDF...'; btn.disabled = true;

        try {
            const cloneTabla = tablaOriginal.cloneNode(true); const filas = cloneTabla.querySelectorAll('tbody tr');
            filas.forEach(fila => { fila.removeAttribute('onclick'); fila.style.cursor = 'default'; });
            const container = document.createElement('div'); container.style.position = 'fixed'; container.style.left = '-10000px'; container.style.top = '0'; container.style.width = '1200px'; container.style.backgroundColor = 'white'; container.style.padding = '20px'; container.style.fontFamily = "'Segoe UI', Arial, sans-serif"; container.style.zIndex = '-1';
            const titulo = document.createElement('h2'); titulo.textContent = 'Segmentación ABC Dinámica de Clientes (Pareto 80/20)'; titulo.style.color = '#1a73e8'; titulo.style.marginBottom = '20px'; titulo.style.fontSize = '18px'; container.appendChild(titulo);
            cloneTabla.style.width = '100%'; cloneTabla.style.borderCollapse = 'collapse'; cloneTabla.style.fontSize = '12px';
            const celdasEncabezado = cloneTabla.querySelectorAll('th');
            celdasEncabezado.forEach(th => { th.style.backgroundColor = '#f8f9fa'; th.style.padding = '10px'; th.style.borderBottom = '2px solid #dadce0'; th.style.textAlign = 'left'; th.style.fontWeight = 'bold'; });
            const celdasCuerpo = cloneTabla.querySelectorAll('td');
            celdasCuerpo.forEach(td => { td.style.padding = '8px 10px'; td.style.borderBottom = '1px solid #eee'; });
            const badges = cloneTabla.querySelectorAll('.badge');
            badges.forEach(b => {
                if (b.classList.contains('badge-a')) b.style.backgroundColor = '#e6f4ea';
                if (b.classList.contains('badge-b')) b.style.backgroundColor = '#fef7e0';
                if (b.classList.contains('badge-c')) b.style.backgroundColor = '#fce8e6';
                b.style.padding = '4px 10px'; b.style.borderRadius = '12px'; b.style.fontSize = '0.7rem'; b.style.fontWeight = 'bold'; b.style.display = 'inline-block';
            });
            container.appendChild(cloneTabla); document.body.appendChild(container);
            await new Promise(resolve => setTimeout(resolve, 100));
            const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: false, windowWidth: container.scrollWidth, windowHeight: container.scrollHeight });
            const imgData = canvas.toDataURL('image/png'); const { jsPDF } = window.jspdf; const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const imgWidth = 280; const imgHeight = (canvas.height * imgWidth) / canvas.width; pdf.addImage(imgData, 'PNG', 8, 8, imgWidth, imgHeight); pdf.save('segmentacion_abc_clientes.pdf');
        } catch (error) { console.error('Error:', error); alert('Ocurrió un error al generar el PDF.'); } 
        finally { const tempContainer = document.body.querySelector('div[style*="left: -10000px"]'); if (tempContainer) tempContainer.remove(); btn.innerHTML = textoOriginal; btn.disabled = false; }
    };

    let fuseInstance = null; let allSearchResults = []; let verTodosPage = 0; const VER_TODOS_PER_PAGE = 25; let searchDebounceTimer = null;

    function buildFuseIndex() {
        const items = Array.from(clientesMap.entries()).map(([id, cli]) => ({ id, doc: cli.documento || '', razon: cli.razon || '' }));
        fuseInstance = new Fuse(items, { keys: ['razon', 'doc'], threshold: 0.35, includeScore: true, ignoreLocation: true, useExtendedSearch: false, getFn: (obj, path) => { const key = Array.isArray(path) ? path[path.length - 1] : path; const val = obj[key]; return val ? val.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() : ''; } });
    }

    window.buscarAutocompleteCliente = function(texto) {
        const ul = document.getElementById('listaSugerenciasClientes'); const input = document.getElementById('inputBusquedaCliente'); const btnLimpiar = document.getElementById('btnLimpiarBusqueda'); const loading = document.getElementById('loadingSugerencias'); const contador = document.getElementById('contadorResultados');
        btnLimpiar.style.display = texto.length > 0 ? 'flex' : 'none';
        if (texto.length < 2) { ul.style.display = 'none'; if (loading) loading.style.display = 'none'; if (contador) contador.style.display = 'none'; return; }
        ul.style.display = 'none'; if (loading) loading.style.display = 'block';

        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            if (loading) loading.style.display = 'none'; const query = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); let results = [];
            if (fuseInstance) { const raw = fuseInstance.search(query); results = raw.map(r => r.item); allSearchResults = results; } 
            else {
                for (const [id, cli] of clientesMap.entries()) {
                    const searchStr = (cli.documento + ' ' + cli.razon).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
                    if (searchStr.includes(query)) results.push({ id, doc: cli.documento, razon: cli.razon });
                }
                allSearchResults = results;
            }
            const total = results.length; const shown = results.slice(0, 15); let html = '';
            for (const r of shown) {
                const total = (ventasPorCliente.get(r.id) || []).reduce((s, v) => s + v.total, 0);
                html += `<li onclick="window.seleccionarSugerencia('${r.id}', '${(r.doc||'').replace(/'/g,"\\'")}', '${(r.razon||'').replace(/'/g,"\\'")}')"><strong>${r.razon || 'Sin Razón Social'}</strong><small>Doc: ${r.doc || '---'} &nbsp;|&nbsp; Comprado: ${formatCurrency(total)}</small></li>`;
            }
            if (total > 15) { html += `<li class="ver-todos-item" onclick="window.abrirModalVerTodos('${texto.replace(/'/g,"\\'")}')"><strong style="color:#1a73e8;">Ver todos los ${total} resultados →</strong></li>`; }
            if (!html) html = '<li style="color:#999; text-align:center; padding:15px;">No se encontraron resultados</li>';
            ul.innerHTML = html; ul.style.display = 'block';
            if (contador) { contador.textContent = total > 0 ? `${total} resultado${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}` : ''; contador.style.display = total > 0 ? 'block' : 'none'; }
        }, 200);
    };

    window.limpiarBusqueda = function() {
        const input = document.getElementById('inputBusquedaCliente'); input.value = ''; input.focus();
        document.getElementById('listaSugerenciasClientes').style.display = 'none'; document.getElementById('panelDetalleCliente').style.display = 'none'; document.getElementById('btnLimpiarBusqueda').style.display = 'none';
        const contador = document.getElementById('contadorResultados'); if (contador) contador.style.display = 'none'; allSearchResults = [];
    };

    window.abrirModalVerTodos = function(texto) { document.getElementById('listaSugerenciasClientes').style.display = 'none'; verTodosPage = 0; renderVerTodosPage(texto); document.getElementById('modalVerTodos').style.display = 'flex'; };

    function renderVerTodosPage(texto) {
        const results = allSearchResults; const total = results.length; document.getElementById('subtituloModalVerTodos').textContent = `${total} clientes coinciden con "${texto}"`;
        const start = verTodosPage * VER_TODOS_PER_PAGE; const page = results.slice(start, start + VER_TODOS_PER_PAGE);
        const tbody = document.querySelector('#tablaVerTodos tbody'); tbody.innerHTML = '';
        for (const r of page) {
            const totalComprado = (ventasPorCliente.get(r.id) || []).reduce((s, v) => s + v.total, 0); const tr = document.createElement('tr'); tr.style.cursor = 'pointer';
            tr.innerHTML = `<td>${r.razon || '---'}</td><td>${r.doc || '---'}</td><td class="num-col">${formatCurrency(totalComprado)}</td>`;
            tr.onclick = () => { window.cerrarModalVerTodos(); window.seleccionarSugerencia(r.id, r.doc, r.razon); }; tbody.appendChild(tr);
        }
        const totalPages = Math.ceil(total / VER_TODOS_PER_PAGE); const pag = document.getElementById('paginacionVerTodos'); pag.innerHTML = '';
        for (let i = 0; i < totalPages; i++) {
            const btn = document.createElement('button'); btn.textContent = i + 1; btn.style.cssText = `padding:6px 12px; border-radius:6px; border:1px solid ${i === verTodosPage ? '#1a73e8' : '#dadce0'}; background:${i === verTodosPage ? '#1a73e8' : 'white'}; color:${i === verTodosPage ? 'white' : '#333'}; cursor:pointer; font-weight:600;`;
            btn.onclick = () => { verTodosPage = i; renderVerTodosPage(texto); }; pag.appendChild(btn);
        }
    }

    window.cerrarModalVerTodos = function() { document.getElementById('modalVerTodos').style.display = 'none'; };
    window.seleccionarSugerencia = function(idC, doc, razon) { document.getElementById('listaSugerenciasClientes').style.display = 'none'; document.getElementById('inputBusquedaCliente').value = razon || doc; mostrarDetalleCliente(idC); };
    window.limpiarFiltroProductos = function() { const idC = document.getElementById('detalleDocCliente').dataset.id; if(idC) window.filtrarProductosPorFecha(idC, null); };

    window.filtrarProductosPorFecha = function(idC, dateStringFilter) {
        const productos = productosPorCliente.get(idC) || []; const prodMap = new Map();
        for (const p of productos) {
            if (!p.producto) continue;
            if (dateStringFilter && (!p.fechaObj || p.fechaObj.string !== dateStringFilter)) continue;
            const actualUnid = p.unid || 0; const actualCaja = p.caja || 0;
            if (!prodMap.has(p.producto)) prodMap.set(p.producto, { unid: 0, caja: 0 }); prodMap.get(p.producto).unid += actualUnid; prodMap.get(p.producto).caja += actualCaja;
        }
        const tbodyProd = document.querySelector('#tablaClienteProductos tbody'); tbodyProd.innerHTML = '';
        if (prodMap.size === 0) { tbodyProd.innerHTML = `<tr><td colspan="2" style="text-align:center;">Sin transacciones ${dateStringFilter ? 'en esta fecha' : ''}</td></tr>`; } 
        else {
            for (const [prod, qtyObj] of prodMap.entries()) {
                const tr = document.createElement('tr'); const qtyText = qtyObj.caja > 0 ? `${qtyObj.caja} cjs` : `${qtyObj.unid} und`; tr.innerHTML = `<td>${prod}</td><td class="num-col">${qtyText}</td>`; tbodyProd.appendChild(tr);
            }
        }
        const lbl = document.getElementById('lblFiltroProdFecha'); const btnClear = document.getElementById('btnLimpiarFiltroProd');
        if (dateStringFilter) { lbl.textContent = `(Solo ${dateStringFilter})`; btnClear.style.display = 'inline-block'; } else { lbl.textContent = ''; btnClear.style.display = 'none'; }
    };

    function mostrarDetalleCliente(idC) {
        const cliente = clientesMap.get(idC); if (!cliente) return;
        const panel = document.getElementById('panelDetalleCliente'); panel.style.display = 'flex'; panel.style.flexDirection = 'column';
        document.getElementById('detalleNombreCliente').textContent = cliente.razon || 'Cliente Innominado';
        const docElem = document.getElementById('detalleDocCliente'); docElem.textContent = cliente.documento || idC; docElem.dataset.id = idC;

        const ventas = ventasPorCliente.get(idC) || []; const totalFact = ventas.reduce((s, v) => s + v.total, 0); document.getElementById('detalleTotalVenta').textContent = formatCurrency(totalFact);
        const estadoBadge = totalFact > 0 ? '<span class="badge badge-activo">ACTIVO COMPRADOR</span>' : '<span class="badge badge-inactivo">INACTIVO SIN COMPRAS</span>'; document.getElementById('detalleEstadoCli').innerHTML = estadoBadge;

        const hist = new Map();
        for (const v of ventas) {
            if (v.fechaObj) { const key = v.fechaObj.string; if (!hist.has(key)) hist.set(key, { total: 0, sortValue: v.fechaObj.sortValue }); hist.get(key).total += v.total; }
        }
        const sortedHist = Array.from(hist.entries()).sort((a,b) => a[1].sortValue - b[1].sortValue);
        updateChart('chartClienteHistorial', { type: 'bar', data: { labels: sortedHist.map(h => h[0]), datasets: [{ label: 'Compras S/', data: sortedHist.map(h => h[1].total), backgroundColor: '#34a853', borderRadius: 4, hoverBackgroundColor: '#1a73e8' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, onHover: (event, chartElement) => { event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default'; }, onClick: (event, activeElements) => { if (activeElements.length > 0) { const index = activeElements[0].index; const clickedDateString = sortedHist[index][0]; window.filtrarProductosPorFecha(idC, clickedDateString); } } } });
        window.filtrarProductosPorFecha(idC, null);
    }

    window.mostrarModalInactivos = function(vendedorId, nombreVendedor) {
        const inactivos = getInactiveClients(vendedorId); document.getElementById('tituloModalInactivos').textContent = `Clientes Inactivos de: ${nombreVendedor}`;
        const tbody = document.querySelector('#tablaInactivos tbody'); tbody.innerHTML = '';
        if (inactivos.length === 0) { tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No hay clientes inactivos</td></tr>'; } 
        else {
            for (const cli of inactivos) { const tr = document.createElement('tr'); tr.style.cursor = 'pointer'; tr.innerHTML = `<td>${cli.documento || '---'}</td><td>${cli.razon || '---'}</td><td><span class="badge badge-inactivo">${cli.estado || 'INACTIVO'}</span></td>`; tr.onclick = () => { window.cerrarModalInactivos(); window.navegarAClienteBusqueda(cli.id, cli.razon); }; tbody.appendChild(tr); }
        }
        document.getElementById('modalInactivos').style.display = 'flex';
    };

    window.cerrarModalInactivos = function() { document.getElementById('modalInactivos').style.display = 'none'; };
    window.navegarAClienteBusqueda = function(idCliente, razon) { const li = document.querySelector('#listaModulos li:nth-child(4)'); window.cambiarModulo('busqueda', li); const input = document.getElementById('inputBusquedaCliente'); if (input) { input.value = razon || idCliente; document.getElementById('btnLimpiarBusqueda').style.display = 'flex'; } mostrarDetalleCliente(idCliente); };

    window.actualizarDatos = async function() {
        const btn = document.getElementById('btnActualizar'); const icono = document.getElementById('iconoActualizar'); if (!btn || btn.disabled) return;
        btn.disabled = true; btn.style.opacity = '0.6'; icono.style.display = 'inline-block'; icono.style.animation = 'spin 0.8s linear infinite';
        try {
            const [vendedores, ventas, productos, clientes] = await Promise.all([loadCSV(urls.vendedores), loadCSV(urls.ventas), loadCSV(urls.productos), loadCSV(urls.clientes)]);
            data.vendedoresRaw = vendedores; data.ventasRaw = ventas; data.productosRaw = productos; data.clientesRaw = clientes;
            initColumns(); normalizeAllData(); buildFuseIndex(); generateVendedoresMenu();
            const activeModuloLi = document.querySelector('#listaModulos li.active'); window.cambiarModulo(currentModule, activeModuloLi);
            icono.textContent = '✓'; icono.style.animation = 'none'; setTimeout(() => { icono.textContent = '↻'; }, 2000);
        } catch(e) { icono.textContent = '✗'; icono.style.animation = 'none'; setTimeout(() => { icono.textContent = '↻'; }, 2000); } finally { btn.disabled = false; btn.style.opacity = '1'; }
    };

    window.cerrarSesion = function() {
        document.getElementById('appContainer').style.visibility = 'hidden'; const loginScreen = document.getElementById('loginScreen'); loginScreen.style.opacity = '0'; loginScreen.style.display = 'flex'; document.getElementById('passInput').value = ''; document.getElementById('loginError').style.display = 'none'; requestAnimationFrame(() => { loginScreen.style.opacity = '1'; });
    };

    window.cambiarModulo = function(modulo, elemento) {
        if (currentModule === modulo && document.getElementById('appContainer').style.visibility === 'visible' && !elemento) return; currentModule = modulo;
        document.querySelectorAll('.modulos-list li').forEach(el => el.classList.remove('active')); if (elemento) elemento.classList.add('active');
        document.querySelectorAll('.modulo-view').forEach(v => v.style.display = 'none'); document.getElementById('menuVendedoresContainer').style.display = 'none';

        const vistas = { general: document.getElementById('vistaGeneral'), productividad: document.getElementById('vistaProductividad'), situacion: document.getElementById('vistaSituacion'), busqueda: document.getElementById('vistaBusqueda') }; vistas[modulo].style.display = 'block';
        const baseTitle = { 'general': 'Vista General Comercial', 'productividad': 'Análisis de Productividad', 'situacion': 'Estrategia de Rentabilidad', 'busqueda': 'Directorio Analítico' }[modulo];
        document.getElementById('tituloDashboard').innerHTML = `${baseTitle} <span id="fechaUltimaVentaTitulo" style="font-size:0.7rem; font-weight:normal;"></span>`;
        if (lastSaleDate) { const formatted = lastSaleDate.toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }); const titleSpan = document.getElementById('fechaUltimaVentaTitulo'); if (titleSpan) titleSpan.textContent = `Última venta: ${formatted}`; }

        if (modulo === 'general') loadGeneralModule();
        else if (modulo === 'productividad') { document.getElementById('menuVendedoresContainer').style.display = 'flex'; const listaVendedores = document.getElementById('listaVendedoresHorizontal'); if (listaVendedores.children.length > 0 && !currentVendedor) listaVendedores.children[0].click(); else if (currentVendedor) loadProductividadModule(currentVendedor); }
        else if (modulo === 'situacion') loadSituacionModule();
        else if (modulo === 'busqueda') { const currentDoc = document.getElementById('detalleDocCliente').dataset.id; if(!currentDoc) { document.getElementById('inputBusquedaCliente').value = ''; document.getElementById('listaSugerenciasClientes').style.display = 'none'; document.getElementById('panelDetalleCliente').style.display = 'none'; const btnLimpiar = document.getElementById('btnLimpiarBusqueda'); if (btnLimpiar) btnLimpiar.style.display = 'none'; const contador = document.getElementById('contadorResultados'); if (contador) contador.style.display = 'none'; } }
        setTimeout(() => { for (const id in mapInstances) { mapInstances[id].invalidateSize(); } }, 100);
    };

    function generateVendedoresMenu() {
        const lista = document.getElementById('listaVendedoresHorizontal'); lista.innerHTML = ''; const vendedoresOrdenados = Array.from(vendedoresMap.values()).filter(v => v.meta > 0 && !v.nombreCompleto.includes('RETIRADO'));
        for (const v of vendedoresOrdenados) {
            const li = document.createElement('li'); li.textContent = v.nombreCompleto;
            li.onclick = () => { document.querySelectorAll('#listaVendedoresHorizontal li').forEach(el => el.classList.remove('active')); li.classList.add('active'); currentVendedor = v; document.getElementById('estadoVendedorSeleccion').style.display = 'none'; document.getElementById('contenidoProductividad').style.display = 'block'; loadProductividadModule(v); };
            lista.appendChild(li);
        }
    }

    async function inicializarApp() {
        try {
            const [vendedores, ventas, productos, clientes] = await Promise.all([loadCSV(urls.vendedores), loadCSV(urls.ventas), loadCSV(urls.productos), loadCSV(urls.clientes)]);
            data.vendedoresRaw = vendedores; data.ventasRaw = ventas; data.productosRaw = productos; data.clientesRaw = clientes;
            initColumns(); setMonthInputDefault(); normalizeAllData(); buildFuseIndex(); generateVendedoresMenu();
            const activeModuloLi = document.querySelector('#listaModulos li.active'); window.cambiarModulo('general', activeModuloLi);
            setTimeout(() => { document.getElementById('loadingScreen').style.display = 'none'; document.getElementById('appContainer').style.visibility = 'visible'; for (const id in charts) { if (charts[id] && charts[id].resize) charts[id].resize(); } }, 600);
        } catch (err) { console.error(err); document.getElementById('loadingSpinner').style.display = 'none'; document.getElementById('loadingTitle').textContent = 'Error de conexión. Verifique los enlaces de los CSV.'; document.getElementById('loadingTitle').style.color = '#d93025'; }
    }

    window.verificarPassword = async function() {
        const inputPass = document.getElementById('passInput').value;
        if (inputPass === 'Dialex123') { document.getElementById('loginScreen').style.opacity = '0'; setTimeout(() => { document.getElementById('loginScreen').style.display = 'none'; document.getElementById('loadingScreen').style.display = 'flex'; inicializarApp(); }, 300); } 
        else { document.getElementById('loginError').style.display = 'block'; }
    };

    window.evaluarTeclado = function(e) { if (e.key === 'Enter') window.verificarPassword(); };
    document.addEventListener('click', function(e) { const list = document.getElementById('listaSugerenciasClientes'); const input = document.getElementById('inputBusquedaCliente'); if (list && input && e.target !== input && e.target !== list && !list.contains(e.target)) { list.style.display = 'none'; } });
})();
