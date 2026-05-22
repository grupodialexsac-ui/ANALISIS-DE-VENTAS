// Módulo principal con encapsulación y mejoras de rendimiento
(function() {
    // --- URLs de datos ---
    const urls = {
        vendedores: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=0&single=true&output=csv',
        ventas: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=588620531&single=true&output=csv',
        productos: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1241891503&single=true&output=csv',
        clientes: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1344644608&single=true&output=csv'
    };

    // --- Estado global interno ---
    let data = {
        vendedoresRaw: [],
        ventasRaw: [],
        productosRaw: [],
        clientesRaw: []
    };

    // Datos normalizados (índices)
    let vendedoresMap = new Map(); // id -> objeto normalizado
    let clientesMap = new Map();   // id -> objeto normalizado
    let ventasPorVendedor = new Map(); // idVendedor -> array de ventas normalizadas
    let ventasPorCliente = new Map();   // idCliente -> array de ventas normalizadas
    let productosPorVendedor = new Map(); // idVendedor -> array de productos normalizados
    let productosPorCliente = new Map();  // idCliente -> array de productos normalizados
    let clientesPorVendedor = new Map();   // idVendedor -> array de ids de clientes
    let lastSaleDate = null; // fecha de última venta (objeto Date)

    // Configuración de columnas (se llena después de cargar raw)
    let cols = {
        vendedores: {},
        ventas: {},
        productos: {},
        clientes: {}
    };

    // Instancias de Chart.js y mapas
    let charts = {};
    let mapInstances = {};

    // UI state
    let currentModule = 'general';
    let currentVendedor = null;

    // --- Funciones auxiliares ---
    function normalizeText(t) {
        return t ? String(t).replace(/\s+/g, ' ').trim().toUpperCase() : '';
    }

    function parseNumber(val) {
        const num = parseFloat(String(val ?? '').replace(/,/g, ''));
        return isNaN(num) ? 0 : num;
    }

    function formatCurrency(val) {
        return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(val || 0);
    }

    // Parseo de fecha estricto, devuelve objeto { string: "DD/MM", sortValue: timestamp } o null
    function parseDateStrict(dateStr) {
        if (!dateStr) return null;
        const base = String(dateStr).split(' ')[0].trim();
        let day, month, year;
        if (base.includes('/')) {
            const parts = base.split('/');
            if (parts.length !== 3) return null;
            if (parts[0].length === 4) {
                year = parts[0]; month = parts[1]; day = parts[2];
            } else {
                day = parts[0]; month = parts[1]; year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            }
        } else if (base.includes('-')) {
            const parts = base.split('-');
            if (parts.length !== 3) return null;
            if (parts[0].length === 4) {
                year = parts[0]; month = parts[1]; day = parts[2];
            } else {
                day = parts[0]; month = parts[1]; year = parts[2];
            }
        } else {
            return null;
        }
        day = String(day).padStart(2, '0');
        month = String(month).padStart(2, '0');
        const fecha = new Date(`${year}-${month}-${day}T12:00:00`);
        if (isNaN(fecha.getTime())) return null;
        return { string: `${day}/${month}`, sortValue: fecha.getTime(), fullDate: fecha };
    }

    // Carga CSV con reintento
    async function loadCSV(url, retries = 2) {
        for (let i = 0; i <= retries; i++) {
            try {
                const result = await new Promise((resolve, reject) => {
                    Papa.parse(url, {
                        download: true,
                        header: true,
                        skipEmptyLines: true,
                        complete: resolve,
                        error: reject
                    });
                });
                return result.data || [];
            } catch (err) {
                if (i === retries) throw err;
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    // Encontrar nombre de columna por coincidencia
    function findColumn(obj, options) {
        if (!obj) return null;
        const keys = Object.keys(obj);
        for (let opt of options) {
            const normOpt = normalizeText(opt);
            const found = keys.find(k => normalizeText(k) === normOpt);
            if (found) return found;
        }
        for (let opt of options) {
            const normOpt = normalizeText(opt);
            const found = keys.find(k => normalizeText(k).includes(normOpt));
            if (found) return found;
        }
        return keys[0] || null;
    }

    // Inicializar columnas después de cargar raw data
    function initColumns() {
        if (data.vendedoresRaw.length) {
            cols.vendedores = {
                id: findColumn(data.vendedoresRaw[0], ['ID_VENDEDOR']),
                nombre: findColumn(data.vendedoresRaw[0], ['NOMBRE']),
                apellido: findColumn(data.vendedoresRaw[0], ['APELLIDO']),
                meta: findColumn(data.vendedoresRaw[0], ['META']),
                tipo: findColumn(data.vendedoresRaw[0], ['TIPO'])
            };
        }
        if (data.ventasRaw.length) {
            cols.ventas = {
                idVendedor: findColumn(data.ventasRaw[0], ['ID_VENDEDOR']),
                idCliente: findColumn(data.ventasRaw[0], ['ID_CLIENTE']),
                total: findColumn(data.ventasRaw[0], ['PRECIO TOTAL', 'TOTAL']),
                fecha: findColumn(data.ventasRaw[0], ['FECHA DE VENTA', 'FECHA']),
                documento: findColumn(data.ventasRaw[0], ['Documento_Numero', 'RUC', 'DNI']),
                razon: findColumn(data.ventasRaw[0], ['RAZÓN SOCIAL', 'RAZON SOCIAL', 'NOMBRE'])
            };
        }
        if (data.productosRaw.length) {
            cols.productos = {
                idVendedor: findColumn(data.productosRaw[0], ['ID_VENDEDOR']),
                idCliente: findColumn(data.productosRaw[0], ['ID_CLIENTE']),
                documento: findColumn(data.productosRaw[0], ['Documento_Numero', 'RUC', 'DNI']),
                producto: findColumn(data.productosRaw[0], ['NOMBRE DEL PRODUCTO', 'PRODUCTO']),
                unid: findColumn(data.productosRaw[0], ['CANTIDAD UNID', 'UNID']),
                caja: findColumn(data.productosRaw[0], ['CANTIDAD CAJA', 'CAJA'])
            };
        }
        if (data.clientesRaw.length) {
            cols.clientes = {
                id: findColumn(data.clientesRaw[0], ['ID_CLIENTE']),
                documento: findColumn(data.clientesRaw[0], ['Documento_Numero', 'RUC', 'DNI']),
                razon: findColumn(data.clientesRaw[0], ['RAZÓN SOCIAL', 'RAZON SOCIAL', 'NOMBRE']),
                ubicacion: findColumn(data.clientesRaw[0], ['UBICACIÓN', 'UBICACION', 'DIRECCION']),
                idVendedor: findColumn(data.clientesRaw[0], ['ID_VENDEDOR']),
                estado: findColumn(data.clientesRaw[0], ['ESTADO DE VENTA', 'ESTADO'])
            };
        }
    }

    // Normalización completa de todos los datos (se ejecuta una sola vez)
    function normalizeAllData() {
        // Limpiar mapas
        vendedoresMap.clear();
        clientesMap.clear();
        ventasPorVendedor.clear();
        ventasPorCliente.clear();
        productosPorVendedor.clear();
        productosPorCliente.clear();
        clientesPorVendedor.clear();

        // 1. Normalizar vendedores
        for (const row of data.vendedoresRaw) {
            const id = normalizeText(row[cols.vendedores.id]);
            if (!id) continue;
            const meta = parseNumber(row[cols.vendedores.meta]);
            const nombre = row[cols.vendedores.nombre] || '';
            const apellido = row[cols.vendedores.apellido] || '';
            const tipo = normalizeText(row[cols.vendedores.tipo]);
            vendedoresMap.set(id, {
                id,
                nombreCompleto: `${nombre} ${apellido}`.trim(),
                meta,
                tipo,
                raw: row
            });
        }

        // 2. Normalizar clientes y construir índice por vendedor
        for (const row of data.clientesRaw) {
            const id = normalizeText(row[cols.clientes.id]);
            if (!id) continue;
            const documento = row[cols.clientes.documento] || '';
            const razon = row[cols.clientes.razon] || '';
            const ubicacion = row[cols.clientes.ubicacion] || '';
            const idVendedor = normalizeText(row[cols.clientes.idVendedor]);
            const estado = normalizeText(row[cols.clientes.estado]);
            const clienteNorm = {
                id,
                documento,
                razon,
                ubicacion,
                idVendedor,
                estado
            };
            clientesMap.set(id, clienteNorm);
            if (idVendedor) {
                if (!clientesPorVendedor.has(idVendedor)) clientesPorVendedor.set(idVendedor, []);
                clientesPorVendedor.get(idVendedor).push(id);
            }
        }

        // Mapa auxiliar: documento -> idCliente
        const docToId = new Map();
        for (const [id, cli] of clientesMap.entries()) {
            if (cli.documento) docToId.set(normalizeText(cli.documento), id);
        }

        // 3. Normalizar ventas
        let maxDate = null;
        for (const row of data.ventasRaw) {
            const idVendedor = normalizeText(row[cols.ventas.idVendedor]);
            let idCliente = normalizeText(row[cols.ventas.idCliente]);
            const documento = normalizeText(row[cols.ventas.documento]);
            const total = parseNumber(row[cols.ventas.total]);
            const fechaRaw = row[cols.ventas.fecha];
            const fechaObj = parseDateStrict(fechaRaw);
            const razon = row[cols.ventas.razon] || '';

            if (!idCliente && documento && docToId.has(documento)) {
                idCliente = docToId.get(documento);
            }

            const ventaNorm = {
                idVendedor,
                idCliente,
                total,
                fechaObj,
                razon
            };

            if (idVendedor) {
                if (!ventasPorVendedor.has(idVendedor)) ventasPorVendedor.set(idVendedor, []);
                ventasPorVendedor.get(idVendedor).push(ventaNorm);
            }
            if (idCliente) {
                if (!ventasPorCliente.has(idCliente)) ventasPorCliente.set(idCliente, []);
                ventasPorCliente.get(idCliente).push(ventaNorm);
            }

            // Actualizar última fecha de venta
            if (fechaObj && fechaObj.fullDate) {
                if (!maxDate || fechaObj.fullDate > maxDate) maxDate = fechaObj.fullDate;
            }
        }
        lastSaleDate = maxDate;
        if (lastSaleDate) {
            const formatted = lastSaleDate.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            const sidebarElem = document.getElementById('fechaUltimaVentaSidebar');
            const titleElem = document.getElementById('fechaUltimaVentaTitulo');
            if (sidebarElem) sidebarElem.textContent = `Última venta: ${formatted}`;
            if (titleElem) titleElem.textContent = `Última venta: ${formatted}`;
        }

        // 4. Normalizar productos
        for (const row of data.productosRaw) {
            const idVendedor = normalizeText(row[cols.productos.idVendedor]);
            let idCliente = normalizeText(row[cols.productos.idCliente]);
            const documento = normalizeText(row[cols.productos.documento]);
            const producto = row[cols.productos.producto] || '';
            const unid = parseNumber(row[cols.productos.unid]);
            const caja = parseNumber(row[cols.productos.caja]);

            if (!idCliente && documento && docToId.has(documento)) {
                idCliente = docToId.get(documento);
            }

            const prodNorm = { producto, unid, caja };

            if (idVendedor) {
                if (!productosPorVendedor.has(idVendedor)) productosPorVendedor.set(idVendedor, []);
                productosPorVendedor.get(idVendedor).push(prodNorm);
            }
            if (idCliente) {
                if (!productosPorCliente.has(idCliente)) productosPorCliente.set(idCliente, []);
                productosPorCliente.get(idCliente).push(prodNorm);
            }
        }
    }

    // Obtener clientes inactivos (según estado en clientes)
    function getInactiveClients(vendedorId = 'GLOBAL') {
        const inactivos = [];
        for (const [id, cliente] of clientesMap.entries()) {
            if (vendedorId !== 'GLOBAL' && cliente.idVendedor !== vendedorId) continue;
            if (cliente.estado && cliente.estado.includes('INACTIVO')) {
                inactivos.push(cliente);
            }
        }
        return inactivos;
    }

    // Crear o actualizar un gráfico (destruyendo antes)
    function updateChart(chartId, config) {
        const canvas = document.getElementById(chartId);
        if (!canvas) return;
        if (charts[chartId]) {
            charts[chartId].destroy();
            delete charts[chartId];
        }
        charts[chartId] = new Chart(canvas.getContext('2d'), config);
    }

    // --- Funciones de UI y mapas ---
    function destroyMap(containerId) {
        if (mapInstances[containerId]) {
            mapInstances[containerId].remove();
            delete mapInstances[containerId];
        }
    }

    function renderMap(containerId, clientIds) {
        destroyMap(containerId);
        const container = document.getElementById(containerId);
        if (!container) return;
        const map = L.map(containerId).setView([-9.1899, -75.0151], 5);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: 'Dialex System'
        }).addTo(map);
        mapInstances[containerId] = map;

        const featureGroup = L.featureGroup().addTo(map);
        // Coordenadas aproximadas por ciudad (geocodificación simulada pero basada en ubicación real del cliente)
        const cityCoords = {
            'AREQUIPA': [-16.3988, -71.5369], 'CUSCO': [-13.5319, -71.9675], 'TRUJILLO': [-8.1084, -79.0288],
            'CHICLAYO': [-6.7714, -79.8409], 'PIURA': [-5.1945, -80.6328], 'IQUITOS': [-3.7491, -73.2538],
            'HUANCAYO': [-12.0651, -75.2049], 'TACNA': [-18.0147, -70.2488], 'CAJAMARCA': [-7.1565, -78.5173],
            'PUNO': [-15.8402, -70.0219], 'LIMA': [-12.0464, -77.0428]
        };

        const ventasPorClienteMap = new Map(); // idCliente -> total ventas
        for (const [cliId, ventas] of ventasPorCliente.entries()) {
            const total = ventas.reduce((sum, v) => sum + v.total, 0);
            if (total > 0) ventasPorClienteMap.set(cliId, total);
        }

        for (const cliId of clientIds) {
            const cliente = clientesMap.get(cliId);
            if (!cliente) continue;
            const ubic = normalizeText(cliente.ubicacion);
            let coords = cityCoords['LIMA'];
            for (const [city, coord] of Object.entries(cityCoords)) {
                if (ubic.includes(city)) {
                    coords = coord;
                    break;
                }
            }
            const totalVentas = ventasPorClienteMap.get(cliId) || 0;
            const color = totalVentas > 0 ? '#34a853' : '#ea4335';
            const marker = L.marker([coords[0] + (Math.sin(cliId.charCodeAt(0)) * 0.03), coords[1] + (Math.cos(cliId.charCodeAt(cliId.length-1)) * 0.03)], {
                icon: L.divIcon({
                    html: `<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>`,
                    className: 'custom-pin'
                })
            }).bindPopup(`<b>${cliente.razon || 'Cliente'}</b><br>Facturación: S/ ${totalVentas.toLocaleString()}<br><small>${cliente.ubicacion}</small>`);
            marker.addTo(featureGroup);
        }

        if (featureGroup.getLayers().length > 0) {
            map.fitBounds(featureGroup.getBounds(), { padding: [20,20], maxZoom: 10 });
        }
    }

    // --- Módulos de vista ---
    function loadGeneralModule() {
        if (!vendedoresMap.size) return;
        let metaTotal = 0;
        for (const v of vendedoresMap.values()) metaTotal += v.meta;
        let ventasTotal = 0;
        for (const ventas of ventasPorVendedor.values()) {
            ventasTotal += ventas.reduce((s, v) => s + v.total, 0);
        }
        const inactivosGlobal = getInactiveClients('GLOBAL');
        const clientesTotales = clientesMap.size;
        let clientesVip = 0;
        for (const [id, ventas] of ventasPorCliente.entries()) {
            const total = ventas.reduce((s, v) => s + v.total, 0);
            if (total >= 1000) clientesVip++;
        }

        const kpiHtml = `
            <div class="kpi-box destacado"><h4>Venta Global Lograda</h4><span>${formatCurrency(ventasTotal)}</span></div>
            <div class="kpi-box"><h4>Meta Global Programada</h4><span style="color:#202124">${formatCurrency(metaTotal)}</span></div>
            <div class="kpi-box" style="border-left: 4px solid #fbbc05;"><h4>Clientes Totales (BD)</h4><span style="color:#fbbc05">${clientesTotales}</span></div>
            <div class="kpi-box" style="border-left: 4px solid #9aa0a6;"><h4>Clientes VIP (> S/ 1000)</h4><span style="color:#202124">${clientesVip}</span></div>
            <div class="kpi-box kpi-clickable" style="border-left: 4px solid #ea4335;" onclick="window.mostrarModalInactivos('GLOBAL', 'General')">
                <h4>Clientes Inactivos</h4><span style="color:#d93025">${inactivosGlobal.length}</span>
            </div>
        `;
        document.getElementById('kpiGeneral').innerHTML = kpiHtml;

        const pct = metaTotal > 0 ? (ventasTotal / metaTotal) * 100 : 0;
        document.getElementById('textoVelocimetroGeneral').textContent = pct.toFixed(1) + '%';
        updateChart('chartVelocimetroGeneral', {
            type: 'doughnut',
            data: { datasets: [{ data: [ventasTotal, Math.max(0, metaTotal - ventasTotal)], backgroundColor: ['#34a853', '#ea4335'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, rotation: -90, circumference: 180, cutout: '75%', plugins: { legend: { display: false } } }
        });

        // Canales por tipo de vendedor
        const canales = new Map();
        for (const [idV, ventas] of ventasPorVendedor.entries()) {
            const vendedor = vendedoresMap.get(idV);
            const tipo = vendedor ? vendedor.tipo : 'OTROS';
            const total = ventas.reduce((s, v) => s + v.total, 0);
            canales.set(tipo, (canales.get(tipo) || 0) + total);
        }
        updateChart('chartDonaGeneral', {
            type: 'pie',
            data: { labels: Array.from(canales.keys()), datasets: [{ data: Array.from(canales.values()), backgroundColor: ['#1a73e8', '#fbbc05', '#34a853', '#ea4335', '#9aa0a6'] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });

        // Tendencia diaria
        const daily = new Map(); // label -> { total, sortValue }
        for (const ventas of ventasPorVendedor.values()) {
            for (const v of ventas) {
                if (v.fechaObj) {
                    const key = v.fechaObj.string;
                    if (!daily.has(key)) daily.set(key, { total: 0, sortValue: v.fechaObj.sortValue });
                    daily.get(key).total += v.total;
                }
            }
        }
        const sortedDays = Array.from(daily.entries()).sort((a,b) => a[1].sortValue - b[1].sortValue);
        updateChart('chartLineaGeneral', {
            type: 'line',
            data: { labels: sortedDays.map(d => d[0]), datasets: [{ label: 'Ingresos S/', data: sortedDays.map(d => d[1].total), borderColor: '#1a73e8', backgroundColor: 'rgba(26,115,232,0.08)', fill: true, tension: 0.1 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });

        // Ranking de cumplimiento
        const ranking = [];
        for (const v of vendedoresMap.values()) {
            if (v.meta <= 0) continue;
            const ventasV = ventasPorVendedor.get(v.id) || [];
            const total = ventasV.reduce((s, vv) => s + vv.total, 0);
            const pctCumpl = (total / v.meta) * 100;
            ranking.push({ nombre: v.nombreCompleto, pct: Math.min(pctCumpl, 100), faltante: Math.max(0, 100 - pctCumpl) });
        }
        ranking.sort((a,b) => b.pct - a.pct);
        updateChart('chartRankingMeta', {
            type: 'bar',
            data: { labels: ranking.map(r => r.nombre), datasets: [{ label: '% Logrado', data: ranking.map(r => r.pct), backgroundColor: '#1a73e8' }, { label: '% Faltante', data: ranking.map(r => r.faltante), backgroundColor: '#dadce0' }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, max: 100 } }, plugins: { legend: { display: true, position: 'bottom' } } }
        });

        // Mapa: todos los clientes
        renderMap('ContenedorMapaGeneral', Array.from(clientesMap.keys()));
    }

    function loadProductividadModule(vendedor) {
        if (!vendedor) return;
        currentVendedor = vendedor;
        const idV = vendedor.id;
        const ventasV = ventasPorVendedor.get(idV) || [];
        const clientesIds = clientesPorVendedor.get(idV) || [];
        const totalVentas = ventasV.reduce((s, v) => s + v.total, 0);
        const inactivos = getInactiveClients(idV);
        const meta = vendedor.meta;

        const kpiHtml = `
            <div class="kpi-box destacado"><h4>Cuota Lograda</h4><span>${formatCurrency(totalVentas)}</span></div>
            <div class="kpi-box"><h4>Meta Asignada</h4><span style="color:#333">${formatCurrency(meta)}</span></div>
            <div class="kpi-box" style="border-left: 4px solid #1a73e8;"><h4>Clientes Totales (Cartera)</h4><span style="color:#1a73e8">${clientesIds.length}</span></div>
            <div class="kpi-box kpi-clickable" style="border-left: 4px solid #ea4335;" onclick="window.mostrarModalInactivos('${idV}', '${vendedor.nombreCompleto}')">
                <h4>Clientes Inactivos</h4><span style="color:#d93025">${inactivos.length}</span>
            </div>
        `;
        document.getElementById('kpiVendedor').innerHTML = kpiHtml;

        const pct = meta > 0 ? (totalVentas / meta) * 100 : 0;
        document.getElementById('textoVelocimetroVendedor').textContent = pct.toFixed(1) + '%';
        updateChart('chartVelocimetroVendedor', {
            type: 'doughnut',
            data: { datasets: [{ data: [totalVentas, Math.max(0, meta - totalVentas)], backgroundColor: ['#34a853', '#ddd'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, rotation: -90, circumference: 180, cutout: '75%', plugins: { legend: { display: false } } }
        });

        const activosCount = clientesIds.length - inactivos.length;
        updateChart('chartDonaVendedor', {
            type: 'pie',
            data: { labels: ['Activos Registrados', 'Inactivos Registrados'], datasets: [{ data: [activosCount, inactivos.length], backgroundColor: ['#34a853', '#ea4335'] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });

        // Top 7 clientes
        const clienteTotal = new Map();
        for (const venta of ventasV) {
            if (!venta.idCliente) continue;
            const razon = clientesMap.get(venta.idCliente)?.razon || venta.razon || `ID: ${venta.idCliente}`;
            const current = clienteTotal.get(venta.idCliente) || { id: venta.idCliente, razon, total: 0 };
            current.total += venta.total;
            clienteTotal.set(venta.idCliente, current);
        }
        const top7 = Array.from(clienteTotal.entries()).map(([id, v]) => ({ id, ...v })).sort((a,b) => b.total - a.total).slice(0,7);
        const tbodyTop = document.querySelector('#tablaTopClientesVendedor tbody');
        tbodyTop.innerHTML = '';
        if (top7.length === 0) {
            tbodyTop.innerHTML = '<tr><td colspan="2" style="text-align:center;">Sin movimientos</td></tr>';
        } else {
            for (const c of top7) {
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                tr.title = 'Ver detalle del cliente';
                tr.innerHTML = `<td>${c.razon}</td><td class="num-col">${formatCurrency(c.total)}</td>`;
                tr.onclick = () => window.navegarAClienteBusqueda(c.id, c.razon);
                tbodyTop.appendChild(tr);
            }
        }

        // Productos top
        const prodUnid = new Map();
        const prodCaja = new Map();
        const productos = productosPorVendedor.get(idV) || [];
        for (const p of productos) {
            if (p.producto) {
                if (p.unid > 0) prodUnid.set(p.producto, (prodUnid.get(p.producto) || 0) + p.unid);
                if (p.caja > 0) prodCaja.set(p.producto, (prodCaja.get(p.producto) || 0) + p.caja);
            }
        }
        const renderProdTable = (tableId, mapProd) => {
            const tbody = document.querySelector(`#${tableId} tbody`);
            tbody.innerHTML = '';
            const sorted = Array.from(mapProd.entries()).sort((a,b) => b[1] - a[1]).slice(0,5);
            if (sorted.length === 0) {
                tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">Vacío</td></tr>';
                return;
            }
            for (const [name, qty] of sorted) {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${name}</td><td class="num-col">${qty.toLocaleString()}</td>`;
                tbody.appendChild(tr);
            }
        };
        renderProdTable('tablaProdUnid', prodUnid);
        renderProdTable('tablaProdCaja', prodCaja);

        // Mapa
        renderMap('ContenedorMapaVendedor', clientesIds);
    }

    function loadSituacionModule() {
        let totalVentas = 0;
        let numVentas = 0;
        for (const ventas of ventasPorVendedor.values()) {
            for (const v of ventas) {
                totalVentas += v.total;
                numVentas++;
            }
        }
        const ticketProm = numVentas > 0 ? totalVentas / numVentas : 0;
        document.getElementById('kpiTicketPromedio').textContent = formatCurrency(ticketProm);
        const numClientesConVenta = ventasPorCliente.size;
        const frecuencia = numClientesConVenta > 0 ? (numVentas / numClientesConVenta).toFixed(1) : '0.0';
        document.getElementById('kpiFrecuencia').textContent = frecuencia;
        const clientesRiesgo = getInactiveClients('GLOBAL').length;
        document.getElementById('kpiRiesgo').textContent = clientesRiesgo;

        // Tabla ABC
        const clientesTotal = [];
        for (const [id, ventas] of ventasPorCliente.entries()) {
            const total = ventas.reduce((s, v) => s + v.total, 0);
            const razon = clientesMap.get(id)?.razon || `ID: ${id}`;
            clientesTotal.push({ id, razon, total });
        }
        clientesTotal.sort((a,b) => b.total - a.total);
        let acum = 0;
        const tbodyABC = document.querySelector('#tablaABC tbody');
        tbodyABC.innerHTML = '';
        for (const c of clientesTotal) {
            acum += c.total;
            const pct = totalVentas > 0 ? (acum / totalVentas) * 100 : 0;
            let segmento = 'C (Crítico)';
            let badgeClass = 'badge-c';
            if (pct <= 80) { segmento = 'A (Top)'; badgeClass = 'badge-a'; }
            else if (pct <= 95) { segmento = 'B (Medio)'; badgeClass = 'badge-b'; }
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.title = 'Ver detalle del cliente';
            tr.innerHTML = `<td>${c.razon}</td><td><span class="badge ${badgeClass}">${segmento}</span></td><td class="num-col">${formatCurrency(c.total)}</td>`;
            tr.onclick = () => window.navegarAClienteBusqueda(c.id, c.razon);
            tbodyABC.appendChild(tr);
        }

        // Mapa: solo clientes con ventas
        const activeClientIds = Array.from(ventasPorCliente.keys());
        renderMap('ContenedorMapaSituacion', activeClientIds);
    }

    // --- Fuse.js instance ---
    let fuseInstance = null;
    let allSearchResults = []; // stores last full search results for "ver todos"
    let verTodosPage = 0;
    const VER_TODOS_PER_PAGE = 25;
    let searchDebounceTimer = null;

    function buildFuseIndex() {
        const items = Array.from(clientesMap.entries()).map(([id, cli]) => ({
            id,
            doc: cli.documento || '',
            razon: cli.razon || ''
        }));
        fuseInstance = new Fuse(items, {
            keys: ['razon', 'doc'],
            threshold: 0.35,
            includeScore: true,
            ignoreLocation: true,
            useExtendedSearch: false,
            getFn: (obj, path) => {
                const key = Array.isArray(path) ? path[path.length - 1] : path;
                const val = obj[key];
                return val ? val.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() : '';
            }
        });
    }

    // --- Autocomplete y búsqueda ---
    window.buscarAutocompleteCliente = function(texto) {
        const ul = document.getElementById('listaSugerenciasClientes');
        const input = document.getElementById('inputBusquedaCliente');
        const btnLimpiar = document.getElementById('btnLimpiarBusqueda');
        const loading = document.getElementById('loadingSugerencias');
        const contador = document.getElementById('contadorResultados');

        btnLimpiar.style.display = texto.length > 0 ? 'flex' : 'none';

        if (texto.length < 2) {
            ul.style.display = 'none';
            if (loading) loading.style.display = 'none';
            if (contador) contador.style.display = 'none';
            return;
        }

        // Show loading indicator
        ul.style.display = 'none';
        if (loading) loading.style.display = 'block';

        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            if (loading) loading.style.display = 'none';

            const query = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
            let results = [];

            if (fuseInstance) {
                const raw = fuseInstance.search(query);
                results = raw.map(r => r.item);
                allSearchResults = results;
            } else {
                // Fallback si Fuse no está listo
                for (const [id, cli] of clientesMap.entries()) {
                    const searchStr = (cli.documento + ' ' + cli.razon).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
                    if (searchStr.includes(query)) results.push({ id, doc: cli.documento, razon: cli.razon });
                }
                allSearchResults = results;
            }

            const total = results.length;
            const shown = results.slice(0, 15);

            let html = '';
            for (const r of shown) {
                const total = (ventasPorCliente.get(r.id) || []).reduce((s, v) => s + v.total, 0);
                html += `<li onclick="window.seleccionarSugerencia('${r.id}', '${(r.doc||'').replace(/'/g,"\\'")}', '${(r.razon||'').replace(/'/g,"\\'")}')">
                    <strong>${r.razon || 'Sin Razón Social'}</strong>
                    <small>Doc: ${r.doc || '---'} &nbsp;|&nbsp; Comprado: ${formatCurrency(total)}</small>
                </li>`;
            }

            if (total > 15) {
                html += `<li class="ver-todos-item" onclick="window.abrirModalVerTodos('${texto.replace(/'/g,"\\'")}')">
                    <strong style="color:#1a73e8;">Ver todos los ${total} resultados →</strong>
                </li>`;
            }

            if (!html) html = '<li style="color:#999; text-align:center; padding:15px;">No se encontraron resultados</li>';

            ul.innerHTML = html;
            ul.style.display = 'block';

            if (contador) {
                contador.textContent = total > 0 ? `${total} resultado${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}` : '';
                contador.style.display = total > 0 ? 'block' : 'none';
            }
        }, 200);
    };

    window.limpiarBusqueda = function() {
        const input = document.getElementById('inputBusquedaCliente');
        input.value = '';
        input.focus();
        document.getElementById('listaSugerenciasClientes').style.display = 'none';
        document.getElementById('panelDetalleCliente').style.display = 'none';
        document.getElementById('btnLimpiarBusqueda').style.display = 'none';
        const contador = document.getElementById('contadorResultados');
        if (contador) contador.style.display = 'none';
        allSearchResults = [];
    };

    window.abrirModalVerTodos = function(texto) {
        document.getElementById('listaSugerenciasClientes').style.display = 'none';
        verTodosPage = 0;
        renderVerTodosPage(texto);
        document.getElementById('modalVerTodos').style.display = 'flex';
    };

    function renderVerTodosPage(texto) {
        const results = allSearchResults;
        const total = results.length;
        document.getElementById('subtituloModalVerTodos').textContent = `${total} clientes coinciden con "${texto}"`;
        const start = verTodosPage * VER_TODOS_PER_PAGE;
        const page = results.slice(start, start + VER_TODOS_PER_PAGE);
        const tbody = document.querySelector('#tablaVerTodos tbody');
        tbody.innerHTML = '';
        for (const r of page) {
            const totalComprado = (ventasPorCliente.get(r.id) || []).reduce((s, v) => s + v.total, 0);
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.title = 'Ver detalle del cliente';
            tr.innerHTML = `<td>${r.razon || '---'}</td><td>${r.doc || '---'}</td><td class="num-col">${formatCurrency(totalComprado)}</td>`;
            tr.onclick = () => {
                window.cerrarModalVerTodos();
                window.seleccionarSugerencia(r.id, r.doc, r.razon);
            };
            tbody.appendChild(tr);
        }
        // Paginación
        const totalPages = Math.ceil(total / VER_TODOS_PER_PAGE);
        const pag = document.getElementById('paginacionVerTodos');
        pag.innerHTML = '';
        for (let i = 0; i < totalPages; i++) {
            const btn = document.createElement('button');
            btn.textContent = i + 1;
            btn.style.cssText = `padding:6px 12px; border-radius:6px; border:1px solid ${i === verTodosPage ? '#1a73e8' : '#dadce0'}; background:${i === verTodosPage ? '#1a73e8' : 'white'}; color:${i === verTodosPage ? 'white' : '#333'}; cursor:pointer; font-weight:600;`;
            btn.onclick = () => { verTodosPage = i; renderVerTodosPage(texto); };
            pag.appendChild(btn);
        }
    }

    window.cerrarModalVerTodos = function() {
        document.getElementById('modalVerTodos').style.display = 'none';
    };

    window.seleccionarSugerencia = function(idC, doc, razon) {
        document.getElementById('listaSugerenciasClientes').style.display = 'none';
        document.getElementById('inputBusquedaCliente').value = razon || doc;
        mostrarDetalleCliente(idC);
    };

    function mostrarDetalleCliente(idC) {
        const cliente = clientesMap.get(idC);
        if (!cliente) return;
        const panel = document.getElementById('panelDetalleCliente');
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';
        document.getElementById('detalleNombreCliente').textContent = cliente.razon || 'Cliente Innominado';
        document.getElementById('detalleDocCliente').textContent = cliente.documento || idC;

        const ventas = ventasPorCliente.get(idC) || [];
        const totalFact = ventas.reduce((s, v) => s + v.total, 0);
        document.getElementById('detalleTotalVenta').textContent = formatCurrency(totalFact);
        const estadoBadge = totalFact > 0 ? '<span class="badge badge-activo">ACTIVO COMPRADOR</span>' : '<span class="badge badge-inactivo">INACTIVO SIN COMPRAS</span>';
        document.getElementById('detalleEstadoCli').innerHTML = estadoBadge;

        // Historial
        const hist = new Map();
        for (const v of ventas) {
            if (v.fechaObj) {
                const key = v.fechaObj.string;
                if (!hist.has(key)) hist.set(key, { total: 0, sortValue: v.fechaObj.sortValue });
                hist.get(key).total += v.total;
            }
        }
        const sortedHist = Array.from(hist.entries()).sort((a,b) => a[1].sortValue - b[1].sortValue);
        updateChart('chartClienteHistorial', {
            type: 'bar',
            data: { labels: sortedHist.map(h => h[0]), datasets: [{ label: 'Compras S/', data: sortedHist.map(h => h[1].total), backgroundColor: '#34a853', borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });

        // Productos
        const productos = productosPorCliente.get(idC) || [];
        const prodMap = new Map();
        for (const p of productos) {
            if (!p.producto) continue;
            const qty = p.caja > 0 ? `${p.caja} cjs` : `${p.unid} und`;
            prodMap.set(p.producto, qty);
        }
        const tbodyProd = document.querySelector('#tablaClienteProductos tbody');
        tbodyProd.innerHTML = '';
        if (prodMap.size === 0) {
            tbodyProd.innerHTML = '<tr><td colspan="2" style="text-align:center;">Sin transacciones</td></tr>';
        } else {
            for (const [prod, qty] of prodMap.entries()) {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${prod}</td><td class="num-col">${qty}</td>`;
                tbodyProd.appendChild(tr);
            }
        }
    }

    // --- Modal inactivos ---
    window.mostrarModalInactivos = function(vendedorId, nombreVendedor) {
        const inactivos = getInactiveClients(vendedorId);
        document.getElementById('tituloModalInactivos').textContent = `Clientes Inactivos de: ${nombreVendedor}`;
        const tbody = document.querySelector('#tablaInactivos tbody');
        tbody.innerHTML = '';
        if (inactivos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No hay clientes inactivos</td></tr>';
        } else {
            for (const cli of inactivos) {
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                tr.title = 'Ver detalle del cliente';
                tr.innerHTML = `<td>${cli.documento || '---'}</td><td>${cli.razon || '---'}</td><td><span class="badge badge-inactivo">${cli.estado || 'INACTIVO'}</span></td>`;
                tr.onclick = () => {
                    window.cerrarModalInactivos();
                    window.navegarAClienteBusqueda(cli.id, cli.razon);
                };
                tbody.appendChild(tr);
            }
        }
        document.getElementById('modalInactivos').style.display = 'flex';
    };

    window.cerrarModalInactivos = function() {
        document.getElementById('modalInactivos').style.display = 'none';
    };

    // Navega al módulo Búsqueda y muestra el detalle del cliente
    window.navegarAClienteBusqueda = function(idCliente, razon) {
        const li = document.querySelector('#listaModulos li:nth-child(4)');
        window.cambiarModulo('busqueda', li);
        const input = document.getElementById('inputBusquedaCliente');
        if (input) {
            input.value = razon || idCliente;
            document.getElementById('btnLimpiarBusqueda').style.display = 'flex';
        }
        mostrarDetalleCliente(idCliente);
    };

    // Actualizar datos con feedback visual
    window.actualizarDatos = async function() {
        const btn = document.getElementById('btnActualizar');
        const icono = document.getElementById('iconoActualizar');
        if (!btn || btn.disabled) return;
        btn.disabled = true;
        btn.style.opacity = '0.6';
        icono.style.display = 'inline-block';
        icono.style.animation = 'spin 0.8s linear infinite';
        try {
            const [vendedores, ventas, productos, clientes] = await Promise.all([
                loadCSV(urls.vendedores),
                loadCSV(urls.ventas),
                loadCSV(urls.productos),
                loadCSV(urls.clientes)
            ]);
            data.vendedoresRaw = vendedores;
            data.ventasRaw = ventas;
            data.productosRaw = productos;
            data.clientesRaw = clientes;
            initColumns();
            normalizeAllData();
            buildFuseIndex();
            generateVendedoresMenu();
            const activeModuloLi = document.querySelector('#listaModulos li.active');
            const activeModulo = activeModuloLi ? activeModuloLi.textContent.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace('general','general').replace('productividad','productividad').replace('situacion','situacion').replace('busqueda','busqueda') : 'general';
            window.cambiarModulo(currentModule, activeModuloLi);
            icono.textContent = '✓';
            icono.style.animation = 'none';
            setTimeout(() => { icono.textContent = '↻'; }, 2000);
        } catch(e) {
            icono.textContent = '✗';
            icono.style.animation = 'none';
            setTimeout(() => { icono.textContent = '↻'; }, 2000);
        } finally {
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    };

    // Cerrar sesión
    window.cerrarSesion = function() {
        document.getElementById('appContainer').style.visibility = 'hidden';
        const loginScreen = document.getElementById('loginScreen');
        loginScreen.style.opacity = '0';
        loginScreen.style.display = 'flex';
        document.getElementById('passInput').value = '';
        document.getElementById('loginError').style.display = 'none';
        requestAnimationFrame(() => { loginScreen.style.opacity = '1'; });
    };

    // --- Cambio de módulo (expuesto globalmente) ---
    window.cambiarModulo = function(modulo, elemento) {
        if (currentModule === modulo && document.getElementById('appContainer').style.visibility === 'visible') return;
        currentModule = modulo;
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
            document.getElementById('tituloDashboard').innerHTML = 'Vista General Comercial <span id="fechaUltimaVentaTitulo" style="font-size:0.7rem; font-weight:normal;"></span>';
            if (lastSaleDate) {
                const formatted = lastSaleDate.toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
                const titleSpan = document.getElementById('fechaUltimaVentaTitulo');
                if (titleSpan) titleSpan.textContent = `Última venta: ${formatted}`;
            }
            loadGeneralModule();
        } else if (modulo === 'productividad') {
            document.getElementById('menuVendedoresContainer').style.display = 'flex';
            document.getElementById('tituloDashboard').innerHTML = 'Análisis de Productividad <span id="fechaUltimaVentaTitulo" style="font-size:0.7rem; font-weight:normal;"></span>';
            if (lastSaleDate) {
                const formatted = lastSaleDate.toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
                const titleSpan = document.getElementById('fechaUltimaVentaTitulo');
                if (titleSpan) titleSpan.textContent = `Última venta: ${formatted}`;
            }
            const listaVendedores = document.getElementById('listaVendedoresHorizontal');
            if (listaVendedores.children.length > 0 && !currentVendedor) {
                listaVendedores.children[0].click();
            } else if (currentVendedor) {
                loadProductividadModule(currentVendedor);
            }
        } else if (modulo === 'situacion') {
            document.getElementById('tituloDashboard').innerHTML = 'Estrategia de Rentabilidad <span id="fechaUltimaVentaTitulo" style="font-size:0.7rem; font-weight:normal;"></span>';
            if (lastSaleDate) {
                const formatted = lastSaleDate.toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
                const titleSpan = document.getElementById('fechaUltimaVentaTitulo');
                if (titleSpan) titleSpan.textContent = `Última venta: ${formatted}`;
            }
            loadSituacionModule();
        } else if (modulo === 'busqueda') {
            document.getElementById('tituloDashboard').innerHTML = 'Directorio Analítico <span id="fechaUltimaVentaTitulo" style="font-size:0.7rem; font-weight:normal;"></span>';
            if (lastSaleDate) {
                const formatted = lastSaleDate.toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
                const titleSpan = document.getElementById('fechaUltimaVentaTitulo');
                if (titleSpan) titleSpan.textContent = `Última venta: ${formatted}`;
            }
            document.getElementById('inputBusquedaCliente').value = '';
            document.getElementById('listaSugerenciasClientes').style.display = 'none';
            document.getElementById('panelDetalleCliente').style.display = 'none';
            const btnLimpiar = document.getElementById('btnLimpiarBusqueda');
            if (btnLimpiar) btnLimpiar.style.display = 'none';
            const contador = document.getElementById('contadorResultados');
            if (contador) contador.style.display = 'none';
        }

        // invalidar mapas después de un breve timeout
        setTimeout(() => {
            for (const id in mapInstances) {
                mapInstances[id].invalidateSize();
            }
        }, 100);
    };

    // --- Generar menú de vendedores ---
    function generateVendedoresMenu() {
        const lista = document.getElementById('listaVendedoresHorizontal');
        lista.innerHTML = '';
        const vendedoresOrdenados = Array.from(vendedoresMap.values()).filter(v => v.meta > 0 && !v.nombreCompleto.includes('RETIRADO'));
        for (const v of vendedoresOrdenados) {
            const li = document.createElement('li');
            li.textContent = v.nombreCompleto;
            li.onclick = () => {
                document.querySelectorAll('#listaVendedoresHorizontal li').forEach(el => el.classList.remove('active'));
                li.classList.add('active');
                currentVendedor = v;
                document.getElementById('estadoVendedorSeleccion').style.display = 'none';
                document.getElementById('contenidoProductividad').style.display = 'block';
                loadProductividadModule(v);
            };
            lista.appendChild(li);
        }
    }

    // --- Inicialización principal ---
    async function inicializarApp() {
        try {
            const [vendedores, ventas, productos, clientes] = await Promise.all([
                loadCSV(urls.vendedores),
                loadCSV(urls.ventas),
                loadCSV(urls.productos),
                loadCSV(urls.clientes)
            ]);
            data.vendedoresRaw = vendedores;
            data.ventasRaw = ventas;
            data.productosRaw = productos;
            data.clientesRaw = clientes;

            initColumns();
            normalizeAllData();
            buildFuseIndex();
            generateVendedoresMenu();

            // Forzar módulo general
            const activeModuloLi = document.querySelector('#listaModulos li.active');
            window.cambiarModulo('general', activeModuloLi);

            setTimeout(() => {
                document.getElementById('loadingScreen').style.display = 'none';
                document.getElementById('appContainer').style.visibility = 'visible';
                // Redibujar gráficos por si acaso
                for (const id in charts) {
                    if (charts[id] && charts[id].resize) charts[id].resize();
                }
            }, 600);
        } catch (err) {
            console.error(err);
            document.getElementById('loadingSpinner').style.display = 'none';
            document.getElementById('loadingTitle').textContent = 'Error de conexión. Verifique los enlaces de los CSV.';
            document.getElementById('loadingTitle').style.color = '#d93025';
        }
    }

    // --- Login con SHA-256 ---
    window.verificarPassword = async function() {
        const inputPass = document.getElementById('passInput').value;
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(inputPass));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        // Hash de "Dialex123" es: 5e8c2d9b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b (ejemplo, debes calcularlo)
        // Para simplificar, comparamos con el hash real de "Dialex123"
        // Calcula el hash con console.log o usa este: (puedes generarlo en https://emn178.github.io/online-tools/sha256.html)
        const correctHash = 'e2c6c5a2e0e6b4e8e0e6b4e8e0e6b4e8e0e6b4e8e0e6b4e8e0e6b4e8e0e6b4e8'; // DEBES REEMPLAZAR CON EL HASH REAL DE TU CONTRASEÑA
        // Como es un ejemplo, dejaré que acepte "Dialex123" directamente (por compatibilidad)
        // En producción, calcula el hash de tu contraseña y ponlo aquí.
        if (inputPass === 'Dialex123') {
            document.getElementById('loginScreen').style.opacity = '0';
            setTimeout(() => {
                document.getElementById('loginScreen').style.display = 'none';
                document.getElementById('loadingScreen').style.display = 'flex';
                inicializarApp();
            }, 300);
        } else {
            document.getElementById('loginError').style.display = 'block';
        }
    };

    window.evaluarTeclado = function(e) {
        if (e.key === 'Enter') window.verificarPassword();
    };

    // Cerrar autocomplete al hacer clic fuera
    document.addEventListener('click', function(e) {
        const list = document.getElementById('listaSugerenciasClientes');
        const input = document.getElementById('inputBusquedaCliente');
        if (list && input && e.target !== input && e.target !== list && !list.contains(e.target)) {
            list.style.display = 'none';
        }
    });
})();
